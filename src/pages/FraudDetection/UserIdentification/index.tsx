
import React from 'react';
import { Row, Col, Card, Table, Tag, Descriptions } from 'antd';
import { PieChart, BarChart } from '@/components/Charts';
import ReactECharts from 'echarts-for-react';

/**
 * Fraud User Identification - Module 3, Page 1
 * Features:
 * - Federated graph model for user identification
 * - Graph convolutional network (GCN) for fraud detection
 * - User behavior feature modeling
 */
const UserIdentification: React.FC = () => {
  // Suspected fraud users
  const fraudUsers = [
    { id: 'u1', phone: '138****1234', region: '北京', risk: 95, type: '冒充公检法', features: '高频外呼、短时通话', status: '已确认' },
    { id: 'u2', phone: '159****5678', region: '上海', risk: 87, type: '投资理财', features: '群发短信、异地登录', status: '待核实' },
    { id: 'u3', phone: '177****9012', region: '广州', risk: 82, type: '网络贷款', features: '频繁换卡、夜间活跃', status: '待核实' },
    { id: 'u4', phone: '135****3456', region: '深圳', risk: 91, type: '冒充客服', features: '高频外呼、多地漫游', status: '已确认' },
    { id: 'u5', phone: '188****7890', region: '杭州', risk: 78, type: '刷单诈骗', features: '批量注册、短期使用', status: '排查中' },
  ];

  const userColumns = [
    { title: '手机号', dataIndex: 'phone', key: 'phone' },
    { title: '归属地', dataIndex: 'region', key: 'region' },
    { title: '风险评分', dataIndex: 'risk', key: 'risk', sorter: (a: any, b: any) => a.risk - b.risk,
      render: (v: number) => <Tag color={v >= 90 ? 'red' : v >= 80 ? 'orange' : 'gold'}>{v}</Tag> },
    { title: '诈骗类型', dataIndex: 'type', key: 'type' },
    { title: '行为特征', dataIndex: 'features', key: 'features' },
    { title: '状态', dataIndex: 'status', key: 'status',
      render: (s: string) => {
        const color = s === '已确认' ? 'red' : s === '待核实' ? 'orange' : 'blue';
        return <Tag color={color}>{s}</Tag>;
      }},
  ];

  // GCN network graph
  const graphOption = {
    title: { text: '联邦图卷积网络 — 用户关联关系', textStyle: { fontSize: 14, fontWeight: 500 } },
    tooltip: {},
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,
      force: { repulsion: 120, edgeLength: [80, 160] },
      label: { show: true, fontSize: 10 },
      categories: [
        { name: '正常用户', itemStyle: { color: '#52c41a' } },
        { name: '可疑用户', itemStyle: { color: '#faad14' } },
        { name: '诈骗用户', itemStyle: { color: '#ff4d4f' } },
      ],
      data: [
        { name: 'A', category: 0, symbolSize: 30 },
        { name: 'B', category: 0, symbolSize: 25 },
        { name: 'C', category: 1, symbolSize: 35 },
        { name: 'D', category: 2, symbolSize: 40 },
        { name: 'E', category: 0, symbolSize: 20 },
        { name: 'F', category: 1, symbolSize: 30 },
        { name: 'G', category: 2, symbolSize: 35 },
        { name: 'H', category: 0, symbolSize: 22 },
        { name: 'I', category: 1, symbolSize: 28 },
        { name: 'J', category: 0, symbolSize: 26 },
      ],
      edges: [
        { source: 'A', target: 'C' }, { source: 'B', target: 'C' },
        { source: 'C', target: 'D' }, { source: 'D', target: 'G' },
        { source: 'E', target: 'F' }, { source: 'F', target: 'D' },
        { source: 'H', target: 'I' }, { source: 'I', target: 'G' },
        { source: 'J', target: 'A' }, { source: 'J', target: 'B' },
        { source: 'F', target: 'G' }, { source: 'C', target: 'I' },
      ],
      lineStyle: { color: '#ccc', curveness: 0.1 },
    }],
    legend: { data: ['正常用户', '可疑用户', '诈骗用户'], bottom: 0 },
  };

  return (
    <div>
      {/* User identification results */}
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card title="基于强化联邦学习的电信诈骗用户识别">
            <Table dataSource={fraudUsers} columns={userColumns} rowKey="id" pagination={false} size="small" />
          </Card>
        </Col>
      </Row>

      {/* Graph model and behavior features */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={14}>
          <Card>
            <ReactECharts option={graphOption} style={{ height: 400 }} />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="用户行为特征分布">
            <BarChart
              xData={['高频外呼', '群发短信', '异地登录', '频繁换卡', '夜间活跃', '批量注册', '多地漫游']}
              series={[
                { name: '诈骗用户', data: [85, 72, 68, 55, 62, 48, 58], color: '#ff4d4f' },
                { name: '正常用户', data: [12, 8, 25, 5, 18, 3, 15], color: '#52c41a' },
              ]}
              height={200}
            />
            <PieChart
              title="诈骗类型分布"
              data={[
                { name: '冒充公检法', value: 28 },
                { name: '投资理财', value: 22 },
                { name: '网络贷款', value: 18 },
                { name: '冒充客服', value: 15 },
                { name: '刷单诈骗', value: 12 },
                { name: '其他', value: 5 },
              ]}
              height={200}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default UserIdentification;
