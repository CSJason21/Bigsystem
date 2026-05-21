import api from '@/services/api';

export type DayPredictionResponse = {
  period: 'daily';
  labels: string[];
  cpu_actual: number[];
  cpu_predicted: number[];
  gpu_actual?: number[];
  gpu_predicted?: number[];
  memory_actual?: number[];
  memory_predicted?: number[];
  bandwidth_actual_mbps?: number[];
  bandwidth_predicted_mbps?: number[];
  running_tasks?: number[];
  updated_at: number;
};

export type MonthPredictionResponse = {
  period: 'monthly';
  labels: string[];
  gpu_predicted: number[];
  storage_predicted: number[];
  bandwidth_predicted_mbps?: number[];
  avg_wait_time_sec?: number[];
  memory_predicted?: number[];
  updated_at: number;
};

export type AllocationResult = {
  id: string;
  task: string;
  node: string;
  cpu: number;
  memory: number;
  gpu: number;
  score: number;
  job_id?: string;
  task_id?: string;
  source_node_id?: string;
  source_ip?: string;
  target_node_id?: string;
  target_ip?: string;
  qos?: string;
  gpu_type?: string;
  allocated_cpu?: number;
  allocated_gpu?: number;
  allocated_memory_gb?: number;
  allocated_bandwidth_mbps?: number;
  allocated_storage_gb?: number;
  wait_time_sec?: number;
  estimated_finish_time_sec?: number;
  load_balance_score?: number;
  queue_level?: string;
};

export type AllocationResultsResponse = {
  results: AllocationResult[];
  updated_at: number;
};

export type StrategyComparisonResponse = {
  xData: string[];
  avg_completion_time: number[];
  resource_utilization: number[];
  updated_at: number;
};

export type NodeSummary = {
  node_id: string;
  hostname: string;
  ip: string;
  status: string;
  cpu: number;
  memory: number;
  disk: number;
  gpu: number;
  process_count: number;
  port_count: number;
  host_count: number;
  rack_id?: string;
  zone?: string;
  gpu_model?: string;
  cpu_capacity_cores?: number;
  memory_capacity_gb?: number;
  gpu_capacity?: number;
};

export type NodeListResponse = {
  nodes: NodeSummary[];
  updated_at: number;
};

export type NodeDashboardResponse = {
  node_id: string;
  // CPU 利用率（%）
  cpu_total_usage: number;
  cpu_system_usage: number;
  cpu_user_usage: number;
  // GPU 利用率（%）
  gpu_usage: number;
  // 显存容量（GB）
  gpu_memory_total_gb: number;
  gpu_memory_used_gb: number;
  // 内存利用率与容量（% + GB）
  memory_usage_percent: number;
  memory_total_gb: number;
  memory_used_gb: number;
  // 硬盘容量（GB）
  disk_total_gb: number;
  disk_used_gb: number;
  disk_available_gb: number;
  updated_at: number;
};

export type NodeHistoryResponse = {
  node_id: string;
  period: string;
  labels: string[];
  // CPU 利用率（%）
  cpu_system_usage: number[];
  cpu_user_usage: number[];
  // 兼容字段：总 CPU 利用率（%）
  cpu_usage: number[];
  // GPU 利用率（%）
  gpu_usage: number[];
  // 内存利用率（%）
  memory_usage: number[];
  updated_at: number;
};

export type NodesOverviewResponse = {
  process_total: number;
  port_total: number;
  host_total: number;
  top_nodes: Array<{
    node_id: string;
    hostname: string;
    process_count: number;
    port_count: number;
  }>;
  updated_at: number;
};

export type TrafficSankeyResponse = {
  sankey: {
    nodes: Array<{ name: string }>;
    links: Array<{ source: string; target: string; value: number }>;
  };
  protocol_pie: Array<{ name: string; value: number }>;
  updated_at: number;
};

export type TrafficLineSeries = {
  name: string;
  data: number[];
  color: string;
};

export type TrafficLinesResponse = {
  labels: string[]; 
  series: TrafficLineSeries[];
  period?: string;
  updated_at: number;
};

export type PerspectiveResponse = {
  perspectives: Array<{
    value: string;
    label: string;
    kind: 'global' | 'region' | 'province' | 'node';
    region_id?: string | null;
    node_id?: string | null;
    nodeIds?: string[];
    is_default?: boolean;
  }>;
  updated_at: number;
};

export type AllocationKpiResponse = {
  avgDelay: number;
  delayDelta: number;
  loadStd: number;
  loadStdDelta: number;
  successTasks: number;
  successTasksDelta: number;
  avgBandwidth: number;
  avgGpuUsage: number;
  totalGpuMemory: number;
  updated_at?: number;
};

export type TopLoadResponse = {
  items: Array<{ name: string; value: number; predicted: number }>;
  updated_at: number;
};

export type TaskTypeStatsResponse = {
  items: Array<{ name: string; value: number }>;
  updated_at: number;
};

export type TopologyViewResponse = {
  nodes: any[];
  edges: any[];
  events: Array<{ title: string; description: string; color: string }>;
  rerouteCount: number;
  offlineCount: number;
  newCount: number;
  updated_at: number;
};

export type ScheduleLogsResponse = {
  logs: Array<{ time: string; phase: string; message: string; severity?: string }>;
  updated_at: number;
};

export type ActiveTasksResponse = {
  tasks: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    targetNodeId?: string;
    matchScore?: number;
    estimatedLatency?: number;
    cpu: number;
    memory: number;
    gpu: number;
  }>;
  updated_at: number;
};

// 注意：api.ts 的响应拦截器会返回 response.data，因此运行时这里得到的是“纯数据对象”，
// 但 axios 的类型不会自动跟随拦截器。为消除 TS 的 AxiosResponse 误判，这里做类型断言。
export const getDayDemandPrediction = async (): Promise<DayPredictionResponse> =>
  (await api.get<DayPredictionResponse>('/prediction/daily')) as unknown as DayPredictionResponse;

export const getMonthDemandPrediction = async (): Promise<MonthPredictionResponse> =>
  (await api.get<MonthPredictionResponse>('/prediction/monthly')) as unknown as MonthPredictionResponse;

export const getAllocationResults = async (): Promise<AllocationResultsResponse> =>
  (await api.get<AllocationResultsResponse>('/allocation/results')) as unknown as AllocationResultsResponse;

export const getStrategyComparison = async (): Promise<StrategyComparisonResponse> =>
  (await api.get<StrategyComparisonResponse>('/allocation/strategy-comparison')) as unknown as StrategyComparisonResponse;

export const getNodes = async (): Promise<NodeListResponse> =>
  (await api.get<NodeListResponse>('/allocation/nodes')) as unknown as NodeListResponse;

export const getNodesOverview = async (): Promise<NodesOverviewResponse> =>
  (await api.get<NodesOverviewResponse>('/allocation/nodes/overview')) as unknown as NodesOverviewResponse;

export const getNodeDashboard = async (nodeId: string): Promise<NodeDashboardResponse> =>
  (await api.get<NodeDashboardResponse>(`/allocation/nodes/${nodeId}/dashboard`)) as unknown as NodeDashboardResponse;

export const getNodeHistory = async (
  nodeId: string,
  period: string = '1h',
): Promise<NodeHistoryResponse> =>
  (await api.get<NodeHistoryResponse>(`/allocation/nodes/${nodeId}/history`, { params: { period } })) as unknown as NodeHistoryResponse;

export const getTrafficSankey = async (): Promise<TrafficSankeyResponse> =>
  (await api.get<TrafficSankeyResponse>('/allocation/traffic/sankey')) as unknown as TrafficSankeyResponse;

export const getTrafficLines = async (period: string = '6h'): Promise<TrafficLinesResponse> =>
  (await api.get<TrafficLinesResponse>('/allocation/traffic/lines', { params: { period } })) as unknown as TrafficLinesResponse;

export const getPerspectives = async (): Promise<PerspectiveResponse> =>
  (await api.get<PerspectiveResponse>('/allocation/perspectives')) as unknown as PerspectiveResponse;

export const getAllocationKpi = async (viewId: string): Promise<AllocationKpiResponse> =>
  (await api.get<AllocationKpiResponse>('/allocation/kpi', { params: { view_id: viewId } })) as unknown as AllocationKpiResponse;

export const getTopLoad = async (viewId: string): Promise<TopLoadResponse> =>
  (await api.get<TopLoadResponse>('/allocation/top-load', { params: { view_id: viewId } })) as unknown as TopLoadResponse;

export const getTaskTypeStats = async (viewId: string): Promise<TaskTypeStatsResponse> =>
  (await api.get<TaskTypeStatsResponse>('/allocation/task-type-stats', { params: { view_id: viewId } })) as unknown as TaskTypeStatsResponse;

export const getTopologyView = async (viewId: string): Promise<TopologyViewResponse> =>
  (await api.get<TopologyViewResponse>('/allocation/topology/view', { params: { view_id: viewId } })) as unknown as TopologyViewResponse;

export const getScheduleLogs = async (vertexId: string): Promise<ScheduleLogsResponse> =>
  (await api.get<ScheduleLogsResponse>('/allocation/schedule/logs', { params: { vertex_id: vertexId } })) as unknown as ScheduleLogsResponse;

export const getActiveTasks = async (nodeId: string): Promise<ActiveTasksResponse> =>
  (await api.get<ActiveTasksResponse>('/allocation/tasks/active', { params: { node_id: nodeId } })) as unknown as ActiveTasksResponse;

