from fastapi import APIRouter, HTTPException, Query

from app.services.prediction_allocation_data import (
    get_allocation_results,
    get_node_dashboard,
    get_node_history,
    get_nodes,
    get_nodes_overview,
    get_strategy_comparison,
    get_traffic_lines,
    get_traffic_sankey,
)


router = APIRouter()


@router.get("/nodes")
async def list_nodes():
    return get_nodes()


@router.get("/nodes/overview")
async def nodes_overview():
    return get_nodes_overview()


@router.get("/nodes/{node_id}/dashboard")
async def node_dashboard(node_id: str):
    dashboard = get_node_dashboard(node_id)
    if dashboard is None:
        raise HTTPException(status_code=404, detail=f"Node '{node_id}' not found")
    return dashboard


@router.get("/nodes/{node_id}/history")
async def node_history(
    node_id: str,
    period: str = Query("1h", description="Time range label for the current history view"),
):
    history = get_node_history(node_id, period)
    if history is None:
        raise HTTPException(status_code=404, detail=f"Node '{node_id}' not found")
    return history


@router.get("/results")
async def allocation_results():
    return get_allocation_results()


@router.get("/strategy-comparison")
async def strategy_comparison():
    return get_strategy_comparison()


@router.get("/traffic/sankey")
async def traffic_sankey():
    return get_traffic_sankey()


@router.get("/traffic/lines")
async def traffic_lines(
    period: str = Query("6h", description="Time range label for the current traffic view"),
):
    lines = dict(get_traffic_lines())
    lines["period"] = period
    return lines
