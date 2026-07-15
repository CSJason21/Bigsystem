
import React from 'react';
import { Row, Col, Card } from 'antd';
import { PieChart } from '@/components/Charts';
import ReactECharts from 'echarts-for-react';

/**
 * Text Data Mining - Module 3, Page 5
 * Features:
 * - Telecom fraud SMS domain distribution
 * - Fraud similarity relationship graph
 * - Fraud feature scatter plot
 */
const TextMining: React.FC = () => {
  // Similarity relationship graph
  const relationGraphOption = {
    title: { text: '电信欺诈相似性关系图', textStyle: { fontSize: 14, fontWeight: 500 } },
    tooltip: {},
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,
      force: { repulsion: 150, edgeLength: [60, 140] },
      label: { show: true, fontSize: 11 },
      categories: [
        { name: '冒充公检法', itemStyle: { color: '#ff4d4f' } },
        { name: '投资理财', itemStyle: { color: '#faad14' } },
        { name: '网络贷款', itemStyle: { color: '#1677ff' } },
        { name: '冒充客服', itemStyle: { color: '#52c41a' } },
      ],
      data: [
        { name: '案例A1', category: 0, symbolSize: 35, value: 95 },
        { name: '案例A2', category: 0, symbolSize: 30, value: 88 },
        { name: '案例B1', category: 1, symbolSize: 32, value: 82 },
        { name: '案例B2', category: 1, symbolSize: 28, value: 75 },
        { name: '案例C1', category: 2, symbolSize: 36, value: 90 },
        { name: '案例C2', category: 2, symbolSize: 25, value: 70 },
        { name: '案例D1', category: 3, symbolSize: 30, value: 78 },
        { name: '案例D2', category: 3, symbolSize: 22, value: 65 },
      ],
      edges: [
        { source: '案例A1', target: '案例A2', lineStyle: { width: 3 } },
        { source: '案例B1', target: '案例B2', lineStyle: { width: 2 } },
        { source: '案例C1', target: '案例C2', lineStyle: { width: 3 } },
        { source: '案例D1', target: '案例D2', lineStyle: { width: 2 } },
        { source: '案例A1', target: '案例C1', lineStyle: { width: 1, type: 'dashed' } },
        { source: '案例B1', target: '案例D1', lineStyle: { width: 1, type: 'dashed' } },
        { source: '案例A2', target: '案例B1', lineStyle: { width: 1, type: 'dashed' } },
      ],
      lineStyle: { color: '#ccc', curveness: 0.1 },
    }],
    legend: { data: ['冒充公检法', '投资理财', '网络贷款', '冒充客服'], bottom: 0 },
  };

  // Scatter plot for features
  const scatterOption = {
    title: { text: '电信欺诈特征分布散点图', textStyle: { fontSize: 14, fontWeight: 500 } },
    tooltip: { trigger: 'item', formatter: (params: any) => `${params.seriesName}<br/>通话频率: ${params.value[0]}<br/>短信频率: ${params.value[1]}` },
    legend: { bottom: 0 },
    xAxis: { name: '通话频率', type: 'value' },
    yAxis: { name: '短信频率', type: 'value' },
    series: [
      {
        name: '诈骗用户', type: 'scatter', symbolSize: 12,
        data: [[80, 90], [75, 85], [90, 70], [85, 95], [95, 80], [70, 88], [88, 92], [82, 75]],
        itemStyle: { color: '#ff4d4f' },
      },
      {
        name: '正常用户', type: 'scatter', symbolSize: 8,
        data: [[20, 15], [25, 20], [15, 25], [30, 18], [18, 22], [22, 12], [28, 16], [12, 20], [35, 25], [10, 10]],
        itemStyle: { color: '#52c41a' },
      },
    ],
  };

  return (
    <div>
      {/* SMS domain distribution */}
      <Row gutter={[16, 16]}>
        <Col span={8}>
          <Card>
            <PieChart
              title="电信欺诈短信领域分布"
              data={[
                { name: '冒充公检法', value: 35 },
                { name: '投资理财', value: 28 },
                { name: '网络贷款', value: 20 },
                { name: '冒充客服', value: 12 },
                { name: '中奖诈骗', value: 5 },
              ]}
              roseType
              height={350}
            />
          </Card>
        </Col>
        <Col span={16}>
          <Card>
            <ReactECharts option={relationGraphOption} style={{ height: 350 }} />
          </Card>
        </Col>
      </Row>

      {/* Feature scatter */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card>
            <ReactECharts option={scatterOption} style={{ height: 400 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default TextMining;
