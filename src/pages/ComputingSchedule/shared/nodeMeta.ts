export type NodeId = string;
export type PerspectiveValue = string;
export type PerspectiveKind = 'global' | 'region' | 'province';

export interface PerspectiveProfile {
  value: PerspectiveValue;
  label: string;
  kind: PerspectiveKind;
  nodeIds?: NodeId[];
  nodeId?: NodeId;
}

export interface NodeMeta {
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

export const ALL_COMPUTE_NODE_IDS: NodeId[] = [
  'BJ_DC1', 'BJ_DC2', 'BJ_DC3',
  'BJ_E1', 'BJ_E2', 'BJ_E3', 'BJ_E4', 'BJ_E5',
  'SH_DC1', 'SH_DC2',
  'SH_E1', 'SH_E2', 'SH_E3',
  'GD_DC1', 'GD_DC2', 'GD_DC3',
  'GD_E1', 'GD_E2', 'GD_E3', 'GD_E4',
];

export const PROVINCE_NODE_MAP: Record<string, NodeId[]> = {
  prov_beijing: ['BJ_DC1', 'BJ_DC2', 'BJ_DC3', 'BJ_E1', 'BJ_E2', 'BJ_E3', 'BJ_E4', 'BJ_E5'],
  prov_shanghai: ['SH_DC1', 'SH_DC2', 'SH_E1', 'SH_E2', 'SH_E3'],
  prov_guangdong: ['GD_DC1', 'GD_DC2', 'GD_DC3', 'GD_E1', 'GD_E2', 'GD_E3', 'GD_E4'],
};

export const REGION_NODE_MAP: Record<string, NodeId[]> = {
  region_beijing: ['BJ_DC1', 'BJ_DC2', 'BJ_DC3', 'BJ_E1', 'BJ_E2', 'BJ_E3', 'BJ_E4', 'BJ_E5'],
  region_shanghai: ['SH_DC1', 'SH_DC2', 'SH_E1', 'SH_E2', 'SH_E3'],
  region_guangdong: ['GD_DC1', 'GD_DC2', 'GD_DC3', 'GD_E1', 'GD_E2', 'GD_E3', 'GD_E4'],
};

export const PERSPECTIVES: PerspectiveProfile[] = [
  { value: 'global', label: '全国算力调度大盘', kind: 'global', nodeIds: ALL_COMPUTE_NODE_IDS },
  { value: 'region_beijing', label: '京津冀枢纽区域', kind: 'region', nodeIds: REGION_NODE_MAP.region_beijing },
  { value: 'region_shanghai', label: '长三角枢纽区域', kind: 'region', nodeIds: REGION_NODE_MAP.region_shanghai },
  { value: 'region_guangdong', label: '粤港澳枢纽区域', kind: 'region', nodeIds: REGION_NODE_MAP.region_guangdong },
  { value: 'prov_beijing', label: '北京省级节点', kind: 'province', nodeIds: PROVINCE_NODE_MAP.prov_beijing },
  { value: 'prov_shanghai', label: '上海省级节点', kind: 'province', nodeIds: PROVINCE_NODE_MAP.prov_shanghai },
  { value: 'prov_guangdong', label: '广东省级节点', kind: 'province', nodeIds: PROVINCE_NODE_MAP.prov_guangdong },
];

export const PERSPECTIVE_MAP = Object.fromEntries(PERSPECTIVES.map((item) => [item.value, item])) as Record<PerspectiveValue, PerspectiveProfile>;

export const perspectiveGroupLabels: Record<PerspectiveKind, string> = {
  global: '第一层：国家级',
  region: '第二层：枢纽层',
  province: '第三层：省/市节点',
};

export const NODE_META: Record<string, NodeMeta> = {
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
