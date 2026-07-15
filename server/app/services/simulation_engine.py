"""
算力网络仿真引擎（Simulation Engine）
==========================================

【设计目标】
    随 FastAPI 启动，作为后台 asyncio 任务持续运行。
    以可控频率（默认 30 秒）向 ts_node_metric 表写入仿真监控数据，
    使前端"算力资源感知 / 算力预测 / 量化安全评估"等页面获得
    真实、连续、因果关联的运行数据，而无需外部采集 agent。

【因果链路】
    用户提交任务 → fact_task_assignment 记录绑定关系
    → 仿真引擎读取绑定关系，让对应节点 CPU/GPU 负载真实上升
    → 前端资源感知页看到负载变化 → 预测页基于真实数据预测
    → 安全评估页根据节点负载计算安全评分

【数据库负担控制】
    - 每 30 秒写一次，14 节点 = 14 行/次
    - 每次写入后自动删除超过 2 小时的旧数据
    - 数据量恒定在 ~3400 行（14 × ~240 条）
    - 不使用内存缓冲，所有交互通过数据库完成

【启动方式】
    由 main.py 的 lifespan 调用 start_simulation_engine()，
    FastAPI 关闭时调用 stop_simulation_engine()。
"""

from __future__ import annotations

import asyncio
import math
import random
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from loguru import logger
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from app.core.config import settings


# ================================================================
# 常量配置
# ================================================================

WRITE_INTERVAL_SECONDS = 30          # 写入间隔：30 秒
RETENTION_HOURS = 2                  # 数据保留时长：2 小时
MAX_RETRY_DELAY = 300                # 数据库失败时的最大重试等待

# 各指标的基准值与波动范围（用于无任务时的自然波动）
_BASE_CPU = 35                       # 基础 CPU 利用率 %
_BASE_MEMORY = 45                    # 基础内存利用率 %
_BASE_DISK = 55                      # 基础磁盘利用率 %
_BASE_BANDWIDTH = 40                 # 基础带宽 Gbps
_BASE_LATENCY = 15                   # 基础时延 ms

# 每个任务带来的额外负载增量（模拟真实任务占用）
_TASK_CPU_INCREMENT = 12.0           # 每个运行中任务增加 CPU ~12%
_TASK_GPU_INCREMENT = 15.0           # 每个运行中任务增加 GPU ~15%
_TASK_MEMORY_INCREMENT = 8.0         # 每个运行中任务增加内存 ~8%


# ================================================================
# 引擎核心
# ================================================================

class SimulationEngine:
    """
    仿真引擎主体。

    通过独立 Engine 连接数据库（不与 SQLAlchemy ORM Session 冲突），
    每个写入周期执行：
      1. 查询 dim_compute_node 获取所有节点
      2. 查询 fact_task_assignment 获取各节点当前运行中的任务数
      3. 为每个节点生成一条仿真指标，写入 ts_node_metric
      4. 删除超过 RETENTION_HOURS 的旧数据
    """

    def __init__(self) -> None:
        self._engine: Engine | None = None
        self._task: asyncio.Task | None = None
        self._tick: int = 0          # 写入周期计数，用于 sin 波相位

    # ---- 数据库连接 ----

    def _get_engine(self) -> Engine:
        """惰性创建数据库引擎，复用配置中的连接参数。"""
        if self._engine is None:
            url = (
                f"postgresql+psycopg://{settings.DB_USER}:{settings.DB_PASSWORD}"
                f"@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}?sslmode=prefer"
            )
            self._engine = create_engine(url, pool_pre_ping=True, pool_size=5)
            logger.info("[仿真引擎] 数据库引擎已创建")
        return self._engine

    # ---- 节点与任务查询 ----

    def _fetch_nodes(self, engine: Engine) -> list[dict[str, Any]]:
        """
        查询所有计算节点的基础信息。

        返回字段：node_id, node_name, layer, status, cpu_cores, gpu_count
        如果查询失败返回空列表（引擎会跳过本轮写入）。
        """
        sql = text("""
            SELECT
                node_id,
                node_name,
                COALESCE(layer, 'dc')      AS layer,
                COALESCE(status, 'online') AS status,
                COALESCE(cpu_cores, 32)    AS cpu_cores,
                COALESCE(gpu_count, 0)     AS gpu_count
            FROM dim_compute_node
            ORDER BY node_id
        """)
        try:
            with engine.connect() as conn:
                rows = conn.execute(sql).mappings().all()
                return [dict(r) for r in rows]
        except Exception as exc:
            logger.warning(f"[仿真引擎] 查询 dim_compute_node 失败: {exc}")
            return []

    def _fetch_running_task_counts(self, engine: Engine) -> dict[str, int]:
        """
        查询每个节点上正在运行的任务数量。

        从 fact_task_assignment 读取绑定关系，
        只统计最近 1 小时内分配、状态非 'completed'/'failed' 的任务。
        返回 {node_id: task_count} 字典。

        这是仿真因果链的关键：任务分配 → 节点负载上升。
        """
        sql = text("""
            SELECT target_node_id AS node_id, COUNT(*) AS cnt
            FROM fact_task_assignment
            WHERE assigned_at >= NOW() - INTERVAL '1 hour'
              AND COALESCE(status, 'running') NOT IN ('completed', 'failed', 'cancelled')
            GROUP BY target_node_id
        """)
        try:
            with engine.connect() as conn:
                rows = conn.execute(sql).mappings().all()
                return {r["node_id"]: int(r["cnt"]) for r in rows}
        except Exception:
            # fact_task_assignment 可能没有数据或表不存在，返回空（所有节点无额外负载）
            return {}

    # ---- 指标生成 ----

    def _generate_metrics(
        self,
        node: dict[str, Any],
        task_count: int,
        tick: int,
    ) -> dict[str, float]:
        """
        为单个节点生成一组仿真指标。

        算法：基准值 + 自然波动(sin/cos) + 任务负载叠加 + 少量随机噪声。
        有任务的节点 CPU/GPU/内存会明显上升，形成因果关联。

        参数:
            node:       dim_compute_node 行（含 node_id, cpu_cores 等）
            task_count: 该节点当前运行中的任务数
            tick:       全局写入周期计数，用作 sin 波相位保证连续性

        返回:
            dict，包含 cpu/memory/gpu/disk/bandwidth/latency/jitter/loss 各项指标
        """
        # 用 node_id 生成稳定种子，让各节点波形有差异但可复现
        seed = sum(ord(c) for c in str(node.get("node_id", ""))) / 100.0
        phase = tick * 0.18  # 每个周期相位推进

        # ---- 自然波动（无任务时的基线）----
        cpu = _BASE_CPU + math.sin(phase + seed) * 10 + math.cos(phase / 2 + seed * 1.3) * 6
        memory = _BASE_MEMORY + math.sin(phase * 0.8 + seed + 0.7) * 8
        disk = _BASE_DISK + math.sin(phase / 3 + seed) * 5
        bandwidth = _BASE_BANDWIDTH + math.cos(phase + seed * 0.5) * 12

        # ---- 任务负载叠加（因果核心）----
        # 每个任务让 CPU/GPU/内存上升，但有递减效应（避免超过 100%）
        if task_count > 0:
            # 递减叠加：第 n 个任务的增量是第 1 个的 0.7^n
            cpu += _TASK_CPU_INCREMENT * (1 - 0.7 ** task_count) / 0.3
            memory += _TASK_MEMORY_INCREMENT * (1 - 0.7 ** task_count) / 0.3
            # GPU 只在节点有 GPU 时才上升
            if node.get("gpu_count", 0) and node["gpu_count"] > 0:
                gpu = cpu + 8 + math.sin(phase + seed) * 5
                gpu += _TASK_GPU_INCREMENT * (1 - 0.7 ** task_count) / 0.3
            else:
                gpu = 0
            bandwidth += task_count * 6
        else:
            gpu = (cpu + 3 + math.sin(phase * 1.1 + seed) * 8) if node.get("gpu_count", 0) and node["gpu_count"] > 0 else 0

        # ---- 网络质量指标（与 CPU 正相关）----
        latency = _BASE_LATENCY + cpu * 0.25 + math.sin(phase / 4 + seed) * 4
        jitter = 1.5 + latency * 0.04 + random.uniform(-0.5, 0.5)
        # 高负载时丢包率上升
        packet_loss = max(0, (cpu - 80) * 0.05) + random.uniform(0, 0.15)

        # ---- 钳制到合理区间 ----
        def clamp(v: float, lo: float, hi: float) -> float:
            return max(lo, min(hi, v))

        return {
            "cpu": round(clamp(cpu, 5, 99), 1),
            "memory": round(clamp(memory, 8, 97), 1),
            "gpu": round(clamp(gpu, 0, 99), 1),
            "disk": round(clamp(disk, 20, 92), 1),
            "bandwidth": round(clamp(bandwidth, 10, 180), 1),
            "latency": round(clamp(latency, 4, 80), 1),
            "jitter": round(clamp(jitter, 0.5, 12), 2),
            "loss": round(clamp(packet_loss, 0, 2.0), 2),
        }

    # ---- 写入与清理 ----

    def _write_metrics(
        self,
        engine: Engine,
        nodes: list[dict[str, Any]],
        task_counts: dict[str, int],
        tick: int,
    ) -> int:
        """
        将一批节点的仿真指标写入 ts_node_metric。

        参数:
            nodes:        dim_compute_node 节点列表
            task_counts:  {node_id: 运行中任务数}
            tick:         全局周期计数

        返回:
            成功写入的行数
        """
        now = datetime.now(timezone.utc)
        insert_sql = text("""
            INSERT INTO ts_node_metric (
                metric_time, node_id, node_type,
                cpu_usage_pct, memory_usage_pct, gpu_usage_pct, disk_usage_pct,
                bandwidth_usage_gbps, latency_ms, jitter_ms, packet_loss_pct
            ) VALUES (
                :ts, :node_id, :node_type,
                :cpu, :memory, :gpu, :disk,
                :bandwidth, :latency, :jitter, :loss
            )
        """)
        params: list[dict[str, Any]] = []
        for node in nodes:
            nid = node["node_id"]
            m = self._generate_metrics(node, task_counts.get(nid, 0), tick)
            params.append({
                "ts": now,
                "node_id": nid,
                "node_type": node.get("layer", "dc"),
                "cpu": m["cpu"],
                "memory": m["memory"],
                "gpu": m["gpu"],
                "disk": m["disk"],
                "bandwidth": m["bandwidth"],
                "latency": m["latency"],
                "jitter": m["jitter"],
                "loss": m["loss"],
            })

        try:
            with engine.begin() as conn:
                conn.execute(insert_sql, params)
            logger.info(f"[仿真引擎] 第 {tick} 轮写入完成: {len(params)} 节点")
            return len(params)
        except Exception as exc:
            logger.error(f"[仿真引擎] 写入 ts_node_metric 失败: {exc}")
            return 0

    def _cleanup_old_data(self, engine: Engine) -> int:
        """
        删除 ts_node_metric 中超过 RETENTION_HOURS 的旧数据。

        保持数据量恒定，避免数据库膨胀。
        返回删除的行数。
        """
        cutoff = datetime.now(timezone.utc) - timedelta(hours=RETENTION_HOURS)
        sql = text("DELETE FROM ts_node_metric WHERE metric_time < :cutoff")
        try:
            with engine.begin() as conn:
                result = conn.execute(sql, {"cutoff": cutoff})
                deleted = result.rowcount or 0
                if deleted > 0:
                    logger.info(f"[仿真引擎] 清理 {deleted} 条过期数据（>{RETENTION_HOURS}h）")
                return deleted
        except Exception as exc:
            logger.warning(f"[仿真引擎] 清理旧数据失败: {exc}")
            return 0

    # ---- 主循环 ----

    async def run(self) -> None:
        """
        仿真引擎主循环（asyncio 协程）。

        每 WRITE_INTERVAL_SECONDS 秒执行一轮：
          查节点 → 查任务数 → 生成指标 → 写入 → 清理旧数据

        数据库连接失败时指数退避重试，不会让 FastAPI 崩溃。
        """
        logger.info(
            f"[仿真引擎] 启动 | 间隔 {WRITE_INTERVAL_SECONDS}s | "
            f"保留 {RETENTION_HOURS}h"
        )
        engine = self._get_engine()
        self._tick = 0
        consecutive_failures = 0

        while True:
            try:
                # 1. 查询所有节点
                nodes = self._fetch_nodes(engine)
                if not nodes:
                    logger.warning("[仿真引擎] 无可用节点，跳过本轮")
                    await asyncio.sleep(WRITE_INTERVAL_SECONDS)
                    continue

                # 2. 查询各节点运行中任务数
                task_counts = self._fetch_running_task_counts(engine)

                # 3. 生成并写入指标
                self._tick += 1
                written = self._write_metrics(engine, nodes, task_counts, self._tick)

                # 4. 清理旧数据（仅在写入成功时执行）
                if written > 0:
                    self._cleanup_old_data(engine)

                consecutive_failures = 0
                await asyncio.sleep(WRITE_INTERVAL_SECONDS)

            except asyncio.CancelledError:
                logger.info("[仿真引擎] 收到取消信号，正在停止...")
                break
            except Exception as exc:
                consecutive_failures += 1
                # 指数退避：失败越多等越久，但不超过 MAX_RETRY_DELAY
                delay = min(WRITE_INTERVAL_SECONDS * (2 ** consecutive_failures), MAX_RETRY_DELAY)
                logger.error(
                    f"[仿真引擎] 第 {consecutive_failures} 次异常: {exc}，"
                    f"{delay}s 后重试"
                )
                await asyncio.sleep(delay)


# ================================================================
# 全局实例与生命周期钩子
# ================================================================

_engine_instance: SimulationEngine | None = None
_background_task: asyncio.Task | None = None


def start_simulation_engine() -> None:
    """
    启动仿真引擎（由 main.py lifespan 在 FastAPI 启动时调用）。

    创建 SimulationEngine 实例并作为 asyncio 后台任务运行。
    """
    global _engine_instance, _background_task
    if _background_task is not None and not _background_task.done():
        logger.warning("[仿真引擎] 已在运行，跳过重复启动")
        return

    _engine_instance = SimulationEngine()
    _background_task = asyncio.create_task(_engine_instance.run())
    logger.info("[仿真引擎] 后台任务已创建")


def stop_simulation_engine() -> None:
    """
    停止仿真引擎（由 main.py lifespan 在 FastAPI 关闭时调用）。

    取消 asyncio 任务，引擎会在下一个 await 点退出。
    """
    global _engine_instance, _background_task
    if _background_task is not None:
        _background_task.cancel()
        _background_task = None
        logger.info("[仿真引擎] 已请求停止")
    _engine_instance = None
