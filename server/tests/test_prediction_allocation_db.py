from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.services.prediction_allocation_data import (
    get_node_dashboard,
    get_node_history,
    get_nodes,
    get_nodes_overview,
)


def _build_test_session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text(
            """
            CREATE TABLE dim_compute_node (
                node_id TEXT PRIMARY KEY,
                node_name TEXT NOT NULL,
                hostname TEXT,
                ip_address TEXT,
                status TEXT,
                cpu_cores INTEGER,
                memory_total_gb REAL,
                disk_total_gb REAL,
                gpu_count INTEGER,
                gpu_type TEXT,
                running_tasks INTEGER,
                rack_code TEXT,
                az_code TEXT,
                updated_at TEXT
            )
            """
        ))
        conn.execute(text(
            """
            CREATE TABLE ts_node_metric (
                node_id TEXT NOT NULL,
                metric_time TEXT NOT NULL,
                cpu_usage_pct REAL,
                memory_usage_pct REAL,
                gpu_usage_pct REAL,
                disk_usage_pct REAL
            )
            """
        ))
        conn.execute(text(
            """
            INSERT INTO dim_compute_node (
                node_id, node_name, hostname, ip_address, status, cpu_cores,
                memory_total_gb, disk_total_gb, gpu_count, gpu_type,
                running_tasks, rack_code, az_code, updated_at
            ) VALUES
                ('node-a', 'node-a-name', 'node-a-host', '10.0.0.1', 'online', 64, 256, 1024, 4, 'A100', 7, 'rack-a', 'zone-a', '2026-05-14T10:00:00'),
                ('node-b', 'node-b-name', 'node-b-host', '10.0.0.2', 'warning', 32, 128, 512, 2, 'T4', 3, 'rack-b', 'zone-b', '2026-05-14T10:00:00')
            """
        ))
        conn.execute(text(
            """
            INSERT INTO ts_node_metric (
                node_id, metric_time, cpu_usage_pct, memory_usage_pct, gpu_usage_pct, disk_usage_pct
            ) VALUES
                ('node-a', '2026-05-14T09:58:00', 51.0, 60.0, 72.0, 40.0),
                ('node-a', '2026-05-14T09:59:00', 63.0, 65.0, 81.0, 44.0),
                ('node-b', '2026-05-14T09:58:00', 21.0, 30.0, 12.0, 18.0),
                ('node-b', '2026-05-14T09:59:00', 29.0, 36.0, 18.0, 24.0)
            """
        ))
        conn.execute(text(
            """
            CREATE VIEW vw_node_runtime_snapshot AS
            SELECT
                n.node_id,
                n.node_name,
                n.status,
                m.cpu_usage_pct AS cpu_percent,
                m.memory_usage_pct AS mem_percent,
                m.gpu_usage_pct AS gpu_percent,
                m.disk_usage_pct AS disk_percent,
                n.running_tasks,
                m.metric_time AS latest_metric_time
            FROM dim_compute_node n
            JOIN ts_node_metric m
              ON m.node_id = n.node_id
            WHERE m.metric_time = (
                SELECT MAX(m2.metric_time)
                FROM ts_node_metric m2
                WHERE m2.node_id = n.node_id
            )
            """
        ))

    return Session(engine)


def test_get_nodes_prefers_database():
    with _build_test_session() as db:
        payload = get_nodes(db)

    assert [node["node_id"] for node in payload["nodes"]] == ["node-a", "node-b"]
    assert payload["nodes"][0]["cpu"] == 63.0
    assert payload["nodes"][1]["gpu_model"] == "T4"


def test_get_nodes_overview_prefers_database():
    with _build_test_session() as db:
        payload = get_nodes_overview(db)

    assert payload["process_total"] == 10
    assert payload["top_nodes"][0]["node_id"] == "node-a"


def test_get_node_dashboard_prefers_database():
    with _build_test_session() as db:
        payload = get_node_dashboard("node-a", db)

    assert payload is not None
    assert payload["node_id"] == "node-a"
    assert payload["cpu_total_usage"] == 63.0
    assert payload["gpu_memory_total_gb"] == 320.0
    assert payload["disk_used_gb"] == 450.6


def test_get_node_history_prefers_database():
    with _build_test_session() as db:
        payload = get_node_history("node-b", "1h", db)

    assert payload is not None
    assert payload["node_id"] == "node-b"
    assert payload["cpu_usage"] == [21.0, 29.0]
    assert payload["memory_usage"] == [30.0, 36.0]
