import type {
  SecurityDataRoot,
  NodeSecurity,
  TaskSecurity,
  DatasetSecurity,
  NetworkLinkSecurity,
  SecurityAlert,
  FairnessMetrics,
  DistillationRobustness,
  CommunicationOptimization,
  AccuracyVsCommunicationPoint,
  CommTimelinePoint,
  MasterToNodeLink,
  DatasetCorrelationRisk,
  ComplianceSource,
  StorageClusterHealth,
  SupercomputingNodeSecurity,
  BackdoorAttackDetection,
  NonIIDDistribution,
} from './types';
import { RATIONAL_TRUST_DATA } from './data_rational_trust';

export const SECURITY_DATA: SecurityDataRoot = {
  /* ================================================================
   * ① 全局安全态势
   * ================================================================ */
  global_posture: {
    snapshot_time: '2026-05-29T16:30:00Z',
    overall_grade: 'B+',
    overall_score: 82.5,
    dimensions: {
      data: { layer: 'data', label: '数据安全', score: 87, weight: 0.30 },
      algorithm: { layer: 'algorithm', label: '算法安全', score: 82, weight: 0.25 },
      network: { layer: 'network', label: '网络安全', score: 79, weight: 0.25 },
      system: { layer: 'system', label: '系统安全', score: 76, weight: 0.20 },
    },
    ahp_weights: {
      data: 0.30,
      algorithm: 0.25,
      network: 0.25,
      system: 0.20,
    },
    ds_evidence: {
      combined_score: 0.81,
      description: 'Dempster-Shafer证据理论融合多源安全证据',
    },
    pca: {
      pc1: { pct: 42, driver: '算法风险主导' },
      pc2: { pct: 28, driver: '数据风险次之' },
    },
    drill_targets: {
      data: { label: '数据层 → 任务运营调度', path: '/computing/task-management', person: '任务运营调度' },
      algorithm: { label: '算法层 → 训练监控', path: '/federated/edge-control', person: '训练监控' },
      network: { label: '网络层 → 资源池管控', path: '/federated/user-control', person: '资源池管控' },
      system: { label: '系统层 → 当前页', path: null },
    },
  },

  /* ================================================================
   * ② by_node: 节点安全（系统安全层）
   *    数据来源：dim_compute_node + ts_node_metric 加工
   * ================================================================ */
  node_security: [
    { node_id: 'edge-shenzhen-01', node_name: '深圳边缘节点', trust_score: 98, health_score: 95, warning_level: 'normal', task_success_rate: 0.98, gradient_anomaly_count: 0, status: 'online' },
    { node_id: 'edge-shanghai-01', node_name: '上海边缘节点', trust_score: 92, health_score: 88, warning_level: 'normal', task_success_rate: 0.94, gradient_anomaly_count: 1, status: 'online' },
    { node_id: 'edge-beijing-01', node_name: '北京边缘节点', trust_score: 95, health_score: 91, warning_level: 'normal', task_success_rate: 0.96, gradient_anomaly_count: 0, status: 'online' },
    { node_id: 'edge-chengdu-01', node_name: '成都边缘节点', trust_score: 78, health_score: 72, warning_level: 'warning', task_success_rate: 0.82, gradient_anomaly_count: 2, status: 'online' },
    { node_id: 'edge-xian-01', node_name: '西安边缘节点', trust_score: 65, health_score: 60, warning_level: 'critical', task_success_rate: 0.55, gradient_anomaly_count: 5, status: 'online' },
    { node_id: 'edge-hangzhou-01', node_name: '杭州边缘节点', trust_score: 90, health_score: 86, warning_level: 'normal', task_success_rate: 0.92, gradient_anomaly_count: 0, status: 'online' },
    { node_id: 'edge-guangzhou-01', node_name: '广州边缘节点', trust_score: 88, health_score: 84, warning_level: 'normal', task_success_rate: 0.90, gradient_anomaly_count: 1, status: 'online' },
    { node_id: 'edge-wuhan-01', node_name: '武汉边缘节点', trust_score: 75, health_score: 70, warning_level: 'warning', task_success_rate: 0.80, gradient_anomaly_count: 3, status: 'online' },
    { node_id: 'edge-nanjing-01', node_name: '南京边缘节点', trust_score: 93, health_score: 89, warning_level: 'normal', task_success_rate: 0.95, gradient_anomaly_count: 0, status: 'online' },
    { node_id: 'supercomputing-shenzhen-01', node_name: '深圳超算中心', trust_score: 96, health_score: 93, warning_level: 'normal', task_success_rate: 0.97, gradient_anomaly_count: 0, status: 'online' },
    { node_id: 'supercomputing-shanghai-01', node_name: '上海超算中心', trust_score: 94, health_score: 91, warning_level: 'normal', task_success_rate: 0.95, gradient_anomaly_count: 0, status: 'online' },
    { node_id: 'supercomputing-beijing-01', node_name: '北京超算中心', trust_score: 91, health_score: 87, warning_level: 'normal', task_success_rate: 0.93, gradient_anomaly_count: 1, status: 'online' },
    { node_id: 'supercomputing-tianjin-01', node_name: '天津西青超算中心', trust_score: 81, health_score: 78, warning_level: 'warning', task_success_rate: 0.85, gradient_anomaly_count: 2, status: 'online' },
    { node_id: 'supercomputing-chengdu-01', node_name: '成都超算中心', trust_score: 85, health_score: 82, warning_level: 'normal', task_success_rate: 0.88, gradient_anomaly_count: 1, status: 'online' },
    { node_id: 'supercomputing-xian-01', node_name: '西安超算中心', trust_score: 72, health_score: 68, warning_level: 'warning', task_success_rate: 0.78, gradient_anomaly_count: 3, status: 'online' },
  ] satisfies NodeSecurity[],

  /* ================================================================
   * ③ by_task: 任务安全（算法安全层）
   *    数据来源：fact_task + fact_federated_task + fact_training_round 加工
   * ================================================================ */
  task_security: [
    { task_id: 'task-fedtrain-99943', task_name: '联邦训练-图神经网络', model_type: 'GNN', aggregation: 'Bulyan', encryption_type: '同态加密', privacy_epsilon: 2.0, noniid_alpha: 0.5, current_round: 27, total_rounds: 50, current_accuracy: 0.90, current_loss: 0.42, client_count: 10, detected_malicious_ratio: 0.35, attack_detected: true, attack_type: '梯度反转', status: 'running',
      task_log: [
        { time: '15:45', round: 1, event: '任务启动 · 聚合算法 Bulyan · 加密 同态 · ε=2.0 α=0.5', severity: 'info' },
        { time: '16:05', round: 5, event: '第5轮: 准确率 74% · Loss 0.68 · 无异常', severity: 'info' },
        { time: '16:18', round: 12, event: '第12轮: 客户端 edge-xian-01 梯度偏差超 2σ', severity: 'warning' },
        { time: '16:24', round: 15, event: '第15轮: 检测到梯度反转攻击 · 恶意节点比例 35%', severity: 'critical' },
        { time: '16:31', round: 18, event: '聚合算法保持 Bulyan · 鲁棒性对抗激活', severity: 'info' },
        { time: '16:42', round: 24, event: '第24轮: 对抗后精度恢复至 86% · 攻击影响可控', severity: 'info' },
        { time: '16:50', round: 27, event: '当前: 准确率 90% · Loss 0.42 · 系统判定攻击已抑制', severity: 'info' },
      ] },
    { task_id: 'task-fedtrain-99944', task_name: '联邦训练-异常检测', model_type: 'LSTM', aggregation: 'FedAvg', encryption_type: '差分隐私', privacy_epsilon: 1.5, noniid_alpha: 0.3, current_round: 18, total_rounds: 30, current_accuracy: 0.88, current_loss: 0.35, client_count: 8, detected_malicious_ratio: 0.08, attack_detected: false, attack_type: '-', status: 'running',
      task_log: [
        { time: '16:00', round: 1, event: '任务启动 · 聚合算法 FedAvg · 差分隐私 · ε=1.5 α=0.3', severity: 'info' },
        { time: '16:15', round: 8, event: '第8轮: 准确率 80% · Loss 0.52 · 训练正常', severity: 'info' },
        { time: '16:30', round: 15, event: '第15轮: 准确率 87% · 梯度一致性检测通过 · 无攻击迹象', severity: 'info' },
        { time: '16:45', round: 18, event: '当前: 准确率 88% · Loss 0.35 · 无安全事件', severity: 'info' },
      ] },
    { task_id: 'task-fedtrain-99945', task_name: '联邦训练-大模型微调', model_type: 'Transformer', aggregation: 'Krum', encryption_type: '安全聚合', privacy_epsilon: 3.0, noniid_alpha: 0.7, current_round: 12, total_rounds: 40, current_accuracy: 0.85, current_loss: 0.58, client_count: 6, detected_malicious_ratio: 0.20, attack_detected: true, attack_type: '标签翻转', status: 'running',
      task_log: [
        { time: '16:10', round: 1, event: '任务启动 · 聚合算法 Krum · 安全聚合 · ε=3.0(高) α=0.7', severity: 'info' },
        { time: '16:22', round: 5, event: '第5轮: 4/6客户端标签分布异常 · 疑为标签翻转攻击', severity: 'critical' },
        { time: '16:28', round: 8, event: 'Krum 算法生效: 剔除2个异常客户端 · 训练继续', severity: 'warning' },
        { time: '16:40', round: 12, event: '当前: 准确率 85% · Loss 0.58 · ε偏高(3.0)需关注', severity: 'info' },
      ] },
    { task_id: 'task-fedtrain-99946', task_name: '联邦训练-风控模型', model_type: 'GNN', aggregation: 'Bulyan', encryption_type: '同态加密', privacy_epsilon: 1.0, noniid_alpha: 0.5, current_round: 34, total_rounds: 60, current_accuracy: 0.72, current_loss: 0.61, client_count: 10, detected_malicious_ratio: 0.50, attack_detected: true, attack_type: '高斯噪声', status: 'running',
      task_log: [
        { time: '15:30', round: 1, event: '任务启动 · 聚合算法 Bulyan · 同态加密 · ε=1.0 α=0.5', severity: 'info' },
        { time: '15:50', round: 10, event: '第10轮: 5/10客户端梯度注入高斯噪声 · 恶意比50%', severity: 'critical' },
        { time: '16:00', round: 15, event: 'Bulyan 鲁棒聚合激活 · 精度从72%开始恢复', severity: 'warning' },
        { time: '16:20', round: 25, event: '第25轮: 攻击持续 · 精度徘徊72% · 建议人工介入', severity: 'warning' },
        { time: '16:35', round: 34, event: '当前: 准确率 72% · Loss 0.61 · 恶意比仍50%', severity: 'critical' },
      ] },
    { task_id: 'task-fedtrain-99947', task_name: '联邦训练-用户画像', model_type: 'LSTM', aggregation: '几何中值', encryption_type: '差分隐私', privacy_epsilon: 0.8, noniid_alpha: 0.4, current_round: 22, total_rounds: 45, current_accuracy: 0.84, current_loss: 0.45, client_count: 8, detected_malicious_ratio: 0.12, attack_detected: false, attack_type: '-', status: 'running',
      task_log: [
        { time: '16:05', round: 1, event: '任务启动 · 聚合算法 几何中值 · 差分隐私 · ε=0.8 α=0.4', severity: 'info' },
        { time: '16:25', round: 12, event: '第12轮: 准确率 78% · 几何中值收敛稳定', severity: 'info' },
        { time: '16:50', round: 22, event: '当前: 准确率 84% · Loss 0.45 · 无安全事件', severity: 'info' },
      ] },
    { task_id: 'task-fedtrain-99948', task_name: '联邦训练-推荐系统', model_type: 'Transformer', aggregation: 'FedAvg', encryption_type: '安全聚合', privacy_epsilon: 1.8, noniid_alpha: 0.2, current_round: 50, total_rounds: 50, current_accuracy: 0.92, current_loss: 0.22, client_count: 10, detected_malicious_ratio: 0.05, attack_detected: false, attack_type: '-', status: 'completed',
      task_log: [
        { time: '14:00', round: 1, event: '任务启动 · 聚合算法 FedAvg · 安全聚合 · ε=1.8 α=0.2', severity: 'info' },
        { time: '14:30', round: 20, event: '第20轮: 准确率 85% · 非IID低(α=0.2)收敛快', severity: 'info' },
        { time: '15:10', round: 40, event: '第40轮: 准确率 91% · 全程梯度一致性正常', severity: 'info' },
        { time: '15:30', round: 50, event: '训练完成 · 准确率 92% · Loss 0.22 · 无攻击 · 归档', severity: 'info' },
      ] },
    { task_id: 'task-fedtrain-99949', task_name: '联邦训练-图像分类', model_type: 'GNN', aggregation: 'Bulyan', encryption_type: '同态加密', privacy_epsilon: 2.5, noniid_alpha: 0.6, current_round: 15, total_rounds: 35, current_accuracy: 0.83, current_loss: 0.51, client_count: 8, detected_malicious_ratio: 0.28, attack_detected: true, attack_type: '梯度反转', status: 'running',
      task_log: [
        { time: '16:20', round: 1, event: '任务启动 · 聚合算法 Bulyan · 同态加密 · ε=2.5 α=0.6', severity: 'info' },
        { time: '16:35', round: 7, event: '第7轮: 检测2/8客户端梯度反转 · 恶意比28%', severity: 'critical' },
        { time: '16:48', round: 15, event: '当前: Bulyan对抗中 准确率 83% · 攻击类别: 梯度反转', severity: 'warning' },
      ] },
    { task_id: 'task-fedtrain-99950', task_name: '联邦训练-欺诈检测', model_type: 'LSTM', aggregation: 'Krum', encryption_type: '差分隐私', privacy_epsilon: 1.2, noniid_alpha: 0.3, current_round: 31, total_rounds: 55, current_accuracy: 0.87, current_loss: 0.38, client_count: 10, detected_malicious_ratio: 0.15, attack_detected: false, attack_type: '-', status: 'running',
      task_log: [
        { time: '15:55', round: 1, event: '任务启动 · 聚合算法 Krum · 差分隐私 · ε=1.2 α=0.3', severity: 'info' },
        { time: '16:15', round: 15, event: '第15轮: 准确率 82% · Krum 过滤1个低质量梯度', severity: 'info' },
        { time: '16:40', round: 28, event: '第28轮: 准确率 86% · 全部客户端梯度正常', severity: 'info' },
        { time: '16:55', round: 31, event: '当前: 准确率 87% · Loss 0.38 · 无安全事件', severity: 'info' },
      ] },
  ] satisfies TaskSecurity[],

  /* ================================================================
   * ④ by_dataset: 数据集安全（数据安全层）
   *    数据来源：dim_data_source 加工（与任务运营调度 MOCK_DATASETS 对齐）
   * ================================================================ */
  dataset_security: [
    { source_id: 'ds-user-behavior', source_name: '用户行为日志', modality: '结构化', business_tag: 'CTR', size: '12GB', privacy_epsilon: 2.1, compliance_level: 'high', relation_count: 7 },
    { source_id: 'ds-transaction', source_name: '交易记录', modality: '结构化', business_tag: '风控', size: '8GB', privacy_epsilon: 1.5, compliance_level: 'high', relation_count: 5 },
    { source_id: 'ds-device-fingerprint', source_name: '设备指纹', modality: '多模态', business_tag: 'IOT', size: '30GB', privacy_epsilon: 3.0, compliance_level: 'medium', relation_count: 3 },
    { source_id: 'ds-network-traffic', source_name: '网络流量', modality: '结构化', business_tag: '安全', size: '25GB', privacy_epsilon: 2.8, compliance_level: 'medium', relation_count: 4 },
    { source_id: 'ds-user-profile', source_name: '用户画像', modality: '结构化', business_tag: '精准营销', size: '18GB', privacy_epsilon: 1.8, compliance_level: 'high', relation_count: 6 },
    { source_id: 'ds-call-record', source_name: '通话记录', modality: '结构化', business_tag: '反欺诈', size: '15GB', privacy_epsilon: 2.5, compliance_level: 'medium', relation_count: 4 },
    { source_id: 'ds-sms-content', source_name: '短信内容', modality: '文本', business_tag: '反欺诈', size: '6GB', privacy_epsilon: 3.2, compliance_level: 'medium', relation_count: 3 },
    { source_id: 'ds-social-graph', source_name: '社交关系图', modality: '图数据', business_tag: '反欺诈', size: '35GB', privacy_epsilon: 3.5, compliance_level: 'low', relation_count: 2 },
    { source_id: 'ds-image-ocr', source_name: '证件OCR图像', modality: '图像', business_tag: 'KYC', size: '20GB', privacy_epsilon: 4.0, compliance_level: 'low', relation_count: 2 },
    { source_id: 'ds-voice-record', source_name: '语音录音', modality: '音频', business_tag: '客服', size: '40GB', privacy_epsilon: 3.8, compliance_level: 'low', relation_count: 1 },
    { source_id: 'ds-genomic', source_name: '基因数据', modality: '生物', business_tag: '健康', size: '80GB', privacy_epsilon: 5.0, compliance_level: 'low', relation_count: 1 },
    { source_id: 'ds-payment', source_name: '支付流水', modality: '结构化', business_tag: '风控', size: '14GB', privacy_epsilon: 1.0, compliance_level: 'high', relation_count: 6 },
    { source_id: 'ds-medical-record', source_name: '医疗记录', modality: '结构化', business_tag: '健康', size: '30GB', privacy_epsilon: 0.5, compliance_level: 'high', relation_count: 2 },
    { source_id: 'ds-weather', source_name: '气象数据', modality: '时序', business_tag: '公共服务', size: '50GB', privacy_epsilon: 0.3, compliance_level: 'high', relation_count: 1 },
    { source_id: 'ds-satellite', source_name: '卫星遥感', modality: '图像', business_tag: '测绘', size: '200GB', privacy_epsilon: 0.2, compliance_level: 'high', relation_count: 1 },
  ] satisfies DatasetSecurity[],

  /* ================================================================
   * ⑤ by_network: 链路安全（网络安全层）
   *    数据来源：ts_network_link_metric 加工
   * ================================================================ */
  network_security: [
    { link_id: 'link-shenzhen-shanghai', source_vertex_id: 'edge-shenzhen-01', target_vertex_id: 'edge-shanghai-01', bandwidth_usage_gbps: 6.2, latency_ms: 8.5, packet_loss_pct: 0.10, status: 'normal' },
    { link_id: 'link-shenzhen-beijing', source_vertex_id: 'edge-shenzhen-01', target_vertex_id: 'edge-beijing-01', bandwidth_usage_gbps: 8.1, latency_ms: 15.3, packet_loss_pct: 0.25, status: 'normal' },
    { link_id: 'link-beijing-shanghai', source_vertex_id: 'edge-beijing-01', target_vertex_id: 'edge-shanghai-01', bandwidth_usage_gbps: 9.5, latency_ms: 12.1, packet_loss_pct: 0.40, status: 'busy' },
    { link_id: 'link-shenzhen-xian', source_vertex_id: 'edge-shenzhen-01', target_vertex_id: 'edge-xian-01', bandwidth_usage_gbps: 3.5, latency_ms: 28.7, packet_loss_pct: 1.80, status: 'degraded' },
    { link_id: 'link-chengdu-xian', source_vertex_id: 'edge-chengdu-01', target_vertex_id: 'edge-xian-01', bandwidth_usage_gbps: 2.1, latency_ms: 35.2, packet_loss_pct: 2.50, status: 'degraded' },
    { link_id: 'link-shanghai-hangzhou', source_vertex_id: 'edge-shanghai-01', target_vertex_id: 'edge-hangzhou-01', bandwidth_usage_gbps: 7.3, latency_ms: 5.2, packet_loss_pct: 0.05, status: 'normal' },
    { link_id: 'link-guangzhou-shenzhen', source_vertex_id: 'edge-guangzhou-01', target_vertex_id: 'edge-shenzhen-01', bandwidth_usage_gbps: 8.8, latency_ms: 4.1, packet_loss_pct: 0.08, status: 'normal' },
    { link_id: 'link-wuhan-nanjing', source_vertex_id: 'edge-wuhan-01', target_vertex_id: 'edge-nanjing-01', bandwidth_usage_gbps: 5.6, latency_ms: 18.4, packet_loss_pct: 0.55, status: 'normal' },
    { link_id: 'link-beijing-tianjin', source_vertex_id: 'edge-beijing-01', target_vertex_id: 'supercomputing-tianjin-01', bandwidth_usage_gbps: 6.9, latency_ms: 7.3, packet_loss_pct: 0.15, status: 'normal' },
    { link_id: 'link-nanjing-shanghai', source_vertex_id: 'edge-nanjing-01', target_vertex_id: 'edge-shanghai-01', bandwidth_usage_gbps: 7.8, latency_ms: 9.6, packet_loss_pct: 0.30, status: 'normal' },
  ] satisfies NetworkLinkSecurity[],

  /* ================================================================
   * ⑥ 资源告警（系统安全层量化指标）
   *    数据来源：任务运营调度 算力任务运营调度 → fact_alert_record
   *    与 TaskManagement 的 ALERT_THRESHOLDS 一致
   *    CPU≥80 critical, 内存≥80 critical, GPU≥80 critical
   * ================================================================ */
  system_alerts: [
    { id: 'alert-cpu-critical-01', node_id: 'edge-xian-01', node_name: '西安边缘节点', metric: 'CPU 利用率', value: 94, threshold: 80, level: 'critical', message: '西安边缘节点 CPU 利用率达 94%，超过严重阈值 80%', timestamp: Date.now() },
    { id: 'alert-mem-critical-01', node_id: 'edge-xian-01', node_name: '西安边缘节点', metric: '内存利用率', value: 87, threshold: 80, level: 'critical', message: '西安边缘节点 内存利用率达 87%，超过严重阈值 80%', timestamp: Date.now() },
    { id: 'alert-gpu-critical-01', node_id: 'supercomputing-tianjin-01', node_name: '天津西青超算中心', metric: 'GPU 利用率', value: 92, threshold: 80, level: 'critical', message: '天津西青超算中心 GPU 利用率达 92%，超过严重阈值 80%', timestamp: Date.now() },
    { id: 'alert-cpu-warn-01', node_id: 'edge-chengdu-01', node_name: '成都边缘节点', metric: 'CPU 利用率', value: 74, threshold: 60, level: 'warning', message: '成都边缘节点 CPU 利用率达 74%，超过警告阈值 60%', timestamp: Date.now() },
    { id: 'alert-cpu-warn-02', node_id: 'supercomputing-wuhan-01', node_name: '武汉超算中心', metric: 'CPU 利用率', value: 68, threshold: 60, level: 'warning', message: '武汉超算中心 CPU 利用率达 68%，超过警告阈值 60%', timestamp: Date.now() },
    { id: 'alert-cpu-warn-03', node_id: 'supercomputing-xian-01', node_name: '西安超算中心', metric: 'CPU 利用率', value: 72, threshold: 60, level: 'warning', message: '西安超算中心 CPU 利用率达 72%，超过警告阈值 60%', timestamp: Date.now() },
    { id: 'alert-cpu-warn-04', node_id: 'edge-wuhan-01', node_name: '武汉边缘节点', metric: 'CPU 利用率', value: 65, threshold: 60, level: 'warning', message: '武汉边缘节点 CPU 利用率达 65%，超过警告阈值 60%', timestamp: Date.now() },
    { id: 'alert-mem-warn-01', node_id: 'supercomputing-tianjin-01', node_name: '天津西青超算中心', metric: '内存利用率', value: 76, threshold: 60, level: 'warning', message: '天津西青超算中心 内存利用率达 76%，超过警告阈值 60%', timestamp: Date.now() },
    { id: 'alert-mem-warn-02', node_id: 'edge-chengdu-01', node_name: '成都边缘节点', metric: '内存利用率', value: 71, threshold: 60, level: 'warning', message: '成都边缘节点 内存利用率达 71%，超过警告阈值 60%', timestamp: Date.now() },
    { id: 'alert-gpu-warn-01', node_id: 'edge-wuhan-01', node_name: '武汉边缘节点', metric: 'GPU 利用率', value: 63, threshold: 60, level: 'warning', message: '武汉边缘节点 GPU 利用率达 63%，超过警告阈值 60%', timestamp: Date.now() },
  ] satisfies SecurityAlert[],

  alert_summary: {
    total_alerts: 10,
    critical_count: 3,
    warning_count: 7,
    affected_nodes: 5,
    total_nodes: 15,
    breakdown: {
      cpu: { critical: 1, warning: 4 },
      mem: { critical: 1, warning: 2 },
      gpu: { critical: 1, warning: 1 },
    },
  },

  /* ================================================================
   * ⑦ 算法策略决策中心
   * ================================================================ */
  algorithm_strategy: {
    aggregation_options: ['FedAvg', 'Krum', '几何中值', 'Bulyan'],
    convergence_curves: [
      {
        method: 'Bulyan',
        label: 'Bulyan (RL选中)',
        data: Array.from({ length: 20 }, (_, i) => ({ round: i + 1, accuracy: [0.55, 0.62, 0.68, 0.74, 0.78, 0.81, 0.84, 0.86, 0.88, 0.89, 0.90, 0.90, 0.90, 0.90, 0.90, 0.90, 0.90, 0.90, 0.90, 0.90][i] })),
        final_accuracy: 0.90,
        color: '#1677ff',
      },
      {
        method: 'Krum',
        label: 'Krum',
        data: Array.from({ length: 20 }, (_, i) => ({ round: i + 1, accuracy: [0.52, 0.58, 0.63, 0.67, 0.72, 0.76, 0.79, 0.81, 0.83, 0.84, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85][i] })),
        final_accuracy: 0.85,
        color: '#52c41a',
      },
      {
        method: '几何中值',
        label: '几何中值',
        data: Array.from({ length: 20 }, (_, i) => ({ round: i + 1, accuracy: [0.50, 0.56, 0.61, 0.66, 0.70, 0.73, 0.76, 0.78, 0.80, 0.81, 0.82, 0.82, 0.82, 0.82, 0.82, 0.82, 0.82, 0.82, 0.82, 0.82][i] })),
        final_accuracy: 0.82,
        color: '#faad14',
      },
      {
        method: 'FedAvg',
        label: 'FedAvg (崩溃)',
        data: Array.from({ length: 20 }, (_, i) => ({ round: i + 1, accuracy: [0.50, 0.58, 0.65, 0.71, 0.75, 0.68, 0.59, 0.51, 0.48, 0.50, 0.55, 0.58, 0.59, 0.60, 0.61, 0.61, 0.61, 0.61, 0.61, 0.61][i] })),
        final_accuracy: 0.61,
        color: '#ff4d4f',
      },
    ],
    decision_logs: [
      { time: '16:45', event: '恶意节点比例 40% → 维持 Bulyan 聚合策略' },
      { time: '16:42', event: '节点 edge-xian-01 梯度异常 35% → 切换 FedAvg → Bulyan' },
      { time: '16:38', event: '调度中枢检测到后门攻击告警(来自训练监控员 训练监控)' },
      { time: '16:31', event: '攻击强度 < 10% → 切换 Bulyan → FedAvg(省算力)' },
      { time: '16:24', event: '算法层安全分 82 → 维持当前策略' },
      { time: '16:18', event: '训练监控员标记节点 edge-xian-01 梯度偏差超阈值' },
      { time: '16:12', event: '数据层安全分 87 → 调用 Bulyan 保障鲁棒性' },
      { time: '16:05', event: 'RL模型预测当前攻击为梯度反转类型,可信度 91%' },
      { time: '15:58', event: '全网梯度一致性检测: 3/10 节点偏离 > 2σ' },
      { time: '15:45', event: '新任务 task-fedtrain-99943 提交,初始聚合 FedAvg' },
      { time: '15:30', event: '系统层安全分 76 → 调度避开可信度 < 70 的节点' },
      { time: '15:22', event: '网络层安全分 79 → 避开链路 link-shenzhen-xian(丢包率 1.8%)' },
      { time: '15:15', event: '全局安全态势评估: B+(82.5), 算法风险为主导因素' },
    ],
  },

  /* ================================================================
   * ⑧ 算法安全层丰富指标（来源：训练监控 训练监控）
   * ================================================================ */
  fairness: {
    jain_index: 0.81,
    gini_coefficient: 0.25,
    theil_index: 0.18,
    description: '知识蒸馏后Jain公平性指数从0.63提升到0.81，基尼系数从0.42降到0.25',
  } satisfies FairnessMetrics,

  distillation: {
    sigma_before: 0.18,
    sigma_after: 0.04,
    improvement_pct: 77.8,
    description: '知识蒸馏自适应使各client准确率标准差从0.18降至0.04，非IID鲁棒性显著提升',
  } satisfies DistillationRobustness,

  /* ================================================================
   * ⑨ 网络安全层丰富指标（来源：资源池管控 资源池管控）
   * ================================================================ */
  communication_opt: {
    strategy: 'Top-K 稀疏化(K=10%) + Int8 量化',
    baseline_gb_per_round: 8.0,
    optimized_gb_per_round: 1.2,
    saving_pct: 85.0,
    monthly_total_tb: 1.2,
    monthly_baseline_tb: 8.4,
    monthly_saving_pct: 85.7,
  } satisfies CommunicationOptimization,

  accuracy_vs_comm: [
    { label: 'FedAvg(无优化)', accuracy: 88, communication_saving_pct: 0, is_best: false },
    { label: 'Int8 量化', accuracy: 87, communication_saving_pct: 50, is_best: false },
    { label: 'Top-K 稀疏', accuracy: 85, communication_saving_pct: 75, is_best: false },
    { label: 'Top-K + Int8 ★', accuracy: 82, communication_saving_pct: 92, is_best: true },
  ] satisfies AccuracyVsCommunicationPoint[],

  comm_timeline: Array.from({ length: 10 }, (_, i) => ({
    round: i + 1,
    baseline_gb: 8.0,
    optimized_gb: i === 0 ? 8.0 : i === 1 ? 6.5 : i === 2 ? 3.5 : i === 3 ? 1.8 : 1.2,
  })) satisfies CommTimelinePoint[],

  /* ⑨ 中心↔节点通信链路: Master调度中枢→各边缘节点的时延/带宽/丢包 */
  master_node_links: [
    { node_id: 'edge-shenzhen-01', node_name: '深圳边缘节点', latency_ms: 8, bandwidth_gbps: 9.5, packet_loss_pct: 0.05, status: 'normal' },
    { node_id: 'edge-shanghai-01', node_name: '上海边缘节点', latency_ms: 12, bandwidth_gbps: 8.2, packet_loss_pct: 0.10, status: 'normal' },
    { node_id: 'edge-beijing-01', node_name: '北京边缘节点', latency_ms: 18, bandwidth_gbps: 7.0, packet_loss_pct: 0.25, status: 'normal' },
    { node_id: 'edge-hangzhou-01', node_name: '杭州边缘节点', latency_ms: 6, bandwidth_gbps: 9.8, packet_loss_pct: 0.02, status: 'normal' },
    { node_id: 'edge-guangzhou-01', node_name: '广州边缘节点', latency_ms: 5, bandwidth_gbps: 10.0, packet_loss_pct: 0.08, status: 'normal' },
    { node_id: 'edge-nanjing-01', node_name: '南京边缘节点', latency_ms: 14, bandwidth_gbps: 7.5, packet_loss_pct: 0.20, status: 'normal' },
    { node_id: 'edge-wuhan-01', node_name: '武汉边缘节点', latency_ms: 20, bandwidth_gbps: 5.5, packet_loss_pct: 0.60, status: 'busy' },
    { node_id: 'edge-chengdu-01', node_name: '成都边缘节点', latency_ms: 25, bandwidth_gbps: 4.0, packet_loss_pct: 0.85, status: 'busy' },
    { node_id: 'edge-xian-01', node_name: '西安边缘节点', latency_ms: 35, bandwidth_gbps: 2.5, packet_loss_pct: 2.50, status: 'degraded' },
  ] satisfies MasterToNodeLink[],

  /* ================================================================
   * ⑩ 数据安全层丰富指标（来源：任务运营调度 任务运营调度）
   * ================================================================ */
  correlation_risks: [
    { source_id: 'ds-user-behavior', source_name: '用户行为日志', target_id: 'ds-transaction', target_name: '交易记录', correlation: 0.87, risk_level: 'high' },
    { source_id: 'ds-user-behavior', source_name: '用户行为日志', target_id: 'ds-app-usage', target_name: 'APP使用记录', correlation: 0.83, risk_level: 'high' },
    { source_id: 'ds-user-behavior', source_name: '用户行为日志', target_id: 'ds-ecommerce-order', target_name: '电商订单', correlation: 0.74, risk_level: 'medium' },
    { source_id: 'ds-user-behavior', source_name: '用户行为日志', target_id: 'ds-network-traffic', target_name: '网络流量', correlation: 0.62, risk_level: 'medium' },
    { source_id: 'ds-call-record', source_name: '通话记录', target_id: 'ds-sms-content', target_name: '短信内容', correlation: 0.71, risk_level: 'high' },
    { source_id: 'ds-user-behavior', source_name: '用户行为日志', target_id: 'ds-location-trace', target_name: '位置轨迹', correlation: 0.59, risk_level: 'medium' },
    { source_id: 'ds-payment', source_name: '支付流水', target_id: 'ds-credit-score', target_name: '信用评分', correlation: 0.68, risk_level: 'medium' },
    { source_id: 'ds-social-graph', source_name: '社交关系图', target_id: 'ds-call-record', target_name: '通话记录', correlation: 0.66, risk_level: 'medium' },
  ] satisfies DatasetCorrelationRisk[],

  compliance_sources: [
    { source_id: 'src-anti-fraud', source_name: '反欺诈中心', business_tag: '反欺诈', compliance_level: 'high', description: '电信运营商内部合规审批，最高等级' },
    { source_id: 'src-risk-ctrl', source_name: '风控中心', business_tag: '风控', compliance_level: 'high', description: '金融级数据脱敏流程，符合PCI DSS' },
    { source_id: 'src-user-profile', source_name: '用户画像中心', business_tag: '精准营销', compliance_level: 'medium', description: '需用户授权，按《个人信息保护法》执行' },
    { source_id: 'src-iot', source_name: 'IoT设备中心', business_tag: 'IOT', compliance_level: 'medium', description: '设备匿名化处理，非个人数据' },
    { source_id: 'src-third-party', source_name: '第三方广告联盟', business_tag: '广告', compliance_level: 'low', description: '第三方数据，需评估数据来源合法性' },
  ] satisfies ComplianceSource[],

  /* ================================================================
   * ⑪ 系统安全层丰富指标（来源：资源池管控 数据存储集群）
   * ================================================================ */
  storage_clusters: [
    { cluster_id: 'storage-shenzhen-01', cluster_name: '深圳存储集群', capacity_tb: 20, used_tb: 16.4, used_pct: 82, io_performance: '4.2GB/s', status: 'online' },
    { cluster_id: 'storage-shanghai-01', cluster_name: '上海存储集群', capacity_tb: 20, used_tb: 13.6, used_pct: 68, io_performance: '3.8GB/s', status: 'online' },
    { cluster_id: 'storage-beijing-01', cluster_name: '北京存储集群', capacity_tb: 20, used_tb: 14.8, used_pct: 74, io_performance: '4.0GB/s', status: 'online' },
    { cluster_id: 'storage-chengdu-01', cluster_name: '成都存储集群', capacity_tb: 20, used_tb: 11.2, used_pct: 56, io_performance: '3.5GB/s', status: 'online' },
    { cluster_id: 'storage-guangzhou-01', cluster_name: '广州存储集群', capacity_tb: 20, used_tb: 15.6, used_pct: 78, io_performance: '3.9GB/s', status: 'online' },
    { cluster_id: 'storage-hangzhou-01', cluster_name: '杭州存储集群', capacity_tb: 20, used_tb: 12.4, used_pct: 62, io_performance: '3.6GB/s', status: 'online' },
    { cluster_id: 'storage-wuhan-01', cluster_name: '武汉存储集群', capacity_tb: 20, used_tb: 14.0, used_pct: 70, io_performance: '3.3GB/s', status: 'online' },
    { cluster_id: 'storage-xian-01', cluster_name: '西安存储集群', capacity_tb: 20, used_tb: 18.8, used_pct: 94, io_performance: '2.5GB/s', status: 'warning' },
    { cluster_id: 'storage-nanjing-01', cluster_name: '南京存储集群', capacity_tb: 20, used_tb: 13.2, used_pct: 66, io_performance: '3.7GB/s', status: 'online' },
    { cluster_id: 'storage-tianjin-01', cluster_name: '天津存储集群', capacity_tb: 20, used_tb: 17.2, used_pct: 86, io_performance: '3.1GB/s', status: 'online' },
    { cluster_id: 'storage-changsha-01', cluster_name: '长沙存储集群', capacity_tb: 20, used_tb: 10.8, used_pct: 54, io_performance: '3.4GB/s', status: 'online' },
    { cluster_id: 'storage-zhengzhou-01', cluster_name: '郑州存储集群', capacity_tb: 20, used_tb: 12.8, used_pct: 64, io_performance: '3.2GB/s', status: 'online' },
  ] satisfies StorageClusterHealth[],

  /* ================================================================
   * 🆕 超算节点安全（来源：rpj·资源池管控 → 超算节点总览）
   * ================================================================ */
  supercomputing_security: [
    { node_id: 'sc-shenzhen-01', node_name: '深圳超算中心', trust_score: 96, health_score: 93, warning_level: 'normal', task_success_rate: 0.97, gradient_anomaly_count: 0, status: 'online', compute_power: '512 PFLOPS', cpu_cores: 2048, gpu_count: 128, gpu_type: 'NVIDIA A100 80G', network_bw: '400Gbps', capability_score: 95 },
    { node_id: 'sc-shanghai-01', node_name: '上海超算中心', trust_score: 94, health_score: 91, warning_level: 'normal', task_success_rate: 0.95, gradient_anomaly_count: 0, status: 'online', compute_power: '480 PFLOPS', cpu_cores: 1800, gpu_count: 96, gpu_type: 'NVIDIA A100 80G', network_bw: '400Gbps', capability_score: 92 },
    { node_id: 'sc-beijing-01', node_name: '北京超算中心', trust_score: 91, health_score: 87, warning_level: 'normal', task_success_rate: 0.93, gradient_anomaly_count: 1, status: 'online', compute_power: '420 PFLOPS', cpu_cores: 1600, gpu_count: 64, gpu_type: 'NVIDIA H800 80G', network_bw: '300Gbps', capability_score: 88 },
    { node_id: 'sc-tianjin-01', node_name: '天津西青超算中心', trust_score: 81, health_score: 78, warning_level: 'warning', task_success_rate: 0.85, gradient_anomaly_count: 2, status: 'online', compute_power: '256 PFLOPS', cpu_cores: 1024, gpu_count: 48, gpu_type: 'NVIDIA A100 80G', network_bw: '200Gbps', capability_score: 72 },
    { node_id: 'sc-chengdu-01', node_name: '成都超算中心', trust_score: 85, health_score: 82, warning_level: 'normal', task_success_rate: 0.88, gradient_anomaly_count: 1, status: 'online', compute_power: '320 PFLOPS', cpu_cores: 1280, gpu_count: 56, gpu_type: 'NVIDIA V100 32G', network_bw: '200Gbps', capability_score: 78 },
    { node_id: 'sc-xian-01', node_name: '西安超算中心', trust_score: 72, health_score: 68, warning_level: 'warning', task_success_rate: 0.78, gradient_anomaly_count: 3, status: 'online', compute_power: '180 PFLOPS', cpu_cores: 768, gpu_count: 32, gpu_type: 'NVIDIA V100 32G', network_bw: '100Gbps', capability_score: 65 },
  ] satisfies SupercomputingNodeSecurity[],

  /* ================================================================
   * 🆕 后门攻击检测（来源：zdg·EdgeControl → 联邦训练监控）
   * ================================================================ */
  backdoor_attack: {
    detected: true,
    current_round: 24,
    suspect_node_id: 'edge-xian-01',
    suspect_node_name: '西安边缘节点',
    gradient_deviation_sigma: '2.5σ',
    attack_round: 12,
    description: '第12轮: 客户端 edge-xian-01 梯度偏差超过 2σ 阈值，持续偏离至第24轮已超 2.5σ。疑为后门攻击节点，试图通过注入恶意梯度样本影响全局模型收敛方向。',
    suggestion: '决策大脑已自动切换聚合算法至 Bulyan，剔除可疑节点梯度更新。此告警已同步至调度中枢。建议运维人员进一步审查该节点历史行为。',
    security_status: {
      gradient_clipping: true,
      differential_privacy: true,
      aggregation_algorithm: 'Bulyan',
      algorithm_switched: true,
      suspect_nodes: ['edge-xian-01'],
    },
  } satisfies BackdoorAttackDetection,

  /* ================================================================
   * 🆕 非IID数据偏斜安全评估（来源：zdg·EdgeControl → 数据分布热力图）
   * ================================================================ */
  noniid_distribution: {
    alpha_options: [0.1, 0.5, 1.0],
    default_alpha: 0.5,
    client_names: ['深圳边缘', '北京边缘', '上海边缘', '广州边缘', '成都边缘', '武汉边缘', '西安边缘', '杭州边缘', '南京边缘', '重庆边缘'],
    class_count: 10,
    heatmap_data_by_alpha: {
      '0.1': {
        label: 'α=0.1 极度偏斜',
        risk_level: 'high',
        description: '各客户端仅持有极少数类别数据，训练收敛慢、后门攻击成功率可达 72%，隐私泄露风险高',
        data: [
          [422, 0, 0, 0, 0, 0, 240, 0, 0, 338],
          [0, 0, 518, 0, 0, 0, 0, 0, 482, 0],
          [0, 405, 0, 0, 0, 0, 0, 315, 0, 280],
          [0, 0, 0, 556, 0, 0, 0, 444, 0, 0],
          [0, 0, 0, 0, 480, 520, 0, 0, 0, 0],
          [320, 0, 0, 0, 0, 0, 0, 680, 0, 0],
          [0, 0, 0, 0, 0, 350, 650, 0, 0, 0],
          [0, 290, 0, 0, 0, 0, 0, 0, 710, 0],
          [0, 0, 380, 0, 0, 0, 0, 0, 0, 620],
          [0, 0, 0, 500, 0, 0, 500, 0, 0, 0],
        ],
      },
      '0.5': {
        label: 'α=0.5 中等偏斜',
        risk_level: 'medium',
        description: '各客户端主要分布在某些类别但有一定混合，训练需较多轮次收敛，后门攻击成功率约 35%',
        data: [
          [210, 45, 110, 22, 170, 15, 310, 8, 95, 15],
          [65, 240, 55, 180, 20, 310, 12, 95, 18, 5],
          [110, 28, 195, 45, 88, 12, 380, 5, 122, 15],
          [22, 170, 55, 220, 15, 45, 310, 8, 140, 15],
          [180, 18, 120, 8, 195, 75, 15, 310, 5, 74],
          [35, 88, 12, 310, 8, 240, 55, 180, 15, 57],
          [8, 320, 5, 122, 15, 45, 210, 7, 250, 18],
          [95, 15, 380, 5, 122, 18, 65, 240, 8, 52],
          [15, 310, 8, 95, 18, 5, 110, 28, 195, 216],
          [55, 180, 15, 57, 8, 250, 45, 210, 7, 173],
        ],
      },
      '1.0': {
        label: 'α=1.0 接近 IID',
        risk_level: 'low',
        description: '各客户端数据分布均匀，训练收敛快、公平性好，后门攻击成功率仅约 8%',
        data: [
          [102, 98, 105, 96, 108, 95, 101, 99, 97, 99],
          [99, 103, 97, 101, 98, 104, 96, 102, 100, 100],
          [101, 97, 100, 103, 99, 98, 104, 96, 102, 100],
          [98, 104, 96, 102, 101, 99, 100, 103, 97, 100],
          [100, 101, 99, 98, 102, 97, 103, 100, 104, 96],
          [97, 102, 103, 99, 100, 101, 98, 104, 96, 100],
          [103, 96, 104, 100, 97, 102, 99, 101, 98, 100],
          [104, 99, 98, 101, 96, 103, 97, 100, 102, 100],
          [96, 100, 102, 97, 104, 99, 101, 98, 103, 100],
          [100, 97, 99, 104, 96, 102, 98, 101, 100, 103],
        ],
      },
    },
  } satisfies NonIIDDistribution,

  /* ================================================================
   * RationalTrust 时空双域信任评估（新增第5 Tab）
   * ================================================================ */
  rational_trust: RATIONAL_TRUST_DATA,
};

export default SECURITY_DATA;
