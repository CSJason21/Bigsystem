import React from 'react';
import { Badge, Card, Col, Descriptions, Progress, Row, Select, Space, Tag, Typography } from 'antd';
import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import type { NodeMeta, NodeId } from '../shared/nodeMeta';
import type { DiskUsage } from '../shared/replay/types';

const { Text } = Typography;

export interface NodeDetailPanelProps {
  currentNodeMeta: NodeMeta;
  cpuOption: EChartsOption;
  memoryOption: EChartsOption;
  gpuOption: EChartsOption;
  latestLatency: number;
  latestJitter: number;
  latestPacketLoss: number;
  latestBandwidth: number;
  disks: DiskUsage[];
  selectableNodeIds: NodeId[];
  selectedNodeId: NodeId;
  onNodeChange: (nodeId: NodeId) => void;
  nodeMetaMap: Record<string, NodeMeta>;
}

const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({
  currentNodeMeta,
  cpuOption,
  memoryOption,
  gpuOption,
  latestLatency,
  latestJitter,
  latestPacketLoss,
  latestBandwidth,
  disks,
  selectableNodeIds,
  selectedNodeId,
  onNodeChange,
  nodeMetaMap,
}) => {
  return (
    <Card
      title="单节点资源监控面板"
      extra={(
        <Space size={12}>
          <Select
            value={selectedNodeId}
            style={{ width: 240 }}
            onChange={onNodeChange}
            options={selectableNodeIds.map((id) => ({
              label: nodeMetaMap[id] ? `${nodeMetaMap[id].name}（${nodeMetaMap[id].region}）` : id,
              value: id,
            }))}
            showSearch
            optionFilterProp="label"
          />
          <Badge status="processing" text={`${currentNodeMeta.name} / ${currentNodeMeta.role}`} />
        </Space>
      )}
    >
      <Card
        size="small"
        title={`${currentNodeMeta.id} 基础信息`}
        extra={(
          <Space wrap size={[8, 8]}>
            <Tag color={latestPacketLoss > 0 || latestLatency > 50 ? 'error' : 'success'}>
              时延 {latestLatency} ms
            </Tag>
            <Tag color={latestPacketLoss > 0 || latestLatency > 50 ? 'error' : 'success'}>
              抖动 {latestJitter} ms
            </Tag>
            <Tag color={latestPacketLoss > 0 ? 'error' : 'success'}>
              丢包 {latestPacketLoss} %
            </Tag>
            <Tag color="processing">带宽 {latestBandwidth} Gbps</Tag>
          </Space>
        )}
      >
        <Descriptions
          bordered
          size="small"
          column={{ xs: 1, md: 2, xl: 4 }}
          items={[
            { key: '1', label: '节点名称', children: currentNodeMeta.name },
            { key: '2', label: '节点 ID', children: currentNodeMeta.id },
            { key: '3', label: 'IP 地址', children: currentNodeMeta.ip },
            { key: '4', label: '所在区域', children: currentNodeMeta.region },
            { key: '5', label: '角色', children: currentNodeMeta.role },
            { key: '6', label: '算力池', children: currentNodeMeta.provider },
            { key: '7', label: '架构', children: currentNodeMeta.architecture },
            { key: '8', label: 'GPU 数量', children: `${currentNodeMeta.gpuNames.length} 张` },
          ]}
        />
      </Card>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={12}>
          <Card title="CPU利用率">
            <ReactECharts option={cpuOption} style={{ height: 260 }} notMerge lazyUpdate />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="内存利用率">
            <ReactECharts option={memoryOption} style={{ height: 260 }} notMerge lazyUpdate />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={14}>
          <Card title="GPU 异构资源占用">
            <ReactECharts option={gpuOption} style={{ height: 300 }} notMerge lazyUpdate />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card title="磁盘空间">
            <Space direction="vertical" style={{ width: '100%' }} size={18}>
              {disks.map((disk) => (
                <div key={disk.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text>{disk.name}</Text>
                    <Text type="secondary">{disk.percent}%</Text>
                  </div>
                  <Progress percent={disk.percent} strokeColor={disk.color} showInfo={false} />
                </div>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>
    </Card>
  );
};

export default NodeDetailPanel;
