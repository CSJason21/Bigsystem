export { createSnapshotEngine } from './engine';
export type { SnapshotGenerator, InitialHistoryGenerator } from './types';
export type { MetricNode, TimelineSnapshot, MetricRegistration, SnapshotEngineConfig, SnapshotEngine } from './types';
export { useSnapshotEngine } from './useSnapshotEngine';

// 预置生成器
export {
  GLOBAL_REGISTRATIONS,
  GLOBAL_ROOT_ID,
  GLOBAL_ROOT_NAME,
  generateGlobalSnapshot,
  generateGlobalInitial,
} from './global-posture';

export {
  getLayerRegistrations,
  getLayerRootId,
  generateLayerSnapshot,
  generateLayerInitial,
  getAllLayerRegistrations,
  buildLayerNode,
} from './layer-generator';
