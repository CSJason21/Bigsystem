import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  getTaskDemands,
  getMapData,
  getNodes,
  getResourceUsage,
  getResourceTrend,
  getPredictDates,
  getPredictTrend,
} from '@/services/api';
import {
  DemandItem,
  NodeItem,
  StatItem,
  ResourceUsageItem,
  TrendData,
  MapNodeItem,
  PriorityGroup,
  PriorityLevel,
  PRIORITY_ORDER,
  PRIORITY_META,
  NodeStatusGroup,
  NodeStatus,
  NODE_STATUS_ORDER,
  NODE_STATUS_META,
  ResourceAlert,
  ALERT_THRESHOLDS,
  SUPERCOMPUTING_MAP,
} from './types';

export interface DailyTrendData {
  dailyOverview: TrendData;
  dailyDetailMap: Map<string, TrendData>;
}

const TASK_PAGE_CACHE_TTL = 60_000;

const emptyTrendData = (): DailyTrendData => ({
  dailyOverview: { x: [], series: [] },
  dailyDetailMap: new Map(),
});

const taskPageCache: {
  demands?: DemandItem[];
  nodes?: NodeItem[];
  usage?: ResourceUsageItem[];
  trend?: DailyTrendData;
  mapData?: MapNodeItem[];
  updatedAt?: number;
  secondaryUpdatedAt?: number;
} = {};

const isTaskPageCacheFresh = () => (
  Boolean(taskPageCache.updatedAt) && Date.now() - Number(taskPageCache.updatedAt) < TASK_PAGE_CACHE_TTL
);

const normalizeMapItems = (mapRes: any): MapNodeItem[] => (
  Array.isArray(mapRes)
    ? (mapRes as any[]).map((item) => ({
      name: item.name,
      longitude: item.longitude,
      latitude: item.latitude,
      capacity: item.capacity,
      level: item.level,
    }))
    : []
);

const normalizeNodes = (nodesRes: any): NodeItem[] => (
  Array.isArray(nodesRes?.nodes)
    ? nodesRes.nodes.map((n: any) => {
      const nodeName: string = n.node_name || n.hostname || '';
      let parentSuper = '';
      const nameLower = nodeName.toLowerCase();
      for (const [city, sc] of Object.entries(SUPERCOMPUTING_MAP)) {
        if (nameLower.includes(city)) {
          parentSuper = sc;
          break;
        }
      }
      if (!parentSuper) {
        const nodeIdLower = (n.node_id || '').toLowerCase();
        for (const [city, sc] of Object.entries(SUPERCOMPUTING_MAP)) {
          if (nodeIdLower.includes(city)) {
            parentSuper = sc;
            break;
          }
        }
      }
      return {
        node_name: nodeName,
        node_id: n.node_id || '',
        status: n.status || 'offline',
        cpu_percent: n.cpu_percent ?? n.cpu_usage ?? 0,
        mem_percent: n.mem_percent ?? n.memory_usage ?? 0,
        gpu_percent: n.gpu_percent ?? n.gpu_usage ?? 0,
        disk_percent: n.disk_percent ?? n.disk_usage ?? 0,
        parent_supercomputing: parentSuper,
      };
    })
    : []
);

const normalizeUsage = (usageRes: any): ResourceUsageItem[] => (
  Array.isArray(usageRes)
    ? (usageRes as any[]).map((item) => ({
      name: item.name,
      value: item.value,
    }))
    : []
);

const normalizeTrend = (trendRes: any): DailyTrendData => {
  if (!trendRes || typeof trendRes !== 'object') {
    return emptyTrendData();
  }
  const overview: TrendData = trendRes.dailyOverview || { x: [], series: [] };
  const detailMap = new Map<string, TrendData>();
  if (trendRes.dailyDetail && typeof trendRes.dailyDetail === 'object') {
    Object.entries(trendRes.dailyDetail).forEach(([day, data]: [string, any]) => {
      detailMap.set(day, data as TrendData);
    });
  }
  return { dailyOverview: overview, dailyDetailMap: detailMap };
};

export default function useTaskManagementData() {
  const [loading, setLoading] = useState(false);

  const [demands, setDemands] = useState<DemandItem[]>(() => taskPageCache.demands ?? []);
  const [nodes, setNodes] = useState<NodeItem[]>(() => taskPageCache.nodes ?? []);
  const [usage, setUsage] = useState<ResourceUsageItem[]>(() => taskPageCache.usage ?? []);
  const [trend, setTrend] = useState<DailyTrendData>(() => taskPageCache.trend ?? emptyTrendData());
  const [mapData, setMapData] = useState<MapNodeItem[]>(() => taskPageCache.mapData ?? []);

  const fetchData = async (signal?: AbortSignal) => {
    const hasWarmCache = isTaskPageCacheFresh();
    if (hasWarmCache) {
      if (taskPageCache.demands) setDemands(taskPageCache.demands);
      if (taskPageCache.nodes) setNodes(taskPageCache.nodes);
      if (taskPageCache.usage) setUsage(taskPageCache.usage);
      if (taskPageCache.trend) setTrend(taskPageCache.trend);
      if (taskPageCache.mapData) setMapData(taskPageCache.mapData);
    } else {
      setLoading(true);
    }

    try {
      console.log('===== 开始请求 TaskManagement 页面数据 =====');

      const [demandRes, nodesRes] = await Promise.all([
        getTaskDemands({ signal }).catch(() => []),
        getNodes().catch(() => ({ nodes: [], total: 0, online: 0 })),
      ]);

      if (signal?.aborted) return;

      const demandsData: any[] = Array.isArray(demandRes) ? demandRes : [];
      const nodesData = normalizeNodes(nodesRes);

      setDemands(demandsData);
      setNodes(nodesData);
      setLoading(false);

      taskPageCache.demands = demandsData;
      taskPageCache.nodes = nodesData;
      taskPageCache.updatedAt = Date.now();

      window.setTimeout(async () => {
        if (signal?.aborted) return;
        const [mapRes, usageRes, trendRes] = await Promise.all([
          getMapData().catch(() => taskPageCache.mapData ?? []),
          getResourceUsage().catch(() => taskPageCache.usage ?? []),
          getResourceTrend().catch(() => taskPageCache.trend ?? null),
        ]);
        if (signal?.aborted) return;

        const mapItems = normalizeMapItems(mapRes);
        const usageData = normalizeUsage(usageRes);
        const trendData = normalizeTrend(trendRes);

        setMapData(mapItems);
        setUsage(usageData);
        setTrend(trendData);

        taskPageCache.mapData = mapItems;
        taskPageCache.usage = usageData;
        taskPageCache.trend = trendData;
        taskPageCache.secondaryUpdatedAt = Date.now();
      }, hasWarmCache ? 800 : 120);

      console.log('===== 页面数据写入完成 =====');
    } catch (error: any) {
      if (error?.name === 'AbortError' || error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') return;
      console.error('❌ TaskManagement 页面接口请求失败：', error);

      if (!hasWarmCache) {
        setDemands([]);
        setNodes([]);
        setUsage([]);
        setTrend(emptyTrendData());
        setMapData([]);
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  const priorityGroups = useMemo<PriorityGroup[]>(() => {
    return PRIORITY_ORDER.map((level) => {
      const meta = PRIORITY_META[level];
      const items = demands.filter((d) => d.priority === level);
      return {
        ...meta,
        level,
        items,
        totalCpu: +items.reduce((s, d) => s + d.cpu, 0).toFixed(2),
        totalMemory: +items.reduce((s, d) => s + d.memory, 0).toFixed(2),
        totalGpu: +items.reduce((s, d) => s + d.gpu, 0).toFixed(2),
        totalStorage: +items.reduce((s, d) => s + d.storage, 0).toFixed(2),
      };
    });
  }, [demands]);

  const stats = useMemo<StatItem[]>(() => {
    const total = demands.length;
    const running = demands.filter((d) => d.status === '运行中').length;
    const onlineNodes = nodes.filter((n) => n.status === 'online');
    const healthyNodes = onlineNodes.length;
    const alertNodes = nodes.filter((n) => n.status === 'warning' || n.status === 'offline').length;
    const avgUsage = onlineNodes.length
      ? +(onlineNodes.reduce((s, n) => s + n.cpu_percent, 0) / onlineNodes.length).toFixed(1)
      : 0;
    return [
      { title: '全网任务总数', value: total },
      { title: '运行中', value: running },
      { title: '全网空闲算力', value: `${healthyNodes} 节点` },
      { title: '全网资源利用率', value: `${avgUsage}%` },
    ];
  }, [demands, nodes]);

  const nodeStatusGroups = useMemo<NodeStatusGroup[]>(() => {
    return NODE_STATUS_ORDER.map((status) => {
      const meta = NODE_STATUS_META[status];
      const items = nodes
        .filter((n) => n.status === status)
        .sort((a, b) => (b.cpu_percent + b.gpu_percent) - (a.cpu_percent + a.gpu_percent));
      const len = items.length || 1;
      return {
        ...meta,
        status,
        items,
        avgCpu: +(items.reduce((s, n) => s + n.cpu_percent, 0) / len).toFixed(1),
        avgMem: +(items.reduce((s, n) => s + n.mem_percent, 0) / len).toFixed(1),
        avgGpu: +(items.reduce((s, n) => s + n.gpu_percent, 0) / len).toFixed(1),
        avgDisk: +(items.reduce((s, n) => s + n.disk_percent, 0) / len).toFixed(1),
      };
    });
  }, [nodes]);

  const alerts = useMemo<ResourceAlert[]>(() => {
    const result: ResourceAlert[] = [];
    const now = Date.now();
    nodes.forEach((node) => {
      ALERT_THRESHOLDS.forEach((th) => {
        const value = node[th.field];
        if (value >= th.critical) {
          result.push({
            id: `${node.node_id}-${th.metric}-critical-${now}`,
            nodeId: node.node_id,
            nodeName: node.node_name,
            metric: th.label,
            value,
            threshold: th.critical,
            level: 'critical',
            message: `${node.node_name} ${th.label}达 ${value}${th.unit}，超过严重阈值 ${th.critical}${th.unit}`,
            timestamp: now,
          });
        } else if (value >= th.warning) {
          result.push({
            id: `${node.node_id}-${th.metric}-warning-${now}`,
            nodeId: node.node_id,
            nodeName: node.node_name,
            metric: th.label,
            value,
            threshold: th.warning,
            level: 'warning',
            message: `${node.node_name} ${th.label}达 ${value}${th.unit}，超过警告阈值 ${th.warning}${th.unit}`,
            timestamp: now,
          });
        }
      });
    });
    result.sort((a, b) => {
      if (a.level === 'critical' && b.level !== 'critical') return -1;
      if (a.level !== 'critical' && b.level === 'critical') return 1;
      return b.value - a.value;
    });
    return result;
  }, [nodes]);

  const [predictDates, setPredictDates] = useState<string[]>([]);
  const [predictTrend, setPredictTrend] = useState<{
    date: string;
    x: string[];
    currentTimeIndex: number;
    series: { name: string; data: number[] }[];
  } | null>(null);
  const [predictLoading, setPredictLoading] = useState(false);
  // 保存所有历史预测数据，避免切换日期时丢失
  const predictTrendHistoryRef = useRef<Map<string, {
    date: string;
    x: string[];
    currentTimeIndex: number;
    series: { name: string; data: number[] }[];
  }>>(new Map());
  const predictTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const predictDateRef = useRef<string | null>(null);

  const fetchPredictDates = useCallback(async () => {
    try {
      const res = await getPredictDates();
      const dates = (res as any)?.dates || [];
      setPredictDates(dates);
      return dates;
    } catch {
      return [];
    }
  }, []);

  const fetchPredictTrend = useCallback(async (date: string) => {
    setPredictLoading(true);
    predictDateRef.current = date;
    try {
      const res = await getPredictTrend(date);
      const trendData = res as any;
      // 保存到历史缓存中
      if (trendData) {
        predictTrendHistoryRef.current.set(date, trendData);
      }
      setPredictTrend(trendData);
    } catch {
      // 如果请求失败，尝试从历史缓存中获取
      const cached = predictTrendHistoryRef.current.get(date);
      if (cached) {
        setPredictTrend(cached);
      } else {
        setPredictTrend(null);
      }
    } finally {
      setPredictLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchData(ctrl.signal);

    // 初始加载：获取日期列表，默认查看今天的实时预测数据
    const today = new Date().toISOString().slice(0, 10);
    const predictBootstrapTimer = window.setTimeout(() => {
      fetchPredictTrend(today);
      fetchPredictDates();
    }, 900);

    // 每10秒轮询一次，只对当天数据进行实时预测更新
    predictTimerRef.current = setInterval(() => {
      const today = new Date().toISOString().slice(0, 10);
      const currentDate = predictDateRef.current;

      // 只对当天数据进行实时更新，历史数据保持不变
      if (currentDate && currentDate === today) {
        getPredictTrend(currentDate).then((res) => {
          const trendData = res as any;
          if (trendData) {
            // 更新当前显示的数据（如果是今天）
            predictTrendHistoryRef.current.set(currentDate, trendData);
            setPredictTrend(trendData);
          }
        }).catch(() => {});
      }
    }, 10000);

    return () => {
      ctrl.abort();
      window.clearTimeout(predictBootstrapTimer);
      if (predictTimerRef.current) {
        clearInterval(predictTimerRef.current);
      }
    };
  }, []);

  return {
    loading,
    demands,
    nodes,
    stats,
    usage,
    trend,
    mapData,
    priorityGroups,
    nodeStatusGroups,
    alerts,
    refresh: fetchData,
    predictDates,
    predictTrend,
    predictLoading,
    fetchPredictTrend,
  };
}
