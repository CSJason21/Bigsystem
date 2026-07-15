/**
 * 各维度子指标快照生成器
 *
 * 为每个维度（data/algorithm/network/system）生成本层的 MetricNode 树：
 *   data:                              algorithm:
 *   ├── data.epsilon (ε合规率)          ├── algorithm.attack_defense
 *   ├── data.correlation (关联泄露)      ├── algorithm.malicious_defense
 *   └── data.compliance (业务方合规)     ├── algorithm.avg_accuracy
 *                                       ├── algorithm.fairness
 *   network:                            └── algorithm.distillation
 *   ├── network.packet_loss
 *   ├── network.link_health             system:
 *   └── network.comm_saving             ├── system.trust
 *                                       ├── system.health
 *                                       ├── system.alert
 *                                       ├── system.schedule
 *                                       └── system.storage
 */
import type { SecurityLayer } from '../types';
import type { MetricNode, MetricRegistration, SnapshotGenerator, InitialHistoryGenerator, TimelineSnapshot } from './types';

/** 各维度叶子节点配置 */
const LAYER_LEAF_CONFIG: Record<SecurityLayer, { id: string; name: string; weight: number; baseValue: number; volatility: number }[]> = {
  data: [
    { id: 'data.epsilon', name: 'ε合规率', weight: 40, baseValue: 89, volatility: 3 },
    { id: 'data.correlation', name: '关联泄露风险', weight: 35, baseValue: 86, volatility: 4 },
    { id: 'data.compliance', name: '业务方合规', weight: 25, baseValue: 84, volatility: 2 },
  ],
  algorithm: [
    { id: 'algorithm.attack_defense', name: '攻击防御率', weight: 25, baseValue: 83, volatility: 5 },
    { id: 'algorithm.malicious_defense', name: '恶意比防御', weight: 20, baseValue: 85, volatility: 3 },
    { id: 'algorithm.avg_accuracy', name: '平均训练精度', weight: 20, baseValue: 80, volatility: 2 },
    { id: 'algorithm.fairness', name: '公平性指数', weight: 20, baseValue: 82, volatility: 3 },
    { id: 'algorithm.distillation', name: '蒸馏鲁棒性', weight: 15, baseValue: 79, volatility: 4 },
  ],
  network: [
    { id: 'network.packet_loss', name: '丢包率防御', weight: 35, baseValue: 78, volatility: 3 },
    { id: 'network.link_health', name: '链路健康度', weight: 25, baseValue: 80, volatility: 2 },
    { id: 'network.comm_saving', name: '通信节省率', weight: 40, baseValue: 77, volatility: 3 },
  ],
  system: [
    { id: 'system.trust', name: '节点可信度', weight: 25, baseValue: 75, volatility: 3 },
    { id: 'system.health', name: '节点健康度', weight: 20, baseValue: 78, volatility: 2 },
    { id: 'system.alert', name: '告警扣分', weight: 20, baseValue: 73, volatility: 4 },
    { id: 'system.schedule', name: '调度成功率', weight: 20, baseValue: 80, volatility: 1 },
    { id: 'system.storage', name: '存储集群健康', weight: 15, baseValue: 76, volatility: 3 },
  ],
};

const LAYER_ROOT_NAMES: Record<SecurityLayer, string> = {
  data: '数据安全评分',
  algorithm: '算法安全评分',
  network: '网络安全评分',
  system: '系统安全评分',
};

/** 获取指定维度的注册表 */
export function getLayerRegistrations(layer: SecurityLayer): MetricRegistration[] {
  const leaves = LAYER_LEAF_CONFIG[layer];
  if (!leaves) return [];

  return leaves.map(l => ({
    id: l.id,
    name: l.name,
    weight: l.weight,
    baseValue: l.baseValue,
    volatility: l.volatility,
  }));
}

export function getLayerRootId(layer: SecurityLayer): string {
  return `layer.${layer}`;
}

/** 波动一个值 */
function jitter(value: number, volatility: number): number {
  return Math.max(40, Math.min(100, value + Math.round((Math.random() - 0.5) * 2 * volatility)));
}

/** 构建指定维度的快照 */
export function buildLayerNode(
  layer: SecurityLayer,
  values: Record<string, number>,
): MetricNode {
  const leaves = LAYER_LEAF_CONFIG[layer] ?? [];
  const children: MetricNode[] = leaves.map(l => ({
    id: l.id,
    name: l.name,
    value: values[l.id] ?? l.baseValue,
    weight: l.weight,
  }));

  const totalWeight = children.reduce((s, c) => s + (c.weight ?? 0), 0);
  const weightedScore = children.reduce((s, c) => s + c.value * ((c.weight ?? 0) / totalWeight), 0);
  const value = Math.round(weightedScore * 10) / 10;

  return {
    id: getLayerRootId(layer),
    name: LAYER_ROOT_NAMES[layer],
    value,
    children,
  };
}

/** 创建指定维度的快照生成器 */
export function generateLayerSnapshot(layer: SecurityLayer): SnapshotGenerator {
  return (prevValues, _ts, _history, registrations) => {
    const leaves = LAYER_LEAF_CONFIG[layer] ?? [];
    const values: Record<string, number> = { ...prevValues };

    for (const leaf of leaves) {
      const prev = prevValues[leaf.id] ?? leaf.baseValue;
      values[leaf.id] = jitter(prev, leaf.volatility ?? 2);
    }

    return buildLayerNode(layer, values);
  };
}

/** 创建指定维度的初始历史生成器 */
export function generateLayerInitial(layer: SecurityLayer): InitialHistoryGenerator {
  return (_registrations, count, intervalMs) => {
    const snapshots: TimelineSnapshot[] = [];
    const now = new Date();
    const leaves = LAYER_LEAF_CONFIG[layer] ?? [];

    const values: Record<string, number> = {};
    for (const leaf of leaves) {
      values[leaf.id] = leaf.baseValue;
    }

    for (let i = 0; i < count; i++) {
      const t = new Date(now.getTime() - (count - 1 - i) * intervalMs);
      const time = t.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      const ratio = (i + 1) / count;
      const jitterFactor = 1 - ratio * 0.6;

      for (const leaf of leaves) {
        values[leaf.id] = Math.max(40, Math.min(100, Math.round(values[leaf.id] + (Math.random() - 0.5) * 12 * jitterFactor)));
      }

      snapshots.push({
        time,
        root: buildLayerNode(layer, values),
      });
    }

    return snapshots;
  };
}

/** 所有维度的统一注册表（用于引擎集中管理） */
export function getAllLayerRegistrations(): MetricRegistration[] {
  const all: MetricRegistration[] = [];
  for (const layer of ['data', 'algorithm', 'network', 'system'] as SecurityLayer[]) {
    const leaves = LAYER_LEAF_CONFIG[layer] ?? [];
    for (const leaf of leaves) {
      all.push({
        id: leaf.id,
        name: leaf.name,
        weight: leaf.weight,
        baseValue: leaf.baseValue,
        volatility: leaf.volatility,
      });
    }
  }
  return all;
}
