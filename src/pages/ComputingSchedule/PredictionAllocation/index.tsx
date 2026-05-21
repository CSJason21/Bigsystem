import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
} from '@ant-design/icons';
import {
  Badge,
  Card,
  Col,
  DatePicker,
  Descriptions,
  List,
  Progress,
  Radio,
  Row,
  Segmented,
  Select,
  Space,
  Tag,
  Typography,
  notification,
  theme,
} from 'antd';
import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { BarChart, PieChart } from '@/components/Charts';
import TopologyGraph, {
  TopologyEdge,
  TopologyNode,
  TopologyNodeStatus,
} from '@/components/TopologyGraph';
import {
  getAllocationKpi,
  getDayDemandPrediction,
  getPerspectives,
  getScheduleLogs,
  getTaskTypeStats,
  getTopLoad,
  getTopologyView,
} from '@/services/api/predictionAllocation';
import './index.css';

type PerspectiveValue = string;
type PerspectiveKind = 'global' | 'region' | 'province' | 'node';
type ForecastMetric = 'cpu' | 'memory' | 'bandwidth';
type TimeGranularity = '30m' | '1h' | '6h';
type TimeMode = 'live' | 'fixed';
type NodeId = string;

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
  layer?: 'dc' | 'edge';
  parentRegion?: string;
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
  avgBandwidth: number;
  avgGpuUsage: number;
  totalGpuMemory: number;
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

interface TopologyEvent {
  title: string;
  description: string;
  color: string;
}

interface TopologyPanelData {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  events: TopologyEvent[];
  rerouteCount: number;
  offlineCount: number;
  newCount: number;
}

const { Text } = Typography;

const ALL_COMPUTE_NODE_IDS: NodeId[] = [
  'BJ_DC1', 'BJ_DC2', 'BJ_DC3',
  'BJ_E1', 'BJ_E2', 'BJ_E3', 'BJ_E4', 'BJ_E5',
  'SH_DC1', 'SH_DC2',
  'SH_E1', 'SH_E2', 'SH_E3',
  'GD_DC1', 'GD_DC2', 'GD_DC3',
  'GD_E1', 'GD_E2', 'GD_E3', 'GD_E4',
];

const PROVINCE_NODE_MAP: Record<string, NodeId[]> = {
  prov_beijing: ['BJ_DC1', 'BJ_DC2', 'BJ_DC3', 'BJ_E1', 'BJ_E2', 'BJ_E3', 'BJ_E4', 'BJ_E5'],
  prov_shanghai: ['SH_DC1', 'SH_DC2', 'SH_E1', 'SH_E2', 'SH_E3'],
  prov_guangdong: ['GD_DC1', 'GD_DC2', 'GD_DC3', 'GD_E1', 'GD_E2', 'GD_E3', 'GD_E4'],
};

const REGION_NODE_MAP: Record<string, NodeId[]> = {
  region_beijing: ['BJ_DC1', 'BJ_DC2', 'BJ_DC3', 'BJ_E1', 'BJ_E2', 'BJ_E3', 'BJ_E4', 'BJ_E5'],
  region_shanghai: ['SH_DC1', 'SH_DC2', 'SH_E1', 'SH_E2', 'SH_E3'],
  region_guangdong: ['GD_DC1', 'GD_DC2', 'GD_DC3', 'GD_E1', 'GD_E2', 'GD_E3', 'GD_E4'],
};

const PERSPECTIVES: PerspectiveProfile[] = [
  { value: 'global', label: '全国算力调度大盘', kind: 'global', nodeIds: ALL_COMPUTE_NODE_IDS },
  { value: 'region_beijing', label: '京津冀枢纽区域', kind: 'region', nodeIds: REGION_NODE_MAP.region_beijing },
  { value: 'region_shanghai', label: '长三角枢纽区域', kind: 'region', nodeIds: REGION_NODE_MAP.region_shanghai },
  { value: 'region_guangdong', label: '粤港澳枢纽区域', kind: 'region', nodeIds: REGION_NODE_MAP.region_guangdong },
  { value: 'prov_beijing', label: '北京省级节点', kind: 'province', nodeIds: PROVINCE_NODE_MAP.prov_beijing },
  { value: 'prov_shanghai', label: '上海省级节点', kind: 'province', nodeIds: PROVINCE_NODE_MAP.prov_shanghai },
  { value: 'prov_guangdong', label: '广东省级节点', kind: 'province', nodeIds: PROVINCE_NODE_MAP.prov_guangdong },
  { value: 'node', label: '单节点监控', kind: 'node', nodeIds: ALL_COMPUTE_NODE_IDS },
];

const PERSPECTIVE_MAP = Object.fromEntries(PERSPECTIVES.map((item) => [item.value, item])) as Record<PerspectiveValue, PerspectiveProfile>;

const perspectiveGroupLabels: Record<PerspectiveKind, string> = {
  global: '第一层：国家级',
  region: '第二层：枢纽层',
  province: '第三层：省/市节点',
  node: '单节点监控',
};

const NODE_META: Record<string, NodeMeta> = {
  BJ_DC1: {
    id: 'BJ_DC1', name: '北京DC-1', region: '北京·亦庄', ip: '10.1.1.11',
    role: '智算数据中心', architecture: 'x86_64 / CUDA 12.4', provider: 'H100 训练池',
    gpuNames: ['GPU-0', 'GPU-1', 'GPU-2', 'GPU-3'], gpuTotals: [80, 80, 80, 80],
    baseCpu: 78, baseMemory: 74, baseBandwidth: 88, layer: 'dc', parentRegion: 'beijing',
  },
  BJ_DC2: {
    id: 'BJ_DC2', name: '北京DC-2', region: '北京·顺义', ip: '10.1.1.12',
    role: '智算数据中心', architecture: 'x86_64 / CUDA 12.2', provider: 'A100 推理池',
    gpuNames: ['GPU-0', 'GPU-1', 'GPU-2', 'GPU-3'], gpuTotals: [80, 80, 80, 80],
    baseCpu: 72, baseMemory: 68, baseBandwidth: 82, layer: 'dc', parentRegion: 'beijing',
  },
  BJ_DC3: {
    id: 'BJ_DC3', name: '北京DC-3', region: '北京·大兴', ip: '10.1.1.13',
    role: '智算数据中心', architecture: 'x86_64 / CUDA 12.0', provider: 'A800 弹性池',
    gpuNames: ['GPU-0', 'GPU-1'], gpuTotals: [80, 80],
    baseCpu: 62, baseMemory: 56, baseBandwidth: 72, layer: 'dc', parentRegion: 'beijing',
  },
  BJ_E1: {
    id: 'BJ_E1', name: '北京边缘-1', region: '北京·海淀', ip: '10.1.2.21',
    role: '边缘推理节点', architecture: 'ARM64 / CUDA 11.8', provider: 'L40S 混合池',
    gpuNames: ['GPU-0', 'GPU-1', 'GPU-2'], gpuTotals: [48, 48, 16],
    baseCpu: 48, baseMemory: 44, baseBandwidth: 58, layer: 'edge', parentRegion: 'beijing',
  },
  BJ_E2: {
    id: 'BJ_E2', name: '北京边缘-2', region: '北京·朝阳', ip: '10.1.2.22',
    role: '边缘推理节点', architecture: 'x86_64 / CUDA 11.8', provider: 'T4 边缘池',
    gpuNames: ['GPU-0', 'GPU-1'], gpuTotals: [16, 16],
    baseCpu: 38, baseMemory: 36, baseBandwidth: 52, layer: 'edge', parentRegion: 'beijing',
  },
  BJ_E3: {
    id: 'BJ_E3', name: '北京边缘-3', region: '北京·通州', ip: '10.1.2.23',
    role: '边缘扩容节点', architecture: 'x86_64 / CUDA 12.0', provider: 'A800 弹性池',
    gpuNames: ['GPU-0', 'GPU-1'], gpuTotals: [48, 48],
    baseCpu: 42, baseMemory: 40, baseBandwidth: 56, layer: 'edge', parentRegion: 'beijing',
  },
  BJ_E4: {
    id: 'BJ_E4', name: '北京边缘-4', region: '北京·丰台', ip: '10.1.2.24',
    role: '边缘推理节点', architecture: 'ARM64 / CUDA 11.8', provider: 'L40S 混合池',
    gpuNames: ['GPU-0', 'GPU-1'], gpuTotals: [16, 16],
    baseCpu: 34, baseMemory: 32, baseBandwidth: 48, layer: 'edge', parentRegion: 'beijing',
  },
  BJ_E5: {
    id: 'BJ_E5', name: '北京边缘-5', region: '北京·石景山', ip: '10.1.2.25',
    role: '边缘扩容节点', architecture: 'x86_64 / CUDA 11.8', provider: 'T4 边缘池',
    gpuNames: ['GPU-0'], gpuTotals: [16],
    baseCpu: 30, baseMemory: 28, baseBandwidth: 44, layer: 'edge', parentRegion: 'beijing',
  },
  SH_DC1: {
    id: 'SH_DC1', name: '上海DC-1', region: '上海·浦东', ip: '10.2.1.11',
    role: '智算数据中心', architecture: 'x86_64 / CUDA 12.4', provider: 'H100 训练池',
    gpuNames: ['GPU-0', 'GPU-1', 'GPU-2', 'GPU-3'], gpuTotals: [80, 80, 80, 80],
    baseCpu: 76, baseMemory: 72, baseBandwidth: 86, layer: 'dc', parentRegion: 'shanghai',
  },
  SH_DC2: {
    id: 'SH_DC2', name: '上海DC-2', region: '上海·嘉定', ip: '10.2.1.12',
    role: '智算数据中心', architecture: 'x86_64 / CUDA 12.2', provider: 'A100 推理池',
    gpuNames: ['GPU-0', 'GPU-1', 'GPU-2'], gpuTotals: [80, 80, 80],
    baseCpu: 68, baseMemory: 64, baseBandwidth: 78, layer: 'dc', parentRegion: 'shanghai',
  },
  SH_E1: {
    id: 'SH_E1', name: '上海边缘-1', region: '上海·闵行', ip: '10.2.2.21',
    role: '边缘推理节点', architecture: 'ARM64 / CUDA 11.8', provider: 'L40S 混合池',
    gpuNames: ['GPU-0', 'GPU-1'], gpuTotals: [48, 48],
    baseCpu: 46, baseMemory: 42, baseBandwidth: 56, layer: 'edge', parentRegion: 'shanghai',
  },
  SH_E2: {
    id: 'SH_E2', name: '上海边缘-2', region: '上海·松江', ip: '10.2.2.22',
    role: '边缘推理节点', architecture: 'x86_64 / CUDA 11.8', provider: 'T4 边缘池',
    gpuNames: ['GPU-0', 'GPU-1'], gpuTotals: [16, 16],
    baseCpu: 36, baseMemory: 34, baseBandwidth: 50, layer: 'edge', parentRegion: 'shanghai',
  },
  SH_E3: {
    id: 'SH_E3', name: '上海边缘-3', region: '上海·宝山', ip: '10.2.2.23',
    role: '边缘扩容节点', architecture: 'x86_64 / CUDA 12.0', provider: 'A800 弹性池',
    gpuNames: ['GPU-0', 'GPU-1'], gpuTotals: [48, 48],
    baseCpu: 40, baseMemory: 38, baseBandwidth: 54, layer: 'edge', parentRegion: 'shanghai',
  },
  GD_DC1: {
    id: 'GD_DC1', name: '广东DC-1', region: '广州·天河', ip: '10.3.1.11',
    role: '智算数据中心', architecture: 'x86_64 / CUDA 12.4', provider: 'H100 训练池',
    gpuNames: ['GPU-0', 'GPU-1', 'GPU-2', 'GPU-3'], gpuTotals: [80, 80, 80, 80],
    baseCpu: 74, baseMemory: 70, baseBandwidth: 84, layer: 'dc', parentRegion: 'guangdong',
  },
  GD_DC2: {
    id: 'GD_DC2', name: '广东DC-2', region: '深圳·南山', ip: '10.3.1.12',
    role: '智算数据中心', architecture: 'x86_64 / CUDA 12.2', provider: 'A100 推理池',
    gpuNames: ['GPU-0', 'GPU-1', 'GPU-2', 'GPU-3'], gpuTotals: [80, 80, 80, 80],
    baseCpu: 70, baseMemory: 66, baseBandwidth: 80, layer: 'dc', parentRegion: 'guangdong',
  },
  GD_DC3: {
    id: 'GD_DC3', name: '广东DC-3', region: '东莞·松山湖', ip: '10.3.1.13',
    role: '智算数据中心', architecture: 'x86_64 / CUDA 12.0', provider: 'A800 弹性池',
    gpuNames: ['GPU-0', 'GPU-1'], gpuTotals: [80, 80],
    baseCpu: 58, baseMemory: 54, baseBandwidth: 70, layer: 'dc', parentRegion: 'guangdong',
  },
  GD_E1: {
    id: 'GD_E1', name: '广东边缘-1', region: '广州·番禺', ip: '10.3.2.21',
    role: '边缘推理节点', architecture: 'ARM64 / CUDA 11.8', provider: 'L40S 混合池',
    gpuNames: ['GPU-0', 'GPU-1'], gpuTotals: [48, 48],
    baseCpu: 44, baseMemory: 40, baseBandwidth: 54, layer: 'edge', parentRegion: 'guangdong',
  },
  GD_E2: {
    id: 'GD_E2', name: '广东边缘-2', region: '深圳·龙华', ip: '10.3.2.22',
    role: '边缘推理节点', architecture: 'x86_64 / CUDA 11.8', provider: 'T4 边缘池',
    gpuNames: ['GPU-0', 'GPU-1'], gpuTotals: [16, 16],
    baseCpu: 38, baseMemory: 36, baseBandwidth: 50, layer: 'edge', parentRegion: 'guangdong',
  },
  GD_E3: {
    id: 'GD_E3', name: '广东边缘-3', region: '佛山·顺德', ip: '10.3.2.23',
    role: '边缘扩容节点', architecture: 'x86_64 / CUDA 12.0', provider: 'A800 弹性池',
    gpuNames: ['GPU-0', 'GPU-1'], gpuTotals: [48, 48],
    baseCpu: 40, baseMemory: 38, baseBandwidth: 52, layer: 'edge', parentRegion: 'guangdong',
  },
  GD_E4: {
    id: 'GD_E4', name: '广东边缘-4', region: '珠海·香洲', ip: '10.3.2.24',
    role: '边缘推理节点', architecture: 'ARM64 / CUDA 11.8', provider: 'L40S 混合池',
    gpuNames: ['GPU-0'], gpuTotals: [16],
    baseCpu: 32, baseMemory: 30, baseBandwidth: 46, layer: 'edge', parentRegion: 'guangdong',
  },
};

const DISK_COLORS = ['#1677ff', '#52c41a', '#faad14', '#722ed1'];
const INITIAL_TIME = dayjs('2026-04-09 00:04:05').valueOf();
const ROLLING_POINTS = 30;
const REPLAY_STEP_SECONDS = 5;
const FORECAST_PAST_POINTS = 10;

type TaskStatus = 'pending' | 'running' | 'completed';
type TaskType = '训练任务' | '推理服务' | '数据预处理' | '联邦聚合' | '弹性迁移';

interface ScheduleTask {
  id: string;
  name: string;
  type: TaskType;
  status: TaskStatus;
  cpu: number;
  memory: number;
  gpu: number;
  targetNodeId?: NodeId;
  matchScore?: number;
  estimatedLatency?: number;
}

const TASK_TYPES: TaskType[] = ['训练任务', '推理服务', '数据预处理', '联邦聚合', '弹性迁移'];
const TASK_TYPE_COLORS: Record<TaskType, string> = {
  '训练任务': 'blue',
  '推理服务': 'purple',
  '数据预处理': 'cyan',
  '联邦聚合': 'geekblue',
  '弹性迁移': 'orange',
};

type ScheduleLogPhase = '感知' | '决策' | '下发' | '监控';

interface ScheduleLogEntry {
  time: string;
  phase: ScheduleLogPhase;
  message: string;
}

const SCHEDULE_LOG_PHASES: Record<string, (task: ScheduleTask) => ScheduleLogEntry[]> = {
  manager: (task) => {
    const nodeName = NODE_META[task.targetNodeId ?? 'BJ_DC1']?.name ?? '未知节点';
    const score = task.matchScore ?? 90;
    const latency = task.estimatedLatency ?? 12;
    return [
      { time: dayjs().format('HH:mm:ss'), phase: '感知', message: `收到新任务: ${task.name} (${task.type})` },
      { time: dayjs().format('HH:mm:ss'), phase: '感知', message: '正在进行算力网络状态拉取与资源检查...' },
      { time: dayjs().format('HH:mm:ss'), phase: '决策', message: `候选节点评估: ${nodeName} 匹配度最高` },
      { time: dayjs().format('HH:mm:ss'), phase: '决策', message: `综合匹配度: ${score}%（预计时延 ${latency}ms）` },
      { time: dayjs().format('HH:mm:ss'), phase: '下发', message: `任务 ${task.name} 正在绑定至 ${nodeName}...` },
      { time: dayjs().format('HH:mm:ss'), phase: '下发', message: `资源预留: CPU ${task.cpu}% / 内存 ${task.memory}GB / GPU ${task.gpu}%` },
      { time: dayjs().format('HH:mm:ss'), phase: '监控', message: '链路就绪，任务流已激活，开始实时监控' },
    ];
  },
  hub_beijing: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '感知', message: `京津冀枢纽收到调度指令: ${task.name}` },
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `当前负载: ${(55 + Math.random() * 20).toFixed(1)}%，队列: ${Math.floor(3 + Math.random() * 8)}` },
  ],
  hub_shanghai: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '感知', message: `长三角枢纽收到调度指令: ${task.name}` },
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `当前负载: ${(50 + Math.random() * 25).toFixed(1)}%，队列: ${Math.floor(2 + Math.random() * 6)}` },
  ],
  hub_guangdong: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '感知', message: `粤港澳枢纽收到调度指令: ${task.name}` },
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `当前负载: ${(48 + Math.random() * 22).toFixed(1)}%，队列: ${Math.floor(2 + Math.random() * 7)}` },
  ],
  hub_chengdu: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '感知', message: `成渝枢纽收到调度指令: ${task.name}` },
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `当前负载: ${(42 + Math.random() * 18).toFixed(1)}%，队列: ${Math.floor(1 + Math.random() * 5)}` },
  ],
  rc_neimenggu: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `内蒙古区域中心: ${(38 + Math.random() * 15).toFixed(1)}%` },
  ],
  rc_zhangjiakou: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `张家口区域中心: ${(36 + Math.random() * 12).toFixed(1)}%` },
  ],
  rc_guizhou: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `贵州区域中心: ${(35 + Math.random() * 12).toFixed(1)}%` },
  ],
  rc_hefei: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `合肥区域中心: ${(33 + Math.random() * 14).toFixed(1)}%` },
  ],
  rc_nanning: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `广西区域中心: ${(30 + Math.random() * 10).toFixed(1)}%` },
  ],
  rc_haikou: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `海南区域中心: ${(28 + Math.random() * 12).toFixed(1)}%` },
  ],
  rc_ningxia: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `宁夏区域中心: ${(32 + Math.random() * 10).toFixed(1)}%` },
  ],
  rc_gansu: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `甘肃区域中心: ${(30 + Math.random() * 14).toFixed(1)}%` },
  ],
};

const createMockTasks = (count: number, startIndex: number): ScheduleTask[] => {
  const statusPool: TaskStatus[] = ['pending', 'pending', 'running', 'running', 'running', 'completed', 'completed'];
  return Array.from({ length: count }, (_, i) => {
    const type = TASK_TYPES[(startIndex + i) % TASK_TYPES.length];
    const status = statusPool[(startIndex + i) % statusPool.length];
    const cpu = round(clamp(20 + Math.sin(startIndex + i) * 15 + Math.random() * 10, 8, 60));
    const memory = round(clamp(16 + Math.cos(startIndex + i) * 12 + Math.random() * 8, 6, 48));
    const gpu = round(clamp(10 + Math.sin(startIndex + i * 1.3) * 8, 2, 40));
    const task: ScheduleTask = {
      id: `T-${String(startIndex + i + 1).padStart(4, '0')}`,
      name: `${type}-${startIndex + i + 1}`,
      type,
      status,
      cpu,
      memory,
      gpu,
    };

    if (status === 'running') {
      task.targetNodeId = ALL_COMPUTE_NODE_IDS[(startIndex + i) % ALL_COMPUTE_NODE_IDS.length];
    } else if (status === 'pending') {
      task.targetNodeId = ALL_COMPUTE_NODE_IDS[(startIndex + i) % ALL_COMPUTE_NODE_IDS.length];
      task.matchScore = round(clamp(78 + Math.sin(startIndex + i * 2.1) * 18, 60, 99));
      task.estimatedLatency = round(clamp(8 + Math.sin(startIndex + i * 1.7) * 6 + cpu * 0.15, 4, 32));
    }

    return task;
  });
};

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
  const seed = meta.id.split('').reduce((s, c) => s + c.charCodeAt(0), 0) / 500;
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
    const nextSample = createNodeSample(meta, tick + meta.id.split('').reduce((s, c) => s + c.charCodeAt(0), 0));
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
  const baseOffset = perspective.kind === 'province' ? 6 : perspective.kind === 'region' ? 4 : 0;

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

const getVisibleNodeIds = (perspective: PerspectiveProfile, selectedNodeId?: NodeId): NodeId[] => (
  perspective.kind === 'node' && selectedNodeId
    ? [selectedNodeId]
    : (perspective.nodeIds as NodeId[]) ?? []
);

const buildKpis = (
  replayMap: Record<NodeId, NodeReplayState>,
  perspective: PerspectiveProfile,
  previous?: GlobalKpis,
): GlobalKpis => {
  const nodes = getVisibleNodeIds(perspective).map((nodeId) => replayMap[nodeId].latest);
  const metas = getVisibleNodeIds(perspective).map((nodeId) => NODE_META[nodeId]);
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

const getNodeStatus = (nodeId: NodeId, tick: number): TopologyNodeStatus => {
  const phase = tick % 24;
  const hash = nodeId.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  if (hash % 7 === 3 && phase >= 8 && phase <= 11) {
    return 'offline';
  }
  if (hash % 11 === 5 && phase >= 15 && phase <= 18) {
    return 'new';
  }
  return 'online';
};

const HUB_META = [
  { id: 'hub_beijing', label: '京津冀枢纽', region: '华北' },
  { id: 'hub_shanghai', label: '长三角枢纽', region: '华东' },
  { id: 'hub_guangdong', label: '粤港澳枢纽', region: '华南' },
  { id: 'hub_chengdu', label: '成渝枢纽', region: '西部' },
];

const REGIONAL_CENTERS = [
  { id: 'rc_neimenggu', label: '内蒙古区域中心', parentHub: 'hub_beijing' },
  { id: 'rc_zhangjiakou', label: '张家口区域中心', parentHub: 'hub_beijing' },
  { id: 'rc_guizhou', label: '贵州区域中心', parentHub: 'hub_shanghai' },
  { id: 'rc_hefei', label: '合肥区域中心', parentHub: 'hub_shanghai' },
  { id: 'rc_nanning', label: '广西区域中心', parentHub: 'hub_guangdong' },
  { id: 'rc_haikou', label: '海南区域中心', parentHub: 'hub_guangdong' },
  { id: 'rc_ningxia', label: '宁夏区域中心', parentHub: 'hub_chengdu' },
  { id: 'rc_gansu', label: '甘肃区域中心', parentHub: 'hub_chengdu' },
];

const buildTopologyPanelData = (
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

const buildFixedForecastOption = (
  metric: ForecastMetric,
  rangeStart: number,
  rangeEnd: number,
  perspective: PerspectiveProfile,
  token: ReturnType<typeof theme.useToken>['token'],
): EChartsOption => {
  const meta = getForecastMeta(metric);
  const durationMs = rangeEnd - rangeStart;
  const forecastMs = durationMs * 0.4;
  const splitMs = rangeEnd - forecastMs;
  const points = Math.max(12, Math.round(durationMs / (5 * 60 * 1000)));
  const baseOffset = perspective.kind === 'province' ? 6 : perspective.kind === 'region' ? 4 : 0;

  const timeline = Array.from({ length: points }, (_, i) => rangeStart + (durationMs * i) / (points - 1));

  const actual = timeline.map((_, i) => round(clamp(
    meta.base + baseOffset + Math.sin(i / 2.6) * 7 + Math.cos(i / 4.5) * 4,
    metric === 'bandwidth' ? 18 : 16,
    metric === 'bandwidth' ? 120 : 95,
  )));

  const predicted = timeline.map((_, i) => round(clamp(
    actual[i] + Math.sin(i / 3.1 + 0.6) * 4,
    metric === 'bandwidth' ? 20 : 18,
    metric === 'bandwidth' ? 125 : 98,
  )));

  const upper = predicted.map((v) => round(v + (metric === 'bandwidth' ? 8 : 6)));
  const lower = predicted.map((v) => round(Math.max(metric === 'bandwidth' ? 10 : 0, v - (metric === 'bandwidth' ? 8 : 6))));
  const band = upper.map((v, i) => round(v - lower[i]));

  const actualData = timeline.map((t, i) => [t, t <= splitMs ? actual[i] : null]);
  const predictData = timeline.map((t, i) => [t, t >= splitMs ? predicted[i] : null]);
  const lowerData = timeline.map((t, i) => [t, t >= splitMs ? lower[i] : null]);
  const bandData = timeline.map((t, i) => [t, t >= splitMs ? band[i] : null]);

  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 0, textStyle: { color: token.colorTextSecondary } },
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
      axisLabel: { color: token.colorTextSecondary, formatter: `{value}${meta.unit}` },
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
          label: { formatter: '预测起点', color: token.colorInfo },
          lineStyle: { color: token.colorInfo, type: 'dashed', width: 1.5 },
          data: [{ xAxis: splitMs }],
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
  const [timeMode, setTimeMode] = useState<TimeMode>('live');
  const [fixedRange, setFixedRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [replayTick, setReplayTick] = useState(120);
  const [virtualTime, setVirtualTime] = useState(INITIAL_TIME);
  const [nodeReplayMap, setNodeReplayMap] = useState<Record<NodeId, NodeReplayState>>(() => createInitialNodeReplay(INITIAL_TIME));
  const [selectedTopologyNode, setSelectedTopologyNode] = useState<TopologyNode | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskQueue, setTaskQueue] = useState<ScheduleTask[]>(() => createMockTasks(10, 0));
  const taskCounterRef = React.useRef(10);
  const [scheduleLogs, setScheduleLogs] = useState<ScheduleLogEntry[]>([]);
  const scheduleLogIndexRef = React.useRef(0);
  const [selectedSingleNodeId, setSelectedSingleNodeId] = useState<NodeId>(ALL_COMPUTE_NODE_IDS[0]);
  const [focusedNodeId, setFocusedNodeId] = useState<NodeId | null>(null);
  const [dbPerspectives, setDbPerspectives] = useState<PerspectiveProfile[] | null>(null);
  const perspectiveProfiles = dbPerspectives ?? PERSPECTIVES;
  const perspectiveMap = useMemo(
    () => Object.fromEntries(perspectiveProfiles.map((item) => [item.value, item])) as Record<PerspectiveValue, PerspectiveProfile>,
    [perspectiveProfiles],
  );
  const currentPerspective = perspectiveMap[perspective] ?? PERSPECTIVE_MAP[perspective] ?? perspectiveProfiles[0] ?? PERSPECTIVES[0];
  const [globalKpis, setGlobalKpis] = useState<GlobalKpis>(() => buildKpis(createInitialNodeReplay(INITIAL_TIME), currentPerspective));
  const [dbGlobalKpis, setDbGlobalKpis] = useState<GlobalKpis | null>(null);
  const [dbLoadTop5, setDbLoadTop5] = useState<Array<{ name: string; value: number; predicted: number }> | null>(null);
  const [dbTaskTypeData, setDbTaskTypeData] = useState<Array<{ name: string; value: number }> | null>(null);
  const [dbTopologyPanelData, setDbTopologyPanelData] = useState<TopologyPanelData | null>(null);
  const warnedModulesRef = React.useRef<Set<string>>(new Set());
  const [forecastReplay, setForecastReplay] = useState<ForecastReplayState>(() => (
    createForecastReplay('cpu', '1h', INITIAL_TIME, currentPerspective)
  ));

  const warnFallback = React.useCallback((moduleName: string) => {
    if (warnedModulesRef.current.has(moduleName)) return;
    warnedModulesRef.current.add(moduleName);
    notification.warning({
      message: `${moduleName}读取失败`,
      description: `已切换为前端演示数据，页面可继续用于演示。`,
      placement: 'topRight',
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    getPerspectives()
      .then((payload) => {
        if (cancelled) return;
        if (payload?.perspectives?.length) {
          setDbPerspectives(payload.perspectives.map((item) => ({
            value: item.value,
            label: item.label,
            kind: item.kind,
            nodeIds: item.nodeIds,
            nodeId: item.node_id ?? undefined,
          })));
        } else {
          warnFallback('层级视角');
        }
      })
      .catch(() => warnFallback('层级视角'));

    return () => {
      cancelled = true;
    };
  }, [warnFallback]);

  const isNodeView = currentPerspective.kind === 'node' || focusedNodeId != null;
  const currentNodeId = focusedNodeId ?? (currentPerspective.kind === 'node' ? selectedSingleNodeId : (currentPerspective.nodeIds?.[0] ?? ALL_COMPUTE_NODE_IDS[0]));
  const currentNodeMeta = NODE_META[currentNodeId] ?? {
    id: currentNodeId,
    name: currentNodeId,
    region: currentPerspective.label,
    ip: '--',
    layer: 'edge' as const,
    role: '算力节点',
    provider: '--',
    architecture: '--',
    gpuNames: [],
  };
  const currentNodeReplay = nodeReplayMap[currentNodeId] ?? nodeReplayMap[ALL_COMPUTE_NODE_IDS[0]];

  useEffect(() => {
    let cancelled = false;
    const viewId = perspective;

    getAllocationKpi(viewId)
      .then((payload) => {
        if (cancelled || !payload || typeof payload.avgDelay !== 'number') return;
        setDbGlobalKpis({
          avgDelay: payload.avgDelay,
          delayDelta: payload.delayDelta,
          loadStd: payload.loadStd,
          loadStdDelta: payload.loadStdDelta,
          successTasks: payload.successTasks,
          successTasksDelta: payload.successTasksDelta,
          avgBandwidth: payload.avgBandwidth,
          avgGpuUsage: payload.avgGpuUsage,
          totalGpuMemory: payload.totalGpuMemory,
        });
      })
      .catch(() => {
        setDbGlobalKpis(null);
        warnFallback('核心运营指标');
      });

    getTopLoad(viewId)
      .then((payload) => {
        if (cancelled) return;
        if (payload?.items?.length) {
          setDbLoadTop5(payload.items);
        } else {
          setDbLoadTop5(null);
          warnFallback('负载率TOP5');
        }
      })
      .catch(() => {
        setDbLoadTop5(null);
        warnFallback('负载率TOP5');
      });

    getTaskTypeStats(viewId)
      .then((payload) => {
        if (cancelled) return;
        if (payload?.items?.length) {
          setDbTaskTypeData(payload.items);
        } else {
          setDbTaskTypeData(null);
          warnFallback('任务类型统计');
        }
      })
      .catch(() => {
        setDbTaskTypeData(null);
        warnFallback('任务类型统计');
      });

    getTopologyView(viewId)
      .then((payload) => {
        if (cancelled) return;
        if (payload?.nodes?.length) {
          setDbTopologyPanelData({
            nodes: payload.nodes as TopologyNode[],
            edges: payload.edges as TopologyEdge[],
            events: payload.events ?? [],
            rerouteCount: payload.rerouteCount ?? 0,
            offlineCount: payload.offlineCount ?? 0,
            newCount: payload.newCount ?? 0,
          });
        } else {
          setDbTopologyPanelData(null);
          warnFallback('拓扑数据');
        }
      })
      .catch(() => {
        setDbTopologyPanelData(null);
        warnFallback('拓扑数据');
      });

    return () => {
      cancelled = true;
    };
  }, [perspective, warnFallback]);

  useEffect(() => {
    setFocusedNodeId(null);
  }, [perspective]);

  useEffect(() => {
    setGlobalKpis((previous) => buildKpis(nodeReplayMap, currentPerspective, previous));
  }, [currentPerspective, nodeReplayMap]);

  useEffect(() => {
    setForecastReplay(createForecastReplay(forecastMetric, granularity, virtualTime, currentPerspective));
  }, [currentPerspective, forecastMetric, granularity, timeMode]);

  useEffect(() => {
    let cancelled = false;
    getDayDemandPrediction()
      .then((payload) => {
        if (cancelled || !payload?.labels?.length) return;
        const meta = getForecastMeta(forecastMetric);
        const now = Date.now();
        const timeline = payload.labels.map((_, index) => now + (index - FORECAST_PAST_POINTS) * 5 * 60 * 1000);
        const actualSource = forecastMetric === 'memory'
          ? payload.memory_actual
          : forecastMetric === 'bandwidth'
            ? payload.bandwidth_actual_mbps?.map((value) => round(value / 1000, 1))
            : payload.cpu_actual;
        const predictedSource = forecastMetric === 'memory'
          ? payload.memory_predicted
          : forecastMetric === 'bandwidth'
            ? payload.bandwidth_predicted_mbps?.map((value) => round(value / 1000, 1))
            : payload.cpu_predicted;
        if (!predictedSource?.length) return;
        const actual = (actualSource?.length ? actualSource : predictedSource).map((value) => round(value));
        const predicted = predictedSource.map((value) => round(value));
        setForecastReplay({
          timeline,
          actual,
          predicted,
          lower: predicted.map((value) => round(Math.max(0, value - 6))),
          upper: predicted.map((value) => round(value + 6)),
          cursor: Math.min(FORECAST_PAST_POINTS, timeline.length - 1),
          unit: meta.unit,
          label: meta.label,
        });
      })
      .catch(() => warnFallback('预测曲线'));
    return () => {
      cancelled = true;
    };
  }, [forecastMetric, granularity, perspective, warnFallback]);

  useEffect(() => {
    setSelectedTopologyNode(null);
  }, [perspective]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      taskCounterRef.current += 1;
      const newTask = createMockTasks(1, taskCounterRef.current - 1)[0];
      setTaskQueue((prev) => {
        const next = [...prev.slice(1), newTask];
        setActiveTaskId((prevId) => (prevId && next.some((t) => t.id === prevId) ? prevId : null));
        return next;
      });
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const selectedId = selectedTopologyNode?.id;
    if (!selectedId) {
      return;
    }

    let cancelled = false;
    getScheduleLogs(selectedId)
      .then((payload) => {
        if (cancelled) return;
        if (payload?.logs?.length) {
          setScheduleLogs(payload.logs.map((item) => ({
            time: item.time,
            phase: item.phase as ScheduleLogPhase,
            message: item.message,
          })));
        } else if (!SCHEDULE_LOG_PHASES[selectedId]) {
          setScheduleLogs([]);
          warnFallback('调度日志');
        }
      })
      .catch(() => {
        if (!SCHEDULE_LOG_PHASES[selectedId]) {
          setScheduleLogs([]);
        }
        warnFallback('调度日志');
      });

    if (!SCHEDULE_LOG_PHASES[selectedId]) {
      return () => {
        cancelled = true;
      };
    }

    const generator = SCHEDULE_LOG_PHASES[selectedId];
    const timer = window.setInterval(() => {
      const pendingTasks = taskQueue.filter((t) => t.status === 'pending');
      const task = pendingTasks.length > 0
        ? pendingTasks[scheduleLogIndexRef.current % pendingTasks.length]
        : taskQueue[0];
      if (!task) return;
      scheduleLogIndexRef.current += 1;
      const entries = generator(task);
      setScheduleLogs((prev) => [...prev.slice(-30), ...entries]);
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedTopologyNode, taskQueue, warnFallback]);

  // 数据回放逻辑：每 3 秒推进 5 秒，微调 KPI、滚动单节点曲线、推进预测面板的 Now 标记线
  useEffect(() => {
    const timer = window.setInterval(() => {
      setReplayTick((previousTick) => {
        const nextTick = previousTick + 1;

        setVirtualTime((previousTime) => {
          const nextVirtualTime = dayjs(previousTime).add(REPLAY_STEP_SECONDS, 'second').valueOf();
          setNodeReplayMap((previous) => advanceNodeReplay(previous, nextVirtualTime, nextTick));
          if (timeMode === 'live') {
            setForecastReplay((previous) => advanceForecastReplay(previous, forecastMetric, granularity, nextVirtualTime, currentPerspective));
          }
          return nextVirtualTime;
        });

        return nextTick;
      });
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [currentPerspective, forecastMetric, granularity]);

  const visibleNodeIds = useMemo(
    () => getVisibleNodeIds(currentPerspective, selectedSingleNodeId).filter((nodeId) => Boolean(nodeReplayMap[nodeId])),
    [currentPerspective, selectedSingleNodeId, nodeReplayMap],
  );
  const activeTask = useMemo(() => taskQueue.find((t) => t.id === activeTaskId), [taskQueue, activeTaskId]);

  const mockTopologyPanelData = useMemo(
    () => buildTopologyPanelData(nodeReplayMap, currentPerspective, replayTick, activeTask),
    [currentPerspective, nodeReplayMap, replayTick, activeTask],
  );
  const topologyPanelData = dbTopologyPanelData ?? mockTopologyPanelData;
  const topologyCanvasHeight = useMemo(() => {
    if (topologyPanelData.nodes.length === 0) return 400;
    const maxY = Math.max(...topologyPanelData.nodes.map((n) => n.y ?? 0));
    const maxNodeSize = Math.max(...topologyPanelData.nodes.map((n) => n.size ?? 50));
    return clamp(maxY + maxNodeSize + 60, 400, 780);
  }, [topologyPanelData.nodes]);

  const mockLoadTop5 = useMemo(() => (
    visibleNodeIds
      .map((nodeId) => {
        const sample = nodeReplayMap[nodeId].latest;
        const seed = nodeId.split('').reduce((s, c) => s + c.charCodeAt(0), 0) / 500;
        const predicted = round(clamp(
          sample.cpu + Math.sin(replayTick / 2.6 + seed) * 7 + 3,
          8,
          99,
        ));
        return {
          name: NODE_META[nodeId].name,
          value: sample.cpu,
          predicted,
        };
      })
      .sort((left, right) => right.value - left.value)
      .slice(0, 5)
  ), [nodeReplayMap, visibleNodeIds, replayTick]);
  const loadTop5 = dbLoadTop5 ?? mockLoadTop5;

  const mockTaskTypeData = useMemo(() => {
    const avgLoad = visibleNodeIds.reduce((sum, nodeId) => sum + nodeReplayMap[nodeId].latest.cpu, 0) / Math.max(visibleNodeIds.length, 1);
    return [
      { name: '训练任务', value: round(26 + avgLoad * 0.24) },
      { name: '推理服务', value: round(22 + avgLoad * 0.21) },
      { name: '数据预处理', value: round(16 + avgLoad * 0.11) },
      { name: '联邦聚合', value: round(12 + avgLoad * 0.08) },
      { name: '弹性迁移', value: round(8 + avgLoad * 0.05) },
    ];
  }, [nodeReplayMap, visibleNodeIds]);
  const taskTypeData = dbTaskTypeData ?? mockTaskTypeData;
  const displayGlobalKpis = dbGlobalKpis ?? globalKpis;

  const cpuOption = useMemo(() => buildNodeLineOption('最近60秒 CPU利用率', currentNodeReplay.cpuSeries, token.colorPrimary, token), [currentNodeReplay.cpuSeries, token]);
  const memoryOption = useMemo(() => buildNodeLineOption('最近60秒 内存利用率', currentNodeReplay.memorySeries, token.colorSuccess, token), [currentNodeReplay.memorySeries, token]);
  const gpuOption = useMemo(() => buildGpuOption(currentNodeMeta, currentNodeReplay.latest, token), [currentNodeMeta, currentNodeReplay.latest, token]);
  const forecastOption = useMemo(() => {
    if (timeMode === 'fixed' && fixedRange) {
      return buildFixedForecastOption(forecastMetric, fixedRange[0].valueOf(), fixedRange[1].valueOf(), currentPerspective, token);
    }
    return buildForecastOption(forecastReplay, token);
  }, [timeMode, fixedRange, forecastMetric, currentPerspective, forecastReplay, token]);
  const selectedTopologyData = (selectedTopologyNode?.data ?? {}) as Record<string, string>;
  const selectableNodeIds = useMemo(() => {
    const dbNodeIds = perspectiveProfiles.find((item) => item.kind === 'node')?.nodeIds ?? [];
    return dbNodeIds.length > 0 ? dbNodeIds : ALL_COMPUTE_NODE_IDS;
  }, [perspectiveProfiles]);
  const perspectiveSelectOptions = useMemo(() => (
    (['global', 'region', 'province', 'node'] as PerspectiveKind[])
      .map((kind) => ({
        label: perspectiveGroupLabels[kind],
        options: perspectiveProfiles
          .filter((item) => item.kind === kind)
          .map((item) => ({ label: item.label, value: item.value })),
      }))
      .filter((group) => group.options.length > 0)
  ), [perspectiveProfiles]);

  useEffect(() => {
    if (selectableNodeIds.length > 0 && !selectableNodeIds.includes(selectedSingleNodeId)) {
      setSelectedSingleNodeId(selectableNodeIds[0]);
    }
  }, [selectableNodeIds, selectedSingleNodeId]);

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
              options={perspectiveSelectOptions}
            />
          </div>

          {perspective === 'node' && (
            <div className="prediction-allocation-toolbar-block">
              <Text type="secondary">选择节点</Text>
              <Select
                value={selectedSingleNodeId}
                style={{ width: 200 }}
                onChange={(value) => setSelectedSingleNodeId(value)}
                options={selectableNodeIds.map((id) => ({
                  label: NODE_META[id] ? `${NODE_META[id].name}（${NODE_META[id].region}）` : id,
                  value: id,
                }))}
                showSearch
                optionFilterProp="label"
              />
            </div>
          )}

          {(currentPerspective.kind === 'province' || currentPerspective.kind === 'region') && (
            <div className="prediction-allocation-toolbar-block">
              <Text type="secondary">聚焦节点</Text>
              <Select
                value={focusedNodeId}
                style={{ width: 220 }}
                placeholder="选择节点查看详情"
                allowClear
                onChange={(value) => setFocusedNodeId(value ?? null)}
                options={(currentPerspective.nodeIds ?? []).map((id) => ({
                  label: NODE_META[id] ? `${NODE_META[id].name}（${NODE_META[id].layer === 'dc' ? 'DC' : '边缘'}）` : id,
                  value: id,
                }))}
                showSearch
                optionFilterProp="label"
              />
            </div>
          )}

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

          <div className="prediction-allocation-toolbar-block">
            <Text type="secondary">数据模式</Text>
            <Radio.Group
              value={timeMode}
              optionType="button"
              buttonStyle="solid"
              onChange={(event) => setTimeMode(event.target.value as TimeMode)}
              options={[
                { label: '实时回放', value: 'live' },
                { label: '固定时段', value: 'fixed' },
              ]}
            />
          </div>

          {timeMode === 'fixed' && (
            <div className="prediction-allocation-toolbar-block">
              <Text type="secondary">选择时段</Text>
              <DatePicker.RangePicker
                showTime
                value={fixedRange}
                onChange={(dates) => {
                  if (dates && dates[0] && dates[1]) {
                    setFixedRange([dates[0], dates[1]]);
                  } else {
                    setFixedRange(null);
                  }
                }}
                style={{ width: 380 }}
              />
            </div>
          )}

          <Tag color="blue" className="prediction-allocation-now-tag">
            当前虚拟时间：{dayjs(virtualTime).format('YYYY-MM-DD HH:mm:ss')}
          </Tag>
        </Space>
      </Card>

      {!isNodeView ? (
        <Card title="算力资源分配结果面板" extra={<Badge status="processing" text={currentPerspective.label} />}>
          <div className="prediction-allocation-overview-row">
            <Card size="small" className="prediction-allocation-overview-kpi" title="核心运营指标">
              <div className="prediction-allocation-kpi-list">
                <div className="prediction-allocation-kpi-item">
                  <Text type="secondary" className="prediction-allocation-kpi-label">平均任务处理延迟</Text>
                  <div className="prediction-allocation-kpi-value">
                    <span style={{ color: trendColor(displayGlobalKpis.delayDelta, true) }}>
                      {displayGlobalKpis.delayDelta <= 0 ? <ArrowDownOutlined /> : <ArrowUpOutlined />}
                      {' '}{displayGlobalKpis.avgDelay}<Text type="secondary" style={{ fontSize: 12, marginLeft: 2 }}>ms</Text>
                    </span>
                    <Text style={{ fontSize: 12, color: trendColor(displayGlobalKpis.delayDelta, true) }}>(Δ{displayGlobalKpis.delayDelta})</Text>
                  </div>
                </div>
                <div className="prediction-allocation-kpi-item">
                  <Text type="secondary" className="prediction-allocation-kpi-label">系统负载均衡度</Text>
                  <div className="prediction-allocation-kpi-value">
                    <span style={{ color: trendColor(displayGlobalKpis.loadStdDelta, true) }}>
                      {displayGlobalKpis.loadStdDelta <= 0 ? <ArrowDownOutlined /> : <ArrowUpOutlined />}
                      {' '}{displayGlobalKpis.loadStd}<Text type="secondary" style={{ fontSize: 12, marginLeft: 2 }}>σ</Text>
                    </span>
                    <Text style={{ fontSize: 12, color: trendColor(displayGlobalKpis.loadStdDelta, true) }}>(Δ{displayGlobalKpis.loadStdDelta})</Text>
                  </div>
                </div>
                <div className="prediction-allocation-kpi-item">
                  <Text type="secondary" className="prediction-allocation-kpi-label">成功处理任务数</Text>
                  <div className="prediction-allocation-kpi-value">
                    <span style={{ color: trendColor(displayGlobalKpis.successTasksDelta) }}>
                      {displayGlobalKpis.successTasksDelta >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                      {' '}{displayGlobalKpis.successTasks}
                    </span>
                    <Text style={{ fontSize: 12, color: trendColor(displayGlobalKpis.successTasksDelta) }}>(+{displayGlobalKpis.successTasksDelta})</Text>
                  </div>
                </div>
                <div className="prediction-allocation-kpi-divider" />
                <div className="prediction-allocation-kpi-item">
                  <Text type="secondary" className="prediction-allocation-kpi-label">平均带宽利用率</Text>
                  <div className="prediction-allocation-kpi-value">
                    <span>{displayGlobalKpis.avgBandwidth}<Text type="secondary" style={{ fontSize: 12, marginLeft: 2 }}>Gbps</Text></span>
                  </div>
                </div>
                <div className="prediction-allocation-kpi-item">
                  <Text type="secondary" className="prediction-allocation-kpi-label">平均 GPU 利用率</Text>
                  <div className="prediction-allocation-kpi-value">
                    <span>{displayGlobalKpis.avgGpuUsage}<Text type="secondary" style={{ fontSize: 12, marginLeft: 2 }}>%</Text></span>
                  </div>
                </div>
                <div className="prediction-allocation-kpi-item">
                  <Text type="secondary" className="prediction-allocation-kpi-label">GPU 显存总量</Text>
                  <div className="prediction-allocation-kpi-value">
                    <span>{displayGlobalKpis.totalGpuMemory}<Text type="secondary" style={{ fontSize: 12, marginLeft: 2 }}>GB</Text></span>
                  </div>
                </div>
              </div>
            </Card>

            <Card size="small" className="prediction-allocation-overview-chart" title="负载率 TOP 5">
              <ReactECharts
                style={{ height: 220 }}
                notMerge
                lazyUpdate
                option={{
                  tooltip: { trigger: 'axis' },
                  legend: { bottom: 0, textStyle: { fontSize: 11 } },
                  grid: { top: 12, right: 20, bottom: 32, left: 80 },
                  xAxis: { type: 'value', max: 100 },
                  yAxis: { type: 'category', data: loadTop5.map((item) => item.name) },
                  series: [
                    {
                      name: '当前负载',
                      type: 'bar',
                      data: loadTop5.map((item) => item.value),
                      itemStyle: { color: token.colorPrimary, borderRadius: [0, 6, 6, 0] },
                      barMaxWidth: 18,
                    },
                    {
                      name: '预测负载',
                      type: 'bar',
                      data: loadTop5.map((item) => item.predicted),
                      itemStyle: { color: 'transparent', borderColor: token.colorWarning, borderWidth: 1.5, borderType: 'dashed', borderRadius: [0, 6, 6, 0] },
                      barMaxWidth: 18,
                    },
                  ],
                }}
              />
            </Card>

            <Card size="small" className="prediction-allocation-overview-chart" title="任务分配类型占比">
              <PieChart data={taskTypeData} height={220} />
            </Card>
          </div>

          <Card
            title="算力网络协同分配拓扑"
            className="prediction-allocation-topology-panel"
            style={{ marginTop: 16 }}
            extra={(
              <Space size={8} wrap>
                <Tag color="green">实心圆：当前负载</Tag>
                <Tag color="gold">虚线环：10分钟预测</Tag>
                <Tag color="blue">实线流光：执行中</Tag>
                <Tag color="orange">虚线箭头：预测重定向</Tag>
              </Space>
            )}
          >
            <div className="prediction-allocation-topology-workspace">
              <div className="prediction-allocation-topology-stage">
                <TopologyGraph
                  height={topologyCanvasHeight}
                  nodes={topologyPanelData.nodes}
                  edges={topologyPanelData.edges}
                  layoutType="dagre"
                  showCard={false}
                  variant="predictive"
                  disableZoom
                  selectedNodeId={selectedTopologyNode?.id}
                  onNodeSelect={setSelectedTopologyNode}
                />
              </div>

              <Card
                size="small"
                title={
                  selectedTopologyNode
                    ? SCHEDULE_LOG_PHASES[selectedTopologyNode.id]
                      ? `${selectedTopologyNode.label} · 调度日志`
                      : `节点详情 · ${selectedTopologyNode.label}`
                    : '拓扑说明'
                }
                className="prediction-allocation-topology-info"
              >
                {selectedTopologyNode && SCHEDULE_LOG_PHASES[selectedTopologyNode.id] ? (
                  <div className="prediction-allocation-log-panel">
                    <div className="prediction-allocation-log-stream" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
                      {scheduleLogs.length > 0 ? scheduleLogs.map((log, idx) => (
                        <div key={idx} className="prediction-allocation-log-line">
                          <Text type="secondary" className="prediction-allocation-log-time">[{log.time}]</Text>
                          <Tag
                            color={log.phase === '感知' ? 'blue' : log.phase === '决策' ? 'gold' : log.phase === '下发' ? 'orange' : 'green'}
                            className="prediction-allocation-log-phase"
                          >
                            {log.phase}
                          </Tag>
                          <Text className="prediction-allocation-log-msg">{log.message}</Text>
                        </div>
                      )) : (
                        <Text type="secondary">等待调度日志...</Text>
                      )}
                    </div>
                    <div className="prediction-allocation-log-footer">
                      <Tag bordered={false} color="blue">感知</Tag>
                      <Tag bordered={false} color="gold">决策</Tag>
                      <Tag bordered={false} color="orange">下发</Tag>
                      <Tag bordered={false} color="green">监控</Tag>
                    </div>
                  </div>
                ) : selectedTopologyNode ? (
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <div className="prediction-allocation-tag-list">
                      <Tag color={selectedTopologyData.statusText === 'offline' ? 'error' : selectedTopologyData.statusText === 'new' ? 'success' : 'processing'}>
                        {selectedTopologyData.statusText ?? 'online'}
                      </Tag>
                      <Tag color="blue">当前 {selectedTopologyData.currentLoad ?? '--'}</Tag>
                      <Tag color="gold">预测 {selectedTopologyData.predictedLoad ?? '--'}</Tag>
                    </div>

                    <Descriptions
                      bordered
                      size="small"
                      column={1}
                      items={[
                        { key: 'id', label: '节点 ID', children: selectedTopologyData.id ?? selectedTopologyNode.id },
                        { key: 'role', label: '角色', children: selectedTopologyData.role ?? selectedTopologyNode.subtitle ?? '--' },
                        { key: 'region', label: '区域', children: selectedTopologyData.region ?? '--' },
                        { key: 'ip', label: 'IP', children: selectedTopologyData.ip ?? '--' },
                        { key: 'provider', label: '算力池', children: selectedTopologyData.provider ?? '--' },
                        { key: 'bandwidth', label: '带宽', children: selectedTopologyData.bandwidth ?? '--' },
                        { key: 'latency', label: '时延', children: selectedTopologyData.latency ?? '--' },
                      ]}
                    />

                    {(() => {
                      const nodeId = (selectedTopologyData.id ?? selectedTopologyNode.id) as NodeId;
                      const nodeTasks = taskQueue.filter((t) => t.targetNodeId === nodeId && t.status === 'running');
                      if (nodeTasks.length === 0) return null;
                      return (
                        <div className="prediction-allocation-task-section">
                          <Text strong style={{ fontSize: 13 }}>执行中任务 ({nodeTasks.length})</Text>
                          <div className="prediction-allocation-task-list">
                            {nodeTasks.map((task) => (
                              <div key={task.id} className="prediction-allocation-task-item">
                                <div className="prediction-allocation-task-head">
                                  <Tag color={TASK_TYPE_COLORS[task.type]} style={{ margin: 0 }}>{task.type}</Tag>
                                  <Text strong style={{ fontSize: 12 }}>{task.name}</Text>
                                </div>
                                <div className="prediction-allocation-task-res">
                                  <Text type="secondary" style={{ fontSize: 11 }}>CPU {task.cpu}%</Text>
                                  <Text type="secondary" style={{ fontSize: 11 }}>内存 {task.memory}GB</Text>
                                  <Text type="secondary" style={{ fontSize: 11 }}>GPU {task.gpu}%</Text>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </Space>
                ) : (
                  <Space direction="vertical" size={14} style={{ width: '100%' }}>
                    <div className="prediction-allocation-tag-list">
                      <Tag color="green">当前健康</Tag>
                      <Tag color="gold">预测预警</Tag>
                      <Tag color="error">节点离线</Tag>
                      <Tag color="success">新接入节点</Tag>
                    </div>

                    <Descriptions
                      bordered
                      size="small"
                      column={1}
                      items={[
                        { key: '1', label: '交互方式', children: '悬浮查看摘要，点击节点查看详情，滚轮只用于整页滚动。' },
                        { key: '2', label: '预测表达', children: '外层虚线环越大，表示未来 10 分钟预测负载越高。' },
                        { key: '3', label: '调度表达', children: '虚线箭头表示策略代理提前规划任务重定向。' },
                        { key: '4', label: '动态网络', children: '灰色节点为离线保位，绿色标签节点表示新接入资源。' },
                      ]}
                    />

                    <div className="prediction-allocation-event-list">
                      {topologyPanelData.events.map((event) => (
                        <div key={event.title} className="prediction-allocation-event-item">
                          <div>
                            <div className="prediction-allocation-event-title">{event.title}</div>
                            <Text type="secondary">{event.description}</Text>
                          </div>
                          <Tag color={event.color}>{event.color}</Tag>
                        </div>
                      ))}
                    </div>

                    <div className="prediction-allocation-tag-list">
                      <Tag bordered={false} color="blue">重定向 {topologyPanelData.rerouteCount}</Tag>
                      <Tag bordered={false} color={topologyPanelData.offlineCount > 0 ? 'error' : 'default'}>离线 {topologyPanelData.offlineCount}</Tag>
                      <Tag bordered={false} color={topologyPanelData.newCount > 0 ? 'success' : 'default'}>新接入 {topologyPanelData.newCount}</Tag>
                    </div>
                  </Space>
                )}
              </Card>
            </div>
          </Card>
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
        title={timeMode === 'fixed' && fixedRange
          ? `算力资源服务需求预测面板（固定时段：${fixedRange[0].format('YYYY-MM-DD HH:mm')} ~ ${fixedRange[1].format('YYYY-MM-DD HH:mm')}）`
          : '算力资源服务需求预测面板'}
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
