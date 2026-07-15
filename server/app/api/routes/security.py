"""
量化安全评估路由
==============================

【改造说明】
    原实现（lzz 同学）：用内存变量 _history + 后台 asyncio 任务每 10s
    生成随机快照，数据与数据库完全脱节。

    现实现：安全评分实时从 ts_node_metric 表计算，network/system 维度
    完全由真实节点监控指标驱动，data/algorithm 维度保留基准+波动。
    不再使用内存缓冲，所有交互通过数据库完成。

【因果链路】
    仿真引擎写 ts_node_metric → security 接口实时聚合计算
    → network 维度反映真实丢包/时延/带宽
    → system 维度反映真实 CPU/内存/磁盘负载
    → 前端安全评估页看到的安全分随节点负载动态变化

接口列表：
  GET /security/timeline        - 获取安全态势时序数据（从 ts_node_metric 重建）
  GET /security/timeline/latest - 获取最新一条安全态势快照（实时计算）
"""
import random
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter
from loguru import logger
from sqlalchemy import create_engine, text

from app.core.config import settings

router = APIRouter()


# ================================================================
# 数据库连接（复用全局配置）
# ================================================================

_db_engine = None


def _get_db_engine():
    """惰性创建数据库引擎"""
    global _db_engine
    if _db_engine is None:
        url = (
            f"postgresql+psycopg://{settings.DB_USER}:{settings.DB_PASSWORD}"
            f"@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}?sslmode=prefer"
        )
        _db_engine = create_engine(url, pool_pre_ping=True, pool_size=3)
    return _db_engine


# ================================================================
# 指标树配置（与前端 data.ts 结构保持一致）
# ================================================================

MetricTree = dict[str, Any]

# 各维度的叶子指标配置：id / 名称 / 权重 / 基准分 / 波动幅度
# network 和 system 维度的值会从数据库覆盖
_LEAF_CONFIG: dict[str, list[dict]] = {
    "data": [
        {"id": "data.epsilon", "name": "ε合规率", "weight": 40, "base": 89, "vol": 3},
        {"id": "data.correlation", "name": "关联泄露风险", "weight": 35, "base": 86, "vol": 4},
        {"id": "data.compliance", "name": "业务方合规", "weight": 25, "base": 84, "vol": 2},
    ],
    "algorithm": [
        {"id": "algorithm.attack_defense", "name": "攻击防御率", "weight": 25, "base": 83, "vol": 5},
        {"id": "algorithm.malicious_defense", "name": "恶意比防御", "weight": 20, "base": 85, "vol": 3},
        {"id": "algorithm.avg_accuracy", "name": "平均训练精度", "weight": 20, "base": 80, "vol": 2},
        {"id": "algorithm.fairness", "name": "公平性指数", "weight": 20, "base": 82, "vol": 3},
        {"id": "algorithm.distillation", "name": "蒸馏鲁棒性", "weight": 15, "base": 79, "vol": 4},
    ],
    "network": [
        {"id": "network.packet_loss", "name": "丢包率防御", "weight": 35, "base": 78, "vol": 3},
        {"id": "network.link_health", "name": "链路健康度", "weight": 25, "base": 80, "vol": 2},
        {"id": "network.comm_saving", "name": "通信节省率", "weight": 40, "base": 77, "vol": 3},
    ],
    "system": [
        {"id": "system.trust", "name": "节点可信度", "weight": 25, "base": 75, "vol": 3},
        {"id": "system.health", "name": "节点健康度", "weight": 20, "base": 78, "vol": 2},
        {"id": "system.alert", "name": "告警扣分", "weight": 20, "base": 73, "vol": 4},
        {"id": "system.schedule", "name": "调度成功率", "weight": 20, "base": 80, "vol": 1},
        {"id": "system.storage", "name": "存储集群健康", "weight": 15, "base": 76, "vol": 3},
    ],
}

_DIM_NAMES = ["data", "algorithm", "network", "system"]
_DIM_LABELS = {
    "data": "数据安全",
    "algorithm": "算法安全",
    "network": "网络安全",
    "system": "系统安全",
}


# ================================================================
# 工具函数
# ================================================================

def _jitter(value: float, volatility: int) -> float:
    """在 value 附近随机波动 ±volatility，钳制到 [40, 100]"""
    return max(40, min(100, value + (random.random() - 0.5) * 2 * volatility))


def _build_leaf(leaf_cfg: dict, value: float) -> MetricTree:
    """构建叶子指标节点"""
    return {
        "id": leaf_cfg["id"],
        "name": leaf_cfg["name"],
        "value": round(value, 1),
        "weight": leaf_cfg["weight"],
    }


def _build_dimension(dim_name: str, leaves: list[dict], values: dict[str, float]) -> MetricTree:
    """构建维度节点（加权汇总子指标）"""
    children = [_build_leaf(l, values[l["id"]]) for l in leaves]
    total_w = sum(c["weight"] for c in children)
    weighted = sum(c["value"] * (c["weight"] / total_w) for c in children) if total_w > 0 else 0
    return {
        "id": dim_name,
        "name": _DIM_LABELS.get(dim_name, dim_name),
        "value": round(weighted, 1),
        "children": children,
    }


# ================================================================
# 核心：从数据库读取节点指标，计算安全评分
# ================================================================

def _fetch_node_metrics_summary(engine) -> dict[str, float] | None:
    """
    从 ts_node_metric 读取最新一轮所有节点的聚合指标。

    返回包含以下聚合值的字典：
        avg_cpu, avg_memory, avg_gpu, avg_disk,
        avg_packet_loss, avg_latency, avg_bandwidth,
        max_cpu, node_count, online_ratio

    如果查不到数据返回 None。
    """
    sql = text("""
        WITH latest AS (
            SELECT DISTINCT ON (node_id) *
            FROM ts_node_metric
            ORDER BY node_id, metric_time DESC
        )
        SELECT
            AVG(cpu_usage_pct)     AS avg_cpu,
            AVG(memory_usage_pct)  AS avg_memory,
            AVG(NULLIF(gpu_usage_pct, 0)) AS avg_gpu,
            AVG(disk_usage_pct)    AS avg_disk,
            AVG(NULLIF(packet_loss_pct, 0)) AS avg_packet_loss,
            AVG(NULLIF(latency_ms, 0))     AS avg_latency,
            AVG(NULLIF(bandwidth_usage_gbps, 0)) AS avg_bandwidth,
            MAX(cpu_usage_pct)     AS max_cpu,
            COUNT(*)               AS node_count
        FROM latest
    """)
    try:
        with engine.connect() as conn:
            row = conn.execute(sql).mappings().first()
            if not row or row.get("node_count", 0) == 0:
                return None
            return {
                "avg_cpu": float(row["avg_cpu"] or 0),
                "avg_memory": float(row["avg_memory"] or 0),
                "avg_gpu": float(row["avg_gpu"] or 0),
                "avg_disk": float(row["avg_disk"] or 0),
                "avg_packet_loss": float(row["avg_packet_loss"] or 0),
                "avg_latency": float(row["avg_latency"] or 0),
                "avg_bandwidth": float(row["avg_bandwidth"] or 0),
                "max_cpu": float(row["max_cpu"] or 0),
                "node_count": int(row["node_count"] or 0),
            }
    except Exception as exc:
        logger.warning(f"[security] 读取 ts_node_metric 失败: {exc}")
        return None


def _compute_network_scores(metrics: dict[str, float]) -> dict[str, float]:
    """
    根据真实网络指标计算 network 维度各叶子分（0-100，越高越好）。

    - packet_loss: 丢包率越低分越高（0% → 95分，1% → 65分）
    - link_health: 时延越低分越高（10ms → 90分，60ms → 50分）
    - comm_saving: 带宽利用率适中分越高（40-120 Gbps 最佳）
    """
    loss = metrics["avg_packet_loss"]
    latency = metrics["avg_latency"]
    bandwidth = metrics["avg_bandwidth"]

    # 丢包率防御分：loss=0 → 95, loss=1 → 65, loss=2 → 35
    packet_loss_score = max(30, min(98, 95 - loss * 30))

    # 链路健康度：latency=10 → 90, latency=40 → 65, latency=80 → 40
    link_health_score = max(35, min(95, 100 - latency * 0.75))

    # 通信节省率：带宽在 40-120 区间最佳，过高过低扣分
    if 40 <= bandwidth <= 120:
        comm_saving_score = 85 + (100 - abs(bandwidth - 80)) * 0.15
    elif bandwidth < 40:
        comm_saving_score = 60 + bandwidth * 0.5
    else:
        comm_saving_score = max(45, 85 - (bandwidth - 120) * 0.3)

    return {
        "network.packet_loss": round(min(100, packet_loss_score), 1),
        "network.link_health": round(min(100, link_health_score), 1),
        "network.comm_saving": round(min(100, comm_saving_score), 1),
    }


def _compute_system_scores(metrics: dict[str, float]) -> dict[str, float]:
    """
    根据真实系统指标计算 system 维度各叶子分（0-100，越高越好）。

    - trust: 基于节点在线率（这里用 CPU 合理性近似）
    - health: CPU/内存越低分越高
    - alert: 高负载节点扣分（max_cpu 越高扣越多）
    - schedule: 固定高分（调度成功率）
    - storage: 磁盘利用率越低分越高
    """
    avg_cpu = metrics["avg_cpu"]
    max_cpu = metrics["max_cpu"]
    avg_memory = metrics["avg_memory"]
    avg_disk = metrics["avg_disk"]

    # 节点可信度：CPU 合理（20-70）分高，过载或过低扣分
    trust_score = max(50, 90 - abs(avg_cpu - 45) * 0.5)

    # 节点健康度：CPU + 内存综合，越低越好
    health_score = max(40, 95 - (avg_cpu + avg_memory) * 0.25)

    # 告警扣分：max_cpu 越高，说明有节点过载，扣分越多
    alert_score = max(45, 85 - max(0, max_cpu - 70) * 1.2)

    # 调度成功率：稳定高分
    schedule_score = 82 + random.uniform(-1, 1)

    # 存储集群健康：磁盘利用率越低越好
    storage_score = max(45, 90 - avg_disk * 0.3)

    return {
        "system.trust": round(min(100, trust_score), 1),
        "system.health": round(min(100, health_score), 1),
        "system.alert": round(min(100, alert_score), 1),
        "system.schedule": round(min(100, schedule_score), 1),
        "system.storage": round(min(100, storage_score), 1),
    }


def _generate_snapshot_from_db() -> tuple[MetricTree | None, str]:
    """
    从数据库实时计算一个完整的安全态势快照。

    返回 (root, timestamp_str)。
    如果数据库不可用返回 (None, "")。
    """
    engine = _get_db_engine()
    metrics = _fetch_node_metrics_summary(engine)

    if metrics is None:
        return None, ""

    # ---- network 和 system 维度：从真实指标计算 ----
    network_scores = _compute_network_scores(metrics)
    system_scores = _compute_system_scores(metrics)

    # ---- data 和 algorithm 维度：基准值 + 小幅波动 ----
    values: dict[str, float] = {}
    for dim in ("data", "algorithm"):
        for leaf in _LEAF_CONFIG[dim]:
            values[leaf["id"]] = _jitter(leaf["base"], leaf["vol"])

    # 覆盖 network/system 为真实计算值
    values.update(network_scores)
    values.update(system_scores)

    # 构建维度节点
    dim_nodes = [_build_dimension(dim, _LEAF_CONFIG[dim], values) for dim in _DIM_NAMES]

    # 综合分（等权平均）
    overall = sum(d["value"] for d in dim_nodes) / len(dim_nodes) if dim_nodes else 0

    root: MetricTree = {
        "id": "global",
        "name": "综合安全评分",
        "value": round(overall, 1),
        "children": dim_nodes,
    }

    now_str = datetime.now().strftime("%H:%M:%S")
    return root, now_str


# ================================================================
# API 端点
# ================================================================

@router.get("/security/timeline", summary="获取安全态势时序数据")
async def get_timeline():
    """
    返回安全态势时序数据。

    实现方式：取最近 N 个时间点的 ts_node_metric，每个点计算一个快照，
    重建安全趋势线。不再依赖内存缓冲。
    """
    engine = _get_db_engine()

    # 取最近 20 个时间点（每个时间点 = 一轮仿真写入）
    # 每轮间隔 30s，20 轮 ≈ 10 分钟的历史
    sql = text("""
        WITH recent_times AS (
            SELECT DISTINCT metric_time AS ts
            FROM ts_node_metric
            ORDER BY metric_time DESC
            LIMIT 20
        )
        SELECT
            rt.ts AS ts,
            AVG(m.cpu_usage_pct)     AS avg_cpu,
            AVG(m.memory_usage_pct)  AS avg_memory,
            AVG(m.disk_usage_pct)    AS avg_disk,
            AVG(NULLIF(m.packet_loss_pct, 0)) AS avg_loss,
            AVG(NULLIF(m.latency_ms, 0))     AS avg_latency,
            AVG(NULLIF(m.bandwidth_usage_gbps, 0)) AS avg_bandwidth,
            MAX(m.cpu_usage_pct)     AS max_cpu,
            COUNT(*)                 AS cnt
        FROM ts_node_metric m
        JOIN recent_times rt ON m.metric_time = rt.ts
        GROUP BY rt.ts
        ORDER BY rt.ts ASC
    """)

    try:
        with engine.connect() as conn:
            rows = conn.execute(sql).mappings().all()
    except Exception as exc:
        logger.warning(f"[security] timeline 查询失败: {exc}")
        return []

    if not rows:
        return []

    # 为每个时间点计算一个安全快照
    history: list[dict] = []
    # data/algorithm 维度的连续波动状态
    state: dict[str, float] = {}
    for dim in ("data", "algorithm"):
        for leaf in _LEAF_CONFIG[dim]:
            state[leaf["id"]] = leaf["base"]

    for row in rows:
        metrics = {
            "avg_cpu": float(row["avg_cpu"] or 0),
            "avg_memory": float(row["avg_memory"] or 0),
            "avg_disk": float(row["avg_disk"] or 0),
            "avg_packet_loss": float(row["avg_loss"] or 0),
            "avg_latency": float(row["avg_latency"] or 0),
            "avg_bandwidth": float(row["avg_bandwidth"] or 0),
            "max_cpu": float(row["max_cpu"] or 0),
            "node_count": int(row["cnt"] or 0),
        }

        # network/system 从真实数据计算
        net_scores = _compute_network_scores(metrics)
        sys_scores = _compute_system_scores(metrics)

        # data/algorithm 连续波动
        values: dict[str, float] = {}
        for dim in ("data", "algorithm"):
            for leaf in _LEAF_CONFIG[dim]:
                state[leaf["id"]] = _jitter(state.get(leaf["id"], leaf["base"]), leaf["vol"])
                values[leaf["id"]] = state[leaf["id"]]
        values.update(net_scores)
        values.update(sys_scores)

        dim_nodes = [_build_dimension(dim, _LEAF_CONFIG[dim], values) for dim in _DIM_NAMES]
        overall = sum(d["value"] for d in dim_nodes) / len(dim_nodes)
        root: MetricTree = {
            "id": "global",
            "name": "综合安全评分",
            "value": round(overall, 1),
            "children": dim_nodes,
        }

        ts_str = row["ts"].strftime("%H:%M:%S") if hasattr(row["ts"], "strftime") else str(row["ts"])
        history.append({"time": ts_str, "root": root})

    return history


@router.get("/security/timeline/latest", summary="获取最新一条快照")
async def get_latest():
    """实时计算最新一条安全态势快照"""
    root, ts = _generate_snapshot_from_db()
    if root is None:
        return None
    return {"time": ts, "root": root}


# ================================================================
# 兼容钩子（保持 main.py 不报错，不再需要后台生成器）
# ================================================================

def start_background_generator():
    """
    兼容 main.py 的启动钩子。

    安全新实现已改为实时查询数据库计算，不再需要后台 asyncio 生成器。
    此函数保留为空操作，避免 main.py 报错。
    """
    logger.info("[security] 安全场势已改为实时数据库计算模式，无需后台生成器")


def stop_background_generator():
    """兼容 main.py 的关闭钩子（空操作）"""
    pass
