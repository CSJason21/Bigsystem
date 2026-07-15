
import React from 'react';
import { Row, Col, Card, Table, Tag, Statistic } from 'antd';
import { CloudServerOutlined, DesktopOutlined, HddOutlined, WifiOutlined } from '@ant-design/icons';
import { GaugeChart, LineChart } from '@/components/Charts';
import ChatAssistant from '@/components/Chat/ChatAssistant';
import TopologyGraph from '@/components/TopologyGraph';
import { generateTimeLabels, generateSeriesData, mockNodes } from '@/mock/data';

/**
 * User Control Layer - Module 1, Page 1
 * Features:
 * - Real-time resource monitoring (CPU, Memory, Disk, Network)
 * - Historical data query
 * - Task & resource model management
 * - LLM-based chat assistant
 * - Edge node awareness
 */
const UserControl: React.FC = () => {
  const timeLabels = generateTimeLabels(12);

  const nodeColumns = [
    { title: '节点名称', dataIndex: 'name', key: 'name' },
    { title: 'IP地址', dataIndex: 'ip', key: 'ip' },
    { title: 'CPU(%)', dataIndex: 'cpu', key: 'cpu', render: (v: number) => <Tag color={v > 80 ? 'red' : v > 60 ? 'orange' : 'green'}>{v}%</Tag> },
    { title: '内存(%)', dataIndex: 'memory', key: 'memory', render: (v: number) => <Tag color={v > 80 ? 'red' : v > 60 ? 'orange' : 'green'}>{v}%</Tag> },
    { title: '磁盘(%)', dataIndex: 'disk', key: 'disk', render: (v: number) => <Tag color={v > 80 ? 'red' : v > 60 ? 'orange' : 'green'}>{v}%</Tag> },
    { title: 'GPU(%)', dataIndex: 'gpu', key: 'gpu', render: (v: number) => <Tag color={v > 80 ? 'red' : v > 60 ? 'orange' : 'green'}>{v}%</Tag> },
    {
      title: '状态', dataIndex: 'status', key: 'status',
      render: (s: string) => {
        const map: Record<string, { color: string; text: string }> = {
          running: { color: 'green', text: '运行中' },
          idle: { color: 'blue', text: '空闲' },
          warning: { color: 'orange', text: '告警' },
          critical: { color: 'red', text: '严重' },
        };
        const item = map[s] || { color: 'default', text: s };
        return <Tag color={item.color}>{item.text}</Tag>;
      },
    },
  ];

  return (
    <div>
      {/* Real-time resource gauges */}
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card className="stat-card">
            <Statistic title="CPU使用率" value={72} suffix="%" prefix={<DesktopOutlined />} valueStyle={{ color: '#1677ff' }} />
            <GaugeChart title="CPU" value={72} color="#1677ff" height={160} />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stat-card">
            <Statistic title="内存使用率" value={65} suffix="%" prefix={<HddOutlined />} valueStyle={{ color: '#52c41a' }} />
            <GaugeChart title="内存" value={65} color="#52c41a" height={160} />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stat-card">
            <Statistic title="磁盘使用率" value={48} suffix="%" prefix={<CloudServerOutlined />} valueStyle={{ color: '#faad14' }} />
            <GaugeChart title="磁盘" value={48} color="#faad14" height={160} />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stat-card">
            <Statistic title="网络带宽" value={156} suffix="Mbps" prefix={<WifiOutlined />} valueStyle={{ color: '#eb2f96' }} />
            <GaugeChart title="网络" value={78} color="#eb2f96" height={160} />
          </Card>
        </Col>
      </Row>

      {/* History data line chart */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={16}>
          <Card title="历史资源使用变化">
            <LineChart
              xData={timeLabels}
              series={[
                { name: 'CPU', data: generateSeriesData(12, 40, 90), color: '#1677ff', areaStyle: true },
                { name: '内存', data: generateSeriesData(12, 30, 80), color: '#52c41a', areaStyle: true },
                { name: '磁盘', data: generateSeriesData(12, 20, 60), color: '#faad14', areaStyle: true },
              ]}
              height={300}
            />
          </Card>
        </Col>
        <Col span={8}>
          <ChatAssistant title="大模型任务助手" height={360} />
        </Col>
      </Row>

      {/* Edge node topology */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <TopologyGraph title="边缘节点感知拓扑" height={400} />
        </Col>
        <Col span={12}>
          <Card title="边缘节点运行状态">
            <Table dataSource={mockNodes} columns={nodeColumns} rowKey="id" pagination={false} size="small" />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default UserControl;
