from __future__ import annotations

import json
import math
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Mapping, Sequence

from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.cache import sync_cached


DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "prediction_allocation"
LOCAL_DB_JSON_DIR = Path(__file__).resolve().parents[2] / "exports" / "local_database_json"
LOCAL_TOPOLOGY_TABLE_DIR = Path(__file__).resolve().parents[2] / "exports" / "local_topology_tables"
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
LOCAL_TOPOLOGY_TABLE_FILES = {
    "compute_node": "dim_compute_node.json",
    "region": "dim_region.json",
    "topology_view": "dim_topology_view.json",
    "topology_view_vertex": "dim_topology_view_vertex.json",
    "topology_vertex": "dim_topology_vertex.json",
    "topology_edge": "dim_topology_edge.json",
    "topology_layout": "dim_topology_layout.json",
    "topology_runtime": "fact_topology_runtime_state.json",
    "node_runtime": "vw_node_runtime_snapshot.json",
    "schedule_log": "fact_schedule_log.json",
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


def _read_local_json_table(key: str) -> list[dict[str, Any]]:
    file_name = LOCAL_TOPOLOGY_TABLE_FILES[key]
    for directory in (LOCAL_DB_JSON_DIR, LOCAL_TOPOLOGY_TABLE_DIR):
        file_path = directory / file_name
        if not file_path.exists():
            continue
        try:
            with file_path.open("r", encoding="utf-8") as file:
                payload = json.load(file)
        except (OSError, json.JSONDecodeError):
            return []

        return payload if isinstance(payload, list) else []

    return []


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


def _view_vertex_ids(session: Session, view_id: str) -> list[str]:
    if not _resolve_db_object(session, ("dim_topology_view_vertex",)):
        return []

    rows = _query_rows(
        session,
        """
        SELECT vertex_id
        FROM dim_topology_view_vertex
        WHERE view_id = :view_id
          AND is_visible = TRUE
        ORDER BY display_order, vertex_id
        """,
        {"view_id": view_id},
    )
    return [str(row["vertex_id"]) for row in rows if row.get("vertex_id")]


def _runtime_status_from_row(row: Mapping[str, Any]) -> str:
    return str(_row_value(row, "runtime_status", "display_status", "node_status", "status", default="online"))


def _topology_display_type(vertex_type: str | None) -> str:
    if vertex_type in ("control", "cloud", "hub"):
        return "management"
    if vertex_type in ("region", "service"):
        return "sensing"
    if vertex_type == "edge":
        return "edge"
    if vertex_type in ("service", "client"):
        return "sensing"
    return "compute"


def _topology_node_style(highlight_level: str | None, task_target_flag: Any = False) -> dict[str, Any]:
    if bool(task_target_flag):
        return {
            "stroke": "#1677ff",
            "lineWidth": 3,
            "haloColor": "rgba(22,119,255,0.20)",
            "haloOpacity": 0.9,
            "shadowColor": "rgba(22,119,255,0.35)",
            "shadowBlur": 16,
        }

    if highlight_level in ("critical", "risk"):
        return {
            "stroke": "#ff4d4f",
            "lineWidth": 2.4,
            "haloColor": "rgba(255,77,79,0.16)",
            "haloOpacity": 0.75,
            "shadowColor": "rgba(255,77,79,0.22)",
            "shadowBlur": 12,
        }

    if highlight_level == "warning":
        return {
            "stroke": "#faad14",
            "lineWidth": 2.2,
            "haloColor": "rgba(250,173,20,0.14)",
            "haloOpacity": 0.65,
        }

    return {}


def _topology_edge_style(edge_role: str | None) -> dict[str, Any]:
    if edge_role == "fallback":
        return {"lineWidth": 2, "stroke": "#fa8c16", "lineDash": [6, 5]}
    if edge_role in ("dc_dispatch", "national_dispatch", "hub_dispatch"):
        return {"lineWidth": 2.4}
    return {"lineWidth": 2}


def _local_row_time(row: Mapping[str, Any], default: int = 0) -> int:
    values = [
        _timestamp_to_unix(row.get(name), 0)
        for name in ("snapshot_time", "latest_metric_time", "metric_time", "updated_at", "log_time", "created_at")
    ]
    return max(values, default=default) or default


def _local_updated_at(*row_groups: Sequence[Mapping[str, Any]]) -> int:
    values = [_local_row_time(row, 0) for rows in row_groups for row in rows]
    return max(values, default=0) or _timestamp_to_unix(datetime.utcnow())


def _local_latest_by_id(
    rows: Sequence[Mapping[str, Any]],
    id_field: str,
) -> dict[str, Mapping[str, Any]]:
    latest: dict[str, Mapping[str, Any]] = {}
    latest_time: dict[str, int] = {}
    for row in rows:
        item_id = row.get(id_field)
        if item_id is None:
            continue
        key = str(item_id)
        row_time = _local_row_time(row, 0)
        if key not in latest or row_time >= latest_time.get(key, 0):
            latest[key] = row
            latest_time[key] = row_time
    return latest


def _local_visible_vertex_ids(
    view_id: str,
    view_vertices: Sequence[Mapping[str, Any]],
    layouts: Sequence[Mapping[str, Any]],
) -> list[str]:
    rows = [
        row
        for row in view_vertices
        if row.get("view_id") == view_id and bool(row.get("is_visible", True))
    ]
    if rows:
        rows.sort(key=lambda row: (_to_int(row.get("display_order"), 9999), str(row.get("vertex_id") or "")))
        return [str(row["vertex_id"]) for row in rows if row.get("vertex_id")]

    layout_rows = [row for row in layouts if row.get("view_id") == view_id and row.get("vertex_id")]
    if layout_rows:
        layout_rows.sort(key=lambda row: (_to_float(row.get("y"), 0), _to_float(row.get("x"), 0), str(row.get("vertex_id"))))
        return [str(row["vertex_id"]) for row in layout_rows]

    return []


def _local_view_node_ids(
    view_id: str,
    vertices_by_id: Mapping[str, Mapping[str, Any]],
    view_vertices: Sequence[Mapping[str, Any]],
    layouts: Sequence[Mapping[str, Any]],
) -> list[str]:
    vertex_ids = _local_visible_vertex_ids(view_id, view_vertices, layouts)
    node_ids: list[str] = []
    for vertex_id in vertex_ids:
        vertex = vertices_by_id.get(vertex_id)
        compute_node_id = vertex.get("compute_node_id") if vertex else None
        if compute_node_id:
            node_ids.append(str(compute_node_id))
    return node_ids


def _get_json_perspectives() -> dict[str, Any]:
    views = _read_local_json_table("topology_view")
    vertices = _read_local_json_table("topology_vertex")
    view_vertices = _read_local_json_table("topology_view_vertex")
    layouts = _read_local_json_table("topology_layout")
    if not views:
        return {"perspectives": [], "updated_at": _timestamp_to_unix(datetime.utcnow()), "source": "local_json"}

    vertices_by_id = {str(row["vertex_id"]): row for row in vertices if row.get("vertex_id")}
    active_views = [row for row in views if bool(row.get("is_active", True))]
    active_views.sort(
        key=lambda row: (
            {"global": 1, "region": 2, "province": 3, "node": 4}.get(str(row.get("view_kind")), 9),
            str(row.get("view_id") or ""),
        )
    )

    return {
        "perspectives": [
            {
                "value": row["view_id"],
                "label": row["view_name"],
                "kind": row["view_kind"],
                "region_id": row.get("region_id"),
                "node_id": row.get("node_id"),
                "nodeIds": _local_view_node_ids(str(row["view_id"]), vertices_by_id, view_vertices, layouts),
                "is_default": bool(row.get("is_default")),
            }
            for row in active_views
            if row.get("view_id") and row.get("view_name") and row.get("view_kind")
        ],
        "updated_at": _local_updated_at(active_views, view_vertices, layouts),
        "source": "local_json",
    }


def _get_json_topology_view(view_id: str) -> dict[str, Any]:
    vertices = _read_local_json_table("topology_vertex")
    edges = _read_local_json_table("topology_edge")
    layouts = _read_local_json_table("topology_layout")
    view_vertices = _read_local_json_table("topology_view_vertex")
    compute_nodes = _read_local_json_table("compute_node")
    regions = _read_local_json_table("region")
    node_runtime = _read_local_json_table("node_runtime")
    topology_runtime = _read_local_json_table("topology_runtime")
    schedule_logs = _read_local_json_table("schedule_log")
    if not vertices:
        return {
            "nodes": [],
            "edges": [],
            "events": [],
            "rerouteCount": 0,
            "offlineCount": 0,
            "newCount": 0,
            "updated_at": _timestamp_to_unix(datetime.utcnow()),
            "source": "local_json",
        }

    vertices_by_id = {str(row["vertex_id"]): row for row in vertices if row.get("vertex_id")}
    nodes_by_id = {str(row["node_id"]): row for row in compute_nodes if row.get("node_id")}
    regions_by_id = {str(row["region_id"]): row for row in regions if row.get("region_id")}
    snapshot_by_node_id = _local_latest_by_id(node_runtime, "node_id")
    runtime_by_vertex_id = _local_latest_by_id(topology_runtime, "vertex_id")
    layout_by_vertex_id = {
        str(row["vertex_id"]): row
        for row in layouts
        if row.get("view_id") == view_id and row.get("vertex_id")
    }

    vertex_ids = _local_visible_vertex_ids(view_id, view_vertices, layouts)
    if not vertex_ids and view_id == "global":
        vertex_ids = [
            str(row["vertex_id"])
            for row in vertices
            if row.get("vertex_id") and row.get("status") != "disabled"
        ]
    if not vertex_ids:
        vertex_ids = [
            str(row["vertex_id"])
            for row in vertices
            if row.get("vertex_id") and row.get("status") != "disabled"
        ]

    selected_vertices = [
        vertices_by_id[vertex_id]
        for vertex_id in vertex_ids
        if vertex_id in vertices_by_id and vertices_by_id[vertex_id].get("status") != "disabled"
    ]
    fallback_layout = _fallback_topology_layout(selected_vertices)
    selected_ids = {str(row["vertex_id"]) for row in selected_vertices}
    selected_edges = [
        row
        for row in edges
        if bool(row.get("is_active", True))
        and str(row.get("source_vertex_id")) in selected_ids
        and str(row.get("target_vertex_id")) in selected_ids
    ]

    def build_node(row: Mapping[str, Any]) -> dict[str, Any]:
        vertex_id = str(row["vertex_id"])
        compute_node_id = row.get("compute_node_id")
        node_row = nodes_by_id.get(str(compute_node_id)) if compute_node_id else None
        snapshot_row = snapshot_by_node_id.get(str(compute_node_id)) if compute_node_id else None
        runtime_row = runtime_by_vertex_id.get(vertex_id)
        region_id = row.get("region_id") or _row_value(node_row, "region_id")
        region_row = regions_by_id.get(str(region_id)) if region_id else None
        layout_row = layout_by_vertex_id.get(vertex_id)
        fallback_x, fallback_y, fallback_size = fallback_layout.get(vertex_id, (0, 0, 70))
        status = str(
            _row_value(
                runtime_row,
                "status",
                default=_row_value(snapshot_row, "display_status", "status", default=_row_value(node_row, "status", default=row.get("status") or "online")),
            )
        )
        current_load = _to_float(
            _row_value(
                runtime_row,
                "current_load_pct",
                default=_row_value(snapshot_row, "cpu_percent", default=45 if row.get("vertex_type") in ("control", "cloud", "hub", "region") else 0),
            )
        )
        predicted_load = _to_float(
            _row_value(runtime_row, "predicted_load_pct_10m", default=min(100, current_load + 4))
        )
        highlight_level = _row_value(runtime_row, "highlight_level")
        if highlight_level is None:
            highlight_level = "warning" if status in ("offline", "maintenance") else "risk" if current_load >= 80 else "normal"

        return {
            "id": vertex_id,
            "label": row.get("vertex_name") or vertex_id,
            "subtitle": row.get("subtitle") or _row_value(region_row, "region_name", default=None),
            "type": _topology_display_type(row.get("vertex_type")),
            "size": _to_float(_row_value(layout_row, "size_hint", default=fallback_size), fallback_size),
            "x": _to_float(_row_value(layout_row, "x", default=fallback_x), fallback_x),
            "y": _to_float(_row_value(layout_row, "y", default=fallback_y), fallback_y),
            "currentLoad": current_load,
            "predictedLoad": predicted_load,
            "status": status,
            "badgeText": _row_value(runtime_row, "badge_text", default=None),
            "style": _topology_node_style(str(highlight_level), _row_value(runtime_row, "task_target_flag", default=False)),
            "data": {
                "id": compute_node_id or vertex_id,
                "statusText": status,
                "role": _row_value(node_row, "role_name", default=row.get("vertex_role")),
                "region": _row_value(node_row, "location", default=_row_value(region_row, "region_name", default=region_id or "--")),
                "ip": _row_value(node_row, "ip_address", default="--"),
                "provider": _row_value(node_row, "provider_name", default="--"),
                "bandwidth": f"{_to_float(_row_value(node_row, 'bandwidth_total_gbps'), 0)} Gbps" if _row_value(node_row, "bandwidth_total_gbps") else "--",
                "latency": f"{_to_float(_row_value(snapshot_row, 'latency_ms'), 0)} ms" if _row_value(snapshot_row, "latency_ms") else "--",
                "currentLoad": f"{current_load}%",
                "predictedLoad": f"{predicted_load}%",
            },
        }

    event_rows = sorted(schedule_logs, key=lambda row: _local_row_time(row, 0), reverse=True)[:5]
    offline_count = sum(
        1
        for row in selected_vertices
        if build_node(row)["status"] in ("offline", "maintenance")
    )
    new_count = sum(1 for row in selected_vertices if build_node(row)["status"] == "new")

    return {
        "nodes": [build_node(row) for row in selected_vertices],
        "edges": [
            {
                "source": row["source_vertex_id"],
                "target": row["target_vertex_id"],
                "kind": "predictive" if row.get("edge_role") == "fallback" else "current",
                "style": _topology_edge_style(row.get("edge_role")),
            }
            for row in selected_edges
            if row.get("source_vertex_id") and row.get("target_vertex_id")
        ],
        "events": [
            {
                "title": row.get("phase") or "调度事件",
                "description": row.get("message") or "",
                "color": "red" if row.get("severity") == "error" else "gold" if row.get("severity") == "warning" else "blue",
            }
            for row in event_rows
        ],
        "rerouteCount": 0,
        "offlineCount": offline_count,
        "newCount": new_count,
        "updated_at": _local_updated_at(selected_vertices, selected_edges, event_rows),
        "source": "local_json",
    }


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
                "source_node_id": "national-center",
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

    # 批量查询所有视角的可见节点，避免 N+1 查询（41 次查询 → 1 次）
    view_ids = [str(row["view_id"]) for row in rows]
    all_view_nodes: dict[str, list[str]] = {}
    if _resolve_db_object(session, ("dim_topology_view_vertex",)):
        vv_rows = _query_rows(
            session,
            """
            SELECT view_id, vertex_id
            FROM dim_topology_view_vertex
            WHERE view_id = ANY(:view_ids) AND is_visible = TRUE
            ORDER BY display_order, vertex_id
            """,
            {"view_ids": view_ids},
        )
        for vr in vv_rows:
            vid = str(vr["view_id"])
            if vid not in all_view_nodes:
                all_view_nodes[vid] = []
            all_view_nodes[vid].append(str(vr["vertex_id"]))

    return {
        "perspectives": [
            {
                "value": row["view_id"],
                "label": row["view_name"],
                "kind": row["view_kind"],
                "region_id": row["region_id"],
                "node_id": row["node_id"],
                "nodeIds": all_view_nodes.get(str(row["view_id"]), []),
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

    type_labels = {
        "training": "训练任务",
        "train": "训练任务",
        "federatedlearning": "训练任务",
        "federated_learning": "训练任务",
        "gnn": "训练任务",
        "inference": "推理服务",
        "serving": "推理服务",
        "preprocessing": "数据预处理",
        "data_preprocess": "数据预处理",
        "data_cleaning": "数据预处理",
        "aggregation": "联邦聚合",
        "federated": "联邦聚合",
        "migration": "弹性迁移",
        "elastic": "弹性迁移",
    }

    def fetch_global_rows() -> list[Mapping[str, Any]]:
        return _query_rows(
            session,
            """
            SELECT COALESCE(task_type, 'unknown') AS name, COUNT(*)::float AS value
            FROM fact_task
            GROUP BY COALESCE(task_type, 'unknown')
            ORDER BY value DESC, name
            """,
        )

    rows: list[Mapping[str, Any]]
    if view_id == "global" or not _resolve_db_object(session, ("fact_task_assignment",)):
        rows = fetch_global_rows()
    else:
        node_ids = _view_node_ids(session, view_id)
        if _resolve_db_object(session, ("dim_topology_view_vertex",)) and _resolve_db_object(session, ("dim_topology_vertex",)):
            vertex_node_rows = _query_rows(
                session,
                """
                SELECT DISTINCT v.compute_node_id
                FROM dim_topology_view_vertex vv
                JOIN dim_topology_vertex v ON v.vertex_id = vv.vertex_id
                WHERE vv.view_id = :view_id
                  AND vv.is_visible = TRUE
                  AND v.compute_node_id IS NOT NULL
                """,
                {"view_id": view_id},
            )
            node_ids = sorted(set(node_ids + [str(row["compute_node_id"]) for row in vertex_node_rows if row.get("compute_node_id")]))

        rows = []
        if node_ids:
            rows = _query_rows(
                session,
                """
                SELECT COALESCE(t.task_type, 'unknown') AS name, COUNT(DISTINCT t.task_id)::float AS value
                FROM fact_task t
                JOIN fact_task_assignment a ON a.task_id = t.task_id
                WHERE a.target_node_id = ANY(:node_ids)
                GROUP BY COALESCE(t.task_type, 'unknown')
                ORDER BY value DESC, name
                """,
                {"node_ids": node_ids},
            )
        if not rows:
            rows = fetch_global_rows()
    if not rows:
        return None

    return {
        "items": [
            {
                "name": type_labels.get(str(row["name"]).lower(), str(row["name"]) if row.get("name") else "其他任务"),
                "value": _to_float(row.get("value")),
            }
            for row in rows
        ],
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
              FALSE AS task_target_flag,
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
                    "style": _topology_node_style(row.get("highlight_level"), row.get("task_target_flag")),
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
                    "style": _topology_edge_style(row.get("edge_role")),
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
    visible_vertex_ids = _view_vertex_ids(session, view_id)
    if visible_vertex_ids:
        params["visible_vertex_ids"] = visible_vertex_ids
        node_filter = "AND v.vertex_id = ANY(:visible_vertex_ids)"
    elif view_id != "global" and region_ids:
        params["region_ids"] = region_ids
        node_filter = "AND (COALESCE(v.region_id, n.region_id) = ANY(:region_ids) OR v.vertex_id = 'manager')"

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
          l.x AS x,
          l.y AS y,
          l.size_hint AS size_hint,
          COALESCE(r.status, v.status) AS runtime_status,
          COALESCE(r.current_load_pct, CASE WHEN v.vertex_type IN ('control','cloud') THEN 45 ELSE 0 END) AS current_load_pct,
          COALESCE(r.predicted_load_pct_10m, CASE WHEN v.vertex_type IN ('control','cloud') THEN 49 ELSE 0 END) AS predicted_load_pct_10m,
          r.badge_text,
          r.highlight_level,
          COALESCE(r.task_target_flag, FALSE) AS task_target_flag,
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
        WHERE v.status IS DISTINCT FROM 'disabled'
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
    fallback_layout = _fallback_topology_layout(nodes)

    return {
        "nodes": [
            {
                "id": row["vertex_id"],
                "label": row["vertex_name"],
                "subtitle": row["subtitle"],
                "type": _topology_display_type(row.get("vertex_type")),
                "size": _to_float(row.get("size_hint"), fallback_layout.get(str(row["vertex_id"]), (0, 0, 70))[2]),
                "x": _to_float(row.get("x"), fallback_layout.get(str(row["vertex_id"]), (0, 0, 70))[0]),
                "y": _to_float(row.get("y"), fallback_layout.get(str(row["vertex_id"]), (0, 0, 70))[1]),
                "currentLoad": _to_float(row.get("current_load_pct"), 0),
                "predictedLoad": _to_float(row.get("predicted_load_pct_10m"), 0),
                "status": row["runtime_status"],
                "badgeText": row["badge_text"],
                "style": _topology_node_style(row.get("highlight_level"), row.get("task_target_flag")),
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
                "style": _topology_edge_style(row.get("edge_role")),
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


def _fallback_security_overview(view_id: str = "global") -> dict[str, Any]:
    """安全态势：算法层评分由决策引擎动态计算（安全→调度联动）"""
    from app.services.algorithm_decision_engine import (
        calculate_algorithm_security_score,
        recommend_algorithm,
    )

    # 当前场景：35% 恶意梯度
    malicious_ratio = 35
    recommended_algo, _ = recommend_algorithm(malicious_ratio)
    algo_score = calculate_algorithm_security_score(recommended_algo, malicious_ratio)

    # 根据算法层评分推导综合等级
    scores = {
        "data": 87,
        "algorithm": algo_score,
        "network": 79,
        "system": 76,
    }
    overall = sum(scores.values()) / len(scores)
    grade = "A" if overall >= 90 else "A-" if overall >= 85 else "B+" if overall >= 80 else "B" if overall >= 70 else "C"

    return {
        "view_id": view_id,
        "grade": grade,
        "scores": scores,
        "ahpWeights": {
            "data": 0.28,
            "algorithm": 0.32,
            "network": 0.22,
            "system": 0.18,
        },
        "dsConfidence": 0.81,
        "pcaDrivers": [
            {"name": "算法风险主导", "ratio": 42},
            {"name": "数据风险次之", "ratio": 28},
        ],
        "dominantRisk": "算法层风险",
        "explanation": f"检测到 {malicious_ratio}% 梯度异常，RL 策略已切换至 {recommended_algo} 聚合，算法层评分 {algo_score}。",
        "currentAlgorithm": recommended_algo,
        "updated_at": _timestamp_to_unix(datetime.utcnow()),
    }


def _get_security_overview_from_db(session: Session, view_id: str = "global") -> dict[str, Any] | None:
    if not _resolve_db_object(session, ("fact_security_overview_snapshot",)):
        return None

    row = _query_first(
        session,
        """
        SELECT *
        FROM fact_security_overview_snapshot
        WHERE view_id = :view_id OR :view_id = 'global'
        ORDER BY snapshot_time DESC
        LIMIT 1
        """,
        {"view_id": view_id},
    )
    if not row:
        return None

    payload = _fallback_security_overview(str(row.get("view_id") or view_id))
    payload.update({
        "grade": row.get("grade") or payload["grade"],
        "scores": {
            "data": _to_float(row.get("data_score"), 87),
            "algorithm": _to_float(row.get("algorithm_score"), 82),
            "network": _to_float(row.get("network_score"), 79),
            "system": _to_float(row.get("system_score"), 76),
        },
        "dsConfidence": round(float(row.get("ds_confidence") or 0.81), 2),
        "pcaDrivers": [
            {"name": row.get("pc1_driver") or "算法风险主导", "ratio": _to_float(row.get("pc1_ratio"), 42)},
            {"name": row.get("pc2_driver") or "数据风险次之", "ratio": _to_float(row.get("pc2_ratio"), 28)},
        ],
        "dominantRisk": "算法层风险",
        "explanation": row.get("explanation") or payload["explanation"],
        "updated_at": _timestamp_to_unix(row.get("snapshot_time")),
    })
    return payload


def _fallback_aggregation_strategy(task_id: str) -> dict[str, Any]:
    """调用算法决策引擎，动态生成策略（不再硬编码）"""
    from app.services.algorithm_decision_engine import generate_aggregation_strategy

    # 默认场景：35% 恶意梯度，模拟梯度反转攻击
    result = generate_aggregation_strategy(
        task_id=task_id,
        malicious_ratio=35,
        attack_type="gradient_reverse",
        security_score=82,  # 当前算法层安全评分
    )
    result["updated_at"] = _timestamp_to_unix(datetime.utcnow())
    return result


def _get_aggregation_strategy_from_db(session: Session, task_id: str) -> dict[str, Any] | None:
    if not _resolve_db_object(session, ("fact_strategy_eval_run",)) or not _resolve_db_object(session, ("fact_strategy_eval_metric",)):
        return None

    run = _query_first(
        session,
        """
        SELECT *
        FROM fact_strategy_eval_run
        WHERE task_id = :task_id
        ORDER BY run_time DESC
        LIMIT 1
        """,
        {"task_id": task_id},
    )
    if not run:
        return None

    rows = _query_rows(
        session,
        """
        SELECT algorithm_name, round_no, accuracy, loss_value
        FROM fact_strategy_eval_metric
        WHERE eval_run_id = :run_id
        ORDER BY algorithm_name, round_no
        """,
        {"run_id": run["eval_run_id"]},
    )
    if not rows:
        return None

    grouped: dict[str, dict[str, list[float]]] = {}
    for row in rows:
        name = str(row["algorithm_name"])
        bucket = grouped.setdefault(name, {"rounds": [], "accuracy": [], "loss": []})
        bucket["rounds"].append(_to_int(row.get("round_no")))
        bucket["accuracy"].append(_to_float(row.get("accuracy")))
        bucket["loss"].append(round(float(row.get("loss_value") or 0), 3))

    log_rows: list[Mapping[str, Any]] = []
    if _resolve_db_object(session, ("fact_schedule_log",)):
        log_rows = _query_rows(
            session,
            """
            SELECT phase, message, log_time
            FROM fact_schedule_log
            WHERE task_id = :task_id AND phase IN ('安全', '策略')
            ORDER BY log_time ASC
            LIMIT 6
            """,
            {"task_id": task_id},
        )

    return {
        "taskId": task_id,
        "currentAlgorithm": run.get("selected_algorithm") or "Bulyan",
        "mode": run.get("decision_mode") or "rl_auto",
        "maliciousRatio": _to_float(run.get("malicious_ratio"), 35),
        "attackType": run.get("attack_type") or "gradient_reverse",
        "reason": run.get("reason") or "35% 梯度异常时 Bulyan 鲁棒性最佳。",
        "curves": [
            {"algorithm": name, **values}
            for name, values in grouped.items()
        ],
        "decisionLogs": [str(row["message"]) for row in log_rows] or _fallback_aggregation_strategy(task_id)["decisionLogs"],
        "updated_at": _timestamp_to_unix(run.get("run_time")),
    }


def _phase_rank(phase: str | None) -> int:
    order = {"感知": 1, "预测": 2, "决策": 3, "安全": 4, "策略": 5, "下发": 6, "监控": 7}
    return order.get(phase or "", 0)


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
        return min(_to_float(progress, 0), 30)
    return _to_float(progress, 0)


def _fallback_decision_context(task_id: str, view_id: str = "global") -> dict[str, Any]:
    now = datetime.utcnow()
    candidates = [
        ("dc-guangdong-02", "广东DC-2", 1, 92, 96, 91, 88, 94, 6),
        ("dc-shanghai-01", "上海DC-1", 2, 86, 98, 86, 78, 72, 14),
        ("dc-beijing-02", "北京DC-2", 3, 81, 90, 76, 74, 70, 19),
        ("dc-sichuan-01", "四川DC-1", 4, 77, 84, 68, 70, 88, 16),
    ]
    logs = [
        ("20:04", "感知", "收到 task-fedtrain-99943，读取任务资源需求。", "info"),
        ("20:06", "预测", "拉取全国算力拓扑与未来 10 分钟负载预测。", "info"),
        ("20:08", "决策", "生成候选节点评分：资源匹配、负载均衡、网络时延、风险扣分。", "info"),
        ("20:10", "安全", "训练监控侧检测到 35% 梯度异常，算法层风险升高。", "warning"),
        ("20:11", "策略", "引用算法策略决策中心结果：RL 选择 Bulyan。", "success"),
        ("20:12", "下发", "任务绑定至 dc-guangdong-02，资源预留完成。", "info"),
    ]
    return {
        "task": {
            "id": task_id,
            "name": "联邦训练-图神经网络",
            "status": "running",
            "progress": 42,
            "targetNodeId": "dc-guangdong-02",
            "targetNodeName": "广东DC-2",
        },
        "stage": "下发",
        "targetNodeId": "dc-guangdong-02",
        "targetNodeName": "广东DC-2",
        "selectedReason": "广东DC-2 在资源匹配、负载均衡和时延维度综合评分最高，风险扣分最低。",
        "candidates": [
            {
                "nodeId": node_id,
                "nodeName": node_name,
                "rankNo": rank,
                "scoreTotal": total,
                "resourceFit": resource,
                "latency": latency,
                "bandwidth": bandwidth,
                "balance": balance,
                "riskPenalty": risk,
            }
            for node_id, node_name, rank, total, resource, latency, bandwidth, balance, risk in candidates
        ],
        "logs": [
            {"time": time, "phase": phase, "message": message, "severity": severity}
            for time, phase, message, severity in logs
        ],
        "securitySummary": {
            "grade": "B+",
            "algorithmScore": 82,
            "source": "训练监控告警",
        },
        "strategySummary": {
            "algorithm": "Bulyan",
            "mode": "rl_auto",
            "reason": "35% 梯度异常时 Bulyan 鲁棒性最佳，FedAvg 精度明显崩溃。",
        },
        "updated_at": _timestamp_to_unix(now),
        "view_id": view_id,
    }


def _get_decision_context_from_db(session: Session, task_id: str, view_id: str = "global") -> dict[str, Any] | None:
    if not _resolve_db_object(session, ("fact_task",)):
        return None

    task = _query_first(
        session,
        """
        SELECT task_id, COALESCE(task_name, name) AS task_name, status, progress, assigned_node_id
        FROM fact_task
        WHERE task_id = :task_id
        LIMIT 1
        """,
        {"task_id": task_id},
    )
    if not task:
        return None

    assignment: Mapping[str, Any] | None = None
    if _resolve_db_object(session, ("fact_task_assignment",)):
        assignment = _query_first(
            session,
            """
            SELECT a.target_node_id, a.match_score, n.node_name
            FROM fact_task_assignment a
            LEFT JOIN dim_compute_node n ON n.node_id = a.target_node_id
            WHERE a.task_id = :task_id
            ORDER BY a.assigned_at DESC
            LIMIT 1
            """,
            {"task_id": task_id},
        )

    candidate_rows: list[Mapping[str, Any]] = []
    if _resolve_db_object(session, ("fact_task_candidate_score",)):
        candidate_rows = _query_rows(
            session,
            """
            SELECT
              c.candidate_node_id,
              COALESCE(n.node_name, c.candidate_node_id) AS node_name,
              c.rank_no,
              c.score_total,
              c.score_resource_fit,
              c.score_latency,
              c.score_bandwidth,
              c.score_balance,
              c.score_risk
            FROM fact_task_candidate_score c
            LEFT JOIN dim_compute_node n ON n.node_id = c.candidate_node_id
            WHERE c.task_id = :task_id
            ORDER BY c.rank_no NULLS LAST, c.score_total DESC
            LIMIT 4
            """,
            {"task_id": task_id},
        )

    log_rows: list[Mapping[str, Any]] = []
    if _resolve_db_object(session, ("fact_schedule_log",)):
        log_rows = _query_rows(
            session,
            """
            SELECT log_time, phase, message, severity
            FROM fact_schedule_log
            WHERE task_id = :task_id
            ORDER BY log_time ASC
            LIMIT 12
            """,
            {"task_id": task_id},
        )

    security = _get_security_overview_from_db(session, view_id) or _fallback_security_overview(view_id)
    strategy = _get_aggregation_strategy_from_db(session, task_id) or _fallback_aggregation_strategy(task_id)
    target_node_id = str(_row_value(assignment, "target_node_id", default=_row_value(task, "assigned_node_id", default="")))
    target_node_name = str(_row_value(assignment, "node_name", default=target_node_id or "--"))
    task_status = task["status"] or "pending"

    return {
        "task": {
            "id": task["task_id"],
            "name": task["task_name"] or task["task_id"],
            "status": task_status,
            "progress": _progress_from_task_status(task_status, task.get("progress")),
            "targetNodeId": target_node_id,
            "targetNodeName": target_node_name,
        },
        "stage": _stage_from_task_status(task_status),
        "targetNodeId": target_node_id,
        "targetNodeName": target_node_name,
        "selectedReason": f"{target_node_name} 综合评分最高，调度中枢已完成资源预留与策略绑定。",
        "candidates": [
            {
                "nodeId": row["candidate_node_id"],
                "nodeName": row["node_name"],
                "rankNo": _to_int(row.get("rank_no"), index + 1),
                "scoreTotal": _to_float(row.get("score_total")),
                "resourceFit": _to_float(row.get("score_resource_fit")),
                "latency": _to_float(row.get("score_latency")),
                "bandwidth": _to_float(row.get("score_bandwidth")),
                "balance": _to_float(row.get("score_balance")),
                "riskPenalty": _to_float(row.get("score_risk")),
            }
            for index, row in enumerate(candidate_rows)
        ],
        "logs": [
            {
                "time": _format_metric_label(row["log_time"]),
                "phase": row["phase"] or "监控",
                "message": row["message"],
                "severity": row["severity"],
            }
            for row in log_rows
        ],
        "securitySummary": {
            "grade": security["grade"],
            "algorithmScore": security["scores"]["algorithm"],
            "source": "训练监控告警",
        },
        "strategySummary": {
            "algorithm": strategy["currentAlgorithm"],
            "mode": strategy["mode"],
            "reason": strategy["reason"],
        },
        "updated_at": _timestamp_to_unix(datetime.utcnow()),
        "view_id": view_id,
    }


def _fallback_node_insight(vertex_id: str, task_id: str) -> dict[str, Any]:
    context = _fallback_decision_context(task_id)
    candidate = next((item for item in context["candidates"] if item["nodeId"] == vertex_id), None)
    is_target = vertex_id == context["targetNodeId"]
    return {
        "vertexId": vertex_id,
        "nodeId": vertex_id,
        "nodeName": candidate["nodeName"] if candidate else vertex_id,
        "role": "算力节点",
        "status": "online",
        "currentLoad": 70 if is_target else 76,
        "predictedLoad": 78 if is_target else 84,
        "trustScore": 94 if is_target else 82,
        "latency": "11 ms" if is_target else "18 ms",
        "bandwidth": "320 Gbps" if is_target else "260 Gbps",
        "isTarget": is_target,
        "selectedReason": context["selectedReason"] if is_target else None,
        "unselectedReason": None if is_target else "未选中：预测负载或风险扣分高于目标节点。",
        "candidateScore": candidate,
        "activeTasks": [{
            "id": task_id,
            "name": "联邦训练-图神经网络",
            "type": "training",
            "status": "running",
            "progress": 42,
        }] if is_target else [],
        "logs": context["logs"][-4:],
        "alerts": [{
            "level": "warning",
            "message": "训练监控侧发现梯度异常，调度中枢引用策略面板切换 Bulyan。",
            "metric": "algorithm_risk",
            "value": 35,
        }],
        "updated_at": _timestamp_to_unix(datetime.utcnow()),
    }


def _get_virtual_vertex_metric_summary(session: Session, vertex_id: str) -> dict[str, Any]:
    summary = {
        "trust": 0.0,
        "latency": 0.0,
        "node_bandwidth": 0.0,
        "edge_bandwidth": 0.0,
    }

    if _resolve_db_object(session, ("dim_topology_edge",)):
        edge_row = _query_first(
            session,
            """
            SELECT SUM(COALESCE(capacity_bandwidth_mbps, 0)) AS bandwidth_mbps
            FROM dim_topology_edge
            WHERE is_active = TRUE
              AND (source_vertex_id = :vertex_id OR target_vertex_id = :vertex_id)
            """,
            {"vertex_id": vertex_id},
        )
        summary["edge_bandwidth"] = _to_float(edge_row.get("bandwidth_mbps") if edge_row else None, 0) / 1000

    if not _resolve_db_object(session, ("dim_compute_node",)) or not _resolve_db_object(session, ("dim_topology_edge",)):
        return summary

    aggregate_row = _query_first(
        session,
        """
        WITH RECURSIVE reachable(vertex_id, depth) AS (
          SELECT :vertex_id AS vertex_id, 0 AS depth
          UNION ALL
          SELECT
            CASE
              WHEN e.source_vertex_id = r.vertex_id THEN e.target_vertex_id
              ELSE e.source_vertex_id
            END AS vertex_id,
            r.depth + 1 AS depth
          FROM dim_topology_edge e
          JOIN reachable r
            ON e.source_vertex_id = r.vertex_id OR e.target_vertex_id = r.vertex_id
          WHERE e.is_active = TRUE
            AND r.depth < 3
        ),
        compute_vertices AS (
          SELECT DISTINCT v.compute_node_id
          FROM reachable r
          JOIN dim_topology_vertex v ON v.vertex_id = r.vertex_id
          WHERE v.compute_node_id IS NOT NULL
        )
        SELECT
          AVG(n.health_score) AS avg_health_score,
          AVG(n.task_success_rate) AS avg_success_rate,
          AVG(n.avg_response_time) AS avg_response_time,
          SUM(n.bandwidth_total_gbps) AS total_bandwidth_gbps
        FROM compute_vertices cv
        JOIN dim_compute_node n ON n.node_id = cv.compute_node_id
        """,
        {"vertex_id": vertex_id},
    )
    if not aggregate_row:
        return summary

    trust = _to_float(aggregate_row.get("avg_health_score"), 0)
    if trust <= 0:
        trust = round(_to_float(aggregate_row.get("avg_success_rate"), 0) * 100, 1)

    summary["trust"] = trust
    summary["latency"] = _to_float(aggregate_row.get("avg_response_time"), 0)
    summary["node_bandwidth"] = _to_float(aggregate_row.get("total_bandwidth_gbps"), 0)
    return summary


def _get_node_insight_from_db(session: Session, vertex_id: str, task_id: str) -> dict[str, Any] | None:
    if not _resolve_db_object(session, ("dim_topology_vertex",)):
        return None

    row = _query_first(
        session,
        """
        SELECT
          v.vertex_id,
          v.vertex_name,
          v.vertex_role,
          v.compute_node_id,
          v.vertex_type,
          COALESCE(r.status, n.status, v.status, 'online') AS status,
          COALESCE(r.current_load_pct, 0) AS current_load_pct,
          COALESCE(r.predicted_load_pct_10m, COALESCE(r.current_load_pct, 0) + 4) AS predicted_load_pct_10m,
          n.node_name,
          n.role_name,
          n.bandwidth_total_gbps,
          n.avg_response_time,
          n.task_success_rate,
          n.health_score
        FROM dim_topology_vertex v
        LEFT JOIN LATERAL (
          SELECT *
          FROM fact_topology_runtime_state r
          WHERE r.vertex_id = v.vertex_id
          ORDER BY snapshot_time DESC
          LIMIT 1
        ) r ON TRUE
        LEFT JOIN dim_compute_node n ON n.node_id = v.compute_node_id
        WHERE v.vertex_id = :vertex_id
        LIMIT 1
        """,
        {"vertex_id": vertex_id},
    )
    if not row:
        return None

    node_id = str(row.get("compute_node_id") or row.get("vertex_id"))
    context = _get_decision_context_from_db(session, task_id, "global") or _fallback_decision_context(task_id)
    candidate = next((item for item in context["candidates"] if item["nodeId"] == node_id or item["nodeId"] == vertex_id), None)
    is_target = node_id == context.get("targetNodeId") or vertex_id == context.get("targetNodeId")
    task_rows = _get_active_tasks_from_db(session, node_id) or {"tasks": []}
    log_rows = _query_rows(
        session,
        """
        SELECT log_time, phase, message, severity
        FROM fact_schedule_log
        WHERE task_id = :task_id AND (vertex_id = :vertex_id OR vertex_id = :node_id OR :is_target)
        ORDER BY log_time DESC
        LIMIT 5
        """,
        {"task_id": task_id, "vertex_id": vertex_id, "node_id": node_id, "is_target": is_target},
    ) if _resolve_db_object(session, ("fact_schedule_log",)) else []
    alert_rows = _query_rows(
        session,
        """
        SELECT alert_level, alert_message, metric_code, current_value
        FROM fact_alert_record
        WHERE node_id = :node_id OR :is_target
        ORDER BY triggered_at DESC
        LIMIT 3
        """,
        {"node_id": node_id, "is_target": is_target},
    ) if _resolve_db_object(session, ("fact_alert_record",)) else []

    trust = _to_float(row.get("health_score"), 0)
    if trust <= 0:
        trust = round((_to_float(row.get("task_success_rate"), 0.92) * 100), 1)

    virtual_summary = _get_virtual_vertex_metric_summary(session, vertex_id) if not row.get("compute_node_id") else {}
    if trust <= 0 and virtual_summary:
        trust = _to_float(virtual_summary.get("trust"), 90)

    latency_value = _to_float(row.get("avg_response_time"), 0)
    if latency_value <= 0 and virtual_summary:
        latency_value = _to_float(virtual_summary.get("latency"), 12)

    bandwidth_value = _to_float(row.get("bandwidth_total_gbps"), 0)
    bandwidth_label = f"{bandwidth_value} Gbps" if bandwidth_value > 0 else "--"
    if bandwidth_value <= 0 and virtual_summary:
        virtual_bandwidth = _to_float(virtual_summary.get("edge_bandwidth"), 0)
        if virtual_bandwidth <= 0:
            virtual_bandwidth = _to_float(virtual_summary.get("node_bandwidth"), 0)
        if virtual_bandwidth > 0:
            bandwidth_label = f"汇聚 {round(virtual_bandwidth, 1)} Gbps"

    return {
        "vertexId": vertex_id,
        "nodeId": node_id,
        "nodeName": row.get("node_name") or row.get("vertex_name") or node_id,
        "role": row.get("role_name") or row.get("vertex_role") or "算力节点",
        "status": row.get("status") or "online",
        "currentLoad": _to_float(row.get("current_load_pct")),
        "predictedLoad": _to_float(row.get("predicted_load_pct_10m")),
        "trustScore": trust,
        "latency": f"{latency_value if latency_value > 0 else 12} ms",
        "bandwidth": bandwidth_label,
        "isTarget": is_target,
        "selectedReason": context["selectedReason"] if is_target else None,
        "unselectedReason": None if is_target else "未选中：综合评分未达到目标节点，可能受预测负载、时延或风险扣分影响。",
        "candidateScore": candidate,
        "activeTasks": [
            {
                "id": item["id"],
                "name": item["name"],
                "type": item["type"],
                "status": item["status"],
                "progress": 42 if item["id"] == task_id else None,
            }
            for item in task_rows.get("tasks", [])
        ],
        "logs": [
            {
                "time": _format_metric_label(item["log_time"]),
                "phase": item["phase"] or "监控",
                "message": item["message"],
                "severity": item["severity"],
            }
            for item in reversed(log_rows)
        ],
        "alerts": [
            {
                "level": item["alert_level"] or "warning",
                "message": item["alert_message"],
                "metric": item["metric_code"],
                "value": _to_float(item.get("current_value")),
            }
            for item in alert_rows
        ],
        "updated_at": _timestamp_to_unix(datetime.utcnow()),
    }


def _forecast_metric_meta(metric: str) -> tuple[str, str, str]:
    if metric == "memory":
        return "memory_usage_pct", "%", "内存利用率"
    if metric == "bandwidth":
        return "bandwidth_usage_gbps", "Gbps", "网络带宽"
    return "cpu_usage_pct", "%", "CPU利用率"


def _fit_forecast_payload(
    rows: Sequence[Mapping[str, Any]],
    metric: str,
    mode: str,
    view_id: str,
    start: str | None = None,
    end: str | None = None,
) -> dict[str, Any] | None:
    if len(rows) < 3:
        return None

    _, unit, label = _forecast_metric_meta(metric)
    points = [(row["point_time"], float(row["value"])) for row in rows if row.get("point_time") is not None and row.get("value") is not None]
    if len(points) < 3:
        return None

    values = [value for _, value in points]
    if mode == "fixed":
        total_count = max(12, len(points))
        split_index = max(2, int(total_count * 0.62))
        timeline = [int(point_time.timestamp() * 1000) for point_time, _ in points[:total_count]]
        history_values = values[:total_count]
        if len(timeline) < total_count:
            return None
        step_ms = max(int((timeline[-1] - timeline[0]) / max(total_count - 1, 1)), 5 * 60 * 1000)
        cursor = split_index - 1
    else:
        history_values = values[-18:]
        history_times = [point_time for point_time, _ in points[-18:]]
        step_seconds = 5 * 60
        if len(history_times) >= 2:
            step_seconds = max(int((history_times[-1] - history_times[-2]).total_seconds()), 60)
        future_count = 8
        timeline = [int(point_time.timestamp() * 1000) for point_time in history_times]
        for index in range(1, future_count + 1):
            timeline.append(int((history_times[-1] + timedelta(seconds=step_seconds * index)).timestamp() * 1000))
        cursor = len(history_values) - 1
        total_count = len(timeline)
        step_ms = step_seconds * 1000

    window = history_values[-6:] if len(history_values) >= 6 else history_values
    base = sum(window) / len(window)
    slope = (history_values[-1] - history_values[0]) / max(len(history_values) - 1, 1)
    minimum = 10 if metric == "bandwidth" else 0
    maximum = 125 if metric == "bandwidth" else 100
    actual: list[float] = []
    predicted: list[float] = []
    lower: list[float] = []
    upper: list[float] = []

    for index in range(total_count):
        if index < len(history_values):
            actual_value = _to_float(history_values[index])
        else:
            actual_value = _to_float(history_values[-1])
        horizon = max(index - cursor, 0)
        seasonal = math.sin(index / 2.8) * (3.2 if metric != "bandwidth" else 4.8)
        fitted = base + slope * horizon + seasonal
        if index <= cursor:
            fitted = actual_value
        fitted = round(min(maximum, max(minimum, fitted)), 1)
        band = 8 if metric == "bandwidth" else 6
        actual.append(actual_value)
        predicted.append(fitted)
        lower.append(round(max(minimum, fitted - band), 1))
        upper.append(round(min(maximum + band, fitted + band), 1))

    return {
        "metric": metric,
        "mode": mode,
        "view_id": view_id,
        "timeline": timeline,
        "actual": actual,
        "predicted": predicted,
        "lower": lower,
        "upper": upper,
        "cursor": cursor,
        "unit": unit,
        "label": label,
        "source": "db_fit",
        "start": start,
        "end": end,
        "updated_at": _timestamp_to_unix(datetime.utcnow()),
    }


def _get_forecast_fit_from_db(
    session: Session,
    metric: str = "cpu",
    mode: str = "realtime",
    view_id: str = "global",
    start: str | None = None,
    end: str | None = None,
) -> dict[str, Any] | None:
    metric_table = _resolve_db_object(session, NODE_METRIC_TABLE_CANDIDATES)
    if not metric_table:
        return None

    column, _, _ = _forecast_metric_meta(metric)
    if column not in _get_object_columns(session, metric_table):
        return None

    node_ids = _view_node_ids(session, view_id)
    if not node_ids:
        rows = _query_rows(session, "SELECT node_id FROM dim_compute_node ORDER BY node_id LIMIT 20")
        node_ids = [str(row["node_id"]) for row in rows if row.get("node_id")]
    if not node_ids:
        return None

    if mode == "fixed" and start and end:
        try:
            start_time = datetime.fromisoformat(start.replace("Z", "+00:00"))
            end_time = datetime.fromisoformat(end.replace("Z", "+00:00"))
        except ValueError:
            return None
        rows = _query_rows(
            session,
            f"""
            SELECT metric_time AS point_time, AVG({column}) AS value
            FROM {metric_table}
            WHERE node_id = ANY(:node_ids)
              AND metric_time BETWEEN :start_time AND :end_time
            GROUP BY metric_time
            ORDER BY metric_time
            LIMIT 240
            """,
            {"node_ids": node_ids, "start_time": start_time, "end_time": end_time},
        )
    else:
        rows = _query_rows(
            session,
            f"""
            SELECT point_time, value
            FROM (
              SELECT metric_time AS point_time, AVG({column}) AS value
              FROM {metric_table}
              WHERE node_id = ANY(:node_ids)
              GROUP BY metric_time
              ORDER BY metric_time DESC
              LIMIT 36
            ) t
            ORDER BY point_time
            """,
            {"node_ids": node_ids},
        )

    return _fit_forecast_payload(rows, metric, mode, view_id, start, end)


def _fallback_forecast_fit(
    metric: str = "cpu",
    mode: str = "realtime",
    view_id: str = "global",
    start: str | None = None,
    end: str | None = None,
) -> dict[str, Any]:
    _, unit, label = _forecast_metric_meta(metric)
    now = datetime.utcnow()
    if mode == "fixed" and start and end:
        try:
            start_time = datetime.fromisoformat(start.replace("Z", "+00:00"))
            end_time = datetime.fromisoformat(end.replace("Z", "+00:00"))
        except ValueError:
            start_time = now - timedelta(hours=1)
            end_time = now
        count = 24
        duration = max((end_time - start_time).total_seconds(), 3600)
        rows = [
            {
                "point_time": start_time + timedelta(seconds=duration * index / (count - 1)),
                "value": 62 + math.sin(index / 2.4) * 7 + math.cos(index / 4.2) * 3,
            }
            for index in range(count)
        ]
    else:
        rows = [
            {
                "point_time": now - timedelta(minutes=(17 - index) * 5),
                "value": 61 + math.sin(index / 2.6) * 6 + index * 0.35,
            }
            for index in range(18)
        ]
    payload = _fit_forecast_payload(rows, metric, mode, view_id, start, end)
    if payload:
        payload["source"] = "fallback_fit"
        payload["unit"] = unit
        payload["label"] = label
        return payload
    return {
        "metric": metric,
        "mode": mode,
        "view_id": view_id,
        "timeline": [],
        "actual": [],
        "predicted": [],
        "lower": [],
        "upper": [],
        "cursor": 0,
        "unit": unit,
        "label": label,
        "updated_at": _timestamp_to_unix(now),
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


def _with_optional_data_source(
    db: Session | None,
    source: str,
    loader: Any,
    fallback: Any,
    empty_fallback: Any,
    *args: Any,
) -> Any:
    normalized_source = (source or "auto").lower()
    if normalized_source in ("json", "local", "local_json"):
        return fallback(*args)

    if normalized_source == "db":
        if db is not None:
            try:
                payload = loader(db, *args)
                if payload:
                    return payload
            except SQLAlchemyError:
                pass
        return empty_fallback(*args)

    return _with_db_fallback(db, loader, fallback, *args)


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


@sync_cached(ttl=120, key_prefix="perspectives")
def get_perspectives(db: Session | None = None, source: str = "auto") -> dict[str, Any]:
    return _with_optional_data_source(
        db,
        source,
        _get_perspectives_from_db,
        lambda: _get_json_perspectives(),
        lambda: {"perspectives": [], "updated_at": _timestamp_to_unix(datetime.utcnow()), "source": "db"},
    )


@sync_cached(ttl=30, key_prefix="kpi")
def get_kpi(view_id: str, db: Session | None = None) -> dict[str, Any]:
    return _with_db_fallback(db, _get_kpi_from_db, lambda _view_id: {}, view_id)


@sync_cached(ttl=30, key_prefix="top_load")
def get_top_load(view_id: str, db: Session | None = None) -> dict[str, Any]:
    return _with_db_fallback(db, _get_top_load_from_db, lambda _view_id: {"items": [], "updated_at": _timestamp_to_unix(datetime.utcnow())}, view_id)


@sync_cached(ttl=60, key_prefix="task_type")
def get_task_type_stats(view_id: str, db: Session | None = None) -> dict[str, Any]:
    return _with_db_fallback(db, _get_task_type_stats_from_db, lambda _view_id: {"items": [], "updated_at": _timestamp_to_unix(datetime.utcnow())}, view_id)


@sync_cached(ttl=120, key_prefix="topology_view")
def get_topology_view(view_id: str, db: Session | None = None, source: str = "auto") -> dict[str, Any]:
    return _with_optional_data_source(
        db,
        source,
        _get_topology_view_from_db,
        _get_json_topology_view,
        lambda _view_id: {"nodes": [], "edges": [], "events": [], "rerouteCount": 0, "offlineCount": 0, "newCount": 0, "updated_at": _timestamp_to_unix(datetime.utcnow()), "source": "db"},
        view_id,
    )


def get_schedule_logs(vertex_id: str, db: Session | None = None) -> dict[str, Any]:
    return _with_db_fallback(db, _get_schedule_logs_from_db, lambda _vertex_id: {"logs": [], "updated_at": _timestamp_to_unix(datetime.utcnow())}, vertex_id)


def get_active_tasks(node_id: str, db: Session | None = None) -> dict[str, Any]:
    return _with_db_fallback(db, _get_active_tasks_from_db, lambda _node_id: {"tasks": [], "updated_at": _timestamp_to_unix(datetime.utcnow())}, node_id)


def get_security_overview(view_id: str = "global", db: Session | None = None) -> dict[str, Any]:
    return _with_db_fallback(db, _get_security_overview_from_db, _fallback_security_overview, view_id)


def get_aggregation_strategy(task_id: str, db: Session | None = None) -> dict[str, Any]:
    return _with_db_fallback(db, _get_aggregation_strategy_from_db, _fallback_aggregation_strategy, task_id)


def get_decision_context(task_id: str, view_id: str = "global", db: Session | None = None) -> dict[str, Any]:
    return _with_db_fallback(db, _get_decision_context_from_db, _fallback_decision_context, task_id, view_id)


def get_topology_node_insight(vertex_id: str, task_id: str = "task-fedtrain-99943", db: Session | None = None) -> dict[str, Any]:
    return _with_db_fallback(db, _get_node_insight_from_db, _fallback_node_insight, vertex_id, task_id)


@sync_cached(ttl=30, key_prefix="forecast")
def get_forecast_fit(
    metric: str = "cpu",
    mode: str = "realtime",
    view_id: str = "global",
    start: str | None = None,
    end: str | None = None,
    db: Session | None = None,
) -> dict[str, Any]:
    normalized_metric = metric if metric in ("cpu", "memory", "bandwidth") else "cpu"
    normalized_mode = mode if mode in ("realtime", "fixed") else "realtime"
    return _with_db_fallback(
        db,
        _get_forecast_fit_from_db,
        _fallback_forecast_fit,
        normalized_metric,
        normalized_mode,
        view_id,
        start,
        end,
    )
