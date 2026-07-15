import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Descriptions, Space, Tag, Typography, notification, theme, Button } from 'antd';
import { ArrowRightOutlined, RocketOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { ALL_COMPUTE_NODE_IDS, NODE_META } from '../shared/nodeMeta';
import type { NodeId } from '../shared/nodeMeta';
import { useReplayEngine } from '../shared/replay/useReplayEngine';
import { buildNodeLineOption, buildGpuOption } from '../shared/options/nodeOption';
import { round, getLoadColor } from '../shared/constants';
import { getAllocationKpi, getResourceSensingInsights } from '@/services/api/predictionAllocation';
import type { AllocationKpiResponse } from '@/services/api/predictionAllocation';
import { getSensingData } from '@/services/api';
import type { DiskUsage } from '../shared/replay/types';
import NodeDetailPanel from './NodeDetailPanel';
import './index.css';

/**
 * 后端 /resources/sensing 返回的节点数据结构
 */
interface SensingNode {
  node_id: string;
  node_name: string;
  cpu: number;
  memory: number;
  gpu: number;
  disk: number;
  bandwidth: number;
  latency: number;
  jitter: number;
  packet_loss: number;
  gpu_usage_list: number[];
  gpu_memory_list: number[];
  disk_list: { name: string; percent: number }[];
  metric_time: string;
}

interface SensingTrend {
  timestamps: string[];
  cpu_avg: number[];
  memory_avg: number[];
}

interface SensingSummary {
  avg_cpu: number;
  avg_memory: number;
  avg_gpu: number;
  avg_disk: number;
  online_count: number;
  total_count: number;
  warning_count: number;
}

interface SensingData {
  nodes: SensingNode[];
  trend: SensingTrend;
  summary: SensingSummary;
}

const getInsightNodeName = (item: any) => (
  item?.nodeName ?? item?.name ?? item?.node_id ?? item?.nodeId ?? '--'
);

const renderInsightNodes = (items: any[] | undefined, limit: number, empty = '--') => {
  const visibleItems = (items ?? []).slice(0, limit);
  if (!visibleItems.length) {
    return <span className="resource-sensing-insight-empty">{empty}</span>;
  }
  return visibleItems.map((item, index) => (
    <span key={`${getInsightNodeName(item)}-${index}`} className="resource-sensing-insight-token">
      {getInsightNodeName(item)}
    </span>
  ));
};

const renderRegionPressure = (items: any[] | undefined) => {
  const visibleItems = (items ?? []).slice(0, 3);
  if (!visibleItems.length) {
    return <span className="resource-sensing-insight-empty">--</span>;
  }
  return visibleItems.map((item, index) => {
    const pressure = Number(item?.pressure);
    const pressureText = Number.isFinite(pressure) ? `${pressure.toFixed(1)}%` : '--';
    return (
      <span key={`${item?.regionName ?? item?.regionId ?? 'region'}-${index}`} className="resource-sensing-insight-token resource-sensing-insight-token--metric">
        <b>{item?.regionName ?? item?.regionId ?? '--'}</b>
        <em>{pressureText}</em>
      </span>
    );
  });
};

/**
 * 算力资源感知（Module 2, Page 1）—— 全局 + 单节点资源感知合一
 *
 * 数据源优先级：
 *   1. 后端 /resources/sensing（ts_node_metric 仿真表，每 10s 轮询）
 *   2. 前端 useReplayEngine（sin/cos 回放，fallback）
 *
 * 全局层（三个同级卡片）：资源池总览 / 全网负载趋势 / 节点负载 Top 榜单
 * 单节点层：单节点资源监控（CPU/内存/GPU/磁盘/网络）
 */
const ResourceSensing: React.FC = () => {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  // 前端 replay 引擎（fallback 数据源）
  const { nodeReplayMap } = useReplayEngine();
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId>(ALL_COMPUTE_NODE_IDS[0]);
  const [dbKpi, setDbKpi] = useState<AllocationKpiResponse | null>(null);
  const [sensingInsights, setSensingInsights] = useState<any>(null);
  const dataSourceNotifiedRef = useRef(false);

  // 后端 sensing 数据（主数据源）
  const [sensingData, setSensingData] = useState<SensingData | null>(null);

  /** 数据源连接状态通知：成功弹绿色、失败弹红色，整个页面生命周期只弹一次 */
  const notifyDataSource = React.useCallback((online: boolean, detail?: string) => {
    if (dataSourceNotifiedRef.current) return;
    dataSourceNotifiedRef.current = true;
    if (online) {
      notification.success({
        message: '数据库已连接',
        description: detail ?? '实时监控数据来自 ts_node_metric 仿真表。',
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

  // ---- 轮询后端 /resources/sensing（每 10 秒）----
  useEffect(() => {
    let cancelled = false;
    const fetchData = () => {
      getSensingData(40)
        .then((payload: any) => {
          if (cancelled || !payload || !Array.isArray(payload.nodes)) return;
          if (payload.nodes.length > 0) {
            setSensingData(payload as SensingData);
            notifyDataSource(true, `已加载 ${payload.nodes.length} 个节点的实时数据`);
          }
        })
        .catch(() => {
          notifyDataSource(false);
        });
    };
    fetchData();
    const timer = window.setInterval(fetchData, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [notifyDataSource]);

  useEffect(() => {
    let cancelled = false;
    getAllocationKpi('global')
      .then((payload) => {
        if (cancelled || !payload || typeof payload.avgDelay !== 'number') return;
        setDbKpi(payload);
      })
      .catch(() => {
        setDbKpi(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getResourceSensingInsights()
      .then((payload) => {
        if (!cancelled) setSensingInsights(payload);
      })
      .catch(() => {
        if (!cancelled) setSensingInsights(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- 将后端 sensing 节点数据按顺序映射到前端 NODE_META ----
  // 数据库返回的 node_id 与前端 NODE_META 的 key 可能不同，
  // 按顺序一一映射（都是 14 个节点，按 node_id 排序）
  const sensingNodeMap = useMemo(() => {
    if (!sensingData || !sensingData.nodes.length) return null;
    const map: Record<string, SensingNode> = {};
    sensingData.nodes.forEach((node, index) => {
      // 按顺序映射到 ALL_COMPUTE_NODE_IDS
      const frontId = ALL_COMPUTE_NODE_IDS[index];
      if (frontId) {
        map[frontId] = node;
      }
    });
    return map;
  }, [sensingData]);

  // ---- 全局聚合指标 ----
  const aggregate = useMemo(() => {
    // 优先使用后端 sensing 汇总数据
    if (sensingData?.summary) {
      const s = sensingData.summary;
      const nodeIds = ALL_COMPUTE_NODE_IDS.filter((id) => sensingNodeMap?.[id]);
      const totalGpuCards = nodeIds.reduce((sum, id) => sum + NODE_META[id].gpuNames.length, 0);
      const totalGpuMemory = nodeIds.reduce((sum, id) => sum + NODE_META[id].gpuTotals.reduce((a, b) => a + b, 0), 0);
      return {
        nodeCount: s.total_count || nodeIds.length,
        avgCpu: s.avg_cpu,
        avgMemory: s.avg_memory,
        avgGpu: s.avg_gpu,
        totalGpuCards,
        totalGpuMemory,
        warningCount: s.warning_count,
      };
    }
    // fallback: 前端 replay
    const nodeIds = ALL_COMPUTE_NODE_IDS.filter((id) => nodeReplayMap[id]);
    const n = Math.max(nodeIds.length, 1);
    const avgCpu = round(nodeIds.reduce((s, id) => s + nodeReplayMap[id].latest.cpu, 0) / n);
    const avgMemory = round(nodeIds.reduce((s, id) => s + nodeReplayMap[id].latest.memory, 0) / n);
    const avgGpu = round(nodeIds.reduce((s, id) => {
      const g = nodeReplayMap[id].latest.gpuUsage;
      return s + g.reduce((a, b) => a + b, 0) / Math.max(g.length, 1);
    }, 0) / n);
    const totalGpuCards = nodeIds.reduce((s, id) => s + NODE_META[id].gpuNames.length, 0);
    const totalGpuMemory = nodeIds.reduce((s, id) => s + NODE_META[id].gpuTotals.reduce((a, b) => a + b, 0), 0);
    return { nodeCount: nodeIds.length, avgCpu, avgMemory, avgGpu, totalGpuCards, totalGpuMemory, warningCount: 0 };
  }, [sensingData, sensingNodeMap, nodeReplayMap]);

  const overviewItems = useMemo(() => [
    { label: '算力节点数', value: `${aggregate.nodeCount}` },
    { label: 'GPU 卡数', value: `${aggregate.totalGpuCards}` },
    { label: 'GPU 显存总量', value: `${dbKpi?.totalGpuMemory ?? aggregate.totalGpuMemory} GB` },
    { label: '平均带宽', value: `${dbKpi?.avgBandwidth ?? '--'} Gbps` },
    { label: '平均 CPU', value: `${aggregate.avgCpu}%` },
    { label: '平均内存', value: `${aggregate.avgMemory}%` },
    { label: '平均 GPU', value: `${aggregate.avgGpu}%` },
    { label: '告警节点', value: `${aggregate.warningCount}` },
  ], [aggregate, dbKpi]);

  // ---- 全网负载趋势图 ----
  const networkTrendOption = useMemo<EChartsOption>(() => {
    // 优先使用后端 sensing 趋势数据
    if (sensingData?.trend && sensingData.trend.timestamps.length > 0) {
      return {
        tooltip: { trigger: 'axis' },
        legend: { top: 0, textStyle: { color: token.colorTextSecondary } },
        grid: { left: 40, right: 16, top: 40, bottom: 28 },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: sensingData.trend.timestamps,
          axisLabel: { color: token.colorTextTertiary, interval: 4 },
        },
        yAxis: {
          type: 'value',
          max: 100,
          axisLabel: { color: token.colorTextTertiary, formatter: '{value}%' },
          splitLine: { lineStyle: { color: token.colorBorderSecondary } },
        },
        series: [
          { name: 'CPU', type: 'line', smooth: true, symbol: 'none', data: sensingData.trend.cpu_avg, lineStyle: { width: 2.5, color: token.colorPrimary }, areaStyle: { color: `${token.colorPrimary}22` } },
          { name: '内存', type: 'line', smooth: true, symbol: 'none', data: sensingData.trend.memory_avg, lineStyle: { width: 2.5, color: token.colorSuccess }, areaStyle: { color: `${token.colorSuccess}22` } },
        ],
      };
    }
    // fallback: 前端 replay
    const nodeIds = ALL_COMPUTE_NODE_IDS.filter((id) => nodeReplayMap[id]);
    if (nodeIds.length === 0) return {};
    const timestamps = nodeReplayMap[nodeIds[0]].cpuSeries.map((p) => p.timestamp);
    const cpuAvg = timestamps.map((_, i) => round(nodeIds.reduce((s, id) => s + (nodeReplayMap[id].cpuSeries[i]?.value ?? 0), 0) / nodeIds.length));
    const memAvg = timestamps.map((_, i) => round(nodeIds.reduce((s, id) => s + (nodeReplayMap[id].memorySeries[i]?.value ?? 0), 0) / nodeIds.length));
    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0, textStyle: { color: token.colorTextSecondary } },
      grid: { left: 40, right: 16, top: 40, bottom: 28 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: timestamps.map((t) => dayjs(t).format('HH:mm:ss')),
        axisLabel: { color: token.colorTextTertiary, interval: 4 },
      },
      yAxis: {
        type: 'value',
        max: 100,
        axisLabel: { color: token.colorTextTertiary, formatter: '{value}%' },
        splitLine: { lineStyle: { color: token.colorBorderSecondary } },
      },
      series: [
        { name: 'CPU', type: 'line', smooth: true, symbol: 'none', data: cpuAvg, lineStyle: { width: 2.5, color: token.colorPrimary }, areaStyle: { color: `${token.colorPrimary}22` } },
        { name: '内存', type: 'line', smooth: true, symbol: 'none', data: memAvg, lineStyle: { width: 2.5, color: token.colorSuccess }, areaStyle: { color: `${token.colorSuccess}22` } },
      ],
    };
  }, [sensingData, nodeReplayMap, token]);

  // ---- 节点负载 Top 榜单（CPU 降序，取前 8）----
  const nodeLoadTop = useMemo(() => {
    // 优先使用后端 sensing 数据
    if (sensingNodeMap) {
      return ALL_COMPUTE_NODE_IDS
        .filter((id) => sensingNodeMap[id])
        .map((id) => ({ id, name: NODE_META[id].name, cpu: sensingNodeMap[id].cpu }))
        .sort((a, b) => b.cpu - a.cpu)
        .slice(0, 8);
    }
    // fallback: 前端 replay
    return ALL_COMPUTE_NODE_IDS
      .filter((id) => nodeReplayMap[id])
      .map((id) => ({ id, name: NODE_META[id].name, cpu: nodeReplayMap[id].latest.cpu }))
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 8);
  }, [sensingNodeMap, nodeReplayMap]);

  // ---- 单节点详情面板数据 ----
  // 用后端最新值覆盖 replay 的 latest，历史序列仍用 replay（过渡方案）
  const currentNodeMeta = NODE_META[selectedNodeId];
  const currentNodeReplay = nodeReplayMap[selectedNodeId];
  const currentSensingNode = sensingNodeMap?.[selectedNodeId];

  // 如果有后端数据，用后端最新值构造 latest；否则用 replay
  const currentLatest = useMemo(() => {
    if (currentSensingNode) {
      // 用后端数据覆盖 replay 的 latest
      const disks: DiskUsage[] = currentSensingNode.disk_list.map((d, i) => ({
        name: d.name,
        percent: d.percent,
        color: ['#1677ff', '#52c41a', '#faad14', '#722ed1'][i % 4],
      }));
      return {
        ...currentNodeReplay.latest,
        cpu: currentSensingNode.cpu,
        memory: currentSensingNode.memory,
        bandwidth: currentSensingNode.bandwidth,
        latency: currentSensingNode.latency,
        jitter: currentSensingNode.jitter,
        packetLoss: currentSensingNode.packet_loss,
        egressBandwidth: currentSensingNode.bandwidth,
        gpuUsage: currentSensingNode.gpu_usage_list.length > 0
          ? currentSensingNode.gpu_usage_list
          : currentNodeReplay.latest.gpuUsage,
        gpuMemory: currentSensingNode.gpu_memory_list.length > 0
          ? currentSensingNode.gpu_memory_list
          : currentNodeReplay.latest.gpuMemory,
        disks,
      };
    }
    return currentNodeReplay.latest;
  }, [currentSensingNode, currentNodeReplay]);

  const cpuOption = useMemo(
    () => buildNodeLineOption('最近60秒 CPU利用率', currentNodeReplay.cpuSeries, token.colorPrimary, token),
    [currentNodeReplay.cpuSeries, token],
  );
  const memoryOption = useMemo(
    () => buildNodeLineOption('最近60秒 内存利用率', currentNodeReplay.memorySeries, token.colorSuccess, token),
    [currentNodeReplay.memorySeries, token],
  );
  const gpuOption = useMemo(
    () => buildGpuOption(currentNodeMeta, currentLatest, token),
    [currentNodeMeta, currentLatest, token],
  );

  return (
    <div className="resource-sensing-page">
      <Card size="small" className="resource-sensing-entry-card">
        <div className="resource-sensing-entry-bar">
          <div className="resource-sensing-entry-bar--green" />
          <div className="resource-sensing-entry-content">
            <RocketOutlined className="resource-sensing-entry-icon" />
            <div>
              <span>算力资源感知</span>
              <strong>实时监测全网节点 CPU / 内存 / GPU / 磁盘 / 网络负载，为调度决策提供数据来源</strong>
            </div>
          </div>
          <Button type="primary" ghost icon={<ArrowRightOutlined />} onClick={() => navigate('/computing/prediction-allocation')}>
            前往调度中枢
          </Button>
        </div>
      </Card>

      {sensingInsights && (
        <Card className="resource-sensing-insight-card" styles={{ body: { padding: 0 } }}>
          <div className="resource-sensing-insight-hero">
            <span>资源调度摘要</span>
            <strong>当前优先调度低负载、高可信、网络质量好的节点</strong>
            <div className="resource-sensing-insight-hero-tokens">
              {renderInsightNodes(sensingInsights.idleTop5, 3, '空闲节点待刷新')}
            </div>
          </div>
          <div className="resource-sensing-insight-grid">
            <div className="resource-sensing-insight-item resource-sensing-insight-item--good">
              <span>空闲 Top5</span>
              <strong>{renderInsightNodes(sensingInsights.idleTop5, 5)}</strong>
            </div>
            <div className="resource-sensing-insight-item resource-sensing-insight-item--risk">
              <span>高负载 Top5</span>
              <strong>{renderInsightNodes(sensingInsights.highLoadTop5, 5)}</strong>
            </div>
            <div className="resource-sensing-insight-item">
              <span>GPU 富裕</span>
              <strong>{renderInsightNodes(sensingInsights.gpuRichNodes, 3)}</strong>
            </div>
            <div className="resource-sensing-insight-item resource-sensing-insight-item--risk">
              <span>风险节点</span>
              <strong>{renderInsightNodes(sensingInsights.riskyNodes, 3, '暂无')}</strong>
            </div>
            <div className="resource-sensing-insight-item">
              <span>网络最佳</span>
              <strong>{renderInsightNodes(sensingInsights.bestNetworkNodes, 3)}</strong>
            </div>
            <div className="resource-sensing-insight-item">
              <span>区域压力</span>
              <strong>{renderRegionPressure(sensingInsights.regionPressure)}</strong>
            </div>
          </div>
        </Card>
      )}

      {/* 全局层：三个同级卡片横排铺满 */}
      <div className="resource-sensing-global-grid">
        <Card title="算力网络资源池总览" className="resource-sensing-global-card">
          <Descriptions column={2} bordered size="small">
            {overviewItems.map((r) => (
              <Descriptions.Item key={r.label} label={r.label}>
                {r.value}
              </Descriptions.Item>
            ))}
          </Descriptions>
        </Card>

        <Card title="全网负载变化趋势" className="resource-sensing-global-card">
          <ReactECharts option={networkTrendOption} style={{ height: 260 }} notMerge lazyUpdate />
        </Card>

        <Card title="节点负载 Top 榜单" className="resource-sensing-global-card" extra={<Tag color="default">点击查看详情</Tag>}>
          <div className="resource-sensing-rank-list">
            {nodeLoadTop.map((node, idx) => {
              const active = node.id === selectedNodeId;
              return (
                <button
                  type="button"
                  key={node.id}
                  className={`resource-sensing-rank-item${active ? ' resource-sensing-rank-item--active' : ''}`}
                  onClick={() => setSelectedNodeId(node.id)}
                >
                  <span className={`resource-sensing-rank-no${idx < 3 ? ' resource-sensing-rank-no--top' : ''}`}>{idx + 1}</span>
                  <span className="resource-sensing-rank-name">{node.name}</span>
                  <span className="resource-sensing-rank-bar">
                    <span
                      className="resource-sensing-rank-bar-fill"
                      style={{ width: `${node.cpu}%`, background: getLoadColor(node.cpu) }}
                    />
                  </span>
                  <Tag style={{ margin: 0, color: '#fff', background: getLoadColor(node.cpu), border: 'none' }}>
                    {node.cpu}%
                  </Tag>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* 单节点资源监控 */}
      <NodeDetailPanel
        currentNodeMeta={currentNodeMeta}
        cpuOption={cpuOption}
        memoryOption={memoryOption}
        gpuOption={gpuOption}
        latestLatency={currentLatest.latency}
        latestJitter={currentLatest.jitter}
        latestPacketLoss={currentLatest.packetLoss}
        latestBandwidth={currentLatest.egressBandwidth}
        disks={currentLatest.disks}
        selectableNodeIds={ALL_COMPUTE_NODE_IDS}
        selectedNodeId={selectedNodeId}
        onNodeChange={setSelectedNodeId}
        nodeMetaMap={NODE_META}
      />
    </div>
  );
};

export default ResourceSensing;
