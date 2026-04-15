import React from 'react';
import { CiOutlined, DatabaseOutlined, FundProjectionScreenOutlined } from '@ant-design/icons';
import { Card, Col, Descriptions, Row, Select, Tag } from 'antd';
import { GaugeChart, LineChart } from '@/components/Charts';

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
};

type NodeDashboard = {
  node_id: string;
  cpu_total_usage: number;
  cpu_system_usage: number;
  cpu_user_usage: number;
  gpu_usage: number;
  gpu_memory_total_gb: number;
  gpu_memory_used_gb: number;
  memory_usage_percent: number;
  memory_total_gb: number;
  memory_used_gb: number;
  disk_total_gb: number;
  disk_used_gb: number;
  disk_available_gb: number;
  updated_at: number;
};

type NodeHistory = {
  node_id: string;
  period: string;
  labels: string[];
  cpu_system_usage: number[];
  cpu_user_usage: number[];
  cpu_usage: number[];
  gpu_usage: number[];
  memory_usage: number[];
  updated_at: number;
};

type Props = {
  nodes: NodeSummary[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  dashboard: NodeDashboard;
  history: NodeHistory;
  loading?: boolean;
};

const NodeMonitorPanel: React.FC<Props> = ({
  nodes,
  selectedNodeId,
  onSelectNode,
  dashboard,
  history,
}) => {
  const toPercent = (used: number, total: number) => {
    if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) {
      return 0;
    }

    return Math.min(100, Math.max(0, (used / total) * 100));
  };

  const selectedNode = nodes.find((node) => node.node_id === selectedNodeId);
  const loadedNode = nodes.find((node) => node.node_id === dashboard.node_id);
  const diskUsedPercent = toPercent(dashboard.disk_used_gb, dashboard.disk_total_gb);
  const gpuMemUsedPercent = toPercent(dashboard.gpu_memory_used_gb, dashboard.gpu_memory_total_gb);
  const normalizedStatus = (loadedNode?.status ?? '').toLowerCase();
  const statusColor = normalizedStatus.includes('offline')
    ? 'red'
    : normalizedStatus.includes('warn')
      ? 'orange'
      : 'green';
  const updatedAt = new Date(dashboard.updated_at * 1000).toLocaleString('zh-CN', {
    hour12: false,
  });

  const titleWithIcon = (icon: React.ReactNode, text: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {icon}
      {text}
    </span>
  );

  return (
    <Card
      title="单节点资源监控"
      extra={
        <Select
          style={{ width: 260 }}
          size="small"
          value={selectedNodeId}
          onChange={onSelectNode}
          options={nodes.map((node) => ({
            value: node.node_id,
            label: `${node.hostname} (${node.node_id})`,
          }))}
        />
      }
    >
      <Descriptions
        bordered
        size="small"
        column={{ xs: 1, sm: 2, lg: 4 }}
        style={{ marginBottom: 16 }}
      >
        <Descriptions.Item label="当前选择">{selectedNodeId}</Descriptions.Item>
        <Descriptions.Item label="已加载节点">{dashboard.node_id}</Descriptions.Item>
        <Descriptions.Item label="节点">{loadedNode?.hostname ?? dashboard.node_id}</Descriptions.Item>
        <Descriptions.Item label="IP">{loadedNode?.ip ?? '--'}</Descriptions.Item>
        <Descriptions.Item label="状态">
          <Tag color={statusColor}>{loadedNode?.status ?? 'unknown'}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="更新时间">{updatedAt}</Descriptions.Item>
        <Descriptions.Item label="选择名称">{selectedNode?.hostname ?? '--'}</Descriptions.Item>
        <Descriptions.Item label="历史周期">{history.period}</Descriptions.Item>
      </Descriptions>

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} xl={6}>
          <GaugeChart title="总 CPU" value={dashboard.cpu_total_usage} color="#1677ff" height={150} />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <GaugeChart title="GPU 使用率" value={dashboard.gpu_usage} color="#faad14" height={150} />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <GaugeChart title="内存使用率" value={dashboard.memory_usage_percent} color="#52c41a" height={150} />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <GaugeChart title="磁盘已用" value={diskUsedPercent} color="#722ed1" height={150} />
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} lg={8}>
          <Descriptions
            bordered
            size="small"
            column={1}
            title={titleWithIcon(<CiOutlined />, 'CPU 细分')}
          >
            <Descriptions.Item label="总 CPU">{`${dashboard.cpu_total_usage.toFixed(1)}%`}</Descriptions.Item>
            <Descriptions.Item label="系统 CPU">{`${dashboard.cpu_system_usage.toFixed(1)}%`}</Descriptions.Item>
            <Descriptions.Item label="用户 CPU">{`${dashboard.cpu_user_usage.toFixed(1)}%`}</Descriptions.Item>
          </Descriptions>
        </Col>

        <Col xs={24} lg={8}>
          <Descriptions
            bordered
            size="small"
            column={1}
            title={titleWithIcon(<FundProjectionScreenOutlined />, 'GPU / 显存')}
          >
            <Descriptions.Item label="GPU 使用率">{`${dashboard.gpu_usage.toFixed(1)}%`}</Descriptions.Item>
            <Descriptions.Item label="显存已用">
              {`${dashboard.gpu_memory_used_gb.toFixed(1)} GB / ${dashboard.gpu_memory_total_gb.toFixed(1)} GB`}
            </Descriptions.Item>
            <Descriptions.Item label="显存占比">{`${Math.round(gpuMemUsedPercent)}%`}</Descriptions.Item>
          </Descriptions>
        </Col>

        <Col xs={24} lg={8}>
          <Descriptions
            bordered
            size="small"
            column={1}
            title={titleWithIcon(<DatabaseOutlined />, '内存 / 磁盘')}
          >
            <Descriptions.Item label="内存已用">
              {`${dashboard.memory_used_gb.toFixed(1)} GB / ${dashboard.memory_total_gb.toFixed(1)} GB`}
            </Descriptions.Item>
            <Descriptions.Item label="磁盘已用">
              {`${dashboard.disk_used_gb.toFixed(1)} GB / ${dashboard.disk_total_gb.toFixed(1)} GB`}
            </Descriptions.Item>
            <Descriptions.Item label="可用磁盘">{`${dashboard.disk_available_gb.toFixed(1)} GB`}</Descriptions.Item>
          </Descriptions>
        </Col>
      </Row>

      <div style={{ marginTop: 16 }}>
        <LineChart
          title="CPU 使用趋势"
          xData={history.labels}
          series={[
            { name: '系统 CPU', data: history.cpu_system_usage, color: '#1677ff', areaStyle: true },
            { name: '用户 CPU', data: history.cpu_user_usage, color: '#ff7875', areaStyle: true },
          ]}
          height={260}
        />
      </div>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} xl={12}>
          <LineChart
            title="GPU 使用趋势"
            xData={history.labels}
            series={[{ name: 'GPU 使用率', data: history.gpu_usage, color: '#faad14', areaStyle: true }]}
            height={220}
          />
        </Col>
        <Col xs={24} xl={12}>
          <LineChart
            title="内存使用趋势"
            xData={history.labels}
            series={[{ name: '内存使用率', data: history.memory_usage, color: '#52c41a', areaStyle: true }]}
            height={220}
          />
        </Col>
      </Row>
    </Card>
  );
};

export default NodeMonitorPanel;
