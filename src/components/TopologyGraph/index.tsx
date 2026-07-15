import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card } from 'antd';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  EdgeLabelRenderer,
  getStraightPath,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
  useReactFlow,
  Controls,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

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

interface NodeGeometry {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  edgeClearance: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

function lerpColor(low: [number, number, number], high: [number, number, number], t: number): string {
  const r = Math.round(low[0] + (high[0] - low[0]) * t);
  const g = Math.round(low[1] + (high[1] - low[1]) * t);
  const b = Math.round(low[2] + (high[2] - low[2]) * t);
  return `rgb(${r},${g},${b})`;
}

const COLOR_GREEN: [number, number, number] = [82, 196, 26];
const COLOR_YELLOW: [number, number, number] = [250, 173, 20];
const COLOR_RED: [number, number, number] = [255, 77, 79];

const getLoadColor = (value: number) => {
  const v = Math.max(0, Math.min(100, value));
  if (v <= 50) {
    return lerpColor(COLOR_GREEN, COLOR_YELLOW, v / 50);
  }
  return lerpColor(COLOR_YELLOW, COLOR_RED, (v - 50) / 50);
};

const COLOR_MAP: Record<string, string> = {
  management: '#1677ff',
  sensing: '#13c2c2',
  compute: '#7c3aed',
  cloud: '#1677ff',
  edge: '#52c41a',
  client: '#faad14',
};

const SIZE_MAP: Record<string, number> = {
  management: 56,
  sensing: 40,
  compute: 30,
  cloud: 50,
  edge: 35,
  client: 25,
};

const PREDICTIVE_SIZE_MAP: Record<string, number> = {
  management: 76,
  sensing: 62,
  compute: 64,
  cloud: 76,
  edge: 62,
  client: 44,
};

const HANDLE_SIZE = 1;

const clampLoad = (value: number) => Math.max(0, Math.min(100, value));

const estimateTextWidth = (value: string, fontSize = 13) => {
  const units = Array.from(value).reduce((sum, char) => (
    sum + (/[\u4e00-\u9fff]/.test(char) ? 1 : 0.58)
  ), 0);
  return Math.ceil(units * fontSize + 18);
};

const getPredictiveNodeBoxWidth = (svgW: number, label = '', subtitle = '') => {
  const labelW = Math.max(estimateTextWidth(label, 12), subtitle ? estimateTextWidth(subtitle, 10.5) : 0);
  return Math.max(svgW, Math.min(labelW, 220));
};

const getPredictiveCircleGeometry = (
  nodeSize: number,
  currentLoad: number,
  predictedLoad: number,
  hasBadge = false,
  hasSubtitle = false,
) => {
  const radius = nodeSize / 2;
  const normalizedCurrentLoad = clampLoad(currentLoad);
  const normalizedPredictedLoad = clampLoad(predictedLoad);
  const currentRadius = radius * (0.35 + 0.55 * (normalizedCurrentLoad / 100));
  const predictedRadius = radius * (0.55 + 0.55 * (normalizedPredictedLoad / 100));
  const padding = 4;
  const svgW = (predictedRadius + padding) * 2;
  const svgH = (predictedRadius + padding) * 2;
  const cx = svgW / 2;
  const cy = svgH / 2;
  const badgeOffsetY = hasBadge ? 24 : 0;
  const labelOffsetY = 16;
  const totalH = svgH + labelOffsetY + (hasSubtitle ? 15 : 0) + badgeOffsetY;

  return {
    currentRadius,
    predictedRadius,
    svgW,
    svgH,
    cx,
    cy,
    totalH,
    circleCenterY: badgeOffsetY + cy,
    edgeClearance: predictedRadius + 9,
  };
};

const getCenteredHandleStyle = (x: number, y: number): React.CSSProperties => ({
  top: y,
  left: x,
  width: HANDLE_SIZE,
  height: HANDLE_SIZE,
  opacity: 0,
  pointerEvents: 'none',
  transform: 'translate(-50%, -50%)',
});

const getNodeGeometry = (
  node: TopologyNode,
  variant: TopologyGraphVariant,
  sizeMap: Record<string, number>,
): NodeGeometry => {
  const nodeSize = node.size ?? sizeMap[node.type || 'compute'] ?? 28;

  if (variant === 'predictive') {
    const currentLoad = Number(node.currentLoad ?? 0);
    const predictedLoad = Number(node.predictedLoad ?? currentLoad);
    const geometry = getPredictiveCircleGeometry(
      nodeSize,
      currentLoad,
      predictedLoad,
      Boolean(node.badgeText),
      Boolean(node.subtitle),
    );
    const boxWidth = getPredictiveNodeBoxWidth(geometry.svgW, node.label, node.subtitle);
    return {
      width: boxWidth,
      height: geometry.totalH,
      centerX: boxWidth / 2,
      centerY: geometry.circleCenterY,
      edgeClearance: geometry.edgeClearance,
    };
  }

  return {
    width: nodeSize,
    height: nodeSize + 20,
    centerX: nodeSize / 2,
    centerY: nodeSize / 2,
    edgeClearance: nodeSize / 2 + 4,
  };
};

const getTopologyTargetFill = (nodeCount: number, variant: TopologyGraphVariant) => {
  if (variant !== 'predictive') return { x: 0.78, y: 0.74 };
  if (nodeCount <= 3) return { x: 0.86, y: 0.86 };
  if (nodeCount <= 6) return { x: 0.9, y: 0.88 };
  if (nodeCount <= 16) return { x: 0.94, y: 0.92 };
  return { x: 0.92, y: 0.9 };
};

const getTopologyMaxZoom = (nodeCount: number, variant: TopologyGraphVariant) => {
  if (variant !== 'predictive') return 2;
  if (nodeCount <= 3) return 3;
  if (nodeCount <= 6) return 2.4;
  if (nodeCount <= 16) return 1.65;
  return 1.35;
};

const getCenteredViewport = (
  bounds: { x: number; y: number; width: number; height: number },
  viewportSize: ViewportSize,
  fill: { x: number; y: number },
  minZoom: number,
  maxZoom: number,
) => {
  const safeWidth = Math.max(bounds.width, 1);
  const safeHeight = Math.max(bounds.height, 1);
  const zoom = Math.min(
    maxZoom,
    Math.max(
      minZoom,
      Math.min(
        (viewportSize.width * fill.x) / safeWidth,
        (viewportSize.height * fill.y) / safeHeight,
      ),
    ),
  );
  const centerX = bounds.x + safeWidth / 2;
  const centerY = bounds.y + safeHeight / 2;

  return {
    x: viewportSize.width / 2 - centerX * zoom,
    y: viewportSize.height / 2 - centerY * zoom,
    zoom,
  };
};

const getRfNodesBounds = (nodes: Node[]) => {
  return nodes.reduce(
    (bounds, node) => {
      const width = typeof node.width === 'number' ? node.width : 0;
      const height = typeof node.height === 'number' ? node.height : 0;
      const x = Number.isFinite(node.position.x) ? node.position.x : 0;
      const y = Number.isFinite(node.position.y) ? node.position.y : 0;

      return {
        minX: Math.min(bounds.minX, x),
        minY: Math.min(bounds.minY, y),
        maxX: Math.max(bounds.maxX, x + width),
        maxY: Math.max(bounds.maxY, y + height),
      };
    },
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
};

const buildFallbackPositions = (
  nodes: TopologyNode[],
  edges: TopologyEdge[],
  height: number,
  variant: TopologyGraphVariant,
  layoutType: TopologyGraphProps['layoutType'],
) => {
  if (nodes.length === 0) return {} as Record<string, { x: number; y: number }>;

  if (layoutType === 'dagre') {
    const nodeIds = new Set(nodes.map((node) => node.id));
    const incomingCount = new Map(nodes.map((node) => [node.id, 0]));
    const outgoing = new Map<string, string[]>();

    edges.forEach((edge) => {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
      incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
      outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
    });

    const levels = new Map<string, number>();
    const queue = nodes.filter((node) => (incomingCount.get(node.id) ?? 0) === 0).map((node) => node.id);
    if (queue.length === 0) queue.push(nodes[0].id);
    queue.forEach((id) => levels.set(id, 0));

    while (queue.length > 0) {
      const source = queue.shift() as string;
      const nextLevel = (levels.get(source) ?? 0) + 1;
      (outgoing.get(source) ?? []).forEach((target) => {
        if ((levels.get(target) ?? -1) < nextLevel) {
          levels.set(target, nextLevel);
          queue.push(target);
        }
      });
    }

    nodes.forEach((node) => {
      if (!levels.has(node.id)) levels.set(node.id, 0);
    });

    const groups = nodes.reduce<Record<number, TopologyNode[]>>((accumulator, node) => {
      const level = levels.get(node.id) ?? 0;
      accumulator[level] = [...(accumulator[level] ?? []), node];
      return accumulator;
    }, {});
    const xGap = variant === 'predictive' ? 180 : 120;
    const yGap = variant === 'predictive' ? 170 : 110;

    return Object.entries(groups).reduce<Record<string, { x: number; y: number }>>((accumulator, [levelKey, group]) => {
      const level = Number(levelKey);
      const rowWidth = (group.length - 1) * xGap;
      group.forEach((node, index) => {
        accumulator[node.id] = {
          x: index * xGap - rowWidth / 2,
          y: level * yGap,
        };
      });
      return accumulator;
    }, {});
  }

  const radiusX = Math.max(150, nodes.length * (variant === 'predictive' ? 34 : 24));
  const radiusY = Math.max(90, Math.min(height * 0.32, radiusX * 0.62));
  const centerX = radiusX;
  const centerY = Math.max(radiusY + 40, height / 2);

  return nodes.reduce<Record<string, { x: number; y: number }>>((accumulator, node, index) => {
    const angle = (Math.PI * 2 * index) / nodes.length - Math.PI / 2;
    accumulator[node.id] = {
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY,
    };
    return accumulator;
  }, {});
};

const trimLineToClearance = (
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourceClearance = 0,
  targetClearance = 0,
) => {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.hypot(dx, dy);

  if (length <= 0) {
    return { sourceX, sourceY, targetX, targetY, labelX: sourceX, labelY: sourceY };
  }

  const ux = dx / length;
  const uy = dy / length;
  const maxTrim = Math.max(0, (length - 2) / 2);
  const sourceTrim = Math.min(sourceClearance, maxTrim);
  const targetTrim = Math.min(targetClearance, maxTrim);
  const trimmedSourceX = sourceX + ux * sourceTrim;
  const trimmedSourceY = sourceY + uy * sourceTrim;
  const trimmedTargetX = targetX - ux * targetTrim;
  const trimmedTargetY = targetY - uy * targetTrim;

  return {
    sourceX: trimmedSourceX,
    sourceY: trimmedSourceY,
    targetX: trimmedTargetX,
    targetY: trimmedTargetY,
    labelX: (trimmedSourceX + trimmedTargetX) / 2,
    labelY: (trimmedSourceY + trimmedTargetY) / 2,
  };
};

function PredictiveNode({ data }: NodeProps) {
  const nodeData = data as Record<string, unknown>;
  const label = String(nodeData.label ?? '');
  const subtitle = String(nodeData.subtitle ?? '');
  const currentLoad = Number(nodeData.currentLoad ?? 0);
  const predictedLoad = Number(nodeData.predictedLoad ?? currentLoad);
  const status = (nodeData.status as TopologyNodeStatus) ?? 'online';
  const badgeText = String(nodeData.badgeText ?? '');
  const nodeSize = Number(nodeData.nodeSize ?? 74);
  const isSelected = Boolean(nodeData.isSelected);
  const nodeStyle = (nodeData.nodeStyle ?? {}) as Record<string, unknown>;

  const currentColor = (nodeStyle.fill as string) ?? (status === 'offline' ? '#94a3b8' : getLoadColor(currentLoad));
  const predictedColor = (nodeStyle.predictedStroke as string) ?? (status === 'offline' ? '#94a3b8' : getLoadColor(predictedLoad));
  const borderColor = (nodeStyle.stroke as string) ?? '#d6e4ff';

  const badgeOffsetY = 24;
  const {
    currentRadius,
    predictedRadius,
    svgW,
    svgH,
    cx,
    cy,
    totalH,
    circleCenterY,
  } = getPredictiveCircleGeometry(nodeSize, currentLoad, predictedLoad, Boolean(badgeText), Boolean(subtitle));
  const boxWidth = getPredictiveNodeBoxWidth(svgW, label, subtitle);
  const visualCenterX = boxWidth / 2;

  const [hovered, setHovered] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  const info = (nodeData.data ?? {}) as Record<string, unknown>;
  const infoStatus = String(info.statusText ?? status);
  const infoCurrentLoad = String(info.currentLoad ?? `${Math.round(currentLoad)}%`);
  const infoPredictedLoad = String(info.predictedLoad ?? `${Math.round(predictedLoad)}%`);
  const infoRole = String(info.role ?? subtitle ?? '');
  const infoRegion = String(info.region ?? '--');
  const statusColor = infoStatus === 'offline' ? '#ef4444' : '#2563eb';
  const tooltipWidth = 260;
  const tooltipX = Math.min(Math.max(tooltipPosition.x + 16, 12), Math.max(12, window.innerWidth - tooltipWidth - 12));
  const tooltipY = Math.min(Math.max(tooltipPosition.y + 16, 12), Math.max(12, window.innerHeight - 190));
  const tooltip = hovered ? createPortal((
    <div
      className="topology-graph-tooltip nodrag nopan"
      style={{
        position: 'fixed',
        top: tooltipY,
        left: tooltipX,
        width: tooltipWidth,
        zIndex: 10001,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          overflow: 'hidden',
          borderRadius: 12,
          background: '#ffffff',
          border: '1px solid rgba(203,213,225,.92)',
          boxShadow: '0 12px 28px rgba(15,23,42,.12)',
          color: '#1f2937',
          fontSize: 12,
        }}
      >
        <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid rgba(226,232,240,.92)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{infoRole}</div>
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999,
              background: `${statusColor}14`, color: statusColor, fontSize: 10, fontWeight: 700,
            }}>
              {infoStatus}
            </div>
          </div>
        </div>
        <div style={{ padding: '10px 14px 12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px', fontSize: 11, lineHeight: 1.6, alignItems: 'center' }}>
            <div style={{ color: '#64748b' }}>当前负载</div>
            <div style={{ fontWeight: 700, color: '#2563eb' }}>{infoCurrentLoad}</div>
            <div style={{ color: '#64748b' }}>预测负载</div>
            <div style={{ fontWeight: 700, color: '#d97706' }}>{infoPredictedLoad}</div>
            <div style={{ color: '#64748b' }}>区域</div>
            <div style={{ color: '#334155' }}>{infoRegion}</div>
            <div style={{ color: '#64748b' }}>类型</div>
            <div style={{ color: '#334155' }}>{infoRole}</div>
          </div>
        </div>
      </div>
    </div>
  ), document.body) : null;

  return (
    <>
      <Handle type="target" position={Position.Top} style={getCenteredHandleStyle(visualCenterX, circleCenterY)} />
      <div
        style={{
          position: 'relative',
          width: boxWidth,
          height: totalH,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
        onMouseEnter={(event) => {
          setTooltipPosition({ x: event.clientX, y: event.clientY });
          setHovered(true);
        }}
        onMouseMove={(event) => setTooltipPosition({ x: event.clientX, y: event.clientY })}
        onMouseLeave={() => setHovered(false)}
      >
        {badgeText && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '2px 10px',
              borderRadius: 10,
              fontSize: 10,
              fontWeight: 700,
              color: '#f8fafc',
              whiteSpace: 'nowrap',
              background: status === 'offline' ? 'rgba(239, 68, 68, 0.15)' : status === 'new' ? 'rgba(82, 196, 26, 0.15)' : 'rgba(250, 173, 20, 0.15)',
              border: `1px solid ${status === 'offline' ? '#ef4444' : status === 'new' ? '#52c41a' : '#faad14'}`,
              zIndex: 2,
            }}
          >
            {badgeText}
          </div>
        )}

        <svg
          width={svgW}
          height={svgH}
          style={{
            marginTop: badgeText ? badgeOffsetY : 0,
            flexShrink: 0,
          }}
        >
          <circle
            cx={cx}
            cy={cy}
            r={predictedRadius + 6}
            fill={status === 'offline' ? 'rgba(148, 163, 184, 0.1)' : 'rgba(59, 130, 246, 0.08)'}
            opacity={0.16}
          />

          <circle
            className="topology-predictive-ring"
            cx={cx}
            cy={cy}
            r={predictedRadius}
            fill="transparent"
            stroke={predictedColor}
            strokeDasharray="6 4"
            strokeWidth={2.5}
            opacity={status === 'offline' ? 0.5 : 0.7}
          />

          <circle
            cx={cx}
            cy={cy}
            r={currentRadius}
            fill={currentColor}
            stroke={borderColor}
            strokeWidth={3}
            opacity={status === 'offline' ? 0.62 : 1}
          />

          <circle
            cx={cx}
            cy={cy}
            r={Math.max(8, currentRadius * 0.38)}
            fill="rgba(255, 255, 255, 0.15)"
          />

          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#f8fafc"
            fontSize={Math.max(10, currentRadius * 0.3)}
            fontWeight={700}
            fontFamily="system-ui, sans-serif"
          >
            {status === 'offline' ? 'OFF' : `${Math.round(currentLoad)}%`}
          </text>
        </svg>

        <div
          style={{
            marginTop: 3,
            fontSize: 12,
            fontWeight: 600,
            color: '#1f2937',
            textAlign: 'center',
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: 10.5,
              color: '#64748b',
              textAlign: 'center',
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
            }}
          >
            {subtitle}
          </div>
        )}

        {isSelected && (
          <div
            style={{
              position: 'absolute',
              top: (badgeText ? badgeOffsetY : 0) + cy - predictedRadius - 4,
              left: visualCenterX - predictedRadius - 4,
              width: predictedRadius * 2 + 8,
              height: predictedRadius * 2 + 8,
              borderRadius: '50%',
              border: '3px solid rgba(250, 204, 21, 0.7)',
              boxShadow: '0 0 24px rgba(250, 204, 21, 0.35)',
              pointerEvents: 'none',
            }}
          />
        )}

        {tooltip}
      </div>
      <Handle type="source" position={Position.Bottom} style={getCenteredHandleStyle(visualCenterX, circleCenterY)} />
    </>
  );
}

function DefaultNode({ data }: NodeProps) {
  const nodeData = data as Record<string, unknown>;
  const label = String(nodeData.label ?? '');
  const nodeType = String(nodeData.nodeType ?? 'compute');
  const nodeSize = Number(nodeData.nodeSize ?? 30);
  const color = COLOR_MAP[nodeType] ?? '#7c3aed';
  const radius = nodeSize / 2;

  return (
    <>
      <Handle type="target" position={Position.Top} style={getCenteredHandleStyle(radius, radius)} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: nodeSize }}>
        <svg width={nodeSize} height={nodeSize}>
          <circle
            cx={radius}
            cy={radius}
            r={radius - 2}
            fill={color}
            stroke="#dce8f3"
            strokeWidth={2}
            style={{ filter: `drop-shadow(0 0 12px rgba(22, 119, 255, 0.24))` }}
          />
        </svg>
        <div style={{ fontSize: 11, color: '#8ea3b5', fontWeight: 500, marginTop: 2, whiteSpace: 'nowrap' }}>
          {label}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={getCenteredHandleStyle(radius, radius)} />
    </>
  );
}

function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps) {
  const edgeData = (data ?? {}) as Record<string, unknown>;
  const kind = edgeData.kind as TopologyEdgeKind | undefined;
  const isPredictive = kind === 'predictive';
  const edgeStyle = (edgeData.style ?? {}) as React.CSSProperties;
  const strokeDasharray = edgeStyle.strokeDasharray ?? (
    Array.isArray((edgeStyle as Record<string, unknown>).lineDash)
      ? ((edgeStyle as Record<string, unknown>).lineDash as unknown[]).join(' ')
      : (edgeStyle as Record<string, unknown>).lineDash
  );
  const line = trimLineToClearance(
    sourceX,
    sourceY,
    targetX,
    targetY,
    Number(edgeData.sourceClearance ?? 0),
    Number(edgeData.targetClearance ?? 0),
  );

  const [edgePath] = getStraightPath({
    sourceX: line.sourceX,
    sourceY: line.sourceY,
    targetX: line.targetX,
    targetY: line.targetY,
  });

  return (
    <>
      <g>
        <path
          d={edgePath}
          fill="none"
          stroke={(edgeStyle.stroke as string) ?? (isPredictive ? '#f59e0b' : '#59799d')}
          strokeWidth={Number(edgeStyle.strokeWidth ?? (edgeStyle as Record<string, unknown>).lineWidth ?? (isPredictive ? 2.5 : 2))}
          opacity={isPredictive ? 0.85 : 0.8}
          strokeDasharray={(strokeDasharray as string) ?? (isPredictive ? '8 5' : undefined)}
        />
        <path
          className="topology-flow-edge-light"
          d={edgePath}
          fill="none"
          stroke={isPredictive ? '#fbbf24' : '#60a5fa'}
          strokeWidth={Number(edgeStyle.strokeWidth ?? (edgeStyle as Record<string, unknown>).lineWidth ?? 2) + 0.8}
          strokeLinecap="round"
          strokeDasharray="1 18"
          opacity={isPredictive ? 0.62 : 0.52}
        />
        <path
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={12}
        />
      </g>
      {edgeData.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${line.labelX}px,${line.labelY}px)`,
              fontSize: 11,
              color: '#475569',
              background: '#ffffff',
              borderRadius: 6,
              border: '1px solid rgba(148, 163, 184, 0.34)',
              padding: '3px 8px',
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            {String(edgeData.label)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function DefaultEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps) {
  const edgeData = (data ?? {}) as Record<string, unknown>;
  const line = trimLineToClearance(
    sourceX,
    sourceY,
    targetX,
    targetY,
    Number(edgeData.sourceClearance ?? 0),
    Number(edgeData.targetClearance ?? 0),
  );
  const [edgePath] = getStraightPath({
    sourceX: line.sourceX,
    sourceY: line.sourceY,
    targetX: line.targetX,
    targetY: line.targetY,
  });

  return (
    <g>
      <defs>
        <marker
          id={`arrow-${id}`}
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b4f66" />
        </marker>
      </defs>
      <path
        d={edgePath}
        fill="none"
        stroke="#3b4f66"
        strokeWidth={1.5}
        opacity={0.7}
        markerEnd={`url(#arrow-${id})`}
      />
    </g>
  );
}

const nodeTypes = {
  predictive: PredictiveNode,
  default: DefaultNode,
};

const edgeTypes = {
  predictive: FlowEdge,
  default: DefaultEdge,
};

function TopologyGraphInner({
  height = 400,
  nodes: topoNodes = [],
  edges: topoEdges = [],
  layoutType = 'force',
  variant = 'default',
  disableZoom = false,
  selectedNodeId,
  onNodeSelect,
  viewportSize,
}: Omit<TopologyGraphProps, 'title' | 'showCard'> & { viewportSize: ViewportSize }) {
  const { setViewport } = useReactFlow();
  const initializedRef = useRef(false);

  const sizeMap = variant === 'predictive' ? PREDICTIVE_SIZE_MAP : SIZE_MAP;
  const nodeGeometryMap = useMemo(() => (
    topoNodes.reduce<Record<string, NodeGeometry>>((accumulator, node) => {
      accumulator[node.id] = getNodeGeometry(node, variant, sizeMap);
      return accumulator;
    }, {})
  ), [topoNodes, variant, sizeMap]);
  const fallbackPositions = useMemo(
    () => buildFallbackPositions(topoNodes, topoEdges, height, variant, layoutType),
    [topoNodes, topoEdges, height, variant, layoutType],
  );
  const usePresetPositions = useMemo(() => {
    if (topoNodes.length === 0) return true;
    const positionedNodes = topoNodes.filter((node) => (
      typeof node.x === 'number'
      && Number.isFinite(node.x)
      && typeof node.y === 'number'
      && Number.isFinite(node.y)
    ));
    if (positionedNodes.length !== topoNodes.length) return false;
    return new Set(positionedNodes.map((node) => `${node.x}:${node.y}`)).size > 1;
  }, [topoNodes]);

  const rfNodes: Node[] = useMemo(() => {
    return topoNodes.map((node) => {
      const nodeSize = node.size ?? sizeMap[node.type || 'compute'] ?? 28;
      const isPredictive = variant === 'predictive';
      const geometry = nodeGeometryMap[node.id] ?? getNodeGeometry(node, variant, sizeMap);
      const fallbackPosition = fallbackPositions[node.id] ?? { x: 0, y: 0 };
      const centerPosition = {
        x: usePresetPositions ? (node.x ?? fallbackPosition.x) : fallbackPosition.x,
        y: usePresetPositions ? (node.y ?? fallbackPosition.y) : fallbackPosition.y,
      };

      return {
        id: node.id,
        type: isPredictive ? 'predictive' : 'default',
        position: {
          x: centerPosition.x - geometry.width / 2,
          y: centerPosition.y - geometry.height / 2,
        },
        data: {
          label: node.label,
          subtitle: node.subtitle,
          currentLoad: node.currentLoad,
          predictedLoad: node.predictedLoad,
          status: node.status,
          badgeText: node.badgeText,
          nodeSize,
          nodeType: node.type,
          nodeStyle: node.style,
          isSelected: node.id === selectedNodeId,
          data: node.data,
        },
        width: geometry.width,
        height: geometry.height,
        draggable: false,
      };
    });
  }, [topoNodes, variant, sizeMap, nodeGeometryMap, fallbackPositions, selectedNodeId, usePresetPositions]);

  const rfEdges: Edge[] = useMemo(() => {
    return topoEdges
      .filter((edge) => nodeGeometryMap[edge.source] && nodeGeometryMap[edge.target])
      .map((edge, index) => ({
        id: `edge-${index}`,
        source: edge.source,
        target: edge.target,
        type: variant === 'predictive' ? 'predictive' : 'default',
        data: {
          kind: edge.kind,
          label: edge.label,
          animated: edge.animated,
          style: edge.style,
          sourceClearance: nodeGeometryMap[edge.source].edgeClearance,
          targetClearance: nodeGeometryMap[edge.target].edgeClearance,
        },
      }));
  }, [topoEdges, variant, nodeGeometryMap]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const original = topoNodes.find((n) => n.id === node.id);
      if (original) {
        onNodeSelect?.(original);
      }
    },
    [topoNodes, onNodeSelect],
  );

  const onPaneClick = useCallback(() => {
    onNodeSelect?.(null);
  }, [onNodeSelect]);

  const onInit = useCallback(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
    }
  }, []);

  const fitViewKey = useMemo(() => (
    rfNodes.map((node) => `${node.id}:${Math.round(node.position.x)}:${Math.round(node.position.y)}`).join('|')
  ), [rfNodes]);

  useEffect(() => {
    if (rfNodes.length === 0 || viewportSize.width <= 0 || viewportSize.height <= 0) {
      return undefined;
    }

    const firstFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const nodeBounds = getRfNodesBounds(rfNodes);
        if (!Number.isFinite(nodeBounds.minX) || !Number.isFinite(nodeBounds.minY)) {
          return;
        }
        const measuredBounds = {
          x: nodeBounds.minX,
          y: nodeBounds.minY,
          width: Math.max(nodeBounds.maxX - nodeBounds.minX, 1),
          height: Math.max(nodeBounds.maxY - nodeBounds.minY, 1),
        };
        const boundaryPadding = variant === 'predictive'
          ? rfNodes.length <= 3
            ? 14
            : rfNodes.length <= 6
              ? 22
              : rfNodes.length <= 16
                ? 28
                : 34
          : 32;
        const rect = {
          x: measuredBounds.x - boundaryPadding,
          y: measuredBounds.y - boundaryPadding,
          width: measuredBounds.width + boundaryPadding * 2,
          height: measuredBounds.height + boundaryPadding * 2,
        };
        const targetFill = getTopologyTargetFill(rfNodes.length, variant);
        const maxZoom = getTopologyMaxZoom(rfNodes.length, variant);
        const centeredViewport = getCenteredViewport(
          rect,
          viewportSize,
          targetFill,
          0.05,
          maxZoom,
        );
        setViewport(centeredViewport, { duration: 260 });
      });
    });

    return () => window.cancelAnimationFrame(firstFrame);
  }, [fitViewKey, rfEdges.length, height, rfNodes, setViewport, variant, viewportSize]);

  return (
    <ReactFlow
      className="topology-graph-flow"
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      onInit={onInit}
      panOnDrag={!disableZoom}
      zoomOnScroll={!disableZoom}
      zoomOnPinch={!disableZoom}
      zoomOnDoubleClick={false}
      preventScrolling={!disableZoom}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      proOptions={{ hideAttribution: true }}
      minZoom={0.05}
      maxZoom={variant === 'predictive' ? 3 : 2}
      style={{ background: 'transparent' }}
    >
      <Background color="rgba(148, 163, 184, 0.08)" gap={24} size={1} />
      {!disableZoom && <Controls showInteractive={false} />}
    </ReactFlow>
  );
}

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 0, height: height });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setViewportSize({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, [height]);

  const content = (
    <div ref={containerRef} style={{ width: '100%', height, minHeight: height }}>
      <style>
        {`
          .topology-graph-flow .react-flow__node {
            overflow: visible;
          }

          .topology-graph-flow .react-flow__controls {
            transform: scale(.9);
            transform-origin: left bottom;
          }

          .topology-graph-flow .react-flow__node:hover {
            z-index: 10000 !important;
          }

          .topology-graph-flow .topology-graph-tooltip {
            z-index: 10001;
          }

          .topology-predictive-ring {
            transform-box: fill-box;
            transform-origin: center;
            animation: topology-predictive-ring-spin 8s linear infinite;
          }

          .topology-flow-edge-light {
            animation: topology-flow-edge-run 1.6s linear infinite;
          }

          @keyframes topology-predictive-ring-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }

          @keyframes topology-flow-edge-run {
            from { stroke-dashoffset: 20; }
            to { stroke-dashoffset: 0; }
          }

          @media (prefers-reduced-motion: reduce) {
            .topology-predictive-ring,
            .topology-flow-edge-light {
              animation: none;
            }
          }
        `}
      </style>
      <ReactFlowProvider>
        <TopologyGraphInner
          height={height}
          nodes={nodes}
          edges={edges}
          layoutType={layoutType}
          variant={variant}
          disableZoom={disableZoom}
          selectedNodeId={selectedNodeId}
          onNodeSelect={onNodeSelect}
          viewportSize={viewportSize}
        />
      </ReactFlowProvider>
    </div>
  );

  if (!showCard) {
    return content;
  }

  return <Card title={title}>{content}</Card>;
};

export default TopologyGraph;
