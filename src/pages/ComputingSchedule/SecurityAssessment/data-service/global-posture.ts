/**
 * 全局态势快照生成器
 *
 * 生成一棵以 "global" 为根的 MetricNode 树：
 *   global (综合评分)
 *   ├── data (数据安全)
 *   │   ├── epsilon (ε合规率)
 *   │   ├── correlation (关联泄露风险)
 *   │   └── compliance (业务方合规)
 *   ├── algorithm (算法安全)
 *   │   ├── attack_defense (攻击防御率)
 *   │   ├── malicious_defense (恶意比防御)
 *   │   ├── avg_accuracy (平均训练精度)
 *   │   ├── fairness (公平性指数)
 *   │   └── distillation (蒸馏鲁棒性)
 *   ├── network (网络安全)
 *   │   ├── packet_loss (丢包率防御)
 *   │   ├── link_health (链路健康度)
 *   │   └── comm_saving (通信节省率)
 *   └── system (系统安全)
 *       ├── trust (节点可信度)
 *       ├── health (节点健康度)
 *       ├── alert (告警扣分)
 *       ├── schedule (调度成功率)
 *       └── storage (存储集群健康)
 */
import type { MetricNode, MetricRegistration, SnapshotGenerator, InitialHistoryGenerator, TimelineSnapshot } from './types';

/** 全局态势指标注册表 */
export const GLOBAL_REGISTRATIONS: MetricRegistration[] = [
  // ---- 数据安全层 ----
  { id: 'data', name: '数据安全', baseValue: 87, volatility: 2 },
  { id: 'data.epsilon', name: 'ε合规率', parentId: 'data', weight: 40, baseValue: 89, volatility: 3 },
  { id: 'data.correlation', name: '关联泄露风险', parentId: 'data', weight: 35, baseValue: 86, volatility: 4 },
  { id: 'data.compliance', name: '业务方合规', parentId: 'data', weight: 25, baseValue: 84, volatility: 2 },
  // ---- 算法安全层 ----
  { id: 'algorithm', name: '算法安全', baseValue: 82, volatility: 2 },
  { id: 'algorithm.attack_defense', name: '攻击防御率', parentId: 'algorithm', weight: 25, baseValue: 83, volatility: 5 },
  { id: 'algorithm.malicious_defense', name: '恶意比防御', parentId: 'algorithm', weight: 20, baseValue: 85, volatility: 3 },
  { id: 'algorithm.avg_accuracy', name: '平均训练精度', parentId: 'algorithm', weight: 20, baseValue: 80, volatility: 2 },
  { id: 'algorithm.fairness', name: '公平性指数', parentId: 'algorithm', weight: 20, baseValue: 82, volatility: 3 },
  { id: 'algorithm.distillation', name: '蒸馏鲁棒性', parentId: 'algorithm', weight: 15, baseValue: 79, volatility: 4 },
  // ---- 网络安全层 ----
  { id: 'network', name: '网络安全', baseValue: 79, volatility: 2 },
  { id: 'network.packet_loss', name: '丢包率防御', parentId: 'network', weight: 35, baseValue: 78, volatility: 3 },
  { id: 'network.link_health', name: '链路健康度', parentId: 'network', weight: 25, baseValue: 80, volatility: 2 },
  { id: 'network.comm_saving', name: '通信节省率', parentId: 'network', weight: 40, baseValue: 77, volatility: 3 },
  // ---- 系统安全层 ----
  { id: 'system', name: '系统安全', baseValue: 76, volatility: 2 },
  { id: 'system.trust', name: '节点可信度', parentId: 'system', weight: 25, baseValue: 75, volatility: 3 },
  { id: 'system.health', name: '节点健康度', parentId: 'system', weight: 20, baseValue: 78, volatility: 2 },
  { id: 'system.alert', name: '告警扣分', parentId: 'system', weight: 20, baseValue: 73, volatility: 4 },
  { id: 'system.schedule', name: '调度成功率', parentId: 'system', weight: 20, baseValue: 80, volatility: 1 },
  { id: 'system.storage', name: '存储集群健康', parentId: 'system', weight: 15, baseValue: 76, volatility: 3 },
];

export const GLOBAL_ROOT_ID = 'global';
export const GLOBAL_ROOT_NAME = '综合安全评分';

/** 根据指标 id 获取 registrations 中的配置 */
function getReg(registrations: MetricRegistration[], id: string): MetricRegistration {
  return registrations.find(r => r.id === id) ?? { id, name: id };
}

/** 波动一个值，确保在 [40, 100] 区间 */
function jitter(value: number, volatility: number): number {
  return Math.max(40, Math.min(100, value + Math.round((Math.random() - 0.5) * 2 * volatility)));
}

/** 计算等级 */
function calcGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 85) return 'A-';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'C+';
  return 'C';
}

/** 叶子节点构建 */
function buildLeaf(
  id: string,
  value: number,
  registrations: MetricRegistration[],
): MetricNode {
  const reg = getReg(registrations, id);
  return { id, name: reg.name, value, weight: reg.weight, unit: reg.unit };
}

/** 维度节点构建（从子节点加权计算） */
function buildDimension(
  dimensionId: string,
  leafIds: string[],
  values: Record<string, number>,
  registrations: MetricRegistration[],
): MetricNode {
  const reg = getReg(registrations, dimensionId);
  const children = leafIds.map(id => buildLeaf(id, values[id], registrations));
  const totalWeight = children.reduce((s, c) => s + (c.weight ?? 0), 0);
  const weightedScore = children.reduce((s, c) => s + c.value * ((c.weight ?? 0) / totalWeight), 0);
  const value = Math.round(weightedScore * 10) / 10;
  return { id: dimensionId, name: reg.name, value, children, weight: reg.weight };
}

/** 快照生成器：根据当前值生成完整态势树 */
export const generateGlobalSnapshot: SnapshotGenerator = (prevValues, _ts, _history, registrations) => {
  // 各叶子节点随机波动
  const leafGroups: Record<string, string[]> = {
    data: ['data.epsilon', 'data.correlation', 'data.compliance'],
    algorithm: ['algorithm.attack_defense', 'algorithm.malicious_defense', 'algorithm.avg_accuracy', 'algorithm.fairness', 'algorithm.distillation'],
    network: ['network.packet_loss', 'network.link_health', 'network.comm_saving'],
    system: ['system.trust', 'system.health', 'system.alert', 'system.schedule', 'system.storage'],
  };

  const values: Record<string, number> = { ...prevValues };
  for (const id of Object.keys(values)) {
    if (id === 'global' || id === 'data' || id === 'algorithm' || id === 'network' || id === 'system') continue;
    const reg = getReg(registrations, id);
    values[id] = jitter(prevValues[id] ?? reg.baseValue ?? 80, reg.volatility ?? 2);
  }

  // 构建四个维度
  const dataNode = buildDimension('data', leafGroups.data, values, registrations);
  const algoNode = buildDimension('algorithm', leafGroups.algorithm, values, registrations);
  const netNode = buildDimension('network', leafGroups.network, values, registrations);
  const sysNode = buildDimension('system', leafGroups.system, values, registrations);

  // 计算综合得分
  const dimNodes = [dataNode, algoNode, netNode, sysNode];
  const totalWeight = dimNodes.reduce((s, n) => s + (n.weight ?? 25), 0);
  const overall = dimNodes.reduce((s, n) => s + n.value * ((n.weight ?? 25) / totalWeight), 0);
  const overallScore = Math.round(overall * 10) / 10;

  return {
    id: 'global',
    name: GLOBAL_ROOT_NAME,
    value: overallScore,
    children: dimNodes,
    // 扩展字段：存储等级供快速使用
  } as MetricNode;
};

/** 初始历史生成器：生成 20 条历史数据 */
export const generateGlobalInitial: InitialHistoryGenerator = (registrations, count, intervalMs) => {
  const snapshots: TimelineSnapshot[] = [];
  const now = new Date();

  // 初始化默认值
  const values: Record<string, number> = {};
  for (const r of registrations) {
    values[r.id] = r.baseValue ?? 80;
  }

  for (let i = 0; i < count; i++) {
    const t = new Date(now.getTime() - (count - 1 - i) * intervalMs);
    const time = t.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // 越早的数据波动越大
    const ratio = (i + 1) / count;
    const jitterFactor = 1 - ratio * 0.6;
    const jittered: Record<string, number> = {};
    for (const id of Object.keys(values)) {
      if (id === 'global') continue;
      const reg = getReg(registrations, id);
      jittered[id] = Math.max(40, Math.min(100, Math.round(values[id] + (Math.random() - 0.5) * 12 * jitterFactor)));
    }
    Object.assign(values, jittered);

    // 构建树
    const leafGroups: Record<string, string[]> = {
      data: ['data.epsilon', 'data.correlation', 'data.compliance'],
      algorithm: ['algorithm.attack_defense', 'algorithm.malicious_defense', 'algorithm.avg_accuracy', 'algorithm.fairness', 'algorithm.distillation'],
      network: ['network.packet_loss', 'network.link_health', 'network.comm_saving'],
      system: ['system.trust', 'system.health', 'system.alert', 'system.schedule', 'system.storage'],
    };
    const dataNode = buildDimension('data', leafGroups.data, values, registrations);
    const algoNode = buildDimension('algorithm', leafGroups.algorithm, values, registrations);
    const netNode = buildDimension('network', leafGroups.network, values, registrations);
    const sysNode = buildDimension('system', leafGroups.system, values, registrations);
    const dimNodes = [dataNode, algoNode, netNode, sysNode];
    const totalWeight = dimNodes.reduce((s, n) => s + (n.weight ?? 25), 0);
    const overall = dimNodes.reduce((s, n) => s + n.value * ((n.weight ?? 25) / totalWeight), 0);
    const overallScore = Math.round(overall * 10) / 10;

    snapshots.push({
      time,
      root: { id: 'global', name: GLOBAL_ROOT_NAME, value: overallScore, children: dimNodes },
    });
  }

  return snapshots;
};
