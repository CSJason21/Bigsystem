
import React from 'react';
import { Row, Col, Card } from 'antd';
import { LineChart, BarChart } from '@/components/Charts';
import TopologyGraph from '@/components/TopologyGraph';
import { generateTimeLabels, generateSeriesData, mockNodes } from '@/mock/data';

/**
 * Computing Resource Real-time Monitoring - Module 2, Page 4
 * Features:
 * - Computing network topology
 * - System load change curves
 * - Node load situation and ranking
 * - Task load monitoring
 */
const ResourceMonitoring: React.FC = () => {
  const timeLabels = generateTimeLabels(12);

  return (
    <div>
      {/* Topology and system load */}
      <Row gutter={[16, 16]}>
        <Col span={14}>
          <TopologyGraph title="算力网络拓扑结构" height={420} />
        </Col>
        <Col span={10}>
          <Card title="系统负载变化曲线">
            <LineChart
              xData={timeLabels}
              series={[
                { name: 'CPU负载', data: generateSeriesData(12, 40, 90), color: '#1677ff', areaStyle: true },
                { name: '内存负载', data: generateSeriesData(12, 30, 80), color: '#52c41a', areaStyle: true },
                { name: 'I/O负载', data: generateSeriesData(12, 20, 70), color: '#faad14', areaStyle: true },
              ]}
              height={360}
            />
          </Card>
        </Col>
      </Row>

      {/* Node load ranking */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card title="算力节点负载排序">
            <BarChart
              xData={mockNodes.map((n) => n.name)}
              series={[{ name: 'CPU负载(%)', data: mockNodes.map((n) => n.cpu), color: '#1677ff' }]}
              horizontal
              height={300}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="算力节点任务负载情况">
            <BarChart
              xData={mockNodes.map((n) => n.name)}
              series={[
                { name: '运行任务数', data: [5, 3, 7, 1, 8, 4], color: '#1677ff' },
                { name: '排队任务数', data: [2, 1, 3, 0, 4, 2], color: '#faad14' },
              ]}
              height={300}
            />
          </Card>
        </Col>
      </Row>

      {/* Overall load trend */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card title="算力网络整体负载变化">
            <LineChart
              xData={generateTimeLabels(24)}
              series={[
                { name: '总CPU使用率', data: generateSeriesData(24, 45, 85), color: '#1677ff' },
                { name: '总内存使用率', data: generateSeriesData(24, 40, 75), color: '#52c41a' },
                { name: '总GPU使用率', data: generateSeriesData(24, 30, 90), color: '#faad14' },
                { name: '网络吞吐量', data: generateSeriesData(24, 50, 80), color: '#eb2f96' },
              ]}
              height={280}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default ResourceMonitoring;
