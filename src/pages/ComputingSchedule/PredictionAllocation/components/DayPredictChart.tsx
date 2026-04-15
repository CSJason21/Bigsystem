import React from 'react';
import { Card } from 'antd';
import { LineChart } from '@/components/Charts';

type Props = {
  labels: string[];
  cpuActual: number[];
  cpuPredicted: number[];
};

const DayPredictChart: React.FC<Props> = ({ labels, cpuActual, cpuPredicted }) => {
  return (
    <Card title="算力资源服务需求预测（日）">
      <LineChart
        xData={labels}
        series={[
          { name: 'CPU 实际', data: cpuActual, color: '#ff7875' },
          { name: 'CPU 预测', data: cpuPredicted, color: '#1677ff', areaStyle: true },
        ]}
        height={280}
      />
    </Card>
  );
};

export default DayPredictChart;

