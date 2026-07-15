import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Row, Col, Card, Table, Tag, Tabs, Typography, Progress, Radio, Timeline, Statistic, Tooltip, Descriptions, Drawer, Avatar, Badge, Slider, Button, Space, Alert } from 'antd';
import {
  ExperimentOutlined, WifiOutlined, DesktopOutlined, RocketOutlined,
  WarningOutlined, AlertOutlined, SwapOutlined, SafetyOutlined, ClockCircleOutlined,
  RobotOutlined, ThunderboltOutlined, EyeOutlined, BarChartOutlined, NodeIndexOutlined,
  LineChartOutlined, ApiOutlined, GatewayOutlined,
  FileSearchOutlined, ArrowRightOutlined, SecurityScanOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import GlobalSecurityPosture from './GlobalSecurityPosture';
import SECURITY_DATA from './data';
import { useTaskFlowStore, type FlowTask } from '@/store/taskFlow';
import { securityFeedback } from '@/services/api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ChatAssistant from '@/components/Chat/ChatAssistant';
import type { NodeSecurity, TaskSecurity, DatasetSecurity, NetworkLinkSecurity, ConvergencePoint, StorageClusterHealth, DatasetCorrelationRisk, ComplianceSource, SupercomputingNodeSecurity } from './types';
import { SECURITY_LAYER_LABELS } from './types';
import AttackDetectionPanel from './AttackDetectionPanel';
import TrainingTimeline from './TrainingTimeline';

const { Text } = Typography;

const securityColor = (score: number) =>
  score >= 90 ? '#52c41a' : score >= 70 ? '#1677ff' : score >= 50 ? '#faad14' : '#ff4d4f';

const trustTag = (score: number) =>
  score >= 90 ? <Tag color="green">●{score} 可信</Tag> : score >= 70 ? <Tag color="orange">⚠{score} 观察</Tag> : <Tag color="red">●{score} 异常</Tag>;

const epsilonTag = (epsilon: number) =>
  epsilon < 2 ? <Tag color="green">ε={epsilon} 安全</Tag> : epsilon < 3 ? <Tag color="gold">ε={epsilon} 中等</Tag> : <Tag color="red">ε={epsilon} 高风险</Tag>;

const complianceTag = (level: string) =>
  level === 'high' ? <Tag color="green">高合规</Tag> : level === 'medium' ? <Tag color="gold">中合规</Tag> : <Tag color="red">低合规</Tag>;

const linkStatusTag = (status: string) =>
  status === 'normal' ? <Tag color="green">正常</Tag> : status === 'busy' ? <Tag color="orange">繁忙</Tag> : <Tag color="red">降级</Tag>;

const NoniidHeatmapPanel: React.FC<{ data: import('./types').NonIIDDistribution }> = ({ data }) => {
  const [alpha, setAlpha] = useState(data.default_alpha);
  const alphaKey = String(alpha);
  const current = data.heatmap_data_by_alpha[alphaKey] || data.heatmap_data_by_alpha[String(data.default_alpha)];
  const riskColor = current.risk_level === 'high' ? '#ff4d4f' : current.risk_level === 'medium' ? '#faad14' : '#52c41a';
  return (
    <div>
      <Row gutter={[16, 16]} align="middle" style={{ marginBottom: 12 }}>
        <Col span={8}>
          <Text>Dirichlet α 分布参数：</Text>
          <Slider min={0} max={100} value={data.alpha_options.indexOf(alpha) >= 0 ? data.alpha_options.indexOf(alpha) * 50 : 50}
            onChange={(v: number) => setAlpha(data.alpha_options[Math.round(v / 50)])}
            marks={{ 0: '0.1', 50: '0.5', 100: '1.0' }} step={50} />
        </Col>
        <Col span={8}>
          <Tag color={riskColor} style={{ fontSize: 13 }}>{current.label} — {current.risk_level === 'high' ? '高风险' : current.risk_level === 'medium' ? '中风险' : '低风险'}</Tag>
        </Col>
        <Col span={8}><Text type="secondary" style={{ fontSize: 11 }}>{current.description}</Text></Col>
      </Row>
      <ReactECharts option={{
        tooltip: { formatter: (params: any) => `${data.client_names[params.data[1]]}<br/>Class ${params.data[0]}: ${params.data[2]}‰` },
        grid: { top: 10, right: 30, bottom: 40, left: 100 },
        xAxis: { type: 'category', data: Array.from({ length: data.class_count }, (_, i) => `C${i}`), axisLabel: { fontSize: 10 } },
        yAxis: { type: 'category', data: data.client_names, axisLabel: { fontSize: 10 } },
        visualMap: { min: 0, max: Math.max(...current.data.map((r: number[]) => Math.max(...r)), 100), calculable: true, orient: 'horizontal', left: 'center', bottom: 0, inRange: { color: ['#f0f5ff', '#adc6ff', '#597ef7', '#2f54eb', '#10239e'] } },
        series: [{ type: 'heatmap', data: current.data.flatMap((row: number[], ri: number) => row.map((val: number, ci: number) => [ci, ri, val])), emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' } } }],
      }} style={{ height: 300 }} />
    </div>
  );
};

const SecurityAssessment: React.FC = () => {
  const data = SECURITY_DATA;
  const navigate = useNavigate();
  const { currentTask, updateCurrentTask, completeCurrentTask } = useTaskFlowStore();
  const [selectedAlgo, setSelectedAlgo] = React.useState(currentTask?.selectedAlgorithm || 'Bulyan');
  const [feedbackResult, setFeedbackResult] = React.useState<any>(null);
  const { algorithm_strategy: algo } = data;
  const summary = data.alert_summary;
  const [chatOpen, setChatOpen] = useState(false);
  const [detailDrawer, setDetailDrawer] = useState<{ title: string; content: React.ReactNode } | null>(null);

  const taskSecurityScore = useMemo(() => {
    if (!currentTask) return null;
    const algoProfile = algo.convergence_curves.find(c => c.method === (currentTask.selectedAlgorithm || selectedAlgo));
    const algoAccuracy = algoProfile ? algoProfile.data[algoProfile.data.length - 1]?.accuracy * 100 : 85;
    const algorithmScore = Math.round(algoAccuracy);
    const dataScore = 87;
    const networkScore = currentTask.targetNode ? 82 : 79;
    const systemScore = 76;
    const overall = Math.round(dataScore * 0.30 + algorithmScore * 0.25 + networkScore * 0.25 + systemScore * 0.20);
    const grade = overall >= 90 ? 'A' : overall >= 85 ? 'A-' : overall >= 80 ? 'B+' : overall >= 70 ? 'B' : 'C';
    return {
      overall,
      grade,
      algorithmScore,
      dataScore,
      networkScore,
      systemScore,
      algorithm: currentTask.selectedAlgorithm || selectedAlgo,
      targetNode: currentTask.targetNode || '未分配',
      taskName: currentTask.name,
    };
  }, [currentTask, selectedAlgo, algo.convergence_curves]);

  const currentCurves = useMemo(() => algo.convergence_curves.map((c) => ({ ...c, selected: c.method === selectedAlgo })), [algo.convergence_curves, selectedAlgo]);
  const convergenceOption = useMemo(() => {
    const rounds = currentCurves[0]?.data.map((d: ConvergencePoint) => `R${d.round}`) || [];
    return {
      tooltip: { trigger: 'axis' }, legend: { bottom: 0, data: currentCurves.map((c) => c.label) },
      xAxis: { type: 'category', data: rounds, name: '训练轮次' }, yAxis: { type: 'value', name: '准确率', min: 0, max: 100 },
      series: currentCurves.map((c) => ({
        name: c.label, type: 'line', data: c.data.map((d: ConvergencePoint) => +(d.accuracy * 100).toFixed(1)),
        lineStyle: { color: c.color, width: c.selected ? 3 : 1.5 }, symbol: c.selected ? 'circle' : 'none', symbolSize: 6,
      })),
    };
  }, [currentCurves]);

  const masterNodeChartOption = useMemo(() => {
    const sorted = [...data.master_node_links].sort((a, b) => a.latency_ms - b.latency_ms);
    return {
      tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
      legend: { data: ['时延(ms)', '带宽(Gbps)'] },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'value' as const },
      yAxis: { type: 'category' as const, data: sorted.map(l => l.node_name.replace('边缘节点', '').replace('边缘', '')) },
      series: [
        { name: '时延(ms)', type: 'bar' as const, data: sorted.map(l => l.latency_ms), itemStyle: { color: '#1677ff' }, label: { show: true, position: 'right', formatter: '{c}ms' } },
        { name: '带宽(Gbps)', type: 'bar' as const, data: sorted.map(l => l.bandwidth_gbps), itemStyle: { color: '#52c41a' }, label: { show: true, position: 'right', formatter: '{c}' } },
      ],
    };
  }, [data.master_node_links]);

  const nodeColumns = [
    { title: '节点名称', dataIndex: 'node_name', key: 'node_name' },
    { title: '可信度', dataIndex: 'trust_score', key: 'trust_score', sorter: (a: NodeSecurity, b: NodeSecurity) => a.trust_score - b.trust_score, render: trustTag },
    { title: '健康评分', dataIndex: 'health_score', key: 'health_score', render: (v: number) => <Progress percent={v} size="small" strokeColor={securityColor(v)} /> },
    { title: '告警等级', dataIndex: 'warning_level', key: 'warning_level', render: (l: string) => l === 'critical' ? <Tag color="red">严重</Tag> : l === 'warning' ? <Tag color="orange">告警</Tag> : <Tag color="green">正常</Tag> },
    { title: '任务成功率', dataIndex: 'task_success_rate', key: 'task_success_rate', render: (v: number) => `${(v * 100).toFixed(0)}%` },
    { title: '梯度异常次数', dataIndex: 'gradient_anomaly_count', key: 'gradient_anomaly_count', render: (v: number) => v > 0 ? <Tag color="red">{v}次</Tag> : <Tag color="green">0</Tag> },
  ];

  const systemAgg = useMemo(() => {
    const tasks = data.task_security.filter(t => t.status === 'running');
    if (tasks.length === 0) return null;
    return {
      task_count: tasks.length,
      avg_accuracy: tasks.reduce((s, t) => s + t.current_accuracy, 0) / tasks.length,
      avg_loss: +(tasks.reduce((s, t) => s + t.current_loss, 0) / tasks.length).toFixed(3),
      max_malicious_ratio: Math.max(...tasks.map(t => t.detected_malicious_ratio)),
      max_round: Math.max(...tasks.map(t => t.current_round)),
      total_clients: tasks.reduce((s, t) => s + t.client_count, 0),
      attacked_task_count: tasks.filter(t => t.attack_detected).length,
      epsilon_high_count: tasks.filter(t => t.privacy_epsilon >= 3).length,
      distinct_attacks: [...new Set(tasks.filter(t => t.attack_detected).map(t => t.attack_type))],
      description: `${tasks.length} 个运行中任务`,
    };
  }, [data.task_security]);

  const datasetColumns = [
    { title: '数据集', dataIndex: 'source_name', key: 'source_name' },
    { title: '模态', dataIndex: 'modality', key: 'modality' },
    { title: '业务标签', dataIndex: 'business_tag', key: 'business_tag', render: (v: string) => <Tag>{v}</Tag> },
    { title: '大小', dataIndex: 'size', key: 'size' },
    { title: '隐私评分 ε', dataIndex: 'privacy_epsilon', key: 'privacy_epsilon', sorter: (a: DatasetSecurity, b: DatasetSecurity) => a.privacy_epsilon - b.privacy_epsilon, render: epsilonTag },
    { title: '合规等级', dataIndex: 'compliance_level', key: 'compliance_level', render: complianceTag },
    { title: '关联数', dataIndex: 'relation_count', key: 'relation_count' },
  ];

  const networkColumns = [
    { title: '链路', dataIndex: 'link_id', key: 'link_id' },
    { title: '源节点', dataIndex: 'source_vertex_id', key: 'source_vertex_id' },
    { title: '目标节点', dataIndex: 'target_vertex_id', key: 'target_vertex_id' },
    { title: '带宽(Gbps)', dataIndex: 'bandwidth_usage_gbps', key: 'bandwidth_usage_gbps' },
    { title: '时延(ms)', dataIndex: 'latency_ms', key: 'latency_ms', sorter: (a: NetworkLinkSecurity, b: NetworkLinkSecurity) => a.latency_ms - b.latency_ms },
    { title: '丢包率(%)', dataIndex: 'packet_loss_pct', key: 'packet_loss_pct', sorter: (a: NetworkLinkSecurity, b: NetworkLinkSecurity) => a.packet_loss_pct - b.packet_loss_pct, render: (v: number) => <Tag color={v > 1 ? 'red' : v > 0.5 ? 'orange' : 'green'}>{v}%</Tag> },
    { title: '状态', dataIndex: 'status', key: 'status', render: linkStatusTag },
  ];

  const correlationRiskColumns = [
    { title: '数据集A', dataIndex: 'source_name', key: 'source_name' },
    { title: '数据集B', dataIndex: 'target_name', key: 'target_name' },
    { title: '关联度', dataIndex: 'correlation', key: 'correlation', sorter: (a: DatasetCorrelationRisk, b: DatasetCorrelationRisk) => b.correlation - a.correlation, render: (v: number) => <Progress percent={+(v * 100).toFixed(0)} size="small" strokeColor={v >= 0.8 ? '#ff4d4f' : v >= 0.7 ? '#faad14' : '#1677ff'} format={() => v.toFixed(2)} /> },
    { title: '泄露风险', dataIndex: 'risk_level', key: 'risk_level', render: (l: string) => l === 'high' ? <Tag color="red">高风险</Tag> : l === 'medium' ? <Tag color="orange">中风险</Tag> : <Tag color="green">低风险</Tag> },
  ];

  const complianceSourceColumns = [
    { title: '业务方', dataIndex: 'source_name', key: 'source_name' },
    { title: '标签', dataIndex: 'business_tag', key: 'business_tag', render: (v: string) => <Tag>{v}</Tag> },
    { title: '合规等级', dataIndex: 'compliance_level', key: 'compliance_level', render: complianceTag },
    { title: '说明', dataIndex: 'description', key: 'description', ellipsis: true },
  ];

  const storageColumns = [
    { title: '集群名称', dataIndex: 'cluster_name', key: 'cluster_name', render: (v: string, r: StorageClusterHealth) => <Button type="link" style={{ padding: 0 }} onClick={() => setDetailDrawer({ title: `存储集群 - ${v}`, content: <Card title={`${v} 详情`}>
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="集群ID">{r.cluster_id}</Descriptions.Item>
        <Descriptions.Item label="状态"><Tag color={r.status === 'online' ? 'green' : 'orange'}>{r.status === 'online' ? '在线' : '告警'}</Tag></Descriptions.Item>
        <Descriptions.Item label="总容量">{r.capacity_tb} TB</Descriptions.Item>
        <Descriptions.Item label="已用">{r.used_tb} TB</Descriptions.Item>
        <Descriptions.Item label="使用率"><Progress percent={r.used_pct} size="small" strokeColor={r.used_pct >= 90 ? '#ff4d4f' : r.used_pct >= 80 ? '#faad14' : '#52c41a'} format={() => `${r.used_pct}%`} /></Descriptions.Item>
        <Descriptions.Item label="IO性能">{r.io_performance}</Descriptions.Item>
      </Descriptions>
    </Card> })}>{v}</Button> },
    { title: '容量', key: 'capacity', render: (_: unknown, r: StorageClusterHealth) => `${r.capacity_tb} TB` },
    { title: '已用', dataIndex: 'used_pct', key: 'used_pct', sorter: (a: StorageClusterHealth, b: StorageClusterHealth) => b.used_pct - a.used_pct, render: (v: number, r: StorageClusterHealth) => <Progress percent={v} size="small" strokeColor={v >= 90 ? '#ff4d4f' : v >= 80 ? '#faad14' : '#52c41a'} format={() => `${r.used_tb}/${r.capacity_tb}TB`} /> },
    { title: 'IO性能', dataIndex: 'io_performance', key: 'io_performance' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: string) => s === 'warning' ? <Tag color="orange">告警</Tag> : <Tag color="green">在线</Tag> },
  ];

  const DetailBtn = ({ title, children, text = '查看详情' }: { title: string; children: React.ReactNode; text?: string }) => (
    <Button type="link" icon={<EyeOutlined />} onClick={() => setDetailDrawer({ title, content: <>{children}</> })} style={{ padding: 0, fontSize: 12 }}>{text}</Button>
  );

  const renderStorageDetail = () => (
    <Card title="存储集群趋势">
      <Row gutter={[16, 12]} style={{ marginBottom: 12 }}>
        <Col span={6}><Statistic title="集群总数" value={data.storage_clusters.length} suffix="个" /></Col>
        <Col span={6}><Statistic title="总容量" value={data.storage_clusters.reduce((s, c) => s + c.capacity_tb, 0)} suffix="TB" /></Col>
        <Col span={6}><Statistic title="已用" value={data.storage_clusters.reduce((s, c) => s + c.used_tb, 0)} suffix="TB" /></Col>
        <Col span={6}><Statistic title="平均使用率" value={+(data.storage_clusters.reduce((s, c) => s + c.used_pct, 0) / data.storage_clusters.length).toFixed(0)} suffix="%" /></Col>
      </Row>
      <ReactECharts option={{
        tooltip: { trigger: 'axis' }, legend: { data: ['深圳', '上海', '北京', '西安'] },
        xAxis: { type: 'category', data: Array.from({ length: 12 }, (_, i) => `${String(i + 6)}:00`), name: '时间' },
        yAxis: { type: 'value', name: '%', min: 40, max: 100 },
        series: [
          { name: '深圳', type: 'line', smooth: true, data: [78, 80, 81, 82, 80, 81, 83, 82, 81, 83, 84, 82], lineStyle: { color: '#1677ff' } },
          { name: '上海', type: 'line', smooth: true, data: [65, 66, 67, 68, 67, 68, 69, 67, 66, 68, 69, 68], lineStyle: { color: '#52c41a' } },
          { name: '北京', type: 'line', smooth: true, data: [71, 72, 73, 74, 73, 74, 75, 73, 72, 74, 75, 74], lineStyle: { color: '#faad14' } },
          { name: '西安', type: 'line', smooth: true, data: [88, 90, 91, 92, 93, 94, 95, 94, 93, 94, 95, 94], lineStyle: { color: '#ff4d4f' }, markLine: { silent: true, data: [{ yAxis: 90, label: { formatter: '告警阈值' }, lineStyle: { type: 'dashed', color: '#ff4d4f' } }] } },
        ],
      }} style={{ height: 200, marginBottom: 12 }} />
      <Table dataSource={data.storage_clusters} columns={storageColumns} rowKey="cluster_id" pagination={false} size="small" />
    </Card>
  );

  // ===== Shared Security Assessment Summary Banner =====
  const SecurityScoreCard = ({ label, score, weight, color, children }: { label: string; score: number; weight: number; color: string; children?: React.ReactNode }) => (
    <Col span={6}>
      <Card size="small" hoverable styles={{ body: { padding: '12px 8px', textAlign: 'center' } }}>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 32, fontWeight: 700, color }}>{score}</div>
        <div style={{ fontSize: 11, color: '#999' }}>权重 {weight.toFixed(2)}</div>
        {children && <div style={{ marginTop: 8 }}>{children}</div>}
      </Card>
    </Col>
  );

  return (
    <>
    <div>
      {focusedTask && taskSecurityScore && (
        <Alert
          type={taskSecurityScore.overall >= 80 ? 'success' : taskSecurityScore.overall >= 70 ? 'warning' : 'error'}
          showIcon
          icon={<SafetyOutlined />}
          style={{ marginBottom: 16 }}
          message={
            <span>
              <Tag color="blue">任务级安全评估</Tag>
              任务「{focusedTask.name}」综合安全评分：
              <Text strong style={{ fontSize: 18, color: taskSecurityScore.overall >= 80 ? '#52c41a' : taskSecurityScore.overall >= 70 ? '#faad14' : '#ff4d4f', margin: '0 4px' }}>
                {taskSecurityScore.overall}
              </Text>
              <Tag color={taskSecurityScore.overall >= 80 ? 'green' : 'orange'}>等级 {taskSecurityScore.grade}</Tag>
            </span>
          }
          description={
            <div>
              <Space wrap>
                <span>算法：<Text strong>{taskSecurityScore.algorithm}</Text></span>
                <span>目标节点：<Text strong>{taskSecurityScore.targetNode}</Text></span>
                <span>数据 {taskSecurityScore.dataScore}</span>
                <span>算法 {taskSecurityScore.algorithmScore}</span>
                <span>网络 {taskSecurityScore.networkScore}</span>
                <span>系统 {taskSecurityScore.systemScore}</span>
              </Space>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Button
                  size="small"
                  type="primary"
                  icon={<SecurityScanOutlined />}
                  onClick={async () => {
                    try {
                      const res = await securityFeedback({
                        task_id: focusedTask.id,
                        algorithm: focusedTask.selectedAlgorithm || selectedAlgo,
                        malicious_ratio: 35,
                        security_score: taskSecurityScore.overall,
                      }) as any;
                      setFeedbackResult(res);
                    } catch (error) {
                      console.warn('securityFeedback failed:', error);
                    } finally {
                      updateCurrentTask({ securityScore: taskSecurityScore.overall, stage: 'running' });
                    }
                  }}
                >
                  确认安全评分并反馈
                </Button>
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<EyeOutlined />}
                  onClick={() => setDetailDrawer({ title: `安全评估详情 - ${focusedTask.name}`, content: (
                    <Card title={<span><SafetyOutlined /> 任务级安全评估明细 <Tag color="blue">{taskSecurityScore.grade}</Tag></span>}>
                      <Row gutter={[16, 16]}>
                        <Col span={6}><Statistic title="综合评分" value={taskSecurityScore.overall} prefix={<SafetyOutlined />} valueStyle={{ color: securityColor(taskSecurityScore.overall) }} /></Col>
                        <Col span={6}><Statistic title="算法评分" value={taskSecurityScore.algorithmScore} /></Col>
                        <Col span={6}><Statistic title="数据评分" value={taskSecurityScore.dataScore} /></Col>
                        <Col span={6}><Statistic title="网络评分" value={taskSecurityScore.networkScore} /></Col>
                      </Row>
                      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                        <Col span={6}><Statistic title="系统评分" value={taskSecurityScore.systemScore} /></Col>
                        <Col span={6}><Statistic title="等级" value={taskSecurityScore.grade} /></Col>
                        <Col span={6}><Statistic title="算法策略" value={taskSecurityScore.algorithm} /></Col>
                        <Col span={6}><Statistic title="目标节点" value={taskSecurityScore.targetNode} /></Col>
                      </Row>
                      <Card size="small" title="各维度权重" style={{ marginTop: 16 }}>
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <div><Text type="secondary">数据安全 (30%): </Text><Progress percent={taskSecurityScore.dataScore} size="small" strokeColor={securityColor(taskSecurityScore.dataScore)} /></div>
                          <div><Text type="secondary">算法安全 (25%): </Text><Progress percent={taskSecurityScore.algorithmScore} size="small" strokeColor={securityColor(taskSecurityScore.algorithmScore)} /></div>
                          <div><Text type="secondary">网络安全 (25%): </Text><Progress percent={taskSecurityScore.networkScore} size="small" strokeColor={securityColor(taskSecurityScore.networkScore)} /></div>
                          <div><Text type="secondary">系统安全 (20%): </Text><Progress percent={taskSecurityScore.systemScore} size="small" strokeColor={securityColor(taskSecurityScore.systemScore)} /></div>
                        </Space>
                      </Card>
                    </Card>
                  ) })}
                >
                  查看安全详情
                </Button>
                <Button
                  size="small"
                  icon={<FileSearchOutlined />}
                  onClick={() => navigate(`/computing/task-management?taskId=${encodeURIComponent(focusedTask.id)}`)}
                >
                  查看任务详情 <ArrowRightOutlined />
                </Button>
                {feedbackResult && (
                  <Tag color={feedbackResult.need_switch ? 'red' : 'green'} style={{ margin: 0 }}>
                    {feedbackResult.recommendation || '已反馈调度流程'}
                  </Tag>
                )}
                <Button size="small" type="link" onClick={() => navigate('/computing/prediction-allocation')}>
                  返回调度中枢
                </Button>
                <Button size="small" type="link" onClick={() => { completeCurrentTask(); navigate('/computing/task-management'); }}>
                  完成并回到任务管理
                </Button>
              </div>
            </div>
          }
        />
      )}
      <GlobalSecurityPosture />

      <Tabs activeKey={activeSecurityTab} onChange={setActiveSecurityTab} size="large" style={{ marginTop: 16 }}
        items={[
          // ======================================================
          // Tab 1: 系统安全 — 基础设施 + 系统级网络链路
          // ======================================================
          {
            key: 'system',
            label: <span><DesktopOutlined /> 系统安全</span>,
            children: (
              <>
                {/* 超算节点概览 */}
                <Card title={<span><ThunderboltOutlined /> 超算节点概览<Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>资源池管控 · 6个国家级超算中心</Text></span>}
                  extra={<DetailBtn title="超算节点明细" text="查看节点完整列表"><Table dataSource={data.supercomputing_security} rowKey="node_id" pagination={false} size="small" columns={[
                    { title: '节点名称', dataIndex: 'node_name', key: 'node_name', render: (v: string) => <Text strong>{v}</Text> },
                    { title: '算力规模', dataIndex: 'compute_power', key: 'compute_power', render: (v: string) => <Tag color="blue">{v}</Tag> },
                    { title: 'CPU 核', dataIndex: 'cpu_cores', key: 'cpu_cores' },
                    { title: 'GPU 配置', key: 'gpu', render: (_: unknown, r: SupercomputingNodeSecurity) => <Text style={{ fontSize: 11 }}>{r.gpu_count}×{r.gpu_type}</Text> },
                    { title: '能力评分', dataIndex: 'capability_score', key: 'capability_score', sorter: (a: SupercomputingNodeSecurity, b: SupercomputingNodeSecurity) => b.capability_score - a.capability_score, render: (v: number) => <Tag color={v >= 90 ? 'green' : v >= 70 ? 'orange' : 'red'}>{v}</Tag> },
                    { title: '可信度', dataIndex: 'trust_score', key: 'trust_score', render: trustTag },
                  ]} /></DetailBtn>}
                  style={{ marginBottom: 16 }}>
                  <Row gutter={[12, 12]}>
                    <Col span={6}><Statistic title="总算力" value="2,168 PFLOPS" prefix={<ThunderboltOutlined />} valueStyle={{ color: '#1677ff', fontSize: 22 }} /></Col>
                    <Col span={6}><Statistic title="GPU 总量" value={424} suffix="张" prefix={<DesktopOutlined />} valueStyle={{ color: '#52c41a', fontSize: 22 }} /></Col>
                    <Col span={6}><Statistic title="平均能力评分" value={81.7} prefix={<RocketOutlined />} valueStyle={{ color: '#faad14', fontSize: 22 }} /></Col>
                    <Col span={6}><Statistic title="平均可信度" value={86.5} prefix={<SafetyOutlined />} valueStyle={{ color: '#722ed1', fontSize: 22 }} /></Col>
                  </Row>
                </Card>

                {/* 节点资源趋势 */}
                <Card title={<span><LineChartOutlined /> 节点资源趋势<Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>CPU / 内存 / GPU 实时负载</Text></span>}
                  extra={<DetailBtn title="节点与调度详情" text="查看节点与调度明细">
                    <Card title="节点安全评估明细" style={{ marginBottom: 16 }}><Table dataSource={data.node_security} columns={nodeColumns} rowKey="node_id" pagination={false} size="small" /></Card>
                    <Card title="调度器性能"><Row gutter={[16, 16]}><Col span={8}><Statistic title="平均调度延迟" value="42" suffix="ms" valueStyle={{ color: '#52c41a' }} /></Col><Col span={8}><Statistic title="P99 延迟" value="128" suffix="ms" valueStyle={{ color: '#faad14' }} /></Col><Col span={8}><Statistic title="调度成功率" value="99.2" suffix="%" valueStyle={{ color: '#52c41a' }} /></Col></Row></Card>
                  </DetailBtn>}
                  style={{ marginBottom: 16 }}>
                  <ReactECharts option={{
                    tooltip: { trigger: 'axis' }, legend: { data: ['CPU均值', '内存均值', 'GPU均值'] },
                    xAxis: { type: 'category', data: Array.from({ length: 20 }, (_, i) => `${(16 - 20 + i + 1) + ''}:${String((i * 3) % 60).padStart(2, '0')}`), name: '时间' },
                    yAxis: { type: 'value', name: '%', min: 0, max: 100 },
                    series: [
                      { name: 'CPU均值', type: 'line', smooth: true, data: [62, 65, 68, 70, 67, 72, 75, 71, 68, 74, 78, 72, 69, 73, 76, 71, 68, 72, 70, 67], areaStyle: { opacity: 0.1, color: '#1677ff' }, lineStyle: { color: '#1677ff' } },
                      { name: '内存均值', type: 'line', smooth: true, data: [58, 56, 60, 62, 64, 61, 59, 63, 65, 62, 60, 63, 67, 64, 61, 63, 66, 64, 62, 60], areaStyle: { opacity: 0.1, color: '#52c41a' }, lineStyle: { color: '#52c41a' } },
                      { name: 'GPU均值', type: 'line', smooth: true, data: [48, 52, 55, 50, 53, 58, 55, 51, 56, 60, 57, 53, 55, 59, 56, 52, 54, 58, 55, 52], areaStyle: { opacity: 0.1, color: '#faad14' }, lineStyle: { color: '#faad14' } },
                    ],
                  }} style={{ height: 200 }} />
                  {/* 资源告警汇总 — 直接展示在面板内 */}
                  <Row gutter={[16, 12]} style={{ marginTop: 12, padding: '12px 16px', background: '#fff7e6', borderRadius: 8, border: '1px solid #ffd591' }}>
                    <Col span={3} style={{ textAlign: 'center' }}><Statistic title="总告警" value={summary.total_alerts} valueStyle={{ fontSize: 18 }} suffix="条" /></Col>
                    <Col span={3} style={{ textAlign: 'center' }}><Statistic title="严重" value={summary.critical_count} valueStyle={{ color: '#cf1322', fontSize: 18 }} prefix={<WarningOutlined />} /></Col>
                    <Col span={3} style={{ textAlign: 'center' }}><Statistic title="警告" value={summary.warning_count} valueStyle={{ color: '#d46b08', fontSize: 18 }} /></Col>
                    <Col span={3} style={{ textAlign: 'center' }}><Statistic title="受影响节点" value={summary.affected_nodes} valueStyle={{ fontSize: 18 }} suffix={`/ ${summary.total_nodes}`} /></Col>
                    {(['cpu', 'mem', 'gpu'] as const).map((metric) => {
                      const m = summary.breakdown[metric];
                      const label = { cpu: 'CPU', mem: '内存', gpu: 'GPU' }[metric];
                      return (<Col span={4} key={metric}><Text strong style={{ fontSize: 12 }}>{label}</Text><div style={{ fontSize: 11, marginTop: 2 }}><Tag color="red">严重 {m.critical}</Tag><Tag color="orange">警告 {m.warning}</Tag></div></Col>);
                    })}
                  </Row>
                </Card>

                {/* 系统级网络链路 */}
                <Card title={<span><GatewayOutlined /> 系统级网络链路<Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>Master 调度中枢 → 各边缘节点</Text></span>}
                  extra={<DetailBtn title="链路评估明细" text="查看链路完整列表"><Table dataSource={data.network_security} columns={networkColumns} rowKey="link_id" pagination={false} size="small" /></DetailBtn>}
                  style={{ marginBottom: 16 }}>
                  <Row gutter={[16, 16]}>
                    <Col span={5}><Statistic title="平均时延" value={Math.round(data.master_node_links.reduce((s, l) => s + l.latency_ms, 0) / data.master_node_links.length)} suffix="ms" /></Col>
                    <Col span={5}><Statistic title="总带宽" value={data.master_node_links.reduce((s, l) => s + l.bandwidth_gbps, 0).toFixed(0)} suffix="Gbps" /></Col>
                    <Col span={5}><Statistic title="丢包率均值" value={data.master_node_links.reduce((s, l) => s + l.packet_loss_pct, 0) / data.master_node_links.length} suffix="%" precision={2} /></Col>
                    <Col span={9}><Statistic title="正常链路" value={`${data.master_node_links.filter(l => l.status === 'normal').length}/${data.master_node_links.length}`} /></Col>
                  </Row>
                  <ReactECharts option={masterNodeChartOption} style={{ height: 280, marginTop: 8 }} />
                </Card>

                {/* 存储集群趋势 — 直接展示 */}
                {renderStorageDetail()}
              </>
            ),
          },

          // ======================================================
          // Tab 2: 任务安全 — 攻击检测 + By任务详情(通信/策略决策/数据)
          // ======================================================
          {
            key: 'task',
            label: <span><ExperimentOutlined /> 任务安全</span>,
            children: (
              <AttackDetectionPanel data={data.rational_trust} backdoor={data.backdoor_attack} taskSecurity={data.task_security}
                commOpt={data.communication_opt} commTimeline={data.comm_timeline} accuracyVsComm={data.accuracy_vs_comm}
                algo={algo} selectedAlgo={selectedAlgo} onAlgoChange={setSelectedAlgo}
                convergenceOption={convergenceOption} systemAgg={systemAgg}
                fairness={data.fairness} distillation={data.distillation}
                focusedTaskId={focusedTaskId}
              />
            ),
          },
        ]}
      />
    </div>

    {/* Detail Drawer */}
    <Drawer title={detailDrawer?.title || ''} placement="right" width={640} open={!!detailDrawer} onClose={() => setDetailDrawer(null)}>
      {detailDrawer?.content}
    </Drawer>

    {/* Chat Bot */}
    <div onClick={() => setChatOpen(true)}
      style={{ position: 'fixed', bottom: 32, right: 32, width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #1677ff, #4096ff)', boxShadow: '0 4px 20px rgba(22,119,255,0.45)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <Badge dot status="processing" offset={[-6, 6]}>
        <Avatar size={40} icon={<RobotOutlined style={{ fontSize: 22 }} />} style={{ backgroundColor: 'transparent', border: '2px solid rgba(255,255,255,0.6)' }} />
      </Badge>
    </div>
    <Drawer title="大模型安全分析问答助手" placement="right" width={420} open={chatOpen} onClose={() => setChatOpen(false)} destroyOnClose={false}
      rootClassName="security-chat-drawer" styles={{ body: { padding: 0, height: 'calc(100% - 55px)' } }}>
      <style>{`.security-chat-drawer .ant-drawer-content-wrapper { height: 80vh !important; top: 10vh !important; border-radius: 12px 0 0 12px; overflow: hidden; }`}</style>
      <ChatAssistant title="安全分析助手" placeholder="输入安全相关问题，如：当前全局安全态势如何？" height={450} />
    </Drawer>
  </>
  );
};

export default SecurityAssessment;
