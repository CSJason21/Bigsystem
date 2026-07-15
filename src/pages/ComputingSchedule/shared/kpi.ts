import type { TopologyEdge, TopologyNode } from '@/components/TopologyGraph';
import type { TopologyViewResponse } from '@/services/api/predictionAllocation';
import type { NodeId, PerspectiveProfile } from './nodeMeta';
import { NODE_META, ALL_COMPUTE_NODE_IDS } from './nodeMeta';
import type { NodeReplayState } from './replay/types';
import type { ScheduleTask } from './scheduleLog';
import { clamp, round, getLoadColor } from './constants';
import { HUB_META, REGIONAL_CENTERS, getNodeStatus } from './topologyMeta';

export interface GlobalKpis {
  avgDelay: number;
  delayDelta: number;
  loadStd: number;
  loadStdDelta: number;
  successTasks: number;
  successTasksDelta: number;
  avgBandwidth: number;
  avgGpuUsage: number;
  totalGpuMemory: number;
}

export interface TopologyEvent {
  title: string;
  description: string;
  color: string;
}

export interface TopologyPanelData {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  events: TopologyEvent[];
  rerouteCount: number;
  offlineCount: number;
  newCount: number;
}

export const getVisibleNodeIds = (perspective: PerspectiveProfile, _selectedNodeId?: NodeId): NodeId[] => (
  (perspective.nodeIds as NodeId[]) ?? []
);

export const buildKpis = (
  replayMap: Record<NodeId, NodeReplayState>,
  perspective: PerspectiveProfile,
  previous?: GlobalKpis,
): GlobalKpis => {
  const visibleNodeIds = getVisibleNodeIds(perspective).filter((nodeId) => replayMap[nodeId]?.latest && NODE_META[nodeId]);
  const fallbackNodeIds = ALL_COMPUTE_NODE_IDS.filter((nodeId) => replayMap[nodeId]?.latest && NODE_META[nodeId]);
  const kpiNodeIds = visibleNodeIds.length > 0 ? visibleNodeIds : fallbackNodeIds;
  if (kpiNodeIds.length === 0 && previous) return previous;

  const nodes = kpiNodeIds.map((nodeId) => replayMap[nodeId].latest);
  const metas = kpiNodeIds.map((nodeId) => NODE_META[nodeId]);
  const avgLatency = nodes.reduce((sum, item) => sum + item.latency, 0) / Math.max(nodes.length, 1);
  const cpuLoads = nodes.map((item) => item.cpu);
  const meanLoad = cpuLoads.reduce((sum, value) => sum + value, 0) / Math.max(cpuLoads.length, 1);
  const std = Math.sqrt(cpuLoads.reduce((sum, value) => sum + ((value - meanLoad) ** 2), 0) / Math.max(cpuLoads.length, 1));
  const successTasks = Math.round(980 + meanLoad * 12 + nodes.length * 45);
  const avgBandwidth = round(nodes.reduce((sum, item) => sum + item.bandwidth, 0) / Math.max(nodes.length, 1));
  const avgGpuUsage = round(nodes.reduce((sum, item) => sum + item.gpuUsage.reduce((s, v) => s + v, 0) / item.gpuUsage.length, 0) / Math.max(nodes.length, 1));
  const totalGpuMemory = round(metas.reduce((sum, meta) => sum + meta.gpuTotals.reduce((s, v) => s + v, 0), 0));

  return {
    avgDelay: round(avgLatency, 1),
    delayDelta: previous ? round(avgLatency - previous.avgDelay, 1) : 1.2,
    loadStd: round(std, 2),
    loadStdDelta: previous ? round(std - previous.loadStd, 2) : -0.16,
    successTasks,
    successTasksDelta: previous ? successTasks - previous.successTasks : 24,
    avgBandwidth,
    avgGpuUsage,
    totalGpuMemory,
  };
};

export const buildTopologyPanelData = (
  replayMap: Record<NodeId, NodeReplayState>,
  perspective: PerspectiveProfile,
  tick: number,
  activeTask?: ScheduleTask,
): TopologyPanelData => {
  const centerX = 0;
  const events: TopologyEvent[] = [];
  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];

  if (perspective.kind === 'global') {
    const hubSpacing = 260;
    const hubStartX = centerX - ((HUB_META.length - 1) * hubSpacing) / 2;

    nodes.push({
      id: 'manager', label: '国家级算力调度中心', subtitle: '顶层管控', type: 'management',
      size: 120, x: centerX, y: 60,
      currentLoad: 45, predictedLoad: 49,
      data: { statusText: 'online', role: '全国调度', region: '中国' },
    });

    HUB_META.forEach((hub, i) => {
      nodes.push({
        id: hub.id, label: hub.label, subtitle: `${hub.region}国家级枢纽`, type: 'compute',
        size: 88, x: hubStartX + i * hubSpacing, y: 210,
        currentLoad: round(40 + Math.sin(tick / 4 + i * 1.5) * 12), predictedLoad: round(44 + Math.sin(tick / 3.5 + i * 1.5) * 10),
        data: { statusText: 'online', role: '国家级枢纽', region: hub.region },
      });
      edges.push({ source: 'manager', target: hub.id, kind: 'current', style: { lineWidth: 3 } });

      const childRCs = REGIONAL_CENTERS.filter((rc) => rc.parentHub === hub.id);
      const rcSpacing = 130;
      const rcStartX = (hubStartX + i * hubSpacing) - ((childRCs.length - 1) * rcSpacing) / 2;
      childRCs.forEach((rc, j) => {
        nodes.push({
          id: rc.id, label: rc.label, subtitle: '区域级中心', type: 'sensing',
          size: 68, x: rcStartX + j * rcSpacing, y: 400,
          currentLoad: round(35 + Math.sin(tick / 5 + (i * 2 + j) * 1.7) * 10), predictedLoad: round(38 + Math.sin(tick / 4.5 + (i * 2 + j) * 1.7) * 8),
          data: { statusText: 'online', role: 'N·区域中心', region: rc.label },
        });
        edges.push({ source: hub.id, target: rc.id, kind: 'current', style: { lineWidth: 2.2, stroke: '#7c8da6' } });
      });
    });

    return { nodes, edges, events: [{ title: '4+N+31+X 全国算力网络', description: '4 个国家级枢纽、8 个区域级中心稳定运行。', color: 'blue' }], rerouteCount: 0, offlineCount: 0, newCount: 0 };
  }

  if (perspective.kind === 'region') {
    const hubId = perspective.value === 'region_beijing' ? 'hub_beijing'
      : perspective.value === 'region_shanghai' ? 'hub_shanghai'
        : 'hub_guangdong';
    const hubInfo = HUB_META.find((h) => h.id === hubId);
    const childRCs = REGIONAL_CENTERS.filter((rc) => rc.parentHub === hubId);
    const provinceNodeIds = perspective.nodeIds ?? [];
    const dcNodes = provinceNodeIds.filter((id) => NODE_META[id]?.layer === 'dc');
    const edgeNodes = provinceNodeIds.filter((id) => NODE_META[id]?.layer === 'edge');

    nodes.push({
      id: hubId, label: hubInfo?.label ?? '枢纽', subtitle: `${hubInfo?.region ?? ''}国家级枢纽`, type: 'management',
      size: 110, x: centerX, y: 60,
      currentLoad: round(40 + Math.sin(tick / 4) * 10), predictedLoad: round(44 + Math.sin(tick / 3.5) * 8),
      data: { statusText: 'online', role: '国家级枢纽', region: hubInfo?.region },
    });

    const rcSpacing = clamp(300 - childRCs.length * 40, 100, 300);
    const rcStartX = centerX - ((childRCs.length - 1) * rcSpacing) / 2;
    childRCs.forEach((rc, i) => {
      nodes.push({
        id: rc.id, label: rc.label, subtitle: '区域级中心', type: 'sensing',
        size: 80, x: rcStartX + i * rcSpacing, y: 200,
        currentLoad: round(35 + Math.sin(tick / 5 + i * 1.7) * 10), predictedLoad: round(38 + Math.sin(tick / 4.5 + i * 1.7) * 8),
        data: { statusText: 'online', role: 'N·区域中心', region: rc.label },
      });
      edges.push({ source: hubId, target: rc.id, kind: 'current', style: { lineWidth: 2.5 } });
    });

    const mainRcId = childRCs[0]?.id ?? 'rc_neimenggu';
    const provLabel = perspective.value === 'region_beijing' ? '北京省级算网大脑'
      : perspective.value === 'region_shanghai' ? '上海省级算网大脑'
        : '广东省级算网大脑';
    nodes.push({
      id: 'prov_brain', label: provLabel, subtitle: '31·省级调度', type: 'management',
      size: 88, x: centerX, y: 340,
      currentLoad: round(45 + Math.sin(tick / 3) * 8), predictedLoad: round(48 + Math.sin(tick / 2.8) * 7),
      data: { statusText: 'online', role: '省级调度', region: perspective.label },
    });
    edges.push({ source: mainRcId, target: 'prov_brain', kind: 'current', style: { lineWidth: 2.2, stroke: '#7c8da6' } });

    const dcSpacing = clamp(200 - dcNodes.length * 14, 60, 160);
    const dcStartX = centerX - ((dcNodes.length - 1) * dcSpacing) / 2;
    dcNodes.forEach((nodeId, i) => {
      const sample = replayMap[nodeId]?.latest;
      if (!sample) return;
      const meta = NODE_META[nodeId];
      nodes.push({
        id: nodeId, label: meta.name, subtitle: `地市DC`, type: 'compute',
        size: clamp(65 - dcNodes.length * 2, 45, 65), x: dcStartX + i * dcSpacing, y: 480,
        currentLoad: sample.cpu, predictedLoad: round(clamp(sample.cpu + Math.sin(tick / 3 + i) * 6, 8, 99)),
        data: { id: meta.id, ip: meta.ip, role: meta.role, region: meta.region, provider: meta.provider, statusText: 'online', currentLoad: `${sample.cpu}%` },
      });
      edges.push({ source: 'prov_brain', target: nodeId, kind: 'current', style: { lineWidth: 2 } });
    });

    const edgeSpacing = clamp(160 - edgeNodes.length * 6, 45, 140);
    const edgeStartX = centerX - ((edgeNodes.length - 1) * edgeSpacing) / 2;
    edgeNodes.forEach((nodeId, i) => {
      const sample = replayMap[nodeId]?.latest;
      if (!sample) return;
      const meta = NODE_META[nodeId];
      const parentDc = dcNodes[i % dcNodes.length];
      const status = getNodeStatus(nodeId, tick);
      nodes.push({
        id: nodeId, label: meta.name, subtitle: `边缘·X`, type: 'edge',
        size: clamp(48 - edgeNodes.length * 0.5, 34, 50), x: edgeStartX + i * edgeSpacing, y: 620,
        currentLoad: status === 'offline' ? 0 : sample.cpu, predictedLoad: status === 'offline' ? 0 : round(clamp(sample.cpu + Math.sin(tick / 3 + i * 0.7) * 5, 8, 99)),
        status,
        badgeText: status === 'offline' ? '[Offline]' : status === 'new' ? '[New]' : undefined,
        style: status === 'offline' ? { fill: '#64748b', stroke: '#94a3b8', predictedStroke: '#94a3b8' } : { fill: getLoadColor(sample.cpu), stroke: '#d6e4ff', predictedStroke: getLoadColor(round(clamp(sample.cpu + Math.sin(tick / 3 + i * 0.7) * 5, 8, 99))) },
        data: { id: meta.id, ip: meta.ip, role: meta.role, region: meta.region, provider: meta.provider, statusText: status === 'offline' ? 'offline' : 'online', currentLoad: `${sample.cpu}%` },
      });
      if (status !== 'offline') {
        edges.push({ source: parentDc ?? 'prov_brain', target: nodeId, kind: 'current', style: { lineWidth: 1.4, stroke: '#59799d' } });
      }
    });

    const offlineCount = edgeNodes.filter((id) => getNodeStatus(id, tick) === 'offline').length;
    const evts: TopologyEvent[] = [];
    if (offlineCount > 0) evts.push({ title: `${offlineCount} 边缘节点离线`, description: '边缘节点暂时下线。', color: 'red' });
    if (evts.length === 0) evts.push({ title: `${hubInfo?.label} 运行正常`, description: `${childRCs.length} 个区域中心，${dcNodes.length} 个 DC，${edgeNodes.length} 个边缘节点。`, color: 'blue' });

    return { nodes, edges, events: evts.slice(0, 5), rerouteCount: 0, offlineCount, newCount: 0 };
  }

  if (perspective.kind === 'province') {
    const visibleNodeIds = perspective.nodeIds ?? [];
    const dcNodes = visibleNodeIds.filter((id) => NODE_META[id]?.layer === 'dc');
    const edgeNodes = visibleNodeIds.filter((id) => NODE_META[id]?.layer === 'edge');

    nodes.push({
      id: 'manager', label: '省级算网大脑', subtitle: perspective.label, type: 'management',
      size: 100, x: centerX, y: 60,
      currentLoad: 48, predictedLoad: 52,
      data: { statusText: 'online', role: '省级调度', region: perspective.label },
    });

    const dcSpacing = clamp(220 - dcNodes.length * 12, 80, 200);
    const dcStartX = centerX - ((dcNodes.length - 1) * dcSpacing) / 2;
    dcNodes.forEach((nodeId, i) => {
      const sample = replayMap[nodeId]?.latest;
      if (!sample) return;
      const meta = NODE_META[nodeId];
      nodes.push({
        id: nodeId, label: meta.name, subtitle: `地市DC·${meta.region}`, type: 'compute',
        size: clamp(78 - dcNodes.length * 2, 52, 78), x: dcStartX + i * dcSpacing, y: 200,
        currentLoad: sample.cpu, predictedLoad: round(clamp(sample.cpu + Math.sin(tick / 3 + i) * 6, 8, 99)),
        data: { id: meta.id, ip: meta.ip, role: meta.role, region: meta.region, provider: meta.provider, statusText: 'online', currentLoad: `${sample.cpu}%`, predictedLoad: `${round(clamp(sample.cpu + Math.sin(tick / 3 + i) * 6, 8, 99))}%` },
      });
      edges.push({ source: 'manager', target: nodeId, kind: 'current', style: { lineWidth: 2.5 } });
    });

    const edgeSpacing = clamp(160 - edgeNodes.length * 6, 50, 160);
    const edgeStartX = centerX - ((edgeNodes.length - 1) * edgeSpacing) / 2;
    edgeNodes.forEach((nodeId, i) => {
      const sample = replayMap[nodeId]?.latest;
      if (!sample) return;
      const meta = NODE_META[nodeId];
      const parentDc = dcNodes[i % dcNodes.length];
      const status = getNodeStatus(nodeId, tick);
      nodes.push({
        id: nodeId, label: meta.name, subtitle: `边缘·${meta.region}`, type: 'edge',
        size: clamp(55 - edgeNodes.length, 38, 58), x: edgeStartX + i * edgeSpacing, y: 360,
        currentLoad: status === 'offline' ? 0 : sample.cpu, predictedLoad: status === 'offline' ? 0 : round(clamp(sample.cpu + Math.sin(tick / 3 + i * 0.7) * 5, 8, 99)),
        status,
        badgeText: status === 'offline' ? '[Offline]' : status === 'new' ? '[New]' : undefined,
        style: status === 'offline' ? { fill: '#64748b', stroke: '#94a3b8', predictedStroke: '#94a3b8' } : { fill: getLoadColor(sample.cpu), stroke: '#d6e4ff', predictedStroke: getLoadColor(round(clamp(sample.cpu + Math.sin(tick / 3 + i * 0.7) * 5, 8, 99))) },
        data: { id: meta.id, ip: meta.ip, role: meta.role, region: meta.region, provider: meta.provider, statusText: status === 'offline' ? 'offline' : status === 'new' ? 'new' : 'online', currentLoad: `${sample.cpu}%` },
      });
      if (status !== 'offline') {
        edges.push({ source: parentDc ?? 'manager', target: nodeId, kind: 'current', style: { lineWidth: 1.6, stroke: status === 'new' ? '#52c41a' : '#59799d' } });
      }
    });

    const offlineCount = edgeNodes.filter((id) => getNodeStatus(id, tick) === 'offline').length;
    const newCount = edgeNodes.filter((id) => getNodeStatus(id, tick) === 'new').length;
    const evts: TopologyEvent[] = [];
    if (offlineCount > 0) evts.push({ title: `${offlineCount} 节点离线`, description: '边缘节点暂时下线。', color: 'red' });
    if (newCount > 0) evts.push({ title: `${newCount} 新节点`, description: '边缘节点接入中。', color: 'green' });
    if (evts.length === 0) evts.push({ title: '运行正常', description: `${dcNodes.length} DC + ${edgeNodes.length} 边缘节点稳定运行。`, color: 'blue' });

    return { nodes, edges, events: evts.slice(0, 5), rerouteCount: 0, offlineCount, newCount };
  }

  return { nodes: [], edges: [], events: [], rerouteCount: 0, offlineCount: 0, newCount: 0 };
};

const toTopologyNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace('%', ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const toOptionalTopologyNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace('%', ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const normalizeTopologyType = (value: unknown): TopologyNode['type'] => {
  const raw = String(value ?? 'compute').toLowerCase();
  if (['management', 'control', 'cloud', 'hub', 'manager'].includes(raw)) return 'management';
  if (['sensing', 'region', 'service'].includes(raw)) return 'sensing';
  if (['edge', 'client'].includes(raw)) return 'edge';
  return 'compute';
};

const normalizeTopologyStatus = (value: unknown): TopologyNode['status'] => {
  const raw = String(value ?? 'online').toLowerCase();
  if (raw === 'offline' || raw === 'maintenance') return 'offline';
  if (raw === 'new') return 'new';
  return 'online';
};

export const normalizeDbTopologyPanelData = (payload: TopologyViewResponse): TopologyPanelData => {
  const nodes = (payload.nodes ?? [])
    .map((rawNode, index): TopologyNode | null => {
      const node = rawNode as Record<string, unknown>;
      const nodeData = (node.data ?? {}) as Record<string, unknown>;
      const id = String(node.id ?? node.vertex_id ?? node.node_id ?? node.compute_node_id ?? `db-node-${index}`);
      const computeNodeId = node.compute_node_id ?? node.node_id ?? nodeData.computeNodeId ?? nodeData.compute_node_id ?? nodeData.nodeId;
      if (!id) return null;
      const status = normalizeTopologyStatus(node.status ?? nodeData.statusText);
      const currentLoad = toTopologyNumber(node.currentLoad ?? node.current_load_pct ?? nodeData.currentLoad, 0);
      const predictedLoad = toTopologyNumber(node.predictedLoad ?? node.predicted_load_pct_10m ?? nodeData.predictedLoad, currentLoad);

      return {
        id,
        label: String(node.label ?? node.vertex_name ?? node.hostname ?? id),
        subtitle: node.subtitle ? String(node.subtitle) : String(nodeData.role ?? nodeData.region ?? ''),
        type: normalizeTopologyType(node.type ?? node.vertex_type ?? node.nodeType),
        size: toOptionalTopologyNumber(node.size ?? node.size_hint),
        x: toOptionalTopologyNumber(node.x),
        y: toOptionalTopologyNumber(node.y),
        currentLoad,
        predictedLoad,
        status,
        badgeText: node.badgeText ? String(node.badgeText) : undefined,
        style: (node.style ?? {}) as Record<string, unknown>,
        data: {
          ...nodeData,
          id: nodeData.id ?? computeNodeId ?? id,
          vertexId: nodeData.vertexId ?? node.vertex_id ?? id,
          nodeId: nodeData.nodeId ?? computeNodeId ?? id,
          computeNodeId: nodeData.computeNodeId ?? computeNodeId ?? id,
          compute_node_id: nodeData.compute_node_id ?? computeNodeId ?? id,
          statusText: nodeData.statusText ?? status,
          currentLoad: nodeData.currentLoad ?? `${round(currentLoad)}%`,
          predictedLoad: nodeData.predictedLoad ?? `${round(predictedLoad)}%`,
        },
      };
    })
    .filter((node): node is TopologyNode => Boolean(node));

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (payload.edges ?? [])
    .map((rawEdge, index): TopologyEdge | null => {
      const edge = rawEdge as Record<string, unknown>;
      const source = String(edge.source ?? edge.source_vertex_id ?? edge.sourceNodeId ?? '');
      const target = String(edge.target ?? edge.target_vertex_id ?? edge.targetNodeId ?? '');
      if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target)) return null;
      const style = (edge.style ?? {}) as Record<string, unknown>;
      return {
        source,
        target,
        label: edge.label ? String(edge.label) : undefined,
        kind: edge.kind === 'predictive' ? 'predictive' : 'current',
        animated: Boolean(edge.animated),
        style: {
          ...style,
          strokeWidth: style.strokeWidth ?? style.lineWidth,
          strokeDasharray: style.strokeDasharray ?? (Array.isArray(style.lineDash) ? style.lineDash.join(' ') : style.lineDash),
        },
      };
    })
    .filter((edge): edge is TopologyEdge => Boolean(edge));

  return {
    nodes,
    edges,
    events: payload.events ?? [],
    rerouteCount: payload.rerouteCount ?? 0,
    offlineCount: payload.offlineCount ?? 0,
    newCount: payload.newCount ?? 0,
  };
};
