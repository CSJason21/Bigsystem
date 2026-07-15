import type { TopologyNodeStatus } from '@/components/TopologyGraph';
import type { NodeId } from './nodeMeta';

export const getNodeStatus = (nodeId: NodeId, tick: number): TopologyNodeStatus => {
  const phase = tick % 24;
  const hash = nodeId.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  if (hash % 7 === 3 && phase >= 8 && phase <= 11) {
    return 'offline';
  }
  if (hash % 11 === 5 && phase >= 15 && phase <= 18) {
    return 'new';
  }
  return 'online';
};

export const HUB_META = [
  { id: 'hub_beijing', label: '京津冀枢纽', region: '华北' },
  { id: 'hub_shanghai', label: '长三角枢纽', region: '华东' },
  { id: 'hub_guangdong', label: '粤港澳枢纽', region: '华南' },
  { id: 'hub_chengdu', label: '成渝枢纽', region: '西部' },
];

export const REGIONAL_CENTERS = [
  { id: 'rc_neimenggu', label: '内蒙古区域中心', parentHub: 'hub_beijing' },
  { id: 'rc_zhangjiakou', label: '张家口区域中心', parentHub: 'hub_beijing' },
  { id: 'rc_guizhou', label: '贵州区域中心', parentHub: 'hub_shanghai' },
  { id: 'rc_hefei', label: '合肥区域中心', parentHub: 'hub_shanghai' },
  { id: 'rc_nanning', label: '广西区域中心', parentHub: 'hub_guangdong' },
  { id: 'rc_haikou', label: '海南区域中心', parentHub: 'hub_guangdong' },
  { id: 'rc_ningxia', label: '宁夏区域中心', parentHub: 'hub_chengdu' },
  { id: 'rc_gansu', label: '甘肃区域中心', parentHub: 'hub_chengdu' },
];
