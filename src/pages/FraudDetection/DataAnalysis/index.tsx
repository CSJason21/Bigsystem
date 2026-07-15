
import React from 'react';
import { Row, Col, Card, Select, Space } from 'antd';
import { BarChart, LineChart } from '@/components/Charts';
import { mockFraudCities, generateTimeLabels, generateSeriesData } from '@/mock/data';
import ReactECharts from 'echarts-for-react';

/**
 * Fraud Data Analysis - Module 3, Page 3
 * Features:
 * - Weekly top fraud statistics
 * - Monthly fraud trend analysis by city
 * - Fraud city coverage map (Baidu Map)
 */
const DataAnalysis: React.FC = () => {
  // China map option (simplified version using scatter on plain coordinates)
  const mapOption = {
    title: { text: '电信诈骗用户主要城市覆盖', textStyle: { fontSize: 14, fontWeight: 500 } },
    tooltip: { trigger: 'item', formatter: '{b}: {c}人' },
    geo: {
      map: 'china',
      roam: true,
      label: { show: false },
      itemStyle: { areaColor: '#e7f0fd', borderColor: '#97b8d8' },
      emphasis: { itemStyle: { areaColor: '#a5c8f1' } },
    },
    // Note: In production, register China map with echarts.registerMap()
    // Here we use a bar chart as placeholder for the map
    xAxis: { type: 'category', data: mockFraudCities.map(c => c.name) },
    yAxis: { type: 'value' },
    series: [{
      type: 'bar',
      data: mockFraudCities.map(c => ({
        value: c.value,
        itemStyle: { color: c.value > 250 ? '#ff4d4f' : c.value > 150 ? '#faad14' : '#1677ff' },
      })),
      barMaxWidth: 40,
    }],
    visualMap: {
      min: 0,
      max: 400,
      left: 'left',
      top: 'bottom',
      text: ['高', '低'],
      inRange: { color: ['#e0f3ff', '#faad14', '#ff4d4f'] },
      show: true,
    },
  };

  return (
    <div>
      {/* Weekly top fraud stats */}
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card title="一周诈骗前十信息统计分析 — 跨区域欺诈用户数量统计">
            <BarChart
              xData={mockFraudCities.map((c) => c.name)}
              series={[{ name: '欺诈用户数', data: mockFraudCities.map((c) => c.value), color: '#ff4d4f' }]}
              height={300}
            />
          </Card>
        </Col>
      </Row>

      {/* Monthly trend and city map */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card title="电信诈骗数据每月趋势分析" extra={
            <Select defaultValue="北京" style={{ width: 120 }} options={mockFraudCities.map(c => ({ value: c.name, label: c.name }))} />
          }>
            <LineChart
              xData={generateTimeLabels(12, 'month')}
              series={[
                { name: '新增诈骗用户', data: generateSeriesData(12, 20, 80), color: '#ff4d4f', areaStyle: true },
                { name: '累计诈骗用户', data: [120, 145, 178, 210, 248, 280, 315, 342, 378, 405, 435, 468], color: '#1677ff' },
              ]}
              height={300}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="全国主要城市电信诈骗覆盖（需接入百度地图API）">
            <ReactECharts option={mapOption} style={{ height: 300 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DataAnalysis;
