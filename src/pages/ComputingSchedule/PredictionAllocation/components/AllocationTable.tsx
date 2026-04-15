import React from 'react';
import { Card, Table, Tag } from 'antd';

export type AllocationTableRow = {
  id: string;
  task: string;
  node: string;
  cpu: number;
  memory: number;
  gpu: number;
  score: number;
};

type Props = {
  rows: AllocationTableRow[];
};

const AllocationTable: React.FC<Props> = ({ rows }) => {
  const columns = [
    { title: '任务', dataIndex: 'task', key: 'task' },
    { title: '分配节点', dataIndex: 'node', key: 'node' },
    { title: 'CPU(核)', dataIndex: 'cpu', key: 'cpu' },
    { title: '内存(GB)', dataIndex: 'memory', key: 'memory' },
    { title: 'GPU(卡)', dataIndex: 'gpu', key: 'gpu' },
    {
      title: '调度评分',
      dataIndex: 'score',
      key: 'score',
      render: (value: number) => {
        const color = value >= 90 ? 'green' : value >= 80 ? 'blue' : 'orange';
        return <Tag color={color}>{value}</Tag>;
      },
    },
  ];

  return (
    <Card title="任务-节点分配结果">
      <Table
        dataSource={rows}
        columns={columns}
        rowKey="id"
        pagination={false}
        size="small"
        scroll={{ x: 720 }}
      />
    </Card>
  );
};

export default AllocationTable;
