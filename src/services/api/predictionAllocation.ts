import api from '@/services/api';

export type AllocationTopologyDataSource = 'auto' | 'db' | 'json';

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
  source?: string;
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
  source?: string;
};

export type ScheduleLogsResponse = {
  logs: Array<{ time: string; phase: string; message: string; severity?: string }>;
  updated_at: number;
};

export type DecisionContextResponse = {
  task: {
    id: string;
    name: string;
    status: string;
    progress?: number;
    targetNodeId?: string;
    targetNodeName?: string;
  };
  stage: string;
  targetNodeId?: string;
  targetNodeName?: string;
  selectedReason: string;
  candidates: Array<{
    nodeId: string;
    nodeName: string;
    rankNo: number;
    scoreTotal: number;
    resourceFit: number;
    latency: number;
    bandwidth: number;
    balance: number;
    riskPenalty: number;
  }>;
  logs: Array<{ time: string; phase: string; message: string; severity?: string }>;
  securitySummary: {
    grade: string;
    algorithmScore: number;
    source: string;
  };
  strategySummary: {
    algorithm: string;
    mode: string;
    reason: string;
  };
  updated_at: number;
};

export type ScheduleContextResponse = DecisionContextResponse & {
  requirements?: {
    cpu: number;
    memory: number;
    gpu: number;
    storage?: number;
    bandwidth?: number;
    estimatedDurationSec?: number;
    affinityRegionId?: string | null;
  };
  lifecycle?: Array<{ time: string; phase: string; message: string; severity?: string }>;
  summaries?: {
    predictionPressure?: any;
    resourceDispatch?: any;
    securityBasis?: any;
  };
  predictionPressureSummary?: any;
  resourceDispatchSummary?: any;
  securityBasis?: any;
  evaluation?: any;
  reservationPlan?: any[];
  resourceLocks?: any[];
};

export type AggregationStrategyResponse = {
  taskId: string;
  currentAlgorithm: string;
  mode: string;
  maliciousRatio: number;
  attackType: string;
  reason: string;
  curves: Array<{
    algorithm: string;
    rounds: number[];
    accuracy: number[];
    loss?: number[];
  }>;
  decisionLogs: string[];
  updated_at: number;
};

export type NodeInsightResponse = {
  vertexId: string;
  nodeId: string;
  nodeName: string;
  role: string;
  status: string;
  currentLoad: number;
  predictedLoad: number;
  trustScore: number;
  latency: string;
  bandwidth: string;
  isTarget: boolean;
  selectedReason?: string;
  unselectedReason?: string;
  candidateScore?: DecisionContextResponse['candidates'][number];
  activeTasks: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    progress?: number;
  }>;
  logs: Array<{ time: string; phase: string; message: string; severity?: string }>;
  alerts: Array<{ level: string; message: string; metric?: string; value?: number }>;
  updated_at: number;
};

export type ForecastFitResponse = {
  metric: string;
  mode: 'realtime' | 'fixed';
  view_id: string;
  timeline: number[];
  actual: number[];
  predicted: number[];
  lower: number[];
  upper: number[];
  cursor: number;
  unit: string;
  label: string;
  updated_at: number;
};

// 注意：api.ts 的响应拦截器会返回 response.data，因此运行时这里得到的是“纯数据对象”，
// 但 axios 的类型不会自动跟随拦截器。为消除 TS 的 AxiosResponse 误判，这里做类型断言。
export const getDayDemandPrediction = async (): Promise<DayPredictionResponse> =>
  (await api.get<DayPredictionResponse>('/prediction/daily')) as unknown as DayPredictionResponse;

export const getPerspectives = async (
  source: AllocationTopologyDataSource = 'auto',
): Promise<PerspectiveResponse> =>
  (await api.get<PerspectiveResponse>('/allocation/perspectives', { params: { source } })) as unknown as PerspectiveResponse;

export const getAllocationKpi = async (viewId: string): Promise<AllocationKpiResponse> =>
  (await api.get<AllocationKpiResponse>('/allocation/kpi', { params: { view_id: viewId } })) as unknown as AllocationKpiResponse;

export const getTopLoad = async (viewId: string): Promise<TopLoadResponse> =>
  (await api.get<TopLoadResponse>('/allocation/top-load', { params: { view_id: viewId } })) as unknown as TopLoadResponse;

export const getTaskTypeStats = async (viewId: string): Promise<TaskTypeStatsResponse> =>
  (await api.get<TaskTypeStatsResponse>('/allocation/task-type-stats', { params: { view_id: viewId } })) as unknown as TaskTypeStatsResponse;

export const getTopologyView = async (
  viewId: string,
  source: AllocationTopologyDataSource = 'auto',
): Promise<TopologyViewResponse> =>
  (await api.get<TopologyViewResponse>('/allocation/topology/view', { params: { view_id: viewId, source } })) as unknown as TopologyViewResponse;

export const getScheduleLogs = async (vertexId: string): Promise<ScheduleLogsResponse> =>
  (await api.get<ScheduleLogsResponse>('/allocation/schedule/logs', { params: { vertex_id: vertexId } })) as unknown as ScheduleLogsResponse;

export const getDecisionContext = async (
  taskId: string = 'task-fedtrain-99943',
  viewId: string = 'global',
): Promise<DecisionContextResponse> =>
  (await api.get<DecisionContextResponse>('/allocation/decision/context', { params: { task_id: taskId, view_id: viewId } })) as unknown as DecisionContextResponse;

export const getTaskScheduleContext = async (
  taskId: string,
): Promise<ScheduleContextResponse> =>
  (await api.get<ScheduleContextResponse>(`/tasks/${encodeURIComponent(taskId)}/schedule-context`)) as unknown as ScheduleContextResponse;

export const getPredictionSchedulingInsights = async (): Promise<any> =>
  (await api.get('/prediction/scheduling-insights')) as unknown as any;

export const getResourceSensingInsights = async (): Promise<any> =>
  (await api.get('/resources/sensing-insights')) as unknown as any;

export const getAggregationStrategy = async (
  taskId: string = 'task-fedtrain-99943',
): Promise<AggregationStrategyResponse> =>
  (await api.get<AggregationStrategyResponse>('/allocation/strategy/aggregation', { params: { task_id: taskId } })) as unknown as AggregationStrategyResponse;

export const getTopologyNodeInsight = async (
  vertexId: string,
  taskId: string = 'task-fedtrain-99943',
): Promise<NodeInsightResponse> =>
  (await api.get<NodeInsightResponse>('/allocation/topology/node-insight', { params: { vertex_id: vertexId, task_id: taskId } })) as unknown as NodeInsightResponse;

export const getAllocationForecast = async (
  params: {
    metric: 'cpu' | 'gpu' | 'memory' | 'bandwidth';
    mode: 'realtime' | 'fixed';
    view_id?: string;
    start?: string;
    end?: string;
  },
): Promise<ForecastFitResponse> =>
  (await api.get<ForecastFitResponse>('/allocation/forecast', { params })) as unknown as ForecastFitResponse;
