import React from 'react';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  ArrowRightOutlined,
  RadarChartOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import {
  Badge,
  Button,
  Card,
  Descriptions,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import { PieChart } from '@/components/Charts';
import TopologyGraph, {
  TopologyEdge,
  TopologyNode,
} from '@/components/TopologyGraph';
import type { DecisionContextResponse, NodeInsightResponse } from '@/services/api/predictionAllocation';
import { NODE_META } from '../../shared/nodeMeta';

const { Text } = Typography;

const formatScore = (value?: number | string) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return numeric.toFixed(1);
};

const topologyNodeAliases = (node?: TopologyNode | null) => {
  if (!node) return [];
  const data = (node.data ?? {}) as Record<string, unknown>;
  return Array.from(new Set([
    node.id,
    data.id,
    data.nodeId,
    data.computeNodeId,
    data.compute_node_id,
    data.vertexId,
  ].map((value) => String(value ?? '')).filter(Boolean)));
};

const aliasesInclude = (aliases: string[], value?: string | null) => {
  const normalized = String(value ?? '');
  return Boolean(normalized) && aliases.some((item) => (
    item === normalized || item.toLowerCase() === normalized.toLowerCase()
  ));
};

/* ---------- Types shared with parent ---------- */

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

export interface TopologyPanelData {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

export interface ScheduleLogEntry {
  time: string;
  phase: string;
  message: string;
}

export interface PerspectiveProfile {
  value: string;
  label: string;
  kind: string;
  nodeIds?: string[];
  nodeId?: string;
}

export interface SelectedCandidate {
  nodeId: string;
  nodeName: string;
  rankNo: number;
  scoreTotal: number;
  resourceFit: number;
  latency: number;
  bandwidth: number;
  balance: number;
  riskPenalty: number;
}

/* ---------- SCHEDULE_LOG_PHASES stub ---------- */
// This is imported from parent – we pass scheduleLogs directly instead.

export interface TopologyTabProps {
  topologyPanelData: TopologyPanelData;
  topologyCanvasHeight: number;
  selectedTopologyNode: TopologyNode | null;
  onNodeSelect: (node: TopologyNode | null) => void;
  currentPerspective: PerspectiveProfile;
  displayGlobalKpis: GlobalKpis;
  loadTop5: Array<{ name: string; value: number; predicted: number }>;
  taskTypeData: Array<{ name: string; value: number }>;
  displayDecisionContext: DecisionContextResponse;
  scheduleLogs: ScheduleLogEntry[];
  nodeInsight: NodeInsightResponse | null;
  colorPrimary: string;
  colorSuccess: string;
  colorError: string;
  colorTextSecondary: string;
  colorWarning: string;
  trendColor: (value: number, reverse?: boolean) => string;
  hasHubLogs: boolean;
  /** 层级视角下拉框：当前值 */
  perspective: string;
  /** 层级视角下拉框：切换回调 */
  onPerspectiveChange: (value: string) => void;
  /** 层级视角下拉框：选项列表 */
  perspectiveSelectOptions: Array<{
    label: string;
    value?: string;
    options?: Array<{ label: string; value: string }>;
  }>;
  /** 聚焦节点：当前值 */
  focusedNodeId: string | null;
  /** 聚焦节点：切换回调 */
  onFocusedNodeIdChange: (value: string | null) => void;
  /** 虚拟时间字符串（显示在卡片标题栏） */
  virtualTime: string;
  /** 页面跳转回调（用于追溯感知/预测来源） */
  onNavigate?: (path: string) => void;
}

const TopologyTab: React.FC<TopologyTabProps> = ({
  topologyPanelData,
  topologyCanvasHeight,
  selectedTopologyNode,
  onNodeSelect,
  currentPerspective,
  displayGlobalKpis,
  loadTop5,
  taskTypeData,
  displayDecisionContext,
  scheduleLogs,
  nodeInsight,
  colorPrimary,
  colorWarning,
  trendColor,
  hasHubLogs,
  perspective,
  onPerspectiveChange,
  perspectiveSelectOptions,
  focusedNodeId,
  onFocusedNodeIdChange,
  virtualTime,
  onNavigate,
}) => {
  const selectedTopologyData = (selectedTopologyNode?.data ?? {}) as Record<string, string>;
  const contextSummaries = (displayDecisionContext as any).summaries ?? {};
  const predictionSummary = contextSummaries.predictionPressure ?? (displayDecisionContext as any).predictionPressureSummary;
  const resourceSummary = contextSummaries.resourceDispatch ?? (displayDecisionContext as any).resourceDispatchSummary;
  const selectedAliases = topologyNodeAliases(selectedTopologyNode);
  const selectedNodeId = (selectedTopologyNode?.id ?? selectedTopologyData.id ?? nodeInsight?.vertexId ?? nodeInsight?.nodeId ?? '') as string;
  const selectedComputeNodeId = (selectedTopologyData.computeNodeId ?? selectedTopologyData.compute_node_id ?? selectedTopologyData.nodeId ?? nodeInsight?.nodeId ?? selectedNodeId) as string;
  const selectedCandidate = selectedAliases.length
    ? displayDecisionContext.candidates.find((item) => aliasesInclude(selectedAliases, item.nodeId))
    : undefined;
  const targetAliases = [
    displayDecisionContext.targetNodeId,
    displayDecisionContext.task.targetNodeId,
  ].map((value) => String(value ?? '')).filter(Boolean);
  const selectedIsTarget = Boolean(
    selectedNodeId
    && (targetAliases.some((target) => aliasesInclude(selectedAliases, target)) || nodeInsight?.isTarget),
  );
  const handleFocusedNodeChange = (value?: string | null) => {
    onFocusedNodeIdChange(value ?? null);
    const nextNode = value ? topologyPanelData.nodes.find((node) => aliasesInclude(topologyNodeAliases(node), value)) : null;
    onNodeSelect(nextNode ?? null);
  };
  const loadChartMaxValue = Math.max(
    0,
    ...loadTop5.flatMap((item) => [item.value, item.predicted]),
  );
  const loadChartAxisMax = Math.min(
    100,
    Math.max(35, Math.ceil((loadChartMaxValue + 5) / 5) * 5),
  );
  const loadChartAxisInterval = Math.max(10, Math.ceil(loadChartAxisMax / 4 / 5) * 5);

  return (
    <>
      <Card
        title="算力网络协同分配拓扑"
        className="prediction-allocation-topology-panel"
        extra={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* 虚拟时间 */}
            <Tag color="blue">{virtualTime}</Tag>
            {/* 层级视角下拉框：只控制拓扑图内容 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>层级视角</Text>
              <Select
                value={perspective}
                size="small"
                style={{ width: 176 }}
                onChange={(value) => onPerspectiveChange(value as string)}
                options={perspectiveSelectOptions}
                showSearch
                optionFilterProp="label"
              />
            </div>
            {/* 聚焦节点：只在 province/region 层级显示 */}
            {(currentPerspective.kind === 'province' || currentPerspective.kind === 'region') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>聚焦节点</Text>
                <Select
                  value={focusedNodeId ?? undefined}
                  size="small"
                  style={{ width: 156 }}
                  placeholder="选择节点"
                  allowClear
                  onChange={(value) => handleFocusedNodeChange(value ?? null)}
                  options={(currentPerspective.nodeIds ?? []).map((id) => ({
                    label: NODE_META[id] ? `${NODE_META[id].name}（${NODE_META[id].layer === 'dc' ? 'DC' : '边缘'}）` : id,
                    value: id,
                  }))}
                  showSearch
                  optionFilterProp="label"
                />
              </div>
            )}
            {/* 图例 */}
            <div className="prediction-allocation-topology-legend">
              <span className="prediction-allocation-legend-item">
                <span className="prediction-allocation-legend-swatch prediction-allocation-legend-swatch--load" />
                负载颜色：绿/黄/红
              </span>
              <span className="prediction-allocation-legend-item">
                <span className="prediction-allocation-legend-swatch prediction-allocation-legend-swatch--ring" />
                虚线环：预测负载半径
              </span>
            </div>
          </div>
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
              disableZoom={false}
              selectedNodeId={selectedTopologyNode?.id}
              onNodeSelect={onNodeSelect}
            />
          </div>

          {/* Overview row: KPI + Load Top5 + Task pie */}
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
                style={{ height: '100%', minHeight: 198 }}
                notMerge
                lazyUpdate
                option={{
                  animationDuration: 260,
                  tooltip: {
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' },
                    valueFormatter: (value: number) => `${formatScore(value)}%`,
                  },
                  legend: {
                    top: 2,
                    right: 8,
                    itemWidth: 16,
                    itemHeight: 8,
                    itemGap: 10,
                    textStyle: { fontSize: 11, color: '#475569' },
                  },
                  grid: { top: 30, right: 18, bottom: 16, left: 6, containLabel: true },
                  xAxis: {
                    type: 'value',
                    max: loadChartAxisMax,
                    interval: loadChartAxisInterval,
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: { margin: 6, fontSize: 10, color: '#64748b', formatter: '{value}' },
                    splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.18)' } },
                  },
                  yAxis: {
                    type: 'category',
                    inverse: true,
                    data: loadTop5.map((item) => item.name),
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: {
                      width: 58,
                      overflow: 'truncate',
                      fontSize: 11,
                      fontWeight: 500,
                      color: '#1f2937',
                      margin: 8,
                    },
                  },
                  series: [
                    {
                      name: '预测负载',
                      type: 'bar',
                      data: loadTop5.map((item) => item.predicted),
                      itemStyle: {
                        color: 'rgba(255, 255, 255, 0)',
                        borderColor: colorWarning,
                        borderWidth: 1.5,
                        borderType: 'dashed',
                        borderRadius: [0, 7, 7, 0],
                      },
                      barWidth: 14,
                      barCategoryGap: '44%',
                      z: 1,
                    },
                    {
                      name: '当前负载',
                      type: 'bar',
                      data: loadTop5.map((item) => item.value),
                      barGap: '-78%',
                      itemStyle: { color: colorPrimary, borderRadius: [0, 5, 5, 0] },
                      label: {
                        show: true,
                        position: 'right',
                        formatter: ({ value }: { value?: number | string }) => `${formatScore(value)}%`,
                        color: '#334155',
                        fontSize: 10,
                        distance: 3,
                      },
                      barWidth: 8,
                      z: 2,
                    },
                  ],
                }}
              />
            </Card>

            <Card size="small" className="prediction-allocation-overview-chart" title="任务分配类型占比">
              <PieChart data={taskTypeData} height={220} />
            </Card>
          </div>

          {/* Context info panel */}
          <Card
            size="small"
            title={selectedTopologyNode ? `节点画像 · ${selectedTopologyNode.label}` : '全局调度上下文'}
            className="prediction-allocation-topology-info"
          >
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <div className="prediction-allocation-context-summary">
                <div>
                  <Text type="secondary" className="prediction-allocation-context-label">当前任务</Text>
                  <div className="prediction-allocation-context-title">{displayDecisionContext.task.id}</div>
                  <Text type="secondary">{displayDecisionContext.task.name}</Text>
                </div>
                <Tag color="processing">{displayDecisionContext.stage}</Tag>
              </div>

              {(predictionSummary || resourceSummary) && (
                <div className="prediction-allocation-context-section">
                  <div className="prediction-allocation-section-title">调度依据</div>
                  {predictionSummary && (
                    <div className="prediction-allocation-basis-item prediction-allocation-basis-item--pressure">
                      <div className="prediction-allocation-basis-main">
                        <span>预测压力</span>
                        <strong>{predictionSummary.recommendedWindow ?? '滚动预测已纳入评分'}</strong>
                      </div>
                      {onNavigate && (
                        <Tooltip title="跳转到算力需求预测页面">
                          <Button type="link" size="small" icon={<LineChartOutlined />} onClick={() => onNavigate('/computing/demand-forecast')}>
                            查看预测 <ArrowRightOutlined />
                          </Button>
                        </Tooltip>
                      )}
                    </div>
                  )}
                  {resourceSummary && (
                    <div className="prediction-allocation-basis-item prediction-allocation-basis-item--resource">
                      <div className="prediction-allocation-basis-main">
                        <span>资源调度</span>
                        <strong>{(resourceSummary.idleTop5 ?? []).slice(0, 2).map((i: any) => i.nodeName).join('、') || '--'}</strong>
                      </div>
                      {onNavigate && (
                        <Tooltip title="跳转到算力资源感知页面">
                          <Button type="link" size="small" icon={<RadarChartOutlined />} onClick={() => onNavigate('/computing/resource-sensing')}>
                            查看感知 <ArrowRightOutlined />
                          </Button>
                        </Tooltip>
                      )}
                    </div>
                  )}
                </div>
              )}

              {!selectedTopologyNode ? (
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>全局调度链</Text>
                        <Space direction="vertical" size={10} style={{ width: '100%' }}>
                          <Descriptions
                            bordered
                            size="small"
                            column={1}
                            items={[
                              { key: 'target', label: '目标节点', children: displayDecisionContext.targetNodeName ?? displayDecisionContext.targetNodeId ?? '--' },
                              { key: 'reason', label: '选中原因', children: displayDecisionContext.selectedReason },
                            ]}
                          />
                          <div className="prediction-allocation-candidate-list">
                            {displayDecisionContext.candidates.map((item) => (
                              <div key={item.nodeId} className="prediction-allocation-candidate-item">
                                <div className="prediction-allocation-candidate-main">
                                  <Tag color={item.rankNo === 1 ? 'blue' : 'default'}>#{item.rankNo}</Tag>
                                  <Text strong>{item.nodeName}</Text>
                                </div>
                                <div className="prediction-allocation-candidate-score">{formatScore(item.scoreTotal)}</div>
                              </div>
                            ))}
                          </div>
                          <div className="prediction-allocation-log-stream prediction-allocation-log-stream--compact">
                            {displayDecisionContext.logs.slice(-6).map((log, idx) => (
                              <div key={`${log.time}-${idx}`} className="prediction-allocation-log-line">
                                <Text type="secondary" className="prediction-allocation-log-time">[{log.time}]</Text>
                                <Tag className="prediction-allocation-log-phase" color={log.phase === '安全' ? 'red' : log.phase === '策略' ? 'purple' : log.phase === '决策' ? 'gold' : 'blue'}>
                                  {log.phase}
                                </Tag>
                                <Text className="prediction-allocation-log-msg">{log.message}</Text>
                              </div>
                            ))}
                          </div>
                        </Space>
                </div>
              ) : hasHubLogs ? (
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>中枢决策日志</Text>
                        <div className="prediction-allocation-log-panel">
                          <div className="prediction-allocation-log-stream prediction-allocation-log-stream--compact" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
                            {(scheduleLogs.length > 0 ? scheduleLogs : displayDecisionContext.logs).map((log, idx) => (
                              <div key={idx} className="prediction-allocation-log-line">
                                <Text type="secondary" className="prediction-allocation-log-time">[{log.time}]</Text>
                                <Tag
                                  color={log.phase === '感知' ? 'blue' : log.phase === '决策' ? 'gold' : log.phase === '下发' ? 'orange' : log.phase === '策略' ? 'purple' : log.phase === '安全' ? 'red' : 'green'}
                                  className="prediction-allocation-log-phase"
                                >
                                  {log.phase}
                                </Tag>
                                <Text className="prediction-allocation-log-msg">{log.message}</Text>
                              </div>
                            ))}
                          </div>
                        </div>
                </div>
              ) : (
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>节点调度画像</Text>
                        <Space direction="vertical" size={10} style={{ width: '100%' }}>
                          <div className="prediction-allocation-tag-list">
                            <Tag color={selectedIsTarget ? 'blue' : 'default'}>{selectedIsTarget ? '目标节点' : '候选/路径节点'}</Tag>
                            <Tag color={nodeInsight?.status === 'offline' ? 'error' : 'processing'}>{nodeInsight?.status ?? selectedTopologyData.statusText ?? 'online'}</Tag>
                            <Tag color="gold">可信度 {formatScore(nodeInsight?.trustScore ?? selectedCandidate?.balance)}</Tag>
                          </div>
                          <Descriptions
                            bordered
                            size="small"
                            column={1}
                            items={[
                              { key: 'id', label: '拓扑/节点 ID', children: `${selectedNodeId}${selectedComputeNodeId && selectedComputeNodeId !== selectedNodeId ? ` / ${selectedComputeNodeId}` : ''}` },
                              { key: 'role', label: '角色', children: nodeInsight?.role ?? selectedTopologyData.role ?? selectedTopologyNode.subtitle ?? '--' },
                              { key: 'load', label: '当前/预测', children: `${formatScore(nodeInsight?.currentLoad ?? selectedTopologyNode.currentLoad)}% / ${formatScore(nodeInsight?.predictedLoad ?? selectedTopologyNode.predictedLoad)}%` },
                              { key: 'network', label: '链路能力', children: `${nodeInsight?.latency ?? selectedTopologyData.latency ?? '--'} · ${nodeInsight?.bandwidth ?? selectedTopologyData.bandwidth ?? '--'}` },
                              { key: 'reason', label: selectedIsTarget ? '选中原因' : '未选原因', children: selectedIsTarget ? (nodeInsight?.selectedReason ?? displayDecisionContext.selectedReason) : (nodeInsight?.unselectedReason ?? '未选中：综合评分未达到目标节点。') },
                            ]}
                          />
                          {selectedCandidate && (
                            <div className="prediction-allocation-score-breakdown">
                              <Text strong>候选评分 #{selectedCandidate.rankNo}</Text>
                              <div className="prediction-allocation-score-grid">
                                <span>总分 {formatScore(selectedCandidate.scoreTotal)}</span>
                                <span>资源 {formatScore(selectedCandidate.resourceFit)}</span>
                                <span>时延 {formatScore(selectedCandidate.latency)}</span>
                                <span>带宽 {formatScore(selectedCandidate.bandwidth)}</span>
                                <span>均衡 {formatScore(selectedCandidate.balance)}</span>
                                <span>风险扣分 {formatScore(selectedCandidate.riskPenalty)}</span>
                              </div>
                            </div>
                          )}
                          {nodeInsight?.activeTasks?.length ? (
                            <div className="prediction-allocation-task-section">
                              <Text strong style={{ fontSize: 13 }}>承载任务 ({nodeInsight.activeTasks.length})</Text>
                              <div className="prediction-allocation-task-list">
                                {nodeInsight.activeTasks.map((task) => (
                                  <div key={task.id} className="prediction-allocation-task-item">
                                    <div className="prediction-allocation-task-head">
                                      <Tag color="blue" style={{ margin: 0 }}>{task.type}</Tag>
                                      <Text strong style={{ fontSize: 12 }}>{task.id}</Text>
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 11 }}>{task.name} · {task.status}</Text>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {nodeInsight?.alerts?.length ? (
                            <div className="prediction-allocation-event-list">
                              {nodeInsight.alerts.map((alert, idx) => (
                                <div key={idx} className="prediction-allocation-event-item">
                                  <Text>{alert.message}</Text>
                                  <Tag color={alert.level === 'critical' ? 'red' : 'gold'}>{alert.level}</Tag>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </Space>
                </div>
              )}
            </Space>
          </Card>
        </div>
      </Card>
    </>
  );
};

export default TopologyTab;
