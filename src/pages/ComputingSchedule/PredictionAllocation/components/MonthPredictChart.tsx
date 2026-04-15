import React from 'react';
import { Card } from 'antd';
import { LineChart } from '@/components/Charts';

type Props = {
  labels: string[];
  gpuPredicted: number[];
  storagePredicted: number[];
};

const MonthPredictChart: React.FC<Props> = ({ labels, gpuPredicted, storagePredicted }) => {
  return (
    <Card title="算力资源服务需求预测（月）">
      <LineChart
        xData={labels}
        series={[
          { name: 'GPU 预测', data: gpuPredicted, color: '#faad14', areaStyle: true },
          { name: '存储 预测', data: storagePredicted, color: '#52c41a', areaStyle: true },
        ]}
        height={280}
      />
    </Card>
  );
};

export default MonthPredictChart;

