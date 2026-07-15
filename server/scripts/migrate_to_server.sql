-- ============================================================
-- 安全增量迁移脚本：从本地数据库迁移到服务器数据库
-- 原则：只增不改不删，绝不影响其他同学的数据
-- 使用方式：psql -h 10.129.209.249 -p 5433 -U cn_admin -d computing_network -f migrate_to_server.sql
-- ============================================================

-- ============================================================
-- 第一步：安全创建缺失的表（第二阶段扩展表）
-- 使用 CREATE TABLE IF NOT EXISTS，如果表已存在则跳过
-- ============================================================

-- 1. 拓扑事件表（第二阶段）
CREATE TABLE IF NOT EXISTS fact_topology_event (
  event_id BIGSERIAL PRIMARY KEY,
  view_id VARCHAR(50),
  event_time TIMESTAMPTZ NOT NULL,
  event_type VARCHAR(20) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  severity_color VARCHAR(20),
  source_vertex_id VARCHAR(50),
  target_vertex_id VARCHAR(50)
);

-- 2. 节点短时预测快照表（第二阶段）
CREATE TABLE IF NOT EXISTS ts_node_forecast_snapshot (
  snapshot_time TIMESTAMPTZ NOT NULL,
  node_id VARCHAR(64) NOT NULL,
  predicted_cpu_pct_10m DOUBLE PRECISION,
  predicted_memory_pct_10m DOUBLE PRECISION,
  predicted_bandwidth_gbps_10m DOUBLE PRECISION,
  confidence_score DOUBLE PRECISION,
  risk_level VARCHAR(10) DEFAULT 'low'
);

-- 3. 任务重定向事件表（第二阶段）
CREATE TABLE IF NOT EXISTS fact_reroute_event (
  reroute_id BIGSERIAL PRIMARY KEY,
  task_id VARCHAR(64),
  source_node_id VARCHAR(64),
  target_node_id VARCHAR(64),
  trigger_type VARCHAR(30) NOT NULL,
  trigger_score DOUBLE PRECISION,
  event_time TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'planned',
  description TEXT
);

-- 4. 链路监控指标表（第二阶段）
CREATE TABLE IF NOT EXISTS ts_network_link_metric (
  id BIGSERIAL PRIMARY KEY,
  metric_time TIMESTAMPTZ NOT NULL,
  source_vertex_id VARCHAR(50) NOT NULL,
  target_vertex_id VARCHAR(50) NOT NULL,
  bandwidth_usage_gbps DOUBLE PRECISION,
  latency_ms DOUBLE PRECISION,
  packet_loss_pct DOUBLE PRECISION,
  flow_count INT,
  status VARCHAR(20) DEFAULT 'normal'
);

-- 5. 流量快照表（第二阶段）
CREATE TABLE IF NOT EXISTS fact_traffic_flow_snapshot (
  snapshot_id BIGSERIAL PRIMARY KEY,
  snapshot_time TIMESTAMPTZ NOT NULL,
  source_vertex_id VARCHAR(50) NOT NULL,
  target_vertex_id VARCHAR(50) NOT NULL,
  flow_type VARCHAR(30),
  flow_value DOUBLE PRECISION,
  protocol_name VARCHAR(30),
  task_id VARCHAR(64),
  edge_kind VARCHAR(20)
);

-- 6. 流量时序点表（第三阶段，但你的功能可能需要）
CREATE TABLE IF NOT EXISTS ts_traffic_flow_point (
  id BIGSERIAL PRIMARY KEY,
  point_time TIMESTAMPTZ NOT NULL,
  series_name VARCHAR(50) NOT NULL,
  source_region_id VARCHAR(50),
  target_region_id VARCHAR(50),
  value DOUBLE PRECISION,
  metric_name VARCHAR(30)
);

-- 7. 任务执行状态表（第二阶段，你可能需要）
CREATE TABLE IF NOT EXISTS fact_task_execution (
  execution_id BIGSERIAL PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  node_id VARCHAR(64) NOT NULL,
  execution_status VARCHAR(20) NOT NULL,
  progress_pct DOUBLE PRECISION DEFAULT 0,
  runtime_cpu_pct DOUBLE PRECISION,
  runtime_memory_gb DOUBLE PRECISION,
  runtime_gpu_pct DOUBLE PRECISION,
  queue_depth INT,
  throughput_tpm DOUBLE PRECISION,
  record_time TIMESTAMPTZ DEFAULT NOW()
);

-- 8. GPU监控指标表（第三阶段）
CREATE TABLE IF NOT EXISTS ts_gpu_metric (
  id BIGSERIAL PRIMARY KEY,
  metric_time TIMESTAMPTZ NOT NULL,
  node_id VARCHAR(64) NOT NULL,
  gpu_index INT NOT NULL,
  gpu_usage_pct DOUBLE PRECISION,
  gpu_memory_used_gb DOUBLE PRECISION,
  gpu_power_watt DOUBLE PRECISION,
  gpu_temperature_c DOUBLE PRECISION,
  source_type VARCHAR(30) DEFAULT 'synthetic_realistic'
);

-- 9. 磁盘监控指标表（第三阶段）
CREATE TABLE IF NOT EXISTS ts_disk_metric (
  id BIGSERIAL PRIMARY KEY,
  metric_time TIMESTAMPTZ NOT NULL,
  node_id VARCHAR(64) NOT NULL,
  mount_name VARCHAR(50),
  usage_pct DOUBLE PRECISION,
  used_gb DOUBLE PRECISION,
  total_gb DOUBLE PRECISION,
  source_type VARCHAR(30) DEFAULT 'synthetic_realistic'
);

-- 10. 安全评估快照表（你的自定义表，文档中不存在但你的功能需要）
CREATE TABLE IF NOT EXISTS fact_security_overview_snapshot (
  snapshot_id BIGSERIAL PRIMARY KEY,
  view_id VARCHAR(50),
  snapshot_time TIMESTAMPTZ NOT NULL,
  grade VARCHAR(10),
  data_score DOUBLE PRECISION,
  algorithm_score DOUBLE PRECISION,
  network_score DOUBLE PRECISION,
  system_score DOUBLE PRECISION,
  ds_confidence DOUBLE PRECISION,
  pc1_ratio DOUBLE PRECISION,
  pc1_driver VARCHAR(100),
  pc2_ratio DOUBLE PRECISION,
  pc2_driver VARCHAR(100),
  explanation TEXT,
  source_type VARCHAR(30)
);

-- 11. 资源池表（第二阶段，如果需要）
CREATE TABLE IF NOT EXISTS dim_resource_pool (
  pool_id VARCHAR(50) PRIMARY KEY,
  pool_name VARCHAR(100) NOT NULL,
  pool_type VARCHAR(20),
  region_id VARCHAR(50),
  provider_name VARCHAR(100),
  scheduler_policy VARCHAR(50),
  description TEXT
);

-- 12. 资源池-节点关系表（第二阶段）
CREATE TABLE IF NOT EXISTS rel_pool_node (
  id BIGSERIAL PRIMARY KEY,
  pool_id VARCHAR(50) NOT NULL,
  node_id VARCHAR(64) NOT NULL,
  effective_from TIMESTAMPTZ DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  is_primary BOOLEAN DEFAULT FALSE
);

-- 13. 调度策略字典表（第二阶段）
CREATE TABLE IF NOT EXISTS dim_schedule_strategy (
  strategy_id VARCHAR(50) PRIMARY KEY,
  strategy_name VARCHAR(100) NOT NULL,
  strategy_type VARCHAR(30),
  version VARCHAR(20),
  description TEXT
);

-- 14. 数据源登记表（第三阶段）
CREATE TABLE IF NOT EXISTS dim_data_source (
  source_id VARCHAR(50) PRIMARY KEY,
  source_name VARCHAR(100) NOT NULL,
  source_type VARCHAR(30),
  owner_system VARCHAR(50),
  description TEXT
);

-- 15. 数据导入批次表（第三阶段）
CREATE TABLE IF NOT EXISTS fact_ingest_batch (
  batch_id BIGSERIAL PRIMARY KEY,
  source_id VARCHAR(50),
  batch_type VARCHAR(20),
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  record_count BIGINT,
  status VARCHAR(20),
  remark TEXT
);

-- 16. 仿真场景表（第三阶段）
CREATE TABLE IF NOT EXISTS fact_simulation_scenario (
  scenario_id VARCHAR(50) PRIMARY KEY,
  scenario_name VARCHAR(100) NOT NULL,
  scenario_type VARCHAR(30),
  description TEXT,
  seed_value BIGINT,
  config_json JSONB,
  is_active BOOLEAN DEFAULT TRUE
);

-- 17. 用户表
CREATE TABLE IF NOT EXISTS dim_user (
  user_id VARCHAR(50) PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(200),
  group_id VARCHAR(50),
  role VARCHAR(20) DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. 任务参与者表
CREATE TABLE IF NOT EXISTS fact_task_participant (
  id BIGSERIAL PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  client_id BIGINT NOT NULL,
  samples_count INT,
  compute_score DOUBLE PRECISION,
  contribution_score DOUBLE PRECISION,
  reward DOUBLE PRECISION,
  join_time TIMESTAMPTZ,
  leave_time TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'active'
);

-- 19. 训练轮次表
CREATE TABLE IF NOT EXISTS fact_training_round (
  id BIGSERIAL PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  round_number INT NOT NULL,
  node_id VARCHAR(64),
  local_accuracy DOUBLE PRECISION,
  local_loss DOUBLE PRECISION,
  gradient_size BIGINT,
  upload_time TIMESTAMPTZ,
  aggregate_time TIMESTAMPTZ,
  status VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 20. 边缘节点-客户端归属关系表
CREATE TABLE IF NOT EXISTS rel_edge_client (
  id BIGSERIAL PRIMARY KEY,
  edge_node_id VARCHAR(64) NOT NULL,
  client_id BIGINT NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 第二步：为已存在的表安全添加可能缺失的字段
-- 使用 DO 块 + information_schema 检查，确保只添加不存在的列
-- ============================================================

-- dim_compute_node 可能缺失的字段
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='dim_compute_node' AND column_name='warning_level') THEN
    ALTER TABLE dim_compute_node ADD COLUMN warning_level VARCHAR(20) DEFAULT 'normal';
  END IF;
END$$;

-- fact_task 可能缺失的字段（第二阶段新增）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fact_task' AND column_name='task_name') THEN
    ALTER TABLE fact_task ADD COLUMN task_name VARCHAR(128);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fact_task' AND column_name='priority_level') THEN
    ALTER TABLE fact_task ADD COLUMN priority_level INT DEFAULT 3;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fact_task' AND column_name='business_type') THEN
    ALTER TABLE fact_task ADD COLUMN business_type VARCHAR(50);
  END IF;
END$$;

-- fact_task_assignment 可能缺失的字段
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fact_task_assignment' AND column_name='allocated_cpu_cores') THEN
    ALTER TABLE fact_task_assignment ADD COLUMN allocated_cpu_cores DOUBLE PRECISION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fact_task_assignment' AND column_name='allocated_memory_gb') THEN
    ALTER TABLE fact_task_assignment ADD COLUMN allocated_memory_gb DOUBLE PRECISION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fact_task_assignment' AND column_name='allocated_gpu_count') THEN
    ALTER TABLE fact_task_assignment ADD COLUMN allocated_gpu_count INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fact_task_assignment' AND column_name='allocated_gpu_pct') THEN
    ALTER TABLE fact_task_assignment ADD COLUMN allocated_gpu_pct DOUBLE PRECISION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fact_task_assignment' AND column_name='allocated_bandwidth_gbps') THEN
    ALTER TABLE fact_task_assignment ADD COLUMN allocated_bandwidth_gbps DOUBLE PRECISION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fact_task_assignment' AND column_name='allocated_disk_gb') THEN
    ALTER TABLE fact_task_assignment ADD COLUMN allocated_disk_gb DOUBLE PRECISION;
  END IF;
END$$;

-- fact_task_requirement 可能缺失的字段
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fact_task_requirement' AND column_name='required_cpu_cores') THEN
    ALTER TABLE fact_task_requirement ADD COLUMN required_cpu_cores DOUBLE PRECISION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fact_task_requirement' AND column_name='required_memory_gb') THEN
    ALTER TABLE fact_task_requirement ADD COLUMN required_memory_gb DOUBLE PRECISION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fact_task_requirement' AND column_name='required_gpu_count') THEN
    ALTER TABLE fact_task_requirement ADD COLUMN required_gpu_count INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fact_task_requirement' AND column_name='required_gpu_memory_gb') THEN
    ALTER TABLE fact_task_requirement ADD COLUMN required_gpu_memory_gb DOUBLE PRECISION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fact_task_requirement' AND column_name='required_bandwidth_gbps') THEN
    ALTER TABLE fact_task_requirement ADD COLUMN required_bandwidth_gbps DOUBLE PRECISION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fact_task_requirement' AND column_name='required_disk_gb') THEN
    ALTER TABLE fact_task_requirement ADD COLUMN required_disk_gb DOUBLE PRECISION;
  END IF;
END$$;

-- dim_topology_view_vertex 可能不存在于服务器（第一阶段的16表没有它）
CREATE TABLE IF NOT EXISTS dim_topology_view_vertex (
  id BIGSERIAL PRIMARY KEY,
  view_id VARCHAR(50) NOT NULL,
  vertex_id VARCHAR(50) NOT NULL,
  display_order INT DEFAULT 0,
  is_visible BOOLEAN DEFAULT TRUE,
  UNIQUE(view_id, vertex_id)
);


-- ============================================================
-- 第三步：安全创建/替换视图
-- 视图是无状态的，可以安全替换，不影响数据
-- ============================================================

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


-- ============================================================
-- 第四步：安全创建索引（IF NOT EXISTS）
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_ts_node_metric_node_time ON ts_node_metric(node_id, metric_time DESC);
CREATE INDEX IF NOT EXISTS idx_task_assignment_node_time ON fact_task_assignment(target_node_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_log_vertex_time ON fact_schedule_log(vertex_id, log_time DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_point_run_time ON ts_forecast_point(forecast_run_id, point_time);
CREATE INDEX IF NOT EXISTS idx_topology_state_vertex_time ON fact_topology_runtime_state(vertex_id, snapshot_time DESC);
CREATE INDEX IF NOT EXISTS idx_ts_gpu_metric_time ON ts_gpu_metric(node_id, gpu_index, metric_time DESC);
CREATE INDEX IF NOT EXISTS idx_ts_disk_metric_time ON ts_disk_metric(node_id, metric_time DESC);
CREATE INDEX IF NOT EXISTS idx_alert_node_time ON fact_alert_record(node_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_level_status ON fact_alert_record(alert_level, status);
CREATE INDEX IF NOT EXISTS idx_task_status ON fact_task(status);
CREATE INDEX IF NOT EXISTS idx_task_node ON fact_task(assigned_node_id);
CREATE INDEX IF NOT EXISTS idx_task_submit_time ON fact_task(submit_time DESC);
CREATE INDEX IF NOT EXISTS idx_node_status ON dim_compute_node(status);
CREATE INDEX IF NOT EXISTS idx_node_region ON dim_compute_node(region_id);
CREATE INDEX IF NOT EXISTS idx_ts_link_time ON ts_network_link_metric(source_vertex_id, target_vertex_id, metric_time DESC);
CREATE INDEX IF NOT EXISTS idx_ts_forecast_snap ON ts_node_forecast_snapshot(node_id, snapshot_time DESC);


-- ============================================================
-- 迁移脚本执行完毕
-- 接下来请执行 seed_server_data.sql 灌入你的种子数据
-- ============================================================
