
import React from 'react';
import { Row, Col, Card } from 'antd';
import { LineChart, PieChart } from '@/components/Charts';
import { generateTimeLabels, generateSeriesData } from '@/mock/data';
import ReactECharts from 'echarts-for-react';
import 'echarts-wordcloud';

/**
 * Fraud Situation Analysis - Module 3, Page 4
 * Features:
 * - Weekly fraud trend analysis
 * - Fraud location wordcloud
 * - Fraud call proportion analysis
 */
const SituationAnalysis: React.FC = () => {
  // Wordcloud option
  const wordcloudOption = {
    title: { text: '诈骗地点分布词云', textStyle: { fontSize: 14, fontWeight: 500 } },
    tooltip: { show: true },
    series: [{
      type: 'wordCloud',
      shape: 'circle',
      left: 'center',
      top: 'center',
      width: '90%',
      height: '85%',
      sizeRange: [14, 60],
      rotationRange: [-45, 45],
      rotationStep: 15,
      gridSize: 8,
      drawOutOfBound: false,
      textStyle: {
        fontFamily: 'sans-serif',
        fontWeight: 'bold',
        color: () => `rgb(${Math.round(Math.random() * 160)}, ${Math.round(Math.random() * 160)}, ${Math.round(Math.random() * 160)})`,
      },
      data: [
        { name: '北京', value: 342 }, { name: '上海', value: 287 },
        { name: '广州', value: 256 }, { name: '深圳', value: 231 },
        { name: '杭州', value: 189 }, { name: '成都', value: 167 },
        { name: '武汉', value: 145 }, { name: '南京', value: 134 },
        { name: '重庆', value: 128 }, { name: '西安', value: 112 },
        { name: '天津', value: 98 }, { name: '苏州', value: 92 },
        { name: '长沙', value: 87 }, { name: '郑州', value: 82 },
        { name: '青岛', value: 75 }, { name: '大连', value: 68 },
        { name: '厦门', value: 62 }, { name: '合肥', value: 58 },
        { name: '福州', value: 52 }, { name: '昆明', value: 48 },
      ],
    }],
  };

  return (
    <div>
      {/* Weekly trend */}
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card title="一周诈骗趋势分析">
            <LineChart
              xData={generateTimeLabels(7, 'day')}
              series={[
                { name: '新增诈骗用户', data: generateSeriesData(7, 30, 80), color: '#ff4d4f', areaStyle: true },
                { name: '新增可疑用户', data: generateSeriesData(7, 50, 120), color: '#faad14', areaStyle: true },
                { name: '核实诈骗用户', data: generateSeriesData(7, 15, 50), color: '#1677ff', areaStyle: true },
              ]}
              height={300}
            />
          </Card>
        </Col>
      </Row>

      {/* Wordcloud and proportion */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={14}>
          <Card>
            <ReactECharts option={wordcloudOption} style={{ height: 380 }} />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="诈骗电话所占比例 — 各地市欺诈用户占比">
            <PieChart
              data={[
                { name: '北京', value: 342 },
                { name: '上海', value: 287 },
                { name: '广州', value: 256 },
                { name: '深圳', value: 231 },
                { name: '杭州', value: 189 },
                { name: '其他', value: 560 },
              ]}
              height={350}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default SituationAnalysis;
