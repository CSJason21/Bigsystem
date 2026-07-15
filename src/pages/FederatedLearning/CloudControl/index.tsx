
import React from 'react';
import { Row, Col, Card, Table, Tag, Button, Space, Select } from 'antd';
import { LineChart, BarChart } from '@/components/Charts';
import TopologyGraph from '@/components/TopologyGraph';
import { generateTimeLabels, generateSeriesData, mockNodes, mockTasks } from '@/mock/data';
import ReactECharts from 'echarts-for-react';

/**
 * Cloud Center Control Layer - Module 1, Page 3
 * Features:
 * - Flexible resource management with client selection
 * - Real-time monitoring and decision making
 * - Global resource management & RL scheduling
 * - Task & resource model management
 */
const CloudControl: React.FC = () => {
  const timeLabels = generateTimeLabels(10);

  const taskColumns = [
    { title: '任务ID', dataIndex: 'id', key: 'id' },
    { title: '任务名称', dataIndex: 'name', key: 'name' },
    { title: '类型', dataIndex: 'type', key: 'type', render: (t: string) => <Tag>{t}</Tag> },
    { title: '分配节点', dataIndex: 'node', key: 'node' },
    { title: 'CPU(核)', dataIndex: 'cpu', key: 'cpu' },
    { title: '内存(GB)', dataIndex: 'memory', key: 'memory' },
    { title: 'GPU', dataIndex: 'gpu', key: 'gpu' },
    {
      title: '状态', dataIndex: 'status', key: 'status',
      render: (s: string) => {
        const colorMap: Record<string, string> = { '运行中': 'processing', '已完成': 'success', '排队中': 'warning' };
        return <Tag color={colorMap[s] || 'default'}>{s}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      render: () => (
        <Space>
          <Button size="small" type="link">调度</Button>
          <Button size="small" type="link">详情</Button>
        </Space>
      ),
    },
  ];

  // RL scheduling heatmap option
  const rlScheduleOption = {
    title: { text: '强化学习调度热力图', textStyle: { fontSize: 14, fontWeight: 500 } },
    tooltip: { position: 'top' },
    grid: { top: 40, right: 20, bottom: 60, left: 80 },
    xAxis: {
      type: 'category',
      data: ['任务A', '任务B', '任务C', '任务D', '任务E'],
    },
    yAxis: {
      type: 'category',
      data: ['节点-01', '节点-02', '节点-03', '节点-04', '节点-05', '节点-06'],
    },
    visualMap: {
      min: 0,
      max: 100,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: { color: ['#e0f3ff', '#1677ff'] },
    },
    series: [{
      type: 'heatmap',
      data: [
        [0, 0, 85], [0, 1, 30], [0, 2, 60], [0, 3, 15], [0, 4, 45], [0, 5, 70],
        [1, 0, 40], [1, 1, 90], [1, 2, 25], [1, 3, 55], [1, 4, 75], [1, 5, 20],
        [2, 0, 55], [2, 1, 45], [2, 2, 80], [2, 3, 35], [2, 4, 60], [2, 5, 50],
        [3, 0, 20], [3, 1, 65], [3, 2, 40], [3, 3, 95], [3, 4, 30], [3, 5, 85],
        [4, 0, 70], [4, 1, 35], [4, 2, 55], [4, 3, 45], [4, 4, 88], [4, 5, 40],
      ],
      label: { show: true },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' } },
    }],
  };

  return (
    <div>
      {/* Client selection and operations */}
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card title="全局资源管理" extra={
            <Space>
              <Select defaultValue="all" style={{ width: 160 }} options={[
                { value: 'all', label: '全部客户端' },
                ...mockNodes.map((n) => ({ value: n.id, label: n.name })),
              ]} />
              <Button type="primary">任务调度</Button>
              <Button>资源分配</Button>
            </Space>
          }>
            <Table dataSource={mockTasks} columns={taskColumns} rowKey="id" pagination={false} size="small" />
          </Card>
        </Col>
      </Row>

      {/* RL scheduling visualization and task-resource model */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card>
            <ReactECharts option={rlScheduleOption} style={{ height: 350 }} />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="任务与资源模型管理">
            <BarChart
              xData={['任务A', '任务B', '任务C', '任务D', '任务E']}
              series={[
                { name: 'CPU需求', data: [4, 8, 2, 4, 6], color: '#1677ff' },
                { name: '内存需求', data: [8, 16, 4, 8, 12], color: '#52c41a' },
                { name: 'GPU需求', data: [1, 2, 0, 1, 2], color: '#faad14' },
              ]}
              height={350}
            />
          </Card>
        </Col>
      </Row>

      {/* Real-time resource trend */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card title="全局资源使用实时趋势">
            <LineChart
              xData={timeLabels}
              series={[
                { name: 'CPU总使用率', data: generateSeriesData(10, 50, 85), color: '#1677ff', areaStyle: true },
                { name: '内存总使用率', data: generateSeriesData(10, 40, 75), color: '#52c41a', areaStyle: true },
                { name: 'GPU总使用率', data: generateSeriesData(10, 30, 90), color: '#faad14', areaStyle: true },
              ]}
              height={280}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default CloudControl;
