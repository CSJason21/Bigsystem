"""
算力资源路由（合并 cst 增强版）
接口列表：
  GET /resources/nodes              - 获取所有节点资源使用情况
  GET /resources/nodes/{node_id}    - 获取单个节点详情
  GET /resources/nodes/{node_id}/history - 获取节点历史指标
  GET /resources/topology           - 获取网络拓扑
  GET /resources/load               - 获取系统负载概览
  GET /resources/usage              - 获取资源占比（饼图）
  GET /resources/trend              - 获取资源趋势（折线图）
  GET /resources/map                - 获取全国算力节点分布
  GET /resources/predict/dates      - 获取预测可用日期
  GET /resources/predict/trend      - 获取预测趋势
  GET /resources/predict/overview   - 获取预测概览
"""
from fastapi import APIRouter, Query
from typing import Optional
from sqlalchemy import text, create_engine
import random
import time

from app.core.config import settings
from app.core.cache import cached
from app.services.alibaba_predictor import (
    get_available_dates,
    get_realtime_prediction,
    get_daily_overview,
)
from app.services.scheduling_context import get_resource_sensing_insights

router = APIRouter()


@router.get("/resources/sensing-insights")
@cached(ttl=20, key_prefix="resource_sensing_insights")
async def sensing_insights():
    return get_resource_sensing_insights()


def _get_computing_network_engine():
    """创建连接 computing_network 数据库的引擎"""
    url = (
        f"postgresql+psycopg://{settings.DB_USER}:{settings.DB_PASSWORD}"
        f"@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}?sslmode=prefer"
    )
    return create_engine(url, connect_args={"connect_timeout": 5, "sslmode": "prefer"})


def _query_db(sql: str, params: dict | None = None):
    """执行 SQL 查询并返回字典列表"""
    engine = _get_computing_network_engine()
    with engine.connect() as conn:
        result = conn.execute(text(sql), params or {})
        return [dict(row._mapping) for row in result.fetchall()]


def _mock_node(node_id: str):
    """生成单个节点的 mock 数据"""
    status = random.choice(["online", "online", "online", "offline", "warning"])
    return {
        "node_name": f"node-{node_id}",
        "node_id": node_id,
        "status": status,
        "cpu_percent": round(random.uniform(10, 95), 1),
        "mem_percent": round(random.uniform(20, 90), 1),
        "gpu_percent": round(random.uniform(0, 100), 1),
        "disk_percent": round(random.uniform(30, 85), 1),
    }


@router.get("/resources/nodes")
@cached(ttl=30, key_prefix="resources")
async def get_nodes():
    """获取所有计算节点及其资源使用情况"""
    try:
        rows = _query_db("""
            SELECT
                node_id,
                node_name,
                COALESCE(display_status, status, 'offline') AS status,
                ROUND(cpu_percent::numeric, 1)  AS cpu_percent,
                ROUND(mem_percent::numeric, 1)  AS mem_percent,
                ROUND(gpu_percent::numeric, 1)  AS gpu_percent,
                ROUND(disk_percent::numeric, 1) AS disk_percent
            FROM vw_node_runtime_snapshot
            ORDER BY node_id
        """)
        nodes = [
            {
                "node_name": r["node_name"],
                "node_id": r["node_id"],
                "status": r["status"],
                "cpu_percent": float(r["cpu_percent"]),
                "mem_percent": float(r["mem_percent"]),
                "gpu_percent": float(r["gpu_percent"]),
                "disk_percent": float(r["disk_percent"]),
            }
            for r in rows
        ]
        online = sum(1 for n in nodes if n["status"] == "online")
        return {"total": len(nodes), "online": online, "nodes": nodes}
    except Exception as e:
        print(f"[API] /resources/nodes query failed: {e}")
        nodes = [_mock_node(str(i)) for i in range(1, 13)]
        return {"total": len(nodes), "online": sum(1 for n in nodes if n["status"] == "online"), "nodes": nodes}


@router.get("/resources/nodes/{node_id}")
@cached(ttl=30, key_prefix="resources")
async def get_node_detail(node_id: str):
    """获取单个节点详细信息"""
    return _mock_node(node_id)


@router.get("/resources/nodes/{node_id}/history")
@cached(ttl=60, key_prefix="resources")
async def get_node_history(
    node_id: str,
    metric: str = "cpu_usage",
    period: str = "1h",
):
    """获取节点历史指标"""
    points = 60 if period == "1h" else 120
    timestamps = [int(time.time()) - (points - i) * 60 for i in range(points)]
    values = [round(random.uniform(20, 90), 1) for _ in range(points)]
    return {
        "node_id": node_id,
        "metric": metric,
        "period": period,
        "data": [{"timestamp": t, "value": v} for t, v in zip(timestamps, values)],
    }


@router.get("/resources/topology")
@cached(ttl=120, key_prefix="resources")
async def get_topology():
    """获取网络拓扑数据"""
    nodes = [
        {"id": "cloud", "label": "Cloud Center", "type": "cloud"},
        *[{"id": f"edge-{i}", "label": f"Edge Node {i}", "type": "edge"} for i in range(1, 5)],
        *[{"id": f"client-{i}", "label": f"Client {i}", "type": "client"} for i in range(1, 9)],
    ]
    edges = [
        *[{"source": "cloud", "target": f"edge-{i}"} for i in range(1, 5)],
        *[{"source": f"edge-{(i-1)//2+1}", "target": f"client-{i}"} for i in range(1, 9)],
    ]
    return {"nodes": nodes, "edges": edges}


@router.get("/resources/load")
@cached(ttl=30, key_prefix="resources")
async def get_system_load():
    """获取系统负载概览"""
    return {
        "timestamp": int(time.time()),
        "total_cpu": round(random.uniform(40, 75), 1),
        "total_memory": round(random.uniform(50, 80), 1),
        "total_gpu": round(random.uniform(30, 90), 1),
        "total_disk": round(random.uniform(40, 70), 1),
        "node_loads": [
            {"node_id": str(i), "load": round(random.uniform(20, 95), 1)}
            for i in range(1, 13)
        ],
    }


# =========================
# TaskManagement 页面专用接口
# =========================

@router.get("/resources/usage")
@cached(ttl=60, key_prefix="resources")
async def get_resource_usage():
    """获取资源占比数据（饼图）"""
    try:
        rows = _query_db("""
            SELECT
                AVG(cpu_usage_pct)     AS cpu,
                AVG(gpu_usage_pct)     AS gpu,
                AVG(disk_usage_pct)    AS disk,
                AVG(network_in_mbps)   AS network
            FROM (
                SELECT DISTINCT ON (node_id)
                    cpu_usage_pct, gpu_usage_pct, disk_usage_pct, network_in_mbps
                FROM ts_node_metric
                ORDER BY node_id, metric_time DESC
            ) sub
        """)
        if rows and rows[0]["cpu"] is not None:
            r = rows[0]
            return [
                {"name": "CPU", "value": round(float(r["cpu"]), 1)},
                {"name": "GPU", "value": round(float(r["gpu"]), 1)},
                {"name": "存储", "value": round(float(r["disk"]), 1)},
                {"name": "网络", "value": round(float(r["network"]), 1)},
            ]
    except Exception as e:
        print(f"[API] /resources/usage query failed: {e}")

    return [
        {"name": "CPU", "value": round(random.uniform(40, 80), 1)},
        {"name": "GPU", "value": round(random.uniform(30, 70), 1)},
        {"name": "存储", "value": round(random.uniform(30, 60), 1)},
        {"name": "网络", "value": round(random.uniform(20, 50), 1)},
    ]


@router.get("/resources/trend")
@cached(ttl=120, key_prefix="resources")
async def get_resource_trend():
    """获取资源动态趋势数据（折线图）"""
    try:
        rows = _query_db("""
            SELECT
                metric_time,
                avg_cpu_pct,
                avg_memory_pct,
                avg_gpu_pct
            FROM ts_resource_trend_5m
            ORDER BY metric_time
        """)
        if rows:
            day_map: dict[str, dict] = {}
            for r in rows:
                mt = r["metric_time"]
                day = mt.strftime("%Y-%m-%d")
                time_label = mt.strftime("%H:%M")
                if day not in day_map:
                    day_map[day] = {"times": [], "cpu": [], "mem": [], "gpu": []}
                day_map[day]["times"].append(time_label)
                day_map[day]["cpu"].append(round(float(r["avg_cpu_pct"]), 1))
                day_map[day]["mem"].append(round(float(r["avg_memory_pct"]), 1))
                day_map[day]["gpu"].append(round(float(r["avg_gpu_pct"]), 1))

            days = sorted(day_map.keys())

            def avg(arr):
                return round(sum(arr) / len(arr), 1) if arr else 0

            daily_overview = {
                "x": days,
                "series": [
                    {"name": "CPU 利用率", "data": [avg(day_map[d]["cpu"]) for d in days]},
                    {"name": "内存利用率", "data": [avg(day_map[d]["mem"]) for d in days]},
                    {"name": "GPU 利用率", "data": [avg(day_map[d]["gpu"]) for d in days]},
                ],
            }

            daily_detail = {}
            for d in days:
                info = day_map[d]
                daily_detail[d] = {
                    "x": info["times"],
                    "series": [
                        {"name": "CPU 利用率", "data": info["cpu"]},
                        {"name": "内存利用率", "data": info["mem"]},
                        {"name": "GPU 利用率", "data": info["gpu"]},
                    ],
                }

            return {"dailyOverview": daily_overview, "dailyDetail": daily_detail}
    except Exception as e:
        print(f"[API] /resources/trend query failed: {e}")

    time_points = ["10:00", "11:00", "12:00", "13:00", "14:00"]
    return {
        "dailyOverview": {
            "x": ["2026-05-14"],
            "series": [
                {"name": "CPU 利用率", "data": [round(random.uniform(45, 85), 1)]},
                {"name": "内存利用率", "data": [round(random.uniform(35, 75), 1)]},
                {"name": "GPU 利用率", "data": [round(random.uniform(20, 65), 1)]},
            ],
        },
        "dailyDetail": {
            "2026-05-14": {
                "x": time_points,
                "series": [
                    {"name": "CPU 利用率", "data": [round(random.uniform(45, 85), 1) for _ in time_points]},
                    {"name": "内存利用率", "data": [round(random.uniform(35, 75), 1) for _ in time_points]},
                    {"name": "GPU 利用率", "data": [round(random.uniform(20, 65), 1) for _ in time_points]},
                ],
            }
        },
    }


@router.get("/resources/map")
@cached(ttl=300, key_prefix="resources")
async def get_map_nodes():
    """获取全国算力节点分布数据"""
    try:
        rows = _query_db(
            "SELECT name, longitude, latitude, compute_power, center_level "
            "FROM dim_supercomputing_center "
            "WHERE is_active = true "
            "ORDER BY compute_power DESC"
        )
        return [
            {
                "name": r["name"],
                "longitude": r["longitude"],
                "latitude": r["latitude"],
                "capacity": r["compute_power"],
                "level": r["center_level"] or "区域级",
            }
            for r in rows
        ]
    except Exception as e:
        print(f"[API] /resources/map query failed: {e}")
        return []


@router.get("/resources/predict/dates")
async def predict_available_dates():
    """获取预测可用日期列表"""
    try:
        dates = get_available_dates()
        return {"dates": dates}
    except Exception as e:
        print(f"[API] /resources/predict/dates failed: {e}")
        return {"dates": []}


@router.get("/resources/predict/trend")
async def predict_trend(date: str = Query(..., description="查询日期 YYYY-MM-DD")):
    """获取指定日期的预测趋势"""
    try:
        result = await get_realtime_prediction(date)
        if result:
            return result
        return {"date": date, "x": [], "currentTimeIndex": -1, "series": []}
    except Exception as e:
        print(f"[API] /resources/predict/trend failed: {e}")
        return {"date": date, "x": [], "currentTimeIndex": -1, "series": []}


@router.get("/resources/predict/overview")
async def predict_overview():
    """获取预测概览"""
    try:
        return get_daily_overview()
    except Exception as e:
        print(f"[API] /resources/predict/overview failed: {e}")
        return {"x": [], "series": []}


# ================================================================
# 算力资源感知页专用接口（数据源：ts_node_metric 仿真表）
# ================================================================

@router.get("/resources/sensing")
@cached(ttl=20, key_prefix="sensing")
async def get_sensing_overview(points: int = Query(40, ge=10, le=120, description="趋势点数")):
    """
    算力资源感知页综合接口。

    返回 14 个节点的最新指标 + 最近 N 个时间点的 CPU/内存趋势。
    数据源：ts_node_metric（由仿真引擎每 30s 写入）。

    返回结构:
    {
        "nodes": [
            {
                "node_id", "node_name", "cpu", "memory", "gpu",
                "disk", "bandwidth", "latency", "jitter", "packet_loss",
                "gpu_usage_list", "gpu_memory_list", "disk_list",
                "metric_time"
            }, ...
        ],
        "trend": {
            "timestamps": ["HH:MM:SS", ...],
            "cpu_avg": [float, ...],
            "memory_avg": [float, ...]
        },
        "summary": {
            "avg_cpu", "avg_memory", "avg_gpu", "avg_disk",
            "online_count", "total_count", "warning_count"
        }
    }
    """
    try:
        engine = _get_computing_network_engine()

        # ---- 1. 查询每个节点最新一条指标 ----
        latest_sql = text("""
            SELECT DISTINCT ON (node_id)
                m.node_id,
                n.node_name,
                n.gpu_count,
                n.gpu_type,
                m.cpu_usage_pct,
                m.memory_usage_pct,
                m.gpu_usage_pct,
                m.disk_usage_pct,
                m.bandwidth_usage_gbps,
                m.latency_ms,
                m.jitter_ms,
                m.packet_loss_pct,
                m.metric_time
            FROM ts_node_metric m
            JOIN dim_compute_node n ON n.node_id = m.node_id
            ORDER BY m.node_id, m.metric_time DESC
        """)

        with engine.connect() as conn:
            latest_rows = conn.execute(latest_sql).mappings().all()

        if not latest_rows:
            return {"nodes": [], "trend": {"timestamps": [], "cpu_avg": [], "memory_avg": []}, "summary": {}}

        nodes = []
        for r in latest_rows:
            cpu = float(r["cpu_usage_pct"] or 0)
            memory = float(r["memory_usage_pct"] or 0)
            gpu_pct = float(r["gpu_usage_pct"] or 0)
            gpu_count = int(r.get("gpu_count", 0) or 0)

            # 为前端构造 GPU 使用率列表（每个 GPU 卡的利用率）
            gpu_usage_list = []
            gpu_memory_list = []
            if gpu_count > 0:
                for i in range(gpu_count):
                    gpu_usage_list.append(round(max(0, min(100, gpu_pct + (i - gpu_count / 2) * 5)), 1))
                    gpu_memory_list.append(round(max(0, min(100, gpu_pct * 0.7 + i * 8)), 1))

            # 构造磁盘分区数据
            disk_list = [
                {"name": "/system", "percent": round(max(20, min(95, memory - 15)), 1)},
                {"name": "/data", "percent": round(max(30, min(98, cpu + 5)), 1)},
                {"name": "/models", "percent": round(max(25, min(90, memory - 8)), 1)},
                {"name": "/cache", "percent": round(max(10, min(80, 30 + (cpu % 20))), 1)},
            ]

            nodes.append({
                "node_id": r["node_id"],
                "node_name": r["node_name"],
                "cpu": cpu,
                "memory": memory,
                "gpu": gpu_pct,
                "disk": float(r["disk_usage_pct"] or 0),
                "bandwidth": float(r["bandwidth_usage_gbps"] or 0),
                "latency": float(r["latency_ms"] or 0),
                "jitter": float(r["jitter_ms"] or 0),
                "packet_loss": float(r["packet_loss_pct"] or 0),
                "gpu_usage_list": gpu_usage_list,
                "gpu_memory_list": gpu_memory_list,
                "disk_list": disk_list,
                "metric_time": r["metric_time"].strftime("%H:%M:%S") if hasattr(r["metric_time"], "strftime") else str(r["metric_time"]),
            })

        # ---- 2. 查询最近 N 个时间点的全网平均趋势 ----
        trend_sql = text("""
            WITH recent_times AS (
                SELECT DISTINCT metric_time AS ts
                FROM ts_node_metric
                ORDER BY metric_time DESC
                LIMIT :points
            )
            SELECT
                rt.ts AS ts,
                AVG(m.cpu_usage_pct)    AS avg_cpu,
                AVG(m.memory_usage_pct) AS avg_memory
            FROM ts_node_metric m
            JOIN recent_times rt ON m.metric_time = rt.ts
            GROUP BY rt.ts
            ORDER BY rt.ts ASC
        """)

        with engine.connect() as conn:
            trend_rows = conn.execute(trend_sql, {"points": points}).mappings().all()

        trend = {
            "timestamps": [r["ts"].strftime("%H:%M:%S") if hasattr(r["ts"], "strftime") else str(r["ts"]) for r in trend_rows],
            "cpu_avg": [round(float(r["avg_cpu"] or 0), 1) for r in trend_rows],
            "memory_avg": [round(float(r["avg_memory"] or 0), 1) for r in trend_rows],
        }

        # ---- 3. 汇总统计 ----
        cpus = [n["cpu"] for n in nodes]
        memories = [n["memory"] for n in nodes]
        gpus = [n["gpu"] for n in nodes]
        disks = [n["disk"] for n in nodes]
        warning_count = sum(1 for c in cpus if c >= 80)

        summary = {
            "avg_cpu": round(sum(cpus) / len(cpus), 1) if cpus else 0,
            "avg_memory": round(sum(memories) / len(memories), 1) if memories else 0,
            "avg_gpu": round(sum(gpus) / len(gpus), 1) if gpus else 0,
            "avg_disk": round(sum(disks) / len(disks), 1) if disks else 0,
            "online_count": len(nodes),
            "total_count": len(nodes),
            "warning_count": warning_count,
        }

        return {"nodes": nodes, "trend": trend, "summary": summary}

    except Exception as e:
        print(f"[API] /resources/sensing failed: {e}")
        return {"nodes": [], "trend": {"timestamps": [], "cpu_avg": [], "memory_avg": []}, "summary": {}}
