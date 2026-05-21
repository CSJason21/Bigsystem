import React, { useEffect, useRef } from 'react';
import { Card } from 'antd';

export type TopologyNodeStatus = 'online' | 'offline' | 'new';
export type TopologyEdgeKind = 'current' | 'predictive';
export type TopologyGraphVariant = 'default' | 'predictive';

export interface TopologyNode {
  id: string;
  label: string;
  type?: string;
  size?: number;
  x?: number;
  y?: number;
  style?: Record<string, unknown>;
  subtitle?: string;
  currentLoad?: number;
  predictedLoad?: number;
  status?: TopologyNodeStatus;
  badgeText?: string;
  data?: Record<string, unknown>;
}

export interface TopologyEdge {
  source: string;
  target: string;
  style?: Record<string, unknown>;
  label?: string;
  kind?: TopologyEdgeKind;
  animated?: boolean;
}

interface TopologyGraphProps {
  title?: string;
  height?: number;
  nodes?: TopologyNode[];
  edges?: TopologyEdge[];
  showCard?: boolean;
  layoutType?: 'force' | 'dagre';
  variant?: TopologyGraphVariant;
  disableZoom?: boolean;
  selectedNodeId?: string;
  onNodeSelect?: (node: TopologyNode | null) => void;
}

const getLoadColor = (value: number) => {
  if (value >= 80) return '#ff4d4f';
  if (value >= 60) return '#faad14';
  return '#52c41a';
};

let predictiveShapesRegistered = false;

const registerPredictiveShapes = (G6: any) => {
  if (predictiveShapesRegistered) {
    return;
  }

  const getNodeVisual = (cfg: any) => {
    const size = Array.isArray(cfg?.size) ? cfg.size[0] : Number(cfg?.size ?? 74);
    const radius = size / 2;
    const currentLoad = Number(cfg?.currentLoad ?? 0);
    const predictedLoad = Number(cfg?.predictedLoad ?? currentLoad);
    const status: TopologyNodeStatus = cfg?.status ?? 'online';
    const style = cfg?.style ?? {};
    const currentColor = (style.fill as string) ?? (status === 'offline' ? '#94a3b8' : getLoadColor(currentLoad));
    const predictedColor = (style.predictedStroke as string) ?? (status === 'offline' ? '#94a3b8' : getLoadColor(predictedLoad));
    const borderColor = (style.stroke as string) ?? (status === 'new' ? '#86efac' : '#d6e4ff');
    const haloColor = (style.haloColor as string) ?? (
      status === 'new'
        ? 'rgba(82, 196, 26, 0.18)'
        : status === 'offline'
          ? 'rgba(148, 163, 184, 0.1)'
          : 'rgba(59, 130, 246, 0.08)'
    );
    const haloOpacity = Number(style.haloOpacity ?? (status === 'new' ? 0.48 : 0.16));
    const shadowColor = (style.shadowColor as string) ?? (status === 'offline' ? 'transparent' : `${currentColor}40`);
    const shadowBlur = Number(style.shadowBlur ?? (status === 'new' ? 18 : 12));
    const currentRadius = Math.max(radius * 0.46, Math.min(radius * 0.92, radius * (0.46 + currentLoad / 165)));
    const predictedRadius = Math.max(radius + 7, Math.min(radius + 16, radius + predictedLoad / 12));

    return {
      radius,
      currentLoad,
      predictedLoad,
      status,
      currentColor,
      predictedColor,
      borderColor,
      haloColor,
      haloOpacity,
      shadowColor,
      shadowBlur,
      currentRadius,
      predictedRadius,
    };
  };

  G6.registerNode('predictive-ring-node', {
    draw(cfg: any, group: any) {
      const visual = getNodeVisual(cfg);

      const halo = group.addShape('circle', {
        attrs: {
          x: 0,
          y: 0,
          r: visual.predictedRadius + 8,
          fill: visual.haloColor,
          opacity: visual.haloOpacity,
        },
        name: 'halo',
      });

      const outerRing = group.addShape('circle', {
        attrs: {
          x: 0,
          y: 0,
          r: visual.predictedRadius,
          fill: 'transparent',
          stroke: visual.predictedColor,
          lineDash: [7, 4],
          lineWidth: 4,
          opacity: visual.status === 'offline' ? 0.7 : 1,
        },
        name: 'predict-ring',
      });

      const keyShape = group.addShape('circle', {
        attrs: {
          x: 0,
          y: 0,
          r: visual.currentRadius,
          fill: visual.currentColor,
          stroke: visual.borderColor,
          lineWidth: 3.4,
          opacity: visual.status === 'offline' ? 0.62 : 1,
          shadowColor: visual.shadowColor,
          shadowBlur: visual.shadowBlur,
        },
        name: 'key-shape',
      });

      group.addShape('circle', {
        attrs: {
          x: 0,
          y: 0,
          r: Math.max(10, visual.currentRadius * 0.42),
          fill: visual.status === 'offline' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.18)',
        },
        name: 'inner-core',
      });

      group.addShape('text', {
        attrs: {
          x: 0,
          y: -2,
          text: visual.status === 'offline' ? 'OFF' : `${Math.round(visual.currentLoad)}%`,
          textAlign: 'center',
          textBaseline: 'middle',
          fill: '#f8fafc',
          fontSize: Math.max(12, visual.currentRadius * 0.34),
          fontWeight: 700,
        },
        name: 'load-text',
      });

      if (cfg?.badgeText) {
        const badgeText = String(cfg.badgeText);
        const badgeWidth = Math.max(74, badgeText.length * 8 + 18);

        group.addShape('rect', {
          attrs: {
            x: -badgeWidth / 2,
            y: -visual.predictedRadius - 30,
            width: badgeWidth,
            height: 20,
            radius: 10,
            fill: visual.status === 'offline' ? 'rgba(239, 68, 68, 0.1)' : visual.status === 'new' ? 'rgba(82, 196, 26, 0.12)' : 'rgba(250, 173, 20, 0.12)',
            stroke: visual.status === 'offline' ? '#ef4444' : visual.status === 'new' ? '#52c41a' : '#faad14',
            lineWidth: 1,
          },
          name: 'badge-bg',
        });

        group.addShape('text', {
          attrs: {
            x: 0,
            y: -visual.predictedRadius - 20,
            text: badgeText,
            textAlign: 'center',
            textBaseline: 'middle',
            fill: '#f8fafc',
            fontSize: 10,
            fontWeight: 700,
          },
          name: 'badge-text',
        });
      }

      group.addShape('text', {
        attrs: {
          x: 0,
          y: visual.predictedRadius + 16,
          text: cfg?.label ?? '',
          textAlign: 'center',
          textBaseline: 'middle',
          fill: '#1f2937',
          fontSize: 14,
          fontWeight: 600,
        },
        name: 'title',
      });

      if (cfg?.subtitle) {
        group.addShape('text', {
          attrs: {
            x: 0,
            y: visual.predictedRadius + 36,
            text: cfg.subtitle,
            textAlign: 'center',
            textBaseline: 'middle',
            fill: '#64748b',
            fontSize: 12,
          },
          name: 'subtitle',
        });
      }

      if (visual.status !== 'offline') {
        outerRing.animate(
          (ratio: number) => ({
            lineDash: [7, 4],
            lineDashOffset: -14 * ratio,
          }),
          {
            repeat: true,
            duration: 2200,
          },
        );
      }

      halo.animate(
        (ratio: number) => ({
          r: visual.predictedRadius + 8 + Math.sin(ratio * Math.PI) * (visual.status === 'new' ? 6 : 3),
          opacity: (visual.status === 'new' ? 0.22 : 0.05) + Math.sin(ratio * Math.PI) * (visual.status === 'new' ? 0.2 : 0.06),
        }),
        {
          repeat: true,
          duration: visual.status === 'new' ? 1400 : 2800,
        },
      );

      return keyShape;
    },
    update(cfg: any, item: any) {
      const group = item.getContainer();
      const visual = getNodeVisual(cfg);
      const halo = group.find((shape: any) => shape.get('name') === 'halo');
      const predictRing = group.find((shape: any) => shape.get('name') === 'predict-ring');
      const keyShape = group.find((shape: any) => shape.get('name') === 'key-shape');
      const innerCore = group.find((shape: any) => shape.get('name') === 'inner-core');
      const loadText = group.find((shape: any) => shape.get('name') === 'load-text');
      const title = group.find((shape: any) => shape.get('name') === 'title');
      const subtitle = group.find((shape: any) => shape.get('name') === 'subtitle');
      const badgeBg = group.find((shape: any) => shape.get('name') === 'badge-bg');
      const badgeText = group.find((shape: any) => shape.get('name') === 'badge-text');
      const badgeWidth = Math.max(74, String(cfg?.badgeText ?? '').length * 8 + 18);

      halo?.attr({
        r: visual.predictedRadius + 8,
        fill: visual.haloColor,
        opacity: visual.haloOpacity,
      });
      predictRing?.attr({
        r: visual.predictedRadius,
        stroke: visual.predictedColor,
        opacity: visual.status === 'offline' ? 0.7 : 1,
      });
      keyShape?.attr({
        r: visual.currentRadius,
        fill: visual.currentColor,
        stroke: visual.borderColor,
        opacity: visual.status === 'offline' ? 0.62 : 1,
        shadowColor: visual.shadowColor,
        shadowBlur: visual.shadowBlur,
      });
      innerCore?.attr({
        r: Math.max(10, visual.currentRadius * 0.42),
      });
      loadText?.attr({
        text: visual.status === 'offline' ? 'OFF' : `${Math.round(visual.currentLoad)}%`,
        fontSize: Math.max(12, visual.currentRadius * 0.34),
      });
      title?.attr({
        y: visual.predictedRadius + 16,
        text: cfg?.label ?? '',
      });
      subtitle?.attr({
        y: visual.predictedRadius + 36,
        text: cfg?.subtitle ?? '',
      });
      badgeBg?.attr({
        x: -badgeWidth / 2,
        y: -visual.predictedRadius - 30,
        width: badgeWidth,
      });
      badgeText?.attr({
        y: -visual.predictedRadius - 20,
        text: cfg?.badgeText ?? '',
      });
    },
  }, 'single-node');

  G6.registerEdge('predictive-active-edge', {
    afterDraw(cfg: any, group: any) {
      if (cfg?.animated === false) {
        return;
      }

      const shape = group.get('children')[0];
      if (!shape?.getPoint) {
        return;
      }

      const marker = group.addShape('circle', {
        attrs: {
          x: 0,
          y: 0,
          r: 3,
          fill: '#dbeafe',
          shadowColor: 'rgba(191, 219, 254, 0.72)',
          shadowBlur: 8,
        },
        name: 'flow-marker',
      });

      marker.animate(
        (ratio: number) => {
          const point = shape.getPoint(ratio);
          return {
            x: point.x,
            y: point.y,
          };
        },
        {
          repeat: true,
          duration: 2400,
        },
      );
    },
  }, 'line');

  G6.registerEdge('predictive-dashed-edge', {
    afterDraw(_: any, group: any) {
      const shape = group.get('children')[0];
      if (!shape?.animate) {
        return;
      }

      shape.animate(
        (ratio: number) => ({
          lineDash: [8, 8],
          lineDashOffset: -14 * ratio,
        }),
        {
          repeat: true,
          duration: 1500,
        },
      );
    },
  }, 'line');

  predictiveShapesRegistered = true;
};

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
  variant = 'default',
  disableZoom = false,
  selectedNodeId,
  onNodeSelect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    let disposed = false;
    let resizeObserver: ResizeObserver | undefined;

    import('@antv/g6').then((module) => {
      const G6 = module.default ?? module;

      if (disposed || !containerRef.current) {
        return;
      }

      if (variant === 'predictive') {
        registerPredictiveShapes(G6);
      }

      if (graphRef.current) {
        graphRef.current.destroy();
      }

      const chartHeight = height - (showCard ? 60 : 0);
      const colorMap: Record<string, string> = {
        management: '#1677ff',
        sensing: '#13c2c2',
        compute: '#7c3aed',
        cloud: '#1677ff',
        edge: '#52c41a',
        client: '#faad14',
      };

      const sizeMap: Record<string, number> = {
        management: variant === 'predictive' ? 84 : 56,
        sensing: variant === 'predictive' ? 68 : 40,
        compute: variant === 'predictive' ? 72 : 30,
        cloud: 50,
        edge: variant === 'predictive' ? 68 : 35,
        client: 25,
      };

      const tooltipPlugin = new G6.Tooltip({
        itemTypes: ['node'],
        offsetX: 12,
        offsetY: 12,
        getContent(event: any) {
          const model = event?.item?.getModel() as TopologyNode | undefined;
          if (!model) {
            return '';
          }

          const info = model.data ?? {};
          const status = String(info.statusText ?? model.status ?? 'online');
          const current = info.currentLoad ?? model.currentLoad ?? '--';
          const predicted = info.predictedLoad ?? model.predictedLoad ?? '--';
          const role = info.role ?? model.subtitle ?? '--';
          const region = info.region ?? '--';
          const statusColor = status === 'offline'
            ? '#ef4444'
            : status === 'new'
              ? '#16a34a'
              : '#2563eb';

          return `
            <div class="topology-tooltip-card" style="min-width:248px;overflow:hidden;border-radius:16px;background:#ffffff;border:1px solid rgba(203,213,225,.92);box-shadow:0 14px 32px rgba(15,23,42,.12);color:#1f2937;">
              <div style="padding:14px 16px 12px;border-bottom:1px solid rgba(226,232,240,.92);">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
                  <div style="min-width:0;">
                    <div style="font-size:14px;font-weight:700;line-height:1.35;margin-bottom:4px;color:#0f172a;">${model.label}</div>
                    <div style="font-size:12px;color:#64748b;line-height:1.4;">${role}</div>
                  </div>
                  <span style="display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;background:${statusColor}14;color:${statusColor};font-size:11px;font-weight:700;white-space:nowrap;">${status}</span>
                </div>
              </div>
              <div style="padding:12px 16px 14px;">
                <div style="display:grid;grid-template-columns:auto 1fr;gap:8px 12px;font-size:12px;line-height:1.6;align-items:center;">
                  <span style="color:#64748b;">当前负载</span>
                  <span style="font-size:14px;font-weight:700;color:#2563eb;">${current}</span>
                  <span style="color:#64748b;">预测负载</span>
                  <span style="font-size:14px;font-weight:700;color:#d97706;">${predicted}</span>
                  <span style="color:#64748b;">区域</span>
                  <span style="color:#334155;">${region}</span>
                  <span style="color:#64748b;">节点类型</span>
                  <span style="color:#334155;">${role}</span>
                </div>
              </div>
            </div>
          `;
        },
      });

      const hasPresetPositions = variant === 'predictive' && nodes.every((node) => typeof node.x === 'number' && typeof node.y === 'number');

      const graph = new G6.Graph({
        container: containerRef.current,
        width: containerRef.current.clientWidth,
        height: chartHeight,
        layout: hasPresetPositions
          ? undefined
          : layoutType === 'dagre'
          ? {
            type: 'dagre',
            rankdir: 'TB',
            align: 'UL',
            nodesep: variant === 'predictive' ? 126 : 40,
            ranksep: variant === 'predictive' ? 132 : 72,
            controlPoints: true,
          }
          : {
            type: 'force',
            preventOverlap: true,
            nodeStrength: -220,
            edgeStrength: 0.5,
          },
        defaultNode: variant === 'predictive'
          ? {
            type: 'predictive-ring-node',
          }
          : {
            type: 'circle',
            labelCfg: {
              position: 'bottom',
              style: {
                fontSize: 11,
                fill: '#8ea3b5',
              },
            },
          },
        defaultEdge: variant === 'predictive'
          ? {
            type: 'predictive-active-edge',
            style: {
              stroke: '#5b7ea5',
              lineWidth: 2.8,
              opacity: 0.96,
            },
            labelCfg: {
              autoRotate: false,
              refY: -14,
              style: {
                fill: '#475569',
                fontSize: 12,
                background: {
                  fill: '#ffffff',
                  radius: 6,
                  stroke: 'rgba(148, 163, 184, 0.34)',
                  lineWidth: 1,
                  padding: [4, 8],
                },
              },
            },
          }
          : {
            style: {
              stroke: '#3b4f66',
              lineWidth: 1.5,
              endArrow: true,
              opacity: 0.8,
            },
          },
        modes: {
          default: disableZoom || variant === 'predictive'
            ? []
            : ['drag-canvas', 'zoom-canvas', 'drag-node'],
        },
        nodeStateStyles: variant === 'predictive'
          ? {
            selected: {
              shadowColor: 'rgba(250, 204, 21, 0.7)',
              shadowBlur: 28,
            },
          }
          : undefined,
        plugins: variant === 'predictive' ? [tooltipPlugin] : undefined,
        fitView: true,
        fitViewPadding: variant === 'predictive' ? [36, 44, 72, 44] : [16, 20, 16, 20],
      });

      const mappedNodes = nodes.map((node) => ({
        ...node,
        size: node.size ?? sizeMap[node.type || 'compute'] ?? 28,
        style: variant === 'predictive'
          ? {
            ...(node.style ?? {}),
          }
          : {
            fill: colorMap[node.type || 'compute'] ?? '#7c3aed',
            stroke: '#dce8f3',
            lineWidth: 2,
            shadowColor: 'rgba(22, 119, 255, 0.24)',
            shadowBlur: 18,
            ...(node.style ?? {}),
          },
      }));

      const mappedEdges = edges.map((edge) => ({
        ...edge,
        type: variant === 'predictive'
          ? edge.kind === 'predictive' ? 'predictive-dashed-edge' : 'predictive-active-edge'
          : undefined,
        animated: edge.animated ?? edge.kind !== 'predictive',
        style: variant === 'predictive'
          ? {
            stroke: edge.kind === 'predictive' ? '#f59e0b' : '#59799d',
            lineWidth: edge.kind === 'predictive' ? 3 : 2.8,
            opacity: edge.kind === 'predictive' ? 0.98 : 0.9,
            lineDash: edge.kind === 'predictive' ? [8, 7] : undefined,
            ...(edge.style ?? {}),
          }
          : {
            stroke: '#3b4f66',
            lineWidth: 1.5,
            opacity: 0.8,
            ...(edge.style ?? {}),
          },
      }));

      graph.data({
        nodes: mappedNodes,
        edges: mappedEdges,
      });

      graph.render();
      graph.fitView();
      if (variant === 'predictive') {
        graph.on('node:click', (event: any) => {
          const model = event?.item?.getModel() as TopologyNode | undefined;
          if (!model) {
            return;
          }

          onNodeSelect?.(model);
        });

        graph.on('canvas:click', () => {
          onNodeSelect?.(null);
        });
      }

      graphRef.current = graph;

      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }

        const nextWidth = entry.contentRect.width;
        if (nextWidth > 0 && !graph.get('destroyed')) {
          graph.changeSize(nextWidth, chartHeight);
          graph.fitView();
        }
      });

      resizeObserver.observe(containerRef.current);

      graphRef.current = graph;
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      if (graphRef.current) {
        graphRef.current.destroy();
        graphRef.current = null;
      }
    };
  }, [disableZoom, height, layoutType, onNodeSelect, showCard, variant]);

  useEffect(() => {
    if (!graphRef.current || graphRef.current.get('destroyed')) {
      return;
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
      management: variant === 'predictive' ? 84 : 56,
      sensing: variant === 'predictive' ? 68 : 40,
      compute: variant === 'predictive' ? 72 : 30,
      cloud: 50,
      edge: variant === 'predictive' ? 68 : 35,
      client: 25,
    };

    const mappedNodes = nodes.map((node) => ({
      ...node,
      size: node.size ?? sizeMap[node.type || 'compute'] ?? 28,
      style: variant === 'predictive'
        ? {
          ...(node.style ?? {}),
        }
        : {
          fill: colorMap[node.type || 'compute'] ?? '#7c3aed',
          stroke: '#dce8f3',
          lineWidth: 2,
          shadowColor: 'rgba(22, 119, 255, 0.24)',
          shadowBlur: 18,
          ...(node.style ?? {}),
        },
    }));

    const mappedEdges = edges.map((edge) => ({
      ...edge,
      type: variant === 'predictive'
        ? edge.kind === 'predictive' ? 'predictive-dashed-edge' : 'predictive-active-edge'
        : undefined,
      animated: edge.animated ?? edge.kind !== 'predictive',
      style: variant === 'predictive'
        ? {
          stroke: edge.kind === 'predictive' ? '#f59e0b' : '#59799d',
          lineWidth: edge.kind === 'predictive' ? 3 : 2.8,
          opacity: edge.kind === 'predictive' ? 0.98 : 0.9,
          lineDash: edge.kind === 'predictive' ? [8, 7] : undefined,
          ...(edge.style ?? {}),
        }
        : {
          stroke: '#3b4f66',
          lineWidth: 1.5,
          opacity: 0.8,
          ...(edge.style ?? {}),
        },
    }));

    graphRef.current.changeData({
      nodes: mappedNodes,
      edges: mappedEdges,
    });
  }, [edges, nodes, variant]);

  useEffect(() => {
    if (!graphRef.current || graphRef.current.get('destroyed') || variant !== 'predictive') {
      return;
    }

    graphRef.current.getNodes().forEach((nodeItem: any) => {
      const model = nodeItem.getModel() as TopologyNode;
      graphRef.current.setItemState(nodeItem, 'selected', model.id === selectedNodeId);
    });
  }, [selectedNodeId, variant]);

  const content = (
    <>
      <style>
        {`
          .g6-tooltip {
            padding: 0 !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }

          .g6-tooltip .topology-tooltip-card {
            margin: 0;
          }
        `}
      </style>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: height - (showCard ? 60 : 0),
          minHeight: height - (showCard ? 60 : 0),
        }}
      />
    </>
  );

  if (!showCard) {
    return content;
  }

  return <Card title={title}>{content}</Card>;
};

export default TopologyGraph;
