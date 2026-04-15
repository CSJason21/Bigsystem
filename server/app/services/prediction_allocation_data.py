from __future__ import annotations

import json
from pathlib import Path
from typing import Any


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


def _read_json(file_name: str) -> Any:
    file_path = DATA_DIR / file_name
    with file_path.open("r", encoding="utf-8") as file:
        return json.load(file)


def load_prediction_allocation_dataset() -> dict[str, Any]:
    return {key: _read_json(file_name) for key, file_name in DATA_FILES.items()}


def get_daily_prediction() -> dict[str, Any]:
    return load_prediction_allocation_dataset()["daily_prediction"]


def get_monthly_prediction() -> dict[str, Any]:
    return load_prediction_allocation_dataset()["monthly_prediction"]


def get_allocation_results() -> dict[str, Any]:
    return load_prediction_allocation_dataset()["allocation_results"]


def get_strategy_comparison() -> dict[str, Any]:
    return load_prediction_allocation_dataset()["strategy_comparison"]


def get_nodes() -> dict[str, Any]:
    return load_prediction_allocation_dataset()["nodes"]


def get_nodes_overview() -> dict[str, Any]:
    return load_prediction_allocation_dataset()["nodes_overview"]


def get_node_dashboard(node_id: str) -> dict[str, Any] | None:
    dashboard_dataset = load_prediction_allocation_dataset()["node_dashboards"]
    dashboards = dashboard_dataset["dashboards"]
    dashboard = dashboards.get(node_id)

    if dashboard is None:
        return None

    payload = dict(dashboard)
    payload["updated_at"] = dashboard_dataset.get("updated_at")
    return payload


def get_node_history(node_id: str, period: str = "1h") -> dict[str, Any] | None:
    history_dataset = load_prediction_allocation_dataset()["node_histories"]
    histories = history_dataset["histories"]
    history = histories.get(node_id)

    if history is None:
        return None

    payload = dict(history)
    payload["updated_at"] = history_dataset.get("updated_at")

    if period != payload.get("period", "1h"):
        payload["period"] = period

    return payload


def get_traffic_sankey() -> dict[str, Any]:
    return load_prediction_allocation_dataset()["traffic_sankey"]


def get_traffic_lines() -> dict[str, Any]:
    return load_prediction_allocation_dataset()["traffic_lines"]
