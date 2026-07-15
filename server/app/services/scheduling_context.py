from __future__ import annotations

import time
from datetime import datetime
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection

from app.core.config import settings
from app.services.scheduling_engine import evaluate_candidates, get_mock_candidates
from app.services.task_flow_logger import get_task_timeline


def get_computing_network_engine():
    url = (
        f"postgresql+psycopg://{settings.DB_USER}:{settings.DB_PASSWORD}"
        f"@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}?sslmode=prefer"
    )
    return create_engine(url, connect_args={"connect_timeout": 5, "sslmode": "prefer"})


def _num(value: Any, default: float = 0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _ts(value: Any | None = None) -> int:
    if value is None:
        return int(time.time())
    if isinstance(value, datetime):
        return int(value.timestamp())
    return int(time.time())


def _stage_from_task_status(status: Any) -> str:
    normalized = str(status or "pending").strip().lower()
    return {
        "created": "已录入",
        "pending": "待分配",
        "scheduling": "调度决策中",
        "scheduled": "已分配",
        "running": "运行中",
        "completed": "已完成",
        "failed": "失败",
        "cancelled": "已取消",
    }.get(normalized, str(status or "待分配"))


def _progress_from_task_status(status: Any, progress: Any) -> float:
    normalized = str(status or "").strip().lower()
    if normalized == "completed":
        return 100
    if normalized in {"pending", "created", "scheduling"}:
        return min(_num(progress, 0), 30)
    return _num(progress, 0)


def _rows(conn: Connection, sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    return [dict(row._mapping) for row in conn.execute(text(sql), params or {}).fetchall()]


def _first(conn: Connection, sql: str, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
    row = conn.execute(text(sql), params or {}).mappings().first()
    return dict(row) if row else None


def ensure_scheduler_tables(conn: Connection) -> None:
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS fact_task_candidate_score (
          score_id BIGSERIAL PRIMARY KEY,
          task_id VARCHAR(64) NOT NULL,
          candidate_node_id VARCHAR(64) NOT NULL,
          score_total DOUBLE PRECISION,
          score_resource_fit DOUBLE PRECISION,
          score_latency DOUBLE PRECISION,
          score_bandwidth DOUBLE PRECISION,
          score_balance DOUBLE PRECISION,
          score_risk DOUBLE PRECISION,
          score_time TIMESTAMPTZ DEFAULT NOW(),
          rank_no INT,
          source_type VARCHAR(30) DEFAULT 'scheduler_context'
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS fact_task_resource_lock (
          lock_id BIGSERIAL PRIMARY KEY,
          task_id VARCHAR(64) NOT NULL,
          target_node_id VARCHAR(64) NOT NULL,
          cpu_locked DOUBLE PRECISION DEFAULT 0,
          memory_locked DOUBLE PRECISION DEFAULT 0,
          gpu_locked DOUBLE PRECISION DEFAULT 0,
          bandwidth_locked DOUBLE PRECISION DEFAULT 0,
          storage_locked DOUBLE PRECISION DEFAULT 0,
          lock_status VARCHAR(20) DEFAULT 'active',
          locked_at TIMESTAMPTZ DEFAULT NOW(),
          expected_release_at TIMESTAMPTZ,
          released_at TIMESTAMPTZ,
          source_type VARCHAR(30) DEFAULT 'virtual_execution'
        )
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_task_resource_lock_task
        ON fact_task_resource_lock(task_id, lock_status)
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_task_resource_lock_node
        ON fact_task_resource_lock(target_node_id, lock_status)
    """))


def _mock_resource_insights() -> dict[str, Any]:
    nodes = get_mock_candidates()
    light = sorted(nodes, key=lambda item: item["cpu_usage_pct"])[:5]
    heavy = sorted(nodes, key=lambda item: item["cpu_usage_pct"], reverse=True)[:5]
    gpu_rich = sorted(nodes, key=lambda item: item["gpu_count"] * (100 - item["gpu_usage_pct"]), reverse=True)[:5]
    best_network = sorted(nodes, key=lambda item: (item["latency_ms"], item["packet_loss_pct"]))[:5]
    risky = [item for item in nodes if item["cpu_usage_pct"] >= 75 or item["trust_score"] < 70]
    return {
        "title": "资源调度摘要",
        "source": "fallback",
        "idleTop5": [{"nodeId": n["node_id"], "nodeName": n["node_name"], "cpu": round(n["cpu_usage_pct"], 1)} for n in light],
        "highLoadTop5": [{"nodeId": n["node_id"], "nodeName": n["node_name"], "cpu": round(n["cpu_usage_pct"], 1)} for n in heavy],
        "gpuRichNodes": [{"nodeId": n["node_id"], "nodeName": n["node_name"], "availableGpu": round(n["gpu_count"] * (100 - n["gpu_usage_pct"]) / 100, 1)} for n in gpu_rich],
        "riskyNodes": [{"nodeId": n["node_id"], "nodeName": n["node_name"], "reason": "负载或可信度接近阈值"} for n in risky[:5]],
        "bestNetworkNodes": [{"nodeId": n["node_id"], "nodeName": n["node_name"], "latencyMs": n["latency_ms"], "packetLossPct": n["packet_loss_pct"]} for n in best_network],
        "regionPressure": [],
        "updated_at": _ts(),
    }


def get_resource_sensing_insights() -> dict[str, Any]:
    try:
        engine = get_computing_network_engine()
        with engine.connect() as conn:
            ensure_scheduler_tables(conn)
            rows = _rows(conn, """
                WITH latest AS (
                  SELECT DISTINCT ON (m.node_id)
                    m.node_id, m.cpu_usage_pct, m.memory_usage_pct, m.gpu_usage_pct,
                    m.latency_ms, m.jitter_ms, m.packet_loss_pct, m.bandwidth_usage_gbps,
                    m.metric_time
                  FROM ts_node_metric m
                  ORDER BY m.node_id, m.metric_time DESC
                ),
                locks AS (
                  SELECT target_node_id, SUM(cpu_locked) AS locked_cpu, SUM(memory_locked) AS locked_memory,
                         SUM(gpu_locked) AS locked_gpu
                  FROM fact_task_resource_lock
                  WHERE lock_status = 'active'
                  GROUP BY target_node_id
                )
                SELECT
                  n.node_id, n.node_name, n.region_id, n.status,
                  COALESCE(n.cpu_cores, 0) AS cpu_cores,
                  COALESCE(n.memory_total_gb, 0) AS memory_gb,
                  COALESCE(n.gpu_count, 0) AS gpu_count,
                  COALESCE(n.bandwidth_total_gbps, n.network_bandwidth_mbps / 1000.0, 10) AS bandwidth_total_gbps,
                  COALESCE(n.health_score, n.task_success_rate * 100, 85) AS health_score,
                  COALESCE(l.cpu_usage_pct, 50) AS cpu_usage_pct,
                  COALESCE(l.memory_usage_pct, l.cpu_usage_pct, 50) AS memory_usage_pct,
                  COALESCE(l.gpu_usage_pct, l.cpu_usage_pct, 50) AS gpu_usage_pct,
                  COALESCE(l.latency_ms, n.avg_response_time, 30) AS latency_ms,
                  COALESCE(l.jitter_ms, 2) AS jitter_ms,
                  COALESCE(l.packet_loss_pct, 0) AS packet_loss_pct,
                  COALESCE(lock.locked_cpu, 0) AS locked_cpu,
                  COALESCE(lock.locked_memory, 0) AS locked_memory,
                  COALESCE(lock.locked_gpu, 0) AS locked_gpu
                FROM dim_compute_node n
                LEFT JOIN latest l ON l.node_id = n.node_id
                LEFT JOIN locks lock ON lock.target_node_id = n.node_id
                ORDER BY n.node_id
            """)
        if not rows:
            return _mock_resource_insights()

        def available_cpu(row: dict[str, Any]) -> float:
            return max(0, _num(row["cpu_cores"]) * (1 - _num(row["cpu_usage_pct"]) / 100) - _num(row["locked_cpu"]))

        def available_gpu(row: dict[str, Any]) -> float:
            return max(0, _num(row["gpu_count"]) * (1 - _num(row["gpu_usage_pct"]) / 100) - _num(row["locked_gpu"]))

        idle = sorted(rows, key=lambda r: (_num(r["cpu_usage_pct"]) + _num(r["memory_usage_pct"]) + _num(r["gpu_usage_pct"])) / 3)[:5]
        heavy = sorted(rows, key=lambda r: (_num(r["cpu_usage_pct"]) + _num(r["memory_usage_pct"]) + _num(r["gpu_usage_pct"])) / 3, reverse=True)[:5]
        gpu_rich = sorted(rows, key=available_gpu, reverse=True)[:5]
        best_network = sorted(rows, key=lambda r: (_num(r["latency_ms"]), _num(r["packet_loss_pct"])))[:5]
        risky = [
            r for r in rows
            if max(_num(r["cpu_usage_pct"]), _num(r["memory_usage_pct"]), _num(r["gpu_usage_pct"])) >= 82
            or _num(r["health_score"]) < 70
            or _num(r["packet_loss_pct"]) >= 1.0
        ]
        by_region: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            by_region.setdefault(str(row.get("region_id") or "unknown"), []).append(row)
        region_pressure = []
        for region_id, items in by_region.items():
            avg_load = sum((_num(i["cpu_usage_pct"]) + _num(i["memory_usage_pct"]) + _num(i["gpu_usage_pct"])) / 3 for i in items) / max(len(items), 1)
            region_pressure.append({
                "regionId": region_id,
                "pressure": round(avg_load, 1),
                "level": "tight" if avg_load >= 75 else "balanced" if avg_load >= 55 else "idle",
            })
        region_pressure.sort(key=lambda item: item["pressure"], reverse=True)
        return {
            "title": "资源调度摘要",
            "source": "database",
            "idleTop5": [{"nodeId": r["node_id"], "nodeName": r["node_name"], "availableCpu": round(available_cpu(r), 1), "cpu": round(_num(r["cpu_usage_pct"]), 1)} for r in idle],
            "highLoadTop5": [{"nodeId": r["node_id"], "nodeName": r["node_name"], "cpu": round(_num(r["cpu_usage_pct"]), 1), "gpu": round(_num(r["gpu_usage_pct"]), 1)} for r in heavy],
            "gpuRichNodes": [{"nodeId": r["node_id"], "nodeName": r["node_name"], "availableGpu": round(available_gpu(r), 1), "gpuCount": _int(r["gpu_count"])} for r in gpu_rich],
            "riskyNodes": [{"nodeId": r["node_id"], "nodeName": r["node_name"], "reason": "高负载/低可信/链路波动"} for r in risky[:5]],
            "bestNetworkNodes": [{"nodeId": r["node_id"], "nodeName": r["node_name"], "latencyMs": round(_num(r["latency_ms"]), 1), "packetLossPct": round(_num(r["packet_loss_pct"]), 2)} for r in best_network],
            "regionPressure": region_pressure,
            "updated_at": _ts(),
        }
    except Exception:
        return _mock_resource_insights()


def get_prediction_scheduling_insights() -> dict[str, Any]:
    try:
        engine = get_computing_network_engine()
        with engine.connect() as conn:
            rows = _rows(conn, """
                WITH recent AS (
                  SELECT
                    m.node_id,
                    date_trunc('minute', m.metric_time) AS slot,
                    AVG(m.cpu_usage_pct) AS cpu,
                    AVG(m.memory_usage_pct) AS memory,
                    AVG(m.gpu_usage_pct) AS gpu
                  FROM ts_node_metric m
                  WHERE m.metric_time >= NOW() - INTERVAL '90 minutes'
                  GROUP BY m.node_id, date_trunc('minute', m.metric_time)
                ),
                latest AS (
                  SELECT DISTINCT ON (r.node_id)
                    r.node_id, r.slot, r.cpu, r.memory, r.gpu
                  FROM recent r
                  ORDER BY r.node_id, r.slot DESC
                ),
                base AS (
                  SELECT r.node_id, AVG(r.cpu) AS avg_cpu, AVG(r.memory) AS avg_memory, AVG(r.gpu) AS avg_gpu
                  FROM recent r
                  GROUP BY r.node_id
                )
                SELECT
                  n.node_id, n.node_name, n.region_id,
                  COALESCE(l.cpu, 50) AS cpu_now,
                  COALESCE(l.memory, l.cpu, 50) AS memory_now,
                  COALESCE(l.gpu, l.cpu, 50) AS gpu_now,
                  COALESCE(b.avg_cpu, l.cpu, 50) AS cpu_avg,
                  COALESCE(b.avg_memory, l.memory, 50) AS memory_avg,
                  COALESCE(b.avg_gpu, l.gpu, 50) AS gpu_avg
                FROM dim_compute_node n
                LEFT JOIN latest l ON l.node_id = n.node_id
                LEFT JOIN base b ON b.node_id = n.node_id
            """)
        if not rows:
            raise RuntimeError("empty prediction rows")
        enriched = []
        for row in rows:
            now_load = (_num(row["cpu_now"]) * 0.45 + _num(row["memory_now"]) * 0.25 + _num(row["gpu_now"]) * 0.30)
            avg_load = (_num(row["cpu_avg"]) * 0.45 + _num(row["memory_avg"]) * 0.25 + _num(row["gpu_avg"]) * 0.30)
            predicted = max(0, min(100, now_load + max(now_load - avg_load, -8) * 0.7 + 5))
            enriched.append({**row, "pressure": round(predicted, 1)})
        tight_nodes = sorted([r for r in enriched if r["pressure"] >= 78], key=lambda r: r["pressure"], reverse=True)
        recommended_nodes = sorted(enriched, key=lambda r: r["pressure"])[:5]
        by_region: dict[str, list[dict[str, Any]]] = {}
        for row in enriched:
            by_region.setdefault(str(row.get("region_id") or "unknown"), []).append(row)
        regions = [
            {
                "regionId": region_id,
                "pressure": round(sum(item["pressure"] for item in items) / max(len(items), 1), 1),
            }
            for region_id, items in by_region.items()
        ]
        tight_regions = sorted([r for r in regions if r["pressure"] >= 72], key=lambda r: r["pressure"], reverse=True)
        idle_regions = sorted([r for r in regions if r["pressure"] < 55], key=lambda r: r["pressure"])
        return {
            "title": "预测压力摘要",
            "source": "database",
            "highRiskWindows": [
                {"window": "未来30分钟", "risk": "high" if tight_nodes else "medium", "reason": "由最近90分钟负载趋势外推"},
                {"window": "未来1小时", "risk": "medium", "reason": "建议避开高负载节点连续下发"},
            ],
            "tightRegions": tight_regions[:5],
            "tightResources": [
                {"resource": "GPU", "level": "tight" if any(_num(r["gpu_now"]) >= 78 for r in enriched) else "balanced"},
                {"resource": "CPU", "level": "tight" if any(_num(r["cpu_now"]) >= 82 for r in enriched) else "balanced"},
                {"resource": "memory", "level": "tight" if any(_num(r["memory_now"]) >= 82 for r in enriched) else "balanced"},
            ],
            "idleRegions": idle_regions[:5],
            "recommendedWindow": "未来15-30分钟优先下发；高风险节点建议延后或拆分",
            "recommendedNodes": [{"nodeId": r["node_id"], "nodeName": r["node_name"], "predictedLoad": r["pressure"]} for r in recommended_nodes],
            "notRecommendedNodes": [{"nodeId": r["node_id"], "nodeName": r["node_name"], "predictedLoad": r["pressure"]} for r in tight_nodes[:5]],
            "updated_at": _ts(),
        }
    except Exception:
        nodes = get_mock_candidates()
        ordered = sorted(nodes, key=lambda n: n["predicted_load"])
        return {
            "title": "预测压力摘要",
            "source": "fallback",
            "highRiskWindows": [{"window": "未来30分钟", "risk": "medium", "reason": "fallback 趋势估计"}],
            "tightRegions": [],
            "tightResources": [{"resource": "GPU", "level": "balanced"}],
            "idleRegions": [],
            "recommendedWindow": "未来15-30分钟",
            "recommendedNodes": [{"nodeId": n["node_id"], "nodeName": n["node_name"], "predictedLoad": n["predicted_load"]} for n in ordered[:5]],
            "notRecommendedNodes": [{"nodeId": n["node_id"], "nodeName": n["node_name"], "predictedLoad": n["predicted_load"]} for n in ordered[-5:]],
            "updated_at": _ts(),
        }


def get_security_scheduling_basis() -> dict[str, Any]:
    try:
        engine = get_computing_network_engine()
        with engine.connect() as conn:
            row = _first(conn, """
                WITH latest AS (
                  SELECT DISTINCT ON (node_id)
                    node_id, latency_ms, jitter_ms, packet_loss_pct, cpu_usage_pct, memory_usage_pct
                  FROM ts_node_metric
                  ORDER BY node_id, metric_time DESC
                )
                SELECT
                  AVG(GREATEST(0, 100 - packet_loss_pct * 20 - jitter_ms * 2 - latency_ms * 0.25)) AS network_score,
                  AVG(GREATEST(0, 100 - cpu_usage_pct * 0.3 - memory_usage_pct * 0.2)) AS system_score,
                  MAX(packet_loss_pct) AS max_packet_loss
                FROM latest
            """) or {}
        network_score = round(_num(row.get("network_score"), 82), 1)
        system_score = round(_num(row.get("system_score"), 80), 1)
        overall = round(network_score * 0.45 + system_score * 0.35 + 82 * 0.20, 1)
        return {
            "title": "安全调度依据",
            "source": "database",
            "grade": "A" if overall >= 90 else "B+" if overall >= 80 else "B" if overall >= 70 else "C",
            "scores": {"network": network_score, "system": system_score, "algorithm": 82, "data": 86},
            "dominantRisk": "链路波动" if _num(row.get("max_packet_loss")) >= 1 else "低风险",
            "dispatchAdvice": "安全评分纳入硬过滤与多目标评分；低可信或链路波动节点不作为首选。",
            "updated_at": _ts(),
        }
    except Exception:
        return {
            "title": "安全调度依据",
            "source": "fallback",
            "grade": "B+",
            "scores": {"network": 82, "system": 80, "algorithm": 82, "data": 86},
            "dominantRisk": "训练监控告警",
            "dispatchAdvice": "安全评分纳入硬过滤与多目标评分。",
            "updated_at": _ts(),
        }


def _task_requirement(conn: Connection, task_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    task = _first(conn, """
        SELECT task_id, COALESCE(task_name, name, task_id) AS name, status, priority,
               priority_level, progress, task_type, business_type, source_region_id,
               source_system, tenant_id, assigned_node_id, submit_time, start_time, end_time
        FROM fact_task
        WHERE task_id = :task_id
        LIMIT 1
    """, {"task_id": task_id})
    req = _first(conn, """
        SELECT
          COALESCE(cpu_requested, required_cpu_cores, 8) AS cpu,
          COALESCE(memory_requested, required_memory_gb, 32) AS memory,
          COALESCE(gpu_requested, required_gpu_count, 0) AS gpu,
          COALESCE(storage_requested, required_disk_gb, 0) AS storage,
          COALESCE(bandwidth_requested, required_bandwidth_gbps, 0) AS bandwidth,
          estimated_duration_sec,
          affinity_region_id,
          anti_affinity_node_id,
          gpu_type_requested
        FROM fact_task_requirement
        WHERE task_id = :task_id
        LIMIT 1
    """, {"task_id": task_id})
    if not task:
        task = {
            "task_id": task_id,
            "name": task_id,
            "status": "pending",
            "priority": "medium",
            "priority_level": 3,
            "progress": 0,
            "task_type": "training",
            "assigned_node_id": None,
        }
    if not req:
        req = {"cpu": 8, "memory": 32, "gpu": 0, "storage": 0, "bandwidth": 0, "estimated_duration_sec": 3600}
    return task, req


def _candidate_nodes(conn: Connection) -> list[dict[str, Any]]:
    rows = _rows(conn, """
        WITH latest AS (
          SELECT DISTINCT ON (node_id) *
          FROM ts_node_metric
          ORDER BY node_id, metric_time DESC
        ),
        recent AS (
          SELECT node_id, AVG(cpu_usage_pct) AS avg_cpu
          FROM ts_node_metric
          WHERE metric_time >= NOW() - INTERVAL '30 minutes'
          GROUP BY node_id
        ),
        locks AS (
          SELECT target_node_id, SUM(cpu_locked) AS locked_cpu, SUM(memory_locked) AS locked_memory,
                 SUM(gpu_locked) AS locked_gpu
          FROM fact_task_resource_lock
          WHERE lock_status = 'active'
          GROUP BY target_node_id
        )
        SELECT
          n.node_id, n.node_name, n.region_id, n.layer, n.status,
          n.cpu_cores, n.gpu_count, n.memory_total_gb,
          COALESCE(n.bandwidth_total_gbps, n.network_bandwidth_mbps / 1000.0, 10) AS bandwidth_total_gbps,
          COALESCE(n.running_tasks, 0) AS running_tasks,
          COALESCE(n.health_score, n.task_success_rate * 100, 85) AS trust_score,
          COALESCE(m.cpu_usage_pct, 50) AS cpu_usage_pct,
          COALESCE(m.memory_usage_pct, m.cpu_usage_pct, 50) AS memory_usage_pct,
          COALESCE(m.gpu_usage_pct, m.cpu_usage_pct, 50) AS gpu_usage_pct,
          COALESCE(m.latency_ms, n.avg_response_time, 30) AS latency_ms,
          COALESCE(m.jitter_ms, 2) AS jitter_ms,
          COALESCE(m.packet_loss_pct, 0) AS packet_loss_pct,
          COALESCE(recent.avg_cpu, m.cpu_usage_pct, 50) AS recent_cpu_avg,
          COALESCE(lock.locked_cpu, 0) AS locked_cpu,
          COALESCE(lock.locked_memory, 0) AS locked_memory,
          COALESCE(lock.locked_gpu, 0) AS locked_gpu
        FROM dim_compute_node n
        LEFT JOIN latest m ON m.node_id = n.node_id
        LEFT JOIN recent ON recent.node_id = n.node_id
        LEFT JOIN locks lock ON lock.target_node_id = n.node_id
        ORDER BY CASE WHEN n.status = 'online' THEN 0 ELSE 1 END, COALESCE(m.cpu_usage_pct, 50)
        LIMIT 40
    """)
    candidates = []
    for r in rows:
        cpu_cores = _num(r["cpu_cores"])
        memory_gb = _num(r["memory_total_gb"])
        gpu_count = _num(r["gpu_count"])
        locked_cpu_pct = (_num(r["locked_cpu"]) / cpu_cores * 100) if cpu_cores else 0
        locked_memory_pct = (_num(r["locked_memory"]) / memory_gb * 100) if memory_gb else 0
        locked_gpu_pct = (_num(r["locked_gpu"]) / gpu_count * 100) if gpu_count else 0
        candidates.append({
            "node_id": r["node_id"],
            "node_name": r["node_name"],
            "region_id": r["region_id"],
            "layer": r["layer"],
            "status": r["status"],
            "cpu_cores": cpu_cores,
            "gpu_count": gpu_count,
            "memory_gb": memory_gb,
            "bandwidth_total_gbps": _num(r["bandwidth_total_gbps"], 10),
            "running_tasks": _int(r["running_tasks"]),
            "trust_score": _num(r["trust_score"], 85),
            "health_score": _num(r["trust_score"], 85),
            "cpu_usage_pct": min(100, _num(r["cpu_usage_pct"], 50) + locked_cpu_pct),
            "memory_usage_pct": min(100, _num(r["memory_usage_pct"], 50) + locked_memory_pct),
            "gpu_usage_pct": min(100, _num(r["gpu_usage_pct"], 50) + locked_gpu_pct),
            "latency_ms": _num(r["latency_ms"], 30),
            "jitter_ms": _num(r["jitter_ms"], 2),
            "packet_loss_pct": _num(r["packet_loss_pct"], 0),
            "recent_cpu_avg": _num(r["recent_cpu_avg"], 50),
        })
    return candidates or get_mock_candidates()


def _persist_candidate_scores(conn: Connection, task_id: str, evaluation: dict[str, Any]) -> None:
    ensure_scheduler_tables(conn)
    conn.execute(text("DELETE FROM fact_task_candidate_score WHERE task_id = :task_id"), {"task_id": task_id})
    for item in evaluation.get("scored_candidates", [])[:12]:
        conn.execute(text("""
            INSERT INTO fact_task_candidate_score (
              task_id, candidate_node_id, score_total, score_resource_fit,
              score_latency, score_bandwidth, score_balance, score_risk,
              rank_no, source_type
            )
            VALUES (:task_id, :node_id, :total, :resource, :latency, :bandwidth, :balance, :risk, :rank_no, 'scheduler_context')
        """), {
            "task_id": task_id,
            "node_id": item.get("node_id"),
            "total": item.get("total_score"),
            "resource": item.get("resource_fit_score"),
            "latency": item.get("network_score"),
            "bandwidth": item.get("network_score"),
            "balance": item.get("pressure_score"),
            "risk": item.get("risk_penalty"),
            "rank_no": item.get("rank_no"),
        })


def _schedule_logs(conn: Connection, task_id: str) -> list[dict[str, Any]]:
    db_logs = []
    try:
        db_logs = _rows(conn, """
            SELECT log_time, phase, message, severity
            FROM fact_schedule_log
            WHERE task_id = :task_id
            ORDER BY log_time ASC
            LIMIT 40
        """, {"task_id": task_id})
    except Exception:
        db_logs = []
    logs = [
        {
            "time": row["log_time"].strftime("%H:%M:%S") if hasattr(row.get("log_time"), "strftime") else str(row.get("log_time") or ""),
            "phase": row.get("phase") or "监控",
            "message": row.get("message") or "",
            "severity": row.get("severity") or "info",
        }
        for row in db_logs
    ]
    logs.extend({"time": item.get("timestamp", ""), "phase": item.get("action", ""), "message": item.get("detail", ""), "severity": "info"} for item in get_task_timeline(task_id))
    return logs[-40:]


def get_task_schedule_context(task_id: str) -> dict[str, Any]:
    resource_insights = get_resource_sensing_insights()
    prediction_insights = get_prediction_scheduling_insights()
    security_basis = get_security_scheduling_basis()
    try:
        engine = get_computing_network_engine()
        with engine.begin() as conn:
            ensure_scheduler_tables(conn)
            task, req = _task_requirement(conn, task_id)
            candidates = _candidate_nodes(conn)
            task_req = {
                "cpu": _num(req.get("cpu"), 8),
                "memory": _num(req.get("memory"), 32),
                "gpu": _num(req.get("gpu"), 0),
                "task_type": task.get("task_type") or "training",
                "priority": task.get("priority") or "medium",
                "priority_level": _int(task.get("priority_level"), 3),
                "affinity_region_id": req.get("affinity_region_id") or task.get("source_region_id"),
                "anti_affinity_node_id": req.get("anti_affinity_node_id"),
                "source_system": task.get("source_system"),
                "business_type": task.get("business_type"),
            }
            evaluation = evaluate_candidates(candidates, task_req)
            _persist_candidate_scores(conn, task_id, evaluation)
            selected = evaluation.get("selected_node") or {}
            assignment = _first(conn, """
                SELECT a.*, n.node_name
                FROM fact_task_assignment a
                LEFT JOIN dim_compute_node n ON n.node_id = a.target_node_id
                WHERE a.task_id = :task_id
                ORDER BY a.assigned_at DESC
                LIMIT 1
            """, {"task_id": task_id})
            locks = _rows(conn, """
                SELECT lock_id, target_node_id, cpu_locked, memory_locked, gpu_locked,
                       bandwidth_locked, storage_locked, lock_status, locked_at, expected_release_at, released_at
                FROM fact_task_resource_lock
                WHERE task_id = :task_id
                ORDER BY locked_at DESC
            """, {"task_id": task_id})
            target_node_id = str((assignment or {}).get("target_node_id") or task.get("assigned_node_id") or selected.get("node_id") or "")
            target_node_name = str((assignment or {}).get("node_name") or selected.get("node_name") or target_node_id or "")
            logs = _schedule_logs(conn, task_id)
            status = task.get("status") or "pending"
            stage = _stage_from_task_status(status)
            progress = _progress_from_task_status(status, task.get("progress"))
            return {
                "task": {
                    "id": task_id,
                    "name": task.get("name") or task_id,
                    "status": status,
                    "progress": progress,
                    "priority": task.get("priority") or "medium",
                    "taskType": task.get("task_type") or "training",
                    "targetNodeId": target_node_id,
                    "targetNodeName": target_node_name,
                    "sourceRegionId": task.get("source_region_id"),
                    "sourceSystem": task.get("source_system"),
                    "businessType": task.get("business_type"),
                },
                "requirements": {
                    "cpu": task_req["cpu"],
                    "memory": task_req["memory"],
                    "gpu": task_req["gpu"],
                    "storage": _num(req.get("storage"), 0),
                    "bandwidth": _num(req.get("bandwidth"), 0),
                    "estimatedDurationSec": _int(req.get("estimated_duration_sec"), 3600),
                    "affinityRegionId": task_req.get("affinity_region_id"),
                    "antiAffinityNodeId": task_req.get("anti_affinity_node_id"),
                },
                "stage": stage,
                "targetNodeId": target_node_id,
                "targetNodeName": target_node_name,
                "selectedReason": evaluation.get("decision_basis") or "调度中枢根据资源、预测、安全与网络评分生成推荐。",
                "candidates": [
                    {
                        "nodeId": item["node_id"],
                        "nodeName": item["node_name"],
                        "rankNo": item.get("rank_no", index + 1),
                        "scoreTotal": item.get("total_score", 0),
                        "resourceFit": item.get("resource_fit_score", item.get("match_score", 0)),
                        "latency": item.get("network_score", 0),
                        "bandwidth": item.get("network_score", 0),
                        "balance": item.get("pressure_score", item.get("load_score", 0)),
                        "riskPenalty": item.get("risk_penalty", 0),
                    }
                    for index, item in enumerate(evaluation.get("scored_candidates", [])[:8])
                ],
                "logs": logs,
                "lifecycle": logs,
                "summaries": {
                    "predictionPressure": prediction_insights,
                    "resourceDispatch": resource_insights,
                    "securityBasis": security_basis,
                },
                "predictionPressureSummary": prediction_insights,
                "resourceDispatchSummary": resource_insights,
                "securitySummary": {
                    "grade": security_basis.get("grade", "B+"),
                    "algorithmScore": security_basis.get("scores", {}).get("algorithm", 82),
                    "source": security_basis.get("source", "database"),
                },
                "securityBasis": security_basis,
                "strategySummary": {
                    "algorithm": "Bulyan",
                    "mode": "multi_objective",
                    "reason": "根据任务安全等级、节点可信度和梯度异常风险选择鲁棒聚合策略。",
                },
                "evaluation": evaluation,
                "reservationPlan": evaluation.get("reservation_plan", []),
                "resourceLocks": [
                    {
                        "lockId": row.get("lock_id"),
                        "nodeId": row.get("target_node_id"),
                        "cpu": _num(row.get("cpu_locked")),
                        "memory": _num(row.get("memory_locked")),
                        "gpu": _num(row.get("gpu_locked")),
                        "bandwidth": _num(row.get("bandwidth_locked")),
                        "storage": _num(row.get("storage_locked")),
                        "status": row.get("lock_status"),
                        "lockedAt": row.get("locked_at").isoformat() if hasattr(row.get("locked_at"), "isoformat") else None,
                        "expectedReleaseAt": row.get("expected_release_at").isoformat() if hasattr(row.get("expected_release_at"), "isoformat") else None,
                        "releasedAt": row.get("released_at").isoformat() if hasattr(row.get("released_at"), "isoformat") else None,
                    }
                    for row in locks
                ],
                "updated_at": _ts(),
            }
    except Exception:
        evaluation = evaluate_candidates(get_mock_candidates(), {"cpu": 8, "memory": 32, "gpu": 1, "priority": "medium"})
        selected = evaluation.get("selected_node") or {}
        return {
            "task": {"id": task_id, "name": task_id, "status": "pending", "progress": 0, "targetNodeId": selected.get("node_id"), "targetNodeName": selected.get("node_name")},
            "requirements": {"cpu": 8, "memory": 32, "gpu": 1, "estimatedDurationSec": 3600},
            "stage": "决策",
            "targetNodeId": selected.get("node_id"),
            "targetNodeName": selected.get("node_name"),
            "selectedReason": evaluation.get("decision_basis", ""),
            "candidates": [],
            "logs": [],
            "lifecycle": [],
            "summaries": {"predictionPressure": prediction_insights, "resourceDispatch": resource_insights, "securityBasis": security_basis},
            "predictionPressureSummary": prediction_insights,
            "resourceDispatchSummary": resource_insights,
            "securitySummary": {"grade": security_basis.get("grade", "B+"), "algorithmScore": 82, "source": "fallback"},
            "securityBasis": security_basis,
            "strategySummary": {"algorithm": "Bulyan", "mode": "multi_objective", "reason": "fallback 策略"},
            "evaluation": evaluation,
            "reservationPlan": evaluation.get("reservation_plan", []),
            "resourceLocks": [],
            "updated_at": _ts(),
        }


def create_resource_lock_for_task(task_id: str, target_node_id: str) -> None:
    engine = get_computing_network_engine()
    with engine.begin() as conn:
        ensure_scheduler_tables(conn)
        _task, req = _task_requirement(conn, task_id)
        estimated = _int(req.get("estimated_duration_sec"), 3600)
        demo_seconds = max(45, min(900, int((estimated / 3600) * 60)))
        conn.execute(text("""
            UPDATE fact_task_resource_lock
            SET lock_status = 'released', released_at = NOW()
            WHERE task_id = :task_id AND lock_status = 'active'
        """), {"task_id": task_id})
        conn.execute(text("""
            INSERT INTO fact_task_resource_lock (
              task_id, target_node_id, cpu_locked, memory_locked, gpu_locked,
              bandwidth_locked, storage_locked, lock_status, locked_at, expected_release_at
            )
            VALUES (
              :task_id, :node_id, :cpu, :memory, :gpu,
              :bandwidth, :storage, 'active', NOW(), NOW() + (:demo_seconds * INTERVAL '1 second')
            )
        """), {
            "task_id": task_id,
            "node_id": target_node_id,
            "cpu": _num(req.get("cpu"), 8),
            "memory": _num(req.get("memory"), 32),
            "gpu": _num(req.get("gpu"), 0),
            "bandwidth": _num(req.get("bandwidth"), 0),
            "storage": _num(req.get("storage"), 0),
            "demo_seconds": demo_seconds,
        })
