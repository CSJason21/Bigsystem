from __future__ import annotations

import json
import math
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping, Sequence

from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session


DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "prediction_allocation"
DATA_FILES = {
    "manifest": "dataset_manifest.json",
    "daily_prediction": "daily_prediction.json",
    "monthly_prediction": "monthly_prediction.json",
    "allocation_results": "allocation_results.json",
    "strategy_comparison": "strategy_comparison.json",
    "nodes": "nodes.json",
    "nodes_overview": "nodes_overview.json",
    "node_dashboards": "node_dashboards.json",
    "node_histories": "node_histories.json",
    "traffic_sankey": "traffic_sankey.json",
    "traffic_lines": "traffic_lines.json",
}
NODE_METRIC_TABLE_CANDIDATES = ("ts_node_metric", "ts_node_resource_metric_1m")
FORECAST_METRIC_ALIASES = {
    "cpu": ("cpu",),
    "memory": ("memory",),
    "bandwidth": ("bandwidth", "network"),
    "gpu": ("gpu",),
    "storage": ("storage", "disk"),
}


def _read_json(file_name: str) -> Any:
    file_path = DATA_DIR / file_name
    with file_path.open("r", encoding="utf-8") as file:
        return json.load(file)


def load_prediction_allocation_dataset() -> dict[str, Any]:
    return {key: _read_json(file_name) for key, file_name in DATA_FILES.items()}


def _dataset_payload(key: str) -> Any:
    return load_prediction_allocation_dataset()[key]


def _row_value(row: Mapping[str, Any] | None, *names: str, default: Any = None) -> Any:
    if row is None:
        return default

    for name in names:
        if name in row and row[name] is not None:
            return row[name]

    return default


def _to_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default

    try:
        number = float(value)
    except (TypeError, ValueError):
        return default

    if math.isnan(number) or math.isinf(number):
        return default

    return round(number, 1)


def _to_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default

    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _timestamp_to_unix(value: Any, default: int = 0) -> int:
    if value is None:
        return default

    if isinstance(value, (int, float)):
        return int(value)

    if isinstance(value, datetime):
        return int(value.timestamp())

    if isinstance(value, str):
        normalized = value.strip()
        if not normalized:
            return default

        try:
            return int(float(normalized))
        except ValueError:
            pass

        normalized = normalized.replace("Z", "+00:00")
        try:
            return int(datetime.fromisoformat(normalized).timestamp())
        except ValueError:
            return default

    return default


def _format_metric_label(value: Any) -> str:
    if isinstance(value, datetime):
        return value.strftime("%H:%M")

    if isinstance(value, str):
        normalized = value.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized).strftime("%H:%M")
        except ValueError:
            return value

    return str(value)


def _estimate_gpu_memory_per_card(gpu_model: str | None) -> float:
    if not gpu_model:
        return 16.0

    normalized = gpu_model.upper()
    if "H100" in normalized or "A100" in normalized or "A800" in normalized:
        return 80.0
    if "V100M32" in normalized:
        return 32.0
    if "V100" in normalized:
        return 16.0
    if "L40" in normalized:
        return 48.0
    if "P100" in normalized:
        return 16.0
    if "T4" in normalized:
        return 16.0
    if "G2" in normalized or "G3" in normalized:
        return 12.0
    return 16.0


def _derive_cpu_breakdown(total_usage: float) -> tuple[float, float]:
    cpu_system = round(total_usage * 0.44, 1)
    cpu_user = round(max(total_usage - cpu_system, 0.0), 1)
    return cpu_system, cpu_user


def _inspector_objects(session: Session) -> tuple[set[str], set[str]]:
    inspector = inspect(session.bind)
    return set(inspector.get_table_names()), set(inspector.get_view_names())


def _resolve_db_object(session: Session, candidates: Sequence[str]) -> str | None:
    tables, views = _inspector_objects(session)
    for candidate in candidates:
        if candidate in tables or candidate in views:
            return candidate
    return None


def _get_object_columns(session: Session, name: str) -> set[str]:
    inspector = inspect(session.bind)
    try:
        return {column["name"] for column in inspector.get_columns(name)}
    except SQLAlchemyError:
        return set()


def _query_rows(session: Session, sql: str, params: Mapping[str, Any] | None = None) -> list[Mapping[str, Any]]:
    result = session.execute(text(sql), params or {})
    return list(result.mappings().all())


def _query_first(session: Session, sql: str, params: Mapping[str, Any] | None = None) -> Mapping[str, Any] | None:
    result = session.execute(text(sql), params or {})
    return result.mappings().first()


def _region_level_to_view_kind(region_level: str | None) -> str:
    if region_level == "hub":
        return "region"
    if region_level in ("province", "city"):
        return "province"
    return "global"


def _region_view_id(region_id: str, region_level: str | None) -> str:
    prefix = "region" if region_level == "hub" else "prov" if region_level in ("province", "city") else "region"
    return f"{prefix}_{region_id}"


def _region_id_from_view_id(view_id: str) -> str | None:
    if view_id.startswith("region_"):
        return view_id.removeprefix("region_")
    if view_id.startswith("prov_"):
        return view_id.removeprefix("prov_")
    return None


def _view_region_id(session: Session, view_id: str) -> str | None:
    if not _resolve_db_object(session, ("dim_topology_view",)):
        region_id = _region_id_from_view_id(view_id)
        if not region_id or not _resolve_db_object(session, ("dim_region",)):
            return None
        row = _query_first(
            session,
            "SELECT region_id FROM dim_region WHERE region_id = :region_id AND is_active = TRUE",
            {"region_id": region_id},
        )
        return str(row["region_id"]) if row and row.get("region_id") else None

    row = _query_first(
        session,
        "SELECT region_id FROM dim_topology_view WHERE view_id = :view_id",
        {"view_id": view_id},
    )
    return str(row["region_id"]) if row and row.get("region_id") else None


def _region_descendants(session: Session, region_id: str | None) -> list[str]:
    if not region_id:
        return []

    try:
        rows = _query_rows(
            session,
            """
            WITH RECURSIVE region_tree AS (
              SELECT region_id FROM dim_region WHERE region_id = :region_id
              UNION ALL
              SELECT r.region_id
              FROM dim_region r
              JOIN region_tree t ON r.parent_region_id = t.region_id
            )
            SELECT region_id FROM region_tree
            """,
            {"region_id": region_id},
        )
    except SQLAlchemyError:
        return [region_id]

    return [str(row["region_id"]) for row in rows if row.get("region_id")]


def _view_node_ids(session: Session, view_id: str) -> list[str]:
    if view_id == "node":
        if not _resolve_db_object(session, ("dim_topology_view",)):
            rows = _query_rows(session, "SELECT node_id FROM dim_compute_node ORDER BY node_id")
            return [str(row["node_id"]) for row in rows if row.get("node_id")]
        row = _query_first(
            session,
            "SELECT node_id FROM dim_topology_view WHERE view_id = 'node' AND node_id IS NOT NULL",
        )
        return [str(row["node_id"])] if row and row.get("node_id") else []

    region_id = _view_region_id(session, view_id)
    region_ids = _region_descendants(session, region_id)
    if not region_ids:
        rows = _query_rows(session, "SELECT node_id FROM dim_compute_node ORDER BY node_id")
    else:
        rows = _query_rows(
            session,
            "SELECT node_id FROM dim_compute_node WHERE region_id = ANY(:region_ids) ORDER BY node_id",
            {"region_ids": region_ids},
        )
    return [str(row["node_id"]) for row in rows if row.get("node_id")]


def _runtime_status_from_row(row: Mapping[str, Any]) -> str:
    return str(_row_value(row, "runtime_status", "display_status", "node_status", "status", default="online"))


def _topology_display_type(vertex_type: str | None) -> str:
    if vertex_type in ("control", "cloud"):
        return "management"
    if vertex_type == "edge":
        return "edge"
    if vertex_type in ("service", "client"):
        return "sensing"
    return "compute"


def _fallback_topology_layout(rows: Sequence[Mapping[str, Any]]) -> dict[str, tuple[float, float, float]]:
    levels: dict[int, list[Mapping[str, Any]]] = {0: [], 1: [], 2: []}
    for row in rows:
        vertex_type = row.get("vertex_type")
        if vertex_type in ("control", "cloud"):
            levels[0].append(row)
        elif vertex_type == "edge":
            levels[2].append(row)
        else:
            levels[1].append(row)

    layout: dict[str, tuple[float, float, float]] = {}
    row_height = 135
    for level, level_rows in levels.items():
        if not level_rows:
            continue
        columns = min(max(math.ceil(math.sqrt(len(level_rows) * 2)), 1), 8 if level == 1 else 6)
        spacing_x = 170 if level == 1 else 185
        start_y = 70 + level * 250
        for index, row in enumerate(level_rows):
            row_index = index // columns
            col_index = index % columns
            row_count = min(columns, len(level_rows) - row_index * columns)
            x = (col_index - (row_count - 1) / 2) * spacing_x
            y = start_y + row_index * row_height
            size = 118 if level == 0 else 68 if level == 1 else 54
            layout[str(row["vertex_id"])] = (x, y, size)
    return layout


def _metric_unix_now(rows: Sequence[Mapping[str, Any]]) -> int:
    values = [
        _timestamp_to_unix(
            _row_value(row, "updated_at", "latest_metric_time", "metric_time", "run_time", "assigned_at", "log_time"),
            0,
        )
        for row in rows
    ]
    return max(values, default=0) or _timestamp_to_unix(datetime.utcnow())


def _get_forecast_series_from_db(
    session: Session,
    period: str,
    metric_names: Sequence[str],
    labels_formatter: Any,
) -> dict[str, Any] | None:
    if not _resolve_db_object(session, ("fact_forecast_run",)) or not _resolve_db_object(session, ("ts_forecast_point",)):
        return None

    payload: dict[str, Any] = {"period": period}
    labels: list[str] | None = None
    updated_values: list[int] = []

    for metric_name in metric_names:
        aliases = FORECAST_METRIC_ALIASES.get(metric_name, (metric_name,))
        run = _query_first(
            session,
            """
            SELECT forecast_run_id, run_time
            FROM fact_forecast_run
            WHERE metric_name = ANY(:metric_names)
            ORDER BY run_time DESC, forecast_run_id DESC
            LIMIT 1
            """,
            {"metric_names": list(aliases)},
        )
        if not run:
            continue

        rows = _query_rows(
            session,
            """
            SELECT point_time, actual_value, predicted_value, lower_bound, upper_bound, point_role
            FROM ts_forecast_point
            WHERE forecast_run_id = :run_id
            ORDER BY point_time
            """,
            {"run_id": run["forecast_run_id"]},
        )
        if not rows:
            continue

        if labels is None:
            labels = [labels_formatter(row["point_time"]) for row in rows]

        actual = [_to_float(row.get("actual_value"), 0.0) for row in rows]
        predicted = [_to_float(row.get("predicted_value"), 0.0) for row in rows]
        payload[f"{metric_name}_actual"] = actual
        if metric_name == "bandwidth":
            payload["bandwidth_actual_mbps"] = [round(value * 1000, 1) for value in actual]
            payload["bandwidth_predicted_mbps"] = [round(value * 1000, 1) for value in predicted]
        elif metric_name == "storage":
            payload["storage_predicted"] = predicted
        else:
            payload[f"{metric_name}_predicted"] = predicted
        updated_values.append(_timestamp_to_unix(run.get("run_time")))

    if labels is None:
        return None

    payload["labels"] = labels
    payload["updated_at"] = max(updated_values, default=_timestamp_to_unix(datetime.utcnow()))
    return payload


def _get_daily_prediction_from_db(session: Session) -> dict[str, Any] | None:
    payload = _get_forecast_series_from_db(
        session,
        "daily",
        ("cpu", "gpu", "memory", "bandwidth"),
        lambda value: _format_metric_label(value),
    )
    if not payload:
        return None

    cpu_predicted = payload.get("cpu_predicted", [])
    payload["running_tasks"] = [max(0, round(value / 6)) for value in cpu_predicted]
    payload.setdefault("cpu_actual", [0 for _ in payload["labels"]])
    return payload


def _get_monthly_prediction_from_db(session: Session) -> dict[str, Any] | None:
    payload = _get_forecast_series_from_db(
        session,
        "monthly",
        ("gpu", "storage", "bandwidth", "memory"),
        lambda value: value.strftime("%m-%d") if isinstance(value, datetime) else str(value),
    )
    if not payload:
        return None

    gpu_values = payload.get("gpu_predicted", [])
    payload.setdefault("storage_predicted", [round(value * 0.7, 1) for value in gpu_values])
    payload["avg_wait_time_sec"] = [round(20 + value * 0.35, 1) for value in gpu_values]
    return payload


def _get_allocation_results_from_db(session: Session) -> dict[str, Any] | None:
    if not _resolve_db_object(session, ("fact_task_assignment",)):
        return None

    rows = _query_rows(
        session,
        """
        SELECT
          a.assignment_id,
          a.task_id,
          t.task_name,
          t.task_type,
          n.node_name,
          n.node_id,
          n.ip_address,
          n.gpu_type,
          a.match_score,
          a.estimated_latency_ms,
          a.allocated_cpu_cores,
          a.allocated_memory_gb,
          a.allocated_gpu_count,
          a.allocated_gpu_pct,
          a.allocated_bandwidth_gbps,
          a.allocated_disk_gb,
          a.assigned_at
        FROM fact_task_assignment a
        JOIN fact_task t ON t.task_id = a.task_id
        JOIN dim_compute_node n ON n.node_id = a.target_node_id
        ORDER BY a.assigned_at DESC
        LIMIT 20
        """,
    )
    if not rows:
        return None

    return {
        "results": [
            {
                "id": str(row["assignment_id"]),
                "task": row["task_name"],
                "node": row["node_name"],
                "cpu": _to_float(row.get("allocated_cpu_cores")),
                "memory": _to_float(row.get("allocated_memory_gb")),
                "gpu": _to_float(row.get("allocated_gpu_pct")),
                "score": _to_float(row.get("match_score")),
                "job_id": row["task_id"],
                "task_id": row["task_id"],
                "target_node_id": row["node_id"],
                "target_ip": row["ip_address"],
                "qos": "标准SLA",
                "gpu_type": row["gpu_type"],
                "allocated_cpu": _to_float(row.get("allocated_cpu_cores")),
                "allocated_gpu": _to_float(row.get("allocated_gpu_pct")),
                "allocated_memory_gb": _to_float(row.get("allocated_memory_gb")),
                "allocated_bandwidth_mbps": round(_to_float(row.get("allocated_bandwidth_gbps")) * 1000, 1),
                "allocated_storage_gb": _to_float(row.get("allocated_disk_gb")),
                "wait_time_sec": 18,
                "estimated_finish_time_sec": 1200,
                "load_balance_score": _to_float(row.get("match_score")),
                "queue_level": "normal",
            }
            for row in rows
        ],
        "updated_at": _metric_unix_now(rows),
    }


def _get_perspectives_from_db(session: Session) -> dict[str, Any] | None:
    if not _resolve_db_object(session, ("dim_topology_view",)):
        if not _resolve_db_object(session, ("dim_region",)) or not _resolve_db_object(session, ("dim_compute_node",)):
            return None

        region_rows = _query_rows(
            session,
            """
            SELECT region_id, region_name, region_level, parent_region_id, display_order
            FROM dim_region
            WHERE is_active = TRUE
              AND region_level IN ('country','hub','province')
            ORDER BY
              CASE region_level WHEN 'country' THEN 1 WHEN 'hub' THEN 2 WHEN 'province' THEN 3 ELSE 9 END,
              display_order,
              region_id
            """,
        )
        if not region_rows:
            return None

        node_ids = _view_node_ids(session, "global")
        perspectives: list[dict[str, Any]] = [
            {
                "value": "global",
                "label": "全国算力网络",
                "kind": "global",
                "region_id": "china",
                "node_id": None,
                "nodeIds": node_ids,
                "is_default": True,
            }
        ]
        for row in region_rows:
            if row.get("region_level") == "country":
                continue
            view_id = _region_view_id(str(row["region_id"]), row.get("region_level"))
            view_kind = _region_level_to_view_kind(row.get("region_level"))
            suffix = "枢纽" if view_kind == "region" else "省级节点"
            perspectives.append(
                {
                    "value": view_id,
                    "label": f"{row['region_name']}{suffix}",
                    "kind": view_kind,
                    "region_id": row["region_id"],
                    "node_id": None,
                    "nodeIds": _view_node_ids(session, view_id),
                    "is_default": False,
                }
            )

        first_node = node_ids[0] if node_ids else None
        perspectives.append(
            {
                "value": "node",
                "label": "单节点监控",
                "kind": "node",
                "region_id": None,
                "node_id": first_node,
                "nodeIds": node_ids,
                "is_default": False,
            }
        )

        return {"perspectives": perspectives, "updated_at": _timestamp_to_unix(datetime.utcnow())}

    rows = _query_rows(
        session,
        """
        SELECT view_id, view_name, view_kind, region_id, node_id, is_default
        FROM dim_topology_view
        WHERE is_active = TRUE
        ORDER BY
          CASE view_kind WHEN 'global' THEN 1 WHEN 'region' THEN 2 WHEN 'province' THEN 3 WHEN 'node' THEN 4 ELSE 9 END,
          view_id
        """,
    )
    if not rows:
        return None

    return {
        "perspectives": [
            {
                "value": row["view_id"],
                "label": row["view_name"],
                "kind": row["view_kind"],
                "region_id": row["region_id"],
                "node_id": row["node_id"],
                "nodeIds": _view_node_ids(session, str(row["view_id"])),
                "is_default": bool(row["is_default"]),
            }
            for row in rows
        ],
        "updated_at": _timestamp_to_unix(datetime.utcnow()),
    }


def _get_kpi_from_db(session: Session, view_id: str) -> dict[str, Any] | None:
    if not _resolve_db_object(session, ("vw_node_runtime_snapshot",)):
        return None

    node_ids = _view_node_ids(session, view_id)
    if not node_ids:
        return None

    rows = _query_rows(
        session,
        "SELECT * FROM vw_node_runtime_snapshot WHERE node_id = ANY(:node_ids)",
        {"node_ids": node_ids},
    )
    if not rows:
        return None

    cpu_values = [_to_float(row.get("cpu_percent")) for row in rows]
    avg_cpu = sum(cpu_values) / max(len(cpu_values), 1)
    load_std = math.sqrt(sum((value - avg_cpu) ** 2 for value in cpu_values) / max(len(cpu_values), 1))
    avg_delay = sum(_to_float(row.get("latency_ms")) for row in rows) / max(len(rows), 1)
    avg_bandwidth = sum(_to_float(row.get("bandwidth_usage_gbps")) for row in rows) / max(len(rows), 1)
    avg_gpu = sum(_to_float(row.get("gpu_percent")) for row in rows) / max(len(rows), 1)
    total_gpu_memory = sum(
        _to_int(row.get("gpu_count")) * _estimate_gpu_memory_per_card(row.get("gpu_type"))
        for row in rows
    )
    completed = None
    if _resolve_db_object(session, ("fact_task",)):
        completed = _query_first(session, "SELECT COUNT(*) AS cnt FROM fact_task WHERE status IN ('completed','running')")

    return {
        "avgDelay": round(avg_delay, 1),
        "delayDelta": -1.2,
        "loadStd": round(load_std, 2),
        "loadStdDelta": -0.16,
        "successTasks": _to_int(completed.get("cnt") if completed else None, 0),
        "successTasksDelta": 24,
        "avgBandwidth": round(avg_bandwidth, 1),
        "avgGpuUsage": round(avg_gpu, 1),
        "totalGpuMemory": round(total_gpu_memory, 1),
        "updated_at": _metric_unix_now(rows),
    }


def _get_top_load_from_db(session: Session, view_id: str) -> dict[str, Any] | None:
    if not _resolve_db_object(session, ("vw_node_runtime_snapshot",)):
        return None

    node_ids = _view_node_ids(session, view_id)
    if not node_ids:
        return None

    if _resolve_db_object(session, ("fact_topology_runtime_state",)):
        sql = """
            SELECT
              s.node_id,
              s.node_name,
              s.cpu_percent,
              COALESCE(r.predicted_load_pct_10m, s.cpu_percent + 4) AS predicted_load
            FROM vw_node_runtime_snapshot s
            LEFT JOIN LATERAL (
              SELECT predicted_load_pct_10m
              FROM fact_topology_runtime_state r
              WHERE r.vertex_id = s.node_id
              ORDER BY snapshot_time DESC
              LIMIT 1
            ) r ON TRUE
            WHERE s.node_id = ANY(:node_ids)
            ORDER BY s.cpu_percent DESC
            LIMIT 5
        """
    else:
        sql = """
            SELECT
              s.node_id,
              s.node_name,
              s.cpu_percent,
              LEAST(100, COALESCE(s.cpu_percent, 0) + 4) AS predicted_load
            FROM vw_node_runtime_snapshot s
            WHERE s.node_id = ANY(:node_ids)
            ORDER BY s.cpu_percent DESC
            LIMIT 5
        """

    rows = _query_rows(session, sql, {"node_ids": node_ids})
    if not rows:
        return None

    return {
        "items": [
            {"name": row["node_name"], "value": _to_float(row.get("cpu_percent")), "predicted": _to_float(row.get("predicted_load"))}
            for row in rows
        ],
        "updated_at": _metric_unix_now(rows),
    }


def _get_task_type_stats_from_db(session: Session, view_id: str) -> dict[str, Any] | None:
    if not _resolve_db_object(session, ("fact_task",)):
        return None

    node_ids = _view_node_ids(session, view_id)
    params: dict[str, Any] = {}
    where = ""
    if node_ids:
        where = "WHERE a.target_node_id = ANY(:node_ids)"
        params["node_ids"] = node_ids

    rows = _query_rows(
        session,
        f"""
        SELECT t.task_type AS name, COUNT(*)::float AS value
        FROM fact_task t
        LEFT JOIN fact_task_assignment a ON a.task_id = t.task_id
        {where}
        GROUP BY t.task_type
        ORDER BY value DESC, name
        """,
        params,
    )
    if not rows:
        return None

    return {
        "items": [{"name": row["name"], "value": _to_float(row.get("value"))} for row in rows],
        "updated_at": _metric_unix_now(rows),
    }


def _get_topology_view_from_db(session: Session, view_id: str) -> dict[str, Any] | None:
    if not _resolve_db_object(session, ("dim_topology_vertex",)):
        return None

    if not _resolve_db_object(session, ("dim_topology_layout",)):
        region_id = _view_region_id(session, view_id)
        region_ids = _region_descendants(session, region_id)
        nodes = _query_rows(
            session,
            """
            SELECT
              v.vertex_id,
              v.vertex_name,
              v.subtitle,
              v.vertex_type,
              v.vertex_role,
              COALESCE(v.region_id, n.region_id) AS region_id,
              v.compute_node_id,
              COALESCE(s.display_status, s.status, n.status, v.status, 'online') AS runtime_status,
              COALESCE(s.cpu_percent, CASE WHEN v.vertex_type IN ('control','cloud') THEN 45 ELSE 0 END) AS current_load_pct,
              LEAST(100, COALESCE(s.cpu_percent, CASE WHEN v.vertex_type IN ('control','cloud') THEN 45 ELSE 0 END) + 4) AS predicted_load_pct_10m,
              CASE
                WHEN COALESCE(s.display_status, s.status, n.status, v.status) = 'offline' THEN '[Offline]'
                WHEN COALESCE(s.display_status, s.status, n.status, v.status) = 'maintenance' THEN '[Maint]'
                ELSE NULL
              END AS badge_text,
              CASE
                WHEN COALESCE(s.display_status, s.status, n.status, v.status) IN ('offline','maintenance') THEN 'warning'
                WHEN COALESCE(s.cpu_percent, 0) >= 80 THEN 'risk'
                ELSE 'normal'
              END AS highlight_level,
              n.ip_address,
              n.role_name,
              n.location,
              n.provider_name,
              n.bandwidth_total_gbps,
              r.region_name
            FROM dim_topology_vertex v
            LEFT JOIN dim_compute_node n ON n.node_id = v.compute_node_id
            LEFT JOIN vw_node_runtime_snapshot s ON s.node_id = n.node_id
            LEFT JOIN dim_region r ON r.region_id = COALESCE(v.region_id, n.region_id)
            WHERE v.status IS DISTINCT FROM 'disabled'
            ORDER BY
              CASE v.vertex_type WHEN 'cloud' THEN 1 WHEN 'control' THEN 1 WHEN 'supercomputing' THEN 2 WHEN 'compute' THEN 2 WHEN 'edge' THEN 3 ELSE 4 END,
              v.vertex_name,
              v.vertex_id
            """,
        )
        if not nodes:
            return None

        all_edges = _query_rows(
            session,
            """
            SELECT source_vertex_id, target_vertex_id, edge_role, capacity_bandwidth_mbps
            FROM dim_topology_edge
            WHERE is_active = TRUE
            ORDER BY priority DESC, edge_id
            """,
        )
        if view_id != "global" and region_ids:
            control_ids = {
                str(row["vertex_id"])
                for row in nodes
                if row.get("vertex_type") in ("control", "cloud")
            }
            matched_ids = {
                str(row["vertex_id"])
                for row in nodes
                if row.get("vertex_type") not in ("control", "cloud")
                and row.get("region_id") in region_ids
            }
            included_ids = set(control_ids) | set(matched_ids)
            for edge in all_edges:
                source_id = str(edge["source_vertex_id"])
                target_id = str(edge["target_vertex_id"])
                if target_id in matched_ids and source_id not in control_ids:
                    included_ids.add(source_id)
                if source_id in matched_ids and target_id not in control_ids:
                    included_ids.add(target_id)

            nodes = [row for row in nodes if str(row["vertex_id"]) in included_ids]
            node_ids = {str(row["vertex_id"]) for row in nodes}
            edges = [
                row for row in all_edges
                if str(row["source_vertex_id"]) in node_ids and str(row["target_vertex_id"]) in node_ids
            ]
        else:
            node_ids = {str(row["vertex_id"]) for row in nodes}
            edges = [
                row for row in all_edges
                if str(row["source_vertex_id"]) in node_ids and str(row["target_vertex_id"]) in node_ids
            ]

        layout = _fallback_topology_layout(nodes)
        event_rows: list[Mapping[str, Any]] = []
        if _resolve_db_object(session, ("fact_schedule_log",)):
            event_rows = _query_rows(
                session,
                """
                SELECT vertex_id, phase, message, severity, log_time
                FROM fact_schedule_log
                ORDER BY log_time DESC
                LIMIT 5
                """,
            )

        offline_count = sum(1 for row in nodes if _runtime_status_from_row(row) in ("offline", "maintenance"))
        new_count = sum(1 for row in nodes if _runtime_status_from_row(row) == "new")

        return {
            "nodes": [
                {
                    "id": row["vertex_id"],
                    "label": row["vertex_name"],
                    "subtitle": row["subtitle"] or row["region_name"],
                    "type": _topology_display_type(row.get("vertex_type")),
                    "size": layout[str(row["vertex_id"])][2],
                    "x": layout[str(row["vertex_id"])][0],
                    "y": layout[str(row["vertex_id"])][1],
                    "currentLoad": _to_float(row.get("current_load_pct"), 0),
                    "predictedLoad": _to_float(row.get("predicted_load_pct_10m"), 0),
                    "status": _runtime_status_from_row(row),
                    "badgeText": row["badge_text"],
                    "data": {
                        "id": row["compute_node_id"] or row["vertex_id"],
                        "statusText": _runtime_status_from_row(row),
                        "role": row["role_name"] or row["vertex_role"],
                        "region": row["location"] or row["region_name"] or row["region_id"] or "--",
                        "ip": row["ip_address"] or "--",
                        "provider": row["provider_name"] or "--",
                        "bandwidth": f"{_to_float(row.get('bandwidth_total_gbps'), 0)} Gbps" if row.get("bandwidth_total_gbps") else "--",
                        "latency": "--",
                        "currentLoad": f"{_to_float(row.get('current_load_pct'), 0)}%",
                        "predictedLoad": f"{_to_float(row.get('predicted_load_pct_10m'), 0)}%",
                    },
                }
                for row in nodes
            ],
            "edges": [
                {
                    "source": row["source_vertex_id"],
                    "target": row["target_vertex_id"],
                    "kind": "predictive" if row["edge_role"] == "fallback" else "current",
                    "style": {"lineWidth": 2},
                }
                for row in edges
            ],
            "events": [
                {
                    "title": row["phase"] or "调度事件",
                    "description": row["message"],
                    "color": "red" if row["severity"] == "error" else "gold" if row["severity"] == "warning" else "blue",
                }
                for row in event_rows
            ],
            "rerouteCount": 0,
            "offlineCount": offline_count,
            "newCount": new_count,
            "updated_at": _metric_unix_now(nodes),
        }

    region_id = _view_region_id(session, view_id)
    region_ids = _region_descendants(session, region_id)
    params: dict[str, Any] = {"view_id": view_id}
    node_filter = ""
    if view_id != "global" and region_ids:
        params["region_ids"] = region_ids
        node_filter = "AND (v.region_id = ANY(:region_ids) OR v.vertex_id = 'manager')"

    nodes = _query_rows(
        session,
        f"""
        SELECT
          v.vertex_id,
          v.vertex_name,
          v.subtitle,
          v.vertex_type,
          v.vertex_role,
          v.region_id,
          v.compute_node_id,
          COALESCE(l.x, 0) AS x,
          COALESCE(l.y, 0) AS y,
          COALESCE(l.size_hint, 70) AS size_hint,
          COALESCE(r.status, v.status) AS runtime_status,
          COALESCE(r.current_load_pct, CASE WHEN v.vertex_type IN ('control','cloud') THEN 45 ELSE 0 END) AS current_load_pct,
          COALESCE(r.predicted_load_pct_10m, CASE WHEN v.vertex_type IN ('control','cloud') THEN 49 ELSE 0 END) AS predicted_load_pct_10m,
          r.badge_text,
          r.highlight_level,
          n.ip_address,
          n.role_name,
          n.location,
          n.provider_name,
          n.bandwidth_total_gbps
        FROM dim_topology_vertex v
        LEFT JOIN dim_topology_layout l ON l.vertex_id = v.vertex_id AND l.view_id = :view_id
        LEFT JOIN LATERAL (
          SELECT *
          FROM fact_topology_runtime_state r
          WHERE r.vertex_id = v.vertex_id
          ORDER BY snapshot_time DESC
          LIMIT 1
        ) r ON TRUE
        LEFT JOIN dim_compute_node n ON n.node_id = v.compute_node_id
        WHERE l.view_id = :view_id
        {node_filter}
        ORDER BY COALESCE(l.y, 0), COALESCE(l.x, 0), v.vertex_id
        """,
        params,
    )
    if not nodes:
        return None

    node_ids = [str(row["vertex_id"]) for row in nodes]
    edges = _query_rows(
        session,
        """
        SELECT source_vertex_id, target_vertex_id, edge_role, capacity_bandwidth_mbps
        FROM dim_topology_edge
        WHERE is_active = TRUE
          AND source_vertex_id = ANY(:node_ids)
          AND target_vertex_id = ANY(:node_ids)
        ORDER BY priority DESC, edge_id
        """,
        {"node_ids": node_ids},
    )
    event_rows = _query_rows(
        session,
        """
        SELECT vertex_id, phase, message, severity, log_time
        FROM fact_schedule_log
        ORDER BY log_time DESC
        LIMIT 5
        """,
    )
    offline_count = sum(1 for row in nodes if row.get("runtime_status") == "offline")
    new_count = sum(1 for row in nodes if row.get("runtime_status") == "new")

    return {
        "nodes": [
            {
                "id": row["vertex_id"],
                "label": row["vertex_name"],
                "subtitle": row["subtitle"],
                "type": "management" if row["vertex_type"] in ("control", "cloud") else "edge" if row["vertex_type"] == "edge" else "compute",
                "size": _to_float(row.get("size_hint"), 70),
                "x": _to_float(row.get("x"), 0),
                "y": _to_float(row.get("y"), 0),
                "currentLoad": _to_float(row.get("current_load_pct"), 0),
                "predictedLoad": _to_float(row.get("predicted_load_pct_10m"), 0),
                "status": row["runtime_status"],
                "badgeText": row["badge_text"],
                "data": {
                    "id": row["compute_node_id"] or row["vertex_id"],
                    "statusText": row["runtime_status"],
                    "role": row["role_name"] or row["vertex_role"],
                    "region": row["location"] or row["region_id"],
                    "ip": row["ip_address"] or "--",
                    "provider": row["provider_name"] or "--",
                    "bandwidth": f"{_to_float(row.get('bandwidth_total_gbps'), 0)} Gbps" if row.get("bandwidth_total_gbps") else "--",
                    "latency": "--",
                    "currentLoad": f"{_to_float(row.get('current_load_pct'), 0)}%",
                    "predictedLoad": f"{_to_float(row.get('predicted_load_pct_10m'), 0)}%",
                },
            }
            for row in nodes
        ],
        "edges": [
            {
                "source": row["source_vertex_id"],
                "target": row["target_vertex_id"],
                "kind": "predictive" if row["edge_role"] == "fallback" else "current",
                "style": {"lineWidth": 2},
            }
            for row in edges
        ],
        "events": [
            {
                "title": row["phase"] or "调度事件",
                "description": row["message"],
                "color": "red" if row["severity"] == "error" else "gold" if row["severity"] == "warning" else "blue",
            }
            for row in event_rows
        ],
        "rerouteCount": 0,
        "offlineCount": offline_count,
        "newCount": new_count,
        "updated_at": _metric_unix_now(nodes),
    }


def _get_schedule_logs_from_db(session: Session, vertex_id: str) -> dict[str, Any] | None:
    if not _resolve_db_object(session, ("fact_schedule_log",)):
        return None

    rows = _query_rows(
        session,
        """
        SELECT log_time, phase, message, severity
        FROM fact_schedule_log
        WHERE vertex_id = :vertex_id OR :vertex_id = 'manager'
        ORDER BY log_time DESC
        LIMIT 30
        """,
        {"vertex_id": vertex_id},
    )
    if not rows:
        return None

    rows.reverse()
    return {
        "logs": [
            {
                "time": _format_metric_label(row["log_time"]),
                "phase": row["phase"] or "监控",
                "message": row["message"],
                "severity": row["severity"],
            }
            for row in rows
        ],
        "updated_at": _metric_unix_now(rows),
    }


def _get_active_tasks_from_db(session: Session, node_id: str) -> dict[str, Any] | None:
    if not _resolve_db_object(session, ("fact_task_assignment",)):
        return None

    rows = _query_rows(
        session,
        """
        SELECT
          t.task_id,
          t.task_name,
          t.task_type,
          t.status,
          a.target_node_id,
          a.match_score,
          a.estimated_latency_ms,
          a.allocated_cpu_cores,
          a.allocated_memory_gb,
          a.allocated_gpu_pct
        FROM fact_task t
        JOIN fact_task_assignment a ON a.task_id = t.task_id
        WHERE a.target_node_id = :node_id
          AND a.assignment_status = 'running'
        ORDER BY a.assigned_at DESC
        LIMIT 10
        """,
        {"node_id": node_id},
    )
    if not rows:
        return None

    return {
        "tasks": [
            {
                "id": row["task_id"],
                "name": row["task_name"],
                "type": row["task_type"],
                "status": row["status"],
                "targetNodeId": row["target_node_id"],
                "matchScore": _to_float(row.get("match_score")),
                "estimatedLatency": _to_float(row.get("estimated_latency_ms")),
                "cpu": _to_float(row.get("allocated_cpu_cores")),
                "memory": _to_float(row.get("allocated_memory_gb")),
                "gpu": _to_float(row.get("allocated_gpu_pct")),
            }
            for row in rows
        ],
        "updated_at": _metric_unix_now(rows),
    }


def _build_node_summary(node_row: Mapping[str, Any], snapshot_row: Mapping[str, Any] | None) -> dict[str, Any]:
    gpu_capacity = _to_int(_row_value(node_row, "gpu_count", "gpu_capacity"), 0)
    return {
        "node_id": _row_value(node_row, "node_id", default=""),
        "hostname": _row_value(node_row, "hostname", "node_name", default=""),
        "ip": _row_value(node_row, "ip_address", "ip", "management_ip", default=""),
        "status": _row_value(snapshot_row, "display_status", "status", default=_row_value(node_row, "status", default="unknown")),
        "cpu": _to_float(_row_value(snapshot_row, "cpu_percent", "cpu_usage_pct", "cpu_usage", default=0.0)),
        "memory": _to_float(_row_value(snapshot_row, "mem_percent", "memory_usage_pct", "memory_usage", default=0.0)),
        "disk": _to_float(_row_value(snapshot_row, "disk_percent", "disk_usage_pct", "disk_usage", default=0.0)),
        "gpu": _to_float(_row_value(snapshot_row, "gpu_percent", "gpu_usage_pct", "gpu_usage", default=0.0)),
        "process_count": _to_int(_row_value(node_row, "process_count", "running_tasks", default=_row_value(snapshot_row, "running_tasks", default=0))),
        "port_count": _to_int(_row_value(node_row, "port_count", default=0)),
        "host_count": _to_int(_row_value(node_row, "host_count", default=1), 1),
        "rack_id": _row_value(node_row, "rack_code", "rack_id"),
        "zone": _row_value(node_row, "az_code", "zone"),
        "gpu_model": _row_value(node_row, "gpu_type", "gpu_model"),
        "cpu_capacity_cores": _to_int(_row_value(node_row, "cpu_cores", "cpu_capacity_cores", default=0)),
        "memory_capacity_gb": _to_float(_row_value(node_row, "memory_total_gb", "memory_capacity_gb", default=0.0)),
        "gpu_capacity": gpu_capacity,
    }


def _get_nodes_from_db(session: Session) -> dict[str, Any] | None:
    node_table = _resolve_db_object(session, ("dim_compute_node",))
    snapshot_view = _resolve_db_object(session, ("vw_node_runtime_snapshot",))
    if not node_table or not snapshot_view:
        return None

    try:
        node_rows = _query_rows(session, f"SELECT * FROM {node_table} ORDER BY node_id")
        if not node_rows:
            return None

        snapshot_rows = _query_rows(session, f"SELECT * FROM {snapshot_view}")
    except SQLAlchemyError:
        return None

    snapshot_by_id = {
        str(row["node_id"]): row
        for row in snapshot_rows
        if row.get("node_id") is not None
    }

    nodes = [_build_node_summary(node_row, snapshot_by_id.get(str(node_row.get("node_id")))) for node_row in node_rows]
    updated_at = max(
        (
            _timestamp_to_unix(_row_value(snapshot_by_id.get(str(node_row.get("node_id"))), "latest_metric_time", "metric_time"), 0)
            for node_row in node_rows
        ),
        default=0,
    )

    if not nodes:
        return None

    return {
        "nodes": nodes,
        "updated_at": updated_at or _timestamp_to_unix(datetime.utcnow()),
    }


def _get_nodes_overview_from_db(session: Session) -> dict[str, Any] | None:
    nodes_payload = _get_nodes_from_db(session)
    if not nodes_payload:
        return None

    nodes = nodes_payload["nodes"]
    top_nodes = sorted(nodes, key=lambda item: (-item["process_count"], item["hostname"]))[:5]
    return {
        "process_total": sum(node["process_count"] for node in nodes),
        "port_total": sum(node["port_count"] for node in nodes),
        "host_total": sum(max(node["host_count"], 1) for node in nodes),
        "top_nodes": [
            {
                "node_id": node["node_id"],
                "hostname": node["hostname"],
                "process_count": node["process_count"],
                "port_count": node["port_count"],
            }
            for node in top_nodes
        ],
        "updated_at": nodes_payload["updated_at"],
    }


def _get_node_dashboard_from_db(session: Session, node_id: str) -> dict[str, Any] | None:
    node_table = _resolve_db_object(session, ("dim_compute_node",))
    snapshot_view = _resolve_db_object(session, ("vw_node_runtime_snapshot",))
    if not node_table:
        return None

    try:
        node_row = _query_first(session, f"SELECT * FROM {node_table} WHERE node_id = :node_id", {"node_id": node_id})
        if node_row is None:
            return None

        snapshot_row = None
        if snapshot_view:
            snapshot_row = _query_first(session, f"SELECT * FROM {snapshot_view} WHERE node_id = :node_id", {"node_id": node_id})
    except SQLAlchemyError:
        return None

    cpu_total_usage = _to_float(_row_value(snapshot_row, "cpu_percent", "cpu_usage_pct", "cpu_usage", default=0.0))
    cpu_system_usage = _to_float(_row_value(snapshot_row, "cpu_system_usage", default=None), default=-1.0)
    cpu_user_usage = _to_float(_row_value(snapshot_row, "cpu_user_usage", default=None), default=-1.0)
    if cpu_system_usage < 0 or cpu_user_usage < 0:
        cpu_system_usage, cpu_user_usage = _derive_cpu_breakdown(cpu_total_usage)

    gpu_usage = _to_float(_row_value(snapshot_row, "gpu_percent", "gpu_usage_pct", "gpu_usage", default=0.0))
    gpu_memory_total_gb = _to_float(
        _row_value(
            node_row,
            "gpu_memory_total_gb",
            default=_to_int(_row_value(node_row, "gpu_count", default=0)) * _estimate_gpu_memory_per_card(_row_value(node_row, "gpu_type")),
        )
    )
    gpu_memory_used_gb = _to_float(
        _row_value(
            node_row,
            "gpu_memory_used_gb",
            default=(gpu_memory_total_gb * gpu_usage / 100.0 if gpu_memory_total_gb else 0.0),
        )
    )

    memory_total_gb = _to_float(_row_value(node_row, "memory_total_gb", "memory_capacity_gb", default=0.0))
    memory_usage_percent = _to_float(_row_value(snapshot_row, "mem_percent", "memory_usage_pct", "memory_usage", default=0.0))
    memory_used_gb = _to_float(
        _row_value(
            node_row,
            "memory_used_gb",
            default=(memory_total_gb * memory_usage_percent / 100.0 if memory_total_gb else 0.0),
        )
    )

    disk_total_gb = _to_float(_row_value(node_row, "disk_total_gb", default=0.0))
    disk_usage_percent = _to_float(_row_value(snapshot_row, "disk_percent", "disk_usage_pct", "disk_usage", default=0.0))
    disk_used_gb = _to_float(
        _row_value(
            node_row,
            "disk_used_gb",
            default=(disk_total_gb * disk_usage_percent / 100.0 if disk_total_gb else 0.0),
        )
    )
    disk_available_gb = _to_float(max(disk_total_gb - disk_used_gb, 0.0))

    return {
        "node_id": node_id,
        "cpu_total_usage": cpu_total_usage,
        "cpu_system_usage": cpu_system_usage,
        "cpu_user_usage": cpu_user_usage,
        "gpu_usage": gpu_usage,
        "gpu_memory_total_gb": gpu_memory_total_gb,
        "gpu_memory_used_gb": gpu_memory_used_gb,
        "memory_usage_percent": memory_usage_percent,
        "memory_total_gb": memory_total_gb,
        "memory_used_gb": memory_used_gb,
        "disk_total_gb": disk_total_gb,
        "disk_used_gb": disk_used_gb,
        "disk_available_gb": disk_available_gb,
        "updated_at": _timestamp_to_unix(
            _row_value(snapshot_row, "latest_metric_time", "metric_time", default=_row_value(node_row, "updated_at"))
        ),
    }


def _period_limit(period: str) -> int:
    return {
        "30m": 30,
        "1h": 60,
        "6h": 72,
        "12h": 72,
        "24h": 96,
    }.get(period, 60)


def _get_node_history_from_db(session: Session, node_id: str, period: str) -> dict[str, Any] | None:
    metric_table = _resolve_db_object(session, NODE_METRIC_TABLE_CANDIDATES)
    if not metric_table:
        return None

    metric_columns = _get_object_columns(session, metric_table)
    if "node_id" not in metric_columns or "metric_time" not in metric_columns:
        return None

    try:
        rows = _query_rows(
            session,
            (
                f"SELECT * FROM {metric_table} "
                "WHERE node_id = :node_id "
                "ORDER BY metric_time DESC "
                "LIMIT :limit"
            ),
            {"node_id": node_id, "limit": _period_limit(period)},
        )
    except SQLAlchemyError:
        return None

    if not rows:
        return None

    rows.reverse()
    labels: list[str] = []
    cpu_system_usage: list[float] = []
    cpu_user_usage: list[float] = []
    cpu_usage: list[float] = []
    gpu_usage: list[float] = []
    memory_usage: list[float] = []

    for row in rows:
        total_cpu = _to_float(_row_value(row, "cpu_usage_pct", "cpu_usage", "cpu_percent", default=0.0))
        system_cpu = _row_value(row, "cpu_system_usage", "cpu_system_usage_pct")
        user_cpu = _row_value(row, "cpu_user_usage", "cpu_user_usage_pct")
        if system_cpu is None or user_cpu is None:
            derived_system, derived_user = _derive_cpu_breakdown(total_cpu)
            system_cpu = derived_system
            user_cpu = derived_user

        labels.append(_format_metric_label(row.get("metric_time")))
        cpu_usage.append(total_cpu)
        cpu_system_usage.append(_to_float(system_cpu))
        cpu_user_usage.append(_to_float(user_cpu))
        gpu_usage.append(_to_float(_row_value(row, "gpu_usage_pct", "gpu_usage", "gpu_percent", default=0.0)))
        memory_usage.append(_to_float(_row_value(row, "memory_usage_pct", "memory_usage", "mem_percent", default=0.0)))

    return {
        "node_id": node_id,
        "period": period,
        "labels": labels,
        "cpu_system_usage": cpu_system_usage,
        "cpu_user_usage": cpu_user_usage,
        "cpu_usage": cpu_usage,
        "gpu_usage": gpu_usage,
        "memory_usage": memory_usage,
        "updated_at": _timestamp_to_unix(rows[-1].get("metric_time")),
    }


def _with_db_fallback(
    db: Session | None,
    loader: Any,
    fallback: Any,
    *args: Any,
) -> Any:
    if db is not None:
        try:
            payload = loader(db, *args)
            if payload:
                return payload
        except SQLAlchemyError:
            pass

    return fallback(*args)


def _get_json_node_dashboard(node_id: str) -> dict[str, Any] | None:
    dashboard_dataset = _dataset_payload("node_dashboards")
    dashboards = dashboard_dataset["dashboards"]
    dashboard = dashboards.get(node_id)

    if dashboard is None:
        return None

    payload = dict(dashboard)
    payload["updated_at"] = dashboard_dataset.get("updated_at")
    return payload


def _get_json_node_history(node_id: str, period: str = "1h") -> dict[str, Any] | None:
    history_dataset = _dataset_payload("node_histories")
    histories = history_dataset["histories"]
    history = histories.get(node_id)

    if history is None:
        return None

    payload = dict(history)
    payload["updated_at"] = history_dataset.get("updated_at")

    if period != payload.get("period", "1h"):
        payload["period"] = period

    return payload


def get_daily_prediction(db: Session | None = None) -> dict[str, Any]:
    return _with_db_fallback(db, _get_daily_prediction_from_db, lambda: _dataset_payload("daily_prediction"))


def get_monthly_prediction(db: Session | None = None) -> dict[str, Any]:
    return _with_db_fallback(db, _get_monthly_prediction_from_db, lambda: _dataset_payload("monthly_prediction"))


def get_allocation_results(db: Session | None = None) -> dict[str, Any]:
    return _with_db_fallback(db, _get_allocation_results_from_db, lambda: _dataset_payload("allocation_results"))


def get_strategy_comparison(db: Session | None = None) -> dict[str, Any]:
    del db
    return _dataset_payload("strategy_comparison")


def get_nodes(db: Session | None = None) -> dict[str, Any]:
    return _with_db_fallback(db, _get_nodes_from_db, lambda: _dataset_payload("nodes"))


def get_nodes_overview(db: Session | None = None) -> dict[str, Any]:
    return _with_db_fallback(db, _get_nodes_overview_from_db, lambda: _dataset_payload("nodes_overview"))


def get_node_dashboard(node_id: str, db: Session | None = None) -> dict[str, Any] | None:
    return _with_db_fallback(db, _get_node_dashboard_from_db, _get_json_node_dashboard, node_id)


def get_node_history(node_id: str, period: str = "1h", db: Session | None = None) -> dict[str, Any] | None:
    return _with_db_fallback(db, _get_node_history_from_db, _get_json_node_history, node_id, period)


def get_traffic_sankey(db: Session | None = None) -> dict[str, Any]:
    del db
    return _dataset_payload("traffic_sankey")


def get_traffic_lines(db: Session | None = None) -> dict[str, Any]:
    del db
    return _dataset_payload("traffic_lines")


def get_perspectives(db: Session | None = None) -> dict[str, Any]:
    return _with_db_fallback(db, _get_perspectives_from_db, lambda: {"perspectives": [], "updated_at": _timestamp_to_unix(datetime.utcnow())})


def get_kpi(view_id: str, db: Session | None = None) -> dict[str, Any]:
    return _with_db_fallback(db, _get_kpi_from_db, lambda _view_id: {}, view_id)


def get_top_load(view_id: str, db: Session | None = None) -> dict[str, Any]:
    return _with_db_fallback(db, _get_top_load_from_db, lambda _view_id: {"items": [], "updated_at": _timestamp_to_unix(datetime.utcnow())}, view_id)


def get_task_type_stats(view_id: str, db: Session | None = None) -> dict[str, Any]:
    return _with_db_fallback(db, _get_task_type_stats_from_db, lambda _view_id: {"items": [], "updated_at": _timestamp_to_unix(datetime.utcnow())}, view_id)


def get_topology_view(view_id: str, db: Session | None = None) -> dict[str, Any]:
    return _with_db_fallback(
        db,
        _get_topology_view_from_db,
        lambda _view_id: {"nodes": [], "edges": [], "events": [], "rerouteCount": 0, "offlineCount": 0, "newCount": 0, "updated_at": _timestamp_to_unix(datetime.utcnow())},
        view_id,
    )


def get_schedule_logs(vertex_id: str, db: Session | None = None) -> dict[str, Any]:
    return _with_db_fallback(db, _get_schedule_logs_from_db, lambda _vertex_id: {"logs": [], "updated_at": _timestamp_to_unix(datetime.utcnow())}, vertex_id)


def get_active_tasks(node_id: str, db: Session | None = None) -> dict[str, Any]:
    return _with_db_fallback(db, _get_active_tasks_from_db, lambda _node_id: {"tasks": [], "updated_at": _timestamp_to_unix(datetime.utcnow())}, node_id)
