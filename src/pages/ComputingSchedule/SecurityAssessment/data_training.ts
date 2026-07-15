/**
 * 训练时序数据 - 来自 /data/output/training_demo/
 */
export interface TrainingEvent {
  timestamp_ns: number;
  timestamp_us: number;
  step: number;
  layer: string;
  phase: string;
  gpu_id: number;
  duration_ns: number;
  comm_type: string;
  comm_size_bytes: number;
  gpu_util_pct: number;
  event_type: 'compute' | 'communication';
}

export interface GPUUtilPoint {
  timestamp_us: number;
  gpu_util_pct: number;
  event_type: string;
  layer: string;
}

export interface WorkloadMeta {
  model_type: string;
  parallelism_config: string;
  model_parallel_group_size: number;
  ep: number;
  pp: number;
  vpp: number;
  all_gpus: number;
  layer_profiles: { layer: string; compute_time_ns: number; comm_type: string; comm_size: number }[];
  total_steps: number;
}

// ===== training_timeline.csv =====
export const TRAINING_EVENTS: TrainingEvent[] = [
  { timestamp_ns: 0, timestamp_us: 0.0, step: 0, layer: 'embedding_layer', phase: 'forward_compute', gpu_id: 0, duration_ns: 623, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 623, timestamp_us: 0.623, step: 0, layer: 'embedding_layer', phase: 'forward_allgather', gpu_id: 0, duration_ns: 91, comm_type: 'ALLGATHER', comm_size_bytes: 0, gpu_util_pct: 30, event_type: 'communication' },
  { timestamp_ns: 714, timestamp_us: 0.714, step: 0, layer: 'embedding_layer', phase: 'weight_grad_compute', gpu_id: 0, duration_ns: 15091, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 15805, timestamp_us: 15.805, step: 1, layer: 'attention_column', phase: 'forward_compute', gpu_id: 0, duration_ns: 1751, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 17556, timestamp_us: 17.556, step: 1, layer: 'attention_column', phase: 'forward_allgather', gpu_id: 0, duration_ns: 62, comm_type: 'ALLGATHER', comm_size_bytes: 50331648, gpu_util_pct: 30, event_type: 'communication' },
  { timestamp_ns: 17618, timestamp_us: 17.618, step: 1, layer: 'attention_column', phase: 'weight_grad_compute', gpu_id: 0, duration_ns: 875, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 18493, timestamp_us: 18.493, step: 1, layer: 'attention_column', phase: 'input_grad_compute', gpu_id: 0, duration_ns: 875, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 19368, timestamp_us: 19.368, step: 2, layer: 'attention_row', phase: 'forward_compute', gpu_id: 0, duration_ns: 1751, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 21119, timestamp_us: 21.119, step: 2, layer: 'attention_row', phase: 'forward_allgather', gpu_id: 0, duration_ns: 62, comm_type: 'ALLGATHER', comm_size_bytes: 50331648, gpu_util_pct: 30, event_type: 'communication' },
  { timestamp_ns: 21181, timestamp_us: 21.181, step: 2, layer: 'attention_row', phase: 'weight_grad_compute', gpu_id: 0, duration_ns: 875, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 22056, timestamp_us: 22.056, step: 2, layer: 'attention_row', phase: 'input_grad_compute', gpu_id: 0, duration_ns: 875, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 22931, timestamp_us: 22.931, step: 2, layer: 'attention_row', phase: 'input_grad_comm', gpu_id: 0, duration_ns: 62, comm_type: 'ALLGATHER', comm_size_bytes: 50331648, gpu_util_pct: 30, event_type: 'communication' },
  { timestamp_ns: 22993, timestamp_us: 22.993, step: 3, layer: 'attention_column', phase: 'forward_compute', gpu_id: 0, duration_ns: 1751, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 24744, timestamp_us: 24.744, step: 3, layer: 'attention_column', phase: 'forward_allgather', gpu_id: 0, duration_ns: 62, comm_type: 'ALLGATHER', comm_size_bytes: 50331648, gpu_util_pct: 30, event_type: 'communication' },
  { timestamp_ns: 24806, timestamp_us: 24.806, step: 3, layer: 'attention_column', phase: 'weight_grad_compute', gpu_id: 0, duration_ns: 875, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 25681, timestamp_us: 25.681, step: 3, layer: 'attention_column', phase: 'input_grad_compute', gpu_id: 0, duration_ns: 875, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 26556, timestamp_us: 26.556, step: 4, layer: 'attention_row', phase: 'forward_compute', gpu_id: 0, duration_ns: 1751, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 28307, timestamp_us: 28.307, step: 4, layer: 'attention_row', phase: 'forward_allgather', gpu_id: 0, duration_ns: 62, comm_type: 'ALLGATHER', comm_size_bytes: 50331648, gpu_util_pct: 30, event_type: 'communication' },
  { timestamp_ns: 28369, timestamp_us: 28.369, step: 4, layer: 'attention_row', phase: 'weight_grad_compute', gpu_id: 0, duration_ns: 875, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 29244, timestamp_us: 29.244, step: 4, layer: 'attention_row', phase: 'input_grad_compute', gpu_id: 0, duration_ns: 875, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 30119, timestamp_us: 30.119, step: 4, layer: 'attention_row', phase: 'input_grad_comm', gpu_id: 0, duration_ns: 62, comm_type: 'ALLGATHER', comm_size_bytes: 50331648, gpu_util_pct: 30, event_type: 'communication' },
  { timestamp_ns: 30181, timestamp_us: 30.181, step: 5, layer: 'mlp_layer', phase: 'forward_compute', gpu_id: 0, duration_ns: 3496, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 33677, timestamp_us: 33.677, step: 5, layer: 'mlp_layer', phase: 'forward_allgather', gpu_id: 0, duration_ns: 27, comm_type: 'ALLGATHER', comm_size_bytes: 16777216, gpu_util_pct: 30, event_type: 'communication' },
  { timestamp_ns: 33704, timestamp_us: 33.704, step: 5, layer: 'mlp_layer', phase: 'weight_grad_compute', gpu_id: 0, duration_ns: 1748, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 35452, timestamp_us: 35.452, step: 5, layer: 'mlp_layer', phase: 'input_grad_compute', gpu_id: 0, duration_ns: 1748, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 37200, timestamp_us: 37.2, step: 5, layer: 'mlp_layer', phase: 'input_grad_comm', gpu_id: 0, duration_ns: 14, comm_type: 'ALLGATHER', comm_size_bytes: 50331648, gpu_util_pct: 30, event_type: 'communication' },
  { timestamp_ns: 37214, timestamp_us: 37.214, step: 6, layer: 'mlp_layer', phase: 'forward_compute', gpu_id: 0, duration_ns: 3496, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 40710, timestamp_us: 40.71, step: 6, layer: 'mlp_layer', phase: 'forward_allgather', gpu_id: 0, duration_ns: 27, comm_type: 'ALLGATHER', comm_size_bytes: 16777216, gpu_util_pct: 30, event_type: 'communication' },
  { timestamp_ns: 40737, timestamp_us: 40.737, step: 6, layer: 'mlp_layer', phase: 'weight_grad_compute', gpu_id: 0, duration_ns: 1748, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 42485, timestamp_us: 42.485, step: 6, layer: 'mlp_layer', phase: 'input_grad_compute', gpu_id: 0, duration_ns: 1748, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 44233, timestamp_us: 44.233, step: 6, layer: 'mlp_layer', phase: 'input_grad_comm', gpu_id: 0, duration_ns: 14, comm_type: 'ALLGATHER', comm_size_bytes: 50331648, gpu_util_pct: 30, event_type: 'communication' },
  { timestamp_ns: 44247, timestamp_us: 44.247, step: 7, layer: 'attention_column', phase: 'forward_compute', gpu_id: 0, duration_ns: 1751, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 45998, timestamp_us: 45.998, step: 7, layer: 'attention_column', phase: 'forward_allgather', gpu_id: 0, duration_ns: 62, comm_type: 'ALLGATHER', comm_size_bytes: 50331648, gpu_util_pct: 30, event_type: 'communication' },
  { timestamp_ns: 46060, timestamp_us: 46.06, step: 7, layer: 'attention_column', phase: 'weight_grad_compute', gpu_id: 0, duration_ns: 875, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 46935, timestamp_us: 46.935, step: 7, layer: 'attention_column', phase: 'input_grad_compute', gpu_id: 0, duration_ns: 875, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 47810, timestamp_us: 47.81, step: 8, layer: 'attention_row', phase: 'forward_compute', gpu_id: 0, duration_ns: 1751, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 49561, timestamp_us: 49.561, step: 8, layer: 'attention_row', phase: 'forward_allgather', gpu_id: 0, duration_ns: 62, comm_type: 'ALLGATHER', comm_size_bytes: 50331648, gpu_util_pct: 30, event_type: 'communication' },
  { timestamp_ns: 49623, timestamp_us: 49.623, step: 8, layer: 'attention_row', phase: 'weight_grad_compute', gpu_id: 0, duration_ns: 875, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 50498, timestamp_us: 50.498, step: 8, layer: 'attention_row', phase: 'input_grad_compute', gpu_id: 0, duration_ns: 875, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 51373, timestamp_us: 51.373, step: 8, layer: 'attention_row', phase: 'input_grad_comm', gpu_id: 0, duration_ns: 62, comm_type: 'ALLGATHER', comm_size_bytes: 50331648, gpu_util_pct: 30, event_type: 'communication' },
  { timestamp_ns: 51435, timestamp_us: 51.435, step: 9, layer: 'attention_column', phase: 'forward_compute', gpu_id: 0, duration_ns: 1751, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 53186, timestamp_us: 53.186, step: 9, layer: 'attention_column', phase: 'forward_allgather', gpu_id: 0, duration_ns: 62, comm_type: 'ALLGATHER', comm_size_bytes: 50331648, gpu_util_pct: 30, event_type: 'communication' },
  { timestamp_ns: 53248, timestamp_us: 53.248, step: 9, layer: 'attention_column', phase: 'weight_grad_compute', gpu_id: 0, duration_ns: 875, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 54123, timestamp_us: 54.123, step: 9, layer: 'attention_column', phase: 'input_grad_compute', gpu_id: 0, duration_ns: 875, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 54998, timestamp_us: 54.998, step: 10, layer: 'attention_row', phase: 'forward_compute', gpu_id: 0, duration_ns: 1751, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 56749, timestamp_us: 56.749, step: 10, layer: 'attention_row', phase: 'forward_allgather', gpu_id: 0, duration_ns: 62, comm_type: 'ALLGATHER', comm_size_bytes: 50331648, gpu_util_pct: 30, event_type: 'communication' },
  { timestamp_ns: 56811, timestamp_us: 56.811, step: 10, layer: 'attention_row', phase: 'weight_grad_compute', gpu_id: 0, duration_ns: 875, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 57686, timestamp_us: 57.686, step: 10, layer: 'attention_row', phase: 'input_grad_compute', gpu_id: 0, duration_ns: 875, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 58561, timestamp_us: 58.561, step: 10, layer: 'attention_row', phase: 'input_grad_comm', gpu_id: 0, duration_ns: 62, comm_type: 'ALLGATHER', comm_size_bytes: 50331648, gpu_util_pct: 30, event_type: 'communication' },
  { timestamp_ns: 58623, timestamp_us: 58.623, step: 11, layer: 'mlp_layer', phase: 'forward_compute', gpu_id: 0, duration_ns: 3496, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 62119, timestamp_us: 62.119, step: 11, layer: 'mlp_layer', phase: 'forward_allgather', gpu_id: 0, duration_ns: 27, comm_type: 'ALLGATHER', comm_size_bytes: 16777216, gpu_util_pct: 30, event_type: 'communication' },
  { timestamp_ns: 62146, timestamp_us: 62.146, step: 11, layer: 'mlp_layer', phase: 'weight_grad_compute', gpu_id: 0, duration_ns: 1748, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 63894, timestamp_us: 63.894, step: 11, layer: 'mlp_layer', phase: 'input_grad_compute', gpu_id: 0, duration_ns: 1748, comm_type: 'NONE', comm_size_bytes: 0, gpu_util_pct: 100, event_type: 'compute' },
  { timestamp_ns: 65642, timestamp_us: 65.642, step: 11, layer: 'mlp_layer', phase: 'input_grad_comm', gpu_id: 0, duration_ns: 14, comm_type: 'ALLGATHER', comm_size_bytes: 50331648, gpu_util_pct: 30, event_type: 'communication' },
];

// ===== training_gpu_util.csv =====
export const GPU_UTIL_DATA: GPUUtilPoint[] = [
  { timestamp_us: 0.0, gpu_util_pct: 100, event_type: 'compute', layer: 'embedding_layer' },
  { timestamp_us: 0.6, gpu_util_pct: 30, event_type: 'communication', layer: 'embedding_layer' },
  { timestamp_us: 0.7, gpu_util_pct: 100, event_type: 'compute', layer: 'embedding_layer' },
  { timestamp_us: 2.2, gpu_util_pct: 100, event_type: 'compute', layer: 'embedding_layer' },
  { timestamp_us: 3.7, gpu_util_pct: 100, event_type: 'compute', layer: 'embedding_layer' },
  { timestamp_us: 5.2, gpu_util_pct: 100, event_type: 'compute', layer: 'embedding_layer' },
  { timestamp_us: 6.8, gpu_util_pct: 100, event_type: 'compute', layer: 'embedding_layer' },
  { timestamp_us: 8.3, gpu_util_pct: 100, event_type: 'compute', layer: 'embedding_layer' },
  { timestamp_us: 9.8, gpu_util_pct: 100, event_type: 'compute', layer: 'embedding_layer' },
  { timestamp_us: 11.3, gpu_util_pct: 100, event_type: 'compute', layer: 'embedding_layer' },
  { timestamp_us: 12.8, gpu_util_pct: 100, event_type: 'compute', layer: 'embedding_layer' },
  { timestamp_us: 14.3, gpu_util_pct: 100, event_type: 'compute', layer: 'embedding_layer' },
  { timestamp_us: 15.8, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_column' },
  { timestamp_us: 16.8, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_column' },
  { timestamp_us: 17.6, gpu_util_pct: 30, event_type: 'communication', layer: 'attention_column' },
  { timestamp_us: 17.6, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_column' },
  { timestamp_us: 18.5, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_column' },
  { timestamp_us: 19.4, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_row' },
  { timestamp_us: 20.4, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_row' },
  { timestamp_us: 21.1, gpu_util_pct: 30, event_type: 'communication', layer: 'attention_row' },
  { timestamp_us: 21.2, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_row' },
  { timestamp_us: 22.1, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_row' },
  { timestamp_us: 22.9, gpu_util_pct: 30, event_type: 'communication', layer: 'attention_row' },
  { timestamp_us: 23.0, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_column' },
  { timestamp_us: 24.0, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_column' },
  { timestamp_us: 24.7, gpu_util_pct: 30, event_type: 'communication', layer: 'attention_column' },
  { timestamp_us: 24.8, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_column' },
  { timestamp_us: 25.7, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_column' },
  { timestamp_us: 26.6, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_row' },
  { timestamp_us: 27.6, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_row' },
  { timestamp_us: 28.3, gpu_util_pct: 30, event_type: 'communication', layer: 'attention_row' },
  { timestamp_us: 28.4, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_row' },
  { timestamp_us: 29.2, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_row' },
  { timestamp_us: 30.1, gpu_util_pct: 30, event_type: 'communication', layer: 'attention_row' },
  { timestamp_us: 30.2, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 31.2, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 32.2, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 33.2, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 33.7, gpu_util_pct: 30, event_type: 'communication', layer: 'mlp_layer' },
  { timestamp_us: 33.7, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 34.7, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 35.5, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 36.5, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 37.2, gpu_util_pct: 30, event_type: 'communication', layer: 'mlp_layer' },
  { timestamp_us: 37.2, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 38.2, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 39.2, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 40.2, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 40.7, gpu_util_pct: 30, event_type: 'communication', layer: 'mlp_layer' },
  { timestamp_us: 40.7, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 41.7, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 42.5, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 43.5, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 44.2, gpu_util_pct: 30, event_type: 'communication', layer: 'mlp_layer' },
  { timestamp_us: 44.2, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_column' },
  { timestamp_us: 45.2, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_column' },
  { timestamp_us: 46.0, gpu_util_pct: 30, event_type: 'communication', layer: 'attention_column' },
  { timestamp_us: 46.1, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_column' },
  { timestamp_us: 46.9, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_column' },
  { timestamp_us: 47.8, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_row' },
  { timestamp_us: 48.8, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_row' },
  { timestamp_us: 49.6, gpu_util_pct: 30, event_type: 'communication', layer: 'attention_row' },
  { timestamp_us: 49.6, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_row' },
  { timestamp_us: 50.5, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_row' },
  { timestamp_us: 51.4, gpu_util_pct: 30, event_type: 'communication', layer: 'attention_row' },
  { timestamp_us: 51.4, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_column' },
  { timestamp_us: 52.4, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_column' },
  { timestamp_us: 53.2, gpu_util_pct: 30, event_type: 'communication', layer: 'attention_column' },
  { timestamp_us: 53.2, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_column' },
  { timestamp_us: 54.1, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_column' },
  { timestamp_us: 55.0, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_row' },
  { timestamp_us: 56.0, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_row' },
  { timestamp_us: 56.7, gpu_util_pct: 30, event_type: 'communication', layer: 'attention_row' },
  { timestamp_us: 56.8, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_row' },
  { timestamp_us: 57.7, gpu_util_pct: 100, event_type: 'compute', layer: 'attention_row' },
  { timestamp_us: 58.6, gpu_util_pct: 30, event_type: 'communication', layer: 'attention_row' },
  { timestamp_us: 58.6, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 59.6, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 60.6, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 61.6, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 62.1, gpu_util_pct: 30, event_type: 'communication', layer: 'mlp_layer' },
  { timestamp_us: 62.1, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 63.1, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 63.9, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 64.9, gpu_util_pct: 100, event_type: 'compute', layer: 'mlp_layer' },
  { timestamp_us: 65.6, gpu_util_pct: 30, event_type: 'communication', layer: 'mlp_layer' },
];

// ===== Workload Metadata =====
export const WORKLOAD_META: WorkloadMeta = {
  model_type: 'HYBRID_TRANSFORMER_FWD_IN_BCKWD',
  parallelism_config: 'model_parallel_NPU_group: 8 ep: 1 pp: 1 vpp: 12 ga: 1 all_gpus: 8',
  model_parallel_group_size: 8,
  ep: 1,
  pp: 1,
  vpp: 12,
  all_gpus: 8,
  total_steps: 12,
  layer_profiles: [
    { layer: 'embedding_layer', compute_time_ns: 622731, comm_type: 'ALLREDUCE', comm_size: 50331648 },
    { layer: 'attention_column', compute_time_ns: 1750840, comm_type: 'ALLGATHER', comm_size: 50331648 },
    { layer: 'attention_row', compute_time_ns: 1750840, comm_type: 'REDUCESCATTER', comm_size: 50331648 },
    { layer: 'mlp_layer', compute_time_ns: 3496500, comm_type: 'ALLGATHER', comm_size: 16777216 },
  ],
};

// ===== Derived statistics =====
export function getTrainingStats() {
  const totalTimeUs = Math.max(...TRAINING_EVENTS.map(e => e.timestamp_us + e.duration_ns / 1000));
  const computeEvents = TRAINING_EVENTS.filter(e => e.event_type === 'compute');
  const commEvents = TRAINING_EVENTS.filter(e => e.event_type === 'communication');
  const totalComputeDuration = computeEvents.reduce((s, e) => s + e.duration_ns, 0);
  const totalCommDuration = commEvents.reduce((s, e) => s + e.duration_ns, 0);
  const totalDuration = totalComputeDuration + totalCommDuration;
  const uniqueSteps = [...new Set(TRAINING_EVENTS.map(e => e.step))].length;

  const layerStats = TRAINING_EVENTS.reduce<Record<string, { compute_ns: number; comm_ns: number; count: number }>>((acc, e) => {
    if (!acc[e.layer]) acc[e.layer] = { compute_ns: 0, comm_ns: 0, count: 0 };
    acc[e.layer].count++;
    if (e.event_type === 'compute') acc[e.layer].compute_ns += e.duration_ns;
    else acc[e.layer].comm_ns += e.duration_ns;
    return acc;
  }, {});

  return {
    totalTimeUs,
    uniqueSteps,
    computeEventCount: computeEvents.length,
    commEventCount: commEvents.length,
    totalComputeDuration,
    totalCommDuration,
    totalDuration,
    computePct: totalDuration > 0 ? +(totalComputeDuration / totalDuration * 100).toFixed(1) : 0,
    commPct: totalDuration > 0 ? +(totalCommDuration / totalDuration * 100).toFixed(1) : 0,
    layerStats,
  };
}
