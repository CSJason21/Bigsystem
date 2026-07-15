from __future__ import annotations

import math
import os
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone


DB_NAME = "computing_network"
DB_USER = "postgres"
DB_PASSWORD = "123456"
DB_HOST = "localhost"
DB_PORT = 5432
PSQL = r"C:\Program Files\PostgreSQL\18\bin\psql.exe"


def run_psql(database: str, sql: str) -> None:
    env = {**os.environ, "PGPASSWORD": DB_PASSWORD}
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as file:
        file.write(sql)
        sql_path = file.name
    try:
        subprocess.run(
            [
                PSQL,
                "-v",
                "ON_ERROR_STOP=1",
                "-h",
                DB_HOST,
                "-p",
                str(DB_PORT),
                "-U",
                DB_USER,
                "-d",
                database,
                "-f",
                sql_path,
            ],
            check=True,
            env=env,
        )
    finally:
        try:
            os.remove(sql_path)
        except OSError:
            pass


def ensure_database() -> None:
    run_psql("postgres", f"SELECT 'CREATE DATABASE {DB_NAME}' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '{DB_NAME}')\\gexec\n")


DDL = """
DROP VIEW IF EXISTS vw_task_stats_snapshot;
DROP VIEW IF EXISTS vw_node_runtime_snapshot;
DROP TABLE IF EXISTS ts_forecast_point;
DROP TABLE IF EXISTS fact_forecast_run;
DROP TABLE IF EXISTS fact_schedule_log;
DROP TABLE IF EXISTS fact_task_assignment;
DROP TABLE IF EXISTS fact_task_requirement;
DROP TABLE IF EXISTS fact_federated_task;
DROP TABLE IF EXISTS fact_task;
DROP TABLE IF EXISTS fact_alert_record;
DROP TABLE IF EXISTS cfg_alert_threshold;
DROP TABLE IF EXISTS ts_resource_trend_5m;
DROP TABLE IF EXISTS ts_node_metric;
DROP TABLE IF EXISTS dim_node_gpu_device;
DROP TABLE IF EXISTS fact_topology_runtime_state;
DROP TABLE IF EXISTS dim_topology_layout;
DROP TABLE IF EXISTS dim_topology_edge;
DROP TABLE IF EXISTS dim_topology_vertex;
DROP TABLE IF EXISTS dim_topology_view;
DROP TABLE IF EXISTS dim_client;
DROP TABLE IF EXISTS dim_compute_node;
DROP TABLE IF EXISTS dim_supercomputing_center;
DROP TABLE IF EXISTS dim_region;

CREATE TABLE dim_region (
  region_id VARCHAR(50) PRIMARY KEY,
  region_name VARCHAR(100) NOT NULL,
  region_level VARCHAR(20) NOT NULL,
  parent_region_id VARCHAR(50),
  display_order INT DEFAULT 0,
  longitude DOUBLE PRECISION,
  latitude DOUBLE PRECISION,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE dim_supercomputing_center (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  region_id VARCHAR(50) REFERENCES dim_region(region_id),
  longitude DOUBLE PRECISION,
  latitude DOUBLE PRECISION,
  compute_power DOUBLE PRECISION,
  cpu_cores INT,
  gpu_type VARCHAR(50),
  gpu_count INT,
  network_bw VARCHAR(20),
  capability_score DOUBLE PRECISION,
  center_level VARCHAR(20),
  province VARCHAR(30),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (capability_score IS NULL OR capability_score BETWEEN 0 AND 100)
);

CREATE TABLE dim_compute_node (
  node_id VARCHAR(64) PRIMARY KEY,
  node_name VARCHAR(128) NOT NULL UNIQUE,
  hostname VARCHAR(128),
  region_id VARCHAR(50) REFERENCES dim_region(region_id),
  layer VARCHAR(20),
  node_code VARCHAR(50) UNIQUE,
  ip_address VARCHAR(45),
  management_ip VARCHAR(45),
  agent_port INT,
  location VARCHAR(200),
  role_name VARCHAR(100),
  provider_name VARCHAR(100),
  compute_type VARCHAR(20),
  architecture VARCHAR(100),
  os_name VARCHAR(100),
  cpu_cores INT,
  memory_total_gb DOUBLE PRECISION,
  disk_total_gb DOUBLE PRECISION,
  gpu_type VARCHAR(50),
  gpu_count INT DEFAULT 0,
  network_bandwidth_mbps INT,
  bandwidth_total_gbps DOUBLE PRECISION,
  rack_code VARCHAR(50),
  az_code VARCHAR(50),
  status VARCHAR(32) DEFAULT 'online',
  warning_level VARCHAR(20) DEFAULT 'normal',
  avg_response_time DOUBLE PRECISION,
  task_success_rate DOUBLE PRECISION,
  total_tasks_completed INT DEFAULT 0,
  running_tasks INT DEFAULT 0,
  health_score DOUBLE PRECISION,
  source_type VARCHAR(30) DEFAULT 'synthetic_realistic',
  join_time TIMESTAMPTZ DEFAULT NOW(),
  retire_time TIMESTAMPTZ,
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (task_success_rate IS NULL OR task_success_rate BETWEEN 0 AND 1),
  CHECK (health_score IS NULL OR health_score BETWEEN 0 AND 100)
);

CREATE TABLE dim_client (
  id BIGSERIAL PRIMARY KEY,
  client_id VARCHAR(100) NOT NULL UNIQUE,
  client_name VARCHAR(100),
  edge_node_id VARCHAR(64) NOT NULL REFERENCES dim_compute_node(node_id),
  status VARCHAR(20) DEFAULT 'online',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE dim_topology_view (
  view_id VARCHAR(50) PRIMARY KEY,
  view_name VARCHAR(100) NOT NULL,
  view_kind VARCHAR(20) NOT NULL,
  region_id VARCHAR(50) REFERENCES dim_region(region_id),
  node_id VARCHAR(64) REFERENCES dim_compute_node(node_id),
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE dim_topology_vertex (
  vertex_id VARCHAR(50) PRIMARY KEY,
  vertex_type VARCHAR(20) NOT NULL,
  vertex_role VARCHAR(50),
  vertex_name VARCHAR(100) NOT NULL,
  subtitle VARCHAR(100),
  region_id VARCHAR(50) REFERENCES dim_region(region_id),
  compute_node_id VARCHAR(64) REFERENCES dim_compute_node(node_id),
  supercomputing_id INT REFERENCES dim_supercomputing_center(id),
  client_id BIGINT REFERENCES dim_client(id),
  service_code VARCHAR(30),
  status VARCHAR(20) DEFAULT 'online',
  is_physical BOOLEAN DEFAULT TRUE,
  is_schedulable BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE dim_topology_edge (
  edge_id BIGSERIAL PRIMARY KEY,
  source_vertex_id VARCHAR(50) NOT NULL REFERENCES dim_topology_vertex(vertex_id),
  target_vertex_id VARCHAR(50) NOT NULL REFERENCES dim_topology_vertex(vertex_id),
  edge_role VARCHAR(20),
  is_directed BOOLEAN DEFAULT TRUE,
  capacity_bandwidth_mbps DOUBLE PRECISION,
  capacity_qps DOUBLE PRECISION,
  priority INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE dim_topology_layout (
  id BIGSERIAL PRIMARY KEY,
  view_id VARCHAR(50) NOT NULL REFERENCES dim_topology_view(view_id),
  vertex_id VARCHAR(50) NOT NULL REFERENCES dim_topology_vertex(vertex_id),
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  size_hint DOUBLE PRECISION,
  layout_version VARCHAR(20) DEFAULT 'v1'
);

CREATE TABLE fact_topology_runtime_state (
  state_id BIGSERIAL PRIMARY KEY,
  vertex_id VARCHAR(50) NOT NULL REFERENCES dim_topology_vertex(vertex_id),
  snapshot_time TIMESTAMPTZ NOT NULL,
  status VARCHAR(20),
  current_load_pct DOUBLE PRECISION,
  predicted_load_pct_10m DOUBLE PRECISION,
  badge_text VARCHAR(50),
  highlight_level VARCHAR(20) DEFAULT 'normal',
  task_target_flag BOOLEAN DEFAULT FALSE,
  source_type VARCHAR(30) DEFAULT 'synthetic_realistic'
);

CREATE TABLE dim_node_gpu_device (
  gpu_id BIGSERIAL PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL REFERENCES dim_compute_node(node_id),
  gpu_index INT NOT NULL,
  gpu_name VARCHAR(50),
  gpu_model VARCHAR(50),
  gpu_memory_total_gb DOUBLE PRECISION,
  gpu_compute_capability VARCHAR(20),
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(node_id, gpu_index)
);

CREATE TABLE ts_node_metric (
  id BIGSERIAL PRIMARY KEY,
  metric_time TIMESTAMPTZ NOT NULL,
  node_id VARCHAR(64) NOT NULL REFERENCES dim_compute_node(node_id),
  node_type VARCHAR(20),
  cpu_usage_pct DOUBLE PRECISION,
  memory_usage_pct DOUBLE PRECISION,
  memory_used_gb DOUBLE PRECISION,
  gpu_usage_pct DOUBLE PRECISION,
  gpu_memory_pct DOUBLE PRECISION,
  network_rx_kbps BIGINT,
  network_tx_kbps BIGINT,
  network_in_mbps DOUBLE PRECISION,
  network_out_mbps DOUBLE PRECISION,
  disk_usage_pct DOUBLE PRECISION,
  bandwidth_usage_gbps DOUBLE PRECISION,
  latency_ms DOUBLE PRECISION,
  jitter_ms DOUBLE PRECISION,
  packet_loss_pct DOUBLE PRECISION,
  temperature_c DOUBLE PRECISION,
  health_score DOUBLE PRECISION,
  running_tasks INT,
  source_type VARCHAR(30) DEFAULT 'synthetic_realistic'
);

CREATE TABLE ts_resource_trend_5m (
  id BIGSERIAL PRIMARY KEY,
  metric_time TIMESTAMPTZ NOT NULL,
  avg_cpu_pct DOUBLE PRECISION,
  avg_memory_pct DOUBLE PRECISION,
  avg_gpu_pct DOUBLE PRECISION,
  node_count INT,
  source_type VARCHAR(30) DEFAULT 'synthetic_realistic'
);

CREATE TABLE cfg_alert_threshold (
  id SERIAL PRIMARY KEY,
  metric_code VARCHAR(30) NOT NULL UNIQUE,
  metric_name VARCHAR(50) NOT NULL,
  unit VARCHAR(10) DEFAULT '%',
  warning_threshold DOUBLE PRECISION NOT NULL,
  critical_threshold DOUBLE PRECISION NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fact_alert_record (
  id BIGSERIAL PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL REFERENCES dim_compute_node(node_id),
  node_name VARCHAR(100),
  metric_code VARCHAR(30) NOT NULL REFERENCES cfg_alert_threshold(metric_code),
  metric_name VARCHAR(50),
  current_value DOUBLE PRECISION NOT NULL,
  threshold_value DOUBLE PRECISION NOT NULL,
  alert_level VARCHAR(10) NOT NULL,
  alert_message TEXT,
  status VARCHAR(20) DEFAULT 'active',
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  acknowledged_by VARCHAR(50),
  source_type VARCHAR(30) DEFAULT 'auto_detected'
);

CREATE TABLE fact_task (
  task_id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128),
  task_name VARCHAR(128),
  task_type VARCHAR(32),
  business_type VARCHAR(50),
  status VARCHAR(32) DEFAULT 'pending',
  priority VARCHAR(32) DEFAULT 'medium',
  priority_level INT DEFAULT 3,
  progress DOUBLE PRECISION DEFAULT 0,
  user_id VARCHAR(50),
  group_id VARCHAR(50),
  assigned_node_id VARCHAR(64) REFERENCES dim_compute_node(node_id),
  qos VARCHAR(16),
  sla_level VARCHAR(20),
  fit_score DOUBLE PRECISION,
  wait_time DOUBLE PRECISION,
  duration INT,
  source_region_id VARCHAR(50) REFERENCES dim_region(region_id),
  source_system VARCHAR(50),
  tenant_id VARCHAR(50),
  description TEXT,
  logs TEXT,
  submit_time TIMESTAMPTZ DEFAULT NOW(),
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  source_type VARCHAR(30) DEFAULT 'synthetic_realistic',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (progress BETWEEN 0 AND 100)
);

CREATE TABLE fact_federated_task (
  task_id VARCHAR(64) PRIMARY KEY REFERENCES fact_task(task_id),
  aggregation_algorithm VARCHAR(50),
  encryption_type VARCHAR(50),
  rounds_total INT,
  rounds_current INT DEFAULT 0,
  min_participants INT,
  model_name VARCHAR(100),
  model_version VARCHAR(20),
  global_accuracy DOUBLE PRECISION,
  global_loss DOUBLE PRECISION,
  parameters_count BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fact_task_requirement (
  task_id VARCHAR(64) PRIMARY KEY REFERENCES fact_task(task_id),
  cpu_requested DOUBLE PRECISION,
  memory_requested DOUBLE PRECISION,
  gpu_requested DOUBLE PRECISION,
  gpu_type_requested VARCHAR(50),
  gpu_memory_requested DOUBLE PRECISION,
  storage_requested DOUBLE PRECISION,
  bandwidth_requested DOUBLE PRECISION,
  required_cpu_cores DOUBLE PRECISION,
  required_memory_gb DOUBLE PRECISION,
  required_gpu_count INT,
  required_gpu_memory_gb DOUBLE PRECISION,
  required_bandwidth_gbps DOUBLE PRECISION,
  required_disk_gb DOUBLE PRECISION,
  estimated_duration_sec INT,
  estimated_latency_ms DOUBLE PRECISION,
  affinity_region_id VARCHAR(50),
  anti_affinity_node_id VARCHAR(64)
);

CREATE TABLE fact_task_assignment (
  assignment_id BIGSERIAL PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL REFERENCES fact_task(task_id),
  target_node_id VARCHAR(64) NOT NULL REFERENCES dim_compute_node(node_id),
  pool_id VARCHAR(50),
  match_score DOUBLE PRECISION,
  estimated_latency_ms DOUBLE PRECISION,
  cpu_allocated DOUBLE PRECISION,
  memory_allocated DOUBLE PRECISION,
  gpu_allocated DOUBLE PRECISION,
  gpu_pct_allocated DOUBLE PRECISION,
  bandwidth_allocated DOUBLE PRECISION,
  storage_allocated DOUBLE PRECISION,
  allocated_cpu_cores DOUBLE PRECISION,
  allocated_memory_gb DOUBLE PRECISION,
  allocated_gpu_count INT,
  allocated_gpu_pct DOUBLE PRECISION,
  allocated_bandwidth_gbps DOUBLE PRECISION,
  allocated_disk_gb DOUBLE PRECISION,
  assignment_status VARCHAR(20) DEFAULT 'running',
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

CREATE TABLE fact_schedule_log (
  log_id BIGSERIAL PRIMARY KEY,
  task_id VARCHAR(64) REFERENCES fact_task(task_id),
  vertex_id VARCHAR(50) NOT NULL REFERENCES dim_topology_vertex(vertex_id),
  phase VARCHAR(20),
  log_time TIMESTAMPTZ DEFAULT NOW(),
  message TEXT NOT NULL,
  severity VARCHAR(20) DEFAULT 'info',
  extra_json JSONB,
  source_type VARCHAR(30) DEFAULT 'synthetic_realistic'
);

CREATE TABLE fact_forecast_run (
  forecast_run_id BIGSERIAL PRIMARY KEY,
  forecast_type VARCHAR(30) NOT NULL,
  metric_name VARCHAR(30) NOT NULL,
  target_level VARCHAR(20) NOT NULL,
  target_id VARCHAR(50) NOT NULL,
  horizon_minutes INT,
  granularity_seconds INT,
  model_name VARCHAR(80),
  model_version VARCHAR(20),
  run_time TIMESTAMPTZ DEFAULT NOW(),
  source_type VARCHAR(30) DEFAULT 'synthetic_realistic',
  status VARCHAR(20) DEFAULT 'success'
);

CREATE TABLE ts_forecast_point (
  id BIGSERIAL PRIMARY KEY,
  forecast_run_id BIGINT NOT NULL REFERENCES fact_forecast_run(forecast_run_id),
  point_time TIMESTAMPTZ NOT NULL,
  actual_value DOUBLE PRECISION,
  predicted_value DOUBLE PRECISION,
  lower_bound DOUBLE PRECISION,
  upper_bound DOUBLE PRECISION,
  point_role VARCHAR(20) DEFAULT 'forecast'
);

CREATE INDEX idx_ts_node_metric_node_time ON ts_node_metric(node_id, metric_time DESC);
CREATE INDEX idx_task_assignment_node_time ON fact_task_assignment(target_node_id, assigned_at DESC);
CREATE INDEX idx_schedule_log_vertex_time ON fact_schedule_log(vertex_id, log_time DESC);
CREATE INDEX idx_forecast_point_run_time ON ts_forecast_point(forecast_run_id, point_time);
CREATE INDEX idx_topology_state_vertex_time ON fact_topology_runtime_state(vertex_id, snapshot_time DESC);

CREATE OR REPLACE VIEW vw_node_runtime_snapshot AS
SELECT
  n.node_id,
  n.node_name,
  COALESCE(n.node_code, n.node_name) AS node_code,
  n.hostname,
  n.ip_address,
  n.region_id,
  n.layer,
  n.status,
  CASE n.status WHEN 'maintenance' THEN 'warning' ELSE n.status END AS display_status,
  n.location,
  n.role_name,
  n.provider_name,
  n.gpu_type,
  n.gpu_count,
  n.cpu_cores,
  n.memory_total_gb,
  n.disk_total_gb,
  n.bandwidth_total_gbps,
  n.running_tasks,
  n.health_score,
  COALESCE(m.cpu_usage_pct, 0) AS cpu_percent,
  COALESCE(m.memory_usage_pct, 0) AS mem_percent,
  COALESCE(m.gpu_usage_pct, 0) AS gpu_percent,
  COALESCE(m.disk_usage_pct, 0) AS disk_percent,
  COALESCE(m.bandwidth_usage_gbps, 0) AS bandwidth_usage_gbps,
  COALESCE(m.latency_ms, 0) AS latency_ms,
  COALESCE(m.jitter_ms, 0) AS jitter_ms,
  COALESCE(m.packet_loss_pct, 0) AS packet_loss_pct,
  m.metric_time AS latest_metric_time
FROM dim_compute_node n
LEFT JOIN LATERAL (
  SELECT *
  FROM ts_node_metric m
  WHERE m.node_id = n.node_id
  ORDER BY m.metric_time DESC
  LIMIT 1
) m ON TRUE;

CREATE OR REPLACE VIEW vw_task_stats_snapshot AS
SELECT
  (SELECT COUNT(*) FROM fact_task) AS total_tasks,
  (SELECT COUNT(*) FROM fact_task WHERE status = 'running') AS running_tasks,
  (SELECT COUNT(*) FROM dim_compute_node WHERE status = 'online') AS idle_nodes,
  (SELECT ROUND(AVG((COALESCE(cpu_usage_pct,0) + COALESCE(gpu_usage_pct,0) + COALESCE(memory_usage_pct,0)) / 3)::numeric, 1)
   FROM ts_node_metric
   WHERE metric_time = (SELECT MAX(metric_time) FROM ts_node_metric)) AS resource_utilization_pct;
"""


REGIONS = [
    ("china", "全国算力网络", "country", None, 0, 104.0, 35.0),
    ("hub_beijing", "京津冀枢纽", "hub", "china", 1, 116.4, 39.9),
    ("hub_shanghai", "长三角枢纽", "hub", "china", 2, 121.5, 31.2),
    ("hub_guangdong", "粤港澳枢纽", "hub", "china", 3, 113.3, 23.1),
    ("hub_chengdu", "成渝枢纽", "hub", "china", 4, 104.1, 30.7),
    ("prov_beijing", "北京省级节点", "province", "hub_beijing", 11, 116.4, 39.9),
    ("prov_tianjin", "天津省级节点", "province", "hub_beijing", 12, 117.2, 39.1),
    ("prov_shanghai", "上海省级节点", "province", "hub_shanghai", 21, 121.5, 31.2),
    ("prov_jiangsu", "江苏省级节点", "province", "hub_shanghai", 22, 118.8, 32.1),
    ("prov_guangdong", "广东省级节点", "province", "hub_guangdong", 31, 113.3, 23.1),
    ("prov_guangxi", "广西省级节点", "province", "hub_guangdong", 32, 108.3, 22.8),
    ("prov_sichuan", "四川省级节点", "province", "hub_chengdu", 41, 104.1, 30.7),
    ("prov_chongqing", "重庆省级节点", "province", "hub_chengdu", 42, 106.5, 29.6),
]

COMPUTE_NODES = [
    ("BJ_DC1", "北京DC-1", "bj-dc-1", "prov_beijing", "dc", "10.1.1.11", "北京·亦庄", "智算数据中心", "H100 训练池", "GPU+CPU", "x86_64 / CUDA 12.4", "Ubuntu 22.04", 192, 1024, 12000, "NVIDIA H100", 4, 400, "BJ-A01", "bj-a", 78),
    ("BJ_DC2", "北京DC-2", "bj-dc-2", "prov_beijing", "dc", "10.1.1.12", "北京·顺义", "智算数据中心", "A100 推理池", "GPU+CPU", "x86_64 / CUDA 12.2", "Ubuntu 22.04", 160, 768, 10000, "NVIDIA A100", 4, 320, "BJ-A02", "bj-a", 70),
    ("BJ_E1", "北京边缘-1", "bj-edge-1", "prov_beijing", "edge", "10.1.2.21", "北京·海淀", "边缘推理节点", "L40S 混合池", "GPU+CPU", "ARM64 / CUDA 11.8", "Ubuntu 22.04", 64, 256, 2600, "NVIDIA L40S", 2, 80, "BJ-E01", "bj-e", 48),
    ("BJ_E2", "北京边缘-2", "bj-edge-2", "prov_beijing", "edge", "10.1.2.22", "北京·朝阳", "边缘推理节点", "T4 边缘池", "GPU+CPU", "x86_64 / CUDA 11.8", "Ubuntu 20.04", 48, 192, 1800, "NVIDIA T4", 2, 60, "BJ-E02", "bj-e", 38),
    ("SH_DC1", "上海DC-1", "sh-dc-1", "prov_shanghai", "dc", "10.2.1.11", "上海·浦东", "智算数据中心", "H100 训练池", "GPU+CPU", "x86_64 / CUDA 12.4", "Ubuntu 22.04", 192, 1024, 12000, "NVIDIA H100", 4, 400, "SH-A01", "sh-a", 76),
    ("SH_DC2", "上海DC-2", "sh-dc-2", "prov_shanghai", "dc", "10.2.1.12", "上海·嘉定", "智算数据中心", "A100 推理池", "GPU+CPU", "x86_64 / CUDA 12.2", "Ubuntu 22.04", 128, 768, 9000, "NVIDIA A100", 3, 300, "SH-A02", "sh-a", 68),
    ("SH_E1", "上海边缘-1", "sh-edge-1", "prov_shanghai", "edge", "10.2.2.21", "上海·闵行", "边缘推理节点", "L40S 混合池", "GPU+CPU", "ARM64 / CUDA 11.8", "Ubuntu 22.04", 64, 256, 2600, "NVIDIA L40S", 2, 80, "SH-E01", "sh-e", 46),
    ("SH_E2", "上海边缘-2", "sh-edge-2", "prov_shanghai", "edge", "10.2.2.22", "上海·松江", "边缘推理节点", "T4 边缘池", "GPU+CPU", "x86_64 / CUDA 11.8", "Ubuntu 20.04", 48, 192, 1800, "NVIDIA T4", 2, 60, "SH-E02", "sh-e", 36),
    ("GD_DC1", "广东DC-1", "gd-dc-1", "prov_guangdong", "dc", "10.3.1.11", "广州·天河", "智算数据中心", "H100 训练池", "GPU+CPU", "x86_64 / CUDA 12.4", "Ubuntu 22.04", 192, 1024, 12000, "NVIDIA H100", 4, 400, "GD-A01", "gd-a", 74),
    ("GD_DC2", "广东DC-2", "gd-dc-2", "prov_guangdong", "dc", "10.3.1.12", "深圳·南山", "智算数据中心", "A100 推理池", "GPU+CPU", "x86_64 / CUDA 12.2", "Ubuntu 22.04", 160, 768, 10000, "NVIDIA A100", 4, 320, "GD-A02", "gd-a", 70),
    ("GD_E1", "广东边缘-1", "gd-edge-1", "prov_guangdong", "edge", "10.3.2.21", "广州·番禺", "边缘推理节点", "L40S 混合池", "GPU+CPU", "ARM64 / CUDA 11.8", "Ubuntu 22.04", 64, 256, 2600, "NVIDIA L40S", 2, 80, "GD-E01", "gd-e", 44),
    ("GD_E2", "广东边缘-2", "gd-edge-2", "prov_guangdong", "edge", "10.3.2.22", "深圳·龙华", "边缘推理节点", "T4 边缘池", "GPU+CPU", "x86_64 / CUDA 11.8", "Ubuntu 20.04", 48, 192, 1800, "NVIDIA T4", 2, 60, "GD-E02", "gd-e", 38),
    ("SC_DC1", "四川DC-1", "sc-dc-1", "prov_sichuan", "dc", "10.4.1.11", "成都·高新", "西部智算中心", "A800 弹性池", "GPU+CPU", "x86_64 / CUDA 12.0", "Ubuntu 22.04", 128, 768, 9000, "NVIDIA A800", 2, 260, "SC-A01", "sc-a", 62),
    ("CQ_E1", "重庆边缘-1", "cq-edge-1", "prov_chongqing", "edge", "10.4.2.21", "重庆·两江", "边缘推理节点", "T4 边缘池", "GPU+CPU", "x86_64 / CUDA 11.8", "Ubuntu 20.04", 48, 192, 1800, "NVIDIA T4", 1, 60, "CQ-E01", "cq-e", 34),
]


def insert_seed_data(conn) -> None:
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    conn.executemany(
        """
        INSERT INTO dim_region(region_id, region_name, region_level, parent_region_id, display_order, longitude, latitude)
        VALUES (%s,%s,%s,%s,%s,%s,%s)
        """,
        REGIONS,
    )

    conn.executemany(
        """
        INSERT INTO dim_compute_node(
          node_id,node_name,hostname,region_id,layer,ip_address,management_ip,location,role_name,
          provider_name,compute_type,architecture,os_name,cpu_cores,memory_total_gb,disk_total_gb,
          gpu_type,gpu_count,bandwidth_total_gbps,rack_code,az_code,running_tasks,health_score,last_heartbeat
        )
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,0,%s,NOW())
        """,
        [(n[0], n[1], n[2], n[3], n[4], n[5], n[5], n[6], n[7], n[8], n[9], n[10], n[11], n[12], n[13], n[14], n[15], n[16], n[17], n[18], n[19], 94 - (idx % 9)) for idx, n in enumerate(COMPUTE_NODES)],
    )

    for node in COMPUTE_NODES:
        node_id, gpu_model, gpu_count = node[0], node[15], node[16]
        memory = 80 if any(key in gpu_model for key in ("H100", "A100", "A800")) else 48 if "L40" in gpu_model else 16
        for gpu_index in range(gpu_count):
            conn.execute(
                """
                INSERT INTO dim_node_gpu_device(node_id, gpu_index, gpu_name, gpu_model, gpu_memory_total_gb, gpu_compute_capability)
                VALUES (%s,%s,%s,%s,%s,%s)
                """,
                (node_id, gpu_index, f"GPU-{gpu_index}", gpu_model, memory, "8.0"),
            )

    views = [
        ("global", "全国算力调度大盘", "global", "china", None, True),
        ("region_beijing", "京津冀枢纽区域", "region", "hub_beijing", None, False),
        ("region_shanghai", "长三角枢纽区域", "region", "hub_shanghai", None, False),
        ("region_guangdong", "粤港澳枢纽区域", "region", "hub_guangdong", None, False),
        ("region_chengdu", "成渝枢纽区域", "region", "hub_chengdu", None, False),
        ("prov_beijing", "北京省级节点", "province", "prov_beijing", None, False),
        ("prov_shanghai", "上海省级节点", "province", "prov_shanghai", None, False),
        ("prov_guangdong", "广东省级节点", "province", "prov_guangdong", None, False),
        ("node", "单节点监控", "node", None, "BJ_DC1", False),
    ]
    conn.executemany(
        "INSERT INTO dim_topology_view(view_id, view_name, view_kind, region_id, node_id, is_default) VALUES (%s,%s,%s,%s,%s,%s)",
        views,
    )

    vertices = [
        ("manager", "control", "national_dispatch_center", "国家级算力调度中心", "4+N+31+X 顶层管控", "china", None, None, "online", False, False),
    ]
    hub_labels = {
        "hub_beijing": ("京津冀枢纽", "华北国家级枢纽"),
        "hub_shanghai": ("长三角枢纽", "华东国家级枢纽"),
        "hub_guangdong": ("粤港澳枢纽", "华南国家级枢纽"),
        "hub_chengdu": ("成渝枢纽", "西部国家级枢纽"),
    }
    for hub_id, (name, subtitle) in hub_labels.items():
        vertices.append((hub_id, "cloud", "national_hub", name, subtitle, hub_id, None, None, "online", True, False))
    for region_id, name, level, parent, *_ in REGIONS:
        if level == "province":
            vertices.append((f"brain_{region_id}", "control", "province_brain", name.replace("节点", "算网大脑"), "31·省级调度", region_id, None, None, "online", True, False))
    for node in COMPUTE_NODES:
        node_id, node_name, *_rest = node
        region_id = node[3]
        layer = node[4]
        vertices.append((node_id, "edge" if layer == "edge" else "compute", f"{layer}_compute_node", node_name, "X·边缘节点" if layer == "edge" else "地市DC", region_id, node_id, None, "online", True, True))
    conn.executemany(
        """
        INSERT INTO dim_topology_vertex(vertex_id, vertex_type, vertex_role, vertex_name, subtitle, region_id, compute_node_id, service_code, status, is_physical, is_schedulable)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        vertices,
    )

    for hub_id in hub_labels:
        conn.execute("INSERT INTO dim_topology_edge(source_vertex_id,target_vertex_id,edge_role,capacity_bandwidth_mbps,priority) VALUES (%s,%s,%s,%s,%s)", ("manager", hub_id, "dispatch", 100000, 10))
    for region_id, _name, level, parent, *_ in REGIONS:
        if level == "province" and parent:
            conn.execute("INSERT INTO dim_topology_edge(source_vertex_id,target_vertex_id,edge_role,capacity_bandwidth_mbps,priority) VALUES (%s,%s,%s,%s,%s)", (parent, f"brain_{region_id}", "dispatch", 40000, 6))
    for node in COMPUTE_NODES:
        conn.execute("INSERT INTO dim_topology_edge(source_vertex_id,target_vertex_id,edge_role,capacity_bandwidth_mbps,priority) VALUES (%s,%s,%s,%s,%s)", (f"brain_{node[3]}", node[0], "dispatch", 10000 if node[4] == "dc" else 3000, 4))

    layouts = [
        ("global", "manager", 0, 60, 120),
        ("global", "hub_beijing", -390, 220, 90),
        ("global", "hub_shanghai", -130, 220, 90),
        ("global", "hub_guangdong", 130, 220, 90),
        ("global", "hub_chengdu", 390, 220, 90),
    ]
    for idx, region_id in enumerate(["prov_beijing", "prov_tianjin", "prov_shanghai", "prov_jiangsu", "prov_guangdong", "prov_guangxi", "prov_sichuan", "prov_chongqing"]):
        layouts.append(("global", f"brain_{region_id}", -455 + idx * 130, 390, 68))
    for view_id, region_id in [("region_beijing", "hub_beijing"), ("region_shanghai", "hub_shanghai"), ("region_guangdong", "hub_guangdong"), ("region_chengdu", "hub_chengdu")]:
        layouts.append((view_id, region_id, 0, 60, 110))
        provinces = [r[0] for r in REGIONS if r[3] == region_id]
        for idx, province_id in enumerate(provinces):
            layouts.append((view_id, f"brain_{province_id}", -160 + idx * 320, 220, 86))
            nodes = [n for n in COMPUTE_NODES if n[3] == province_id]
            for node_idx, node in enumerate(nodes):
                layouts.append((view_id, node[0], -230 + node_idx * 150 + idx * 120, 390 + (node_idx % 2) * 120, 56 if node[4] == "edge" else 68))
    for province_id in ["prov_beijing", "prov_shanghai", "prov_guangdong"]:
        layouts.append((province_id, f"brain_{province_id}", 0, 60, 100))
        nodes = [n for n in COMPUTE_NODES if n[3] == province_id]
        for idx, node in enumerate(nodes):
            layouts.append((province_id, node[0], -240 + idx * 160, 220 if node[4] == "dc" else 390, 58 if node[4] == "edge" else 76))
    conn.executemany("INSERT INTO dim_topology_layout(view_id,vertex_id,x,y,size_hint) VALUES (%s,%s,%s,%s,%s)", layouts)

    metric_rows = []
    runtime_rows = []
    for idx, node in enumerate(COMPUTE_NODES):
        node_id, base = node[0], node[20]
        for minute in range(72):
            ts = now - timedelta(minutes=71 - minute)
            phase = minute / 6 + idx * 0.7
            cpu = clamp(base + math.sin(phase) * 8 + math.cos(phase / 2) * 4, 12, 96)
            memory = clamp(base - 5 + math.sin(phase + 0.8) * 6, 10, 92)
            gpu = clamp(base + 4 + math.sin(phase + 1.3) * 10, 5, 98)
            disk = clamp(38 + idx * 2.2 + math.sin(phase / 2) * 5, 20, 88)
            bandwidth = clamp(18 + cpu * 0.95 + math.sin(phase) * 6, 10, 160)
            latency = clamp(8 + cpu * 0.24 + (idx % 4) * 2, 6, 80)
            jitter = clamp(1 + latency * 0.05, 1, 10)
            loss = clamp(max(cpu - 82, 0) * 0.035, 0, 1.8)
            metric_rows.append((ts, node_id, round(cpu, 1), round(memory, 1), round(gpu, 1), round(disk, 1), round(bandwidth, 1), round(latency, 1), round(jitter, 2), round(loss, 2)))
        latest_cpu = metric_rows[-1][2]
        runtime_rows.append((node_id, now, "online", latest_cpu, min(98, latest_cpu + 5), None, "warning" if latest_cpu > 82 else "normal"))
    conn.executemany(
        """
        INSERT INTO ts_node_metric(metric_time,node_id,cpu_usage_pct,memory_usage_pct,gpu_usage_pct,disk_usage_pct,bandwidth_usage_gbps,latency_ms,jitter_ms,packet_loss_pct)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        metric_rows,
    )
    conn.executemany(
        """
        INSERT INTO fact_topology_runtime_state(vertex_id,snapshot_time,status,current_load_pct,predicted_load_pct_10m,badge_text,highlight_level)
        VALUES (%s,%s,%s,%s,%s,%s,%s)
        """,
        runtime_rows,
    )

    tasks = []
    task_requirements = []
    assignments = []
    task_types = ["训练任务", "推理服务", "数据预处理", "联邦聚合", "弹性迁移"]
    for i in range(1, 21):
        task_id = f"T-{i:04d}"
        task_type = task_types[(i - 1) % len(task_types)]
        node = COMPUTE_NODES[(i * 3) % len(COMPUTE_NODES)]
        status = "running" if i % 4 else "pending"
        priority_name = ["low", "medium", "high", "urgent"][i % 4]
        tasks.append((task_id, f"{task_type}-{i}", f"{task_type}-{i}", task_type, priority_name, 5 - (i % 4), status, 35 if status == "running" else 0, node[0] if status == "running" else None, now - timedelta(minutes=80 - i * 3), now - timedelta(minutes=70 - i * 3) if status == "running" else None, node[3], "gold" if i % 5 == 0 else "standard"))
        cpu_req = 8 + (i % 5) * 4
        mem_req = 16 + (i % 6) * 8
        gpu_req = 1 if task_type in ("训练任务", "推理服务", "联邦聚合") else 0
        gpu_mem_req = 16
        bandwidth_req = 5 + (i % 4) * 2
        storage_req = 80 + i * 10
        task_requirements.append((task_id, cpu_req, mem_req, gpu_req, node[15], gpu_mem_req, storage_req, bandwidth_req, cpu_req, mem_req, gpu_req, gpu_mem_req, bandwidth_req, storage_req, 900 + i * 80, 12 + i % 8, node[3], None))
        if status == "running":
            gpu_pct = 18 + (i % 5) * 5
            assignments.append((task_id, node[0], None, 82 + (i % 13), 10 + i % 8, cpu_req, mem_req, gpu_req, gpu_pct, bandwidth_req, storage_req, cpu_req, mem_req, gpu_req, gpu_pct, bandwidth_req, storage_req, "running", now - timedelta(minutes=65 - i * 3)))
    conn.executemany(
        "INSERT INTO fact_task(task_id,task_name,task_type,priority,status,submit_time,start_time,source_region_id,sla_level) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        tasks,
    )
    conn.executemany(
        """
        INSERT INTO fact_task_requirement(task_id,required_cpu_cores,required_memory_gb,required_gpu_count,required_gpu_memory_gb,required_bandwidth_gbps,required_disk_gb,estimated_duration_sec,estimated_latency_ms,affinity_region_id,anti_affinity_node_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        task_requirements,
    )
    conn.executemany(
        """
        INSERT INTO fact_task_assignment(task_id,target_node_id,match_score,estimated_latency_ms,allocated_cpu_cores,allocated_memory_gb,allocated_gpu_count,allocated_gpu_pct,allocated_bandwidth_gbps,allocated_disk_gb,assignment_status,assigned_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        assignments,
    )
    conn.execute("UPDATE dim_compute_node n SET running_tasks = sub.cnt FROM (SELECT target_node_id, COUNT(*) cnt FROM fact_task_assignment WHERE assignment_status='running' GROUP BY target_node_id) sub WHERE n.node_id = sub.target_node_id")

    log_rows = []
    for idx, assignment in enumerate(assignments[:12]):
        task_id, node_id = assignment[0], assignment[1]
        vertex_id = node_id
        log_rows.extend([
            (task_id, "manager", "感知", now - timedelta(minutes=18 - idx), f"收到任务 {task_id}，开始读取算力网络状态。", "info"),
            (task_id, "manager", "决策", now - timedelta(minutes=17 - idx), f"候选节点评估完成，{node_id} 匹配度 {assignment[2]:.0f}%。", "info"),
            (task_id, vertex_id, "下发", now - timedelta(minutes=16 - idx), f"任务 {task_id} 已绑定至 {node_id}，资源预留完成。", "info"),
            (task_id, vertex_id, "监控", now - timedelta(minutes=15 - idx), f"{node_id} 链路就绪，任务流进入实时监控。", "info"),
        ])
    conn.executemany(
        "INSERT INTO fact_schedule_log(task_id,vertex_id,phase,log_time,message,severity) VALUES (%s,%s,%s,%s,%s,%s)",
        log_rows,
    )

    for metric, base in [("cpu", 58), ("memory", 54), ("bandwidth", 74), ("gpu", 62), ("storage", 48)]:
        run_id = conn.execute(
            """
            INSERT INTO fact_forecast_run(forecast_type,metric_name,target_level,target_id,horizon_minutes,granularity_seconds,model_name,model_version,run_time)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING forecast_run_id
            """,
            ("global_demand", metric, "global", "global", 360, 300, "demo-trend-extrapolator", "v1", now),
        ).fetchone()[0]
        points = []
        for i in range(30):
            point_time = now + timedelta(minutes=(i - 10) * 5)
            actual = None if i > 10 else clamp(base + math.sin(i / 2) * 7, 10, 98)
            predicted = clamp(base + math.sin(i / 2 + 0.5) * 8 + max(i - 10, 0) * 0.6, 10, 120)
            points.append((run_id, point_time, round(actual, 1) if actual is not None else None, round(predicted, 1), round(predicted - 6, 1), round(predicted + 6, 1), "history" if i <= 10 else "forecast"))
        conn.executemany(
            "INSERT INTO ts_forecast_point(forecast_run_id,point_time,actual_value,predicted_value,lower_bound,upper_bound,point_role) VALUES (%s,%s,%s,%s,%s,%s,%s)",
            points,
        )


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))


def q(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(round(value, 6))
    if isinstance(value, datetime):
        return "'" + value.isoformat().replace("+00:00", "Z") + "'"
    return "'" + str(value).replace("'", "''") + "'"


def insert_sql(table: str, columns: list[str], rows: list[tuple]) -> str:
    if not rows:
        return ""
    values = ",\n".join("(" + ",".join(q(value) for value in row) + ")" for row in rows)
    return f"INSERT INTO {table}({','.join(columns)}) VALUES\n{values};\n"


def build_seed_sql() -> str:
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    statements = [DDL]
    statements.append(insert_sql(
        "dim_region",
        ["region_id", "region_name", "region_level", "parent_region_id", "display_order", "longitude", "latitude"],
        REGIONS,
    ))
    statements.append(insert_sql(
        "dim_compute_node",
        [
            "node_id", "node_name", "hostname", "region_id", "layer", "ip_address", "management_ip", "location",
            "role_name", "provider_name", "compute_type", "architecture", "os_name", "cpu_cores", "memory_total_gb",
            "disk_total_gb", "gpu_type", "gpu_count", "bandwidth_total_gbps", "rack_code", "az_code", "running_tasks",
            "health_score", "last_heartbeat",
        ],
        [(n[0], n[1], n[2], n[3], n[4], n[5], n[5], n[6], n[7], n[8], n[9], n[10], n[11], n[12], n[13], n[14], n[15], n[16], n[17], n[18], n[19], 0, 94 - (idx % 9), now) for idx, n in enumerate(COMPUTE_NODES)],
    ))

    super_centers = [
        ("北京移动智算中心", "prov_beijing", 116.4, 39.9, 320.0, 4096, "NVIDIA H100", 128, "400Gbps", 94.5, "national", "北京"),
        ("上海移动智算中心", "prov_shanghai", 121.5, 31.2, 300.0, 3584, "NVIDIA H100", 112, "400Gbps", 93.0, "national", "上海"),
        ("广东移动智算中心", "prov_guangdong", 113.3, 23.1, 280.0, 3328, "NVIDIA A100", 128, "320Gbps", 91.0, "regional", "广东"),
    ]
    statements.append(insert_sql(
        "dim_supercomputing_center",
        ["name", "region_id", "longitude", "latitude", "compute_power", "cpu_cores", "gpu_type", "gpu_count", "network_bw", "capability_score", "center_level", "province"],
        super_centers,
    ))

    edge_nodes = [n for n in COMPUTE_NODES if n[4] == "edge"]
    client_rows = []
    for idx, node in enumerate(edge_nodes, start=1):
        client_rows.append((f"client-{idx:03d}", f"{node[6]}业务客户端", node[0], "online", now - timedelta(days=idx)))
    statements.append(insert_sql(
        "dim_client",
        ["client_id", "client_name", "edge_node_id", "status", "joined_at"],
        client_rows,
    ))

    gpu_rows = []
    for node in COMPUTE_NODES:
        node_id, gpu_model, gpu_count = node[0], node[15], node[16]
        memory = 80 if any(key in gpu_model for key in ("H100", "A100", "A800")) else 48 if "L40" in gpu_model else 16
        gpu_rows.extend((node_id, idx, f"GPU-{idx}", gpu_model, memory, "8.0") for idx in range(gpu_count))
    statements.append(insert_sql(
        "dim_node_gpu_device",
        ["node_id", "gpu_index", "gpu_name", "gpu_model", "gpu_memory_total_gb", "gpu_compute_capability"],
        gpu_rows,
    ))

    views = [
        ("global", "全国算力调度大盘", "global", "china", None, True),
        ("region_beijing", "京津冀枢纽区域", "region", "hub_beijing", None, False),
        ("region_shanghai", "长三角枢纽区域", "region", "hub_shanghai", None, False),
        ("region_guangdong", "粤港澳枢纽区域", "region", "hub_guangdong", None, False),
        ("region_chengdu", "成渝枢纽区域", "region", "hub_chengdu", None, False),
        ("prov_beijing", "北京省级节点", "province", "prov_beijing", None, False),
        ("prov_shanghai", "上海省级节点", "province", "prov_shanghai", None, False),
        ("prov_guangdong", "广东省级节点", "province", "prov_guangdong", None, False),
        ("node", "单节点监控", "node", None, "BJ_DC1", False),
    ]
    statements.append(insert_sql(
        "dim_topology_view",
        ["view_id", "view_name", "view_kind", "region_id", "node_id", "is_default"],
        views,
    ))

    vertices = [("manager", "control", "national_dispatch_center", "国家级算力调度中心", "4+N+31+X 顶层管控", "china", None, None, "online", False, False)]
    hub_labels = {
        "hub_beijing": ("京津冀枢纽", "华北国家级枢纽"),
        "hub_shanghai": ("长三角枢纽", "华东国家级枢纽"),
        "hub_guangdong": ("粤港澳枢纽", "华南国家级枢纽"),
        "hub_chengdu": ("成渝枢纽", "西部国家级枢纽"),
    }
    for hub_id, (name, subtitle) in hub_labels.items():
        vertices.append((hub_id, "cloud", "national_hub", name, subtitle, hub_id, None, None, "online", True, False))
    for region_id, name, level, _parent, *_ in REGIONS:
        if level == "province":
            vertices.append((f"brain_{region_id}", "control", "province_brain", name.replace("节点", "算网大脑"), "31·省级调度", region_id, None, None, "online", True, False))
    for node in COMPUTE_NODES:
        layer = node[4]
        vertices.append((node[0], "edge" if layer == "edge" else "compute", f"{layer}_compute_node", node[1], "X·边缘节点" if layer == "edge" else "地市DC", node[3], node[0], None, "online", True, True))
    statements.append(insert_sql(
        "dim_topology_vertex",
        ["vertex_id", "vertex_type", "vertex_role", "vertex_name", "subtitle", "region_id", "compute_node_id", "service_code", "status", "is_physical", "is_schedulable"],
        vertices,
    ))

    edge_rows = [("manager", hub_id, "dispatch", 100000, 10) for hub_id in hub_labels]
    edge_rows.extend((parent, f"brain_{region_id}", "dispatch", 40000, 6) for region_id, _name, level, parent, *_ in REGIONS if level == "province" and parent)
    edge_rows.extend((f"brain_{node[3]}", node[0], "dispatch", 10000 if node[4] == "dc" else 3000, 4) for node in COMPUTE_NODES)
    statements.append(insert_sql(
        "dim_topology_edge",
        ["source_vertex_id", "target_vertex_id", "edge_role", "capacity_bandwidth_mbps", "priority"],
        edge_rows,
    ))

    layouts = [
        ("global", "manager", 0, 60, 120),
        ("global", "hub_beijing", -390, 220, 90),
        ("global", "hub_shanghai", -130, 220, 90),
        ("global", "hub_guangdong", 130, 220, 90),
        ("global", "hub_chengdu", 390, 220, 90),
    ]
    for idx, region_id in enumerate(["prov_beijing", "prov_tianjin", "prov_shanghai", "prov_jiangsu", "prov_guangdong", "prov_guangxi", "prov_sichuan", "prov_chongqing"]):
        layouts.append(("global", f"brain_{region_id}", -455 + idx * 130, 390, 68))
    for view_id, region_id in [("region_beijing", "hub_beijing"), ("region_shanghai", "hub_shanghai"), ("region_guangdong", "hub_guangdong"), ("region_chengdu", "hub_chengdu")]:
        layouts.append((view_id, region_id, 0, 60, 110))
        provinces = [r[0] for r in REGIONS if r[3] == region_id]
        for idx, province_id in enumerate(provinces):
            layouts.append((view_id, f"brain_{province_id}", -160 + idx * 320, 220, 86))
            nodes = [n for n in COMPUTE_NODES if n[3] == province_id]
            for node_idx, node in enumerate(nodes):
                layouts.append((view_id, node[0], -230 + node_idx * 150 + idx * 120, 390 + (node_idx % 2) * 120, 56 if node[4] == "edge" else 68))
    for province_id in ["prov_beijing", "prov_shanghai", "prov_guangdong"]:
        layouts.append((province_id, f"brain_{province_id}", 0, 60, 100))
        nodes = [n for n in COMPUTE_NODES if n[3] == province_id]
        for idx, node in enumerate(nodes):
            layouts.append((province_id, node[0], -240 + idx * 160, 220 if node[4] == "dc" else 390, 58 if node[4] == "edge" else 76))
    statements.append(insert_sql("dim_topology_layout", ["view_id", "vertex_id", "x", "y", "size_hint"], layouts))

    metric_rows = []
    runtime_rows = []
    for idx, node in enumerate(COMPUTE_NODES):
        node_id, base = node[0], node[20]
        latest_cpu = base
        for minute in range(72):
            ts = now - timedelta(minutes=71 - minute)
            phase = minute / 6 + idx * 0.7
            cpu = clamp(base + math.sin(phase) * 8 + math.cos(phase / 2) * 4, 12, 96)
            memory = clamp(base - 5 + math.sin(phase + 0.8) * 6, 10, 92)
            gpu = clamp(base + 4 + math.sin(phase + 1.3) * 10, 5, 98)
            disk = clamp(38 + idx * 2.2 + math.sin(phase / 2) * 5, 20, 88)
            bandwidth = clamp(18 + cpu * 0.95 + math.sin(phase) * 6, 10, 160)
            latency = clamp(8 + cpu * 0.24 + (idx % 4) * 2, 6, 80)
            jitter = clamp(1 + latency * 0.05, 1, 10)
            loss = clamp(max(cpu - 82, 0) * 0.035, 0, 1.8)
            latest_cpu = round(cpu, 1)
            metric_rows.append((ts, node_id, latest_cpu, round(memory, 1), round(gpu, 1), round(disk, 1), round(bandwidth, 1), round(latency, 1), round(jitter, 2), round(loss, 2)))
        runtime_rows.append((node_id, now, "online", latest_cpu, min(98, latest_cpu + 5), None, "warning" if latest_cpu > 82 else "normal"))
    statements.append(insert_sql(
        "ts_node_metric",
        ["metric_time", "node_id", "cpu_usage_pct", "memory_usage_pct", "gpu_usage_pct", "disk_usage_pct", "bandwidth_usage_gbps", "latency_ms", "jitter_ms", "packet_loss_pct"],
        metric_rows,
    ))
    statements.append(insert_sql(
        "fact_topology_runtime_state",
        ["vertex_id", "snapshot_time", "status", "current_load_pct", "predicted_load_pct_10m", "badge_text", "highlight_level"],
        runtime_rows,
    ))
    trend_rows = []
    for offset in range(0, 72, 5):
        trend_rows.append((now - timedelta(minutes=offset), 58 + math.sin(offset / 8) * 8, 53 + math.cos(offset / 9) * 6, 61 + math.sin(offset / 7) * 10, len(COMPUTE_NODES)))
    statements.append(insert_sql(
        "ts_resource_trend_5m",
        ["metric_time", "avg_cpu_pct", "avg_memory_pct", "avg_gpu_pct", "node_count"],
        trend_rows,
    ))
    statements.append(insert_sql(
        "cfg_alert_threshold",
        ["metric_code", "metric_name", "unit", "warning_threshold", "critical_threshold", "description"],
        [
            ("cpu", "CPU 利用率", "%", 60.0, 80.0, "统一库演示阈值"),
            ("mem", "内存利用率", "%", 60.0, 80.0, "统一库演示阈值"),
            ("gpu", "GPU 利用率", "%", 60.0, 80.0, "统一库演示阈值"),
            ("disk", "磁盘利用率", "%", 70.0, 90.0, "统一库演示阈值"),
        ],
    ))
    statements.append(insert_sql(
        "fact_alert_record",
        ["node_id", "node_name", "metric_code", "metric_name", "current_value", "threshold_value", "alert_level", "alert_message", "status", "triggered_at"],
        [
            ("SH_DC1", "上海DC-1", "cpu", "CPU 利用率", 85.1, 80.0, "critical", "上海DC-1 CPU 利用率超过严重阈值", "active", now - timedelta(minutes=8)),
        ],
    ))

    task_types = ["训练任务", "推理服务", "数据预处理", "联邦聚合", "弹性迁移"]
    tasks, task_requirements, assignments = [], [], []
    for i in range(1, 21):
        task_id = f"T-{i:04d}"
        task_type = task_types[(i - 1) % len(task_types)]
        node = COMPUTE_NODES[(i * 3) % len(COMPUTE_NODES)]
        status = "running" if i % 4 else "pending"
        priority_name = ["low", "medium", "high", "urgent"][i % 4]
        tasks.append((task_id, f"{task_type}-{i}", f"{task_type}-{i}", task_type, priority_name, 5 - (i % 4), status, 35 if status == "running" else 0, node[0] if status == "running" else None, now - timedelta(minutes=80 - i * 3), now - timedelta(minutes=70 - i * 3) if status == "running" else None, node[3], "gold" if i % 5 == 0 else "standard"))
        cpu_req = 8 + (i % 5) * 4
        mem_req = 16 + (i % 6) * 8
        gpu_req = 1 if task_type in ("训练任务", "推理服务", "联邦聚合") else 0
        gpu_mem_req = 16
        bandwidth_req = 5 + (i % 4) * 2
        storage_req = 80 + i * 10
        task_requirements.append((task_id, cpu_req, mem_req, gpu_req, node[15], gpu_mem_req, storage_req, bandwidth_req, cpu_req, mem_req, gpu_req, gpu_mem_req, bandwidth_req, storage_req, 900 + i * 80, 12 + i % 8, node[3], None))
        if status == "running":
            gpu_pct = 18 + (i % 5) * 5
            assignments.append((task_id, node[0], None, 82 + (i % 13), 10 + i % 8, cpu_req, mem_req, gpu_req, gpu_pct, bandwidth_req, storage_req, cpu_req, mem_req, gpu_req, gpu_pct, bandwidth_req, storage_req, "running", now - timedelta(minutes=65 - i * 3)))
    statements.append(insert_sql("fact_task", ["task_id", "name", "task_name", "task_type", "priority", "priority_level", "status", "progress", "assigned_node_id", "submit_time", "start_time", "source_region_id", "sla_level"], tasks))
    statements.append(insert_sql(
        "fact_federated_task",
        ["task_id", "aggregation_algorithm", "encryption_type", "rounds_total", "rounds_current", "min_participants", "model_name", "model_version", "global_accuracy", "global_loss", "parameters_count"],
        [("T-0004", "FedAvg", "secure_aggregation", 20, 6, 4, "demo-fl-model", "v1", 0.873, 0.214, 120000000)],
    ))
    statements.append(insert_sql("fact_task_requirement", ["task_id", "cpu_requested", "memory_requested", "gpu_requested", "gpu_type_requested", "gpu_memory_requested", "storage_requested", "bandwidth_requested", "required_cpu_cores", "required_memory_gb", "required_gpu_count", "required_gpu_memory_gb", "required_bandwidth_gbps", "required_disk_gb", "estimated_duration_sec", "estimated_latency_ms", "affinity_region_id", "anti_affinity_node_id"], task_requirements))
    statements.append(insert_sql("fact_task_assignment", ["task_id", "target_node_id", "pool_id", "match_score", "estimated_latency_ms", "cpu_allocated", "memory_allocated", "gpu_allocated", "gpu_pct_allocated", "bandwidth_allocated", "storage_allocated", "allocated_cpu_cores", "allocated_memory_gb", "allocated_gpu_count", "allocated_gpu_pct", "allocated_bandwidth_gbps", "allocated_disk_gb", "assignment_status", "assigned_at"], assignments))
    statements.append("UPDATE dim_compute_node n SET running_tasks = sub.cnt FROM (SELECT target_node_id, COUNT(*) cnt FROM fact_task_assignment WHERE assignment_status='running' GROUP BY target_node_id) sub WHERE n.node_id = sub.target_node_id;\n")

    log_rows = []
    for idx, assignment in enumerate(assignments[:12]):
        task_id, node_id = assignment[0], assignment[1]
        log_rows.extend([
            (task_id, "manager", "感知", now - timedelta(minutes=18 - idx), f"收到任务 {task_id}，开始读取算力网络状态。", "info"),
            (task_id, "manager", "决策", now - timedelta(minutes=17 - idx), f"候选节点评估完成，{node_id} 匹配度 {assignment[3]:.0f}%。", "info"),
            (task_id, node_id, "下发", now - timedelta(minutes=16 - idx), f"任务 {task_id} 已绑定至 {node_id}，资源预留完成。", "info"),
            (task_id, node_id, "监控", now - timedelta(minutes=15 - idx), f"{node_id} 链路就绪，任务流进入实时监控。", "info"),
        ])
    statements.append(insert_sql("fact_schedule_log", ["task_id", "vertex_id", "phase", "log_time", "message", "severity"], log_rows))

    forecast_runs, forecast_points = [], []
    forecast_id = 1
    for metric, base in [("cpu", 58), ("memory", 54), ("bandwidth", 74), ("gpu", 62), ("storage", 48)]:
        forecast_runs.append((forecast_id, "global_demand", metric, "global", "global", 360, 300, "demo-trend-extrapolator", "v1", now))
        for i in range(30):
            point_time = now + timedelta(minutes=(i - 10) * 5)
            actual = None if i > 10 else clamp(base + math.sin(i / 2) * 7, 10, 98)
            predicted = clamp(base + math.sin(i / 2 + 0.5) * 8 + max(i - 10, 0) * 0.6, 10, 120)
            forecast_points.append((forecast_id, point_time, round(actual, 1) if actual is not None else None, round(predicted, 1), round(predicted - 6, 1), round(predicted + 6, 1), "history" if i <= 10 else "forecast"))
        forecast_id += 1
    statements.append(insert_sql("fact_forecast_run", ["forecast_run_id", "forecast_type", "metric_name", "target_level", "target_id", "horizon_minutes", "granularity_seconds", "model_name", "model_version", "run_time"], forecast_runs))
    statements.append(insert_sql("ts_forecast_point", ["forecast_run_id", "point_time", "actual_value", "predicted_value", "lower_bound", "upper_bound", "point_role"], forecast_points))

    return "\n".join(statements)


def main() -> None:
    ensure_database()
    run_psql(DB_NAME, build_seed_sql())
    print(f"Initialized PostgreSQL database '{DB_NAME}' with prediction allocation demo data.")


if __name__ == "__main__":
    main()
