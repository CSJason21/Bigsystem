
import React from 'react';
import { Row, Col, Card, Table, Tag, Progress } from 'antd';
import { GaugeChart, LineChart, BarChart, PieChart } from '@/components/Charts';
import { generateTimeLabels, generateSeriesData, mockNodes } from '@/mock/data';

/**
 * Edge Computing Control Layer - Module 1, Page 2
 * Features:
 * - Client node contribution monitoring
 * - Task resource allocation
 * - Resource accumulation and fairness analysis
 */
const EdgeControl: React.FC = () => {
  const timeLabels = generateTimeLabels(8);

  // Client contribution data
  const clientContributions = [
    { id: 'c1', name: '客户端-01', cpu: 120, memory: 256, gpu: 40, duration: '4h 23m', tasks: 12 },
    { id: 'c2', name: '客户端-02', cpu: 95, memory: 192, gpu: 32, duration: '3h 45m', tasks: 9 },
    { id: 'c3', name: '客户端-03', cpu: 180, memory: 384, gpu: 56, duration: '6h 12m', tasks: 18 },
    { id: 'c4', name: '客户端-04', cpu: 60, memory: 128, gpu: 16, duration: '2h 10m', tasks: 5 },
    { id: 'c5', name: '客户端-05', cpu: 150, memory: 320, gpu: 48, duration: '5h 30m', tasks: 15 },
  ];

  const contributionColumns = [
    { title: '客户端', dataIndex: 'name', key: 'name' },
    { title: 'CPU贡献(核时)', dataIndex: 'cpu', key: 'cpu', sorter: (a: any, b: any) => a.cpu - b.cpu },
    { title: '内存贡献(GB·h)', dataIndex: 'memory', key: 'memory', sorter: (a: any, b: any) => a.memory - b.memory },
    { title: 'GPU贡献(核时)', dataIndex: 'gpu', key: 'gpu', sorter: (a: any, b: any) => a.gpu - b.gpu },
    { title: '运行时长', dataIndex: 'duration', key: 'duration' },
    { title: '完成任务数', dataIndex: 'tasks', key: 'tasks', sorter: (a: any, b: any) => a.tasks - b.tasks },
  ];

  // Task resource allocation
  const taskAllocations = [
    { id: 't1', name: '联邦训练A', node: '客户端-01', cpu: 4, memory: 8, gpu: 1, status: '运行中', progress: 72 },
    { id: 't2', name: '联邦训练B', node: '客户端-03', cpu: 8, memory: 16, gpu: 2, status: '运行中', progress: 45 },
    { id: 't3', name: '模型聚合C', node: '客户端-02', cpu: 2, memory: 4, gpu: 0, status: '已完成', progress: 100 },
    { id: 't4', name: '数据预处理D', node: '客户端-05', cpu: 4, memory: 8, gpu: 1, status: '运行中', progress: 88 },
  ];

  const taskColumns = [
    { title: '任务名称', dataIndex: 'name', key: 'name' },
    { title: '分配节点', dataIndex: 'node', key: 'node' },
    { title: 'CPU(核)', dataIndex: 'cpu', key: 'cpu' },
    { title: '内存(GB)', dataIndex: 'memory', key: 'memory' },
    { title: 'GPU', dataIndex: 'gpu', key: 'gpu' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === '运行中' ? 'processing' : 'success'}>{s}</Tag> },
    { title: '进度', dataIndex: 'progress', key: 'progress', render: (v: number) => <Progress percent={v} size="small" /> },
  ];

  return (
    <div>
      {/* Client contribution monitoring */}
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card title="客户端节点资源贡献监控">
            <Table dataSource={clientContributions} columns={contributionColumns} rowKey="id" pagination={false} size="small" />
          </Card>
        </Col>
      </Row>

      {/* Resource contribution trend */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card title="客户端资源贡献趋势">
            <BarChart
              xData={['客户端-01', '客户端-02', '客户端-03', '客户端-04', '客户端-05']}
              series={[
                { name: 'CPU贡献', data: [120, 95, 180, 60, 150], color: '#1677ff' },
                { name: '内存贡献', data: [256, 192, 384, 128, 320], color: '#52c41a' },
                { name: 'GPU贡献', data: [40, 32, 56, 16, 48], color: '#faad14' },
              ]}
              height={300}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="资源分配公平性分析">
            <PieChart
              data={[
                { name: '客户端-01', value: 120 },
                { name: '客户端-02', value: 95 },
                { name: '客户端-03', value: 180 },
                { name: '客户端-04', value: 60 },
                { name: '客户端-05', value: 150 },
              ]}
              height={300}
            />
          </Card>
        </Col>
      </Row>

      {/* Task allocation */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={14}>
          <Card title="任务资源分配">
            <Table dataSource={taskAllocations} columns={taskColumns} rowKey="id" pagination={false} size="small" />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="资源累计使用趋势">
            <LineChart
              xData={timeLabels}
              series={[
                { name: 'CPU累计', data: generateSeriesData(8, 100, 500), color: '#1677ff', areaStyle: true },
                { name: '内存累计', data: generateSeriesData(8, 200, 800), color: '#52c41a', areaStyle: true },
              ]}
              height={280}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default EdgeControl;
