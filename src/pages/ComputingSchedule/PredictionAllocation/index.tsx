import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  RocketOutlined,
  SafetyOutlined,
  FileSearchOutlined,
  ArrowRightOutlined,
  NodeIndexOutlined,
} from '@ant-design/icons';
import {
  Card,
  Col,
  Descriptions,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  notification,
  message,
  theme,
} from 'antd';
import dayjs from 'dayjs';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTaskFlowStore } from '@/store/taskFlow';
import { executeSchedule, getTaskDemands, submitToSchedule } from '@/services/api';
import type { TopologyNode } from '@/components/TopologyGraph';
import DecisionPanel from './DecisionPanel';
import {
  getAllocationKpi,
  getDecisionContext,
  getTaskScheduleContext,
  getPerspectives,
  getScheduleLogs,
  getTaskTypeStats,
  getTopLoad,
  getTopologyNodeInsight,
  getTopologyView,
} from '@/services/api/predictionAllocation';
import type {
  AllocationKpiResponse,
  DecisionContextResponse,
  NodeInsightResponse,
  ScheduleContextResponse,
  TaskTypeStatsResponse,
  TopLoadResponse,
} from '@/services/api/predictionAllocation';
import TopologyTab from './tabs/TopologyTab';
import {
  DEMO_TASK_ID,
  clamp,
  round,
} from '../shared/constants';
import {
  NODE_META,
  PERSPECTIVES,
  PERSPECTIVE_MAP,
  perspectiveGroupLabels,
} from '../shared/nodeMeta';
import type {
  NodeId,
  PerspectiveValue,
  PerspectiveKind,
  PerspectiveProfile,
} from '../shared/nodeMeta';
import { useReplayEngine } from '../shared/replay/useReplayEngine';
import {
  SCHEDULE_LOG_PHASES,
  createMockTasks,
} from '../shared/scheduleLog';
import type {
  ScheduleTask,
  ScheduleLogEntry,
  ScheduleLogPhase,
} from '../shared/scheduleLog';
import {
  buildKpis,
  buildTopologyPanelData,
  getVisibleNodeIds,
  normalizeDbTopologyPanelData,
} from '../shared/kpi';
import type { GlobalKpis, TopologyPanelData } from '../shared/kpi';
import './index.css';

const { Text } = Typography;

const BACKEND_NODE_ID_MAP: Record<string, NodeId> = {
  'dc-guangdong-01': 'GD_DC1',
  'dc-guangdong-02': 'GD_DC2',
  'dc-guangdong-03': 'GD_DC3',
  'dc-shanghai-01': 'SH_DC1',
  'dc-shanghai-02': 'SH_DC2',
  'dc-beijing-01': 'BJ_DC1',
  'dc-beijing-02': 'BJ_DC2',
  'dc-beijing-03': 'BJ_DC3',
};

const FRONTEND_NODE_ID_MAP = Object.fromEntries(
  Object.entries(BACKEND_NODE_ID_MAP).map(([backendId, frontendId]) => [frontendId, backendId]),
) as Record<string, string>;

const normalizeTargetNodeId = (nodeId?: string | null) => {
  if (!nodeId) return '';
  return BACKEND_NODE_ID_MAP[nodeId] ?? nodeId;
};

const getNodeIdAliases = (nodeId?: string | null) => {
  const raw = String(nodeId ?? '').trim();
  if (!raw) return [];
  return Array.from(new Set([
    raw,
    raw.toLowerCase(),
    raw.toUpperCase(),
    BACKEND_NODE_ID_MAP[raw],
    FRONTEND_NODE_ID_MAP[raw],
  ].filter(Boolean) as string[]));
};

const topologyNodeMatches = (node: TopologyNode, aliases: string[]) => {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const ids = [
    node.id,
    data.id,
    data.nodeId,
    data.computeNodeId,
    data.compute_node_id,
    data.vertexId,
  ].map((value) => String(value ?? '')).filter(Boolean);
  return ids.some((id) => aliases.includes(id) || aliases.includes(id.toLowerCase()) || aliases.includes(id.toUpperCase()));
};

const topologyViewCache = new Map<string, TopologyPanelData | null>();
const allocationKpiCache = new Map<string, AllocationKpiResponse | null>();
const topLoadCache = new Map<string, TopLoadResponse['items'] | null>();
const taskTypeStatsCache = new Map<string, TaskTypeStatsResponse['items'] | null>();
const decisionContextCache = new Map<string, DecisionContextResponse | null>();

const deferUiFetch = (callback: () => void, delay = 80) => window.setTimeout(callback, delay);

type DemandLogTask = {
  id: string;
  task: string;
  status: string;
  priority?: string;
};

const getTaskStageLabel = (stage?: string | null) => {
  const normalized = String(stage ?? '').trim();
  const map: Record<string, string> = {
    created: '已录入',
    pending: '待分配',
    submitted: '已提交，等待调度决策',
    scheduling: '调度决策中',
    scheduled: '已分配，等待执行',
    running: '任务运行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
    overview: '全局态势',
  };
  return map[normalized] ?? (normalized || '--');
};

const formatSimulationDuration = (seconds?: number | null) => {
  const minutes = Number(seconds);
  if (!Number.isFinite(minutes) || minutes <= 0) return '预计执行 --';
  const hours = minutes / 60;
  const displayHours = hours >= 10 ? Math.round(hours).toString() : hours.toFixed(1).replace(/\.0$/, '');
  return `预计执行 ${displayHours} 小时`;
};

const getDemandLogPhase = (status?: string | null) => {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (normalized === '运行中' || normalized === 'running') return '运行';
  if (normalized === '已完成' || normalized === 'completed' || normalized === 'failed') return '已完成';
  if (normalized === '已分配' || normalized === 'scheduled') return '已分配';
  if (normalized === '待分配' || normalized === 'pending' || normalized === 'scheduling') return '待分配';
  return status || '待分配';
};

const demandTaskToScheduleLog = (task: DemandLogTask, index: number, baseTime: Parameters<typeof dayjs>[0]) => ({
  time: dayjs(baseTime).subtract(index, 'minute').format('HH:mm'),
  phase: getDemandLogPhase(task.status),
  message: `${task.task} · ${task.status}`,
  severity: 'info',
});

const PredictionAllocation: React.FC = () => {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const routeTaskId = searchParams.get('taskId');
  const { currentTask, updateCurrentTask } = useTaskFlowStore();
  const [perspective, setPerspective] = useState<PerspectiveValue>('global');
  /** 拓扑数据源：固定 auto，自动连接数据库，失败则 fallback 到前端演示数据 */
  const topologyDataSource = 'auto' as const;
  const { replayTick, virtualTime, nodeReplayMap } = useReplayEngine();
  const [selectedTopologyNode, setSelectedTopologyNode] = useState<TopologyNode | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskQueue, setTaskQueue] = useState<ScheduleTask[]>(() => createMockTasks(10, 0));
  const [globalDemandTasks, setGlobalDemandTasks] = useState<DemandLogTask[]>([]);
  const taskCounterRef = useRef(10);
  const [scheduleLogs, setScheduleLogs] = useState<ScheduleLogEntry[]>([]);
  const scheduleLogIndexRef = useRef(0);
  const [focusedNodeId, setFocusedNodeId] = useState<NodeId | null>(null);
  const [dbPerspectives, setDbPerspectives] = useState<PerspectiveProfile[] | null>(null);
  const perspectiveProfiles = dbPerspectives ?? PERSPECTIVES;
  const perspectiveMap = useMemo(
    () => Object.fromEntries(perspectiveProfiles.map((item) => [item.value, item])) as Record<PerspectiveValue, PerspectiveProfile>,
    [perspectiveProfiles],
  );
  const currentPerspective = perspectiveMap[perspective] ?? PERSPECTIVE_MAP[perspective] ?? perspectiveProfiles[0] ?? PERSPECTIVES[0];
  const [globalKpis, setGlobalKpis] = useState<GlobalKpis>(() => buildKpis(nodeReplayMap, currentPerspective));
  const [dbGlobalKpis, setDbGlobalKpis] = useState<GlobalKpis | null>(null);
  const [dbLoadTop5, setDbLoadTop5] = useState<Array<{ name: string; value: number; predicted: number }> | null>(null);
  const [dbTaskTypeData, setDbTaskTypeData] = useState<Array<{ name: string; value: number }> | null>(null);
  const [dbTopologyPanelData, setDbTopologyPanelData] = useState<TopologyPanelData | null>(null);
  const [decisionContext, setDecisionContext] = useState<DecisionContextResponse | null>(null);
  const [scheduleContext, setScheduleContext] = useState<ScheduleContextResponse | null>(null);
  const [nodeInsight, setNodeInsight] = useState<NodeInsightResponse | null>(null);
  const dataSourceNotifiedRef = useRef(false);

  // ---- 调度评分明细状态 ----
  // 当任务从任务管理页流转过来时，自动调 submitToSchedule 获取评分
  const [scheduleEvaluation, setScheduleEvaluation] = useState<any>(null);
  const [scheduleEvalLoading, setScheduleEvalLoading] = useState(false);
  const [scheduleExecuting, setScheduleExecuting] = useState(false);
  const submittedTaskRef = useRef<string | null>(null);
  const activeFlowTask = currentTask && (!routeTaskId || currentTask.id === routeTaskId) ? currentTask : null;
  const decisionTaskId = routeTaskId ?? activeFlowTask?.id ?? DEMO_TASK_ID;
  const scheduleTaskId = routeTaskId ?? activeFlowTask?.id;

  /**
   * 收到流转任务时自动获取调度评分明细
   * 只在任务首次进入且阶段为 submitted 时触发
   */
  useEffect(() => {
    if (!activeFlowTask || activeFlowTask.stage !== 'submitted') return;
    if (submittedTaskRef.current === activeFlowTask.id) return; // 避免重复请求
    submittedTaskRef.current = activeFlowTask.id;

    setScheduleEvalLoading(true);
    submitToSchedule({
      task_id: activeFlowTask.id,
      task_name: activeFlowTask.name,
      task_type: activeFlowTask.type,
      priority: activeFlowTask.priority,
      cpu: activeFlowTask.cpu || 16,
      memory: activeFlowTask.memory || 64,
      gpu: activeFlowTask.gpu || 4,
    })
      .then((res: any) => {
        if (res?.evaluation) {
          setScheduleEvaluation(res.evaluation);
        }
      })
      .catch((e) => console.warn('获取调度评分失败:', e))
      .finally(() => setScheduleEvalLoading(false));
  }, [activeFlowTask?.id, activeFlowTask?.stage]);

  /** 数据源连接状态通知：首个接口成功弹绿色、全部失败弹红色，页面生命周期只弹一次 */
  const notifyDataSource = React.useCallback((online: boolean, detail?: string) => {
    if (dataSourceNotifiedRef.current) return;
    dataSourceNotifiedRef.current = true;
    if (online) {
      notification.success({
        message: '数据库已连接',
        description: detail ?? '调度数据来自后端数据库。',
        placement: 'topRight',
        duration: 3,
      });
    } else {
      notification.error({
        message: '数据库连接失败',
        description: detail ?? '后端不可达，已切换为前端演示数据。',
        placement: 'topRight',
        duration: 5,
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getPerspectives(topologyDataSource)
      .then((payload) => {
        if (cancelled) return;
        if (payload?.perspectives?.length) {
          setDbPerspectives(payload.perspectives.map((item) => ({
            value: item.value,
            label: item.label,
            kind: item.kind as PerspectiveKind,
            nodeIds: item.nodeIds,
            nodeId: item.node_id ?? undefined,
          })));
          notifyDataSource(true, '调度数据来自后端数据库');
        } else {
          setDbPerspectives(null);
          notifyDataSource(false);
        }
      })
      .catch(() => {
        setDbPerspectives(null);
        notifyDataSource(false);
      });

    return () => {
      cancelled = true;
    };
  }, [topologyDataSource, notifyDataSource]);

  useEffect(() => {
    let cancelled = false;
    const viewId = perspective;
    const cacheKey = `${viewId}:${topologyDataSource}`;
    const cachedTopology = topologyViewCache.get(cacheKey);
    if (topologyViewCache.has(cacheKey)) {
      setDbTopologyPanelData(cachedTopology ?? null);
    }
    if (allocationKpiCache.has(viewId)) {
      const payload = allocationKpiCache.get(viewId);
      setDbGlobalKpis(payload && typeof payload.avgDelay === 'number'
        ? {
          avgDelay: payload.avgDelay,
          delayDelta: payload.delayDelta,
          loadStd: payload.loadStd,
          loadStdDelta: payload.loadStdDelta,
          successTasks: payload.successTasks,
          successTasksDelta: payload.successTasksDelta,
          avgBandwidth: payload.avgBandwidth,
          avgGpuUsage: payload.avgGpuUsage,
          totalGpuMemory: payload.totalGpuMemory,
        }
        : null);
    }
    if (topLoadCache.has(viewId)) {
      setDbLoadTop5(topLoadCache.get(viewId) ?? null);
    }
    if (taskTypeStatsCache.has(viewId)) {
      setDbTaskTypeData(taskTypeStatsCache.get(viewId) ?? null);
    }

    getTopologyView(viewId, topologyDataSource)
      .then((payload) => {
        if (cancelled || !payload) return;
        const normalized = payload?.nodes?.length ? normalizeDbTopologyPanelData(payload) : null;
        topologyViewCache.set(cacheKey, normalized);
        setDbTopologyPanelData(normalized);
      })
      .catch(() => {
        if (!topologyViewCache.has(cacheKey)) {
          setDbTopologyPanelData(null);
        }
      });

    const timer = deferUiFetch(() => {
      getAllocationKpi(viewId)
        .then((payload) => {
          if (cancelled || !payload || typeof payload.avgDelay !== 'number') return;
          allocationKpiCache.set(viewId, payload);
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
          allocationKpiCache.set(viewId, null);
          setDbGlobalKpis(null);
        });

      getTopLoad(viewId)
        .then((payload) => {
          if (cancelled) return;
          const items = payload?.items?.length ? payload.items : null;
          topLoadCache.set(viewId, items);
          setDbLoadTop5(items);
        })
        .catch(() => {
          topLoadCache.set(viewId, null);
          setDbLoadTop5(null);
        });

      getTaskTypeStats(viewId)
        .then((payload) => {
          if (cancelled) return;
          const items = payload?.items?.length ? payload.items : null;
          taskTypeStatsCache.set(viewId, items);
          setDbTaskTypeData(items);
        })
        .catch(() => {
          taskTypeStatsCache.set(viewId, null);
          setDbTaskTypeData(null);
        });
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [perspective, topologyDataSource]);

  useEffect(() => {
    if (!scheduleTaskId) {
      setDecisionContext(null);
      return;
    }
    let cancelled = false;
    const viewId = perspective;
    const cacheKey = `${scheduleTaskId}:${viewId}`;
    if (decisionContextCache.has(cacheKey)) {
      setDecisionContext(decisionContextCache.get(cacheKey) ?? null);
    }

    getDecisionContext(scheduleTaskId, viewId)
      .then((payload) => {
        if (cancelled) return;
        decisionContextCache.set(cacheKey, payload);
        setDecisionContext(payload);
      })
      .catch(() => {
        if (cancelled) return;
        decisionContextCache.set(cacheKey, null);
        setDecisionContext(null);
      });

    return () => {
      cancelled = true;
    };
  }, [perspective, scheduleTaskId]);

  useEffect(() => {
    if (!scheduleTaskId) {
      setScheduleContext(null);
      return;
    }
    let cancelled = false;
    getTaskScheduleContext(scheduleTaskId)
      .then((payload) => {
        if (cancelled) return;
        setScheduleContext(payload);
        if (payload?.evaluation) {
          setScheduleEvaluation(payload.evaluation);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setScheduleContext(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [scheduleTaskId, scheduleExecuting]);

  useEffect(() => {
    if (scheduleTaskId) return;
    setFocusedNodeId(null);
    setSelectedTopologyNode(null);
  }, [perspective, scheduleTaskId]);

  useEffect(() => {
    setGlobalKpis((previous) => buildKpis(nodeReplayMap, currentPerspective, previous));
  }, [currentPerspective, nodeReplayMap]);

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
    let cancelled = false;
    const fetchDemandTasks = () => {
      getTaskDemands()
        .then((payload: any) => {
          if (cancelled) return;
          const items = Array.isArray(payload) ? payload : [];
          setGlobalDemandTasks(items.map((item) => ({
            id: String(item.id ?? ''),
            task: String(item.task ?? item.name ?? item.id ?? '--'),
            status: String(item.status ?? '待分配'),
            priority: item.priority,
          })));
        })
        .catch(() => {
          if (!cancelled) setGlobalDemandTasks([]);
        });
    };
    fetchDemandTasks();
    const timer = window.setInterval(fetchDemandTasks, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
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
        }
      })
      .catch(() => {
        if (!SCHEDULE_LOG_PHASES[selectedId]) {
          setScheduleLogs([]);
        }
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
  }, [selectedTopologyNode, taskQueue]);

  useEffect(() => {
    const selectedId = selectedTopologyNode?.id;
    if (!selectedId) {
      setNodeInsight(null);
      return;
    }

    let cancelled = false;
    setNodeInsight(null);
    getTopologyNodeInsight(selectedId, decisionTaskId)
      .then((payload) => {
        if (cancelled) return;
        setNodeInsight(payload);
      })
      .catch(() => {
        if (!cancelled) {
          setNodeInsight(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTopologyNode, decisionTaskId]);

  const visibleNodeIds = useMemo(
    () => getVisibleNodeIds(currentPerspective).filter((nodeId) => Boolean(nodeReplayMap[nodeId])),
    [currentPerspective, nodeReplayMap],
  );
  const activeTask = useMemo(() => taskQueue.find((t) => t.id === activeTaskId), [taskQueue, activeTaskId]);

  const mockTopologyPanelData = useMemo(
    () => buildTopologyPanelData(nodeReplayMap, currentPerspective, replayTick, activeTask),
    [currentPerspective, nodeReplayMap, replayTick, activeTask],
  );
  const topologyPanelData = dbTopologyPanelData ?? mockTopologyPanelData;
  const topologyCanvasHeight = 510;

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

  const fallbackDecisionContext: DecisionContextResponse = {
    task: {
      id: decisionTaskId,
      name: '联邦训练-图神经网络',
      status: 'running',
      progress: 42,
      targetNodeId: 'dc-guangdong-02',
      targetNodeName: '广东DC-2',
    },
    stage: scheduleLogs[scheduleLogs.length - 1]?.phase ?? '下发',
    targetNodeId: 'dc-guangdong-02',
    targetNodeName: '广东DC-2',
    selectedReason: '广东DC-2 在资源匹配、负载均衡和时延维度综合评分最高，风险扣分最低。',
    candidates: [
      { nodeId: 'dc-guangdong-02', nodeName: '广东DC-2', rankNo: 1, scoreTotal: 92, resourceFit: 96, latency: 91, bandwidth: 88, balance: 94, riskPenalty: 6 },
      { nodeId: 'dc-shanghai-01', nodeName: '上海DC-1', rankNo: 2, scoreTotal: 86, resourceFit: 98, latency: 86, bandwidth: 78, balance: 72, riskPenalty: 14 },
      { nodeId: 'dc-beijing-02', nodeName: '北京DC-2', rankNo: 3, scoreTotal: 81, resourceFit: 90, latency: 76, bandwidth: 74, balance: 70, riskPenalty: 19 },
      { nodeId: 'dc-sichuan-01', nodeName: '四川DC-1', rankNo: 4, scoreTotal: 77, resourceFit: 84, latency: 68, bandwidth: 70, balance: 88, riskPenalty: 16 },
    ],
    logs: scheduleLogs.length > 0 ? scheduleLogs.map((log) => ({ time: log.time, phase: log.phase, message: log.message })) : [
      { time: dayjs(virtualTime).format('HH:mm'), phase: '感知', message: `收到 ${decisionTaskId}，读取任务资源需求。` },
      { time: dayjs(virtualTime).add(2, 'minute').format('HH:mm'), phase: '决策', message: '生成候选节点评分：资源匹配、负载均衡、网络时延、风险扣分。' },
      { time: dayjs(virtualTime).add(4, 'minute').format('HH:mm'), phase: '下发', message: '任务绑定至 dc-guangdong-02，资源预留完成。' },
    ],
    securitySummary: {
      grade: 'B+',
      algorithmScore: 82,
      source: '训练监控告警',
    },
    strategySummary: {
      algorithm: 'Bulyan',
      mode: 'rl_auto',
      reason: '鲁棒聚合策略',
    },
    updated_at: 0,
  };

  const globalDecisionContext = useMemo<DecisionContextResponse>(() => {
    const demandLogs = globalDemandTasks.length
      ? globalDemandTasks.slice(0, 8).map((task, index) => demandTaskToScheduleLog(task, index, virtualTime))
      : taskQueue.slice(0, 8).map((task, index) => ({
        time: dayjs(virtualTime).subtract(index, 'minute').format('HH:mm'),
        phase: task.status === 'pending' ? '待分配' : task.status === 'running' ? '运行' : '已完成',
        message: `${task.name} · ${task.status}（演示队列）`,
        severity: 'info',
      }));
    return {
      task: {
        id: 'global',
        name: globalDemandTasks.length ? '需求管理任务队列' : '全局队列态势',
        status: 'overview',
        progress: 0,
      },
      stage: '全局态势',
      targetNodeId: undefined,
      targetNodeName: undefined,
      selectedReason: globalDemandTasks.length
        ? '当前未指定任务，右侧展示需求管理同源任务队列、运行态和资源紧张提醒。'
        : '当前未指定任务，调度中心保持全局视角，右侧展示演示队列、运行态和资源紧张提醒。',
      candidates: loadTop5.map((item, index) => ({
        nodeId: item.name,
        nodeName: item.name,
        rankNo: index + 1,
        scoreTotal: Math.max(0, 100 - item.predicted),
        resourceFit: Math.max(0, 100 - item.value),
        latency: 0,
        bandwidth: 0,
        balance: Math.max(0, 100 - item.value),
        riskPenalty: Math.max(0, item.predicted - 70),
      })),
      logs: demandLogs,
      securitySummary: {
        grade: 'B+',
        algorithmScore: 82,
        source: '全局安全态势',
      },
      strategySummary: {
        algorithm: 'PredictiveSecureMultiObjectiveScheduler',
        mode: 'global_overview',
        reason: '无具体任务时仅展示全局态势，不触发任务粒度下发。',
      },
      updated_at: 0,
    };
  }, [globalDemandTasks, loadTop5, taskQueue, virtualTime]);

  // ============================================================
  // 联动逻辑：当有流转任务时，动态覆盖 decisionContext
  // 根据任务资源需求 + 节点实时负载（来自感知）+ 预测负载（来自预测）
  // 综合计算候选节点评分
  // ============================================================
  const flowDecisionContext = useMemo<DecisionContextResponse | null>(() => {
    if (!activeFlowTask) return null;

    // 从感知数据中读取各节点的实时负载
    const candidates = visibleNodeIds.map((nodeId) => {
      const meta = NODE_META[nodeId];
      const replay = nodeReplayMap[nodeId];
      if (!replay) return null;
      const cpuLoad = replay.latest.cpu;
      const memLoad = replay.latest.memory;
      const gpuLoad = replay.latest.gpuUsage.reduce((a, b) => a + b, 0) / Math.max(replay.latest.gpuUsage.length, 1);

      // 资源匹配度：任务需求 vs 节点容量
      const taskCpu = activeFlowTask.cpu || 16;
      const taskGpu = activeFlowTask.gpu || 2;
      const resourceFit = Math.round(
        Math.min(100, (meta.baseCpu / taskCpu) * 30 + (meta.gpuNames.length / Math.max(taskGpu, 1)) * 40 + (1 - cpuLoad / 100) * 30)
      );

      // 负载均衡：负载越低越好
      const balance = Math.round(Math.max(10, 100 - (cpuLoad + memLoad) / 2));

      // 时延：模拟值
      const latency = Math.round(Math.max(40, 100 - cpuLoad * 0.5));

      // 带宽
      const bandwidth = Math.round(Math.max(30, 90 - gpuLoad * 0.4));

      // 风险扣分：负载越高风险越大
      const riskPenalty = Math.round(Math.max(0, (cpuLoad - 60) * 0.5 + (gpuLoad - 70) * 0.3));

      // 综合分
      const scoreTotal = Math.max(30, resourceFit + balance + latency + bandwidth - riskPenalty * 2 - 100);

      return {
        nodeId,
        nodeName: meta.name,
        resourceFit,
        latency,
        bandwidth,
        balance,
        riskPenalty: Math.max(0, riskPenalty),
        scoreTotal,
      };
    }).filter(Boolean) as Array<{
      nodeId: string; nodeName: string; resourceFit: number;
      latency: number; bandwidth: number; balance: number; riskPenalty: number; scoreTotal: number;
    }>;

    // 按综合分排序，取 Top 4
    candidates.sort((a, b) => b.scoreTotal - a.scoreTotal);
    const topCandidates = candidates.slice(0, 4).map((c, i) => ({ ...c, rankNo: i + 1 }));
    const best = topCandidates[0];

    // 生成调度日志
    const flowLogs = [
      { time: dayjs(virtualTime).format('HH:mm'), phase: '感知', message: `收到流转任务 ${activeFlowTask.name}（${activeFlowTask.id}），读取资源需求：CPU ${activeFlowTask.cpu || 16}核 / GPU ${activeFlowTask.gpu || 2}张。` },
      { time: dayjs(virtualTime).add(1, 'minute').format('HH:mm'), phase: '感知', message: `拉取全网 ${visibleNodeIds.length} 个节点的实时负载与未来负载预测。` },
      { time: dayjs(virtualTime).add(2, 'minute').format('HH:mm'), phase: '决策', message: `候选节点评估完成，${best?.nodeName ?? ''} 综合评分 ${best?.scoreTotal ?? 0}（资源匹配 ${best?.resourceFit ?? 0} / 负载均衡 ${best?.balance ?? 0}）。` },
      ...(activeFlowTask.stage === 'scheduled' || activeFlowTask.stage === 'running' ? [
        { time: dayjs(virtualTime).add(4, 'minute').format('HH:mm'), phase: '下发', message: `任务已绑定至 ${activeFlowTask.targetNode || best?.nodeId || ''}，使用 ${activeFlowTask.selectedAlgorithm || 'Bulyan'} 聚合算法。` },
        { time: dayjs(virtualTime).add(5, 'minute').format('HH:mm'), phase: '监控', message: '链路就绪，任务流已激活，开始实时监控。' },
      ] : []),
    ];

    return {
      task: {
        id: activeFlowTask.id,
        name: activeFlowTask.name,
        status: activeFlowTask.stage === 'submitted' ? 'pending' : activeFlowTask.stage,
        progress: activeFlowTask.stage === 'completed' ? 100 : activeFlowTask.stage === 'running' ? 42 : 0,
        targetNodeId: activeFlowTask.targetNode || best?.nodeId || '',
        targetNodeName: activeFlowTask.targetNode ? NODE_META[activeFlowTask.targetNode as NodeId]?.name || activeFlowTask.targetNode : best?.nodeName || '',
      },
      stage: getTaskStageLabel(activeFlowTask.stage),
      targetNodeId: activeFlowTask.targetNode || best?.nodeId || '',
      targetNodeName: activeFlowTask.targetNode ? NODE_META[activeFlowTask.targetNode as NodeId]?.name || activeFlowTask.targetNode : best?.nodeName || '',
      selectedReason: best ? `${best.nodeName} 综合评分 ${best.scoreTotal}：资源匹配 ${best.resourceFit}、负载均衡 ${best.balance}、时延 ${best.latency}、风险扣分 ${best.riskPenalty}。` : '',
      candidates: topCandidates,
      logs: flowLogs,
      securitySummary: {
        grade: activeFlowTask.securityScore && activeFlowTask.securityScore >= 85 ? 'A' : 'B+',
        algorithmScore: activeFlowTask.securityScore || 82,
        source: '任务级安全评估',
      },
      strategySummary: {
        algorithm: activeFlowTask.selectedAlgorithm || 'Bulyan',
        mode: 'rl_auto',
        reason: '基于任务数据集隐私等级与恶意梯度比例综合决策',
      },
      updated_at: 0,
    };
  }, [activeFlowTask, visibleNodeIds, nodeReplayMap, virtualTime]);

  // 优先使用联动决策上下文，其次数据库，最后 fallback
  const displayDecisionContext = scheduleContext ?? (scheduleTaskId ? decisionContext : globalDecisionContext) ?? fallbackDecisionContext;

  const canonicalTarget = useMemo(() => {
    const rawNodeId = scheduleEvaluation?.selected_node?.node_id
      ?? scheduleContext?.evaluation?.selected_node?.node_id
      ?? displayDecisionContext.targetNodeId
      ?? displayDecisionContext.task.targetNodeId
      ?? activeFlowTask?.targetNode
      ?? '';
    const aliases = getNodeIdAliases(rawNodeId);
    const topologyNode = aliases.length
      ? topologyPanelData.nodes.find((node) => topologyNodeMatches(node, aliases))
      : null;
    const data = (topologyNode?.data ?? {}) as Record<string, unknown>;
    const nodeId = String(data.computeNodeId ?? data.compute_node_id ?? data.nodeId ?? rawNodeId ?? topologyNode?.id ?? '');
    const nodeName = topologyNode?.label
      ?? scheduleEvaluation?.selected_node?.node_name
      ?? scheduleContext?.evaluation?.selected_node?.node_name
      ?? displayDecisionContext.targetNodeName
      ?? displayDecisionContext.task.targetNodeName
      ?? nodeId;
    return {
      rawNodeId: String(rawNodeId ?? ''),
      nodeId,
      nodeName,
      aliases,
      topologyNode,
    };
  }, [
    activeFlowTask?.targetNode,
    displayDecisionContext.targetNodeId,
    displayDecisionContext.targetNodeName,
    displayDecisionContext.task.targetNodeId,
    displayDecisionContext.task.targetNodeName,
    scheduleContext,
    scheduleEvaluation?.selected_node?.node_id,
    scheduleEvaluation?.selected_node?.node_name,
    topologyPanelData.nodes,
  ]);

  const alignedDecisionContext = useMemo<DecisionContextResponse>(() => {
    if (!canonicalTarget.nodeId) return displayDecisionContext;
    return {
      ...displayDecisionContext,
      targetNodeId: canonicalTarget.nodeId,
      targetNodeName: canonicalTarget.nodeName,
      task: {
        ...displayDecisionContext.task,
        targetNodeId: canonicalTarget.nodeId,
        targetNodeName: canonicalTarget.nodeName,
      },
    };
  }, [canonicalTarget.nodeId, canonicalTarget.nodeName, displayDecisionContext]);

  // 联动调度日志：有流转任务时注入任务专属日志
  const flowScheduleLogs = useMemo<ScheduleLogEntry[]>(() => {
    if (scheduleContext?.logs?.length) {
      return scheduleContext.logs.map((l) => ({ time: l.time, phase: l.phase as ScheduleLogPhase, message: l.message }));
    }
    return scheduleLogs;
  }, [scheduleContext, scheduleLogs]);

  useEffect(() => {
    if (!activeFlowTask && !routeTaskId) return;
    const rawTargetNodeId = canonicalTarget.rawNodeId || canonicalTarget.nodeId;
    const targetNodeId = normalizeTargetNodeId(rawTargetNodeId);
    const targetAliases = canonicalTarget.aliases.length ? canonicalTarget.aliases : getNodeIdAliases(rawTargetNodeId);
    if (!targetNodeId || targetAliases.length === 0) return;
    const targetRegionId = scheduleEvaluation?.selected_node?.region_id
      ?? scheduleContext?.evaluation?.selected_node?.region_id
      ?? scheduleContext?.requirements?.affinityRegionId
      ?? '';
    const targetHint = String(rawTargetNodeId ?? '').toLowerCase().replace(/^dc-/, '').split('-')[0];
    const preferredPerspective = perspectiveProfiles.find((item) => (
      item.kind === 'province' && (item.nodeIds ?? []).some((id) => targetAliases.includes(id))
    )) ?? perspectiveProfiles.find((item) => (
      item.kind === 'region' && (item.nodeIds ?? []).some((id) => targetAliases.includes(id))
    )) ?? perspectiveProfiles.find((item) => (
      targetRegionId && item.kind === 'province' && item.value.includes(String(targetRegionId).replace('prov_', ''))
    )) ?? perspectiveProfiles.find((item) => (
      targetRegionId && item.kind === 'region' && item.value.includes(String(targetRegionId).replace('prov_', '').replace('region_', ''))
    )) ?? perspectiveProfiles.find((item) => (
      targetHint && item.kind === 'province' && String(item.value).toLowerCase().includes(targetHint)
    )) ?? perspectiveProfiles.find((item) => (
      targetHint && item.kind === 'region' && String(item.value).toLowerCase().includes(targetHint)
    ));

    if (preferredPerspective && perspective !== preferredPerspective.value) {
      setPerspective(preferredPerspective.value as PerspectiveValue);
      return;
    }

    const targetNode = canonicalTarget.topologyNode ?? topologyPanelData.nodes.find((node) => topologyNodeMatches(node, targetAliases));
    if (!targetNode) return;
    setFocusedNodeId(targetNode.id);
    setSelectedTopologyNode((previous) => (previous?.id === targetNode.id ? previous : targetNode));
  }, [
    activeFlowTask?.id,
    routeTaskId,
    canonicalTarget,
    scheduleEvaluation?.selected_node?.node_id,
    scheduleEvaluation?.selected_node?.region_id,
    scheduleContext,
    displayDecisionContext.targetNodeId,
    displayDecisionContext.task.targetNodeId,
    perspective,
    perspectiveProfiles,
    topologyPanelData.nodes,
  ]);

  const perspectiveSelectOptions = useMemo(() => (
    (['global', 'region', 'province'] as PerspectiveKind[])
      .map((kind) => ({
        label: perspectiveGroupLabels[kind],
        options: perspectiveProfiles
          .filter((item) => item.kind === kind)
          .map((item) => ({ label: item.label, value: item.value })),
      }))
      .filter((group) => group.options.length > 0)
  ), [perspectiveProfiles]);

  const trendColor = (value: number, reverse = false) => {
    const positive = reverse ? value <= 0 : value >= 0;
    return positive ? token.colorSuccess : token.colorError;
  };

  const viewedTask = activeFlowTask
    ? {
      id: activeFlowTask.id,
      name: activeFlowTask.name,
      stage: scheduleContext?.task.status ?? activeFlowTask.stage,
      cpu: activeFlowTask.cpu,
      memory: activeFlowTask.memory,
      gpu: activeFlowTask.gpu,
      algorithm: activeFlowTask.selectedAlgorithm,
      targetNode: canonicalTarget.nodeId || activeFlowTask.targetNode,
      targetNodeName: canonicalTarget.nodeName,
      estimatedDurationSec: scheduleContext?.requirements?.estimatedDurationSec,
      progress: scheduleContext?.task.progress,
    }
    : routeTaskId
      ? {
        id: routeTaskId,
        name: displayDecisionContext.task.name,
        stage: scheduleContext?.task.status ?? displayDecisionContext.task.status ?? displayDecisionContext.stage,
        cpu: scheduleContext?.requirements?.cpu,
        memory: scheduleContext?.requirements?.memory,
        gpu: scheduleContext?.requirements?.gpu,
        algorithm: displayDecisionContext.strategySummary.algorithm,
        targetNode: canonicalTarget.nodeId || displayDecisionContext.targetNodeId,
        targetNodeName: canonicalTarget.nodeName,
        estimatedDurationSec: scheduleContext?.requirements?.estimatedDurationSec,
        progress: displayDecisionContext.task.progress,
      }
      : null;

  const taskSecuritySummary = scheduleContext?.securitySummary ?? displayDecisionContext.securitySummary;
  const taskStrategySummary = scheduleContext?.strategySummary ?? displayDecisionContext.strategySummary;
  const taskSecurityBasis = (scheduleContext as any)?.summaries?.securityBasis ?? (scheduleContext as any)?.securityBasis;
  const securityConclusion = taskSecurityBasis?.grade
    ? `${taskSecurityBasis.grade} · ${taskSecurityBasis.dominantRisk ?? '安全态势稳定'}`
    : `${taskSecuritySummary.grade} · 算法层 ${taskSecuritySummary.algorithmScore}`;
  const strategyConclusion = taskStrategySummary.algorithm ?? viewedTask?.algorithm ?? 'Bulyan';
  const openSecurityDetail = (nodeId?: string) => {
    const taskId = routeTaskId ?? activeFlowTask?.id;
    if (!taskId) return;
    navigate(`/computing/security-assessment?taskId=${encodeURIComponent(taskId)}&nodeId=${encodeURIComponent(nodeId ?? canonicalTarget.nodeId ?? '')}`);
  };

  const handleExecuteSchedule = async (targetNode: string) => {
    const taskId = routeTaskId ?? activeFlowTask?.id;
    if (!taskId) return;
    const algorithm = displayDecisionContext.strategySummary.algorithm || activeFlowTask?.selectedAlgorithm || 'Bulyan';
    setScheduleExecuting(true);
    try {
      await executeSchedule({ task_id: taskId, target_node_id: targetNode, algorithm });
      if (activeFlowTask && activeFlowTask.id === taskId) {
        updateCurrentTask({ stage: 'running', selectedAlgorithm: algorithm, targetNode });
      }
      message.success(`调度已下发：${algorithm} → ${targetNode}`);
    } catch (e) {
      console.warn('executeSchedule failed:', e);
      message.warning('调度下发接口暂未成功，页面已保留本次决策结果');
    } finally {
      setScheduleExecuting(false);
    }
  };

  return (
    <div className="prediction-allocation-page">
      {/* 当前查看任务卡片 */}
      {viewedTask && (
        <Card className="prediction-allocation-task-card" size="small">
          <div className="prediction-allocation-task-card-grid">
            {/* 任务区 */}
            <div className="prediction-allocation-task-card-main">
              <div className="prediction-allocation-task-card-bar prediction-allocation-task-card-bar--blue" />
              <RocketOutlined className="prediction-allocation-task-card-icon" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Space wrap size={[8, 4]}>
                  <Tag color="blue">当前查看任务</Tag>
                  <Text strong>{viewedTask.name}</Text>
                  <Text type="secondary">ID: {viewedTask.id}</Text>
                </Space>
                <div className="prediction-allocation-task-card-sub">
                  阶段: {getTaskStageLabel(viewedTask.stage)}
                  {typeof viewedTask.cpu === 'number' ? ` · CPU ${viewedTask.cpu}核 / 内存 ${viewedTask.memory}GB / GPU ${viewedTask.gpu}张` : ''}
                </div>
              </div>
              <button
                type="button"
                className="prediction-allocation-task-card-detail-btn"
                onClick={() => navigate(`/computing/task-management?taskId=${encodeURIComponent(viewedTask.id)}`)}
              >
                <FileSearchOutlined />
                <span>查看任务详情</span>
                <ArrowRightOutlined />
              </button>
            </div>

            {/* 安全区 */}
            <button
              type="button"
              className="prediction-allocation-task-card-safety"
              onClick={() => openSecurityDetail(viewedTask.targetNode)}
            >
              <div className="prediction-allocation-task-card-bar prediction-allocation-task-card-bar--purple" />
              <div className="prediction-allocation-task-card-safety-body">
                <div className="prediction-allocation-task-card-safety-header">
                  <SafetyOutlined className="prediction-allocation-task-card-safety-icon" />
                  <span>量化安全评估</span>
                  <Tag color={securityConclusion.startsWith('A') ? 'green' : securityConclusion.startsWith('B') ? 'blue' : 'orange'} style={{ margin: 0 }}>
                    {securityConclusion}
                  </Tag>
                </div>
                <div className="prediction-allocation-task-card-safety-meta">
                  <span>算法策略</span>
                  <strong>{strategyConclusion}</strong>
                </div>
                <div className="prediction-allocation-task-card-safety-cta">
                  点击查看安全详情与策略依据 <ArrowRightOutlined />
                </div>
              </div>
            </button>

            {/* 调度结果区 */}
            <div className="prediction-allocation-task-card-result">
              <div className="prediction-allocation-task-card-bar prediction-allocation-task-card-bar--green" />
              <div className="prediction-allocation-task-card-result-body">
                <span>调度结果</span>
                <strong>{viewedTask.targetNodeName ?? viewedTask.targetNode ?? '--'}</strong>
                {viewedTask.targetNode && viewedTask.targetNodeName !== viewedTask.targetNode && (
                  <small>{viewedTask.targetNode}</small>
                )}
                <em>{formatSimulationDuration(viewedTask.estimatedDurationSec)}</em>
                <small>{getTaskStageLabel(viewedTask.stage)}{typeof viewedTask.progress === 'number' ? ` · 进度 ${Math.round(viewedTask.progress)}%` : ''}</small>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 调度决策详情面板（展示评分明细：凭什么分到这个节点） */}
      {activeFlowTask && activeFlowTask.stage === 'submitted' && (
        <DecisionPanel
          evaluation={scheduleEvaluation}
          taskReq={{ cpu: activeFlowTask.cpu || 16, gpu: activeFlowTask.gpu || 4, memory: activeFlowTask.memory || 64 }}
          loading={scheduleEvalLoading}
          executing={scheduleExecuting}
          scheduleContext={scheduleContext}
          onExecute={handleExecuteSchedule}
          onSecurityDetail={(nodeId) => openSecurityDetail(nodeId)}
        />
      )}

      {/* 虚拟时间直接放到拓扑卡片标题栏，不再单独占一个卡片 */}

      <TopologyTab
        topologyPanelData={topologyPanelData}
        topologyCanvasHeight={topologyCanvasHeight}
        selectedTopologyNode={selectedTopologyNode}
        onNodeSelect={setSelectedTopologyNode}
        currentPerspective={currentPerspective}
        displayGlobalKpis={displayGlobalKpis}
        loadTop5={loadTop5}
        taskTypeData={taskTypeData}
        displayDecisionContext={alignedDecisionContext}
        scheduleLogs={flowScheduleLogs}
        nodeInsight={nodeInsight}
        colorPrimary={token.colorPrimary}
        colorSuccess={token.colorSuccess}
        colorError={token.colorError}
        colorTextSecondary={token.colorTextSecondary}
        colorWarning={token.colorWarning}
        trendColor={trendColor}
        hasHubLogs={Boolean(selectedTopologyNode && SCHEDULE_LOG_PHASES[selectedTopologyNode.id])}
        perspective={perspective}
        onPerspectiveChange={setPerspective}
        perspectiveSelectOptions={perspectiveSelectOptions}
        focusedNodeId={focusedNodeId}
        onFocusedNodeIdChange={setFocusedNodeId}
        virtualTime={dayjs(virtualTime).format('YYYY-MM-DD HH:mm:ss')}
        onNavigate={(path) => navigate(path)}
      />

    </div>
  );
};

export default PredictionAllocation;
