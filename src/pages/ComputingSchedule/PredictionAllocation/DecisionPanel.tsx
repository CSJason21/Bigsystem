import React from 'react';
import { Alert, Button, Card, Col, Descriptions, Progress, Row, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleOutlined, InfoCircleOutlined, SafetyOutlined, SendOutlined } from '@ant-design/icons';

const { Text } = Typography;

export interface ScoredCandidate {
  node_id: string;
  node_name: string;
  region_id?: string;
  layer?: string;
  status?: string;
  cpu_usage_pct: number;
  memory_usage_pct?: number;
  gpu_usage_pct?: number;
  cpu_cores: number;
  gpu_count: number;
  memory_gb: number;
  available_cpu?: number;
  available_gpu?: number;
  available_memory?: number;
  trust_score: number;
  health_score?: number;
  predicted_load: number | null;
  latency_ms?: number;
  packet_loss_pct?: number;
  running_tasks?: number;
  resource_fit_score?: number;
  pressure_score?: number;
  prediction_score?: number;
  security_score?: number;
  network_score?: number;
  fairness_score?: number;
  locality_score?: number;
  risk_penalty?: number;
  load_score: number;
  match_score: number;
  match_ratio: number;
  trust_score_eval: number;
  total_score: number;
  rank_no?: number;
  decision?: string;
}

interface ParticipantNode {
  node_id: string;
  node_name: string;
  role: 'aggregator' | 'participant' | string;
  score: number;
  reserve?: { cpu: number; memory: number; gpu: number };
}

interface DecisionPanelProps {
  evaluation: {
    algorithm?: { name: string; version: string; mode: string };
    formula: string;
    weights: Record<string, number>;
    filter_summary?: {
      input_count: number;
      eligible_count: number;
      filtered_count: number;
      degraded?: boolean;
    };
    filtered_out?: Array<{
      node_id: string;
      node_name: string;
      reasons: string[];
      trust_score?: number;
      predicted_load?: number;
    }>;
    scored_candidates: ScoredCandidate[];
    selected_node: ScoredCandidate | null;
    participant_group?: ParticipantNode[];
    decision_basis: string;
    explain_steps?: string[];
  } | null;
  taskReq?: { cpu: number; gpu: number; memory: number };
  loading?: boolean;
  executing?: boolean;
  scheduleContext?: any;
  onExecute?: (nodeId: string) => void;
  onSecurityDetail?: (nodeId: string) => void;
}

const scoreColor = (value?: number) => {
  if ((value ?? 0) >= 80) return '#0d7377';
  if ((value ?? 0) >= 60) return '#b45309';
  return '#cf1322';
};

const columns: ColumnsType<ScoredCandidate> = [
  {
    title: '排名',
    key: 'rank',
    width: 64,
    render: (_, record, index) => <Tag color={index === 0 ? 'blue' : 'default'}>#{record.rank_no ?? index + 1}</Tag>,
  },
  {
    title: '节点',
    dataIndex: 'node_name',
    key: 'node_name',
    width: 140,
    render: (name: string, record) => (
      <div>
        <Text strong>{name}</Text>
        <div style={{ fontSize: 11, color: '#64748b' }}>{record.region_id ?? '--'} · {record.layer ?? 'node'}</div>
      </div>
    ),
  },
  {
    title: (
      <Tooltip title="硬过滤后进入评分的资源满足度，取 CPU/GPU/内存短板，并对资源碎片做轻微惩罚。">
        资源匹配 <InfoCircleOutlined />
      </Tooltip>
    ),
    dataIndex: 'resource_fit_score',
    key: 'resource_fit_score',
    width: 104,
    render: (v: number | undefined, r) => (
      <div>
        <Text style={{ color: scoreColor(v ?? r.match_score), fontWeight: 600 }}>{(v ?? r.match_score).toFixed(1)}</Text>
        <div style={{ fontSize: 11, color: '#64748b' }}>短板 {r.match_ratio}%</div>
      </div>
    ),
  },
  {
    title: '当前/预测',
    key: 'pressure',
    width: 126,
    render: (_, r) => (
      <Space direction="vertical" size={2} style={{ width: '100%' }}>
        <Text style={{ fontSize: 12 }}>压力 {((r.pressure_score ?? r.load_score)).toFixed(1)}</Text>
        <Progress percent={Math.round(r.predicted_load ?? 0)} size="small" showInfo={false} strokeColor={scoreColor(100 - (r.predicted_load ?? 0))} />
        <Text type="secondary" style={{ fontSize: 11 }}>预测负载 {r.predicted_load ?? '--'}%</Text>
      </Space>
    ),
  },
  {
    title: '安全/网络',
    key: 'security',
    width: 126,
    render: (_, r) => (
      <div>
        <Text style={{ color: scoreColor(r.security_score ?? r.trust_score_eval), fontWeight: 600 }}>
          安全 {(r.security_score ?? r.trust_score_eval).toFixed(1)}
        </Text>
        <div style={{ fontSize: 11, color: '#64748b' }}>
          网络 {(r.network_score ?? 0).toFixed(1)} · {r.latency_ms ?? '--'}ms
        </div>
      </div>
    ),
  },
  {
    title: '公平/风险',
    key: 'risk',
    width: 104,
    render: (_, r) => (
      <div>
        <Text>任务 {r.running_tasks ?? 0}</Text>
        <div style={{ fontSize: 11, color: (r.risk_penalty ?? 0) > 12 ? '#cf1322' : '#64748b' }}>
          风险扣分 {(r.risk_penalty ?? 0).toFixed(1)}
        </div>
      </div>
    ),
  },
  {
    title: '总分',
    dataIndex: 'total_score',
    key: 'total_score',
    width: 96,
    defaultSortOrder: 'descend',
    sorter: (a, b) => b.total_score - a.total_score,
    render: (v: number, _, index) => (
      <Text style={{ fontSize: index === 0 ? 17 : 14, fontWeight: 700, color: index === 0 ? '#1565c0' : '#334155' }}>
        {v.toFixed(1)}
      </Text>
    ),
  },
];

const DecisionPanel: React.FC<DecisionPanelProps> = ({
  evaluation,
  taskReq,
  loading,
  executing,
  scheduleContext,
  onExecute,
  onSecurityDetail,
}) => {
  if (loading) return <Card loading style={{ margin: '16px 0' }} />;
  if (!evaluation || !evaluation.selected_node) return null;

  const { algorithm, formula, weights, scored_candidates, selected_node, decision_basis } = evaluation;
  const filter = evaluation.filter_summary;
  const participantGroup = evaluation.participant_group ?? [];
  const filteredOut = evaluation.filtered_out ?? [];
  const predictionSummary = scheduleContext?.summaries?.predictionPressure ?? scheduleContext?.predictionPressureSummary;
  const resourceSummary = scheduleContext?.summaries?.resourceDispatch ?? scheduleContext?.resourceDispatchSummary;
  const securityBasis = scheduleContext?.summaries?.securityBasis ?? scheduleContext?.securityBasis;
  const resourceLocks = scheduleContext?.resourceLocks ?? [];

  return (
    <Card
      title={
        <Space wrap>
          <span>调度决策说明</span>
          <Tag color="blue">{algorithm?.mode ?? 'Filter-Score-Reserve'}</Tag>
          {filter?.degraded && <Tag color="red">降级评分</Tag>}
        </Space>
      }
      size="small"
      style={{ margin: '16px 0' }}
      extra={
        <Space>
          <Button
            size="small"
            icon={<SafetyOutlined />}
            onClick={() => onSecurityDetail?.(selected_node.node_id)}
          >
            安全依据
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<SendOutlined />}
            loading={executing}
            onClick={() => onExecute?.(selected_node.node_id)}
          >
            确认下发
          </Button>
        </Space>
      }
    >
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} md={6}>
          <Card size="small" style={{ background: '#f8fafc' }}>
            <Text type="secondary">硬过滤</Text>
            <div style={{ marginTop: 8 }}>
              <Text strong style={{ fontSize: 22 }}>{filter?.eligible_count ?? scored_candidates.length}</Text>
              <Text type="secondary"> / {filter?.input_count ?? scored_candidates.length} 可行</Text>
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>剔除 {filter?.filtered_count ?? 0} 个不可行节点</Text>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card size="small" style={{ background: '#f8fafc' }}>
            <Text type="secondary">推荐节点</Text>
            <div style={{ marginTop: 8 }}>
              <Text strong style={{ fontSize: 18, color: '#1565c0' }}>{selected_node.node_name}</Text>
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>{selected_node.node_id}</Text>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card size="small" style={{ background: '#f8fafc' }}>
            <Text type="secondary">综合得分</Text>
            <div style={{ marginTop: 8 }}>
              <Text strong style={{ fontSize: 24, color: '#1565c0' }}>{selected_node.total_score.toFixed(1)}</Text>
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>风险扣分 {(selected_node.risk_penalty ?? 0).toFixed(1)}</Text>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card size="small" style={{ background: '#f8fafc' }}>
            <Text type="secondary">节点组</Text>
            <div style={{ marginTop: 8 }}>
              <Text strong style={{ fontSize: 24 }}>{participantGroup.length || 1}</Text>
              <Text type="secondary"> 个同步推荐</Text>
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>联邦任务按 Gang 思路预留</Text>
          </Card>
        </Col>
      </Row>

      <Alert
        type="info"
        showIcon
        message={formula}
        description={
          <Space wrap size={[12, 4]}>
            {Object.entries(weights).map(([key, value]) => (
              <Tag key={key}>{key}: {(value * 100).toFixed(0)}%</Tag>
            ))}
            {taskReq && <Tag color="blue">需求 CPU {taskReq.cpu}核 / GPU {taskReq.gpu}张 / 内存 {taskReq.memory}GB</Tag>}
          </Space>
        }
        style={{ marginBottom: 12 }}
      />

      {(predictionSummary || resourceSummary || securityBasis) && (
        <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
          {predictionSummary && (
            <Col xs={24} md={8}>
              <Card size="small" title="预测压力摘要">
                <Space direction="vertical" size={6}>
                  <Text type="secondary">推荐窗口：{predictionSummary.recommendedWindow ?? '--'}</Text>
                  <Text type="secondary">紧张区域：{(predictionSummary.tightRegions ?? []).slice(0, 2).map((i: any) => i.regionId).join('、') || '暂无'}</Text>
                  <Text type="secondary">不推荐节点：{(predictionSummary.notRecommendedNodes ?? []).slice(0, 2).map((i: any) => i.nodeName).join('、') || '暂无'}</Text>
                </Space>
              </Card>
            </Col>
          )}
          {resourceSummary && (
            <Col xs={24} md={8}>
              <Card size="small" title="资源调度摘要">
                <Space direction="vertical" size={6}>
                  <Text type="secondary">空闲优先：{(resourceSummary.idleTop5 ?? []).slice(0, 2).map((i: any) => i.nodeName).join('、') || '--'}</Text>
                  <Text type="secondary">GPU 富裕：{(resourceSummary.gpuRichNodes ?? []).slice(0, 2).map((i: any) => i.nodeName).join('、') || '--'}</Text>
                  <Text type="secondary">风险节点：{(resourceSummary.riskyNodes ?? []).slice(0, 2).map((i: any) => i.nodeName).join('、') || '暂无'}</Text>
                </Space>
              </Card>
            </Col>
          )}
          {securityBasis && (
            <Col xs={24} md={8}>
              <Card size="small" title="安全调度依据">
                <Space direction="vertical" size={6}>
                  <Text type="secondary">安全等级：{securityBasis.grade ?? '--'}</Text>
                  <Text type="secondary">主导风险：{securityBasis.dominantRisk ?? '--'}</Text>
                  <Text type="secondary">{securityBasis.dispatchAdvice ?? '纳入硬过滤和多目标评分。'}</Text>
                </Space>
              </Card>
            </Col>
          )}
        </Row>
      )}

      <Table<ScoredCandidate>
        columns={columns}
        dataSource={scored_candidates}
        rowKey="node_id"
        size="small"
        pagination={false}
        scroll={{ x: 820 }}
      />

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} lg={participantGroup.length ? 12 : 24}>
          <Alert
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
            message="决策依据"
            description={decision_basis}
          />
        </Col>
        {participantGroup.length ? (
          <Col xs={24} lg={12}>
            <Card size="small" title="节点组与资源预留">
              <Descriptions
                size="small"
                column={1}
                items={participantGroup.map((item) => ({
                  key: item.node_id,
                  label: item.role === 'aggregator' ? '聚合节点' : '参与节点',
                  children: (
                    <Space wrap>
                      <Text strong>{item.node_name}</Text>
                      <Tag>分数 {item.score}</Tag>
                      {item.reserve && <Tag color="blue">预留 CPU {item.reserve.cpu} / GPU {item.reserve.gpu} / 内存 {item.reserve.memory}GB</Tag>}
                    </Space>
                  ),
                }))}
              />
            </Card>
          </Col>
        ) : null}
      </Row>

      {resourceLocks.length ? (
        <Card size="small" title="资源预留与释放" style={{ marginTop: 12 }}>
          <Space wrap>
            {resourceLocks.slice(0, 4).map((item: any) => (
              <Tag key={item.lockId ?? item.nodeId} color={item.status === 'active' ? 'blue' : 'default'}>
                {item.nodeId}: CPU {item.cpu} / GPU {item.gpu} / 内存 {item.memory}GB / {item.status}
              </Tag>
            ))}
          </Space>
        </Card>
      ) : null}

      {filteredOut.length ? (
        <Card size="small" title="硬过滤剔除节点" style={{ marginTop: 12 }}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {filteredOut.slice(0, 4).map((item) => (
              <div key={item.node_id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <Tag color="default">{item.node_name}</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>{item.reasons.join('；')}</Text>
              </div>
            ))}
          </Space>
        </Card>
      ) : null}
    </Card>
  );
};

export default DecisionPanel;
