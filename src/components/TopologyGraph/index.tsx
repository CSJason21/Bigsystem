import React, { useEffect, useRef } from 'react';
import { Card } from 'antd';

export interface TopologyNode {
  id: string;
  label: string;
  type?: string;
  size?: number;
  style?: Record<string, unknown>;
}

export interface TopologyEdge {
  source: string;
  target: string;
  style?: Record<string, unknown>;
}

interface TopologyGraphProps {
  title?: string;
  height?: number;
  nodes?: TopologyNode[];
  edges?: TopologyEdge[];
  showCard?: boolean;
  layoutType?: 'force' | 'dagre';
}

/**
 * 基于 AntV G6 的拓扑图组件。
 * 支持按节点类型和负载自定义尺寸，用于中后台网络监控场景。
 */
const TopologyGraph: React.FC<TopologyGraphProps> = ({
  title = '网络拓扑结构',
  height = 400,
  nodes = [
    { id: 'control', label: '调度中心', type: 'management', size: 56 },
    { id: 'sense-1', label: '感知节点 1', type: 'sensing', size: 40 },
    { id: 'sense-2', label: '感知节点 2', type: 'sensing', size: 40 },
    { id: 'compute-1', label: '算力节点 1', type: 'compute', size: 30 },
    { id: 'compute-2', label: '算力节点 2', type: 'compute', size: 32 },
    { id: 'compute-3', label: '算力节点 3', type: 'compute', size: 28 },
  ],
  edges = [
    { source: 'control', target: 'sense-1' },
    { source: 'control', target: 'sense-2' },
    { source: 'sense-1', target: 'compute-1' },
    { source: 'sense-1', target: 'compute-2' },
    { source: 'sense-2', target: 'compute-3' },
  ],
  showCard = true,
  layoutType = 'force',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    let disposed = false;

    import('@antv/g6').then((G6) => {
      if (disposed || !containerRef.current) {
        return;
      }

      if (graphRef.current) {
        graphRef.current.destroy();
      }

      const colorMap: Record<string, string> = {
        management: '#1677ff',
        sensing: '#13c2c2',
        compute: '#7c3aed',
        cloud: '#1677ff',
        edge: '#52c41a',
        client: '#faad14',
      };

      const sizeMap: Record<string, number> = {
        management: 56,
        sensing: 40,
        compute: 30,
        cloud: 50,
        edge: 35,
        client: 25,
      };

      const graph = new G6.Graph({
        container: containerRef.current,
        width: containerRef.current.clientWidth,
        height: height - (showCard ? 60 : 0),
        layout: layoutType === 'dagre'
          ? {
            type: 'dagre',
            rankdir: 'TB',
            align: 'UL',
            nodesep: 36,
            ranksep: 72,
          }
          : {
            type: 'force',
            preventOverlap: true,
            nodeStrength: -220,
            edgeStrength: 0.5,
          },
        defaultNode: {
          type: 'circle',
          labelCfg: {
            position: 'bottom',
            style: {
              fontSize: 11,
              fill: '#8ea3b5',
            },
          },
        },
        defaultEdge: {
          style: {
            stroke: '#3b4f66',
            lineWidth: 1.5,
            endArrow: true,
            opacity: 0.8,
          },
        },
        modes: {
          default: ['drag-canvas', 'zoom-canvas', 'drag-node'],
        },
        fitView: true,
        fitViewPadding: [16, 20, 16, 20],
      });

      graph.data({
        nodes: nodes.map((node) => ({
          ...node,
          size: node.size ?? sizeMap[node.type || 'compute'] ?? 28,
          style: {
            fill: colorMap[node.type || 'compute'] ?? '#7c3aed',
            stroke: '#dce8f3',
            lineWidth: 2,
            shadowColor: 'rgba(22, 119, 255, 0.24)',
            shadowBlur: 18,
            ...(node.style ?? {}),
          },
        })),
        edges: edges.map((edge) => ({
          ...edge,
          style: {
            stroke: '#3b4f66',
            lineWidth: 1.5,
            opacity: 0.8,
            ...(edge.style ?? {}),
          },
        })),
      });

      graph.render();
      graphRef.current = graph;
    });

    return () => {
      disposed = true;
      if (graphRef.current) {
        graphRef.current.destroy();
        graphRef.current = null;
      }
    };
  }, [edges, height, layoutType, nodes, showCard]);

  const content = (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: height - (showCard ? 60 : 0),
        minHeight: height - (showCard ? 60 : 0),
      }}
    />
  );

  if (!showCard) {
    return content;
  }

  return <Card title={title}>{content}</Card>;
};

export default TopologyGraph;
