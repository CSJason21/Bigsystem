
import React from 'react';
import { Row, Col, Card } from 'antd';
import ReactECharts from 'echarts-for-react';

/**
 * Communication Data Mining - Module 3, Page 6
 * Features:
 * - SMS send-receive heatmap
 * - ID-number line-bar chart
 * - Fraud identification result tree diagram
 */
const CommunicationMining: React.FC = () => {
  // Heatmap - SMS send/receive
  const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const heatmapData: number[][] = [];
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 24; j++) {
      heatmapData.push([j, i, Math.round(Math.random() * 100)]);
    }
  }

  const heatmapOption = {
    title: { text: '用户短信发送-接收热力图', textStyle: { fontSize: 14, fontWeight: 500 } },
    tooltip: { position: 'top', formatter: (params: any) => `${days[params.value[1]]} ${hours[params.value[0]]}<br/>频次: ${params.value[2]}` },
    grid: { top: 40, right: 80, bottom: 40, left: 60 },
    xAxis: { type: 'category', data: hours, splitArea: { show: true } },
    yAxis: { type: 'category', data: days, splitArea: { show: true } },
    visualMap: {
      min: 0, max: 100, calculable: true, orient: 'vertical', right: 10, top: 'center',
      inRange: { color: ['#e0f3ff', '#1677ff', '#ff4d4f'] },
    },
    series: [{
      type: 'heatmap',
      data: heatmapData,
      label: { show: false },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.3)' } },
    }],
  };

  // Line-bar combined chart - ID card vs phone number
  const lineBarOption = {
    title: { text: '用户身份证-号码线柱图', textStyle: { fontSize: 14, fontWeight: 500 } },
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    grid: { top: 40, right: 60, bottom: 40, left: 60 },
    xAxis: { type: 'category', data: ['用户A', '用户B', '用户C', '用户D', '用户E', '用户F', '用户G', '用户H'] },
    yAxis: [
      { type: 'value', name: '关联号码数', position: 'left' },
      { type: 'value', name: '发送/接收比', position: 'right', max: 10 },
    ],
    series: [
      {
        name: '关联号码数', type: 'bar', data: [8, 15, 5, 22, 3, 18, 12, 9],
        itemStyle: { color: '#1677ff' }, barMaxWidth: 35,
      },
      {
        name: '发送/接收比', type: 'line', yAxisIndex: 1,
        data: [2.1, 7.5, 1.2, 8.3, 0.8, 6.8, 5.2, 3.1],
        itemStyle: { color: '#ff4d4f' }, smooth: true,
      },
    ],
  };

  // Tree diagram - Fraud identification results
  const treeOption = {
    title: { text: '电信欺诈识别结果树状图', textStyle: { fontSize: 14, fontWeight: 500 } },
    tooltip: { trigger: 'item', triggerOn: 'mousemove' },
    series: [{
      type: 'tree',
      data: [{
        name: '欺诈识别',
        children: [
          {
            name: '冒充公检法',
            children: [
              { name: '案例A1 (确认)', itemStyle: { color: '#ff4d4f' } },
              { name: '案例A2 (确认)', itemStyle: { color: '#ff4d4f' } },
              { name: '案例A3 (可疑)', itemStyle: { color: '#faad14' } },
            ],
          },
          {
            name: '投资理财',
            children: [
              { name: '案例B1 (确认)', itemStyle: { color: '#ff4d4f' } },
              { name: '案例B2 (可疑)', itemStyle: { color: '#faad14' } },
            ],
          },
          {
            name: '网络贷款',
            children: [
              { name: '案例C1 (确认)', itemStyle: { color: '#ff4d4f' } },
              { name: '案例C2 (确认)', itemStyle: { color: '#ff4d4f' } },
              { name: '案例C3 (可疑)', itemStyle: { color: '#faad14' } },
              { name: '案例C4 (排除)', itemStyle: { color: '#52c41a' } },
            ],
          },
          {
            name: '冒充客服',
            children: [
              { name: '案例D1 (确认)', itemStyle: { color: '#ff4d4f' } },
            ],
          },
        ],
      }],
      top: 40,
      left: '10%',
      right: '10%',
      bottom: 20,
      symbol: 'emptyCircle',
      symbolSize: 10,
      orient: 'vertical',
      expandAndCollapse: true,
      label: { position: 'top', fontSize: 11 },
      leaves: { label: { position: 'bottom' } },
      animationDurationUpdate: 750,
    }],
  };

  return (
    <div>
      {/* Heatmap */}
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card>
            <ReactECharts option={heatmapOption} style={{ height: 350 }} />
          </Card>
        </Col>
      </Row>

      {/* Line-bar chart */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card>
            <ReactECharts option={lineBarOption} style={{ height: 350 }} />
          </Card>
        </Col>
        <Col span={12}>
          <Card>
            <ReactECharts option={treeOption} style={{ height: 350 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default CommunicationMining;
