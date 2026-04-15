import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
} from '@ant-design/icons';
import {
  Badge,
  Card,
  Col,
  Descriptions,
  Progress,
  Radio,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
  theme,
} from 'antd';
import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { BarChart, PieChart } from '@/components/Charts';
import TopologyGraph, { TopologyEdge, TopologyNode } from '@/components/TopologyGraph';
import './index.css';

type PerspectiveValue = 'global' | 'region_beijing' | 'region_shanghai' | 'node_1999' | 'node_0008';
type PerspectiveKind = 'global' | 'region' | 'node';
type ForecastMetric = 'cpu' | 'memory' | 'bandwidth';
type TimeGranularity = '30m' | '1h' | '6h';
type NodeId = 'Node_1999' | 'Node_0008' | 'Node_0042' | 'Node_0031' | 'Node_0108';

interface PerspectiveProfile {
  value: PerspectiveValue;
  label: string;
  kind: PerspectiveKind;
  nodeIds?: NodeId[];
  nodeId?: NodeId;
}

interface DiskUsage {
  name: string;
  percent: number;
  color: string;
}

interface SeriesPoint {
  timestamp: number;
  value: number;
}

interface NodeSample {
  cpu: number;
  memory: number;
  bandwidth: number;
  latency: number;
  jitter: number;
  packetLoss: number;
  egressBandwidth: number;
  gpuUsage: number[];
  gpuMemory: number[];
  disks: DiskUsage[];
}

interface NodeMeta {
  id: NodeId;
  name: string;
  region: string;
  ip: string;
  role: string;
  architecture: string;
  provider: string;
  gpuNames: string[];
  gpuTotals: number[];
  baseCpu: number;
  baseMemory: number;
  baseBandwidth: number;
}

interface NodeReplayState {
  cpuSeries: SeriesPoint[];
  memorySeries: SeriesPoint[];
  latest: NodeSample;
}

interface GlobalKpis {
  avgDelay: number;
  delayDelta: number;
  loadStd: number;
  loadStdDelta: number;
  successTasks: number;
  successTasksDelta: number;
}

interface ForecastReplayState {
  timeline: number[];
  actual: number[];
  predicted: number[];
  upper: number[];
  lower: number[];
  cursor: number;
  unit: string;
  label: string;
}

const { Text } = Typography;

const PERSPECTIVES: PerspectiveProfile[] = [
  { value: 'global', label: '全局调度大盘', kind: 'global', nodeIds: ['Node_1999', 'Node_0008', 'Node_0042', 'Node_0031', 'Node_0108'] },
  { value: 'region_beijing', label: '北京算力中心', kind: 'region', nodeIds: ['Node_1999', 'Node_0042', 'Node_0031'] },
  { value: 'region_shanghai', label: '上海边缘集群', kind: 'region', nodeIds: ['Node_0008', 'Node_0108'] },
  { value: 'node_1999', label: '算力节点_1999', kind: 'node', nodeId: 'Node_1999' },
  { value: 'node_0008', label: '算力节点_0008', kind: 'node', nodeId: 'Node_0008' },
];

const PERSPECTIVE_MAP = Object.fromEntries(PERSPECTIVES.map((item) => [item.value, item])) as Record<PerspectiveValue, PerspectiveProfile>;

const NODE_META: Record<NodeId, NodeMeta> = {
  Node_1999: {
    id: 'Node_1999',
    name: 'Alpha',
    region: '北京 A2',
    ip: '10.33.18.199',
    role: '核心训练节点',
    architecture: 'x86_64 / CUDA 12.2',
    provider: 'A100 推理池',
    gpuNames: ['GPU-0', 'GPU-1', 'GPU-2', 'GPU-3'],
    gpuTotals: [80, 80, 80, 80],
    baseCpu: 72,
    baseMemory: 68,
    baseBandwidth: 78,
  },
  Node_0008: {
    id: 'Node_0008',
    name: 'Beta',
    region: '上海 E1',
    ip: '10.56.8.108',
    role: '边缘推理节点',
    architecture: 'ARM64 / CUDA 11.8',
    provider: 'L40S 混合池',
    gpuNames: ['GPU-0', 'GPU-1', 'GPU-2'],
    gpuTotals: [48, 48, 16],
    baseCpu: 48,
    baseMemory: 54,
    baseBandwidth: 64,
  },
  Node_0042: {
    id: 'Node_0042',
    name: 'Gamma',
    region: '北京 A4',
    ip: '10.40.0.42',
    role: '高性能计算节点',
    architecture: 'x86_64 / CUDA 12.4',
    provider: 'H100 训练池',
    gpuNames: ['GPU-0', 'GPU-1', 'GPU-2', 'GPU-3'],
    gpuTotals: [80, 80, 80, 80],
    baseCpu: 82,
    baseMemory: 72,
    baseBandwidth: 88,
  },
  Node_0031: {
    id: 'Node_0031',
    name: 'Orion',
    region: '北京 B1',
    ip: '10.33.0.31',
    role: '区域弹性节点',
    architecture: 'x86_64 / CUDA 12.0',
    provider: 'A800 弹性池',
    gpuNames: ['GPU-0', 'GPU-1'],
    gpuTotals: [80, 80],
    baseCpu: 58,
    baseMemory: 50,
    baseBandwidth: 62,
  },
  Node_0108: {
    id: 'Node_0108',
    name: 'Nova',
    region: '上海 E3',
    ip: '10.56.1.108',
    role: '边缘扩容节点',
    architecture: 'x86_64 / CUDA 11.8',
    provider: 'T4 边缘池',
    gpuNames: ['GPU-0', 'GPU-1'],
    gpuTotals: [16, 16],
    baseCpu: 36,
    baseMemory: 42,
    baseBandwidth: 70,
  },
};

const DISK_COLORS = ['#1677ff', '#52c41a', '#faad14', '#722ed1'];
const INITIAL_TIME = dayjs('2026-04-09 00:04:05').valueOf();
const ROLLING_POINTS = 30;
const REPLAY_STEP_SECONDS = 5;
const FORECAST_PAST_POINTS = 10;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 1) => Number(value.toFixed(digits));

const getLoadColor = (value: number) => {
  if (value >= 80) return '#ff4d4f';
  if (value >= 60) return '#faad14';
  return '#52c41a';
};

const seriesValue = (base: number, seed: number, step: number, amplitude = 6) => clamp(
  base
  + Math.sin(step / 3 + seed) * amplitude
  + Math.cos(step / 5 + seed * 1.7) * (amplitude * 0.55),
  8,
  98,
);

const createNodeSample = (meta: NodeMeta, step: number): NodeSample => {
  const seed = Number(meta.id.replace('Node_', '')) / 100;
  const cpu = seriesValue(meta.baseCpu, seed, step, 9);
  const memory = seriesValue(meta.baseMemory, seed + 0.7, step, 6);
  const bandwidth = seriesValue(meta.baseBandwidth, seed + 1.1, step, 7);
  const latency = round(clamp(18 + Math.sin(step / 4 + seed) * 9 + cpu * 0.18, 8, 78));
  const jitter = round(clamp(2 + Math.cos(step / 4 + seed) * 2 + bandwidth * 0.03, 1, 10));
  const packetLoss = round(clamp(cpu > 84 ? Math.abs(Math.sin(step / 6)) * 0.8 : Math.abs(Math.cos(step / 8)) * 0.08, 0, 1.6), 2);
  const egressBandwidth = round(clamp(40 + bandwidth * 1.15 + Math.sin(step / 5) * 8, 20, 160));
  const gpuUsage = meta.gpuNames.map((_, index) => round(clamp(cpu - 12 + index * 5 + Math.sin(step / 3 + index) * 10, 5, 100)));
  const gpuMemory = meta.gpuTotals.map((total, index) => round(clamp(total * (0.3 + gpuUsage[index] / 160), 2, total), 1));
  const disks = [
    { name: '/system', percent: round(clamp(memory - 18 + seed * 3, 22, 88)), color: DISK_COLORS[0] },
    { name: '/data', percent: round(clamp(cpu - 6 + seed * 2.4, 35, 94)), color: DISK_COLORS[1] },
    { name: '/models', percent: round(clamp(memory - 4 + seed * 2.1, 28, 90)), color: DISK_COLORS[2] },
    { name: '/cache', percent: round(clamp(24 + Math.sin(step / 8 + seed) * 14, 10, 72)), color: DISK_COLORS[3] },
  ];

  return {
    cpu: round(cpu),
    memory: round(memory),
    bandwidth: round(bandwidth),
    latency,
    jitter,
    packetLoss,
    egressBandwidth,
    gpuUsage,
    gpuMemory,
    disks,
  };
};

const createInitialNodeReplay = (virtualTime: number): Record<NodeId, NodeReplayState> => (
  Object.values(NODE_META).reduce<Record<NodeId, NodeReplayState>>((accumulator, meta) => {
    const cpuSeries: SeriesPoint[] = [];
    const memorySeries: SeriesPoint[] = [];

    for (let index = 0; index < ROLLING_POINTS; index += 1) {
      const step = index - (ROLLING_POINTS - 1);
      const timestamp = virtualTime + step * REPLAY_STEP_SECONDS * 1000;
      const sample = createNodeSample(meta, step + 120);
      cpuSeries.push({ timestamp, value: sample.cpu });
      memorySeries.push({ timestamp, value: sample.memory });
    }

    accumulator[meta.id] = {
      cpuSeries,
      memorySeries,
      latest: createNodeSample(meta, 120),
    };
    return accumulator;
  }, {} as Record<NodeId, NodeReplayState>)
);

const advanceNodeReplay = (
  previous: Record<NodeId, NodeReplayState>,
  virtualTime: number,
  tick: number,
): Record<NodeId, NodeReplayState> => (
  Object.values(NODE_META).reduce<Record<NodeId, NodeReplayState>>((accumulator, meta) => {
    const nextSample = createNodeSample(meta, tick + Number(meta.id.replace('Node_', '')));
    accumulator[meta.id] = {
      latest: nextSample,
      cpuSeries: [...previous[meta.id].cpuSeries.slice(1), { timestamp: virtualTime, value: nextSample.cpu }],
      memorySeries: [...previous[meta.id].memorySeries.slice(1), { timestamp: virtualTime, value: nextSample.memory }],
    };
    return accumulator;
  }, {} as Record<NodeId, NodeReplayState>)
);

const getGranularityConfig = (granularity: TimeGranularity) => {
  switch (granularity) {
    case '30m':
      return { stepMinutes: 3, futurePoints: 10 };
    case '6h':
      return { stepMinutes: 20, futurePoints: 18 };
    case '1h':
    default:
      return { stepMinutes: 5, futurePoints: 12 };
  }
};

const getForecastMeta = (metric: ForecastMetric) => {
  if (metric === 'memory') {
    return { label: '内存利用率', unit: '%', base: 56 };
  }
  if (metric === 'bandwidth') {
    return { label: '网络带宽', unit: 'Gbps', base: 72 };
  }
  return { label: 'CPU利用率', unit: '%', base: 62 };
};

const createForecastReplay = (
  metric: ForecastMetric,
  granularity: TimeGranularity,
  anchorTime: number,
  perspective: PerspectiveProfile,
): ForecastReplayState => {
  const { stepMinutes, futurePoints } = getGranularityConfig(granularity);
  const meta = getForecastMeta(metric);
  const totalPoints = FORECAST_PAST_POINTS + futurePoints + 1;
  const baseOffset = perspective.kind === 'node' ? 8 : perspective.kind === 'region' ? 4 : 0;

  const timeline = Array.from({ length: totalPoints }, (_, index) => (
    anchorTime + (index - FORECAST_PAST_POINTS) * stepMinutes * 60 * 1000
  ));

  const actual = timeline.map((_, index) => round(clamp(
    meta.base
    + baseOffset
    + Math.sin(index / 2.6) * 7
    + Math.cos(index / 4.5) * 4,
    metric === 'bandwidth' ? 18 : 16,
    metric === 'bandwidth' ? 120 : 95,
  )));

  const predicted = timeline.map((_, index) => round(clamp(
    actual[index] + Math.sin(index / 3.1 + 0.6) * 4 + (index > FORECAST_PAST_POINTS ? (index - FORECAST_PAST_POINTS) * 0.8 : 0),
    metric === 'bandwidth' ? 20 : 18,
    metric === 'bandwidth' ? 125 : 98,
  )));

  const upper = predicted.map((value) => round(value + (metric === 'bandwidth' ? 8 : 6)));
  const lower = predicted.map((value) => round(Math.max(metric === 'bandwidth' ? 10 : 0, value - (metric === 'bandwidth' ? 8 : 6))));

  return {
    timeline,
    actual,
    predicted,
    upper,
    lower,
    cursor: FORECAST_PAST_POINTS,
    unit: meta.unit,
    label: meta.label,
  };
};

const advanceForecastReplay = (
  previous: ForecastReplayState,
  metric: ForecastMetric,
  granularity: TimeGranularity,
  virtualTime: number,
  perspective: PerspectiveProfile,
): ForecastReplayState => {
  if (previous.cursor >= previous.timeline.length - 3) {
    return createForecastReplay(metric, granularity, virtualTime, perspective);
  }
  return { ...previous, cursor: previous.cursor + 1 };
};

const getVisibleNodeIds = (perspective: PerspectiveProfile): NodeId[] => (
  perspective.kind === 'node'
    ? [perspective.nodeId as NodeId]
    : (perspective.nodeIds as NodeId[])
);

const buildKpis = (
  replayMap: Record<NodeId, NodeReplayState>,
  perspective: PerspectiveProfile,
  previous?: GlobalKpis,
): GlobalKpis => {
  const nodes = getVisibleNodeIds(perspective).map((nodeId) => replayMap[nodeId].latest);
  const avgLatency = nodes.reduce((sum, item) => sum + item.latency, 0) / Math.max(nodes.length, 1);
  const cpuLoads = nodes.map((item) => item.cpu);
  const meanLoad = cpuLoads.reduce((sum, value) => sum + value, 0) / Math.max(cpuLoads.length, 1);
  const std = Math.sqrt(cpuLoads.reduce((sum, value) => sum + ((value - meanLoad) ** 2), 0) / Math.max(cpuLoads.length, 1));
  const successTasks = Math.round(980 + meanLoad * 12 + nodes.length * 45);

  return {
    avgDelay: round(avgLatency, 1),
    delayDelta: previous ? round(avgLatency - previous.avgDelay, 1) : 1.2,
    loadStd: round(std, 2),
    loadStdDelta: previous ? round(std - previous.loadStd, 2) : -0.16,
    successTasks,
    successTasksDelta: previous ? successTasks - previous.successTasks : 24,
  };
};

const buildTopologyData = (
  replayMap: Record<NodeId, NodeReplayState>,
  perspective: PerspectiveProfile,
): { nodes: TopologyNode[]; edges: TopologyEdge[] } => {
  const computeNodes = getVisibleNodeIds(perspective).map((nodeId) => {
    const sample = replayMap[nodeId].latest;
    return {
      id: nodeId,
      label: `${NODE_META[nodeId].name}\n${sample.cpu}%`,
      type: 'compute',
      size: clamp(sample.cpu * 0.45, 26, 54),
      style: {
        fill: getLoadColor(sample.cpu),
        stroke: '#d6e4ff',
      },
    };
  });

  const nodes: TopologyNode[] = [
    { id: 'manager', label: perspective.kind === 'global' ? '全局调度中心' : '区域调度中心', type: 'management', size: 58 },
    { id: 'sense_a', label: '资源感知总线', type: 'sensing', size: 42 },
    { id: 'sense_b', label: '网络感知节点', type: 'sensing', size: 40 },
    ...computeNodes,
  ];

  const edges: TopologyEdge[] = [
    { source: 'manager', target: 'sense_a' },
    { source: 'manager', target: 'sense_b' },
    ...computeNodes.map((node, index) => ({
      source: index % 2 === 0 ? 'sense_a' : 'sense_b',
      target: node.id,
      style: { lineWidth: 1.4 + index * 0.2 },
    })),
  ];

  return { nodes, edges };
};

const buildNodeLineOption = (
  title: string,
  points: SeriesPoint[],
  color: string,
  token: ReturnType<typeof theme.useToken>['token'],
): EChartsOption => ({
  title: {
    text: title,
    left: 0,
    textStyle: { fontSize: 14, fontWeight: 600, color: token.colorText },
  },
  tooltip: { trigger: 'axis', valueFormatter: (value) => `${value}%` },
  grid: { left: 40, right: 16, top: 42, bottom: 26 },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: points.map((item) => dayjs(item.timestamp).format('HH:mm:ss')),
    axisLabel: { color: token.colorTextTertiary, interval: 4 },
  },
  yAxis: {
    type: 'value',
    min: 0,
    max: 100,
    axisLabel: { color: token.colorTextTertiary },
    splitLine: { lineStyle: { color: token.colorBorderSecondary } },
  },
  series: [{
    type: 'line',
    smooth: true,
    symbol: 'none',
    data: points.map((item) => item.value),
    lineStyle: { width: 3, color },
    areaStyle: { color: `${color}22` },
  }],
});

const buildGpuOption = (
  meta: NodeMeta,
  sample: NodeSample,
  token: ReturnType<typeof theme.useToken>['token'],
): EChartsOption => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  legend: {
    top: 0,
    textStyle: { color: token.colorTextSecondary },
  },
  grid: { left: 54, right: 24, top: 42, bottom: 24 },
  xAxis: {
    type: 'value',
    axisLabel: { color: token.colorTextSecondary },
    splitLine: { lineStyle: { color: token.colorBorderSecondary } },
  },
  yAxis: {
    type: 'category',
    axisLabel: { color: token.colorTextSecondary },
    data: meta.gpuNames,
  },
  series: [
    {
      name: '算力使用率(%)',
      type: 'bar',
      data: sample.gpuUsage,
      itemStyle: { color: token.colorPrimary, borderRadius: 8 },
      barWidth: 14,
    },
    {
      name: '显存使用量(GB)',
      type: 'bar',
      data: sample.gpuMemory,
      itemStyle: { color: token.colorSuccess, borderRadius: 8 },
      barWidth: 14,
    },
  ],
});

const buildForecastOption = (
  replay: ForecastReplayState,
  token: ReturnType<typeof theme.useToken>['token'],
): EChartsOption => {
  const actualData = replay.timeline.map((time, index) => [time, index <= replay.cursor ? replay.actual[index] : null]);
  const predictData = replay.timeline.map((time, index) => [time, index >= replay.cursor ? replay.predicted[index] : null]);
  const lowerData = replay.timeline.map((time, index) => [time, index >= replay.cursor ? replay.lower[index] : null]);
  const bandData = replay.timeline.map((time, index) => [time, index >= replay.cursor ? replay.upper[index] - replay.lower[index] : null]);
  const nowTime = replay.timeline[replay.cursor];

  return {
    tooltip: { trigger: 'axis' },
    legend: {
      top: 0,
      textStyle: { color: token.colorTextSecondary },
    },
    grid: { left: 48, right: 28, top: 48, bottom: 36 },
    xAxis: {
      type: 'time',
      axisLabel: {
        color: token.colorTextSecondary,
        formatter: (value: number) => dayjs(value).format('HH:mm'),
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: token.colorTextSecondary,
        formatter: `{value}${replay.unit}`,
      },
      splitLine: { lineStyle: { color: token.colorBorderSecondary } },
    },
    series: [
      {
        name: '历史真实数据',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 3, color: token.colorPrimary },
        areaStyle: { color: `${token.colorPrimary}18` },
        data: actualData,
        markLine: {
          symbol: ['none', 'none'],
          label: {
            formatter: '当前时间 Now',
            color: token.colorInfo,
          },
          lineStyle: {
            color: token.colorInfo,
            type: 'dashed',
            width: 1.5,
          },
          data: [{ xAxis: nowTime }],
        },
      },
      {
        name: '预测下限',
        type: 'line',
        symbol: 'none',
        smooth: true,
        lineStyle: { opacity: 0 },
        stack: 'forecast-band',
        data: lowerData,
      },
      {
        name: '预测置信区间',
        type: 'line',
        symbol: 'none',
        smooth: true,
        lineStyle: { opacity: 0 },
        areaStyle: { color: `${token.colorWarning}22` },
        stack: 'forecast-band',
        data: bandData,
      },
      {
        name: '未来预测数据',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 3, type: 'dashed', color: token.colorWarning },
        data: predictData,
      },
    ],
  };
};

const PredictionAllocation: React.FC = () => {
  const { token } = theme.useToken();
  const [perspective, setPerspective] = useState<PerspectiveValue>('global');
  const [granularity, setGranularity] = useState<TimeGranularity>('1h');
  const [forecastMetric, setForecastMetric] = useState<ForecastMetric>('cpu');
  const [replayTick, setReplayTick] = useState(120);
  const [virtualTime, setVirtualTime] = useState(INITIAL_TIME);
  const [nodeReplayMap, setNodeReplayMap] = useState<Record<NodeId, NodeReplayState>>(() => createInitialNodeReplay(INITIAL_TIME));
  const currentPerspective = PERSPECTIVE_MAP[perspective];
  const [globalKpis, setGlobalKpis] = useState<GlobalKpis>(() => buildKpis(createInitialNodeReplay(INITIAL_TIME), currentPerspective));
  const [forecastReplay, setForecastReplay] = useState<ForecastReplayState>(() => (
    createForecastReplay('cpu', '1h', INITIAL_TIME, currentPerspective)
  ));

  // 视图切换逻辑：切换全局 / 区域 / 单节点后，页面按层级条件渲染不同面板
  const isNodeView = currentPerspective.kind === 'node';
  const currentNodeId = currentPerspective.nodeId ?? 'Node_1999';
  const currentNodeMeta = NODE_META[currentNodeId];
  const currentNodeReplay = nodeReplayMap[currentNodeId];

  useEffect(() => {
    setGlobalKpis((previous) => buildKpis(nodeReplayMap, currentPerspective, previous));
  }, [currentPerspective, nodeReplayMap]);

  useEffect(() => {
    setForecastReplay(createForecastReplay(forecastMetric, granularity, virtualTime, currentPerspective));
  }, [currentPerspective, forecastMetric, granularity]);

  // 数据回放逻辑：每 3 秒推进 5 秒，微调 KPI、滚动单节点曲线、推进预测面板的 Now 标记线
  useEffect(() => {
    const timer = window.setInterval(() => {
      setReplayTick((previousTick) => {
        const nextTick = previousTick + 1;

        setVirtualTime((previousTime) => {
          const nextVirtualTime = dayjs(previousTime).add(REPLAY_STEP_SECONDS, 'second').valueOf();
          setNodeReplayMap((previous) => advanceNodeReplay(previous, nextVirtualTime, nextTick));
          setForecastReplay((previous) => advanceForecastReplay(previous, forecastMetric, granularity, nextVirtualTime, currentPerspective));
          return nextVirtualTime;
        });

        return nextTick;
      });
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [currentPerspective, forecastMetric, granularity]);

  const visibleNodeIds = useMemo(() => getVisibleNodeIds(currentPerspective), [currentPerspective]);
  const topologyData = useMemo(() => buildTopologyData(nodeReplayMap, currentPerspective), [currentPerspective, nodeReplayMap]);

  const loadTop5 = useMemo(() => (
    visibleNodeIds
      .map((nodeId) => ({
        name: NODE_META[nodeId].name,
        value: nodeReplayMap[nodeId].latest.cpu,
      }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 5)
  ), [nodeReplayMap, visibleNodeIds]);

  const taskTypeData = useMemo(() => {
    const avgLoad = visibleNodeIds.reduce((sum, nodeId) => sum + nodeReplayMap[nodeId].latest.cpu, 0) / Math.max(visibleNodeIds.length, 1);
    return [
      { name: '训练任务', value: round(26 + avgLoad * 0.24) },
      { name: '推理服务', value: round(22 + avgLoad * 0.21) },
      { name: '数据预处理', value: round(16 + avgLoad * 0.11) },
      { name: '联邦聚合', value: round(12 + avgLoad * 0.08) },
      { name: '弹性迁移', value: round(8 + avgLoad * 0.05) },
    ];
  }, [nodeReplayMap, visibleNodeIds]);

  const cpuOption = useMemo(() => buildNodeLineOption('最近60秒 CPU利用率', currentNodeReplay.cpuSeries, token.colorPrimary, token), [currentNodeReplay.cpuSeries, token]);
  const memoryOption = useMemo(() => buildNodeLineOption('最近60秒 内存利用率', currentNodeReplay.memorySeries, token.colorSuccess, token), [currentNodeReplay.memorySeries, token]);
  const gpuOption = useMemo(() => buildGpuOption(currentNodeMeta, currentNodeReplay.latest, token), [currentNodeMeta, currentNodeReplay.latest, token]);
  const forecastOption = useMemo(() => buildForecastOption(forecastReplay, token), [forecastReplay, token]);

  const trendColor = (value: number, reverse = false) => {
    const positive = reverse ? value <= 0 : value >= 0;
    return positive ? token.colorSuccess : token.colorError;
  };

  return (
    <div className="prediction-allocation-page">
      <Card>
        <Space wrap size={[16, 12]} className="prediction-allocation-toolbar">
          <div className="prediction-allocation-toolbar-block">
            <Text type="secondary">层级视角</Text>
            <Select
              value={perspective}
              style={{ width: 260 }}
              onChange={(value) => setPerspective(value as PerspectiveValue)}
              options={[
                { label: '全局调度大盘', options: [{ label: '全局调度大盘', value: 'global' }] },
                { label: '区域集群', options: [{ label: '北京算力中心', value: 'region_beijing' }, { label: '上海边缘集群', value: 'region_shanghai' }] },
                { label: '具体算力节点', options: [{ label: '算力节点_1999', value: 'node_1999' }, { label: '算力节点_0008', value: 'node_0008' }] },
              ]}
            />
          </div>

          <div className="prediction-allocation-toolbar-block">
            <Text type="secondary">预测视窗</Text>
            <Radio.Group
              value={granularity}
              optionType="button"
              buttonStyle="solid"
              onChange={(event) => setGranularity(event.target.value as TimeGranularity)}
              options={[
                { label: '未来30分钟', value: '30m' },
                { label: '未来1小时', value: '1h' },
                { label: '未来6小时', value: '6h' },
              ]}
            />
          </div>

          <Tag color="blue" className="prediction-allocation-now-tag">
            当前虚拟时间：{dayjs(virtualTime).format('YYYY-MM-DD HH:mm:ss')}
          </Tag>
        </Space>
      </Card>

      {!isNodeView ? (
        <Card title="算力资源分配结果面板" extra={<Badge status="processing" text={currentPerspective.label} />}>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Card size="small" className="prediction-allocation-inner-card">
                <Statistic
                  title="平均任务处理延迟"
                  value={globalKpis.avgDelay}
                  suffix="ms"
                  valueStyle={{ color: trendColor(globalKpis.delayDelta, true) }}
                  prefix={globalKpis.delayDelta <= 0 ? <ArrowDownOutlined /> : <ArrowUpOutlined />}
                />
                <div className="prediction-allocation-stat-foot">
                  <Text type="secondary">分钟变化</Text>
                  <Text style={{ color: trendColor(globalKpis.delayDelta, true) }}>{globalKpis.delayDelta}</Text>
                </div>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card size="small" className="prediction-allocation-inner-card">
                <Statistic
                  title="系统负载均衡度"
                  value={globalKpis.loadStd}
                  suffix="σ"
                  valueStyle={{ color: trendColor(globalKpis.loadStdDelta, true) }}
                  prefix={globalKpis.loadStdDelta <= 0 ? <ArrowDownOutlined /> : <ArrowUpOutlined />}
                />
                <div className="prediction-allocation-stat-foot">
                  <Text type="secondary">标准差变化</Text>
                  <Text style={{ color: trendColor(globalKpis.loadStdDelta, true) }}>{globalKpis.loadStdDelta}</Text>
                </div>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card size="small" className="prediction-allocation-inner-card">
                <Statistic
                  title="成功处理任务数"
                  value={globalKpis.successTasks}
                  valueStyle={{ color: trendColor(globalKpis.successTasksDelta) }}
                  prefix={globalKpis.successTasksDelta >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                />
                <div className="prediction-allocation-stat-foot">
                  <Text type="secondary">分钟增量</Text>
                  <Text style={{ color: trendColor(globalKpis.successTasksDelta) }}>{globalKpis.successTasksDelta}</Text>
                </div>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col span={24}>
              <TopologyGraph
                title="算力网络协同分配拓扑"
                height={420}
                nodes={topologyData.nodes}
                edges={topologyData.edges}
                layoutType="dagre"
              />
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} xl={12}>
              <Card title="负载率 TOP 5">
                <BarChart
                  horizontal
                  height={260}
                  xData={loadTop5.map((item) => item.name)}
                  series={[{ name: 'CPU负载', data: loadTop5.map((item) => item.value), color: token.colorPrimary }]}
                />
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card title="任务分配类型占比">
                <PieChart data={taskTypeData} height={260} />
              </Card>
            </Col>
          </Row>
        </Card>
      ) : (
        <Card
          title="单节点资源监控面板"
          extra={<Badge status="processing" text={`${currentNodeMeta.name} / ${currentNodeMeta.role}`} />}
        >
          <Card
            size="small"
            className="prediction-allocation-inner-card"
            title={`${currentNodeMeta.id} 基础信息`}
            extra={(
              <Space wrap size={[8, 8]}>
                <Tag color={currentNodeReplay.latest.packetLoss > 0 || currentNodeReplay.latest.latency > 50 ? 'error' : 'success'}>
                  时延 {currentNodeReplay.latest.latency} ms
                </Tag>
                <Tag color={currentNodeReplay.latest.packetLoss > 0 || currentNodeReplay.latest.latency > 50 ? 'error' : 'success'}>
                  抖动 {currentNodeReplay.latest.jitter} ms
                </Tag>
                <Tag color={currentNodeReplay.latest.packetLoss > 0 ? 'error' : 'success'}>
                  丢包 {currentNodeReplay.latest.packetLoss} %
                </Tag>
                <Tag color="processing">带宽 {currentNodeReplay.latest.egressBandwidth} Gbps</Tag>
              </Space>
            )}
          >
            <Descriptions
              bordered
              size="small"
              column={{ xs: 1, md: 2, xl: 4 }}
              items={[
                { key: '1', label: '节点名称', children: currentNodeMeta.name },
                { key: '2', label: '节点 ID', children: currentNodeMeta.id },
                { key: '3', label: 'IP 地址', children: currentNodeMeta.ip },
                { key: '4', label: '所在区域', children: currentNodeMeta.region },
                { key: '5', label: '角色', children: currentNodeMeta.role },
                { key: '6', label: '算力池', children: currentNodeMeta.provider },
                { key: '7', label: '架构', children: currentNodeMeta.architecture },
                { key: '8', label: 'GPU 数量', children: `${currentNodeMeta.gpuNames.length} 张` },
              ]}
            />
          </Card>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} xl={12}>
              <Card title="CPU利用率">
                <ReactECharts option={cpuOption} style={{ height: 260 }} notMerge lazyUpdate />
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card title="内存利用率">
                <ReactECharts option={memoryOption} style={{ height: 260 }} notMerge lazyUpdate />
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} xl={14}>
              <Card title="GPU 异构资源占用">
                <ReactECharts option={gpuOption} style={{ height: 300 }} notMerge lazyUpdate />
              </Card>
            </Col>
            <Col xs={24} xl={10}>
              <Card title="磁盘空间">
                <Space direction="vertical" style={{ width: '100%' }} size={18}>
                  {currentNodeReplay.latest.disks.map((disk) => (
                    <div key={disk.name}>
                      <div className="prediction-allocation-disk-row">
                        <Text>{disk.name}</Text>
                        <Text type="secondary">{disk.percent}%</Text>
                      </div>
                      <Progress percent={disk.percent} strokeColor={disk.color} showInfo={false} />
                    </div>
                  ))}
                </Space>
              </Card>
            </Col>
          </Row>
        </Card>
      )}

      <Card
        title="算力资源服务需求预测面板"
        extra={(
          <Segmented
            value={forecastMetric}
            onChange={(value) => setForecastMetric(value as ForecastMetric)}
            options={[
              { label: 'CPU利用率', value: 'cpu' },
              { label: '内存利用率', value: 'memory' },
              { label: '网络带宽', value: 'bandwidth' },
            ]}
          />
        )}
      >
        <ReactECharts option={forecastOption} style={{ height: 350 }} notMerge lazyUpdate />
      </Card>
    </div>
  );
};

export default PredictionAllocation;
