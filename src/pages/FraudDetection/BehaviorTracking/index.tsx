
import React from 'react';
import { Row, Col, Card, Table, Tag, Timeline, Button, Space } from 'antd';
import { LineChart, BarChart } from '@/components/Charts';
import { generateTimeLabels, generateSeriesData } from '@/mock/data';

/**
 * Abnormal Behavior Tracking - Module 3, Page 2
 * Features:
 * - Privacy-preserving hash desensitization for behavior tracking
 * - Incremental update for fraud label
 * - Verified fraud user statistics
 */
const BehaviorTracking: React.FC = () => {
  // Tracked suspicious users
  const trackedUsers = [
    { id: 't1', hashId: '0x3a7f...c2e1', region: '北京', behavior: '频繁外呼异地号码', risk: 92, verified: true, time: '2024-01-15 14:23' },
    { id: 't2', hashId: '0x8b2d...f4a9', region: '上海', behavior: '短时间内群发短信', risk: 88, verified: true, time: '2024-01-15 15:01' },
    { id: 't3', hashId: '0x5e1c...a7b3', region: '广州', behavior: '多次更换SIM卡', risk: 76, verified: false, time: '2024-01-15 16:45' },
    { id: 't4', hashId: '0x9d4e...b8c6', region: '深圳', behavior: '夜间频繁通话', risk: 81, verified: false, time: '2024-01-15 17:30' },
    { id: 't5', hashId: '0x2f6a...d1e8', region: '成都', behavior: '异常基站切换', risk: 85, verified: true, time: '2024-01-15 18:12' },
  ];

  const trackColumns = [
    { title: '匿名标识', dataIndex: 'hashId', key: 'hashId', render: (v: string) => <code>{v}</code> },
    { title: '归属地', dataIndex: 'region', key: 'region' },
    { title: '异常行为', dataIndex: 'behavior', key: 'behavior' },
    { title: '风险评分', dataIndex: 'risk', key: 'risk', render: (v: number) => <Tag color={v >= 85 ? 'red' : 'orange'}>{v}</Tag> },
    { title: '核实状态', dataIndex: 'verified', key: 'verified',
      render: (v: boolean) => <Tag color={v ? 'red' : 'processing'}>{v ? '已确认诈骗' : '待核实'}</Tag> },
    { title: '追踪时间', dataIndex: 'time', key: 'time' },
    { title: '操作', key: 'action', render: (_: any, record: any) => (
      <Space>
        <Button size="small" type="link">详情</Button>
        {!record.verified && <Button size="small" type="link" danger>标记诈骗</Button>}
      </Space>
    )},
  ];

  return (
    <div>
      {/* Tracked users */}
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card title="基于隐私保护的用户异常通信行为追踪" extra={
            <Space>
              <Button type="primary">增量更新模型</Button>
              <Button>导出报告</Button>
            </Space>
          }>
            <Table dataSource={trackedUsers} columns={trackColumns} rowKey="id" pagination={false} size="small" />
          </Card>
        </Col>
      </Row>

      {/* Fraud user statistics and timeline */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={14}>
          <Card title="真实诈骗电话统计分析 — 欺诈用户数量变化趋势">
            <LineChart
              xData={generateTimeLabels(7, 'day')}
              series={[
                { name: '新增可疑用户', data: generateSeriesData(7, 10, 50), color: '#faad14', areaStyle: true },
                { name: '确认诈骗用户', data: generateSeriesData(7, 5, 30), color: '#ff4d4f', areaStyle: true },
              ]}
              height={300}
            />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="行为追踪时间线">
            <Timeline
              items={[
                { color: 'red', children: '14:23 — 检测到0x3a7f...c2e1频繁外呼异地号码，风险评分92' },
                { color: 'red', children: '15:01 — 检测到0x8b2d...f4a9短时间群发短信，风险评分88' },
                { color: 'orange', children: '16:45 — 检测到0x5e1c...a7b3多次更换SIM卡，风险评分76' },
                { color: 'orange', children: '17:30 — 检测到0x9d4e...b8c6夜间频繁通话，风险评分81' },
                { color: 'red', children: '18:12 — 检测到0x2f6a...d1e8异常基站切换，风险评分85' },
                { color: 'green', children: '18:30 — 0x3a7f...c2e1经第三方核实确认为诈骗用户' },
                { color: 'green', children: '19:00 — 模型增量更新完成，准确率提升至94.2%' },
              ]}
            />
          </Card>
        </Col>
      </Row>

      {/* Regional fraud comparison */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card title="各区域欺诈用户统计">
            <BarChart
              xData={['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '南京', '重庆', '西安']}
              series={[
                { name: '可疑用户数', data: [45, 38, 32, 28, 22, 20, 18, 15, 14, 12], color: '#faad14' },
                { name: '确认诈骗数', data: [28, 22, 18, 16, 12, 11, 9, 8, 7, 6], color: '#ff4d4f' },
              ]}
              height={280}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default BehaviorTracking;
