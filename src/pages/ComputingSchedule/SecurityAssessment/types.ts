export type SecurityLayer = 'data' | 'algorithm' | 'network' | 'system';

export const SECURITY_LAYER_LABELS: Record<SecurityLayer, string> = {
  data: '数据安全',
  algorithm: '算法安全',
  network: '网络安全',
  system: '系统安全',
};

/** 四层安全评分维度 */
export interface SecurityDimension {
  layer: SecurityLayer;
  label: string;
  score: number;
  weight: number;
}

/** AHP 层次分析法权重矩阵 */
export interface AHPWeight {
  data: number;
  algorithm: number;
  network: number;
  system: number;
}

/** D-S 证据理论合成 */
export interface DSEvidence {
  combined_score: number;
  description: string;
}

/** PCA 主成分 */
export interface PCAComponent {
  pct: number;
  driver: string;
}

export interface PCADecomposition {
  pc1: PCAComponent;
  pc2: PCAComponent;
}

/** 钻取链接 */
export interface DrillTarget {
  label: string;
  path: string | null;
  person?: string;
}

export interface DrillMap {
  data: DrillTarget;
  algorithm: DrillTarget;
  network: DrillTarget;
  system: DrillTarget;
}

/** 全局安全态势 —— 页面核心数据 */
export interface GlobalSecurityPosture {
  snapshot_time: string;
  overall_grade: string;
  overall_score: number;
  dimensions: Record<SecurityLayer, SecurityDimension>;
  ahp_weights: AHPWeight;
  ds_evidence: DSEvidence;
  pca: PCADecomposition;
  drill_targets: DrillMap;
}

/* ================================================================
 * 统一时序数据模型（用于所有时序图）
 * 设计目标：
 *  - 可嵌套：一个指标可以包含多个子指标（递归结构）
 *  - 可拓展：新增指标只需在数组里加一项，无需新增类型
 *  - 全快照：一个时间点上的完整状态 = 一棵 MetricNode 树
 *  - 通用性：评分类、资源类、通信类等任何数值指标共用同一结构
 * ================================================================ */

/** 指标树节点（递归） */
export interface MetricNode {
  id: string;                    // 唯一标识，如 "data.epsilon" / "cpu_usage" / "schedule_delay"
  name: string;                  // 中文展示名
  value: number;                 // 当前数值
  weight?: number;               // 在父级中的权重（叶子节点，如 40 表示 40%）
  unit?: string;                 // 单位，如 '%'/'ms'/'GB'
  threshold?: {                  // 阈值
    warning?: number;            // 超过此值进入警告
    critical?: number;           // 超过此值进入严重
    reverse?: boolean;           // true=越小越差（默认false=越大越差）
  };
  children?: MetricNode[];       // 子指标（递归）
}

/** 单个时间点的完整快照 */
export interface TimelineSnapshot {
  time: string;                  // wall-clock "HH:mm:ss"
  round?: number;                // 训练轮次（可选）
  root: MetricNode;              // 根节点 = 完整状态树
}

/** 指标元数据注册表（用于声明哪些指标需要被追踪） */
export interface MetricRegistration {
  id: string;                    // 指标 ID
  name: string;                  // 中文名
  parentId?: string;             // 父指标 ID
  weight?: number;               // 权重
  unit?: string;                 // 单位
  threshold?: MetricNode['threshold'];
}

/* ================================================================
 * 五维下钻数据
 * ================================================================ */

/** by_node: 节点安全（系统安全层） */
export interface NodeSecurity {
  node_id: string;
  node_name: string;
  trust_score: number;
  health_score: number;
  warning_level: 'normal' | 'warning' | 'critical';
  task_success_rate: number;
  gradient_anomaly_count: number;
  status: string;
}

/** 资源告警（来源：任务运营调度 算力任务运营调度 → fact_alert_record） */
export interface SecurityAlert {
  id: string;
  node_id: string;
  node_name: string;
  metric: string;
  value: number;
  threshold: number;
  level: 'critical' | 'warning';
  message: string;
  timestamp: number;
}

export interface MetricAlertBreakdown {
  critical: number;
  warning: number;
}

/** 告警汇总（系统安全层量化指标） */
export interface AlertSummary {
  total_alerts: number;
  critical_count: number;
  warning_count: number;
  affected_nodes: number;
  total_nodes: number;
  breakdown: {
    cpu: MetricAlertBreakdown;
    mem: MetricAlertBreakdown;
    gpu: MetricAlertBreakdown;
  };
}

/** by_task: 任务安全（算法安全层） */

/** per-task 安全事件日志 */
export interface TaskLogItem {
  time: string;
  round: number;
  event: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface TaskSecurity {
  task_id: string;
  task_name: string;
  model_type: string;
  aggregation: string;
  encryption_type: string;
  privacy_epsilon: number;
  noniid_alpha: number;
  current_round: number;
  total_rounds: number;
  current_accuracy: number;
  current_loss: number;
  client_count: number;
  detected_malicious_ratio: number;
  attack_detected: boolean;
  attack_type: string;
  task_log: TaskLogItem[];
  status: string;
}

/** by_dataset: 数据集安全（数据安全层） */
export interface DatasetSecurity {
  source_id: string;
  source_name: string;
  modality: string;
  business_tag: string;
  size: string;
  privacy_epsilon: number;
  compliance_level: 'high' | 'medium' | 'low';
  relation_count: number;
}

/** by_network: 链路安全（网络安全层） */
export interface NetworkLinkSecurity {
  link_id: string;
  source_vertex_id: string;
  target_vertex_id: string;
  bandwidth_usage_gbps: number;
  latency_ms: number;
  packet_loss_pct: number;
  status: 'normal' | 'busy' | 'degraded';
}

/** 算法层: 收敛曲线 + 决策日志 */
export interface ConvergencePoint {
  round: number;
  accuracy: number;
}

export interface AlgorithmConvergence {
  method: string;
  label: string;
  data: ConvergencePoint[];
  final_accuracy: number;
  color: string;
}

export interface DecisionLogItem {
  time: string;
  event: string;
}

export interface AlgorithmStrategyData {
  aggregation_options: string[];
  convergence_curves: AlgorithmConvergence[];
  decision_logs: DecisionLogItem[];
}

/* ================================================================
 * 算法安全层：系统级聚合指标（基于所有运行中任务拟合）
 * ================================================================ */

/** 系统级聚合：跨所有运行中任务计算 */
export interface SystemAggregation {
  task_count: number;
  avg_accuracy: number;
  avg_loss: number;
  max_malicious_ratio: number;
  max_round: number;
  total_clients: number;
  attacked_task_count: number;
  epsilon_high_count: number;
  distinct_attacks: string[];
  description: string;
}

/** 公平性指标 */
export interface FairnessMetrics {
  jain_index: number;
  gini_coefficient: number;
  theil_index: number;
  description: string;
}

/** 知识蒸馏鲁棒性 */
export interface DistillationRobustness {
  sigma_before: number;
  sigma_after: number;
  improvement_pct: number;
  description: string;
}

/* ================================================================
 * 网络安全层丰富指标（来源：资源池管控 资源池管控）
 * ================================================================ */

/** 通信性能优化 */
export interface CommunicationOptimization {
  strategy: string;
  baseline_gb_per_round: number;
  optimized_gb_per_round: number;
  saving_pct: number;
  monthly_total_tb: number;
  monthly_baseline_tb: number;
  monthly_saving_pct: number;
}

/** 精度 vs 通信节省散点 */
export interface AccuracyVsCommunicationPoint {
  label: string;
  accuracy: number;
  communication_saving_pct: number;
  is_best: boolean;
}

/** 通信开销时序 */
export interface CommTimelinePoint {
  round: number;
  baseline_gb: number;
  optimized_gb: number;
}

/** 中心↔节点通信链路（Master → 各边缘节点的时延/带宽/丢包） */
export interface MasterToNodeLink {
  node_id: string;
  node_name: string;
  latency_ms: number;
  bandwidth_gbps: number;
  packet_loss_pct: number;
  status: 'normal' | 'busy' | 'degraded';
}

/* ================================================================
 * 数据安全层丰富指标（来源：任务运营调度 任务运营调度）
 * ================================================================ */

/** 数据集关联风险 */
export interface DatasetCorrelationRisk {
  source_id: string;
  source_name: string;
  target_id: string;
  target_name: string;
  correlation: number;
  risk_level: 'high' | 'medium' | 'low';
}

/** 业务方合规来源 */
export interface ComplianceSource {
  source_id: string;
  source_name: string;
  business_tag: string;
  compliance_level: 'high' | 'medium' | 'low';
  description: string;
}

/* ================================================================
 * 系统安全层丰富指标（来源：资源池管控 数据存储集群）
 * ================================================================ */

/** 存储集群健康度 */
export interface StorageClusterHealth {
  cluster_id: string;
  cluster_name: string;
  capacity_tb: number;
  used_tb: number;
  used_pct: number;
  io_performance: string;
  status: 'online' | 'warning' | 'offline';
}

/** 安全评估完整数据集（JSON 根对象） */
export interface SecurityDataRoot {
  global_posture: GlobalSecurityPosture;
  node_security: NodeSecurity[];
  task_security: TaskSecurity[];
  dataset_security: DatasetSecurity[];
  network_security: NetworkLinkSecurity[];
  algorithm_strategy: AlgorithmStrategyData;
  system_alerts: SecurityAlert[];
  alert_summary: AlertSummary;
  fairness: FairnessMetrics;
  distillation: DistillationRobustness;
  communication_opt: CommunicationOptimization;
  accuracy_vs_comm: AccuracyVsCommunicationPoint[];
  comm_timeline: CommTimelinePoint[];
  master_node_links: MasterToNodeLink[];
  correlation_risks: DatasetCorrelationRisk[];
  compliance_sources: ComplianceSource[];
  storage_clusters: StorageClusterHealth[];
  /** 🆕 from rpj·超算节点总览 */
  supercomputing_security: SupercomputingNodeSecurity[];
  /** 🆕 from zdg·EdgeControl → 后门攻击检测 */
  backdoor_attack: BackdoorAttackDetection;
  /** 🆕 from zdg·EdgeControl → 非IID数据偏斜 */
  noniid_distribution: NonIIDDistribution;
  /** 🆕 RationalTrust 时空双域信任评估 */
  rational_trust: RationalTrustData;
}

/* ================================================================
 * 🆕 增量类型：超算节点安全（来源：rpj·资源池管控 → 超算节点总览）
 * ================================================================ */
export interface SupercomputingNodeSecurity {
  node_id: string;
  node_name: string;
  trust_score: number;
  health_score: number;
  warning_level: 'normal' | 'warning' | 'critical';
  task_success_rate: number;
  gradient_anomaly_count: number;
  status: string;
  compute_power: string;
  cpu_cores: number;
  gpu_count: number;
  gpu_type: string;
  network_bw: string;
  capability_score: number;
}

/* ================================================================
 * 🆕 增量类型：后门攻击检测面板（来源：zdg·EdgeControl → 联邦训练监控）
 * ================================================================ */
export interface BackdoorAttackDetection {
  detected: boolean;
  current_round: number;
  suspect_node_id: string;
  suspect_node_name: string;
  gradient_deviation_sigma: string;
  attack_round: number;
  description: string;
  suggestion: string;
  security_status: {
    gradient_clipping: boolean;
    differential_privacy: boolean;
    aggregation_algorithm: string;
    algorithm_switched: boolean;
    suspect_nodes: string[];
  };
}

/* ================================================================
 * 🆕 增量类型：非IID数据偏斜安全评估（来源：zdg·EdgeControl → 数据分布热力图）
 * ================================================================ */
export interface NonIIDDistribution {
  alpha_options: number[];
  default_alpha: number;
  heatmap_data_by_alpha: Record<string, {
    label: string;
    risk_level: 'high' | 'medium' | 'low';
    description: string;
    data: number[][];
  }>;
  client_names: string[];
  class_count: number;
}

/* ================================================================
 * RationalTrust 时空双域信任评估（新增第5 Tab）
 * ================================================================ */

/** 空间域：5 维子空间明细 */
export interface SpatialRiskSubspace {
  sign_flip_rate: number;
  coord_anomaly_rate: number;
  sparsity: number;
  nsr: number;
  coupling_deviation: number;
}

/** 空间域：单节点 5 维得分 */
export interface SpatialDimensionScores {
  D1_gradient_quality: number;
  D2_direction_consistency: number;
  D3_security_risk: number;
  D4_privacy_compliance: number;
  D5_data_diversity: number;
}

/** 空间域：节点完整空间评估 */
export interface NodeSpatialTrust {
  node_id: string;
  node_name: string;
  dimensions: SpatialDimensionScores;
  subspace: SpatialRiskSubspace;
  overall_score: number;
}

/** 时间域：单轮信任快照 */
export interface TrustSnapshot {
  round: number;
  alpha: number;
  beta: number;
  mu: number;
  variance: number;
  cusum_s_plus: number;
  aggregation_weight: number;
}

/** 时间域：节点完整时间演化 */
export interface NodeTemporalTrust {
  node_id: string;
  node_name: string;
  history: TrustSnapshot[];
  latest: TrustSnapshot;
}

/** CUSUM 变点事件 */
export interface CUSUMChangeEvent {
  round: number;
  node_id: string;
  node_name: string;
  trigger_value: number;
  threshold: number;
  action: 'weight_fuse' | 'state_reset' | 'cooldown_start' | 'cooldown_end';
  description: string;
}

/** 决策层枚举 */
export type DecisionLayer = 'full_trust' | 'observation' | 'isolation' | 'rejection';

/** 节点当前决策状态 */
export interface NodeDecisionStatus {
  node_id: string;
  node_name: string;
  mu: number;
  variance: number;
  cusum_s_plus: number;
  layer: DecisionLayer;
  layer_label: string;
  layer_color: string;
  aggregation_weight: number;
  cooldown_remaining: number;
}

/** RationalTrust 完整数据根 */
export interface RationalTrustData {
  /** 空间域：所有节点最新 5 维得分 */
  spatial: NodeSpatialTrust[];
  /** 时间域：所有节点信任演化历史 */
  temporal: NodeTemporalTrust[];
  /** CUSUM 变点事件列表 */
  cusum_events: CUSUMChangeEvent[];
  /** 节点当前决策状态 */
  decisions: NodeDecisionStatus[];
  /** 系统级聚合 */
  system: {
    total_nodes: number;
    full_trust_count: number;
    observation_count: number;
    isolation_count: number;
    rejection_count: number;
    avg_trust_mu: number;
    avg_trust_variance: number;
    active_cusum_alerts: number;
  };
  /** per-task × per-node 评分详情 */
  task_trust_details: TaskTrustDetail[];
}

/* ================================================================
 * 攻击检测：per-task × per-node 评分
 * ================================================================ */

/** 单节点在单个任务上的 5 维评分 + 异常计数 */
export interface TaskNodeScore {
  node_id: string;
  node_name: string;
  dimensions: SpatialDimensionScores;
  subspace: SpatialRiskSubspace;
  /** 该节点在该任务上的各维度异常次数（低于阈值计1次） */
  anomaly_dims: {
    D1: number;
    D2: number;
    D3: number;
    D4: number;
    D5: number;
  };
  total_anomalies: number;
  overall_score: number;
  mu: number;
  variance: number;
  layer: DecisionLayer;
  layer_label: string;
  layer_color: string;
  weight: number;
  /** 算法安全评估风险系数（0~1，越高越危险） */
  algorithm_risk: number;
  /** 数据安全评估 */
  data_safety: {
    epsilon_risk: number;      // ε 风险
    compliance_risk: number;   // 合规风险
    alpha_risk: number;        // 非IID偏斜风险
    correlation_risk: number;  // 关联风险
    overall_risk: number;      // 综合风险 0~1
  };
  /** 网络安全评估 */
  network_safety: {
    latency_risk: number;
    packet_loss_risk: number;
    bandwidth_risk: number;
    link_status: string;
    overall_risk: number;      // 综合风险 0~1
  };
}

/** 单个任务在所有节点上的评分 */
export interface TaskTrustDetail {
  task_id: string;
  task_name: string;
  nodes: TaskNodeScore[];
  /** 该任务系统级聚合 */
  system: {
    attacked: boolean;
    attack_type: string;
    avg_anomaly_rate: number;
    avg_mu: number;
    max_cusum: number;
    total_rounds: number;
    current_round: number;
  };
}
