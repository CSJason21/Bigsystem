from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.prediction_allocation_data import (
    get_active_tasks,
    get_allocation_results,
    get_aggregation_strategy,
    get_decision_context,
    get_forecast_fit,
    get_kpi,
    get_node_dashboard,
    get_node_history,
    get_nodes,
    get_nodes_overview,
    get_perspectives,
    get_schedule_logs,
    get_security_overview,
    get_strategy_comparison,
    get_task_type_stats,
    get_top_load,
    get_topology_node_insight,
    get_topology_view,
    get_traffic_lines,
    get_traffic_sankey,
)


router = APIRouter()


@router.get("/perspectives")
async def perspectives(
    source: str = Query("auto", description="Data source: auto, db, or json"),
    db: Session = Depends(get_db),
):
    return get_perspectives(db, source=source)


@router.get("/kpi")
async def kpi(view_id: str = Query("global"), db: Session = Depends(get_db)):
    return get_kpi(view_id, db)


@router.get("/top-load")
async def top_load(view_id: str = Query("global"), db: Session = Depends(get_db)):
    return get_top_load(view_id, db)


@router.get("/task-type-stats")
async def task_type_stats(view_id: str = Query("global"), db: Session = Depends(get_db)):
    return get_task_type_stats(view_id, db)


@router.get("/topology/view")
async def topology_view(
    view_id: str = Query("global"),
    source: str = Query("auto", description="Data source: auto, db, or json"),
    db: Session = Depends(get_db),
):
    return get_topology_view(view_id, db, source=source)


@router.get("/topology/node-insight")
async def topology_node_insight(
    vertex_id: str = Query(...),
    task_id: str = Query("task-fedtrain-99943"),
    db: Session = Depends(get_db),
):
    return get_topology_node_insight(vertex_id, task_id, db)


@router.get("/schedule/logs")
async def schedule_logs(vertex_id: str = Query("national-center"), db: Session = Depends(get_db)):
    return get_schedule_logs(vertex_id, db)


@router.get("/security/overview")
async def security_overview(view_id: str = Query("global"), db: Session = Depends(get_db)):
    return get_security_overview(view_id, db)


@router.get("/strategy/aggregation")
async def aggregation_strategy(task_id: str = Query("task-fedtrain-99943"), db: Session = Depends(get_db)):
    return get_aggregation_strategy(task_id, db)


@router.get("/decision/context")
async def decision_context(
    task_id: str = Query("task-fedtrain-99943"),
    view_id: str = Query("global"),
    db: Session = Depends(get_db),
):
    return get_decision_context(task_id, view_id, db)


@router.get("/forecast")
async def forecast(
    metric: str = Query("cpu"),
    mode: str = Query("realtime"),
    view_id: str = Query("global"),
    start: str | None = Query(None),
    end: str | None = Query(None),
    db: Session = Depends(get_db),
):
    return get_forecast_fit(metric, mode, view_id, start, end, db)


@router.get("/tasks/active")
async def active_tasks(node_id: str = Query(...), db: Session = Depends(get_db)):
    return get_active_tasks(node_id, db)


@router.get("/nodes")
async def list_nodes(db: Session = Depends(get_db)):
    return get_nodes(db)


@router.get("/nodes/overview")
async def nodes_overview(db: Session = Depends(get_db)):
    return get_nodes_overview(db)


@router.get("/nodes/{node_id}/dashboard")
async def node_dashboard(node_id: str, db: Session = Depends(get_db)):
    dashboard = get_node_dashboard(node_id, db)
    if dashboard is None:
        raise HTTPException(status_code=404, detail=f"Node '{node_id}' not found")
    return dashboard


@router.get("/nodes/{node_id}/history")
async def node_history(
    node_id: str,
    period: str = Query("1h", description="Time range label for the current history view"),
    db: Session = Depends(get_db),
):
    history = get_node_history(node_id, period, db)
    if history is None:
        raise HTTPException(status_code=404, detail=f"Node '{node_id}' not found")
    return history


@router.get("/results")
async def allocation_results(db: Session = Depends(get_db)):
    return get_allocation_results(db)


@router.get("/strategy-comparison")
async def strategy_comparison(db: Session = Depends(get_db)):
    return get_strategy_comparison(db)


@router.get("/traffic/sankey")
async def traffic_sankey(db: Session = Depends(get_db)):
    return get_traffic_sankey(db)


@router.get("/traffic/lines")
async def traffic_lines(
    period: str = Query("6h", description="Time range label for the current traffic view"),
    db: Session = Depends(get_db),
):
    lines = dict(get_traffic_lines(db))
    lines["period"] = period
    return lines
