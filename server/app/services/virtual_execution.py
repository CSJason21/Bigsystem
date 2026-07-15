from __future__ import annotations

import asyncio
from contextlib import suppress

from loguru import logger
from sqlalchemy import text

from app.core.cache import clear_all_cache
from app.services.scheduling_context import ensure_scheduler_tables, get_computing_network_engine
from app.services.task_flow_logger import log_flow_event, set_task_state


_task: asyncio.Task | None = None
_stop_event: asyncio.Event | None = None


def _write_schedule_log(conn, task_id: str, node_id: str, phase: str, message: str, severity: str = "info") -> None:
    try:
        vertex_row = conn.execute(text("""
            SELECT vertex_id
            FROM dim_topology_vertex
            WHERE compute_node_id = :node_id OR vertex_id = :node_id
            LIMIT 1
        """), {"node_id": node_id}).mappings().first()
        vertex_id = vertex_row["vertex_id"] if vertex_row else node_id
        conn.execute(text("""
            INSERT INTO fact_schedule_log(task_id, vertex_id, phase, log_time, message, severity)
            VALUES (:task_id, :vertex_id, :phase, NOW(), :message, :severity)
        """), {
            "task_id": task_id,
            "vertex_id": vertex_id,
            "phase": phase,
            "message": message,
            "severity": severity,
        })
    except Exception as exc:
        logger.debug(f"[virtual-execution] write schedule log skipped: {exc}")


def _poll_once() -> None:
    engine = get_computing_network_engine()
    with engine.begin() as conn:
        ensure_scheduler_tables(conn)
        rows = conn.execute(text("""
            SELECT
              lock_id, task_id, target_node_id, locked_at, expected_release_at,
              EXTRACT(EPOCH FROM (NOW() - locked_at)) AS elapsed_sec,
              GREATEST(EXTRACT(EPOCH FROM (expected_release_at - locked_at)), 1) AS total_sec
            FROM fact_task_resource_lock
            WHERE lock_status = 'active'
              AND expected_release_at IS NOT NULL
            ORDER BY locked_at ASC
            LIMIT 100
        """)).mappings().all()
        for row in rows:
            task_id = row["task_id"]
            node_id = row["target_node_id"]
            elapsed = float(row["elapsed_sec"] or 0)
            total = max(float(row["total_sec"] or 1), 1)
            progress = max(5, min(99, round(elapsed / total * 100, 1)))
            if elapsed >= total:
                conn.execute(text("""
                    UPDATE fact_task
                    SET status = 'completed', progress = 100, end_time = COALESCE(end_time, NOW()), updated_at = NOW()
                    WHERE task_id = :task_id
                """), {"task_id": task_id})
                conn.execute(text("""
                    UPDATE fact_task_assignment
                    SET assignment_status = 'completed', released_at = COALESCE(released_at, NOW())
                    WHERE task_id = :task_id AND target_node_id = :node_id AND assignment_status IN ('running', 'scheduled')
                """), {"task_id": task_id, "node_id": node_id})
                conn.execute(text("""
                    UPDATE fact_task_resource_lock
                    SET lock_status = 'released', released_at = COALESCE(released_at, NOW())
                    WHERE lock_id = :lock_id
                """), {"lock_id": row["lock_id"]})
                set_task_state(task_id, "completed")
                log_flow_event(task_id, "completed", f"虚拟执行完成，已释放节点 {node_id} 的资源预留。", "虚拟执行器")
                _write_schedule_log(conn, task_id, node_id, "完成", f"任务虚拟执行完成，资源 lock 已释放：{node_id}", "success")
                clear_all_cache()
            else:
                conn.execute(text("""
                    UPDATE fact_task
                    SET status = 'running', progress = :progress, start_time = COALESCE(start_time, NOW()), updated_at = NOW()
                    WHERE task_id = :task_id AND status IN ('scheduled', 'running', 'scheduling', 'pending')
                """), {"task_id": task_id, "progress": progress})


async def _run_loop() -> None:
    assert _stop_event is not None
    logger.info("[virtual-execution] started")
    while not _stop_event.is_set():
        try:
            await asyncio.to_thread(_poll_once)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.debug(f"[virtual-execution] poll skipped: {exc}")
        with suppress(asyncio.TimeoutError):
            await asyncio.wait_for(_stop_event.wait(), timeout=10)
    logger.info("[virtual-execution] stopped")


def start_virtual_execution_service() -> None:
    global _task, _stop_event
    if _task and not _task.done():
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    _stop_event = asyncio.Event()
    _task = loop.create_task(_run_loop())


def stop_virtual_execution_service() -> None:
    global _task, _stop_event
    if _stop_event:
        _stop_event.set()
    if _task and not _task.done():
        _task.cancel()
