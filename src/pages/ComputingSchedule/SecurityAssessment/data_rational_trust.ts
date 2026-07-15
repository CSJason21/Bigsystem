import type { RationalTrustData, SpatialDimensionScores, SpatialRiskSubspace, TrustSnapshot, CUSUMChangeEvent, NodeDecisionStatus } from './types';

/**
 * RationalTrust 模拟数据生成器
 * 基于论文 RationalTrust 框架，模拟 10 个节点 50 轮训练的时空双域信任演化
 */

// ─── 节点定义 ───
const NODES = [
  { id: 'edge-shenzhen-01', name: '深圳边缘节点' },
  { id: 'edge-shanghai-01', name: '上海边缘节点' },
  { id: 'edge-beijing-01', name: '北京边缘节点' },
  { id: 'edge-nanjing-01', name: '南京边缘节点' },
  { id: 'edge-hangzhou-01', name: '杭州边缘节点' },
  { id: 'edge-guangzhou-01', name: '广州边缘节点' },
  { id: 'edge-chengdu-01', name: '成都边缘节点' },
  { id: 'edge-wuhan-01', name: '武汉边缘节点' },
  { id: 'edge-chongqing-01', name: '重庆边缘节点' },
  { id: 'edge-xian-01', name: '西安边缘节点' },
];

// 节点类型：good / suspicious / malicious
const NODE_TYPES: Record<string, 'good' | 'suspicious' | 'malicious'> = {
  'edge-shenzhen-01': 'good',
  'edge-shanghai-01': 'good',
  'edge-beijing-01': 'good',
  'edge-nanjing-01': 'good',
  'edge-hangzhou-01': 'good',
  'edge-guangzhou-01': 'good',
  'edge-chengdu-01': 'suspicious',
  'edge-wuhan-01': 'suspicious',
  'edge-chongqing-01': 'suspicious',
  'edge-xian-01': 'malicious',
};

// 论文参数
const GAMMA = 0.85; // 指数遗忘因子
const ETA_UP = 0.15; // 正向奖励步长
const ETA_DOWN = 0.8; // 负向惩罚步长
const TAU_GOOD = 0.55; // 高质量阈值
const TAU_LOW = 0.35; // 低质量阈值
const KAPPA = 0.05; // CUSUM 漂移容忍度
const H = 2.5; // CUSUM 告警阈值
const B = 10; // 预热轮数

/** 根据节点类型和轮次生成五维空间得分 */
function generateSpatialScore(nodeType: 'good' | 'suspicious' | 'malicious', round: number): {
  dims: SpatialDimensionScores;
  subspace: SpatialRiskSubspace;
} {
  const seed = round / 50;

  if (nodeType === 'good') {
    return {
      dims: {
        D1_gradient_quality: 0.82 + Math.random() * 0.15,
        D2_direction_consistency: 0.85 + Math.random() * 0.12,
        D3_security_risk: 0.03 + Math.random() * 0.08,
        D4_privacy_compliance: 0.88 + Math.random() * 0.10,
        D5_data_diversity: 0.60 + Math.random() * 0.25,
      },
      subspace: {
        sign_flip_rate: 0.02 + Math.random() * 0.05,
        coord_anomaly_rate: 0.01 + Math.random() * 0.04,
        sparsity: 0.10 + Math.random() * 0.15,
        nsr: 0.05 + Math.random() * 0.08,
        coupling_deviation: 0.02 + Math.random() * 0.05,
      },
    };
  }

  if (nodeType === 'suspicious') {
    // 成都/武汉/重庆：在 R20 附近开始性能下降
    const degrade = Math.max(0, Math.min(1, (round - 18) / 10));
    return {
      dims: {
        D1_gradient_quality: Math.max(0.35, 0.75 - degrade * 0.35 + (Math.random() - 0.5) * 0.10),
        D2_direction_consistency: Math.max(0.30, 0.72 - degrade * 0.38 + (Math.random() - 0.5) * 0.10),
        D3_security_risk: Math.min(0.50, 0.10 + degrade * 0.35 + Math.random() * 0.05),
        D4_privacy_compliance: Math.max(0.40, 0.80 - degrade * 0.30 + (Math.random() - 0.5) * 0.08),
        D5_data_diversity: Math.max(0.35, 0.60 - degrade * 0.20 + (Math.random() - 0.5) * 0.10),
      },
      subspace: {
        sign_flip_rate: Math.min(0.25, 0.05 + degrade * 0.18 + Math.random() * 0.03),
        coord_anomaly_rate: Math.min(0.20, 0.03 + degrade * 0.15 + Math.random() * 0.03),
        sparsity: 0.20 + Math.random() * 0.15,
        nsr: Math.min(0.35, 0.08 + degrade * 0.22 + Math.random() * 0.03),
        coupling_deviation: Math.min(0.30, 0.05 + degrade * 0.20 + Math.random() * 0.03),
      },
    };
  }

  // malicious — edge-xian-01: R12开始攻击
  const attackPhase = Math.max(0, Math.min(1, (round - 12) / 8));
  // 攻击前正常，攻击后快速恶化
  const isAttacking = round >= 12;
  return {
    dims: {
      D1_gradient_quality: isAttacking
        ? Math.max(0.05, 0.25 - attackPhase * 0.18 + (Math.random() - 0.5) * 0.06)
        : 0.78 + Math.random() * 0.12,
      D2_direction_consistency: isAttacking
        ? Math.max(0.05, 0.30 - attackPhase * 0.22 + (Math.random() - 0.5) * 0.06)
        : 0.80 + Math.random() * 0.10,
      D3_security_risk: isAttacking
        ? Math.min(0.92, 0.25 + attackPhase * 0.60 + Math.random() * 0.05)
        : 0.05 + Math.random() * 0.08,
      D4_privacy_compliance: isAttacking
        ? Math.max(0.05, 0.75 - attackPhase * 0.60 + (Math.random() - 0.5) * 0.05)
        : 0.85 + Math.random() * 0.08,
      D5_data_diversity: isAttacking
        ? Math.max(0.10, 0.55 - attackPhase * 0.38 + (Math.random() - 0.5) * 0.06)
        : 0.55 + Math.random() * 0.18,
    },
    subspace: {
      sign_flip_rate: isAttacking
        ? Math.min(0.55, 0.08 + attackPhase * 0.42 + Math.random() * 0.04)
        : 0.03 + Math.random() * 0.05,
      coord_anomaly_rate: isAttacking
        ? Math.min(0.45, 0.05 + attackPhase * 0.35 + Math.random() * 0.04)
        : 0.02 + Math.random() * 0.04,
      sparsity: isAttacking
        ? Math.min(0.50, 0.10 + attackPhase * 0.35 + Math.random() * 0.04)
        : 0.10 + Math.random() * 0.10,
      nsr: isAttacking
        ? Math.min(0.70, 0.08 + attackPhase * 0.55 + Math.random() * 0.05)
        : 0.06 + Math.random() * 0.06,
      coupling_deviation: isAttacking
        ? Math.min(0.60, 0.05 + attackPhase * 0.48 + Math.random() * 0.04)
        : 0.03 + Math.random() * 0.04,
    },
  };
}

/** 根据空间得分计算综合质量 q */
function calcQuality(dims: SpatialDimensionScores): number {
  const w = [0.25, 0.20, 0.20, 0.15, 0.20]; // 权重
  const D1n = dims.D1_gradient_quality;
  const D2n = dims.D2_direction_consistency;
  const D3n = 1 - dims.D3_security_risk; // 安全风险取反
  const D4n = dims.D4_privacy_compliance;
  const D5n = dims.D5_data_diversity;
  return Math.min(1, Math.max(0, w[0] * D1n + w[1] * D2n + w[2] * D3n + w[3] * D4n + w[4] * D5n));
}

/** 生成信任演化历史 */
function generateTrustHistory(
  nodeId: string,
  nodeType: 'good' | 'suspicious' | 'malicious',
  totalRounds: number,
): TrustSnapshot[] {
  const history: TrustSnapshot[] = [];
  let alpha = 1, beta = 1;
  let cusum = 0;
  let baseMu = 0;
  let baseComputed = false;

  for (let r = 1; r <= totalRounds; r++) {
    const score = generateSpatialScore(nodeType, r);
    const q = calcQuality(score.dims);

    // Beta 非对称更新（论文公式）
    if (q > TAU_GOOD) {
      alpha = Math.max(1, GAMMA * alpha + ETA_UP * q);
      beta = Math.max(1, GAMMA * beta);
    } else if (q < TAU_LOW) {
      beta = Math.max(1, GAMMA * beta + ETA_DOWN * (1 - q));
      alpha = Math.max(1, GAMMA * alpha);
    } else {
      alpha = Math.max(1, GAMMA * alpha);
      beta = Math.max(1, GAMMA * beta);
    }

    const mu = alpha / (alpha + beta);
    const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));

    // CUSUM（论文 3.3.2）
    if (r <= B) {
      baseMu = baseMu + (mu - baseMu) / r;
      cusum = 0;
    } else {
      cusum = Math.max(0, cusum + (baseMu - mu) - KAPPA);
    }

    // 聚合权重
    let weight = mu;
    if (cusum >= H) weight = 0;
    else if (cusum > 0) weight *= Math.exp(-cusum * 2);
    if (variance > 0.1) weight *= 0.5;

    history.push({
      round: r,
      alpha: +alpha.toFixed(2),
      beta: +beta.toFixed(2),
      mu: +mu.toFixed(4),
      variance: +variance.toFixed(4),
      cusum_s_plus: +cusum.toFixed(4),
      aggregation_weight: +weight.toFixed(4),
    });
  }

  return history;
}

/** 判断决策层 */
function determineLayer(mu: number, variance: number, cusum: number, cooldown: number): {
  layer: NodeDecisionStatus['layer'];
  label: string;
  color: string;
  weight: number;
} {
  if (cusum >= H || cooldown > 0) {
    if (cooldown > 0) {
      return { layer: 'isolation', label: '隔离审查层', color: '#faad14', weight: Math.max(0.1, 0.5 * Math.exp(-(cooldown / 5))) };
    }
    return { layer: 'rejection', label: '拒绝阻断层', color: '#ff4d4f', weight: 0 };
  }
  if (mu >= 0.75 && variance < 0.05) {
    return { layer: 'full_trust', label: '完全信任层', color: '#52c41a', weight: 1.0 };
  }
  if (mu >= 0.50 && variance < 0.12) {
    return { layer: 'observation', label: '观察降权层', color: '#1677ff', weight: 0.6 };
  }
  return { layer: 'isolation', label: '隔离审查层', color: '#faad14', weight: 0.3 };
}

// ─── 生成完整数据 ───
const TOTAL_ROUNDS = 50;

export const RATIONAL_TRUST_DATA: RationalTrustData = (() => {
  const spatial: RationalTrustData['spatial'] = [];
  const temporal: RationalTrustData['temporal'] = [];
  const decisions: NodeDecisionStatus[] = [];
  const cusum_events: CUSUMChangeEvent[] = [];

  for (const node of NODES) {
    const nodeType = NODE_TYPES[node.id];
    const history = generateTrustHistory(node.id, nodeType, TOTAL_ROUNDS);
    const latest = history[history.length - 1];

    // 空间域
    const latestScore = generateSpatialScore(nodeType, TOTAL_ROUNDS);
    const dims = latestScore.dims;
    const overall = +(0.25 * dims.D1_gradient_quality + 0.20 * dims.D2_direction_consistency
      + 0.20 * (1 - dims.D3_security_risk) + 0.15 * dims.D4_privacy_compliance
      + 0.20 * dims.D5_data_diversity).toFixed(3);

    spatial.push({
      node_id: node.id,
      node_name: node.name,
      dimensions: dims,
      subspace: latestScore.subspace,
      overall_score: overall,
    });

    temporal.push({
      node_id: node.id,
      node_name: node.name,
      history: history.slice(-30), // 最近30轮
      latest,
    });

    // 决策状态
    const cooldown = node.id === 'edge-xian-01' ? 0 : node.id === 'edge-chengdu-01' ? 3 : 0;
    const dl = determineLayer(latest.mu, latest.variance, latest.cusum_s_plus, cooldown);
    decisions.push({
      node_id: node.id,
      node_name: node.name,
      mu: latest.mu,
      variance: latest.variance,
      cusum_s_plus: latest.cusum_s_plus,
      layer: dl.layer,
      layer_label: dl.label,
      layer_color: dl.color,
      aggregation_weight: dl.weight,
      cooldown_remaining: cooldown,
    });

    // CUSUM 事件
    for (let r = B + 1; r <= TOTAL_ROUNDS; r++) {
      const snap = history[r - 1];
      const prevSnap = history[r - 2];
      if (snap.cusum_s_plus >= H && prevSnap.cusum_s_plus < H) {
        cusum_events.push({
          round: r,
          node_id: node.id,
          node_name: node.name,
          trigger_value: +snap.cusum_s_plus.toFixed(2),
          threshold: H,
          action: r >= 24 && node.id === 'edge-xian-01' ? 'cooldown_end' : r >= 15 && node.id === 'edge-xian-01' ? 'cooldown_start' : r >= 12 ? 'state_reset' : 'weight_fuse',
          description: node.id === 'edge-xian-01'
            ? r === 12 ? `R${r}: CUSUM=${snap.cusum_s_plus.toFixed(2)} 触发权重熔断，惩罚因子 ρ=0.3`
              : r === 15 ? `R${r}: CUSUM=${snap.cusum_s_plus.toFixed(2)} 二次触发状态重置，α缩减 β放大`
                : r === 18 ? `R${r}: CUSUM=${snap.cusum_s_plus.toFixed(2)} 进入冷却期，限制信任恢复速率`
                  : `R${r}: CUSUM=${snap.cusum_s_plus.toFixed(2)} 冷却期结束，S⁺ 归零重启`
            : `R${r}: CUSUM=${snap.cusum_s_plus.toFixed(2)} 触发告警 · ${node.name}`,
        });
      }
    }
  }

  // 系统级聚合
  const activeCusum = decisions.filter(d => d.cusum_s_plus > 0).length;

  // ─── per-task × per-node 评分 ───
  const TASKS = [
    { task_id: 'task-fedtrain-99943', task_name: '联邦训练-图神经网络', attacked: true, attack_type: '梯度反转', node_count: 10, total: 50, current: 27 },
    { task_id: 'task-fedtrain-99944', task_name: '联邦训练-异常检测', attacked: false, attack_type: '-', node_count: 8, total: 30, current: 18 },
    { task_id: 'task-fedtrain-99945', task_name: '联邦训练-大模型微调', attacked: true, attack_type: '标签翻转', node_count: 6, total: 40, current: 12 },
    { task_id: 'task-fedtrain-99946', task_name: '联邦训练-风控模型', attacked: true, attack_type: '高斯噪声', node_count: 10, total: 60, current: 34 },
    { task_id: 'task-fedtrain-99947', task_name: '联邦训练-用户画像', attacked: false, attack_type: '-', node_count: 8, total: 45, current: 22 },
    { task_id: 'task-fedtrain-99948', task_name: '联邦训练-推荐系统', attacked: false, attack_type: '-', node_count: 10, total: 50, current: 50 },
    { task_id: 'task-fedtrain-99949', task_name: '联邦训练-图像分类', attacked: true, attack_type: '梯度反转', node_count: 8, total: 35, current: 15 },
    { task_id: 'task-fedtrain-99950', task_name: '联邦训练-欺诈检测', attacked: false, attack_type: '-', node_count: 10, total: 55, current: 31 },
  ];

  const task_trust_details = TASKS.map(t => {
    const taskNodes = NODES.slice(0, t.node_count).map(node => {
      const nodeType = NODE_TYPES[node.id];
      // 用当前轮次生成空间评分
      const score = generateSpatialScore(nodeType, t.current);
      const dims = score.dims;
      const overall = +(0.25 * dims.D1_gradient_quality + 0.20 * dims.D2_direction_consistency
        + 0.20 * (1 - dims.D3_security_risk) + 0.15 * dims.D4_privacy_compliance
        + 0.20 * dims.D5_data_diversity).toFixed(3);

      // 模拟异常次数（基于维度得分低于阈值）
      const anomalyDims = {
        D1: dims.D1_gradient_quality < 0.5 ? Math.floor(Math.random() * 8) + 3 : Math.floor(Math.random() * 2),
        D2: dims.D2_direction_consistency < 0.5 ? Math.floor(Math.random() * 6) + 2 : Math.floor(Math.random() * 2),
        D3: dims.D3_security_risk > 0.3 ? Math.floor(Math.random() * 5) + 3 : Math.floor(Math.random() * 2),
        D4: dims.D4_privacy_compliance < 0.5 ? Math.floor(Math.random() * 4) + 2 : Math.floor(Math.random() * 2),
        D5: dims.D5_data_diversity < 0.4 ? Math.floor(Math.random() * 5) + 2 : Math.floor(Math.random() * 2),
      };
      const totalAnomalies = anomalyDims.D1 + anomalyDims.D2 + anomalyDims.D3 + anomalyDims.D4 + anomalyDims.D5;

      // 简易信任值（基于综合得分）
      const mu = Math.min(0.95, Math.max(0.05, overall + (Math.random() - 0.5) * 0.15));
      const variance = Math.min(0.25, Math.max(0.002, (1 - mu) * 0.15));
      const cusum = nodeType === 'malicious' && t.attacked ? Math.random() * 4 + 1 : Math.max(0, Math.random() * 2 - 0.5);
      const cd = cusum >= 2.5 ? 0 : nodeType === 'suspicious' ? 2 : 0;
      const dl = determineLayer(mu, variance, cusum, cd);

      // 算法安全风险（基于异常次数，归一化到 0~1）
      const algorithm_risk = +Math.min(1, totalAnomalies / (t.current / 2)).toFixed(2);

      // 数据安全评估
      const epsilonVal = nodeType === 'malicious' ? 3.5 + Math.random() : nodeType === 'suspicious' ? 2.5 + Math.random() * 0.5 : 1.0 + Math.random();
      const epsilon_risk = +Math.min(1, epsilonVal / 5).toFixed(2);
      const compliance_risk = nodeType === 'malicious' ? 0.8 + Math.random() * 0.2 : nodeType === 'suspicious' ? 0.4 + Math.random() * 0.3 : 0.1 + Math.random() * 0.2;
      const alphaVal = nodeType === 'malicious' ? 0.1 : nodeType === 'suspicious' ? 0.3 : 0.6 + Math.random() * 0.4;
      const alpha_risk = +Math.min(1, (1 - alphaVal) / 0.9).toFixed(2);
      const correlation_risk = nodeType === 'malicious' ? 0.7 + Math.random() * 0.3 : nodeType === 'suspicious' ? 0.4 + Math.random() * 0.3 : 0.1 + Math.random() * 0.3;
      const dataOverall = +((epsilon_risk + compliance_risk + alpha_risk + correlation_risk) / 4).toFixed(2);

      // 网络安全评估
      const latencyVal = node.id === 'edge-xian-01' ? 28.7 + Math.random() * 10 : node.id === 'edge-chengdu-01' ? 25.0 + Math.random() * 8 : 5 + Math.random() * 15;
      const latency_risk = +Math.min(1, latencyVal / 40).toFixed(2);
      const pktLossVal = node.id === 'edge-xian-01' ? 1.8 + Math.random() * 0.7 : node.id === 'edge-chengdu-01' ? 0.85 + Math.random() * 0.3 : 0.05 + Math.random() * 0.5;
      const packet_loss_risk = +Math.min(1, pktLossVal / 3).toFixed(2);
      const bwVal = node.id === 'edge-xian-01' ? 2.5 + Math.random() : node.id === 'edge-chengdu-01' ? 3.5 + Math.random() : 6 + Math.random() * 4;
      const bandwidth_risk = +Math.min(1, (10 - bwVal) / 10).toFixed(2);
      const link_status = pktLossVal > 1.5 ? 'degraded' : pktLossVal > 0.5 ? 'busy' : 'normal';
      const networkOverall = +((latency_risk + packet_loss_risk + bandwidth_risk) / 3).toFixed(2);

      return {
        node_id: node.id,
        node_name: node.name,
        dimensions: dims,
        subspace: score.subspace,
        anomaly_dims: anomalyDims,
        total_anomalies: totalAnomalies,
        overall_score: overall,
        mu: +mu.toFixed(4),
        variance: +variance.toFixed(4),
        layer: dl.layer,
        layer_label: dl.label,
        layer_color: dl.color,
        weight: dl.weight,
        algorithm_risk,
        data_safety: {
          epsilon_risk,
          compliance_risk: +compliance_risk.toFixed(2),
          alpha_risk,
          correlation_risk: +correlation_risk.toFixed(2),
          overall_risk: dataOverall,
        },
        network_safety: {
          latency_risk,
          packet_loss_risk,
          bandwidth_risk,
          link_status,
          overall_risk: networkOverall,
        },
      };
    });

    // 归一化聚合权重（总和=1）
    const totalWeight = taskNodes.reduce((s, n) => s + n.weight, 0);
    taskNodes.forEach(n => n.weight = +((n.weight / totalWeight).toFixed(3)));

    const avgMu = taskNodes.reduce((s, n) => s + n.mu, 0) / taskNodes.length;
    const maxCusum = Math.max(...taskNodes.map(n => {
      const cusum = n.dimensions.D3_security_risk > 0.3 ? 3.5 : 0.2;
      return cusum;
    }));

    return {
      task_id: t.task_id,
      task_name: t.task_name,
      nodes: taskNodes,
      system: {
        attacked: t.attacked,
        attack_type: t.attack_type,
        avg_anomaly_rate: +(taskNodes.reduce((s, n) => s + n.total_anomalies, 0) / (taskNodes.length * 5)).toFixed(3),
        avg_mu: +avgMu.toFixed(4),
        max_cusum: +maxCusum.toFixed(2),
        total_rounds: t.total,
        current_round: t.current,
      },
    };
  });

  return {
    spatial,
    temporal,
    cusum_events,
    decisions,
    system: {
      total_nodes: NODES.length,
      full_trust_count: decisions.filter(d => d.layer === 'full_trust').length,
      observation_count: decisions.filter(d => d.layer === 'observation').length,
      isolation_count: decisions.filter(d => d.layer === 'isolation').length,
      rejection_count: decisions.filter(d => d.layer === 'rejection').length,
      avg_trust_mu: +(decisions.reduce((s, d) => s + d.mu, 0) / decisions.length).toFixed(3),
      avg_trust_variance: +(decisions.reduce((s, d) => s + d.variance, 0) / decisions.length).toFixed(3),
      active_cusum_alerts: activeCusum,
    },
    task_trust_details,
  };
})();
