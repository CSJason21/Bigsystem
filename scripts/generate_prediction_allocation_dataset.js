const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATASET_DIR = path.join(
  ROOT_DIR,
  'server',
  'app',
  'data',
  'prediction_allocation',
);

const SOURCE_PATHS = {
  nodes: path.join(
    ROOT_DIR,
    'clusterdata-master',
    'cluster-trace-gpu-v2023',
    'csv',
    'openb_node_list_gpu_node.csv',
  ),
  pods: path.join(
    ROOT_DIR,
    'clusterdata-master',
    'cluster-trace-gpu-v2023',
    'csv',
    'openb_pod_list_default.csv',
  ),
  jobDurations: path.join(
    ROOT_DIR,
    'clusterdata-master',
    'cluster-trace-gpu-v2020',
    'simulator',
    'traces',
    'pai',
    'pai_job_duration_estimate_100K.csv',
  ),
};

const QOS_FACTOR = {
  LS: 1.35,
  Guaranteed: 1.22,
  Burstable: 1.08,
  BE: 0.9,
};

const MODEL_QUOTA = {
  T4: 6,
  G2: 4,
  P100: 3,
  V100M16: 2,
  V100M32: 2,
  G3: 1,
  A10: 1,
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields;
}

function readCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index] ?? '';
      return row;
    }, {});
  });
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function average(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function hashString(input) {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function pseudoBetween(key, min, max) {
  const normalized = (hashString(key) % 10000) / 10000;
  return min + normalized * (max - min);
}

function groupBy(items, keySelector) {
  const groups = new Map();

  for (const item of items) {
    const key = keySelector(item);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(item);
  }

  return groups;
}

function keyBy(items, keySelector) {
  return items.reduce((accumulator, item) => {
    accumulator[keySelector(item)] = item;
    return accumulator;
  }, {});
}

function createRecentHourLabels(hours = 24) {
  return Array.from({ length: hours }, (_, index) => `T-${hours - index - 1}h`);
}

function createRecentMinuteLabels(minutes = 60) {
  return Array.from({ length: minutes }, (_, index) => `T-${minutes - index}m`);
}

function createMonthLabels(months = 12) {
  const labels = [];
  const now = new Date();

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    labels.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }

  return labels;
}

function partitionEvenly(items, bucketCount) {
  const bucketSize = Math.max(1, Math.ceil(items.length / bucketCount));
  const buckets = [];

  for (let index = 0; index < bucketCount; index += 1) {
    const slice = items.slice(index * bucketSize, (index + 1) * bucketSize);
    buckets.push(slice.length ? slice : buckets[buckets.length - 1] || []);
  }

  return buckets;
}

function scaleSeries(values, minTarget, maxTarget) {
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  if (maxValue === minValue) {
    const middle = (minTarget + maxTarget) / 2;
    return values.map(() => round(middle));
  }

  return values.map((value) => {
    const normalized = (value - minValue) / (maxValue - minValue);
    return round(minTarget + normalized * (maxTarget - minTarget));
  });
}

function smoothPrediction(actualSeries, jitterKey, minValue, maxValue) {
  return actualSeries.map((value, index) => {
    const previous = index === 0 ? actualSeries[index] : actualSeries[index - 1];
    const next =
      index === actualSeries.length - 1 ? actualSeries[index] : actualSeries[index + 1];
    const localAverage = (previous + value + next) / 3;
    const trend = (index / Math.max(1, actualSeries.length - 1) - 0.5) * 8;
    const jitter = pseudoBetween(`${jitterKey}:${index}`, -2.4, 2.4);

    return round(clamp(localAverage * 0.9 + value * 0.1 + trend + jitter, minValue, maxValue));
  });
}

function gpuMemoryPerCard(model) {
  if (model === 'V100M32') {
    return 32;
  }
  if (model === 'A10') {
    return 24;
  }
  if (model === 'P100' || model === 'T4' || model === 'V100M16' || model === 'G3') {
    return 16;
  }
  return 12;
}

function normalizeGpuType(type) {
  if (!type) {
    return 'MISC';
  }
  if (type.startsWith('V100')) {
    return 'V100';
  }
  return type;
}

function buildDurationStats(jobDurationRows) {
  const grouped = groupBy(jobDurationRows, (row) => normalizeGpuType(row.gpu_type));

  return Array.from(grouped.entries()).reduce((stats, [gpuType, rows]) => {
    const durations = rows.map((row) => toNumber(row.duration)).filter((value) => value > 0);
    const waitTimes = rows.map((row) => toNumber(row.wait_time)).filter((value) => value >= 0);

    stats[gpuType] = {
      duration: round(median(durations), 0),
      wait: round(median(waitTimes), 0),
    };

    return stats;
  }, {});
}

function pickNodePool(nodeRows) {
  const grouped = groupBy(nodeRows, (row) => row.model || 'Unknown');
  const selected = [];

  Object.entries(MODEL_QUOTA).forEach(([model, quota]) => {
    const rows = grouped.get(model) || [];
    selected.push(...rows.slice(0, quota));
  });

  if (selected.length < 18) {
    const selectedSet = new Set(selected.map((row) => row.sn));
    const remaining = nodeRows.filter((row) => !selectedSet.has(row.sn));
    selected.push(...remaining.slice(0, 18 - selected.length));
  }

  return selected.slice(0, 18).map((row, index) => {
    const cpuCapacity = round(toNumber(row.cpu_milli) / 1000, 1);
    const memoryCapacity = round(toNumber(row.memory_mib) / 1024, 1);
    const gpuCapacity = Math.max(1, toNumber(row.gpu));

    return {
      node_id: row.sn,
      hostname: `gpu-cluster-${String(index + 1).padStart(2, '0')}`,
      ip: `10.20.${Math.floor(index / 6) + 1}.${index + 11}`,
      rack_id: `rack-${Math.floor(index / 6) + 1}`,
      zone: `zone-${(index % 3) + 1}`,
      gpu_model: row.model || 'Unknown',
      cpu_capacity_cores: cpuCapacity,
      memory_capacity_gb: memoryCapacity,
      gpu_capacity: gpuCapacity,
      effective_cpu_capacity: round(cpuCapacity * 0.88, 1),
      effective_memory_capacity: round(memoryCapacity * 0.84, 1),
      effective_gpu_capacity: gpuCapacity,
    };
  });
}

function buildPodFacts(podRows) {
  return podRows
    .map((row) => {
      const creationTime = toNumber(row.creation_time);
      const scheduledTime = toNumber(row.scheduled_time);
      const deletionTime = toNumber(row.deletion_time);

      return {
        task_id: row.name,
        creation_time: creationTime,
        scheduled_time: scheduledTime,
        deletion_time: deletionTime,
        cpu_cores: round(toNumber(row.cpu_milli) / 1000, 1),
        memory_gb: round(toNumber(row.memory_mib) / 1024, 1),
        gpu_count: toNumber(row.num_gpu),
        gpu_share: round(toNumber(row.gpu_milli) / 1000, 2),
        qos: row.qos || 'BE',
        pod_phase: row.pod_phase || 'Running',
        wait_time_sec: Math.max(0, scheduledTime - creationTime),
        run_time_sec: Math.max(60, deletionTime - Math.max(creationTime, scheduledTime)),
      };
    })
    .filter((row) => row.pod_phase === 'Running' && row.cpu_cores > 0 && row.memory_gb > 0)
    .sort((left, right) => left.creation_time - right.creation_time);
}

function buildPredictionSeries(podFacts) {
  const dailyBuckets = partitionEvenly(podFacts, 24);
  const monthlyBuckets = partitionEvenly(podFacts, 12);

  const dailyCpuRaw = dailyBuckets.map((bucket) => bucket.reduce((sum, pod) => sum + pod.cpu_cores, 0));
  const dailyGpuRaw = dailyBuckets.map((bucket) =>
    bucket.reduce((sum, pod) => sum + pod.gpu_count + pod.gpu_share * 0.4, 0),
  );
  const dailyMemoryRaw = dailyBuckets.map((bucket) =>
    bucket.reduce((sum, pod) => sum + pod.memory_gb, 0),
  );
  const dailyBandwidthRaw = dailyBuckets.map((bucket) =>
    bucket.reduce((sum, pod) => {
      const qosFactor = QOS_FACTOR[pod.qos] || 1;
      return sum + (pod.cpu_cores * 14 + pod.memory_gb * 2.4 + Math.max(1, pod.gpu_count) * 120) * qosFactor;
    }, 0),
  );
  const dailyTaskRaw = dailyBuckets.map((bucket) => bucket.length);

  const monthlyGpuRaw = monthlyBuckets.map((bucket) =>
    bucket.reduce((sum, pod) => sum + pod.gpu_count + pod.gpu_share, 0),
  );
  const monthlyStorageRaw = monthlyBuckets.map((bucket) =>
    bucket.reduce((sum, pod) => sum + pod.memory_gb * 1.8 + Math.max(0, pod.gpu_count) * 36, 0),
  );
  const monthlyBandwidthRaw = monthlyBuckets.map((bucket) =>
    bucket.reduce((sum, pod) => sum + pod.cpu_cores * 8 + pod.memory_gb * 1.1, 0),
  );
  const monthlyWaitRaw = monthlyBuckets.map((bucket) =>
    average(bucket.map((pod) => pod.wait_time_sec)),
  );

  const cpuActual = scaleSeries(dailyCpuRaw, 42, 86);
  const gpuActual = scaleSeries(dailyGpuRaw, 28, 84);
  const memoryActual = scaleSeries(dailyMemoryRaw, 38, 88);
  const bandwidthActual = scaleSeries(dailyBandwidthRaw, 260, 910);
  const runningTasks = scaleSeries(dailyTaskRaw, 18, 92).map((value) => Math.round(value));

  const gpuPredicted = scaleSeries(monthlyGpuRaw, 36, 90);
  const storagePredicted = scaleSeries(monthlyStorageRaw, 180, 880);
  const bandwidthPredicted = scaleSeries(monthlyBandwidthRaw, 220, 780);
  const avgWaitPredicted = scaleSeries(monthlyWaitRaw, 18, 110);

  return {
    dayPrediction: {
      period: 'daily',
      labels: createRecentHourLabels(24),
      cpu_actual: cpuActual,
      cpu_predicted: smoothPrediction(cpuActual, 'cpu-prediction', 35, 95),
      gpu_actual: gpuActual,
      gpu_predicted: smoothPrediction(gpuActual, 'gpu-prediction', 20, 92),
      memory_actual: memoryActual,
      memory_predicted: smoothPrediction(memoryActual, 'memory-prediction', 30, 94),
      bandwidth_actual_mbps: bandwidthActual,
      bandwidth_predicted_mbps: smoothPrediction(
        bandwidthActual,
        'bandwidth-prediction',
        180,
        980,
      ),
      running_tasks: runningTasks,
    },
    monthPrediction: {
      period: 'monthly',
      labels: createMonthLabels(12),
      gpu_predicted: gpuPredicted,
      storage_predicted: storagePredicted,
      bandwidth_predicted_mbps: smoothPrediction(
        bandwidthPredicted,
        'monthly-bandwidth',
        180,
        840,
      ),
      avg_wait_time_sec: avgWaitPredicted.map((value) => Math.round(value)),
      memory_predicted: smoothPrediction(gpuPredicted, 'monthly-memory', 40, 88),
    },
  };
}

function pickAllocationPods(podFacts, limit = 28) {
  const candidatePods = podFacts.filter(
    (pod) => pod.cpu_cores <= 16 && pod.memory_gb <= 64 && pod.gpu_count <= 2,
  );
  const grouped = groupBy(candidatePods, (pod) => pod.qos);
  const qosOrder = ['LS', 'Guaranteed', 'Burstable', 'BE'];
  const pointers = Object.fromEntries(qosOrder.map((qos) => [qos, 0]));
  const selected = [];
  const seen = new Set();
  let added = true;

  qosOrder.forEach((qos) => {
    const rows = grouped.get(qos) || [];
    rows.sort((left, right) => {
      const leftWeight = left.gpu_count * 100 + left.cpu_cores * 10 + left.memory_gb;
      const rightWeight = right.gpu_count * 100 + right.cpu_cores * 10 + right.memory_gb;
      return rightWeight - leftWeight || left.creation_time - right.creation_time;
    });
  });

  while (selected.length < limit && added) {
    added = false;

    for (const qos of qosOrder) {
      const rows = grouped.get(qos) || [];
      if (pointers[qos] >= rows.length) {
        continue;
      }

      const row = rows[pointers[qos]];
      pointers[qos] += 1;

      if (seen.has(row.task_id)) {
        continue;
      }

      selected.push(row);
      seen.add(row.task_id);
      added = true;

      if (selected.length >= limit) {
        break;
      }
    }
  }

  return selected;
}

function scoreNodeFit(nodeState, pod) {
  const postCpuUtil =
    (nodeState.used_cpu_cores + pod.cpu_cores) / Math.max(1, nodeState.node.effective_cpu_capacity);
  const postMemoryUtil =
    (nodeState.used_memory_gb + pod.memory_gb) /
    Math.max(1, nodeState.node.effective_memory_capacity);
  const postGpuUtil =
    (nodeState.used_gpu + pod.gpu_count) / Math.max(1, nodeState.node.effective_gpu_capacity);

  const cpuPenalty = Math.abs(postCpuUtil - 0.72) * 40;
  const memoryPenalty = Math.abs(postMemoryUtil - 0.66) * 34;
  const gpuPenalty = Math.abs(postGpuUtil - (pod.gpu_count > 0 ? 0.7 : 0.45)) * 26;
  const qosBoost = pod.qos === 'LS' && nodeState.node.gpu_model !== 'G2' ? -3.5 : 0;
  const jitter = pseudoBetween(`${pod.task_id}:${nodeState.node.node_id}`, 0, 3.2);

  return cpuPenalty + memoryPenalty + gpuPenalty + qosBoost + jitter;
}

function buildAllocationRecords(nodePool, podFacts, durationStats) {
  const nodeStates = nodePool.map((node) => ({
    node,
    used_cpu_cores: 0,
    used_memory_gb: 0,
    used_gpu: 0,
    allocations: [],
  }));

  const selectedPods = pickAllocationPods(podFacts);
  const allocations = [];

  selectedPods.forEach((pod, index) => {
    const candidates = nodeStates.filter(
      (state) =>
        state.used_cpu_cores + pod.cpu_cores <= state.node.effective_cpu_capacity &&
        state.used_memory_gb + pod.memory_gb <= state.node.effective_memory_capacity &&
        state.used_gpu + pod.gpu_count <= state.node.effective_gpu_capacity,
    );

    if (!candidates.length) {
      return;
    }

    candidates.sort((left, right) => scoreNodeFit(left, pod) - scoreNodeFit(right, pod));
    const target = candidates[0];
    const targetIndex = nodePool.findIndex((item) => item.node_id === target.node.node_id);
    const sourceIndex = (targetIndex + index + 3) % nodePool.length;
    const sourceNode =
      nodePool[sourceIndex].node_id === target.node.node_id
        ? nodePool[(sourceIndex + 1) % nodePool.length]
        : nodePool[sourceIndex];

    target.used_cpu_cores += pod.cpu_cores;
    target.used_memory_gb += pod.memory_gb;
    target.used_gpu += pod.gpu_count;

    const gpuType = normalizeGpuType(target.node.gpu_model);
    const durationReference = durationStats[gpuType] || durationStats.MISC || { duration: 420, wait: 18 };
    const qosFactor = QOS_FACTOR[pod.qos] || 1;
    const allocatedBandwidth = round(
      (pod.cpu_cores * 12 + pod.memory_gb * 2.8 + Math.max(1, pod.gpu_count) * 165) *
        qosFactor *
        (0.92 + pseudoBetween(`${pod.task_id}:bandwidth`, 0, 0.16)),
      0,
    );
    const allocatedStorage = round(
      pod.memory_gb * 1.6 +
        Math.max(0, pod.gpu_count) * 42 +
        pseudoBetween(`${pod.task_id}:storage`, 24, 86),
    );

    const postCpuUtil = (target.used_cpu_cores / target.node.cpu_capacity_cores) * 100;
    const postMemoryUtil = (target.used_memory_gb / target.node.memory_capacity_gb) * 100;
    const postGpuUtil = (target.used_gpu / target.node.gpu_capacity) * 100;
    const loadBalanceScore = clamp(
      98 -
        Math.abs(postCpuUtil - 70) * 0.22 -
        Math.abs(postMemoryUtil - 68) * 0.18 -
        Math.abs(postGpuUtil - 72) * 0.16 -
        pod.wait_time_sec / 2400,
      72,
      97,
    );

    const allocation = {
      id: `alloc-${String(allocations.length + 1).padStart(3, '0')}`,
      task: `task-${pod.task_id.slice(-4)}`,
      node: target.node.hostname,
      cpu: round(pod.cpu_cores, 1),
      memory: round(pod.memory_gb, 1),
      gpu: pod.gpu_count,
      score: Math.round(loadBalanceScore),
      job_id: `job-${String(index + 1).padStart(4, '0')}`,
      task_id: pod.task_id,
      source_node_id: sourceNode.node_id,
      source_ip: sourceNode.ip,
      target_node_id: target.node.node_id,
      target_ip: target.node.ip,
      qos: pod.qos,
      gpu_type: target.node.gpu_model,
      allocated_cpu: round(pod.cpu_cores, 1),
      allocated_gpu: pod.gpu_count,
      allocated_memory_gb: round(pod.memory_gb, 1),
      allocated_bandwidth_mbps: allocatedBandwidth,
      allocated_storage_gb: allocatedStorage,
      wait_time_sec: Math.round(Math.max(durationReference.wait * 0.35, pod.wait_time_sec)),
      estimated_finish_time_sec: Math.round(
        Math.max(durationReference.duration * 0.35 + pod.run_time_sec * 0.65, pod.run_time_sec),
      ),
      load_balance_score: round(loadBalanceScore, 1),
      queue_level: loadBalanceScore >= 90 ? 'stable' : loadBalanceScore >= 82 ? 'busy' : 'high',
    };

    target.allocations.push(allocation);
    allocations.push(allocation);
  });

  return { allocations, nodeStates };
}

function buildNodeSnapshots(nodeStates) {
  const summaries = nodeStates.map((state, index) => {
    const allocationCpu = state.allocations.reduce((sum, allocation) => sum + allocation.allocated_cpu, 0);
    const allocationMemory = state.allocations.reduce(
      (sum, allocation) => sum + allocation.allocated_memory_gb,
      0,
    );
    const allocationStorage = state.allocations.reduce(
      (sum, allocation) => sum + allocation.allocated_storage_gb,
      0,
    );
    const allocationBandwidth = state.allocations.reduce(
      (sum, allocation) => sum + allocation.allocated_bandwidth_mbps,
      0,
    );
    const baseCpu = pseudoBetween(`${state.node.node_id}:cpu-base`, 14, 28);
    const baseMemory = pseudoBetween(`${state.node.node_id}:memory-base`, 24, 36);
    const baseGpu = pseudoBetween(`${state.node.node_id}:gpu-base`, 8, 18);

    const cpuUsage = clamp(baseCpu + (allocationCpu / state.node.cpu_capacity_cores) * 100 * 0.82, 6, 96);
    const memoryUsage = clamp(
      baseMemory + (allocationMemory / state.node.memory_capacity_gb) * 100 * 0.86,
      10,
      97,
    );
    const gpuUsage = clamp(baseGpu + (state.used_gpu / state.node.gpu_capacity) * 100 * 0.84, 0, 100);
    const diskTotal = round(Math.max(960, state.node.memory_capacity_gb * 7.5), 1);
    const diskUsed = round(
      clamp(
        diskTotal * pseudoBetween(`${state.node.node_id}:disk-base`, 0.18, 0.34) + allocationStorage * 0.58,
        0,
        diskTotal * 0.97,
      ),
      1,
    );
    const diskUsage = clamp((diskUsed / diskTotal) * 100, 8, 98);
    const processCount = Math.round(120 + state.allocations.length * 18 + cpuUsage * 3.3);
    const portCount = Math.round(50 + state.allocations.length * 7 + allocationBandwidth / 95);
    const hostCount = 1 + Math.floor(index / 6);
    const status =
      cpuUsage > 88 || memoryUsage > 86 || gpuUsage > 92 ? 'warning' : 'online';

    return {
      node_id: state.node.node_id,
      hostname: state.node.hostname,
      ip: state.node.ip,
      status,
      cpu: round(cpuUsage, 1),
      memory: round(memoryUsage, 1),
      disk: round(diskUsage, 1),
      gpu: round(gpuUsage, 1),
      process_count: processCount,
      port_count: portCount,
      host_count: hostCount,
      rack_id: state.node.rack_id,
      zone: state.node.zone,
      gpu_model: state.node.gpu_model,
      cpu_capacity_cores: state.node.cpu_capacity_cores,
      memory_capacity_gb: state.node.memory_capacity_gb,
      gpu_capacity: state.node.gpu_capacity,
    };
  });

  const dashboards = summaries.map((summary) => {
    const gpuMemoryTotal = gpuMemoryPerCard(summary.gpu_model) * Math.max(1, summary.gpu_capacity);
    const gpuMemoryUsed = round((summary.gpu / 100) * gpuMemoryTotal, 1);
    const memoryUsed = round((summary.memory / 100) * summary.memory_capacity_gb, 1);
    const diskTotal = round(Math.max(960, summary.memory_capacity_gb * 7.5), 1);
    const diskUsed = round((summary.disk / 100) * diskTotal, 1);
    const cpuSystem = round(
      clamp(summary.cpu * pseudoBetween(`${summary.node_id}:sys`, 0.36, 0.48), 2, 90),
      1,
    );
    const cpuUser = round(
      clamp(summary.cpu * pseudoBetween(`${summary.node_id}:usr`, 0.48, 0.64), 2, 94),
      1,
    );

    return {
      node_id: summary.node_id,
      cpu_total_usage: summary.cpu,
      cpu_system_usage: cpuSystem,
      cpu_user_usage: cpuUser,
      gpu_usage: summary.gpu,
      gpu_memory_total_gb: round(gpuMemoryTotal, 1),
      gpu_memory_used_gb: gpuMemoryUsed,
      memory_usage_percent: summary.memory,
      memory_total_gb: summary.memory_capacity_gb,
      memory_used_gb: memoryUsed,
      disk_total_gb: diskTotal,
      disk_used_gb: diskUsed,
      disk_available_gb: round(Math.max(0, diskTotal - diskUsed), 1),
    };
  });

  const histories = summaries.map((summary) => {
    const labels = createRecentMinuteLabels(60);
    const phase = pseudoBetween(`${summary.node_id}:phase`, 0, Math.PI * 2);
    const cpuSystemUsage = [];
    const cpuUserUsage = [];
    const cpuUsage = [];
    const gpuUsage = [];
    const memoryUsage = [];

    for (let index = 0; index < 60; index += 1) {
      const progress = index / 59;
      const wave = Math.sin(progress * Math.PI * 3 + phase);
      const secondaryWave = Math.cos(progress * Math.PI * 4 + phase / 2);
      const totalCpu = round(clamp(summary.cpu + wave * 8 + secondaryWave * 3, 4, 98), 1);
      const systemCpu = round(clamp(totalCpu * 0.42 + secondaryWave * 1.8, 2, 92), 1);
      const userCpu = round(clamp(totalCpu * 0.58 + wave * 1.4, 2, 95), 1);
      const totalGpu = round(clamp(summary.gpu + wave * 7.5, 0, 100), 1);
      const totalMemory = round(clamp(summary.memory + secondaryWave * 4.8, 10, 98), 1);

      cpuUsage.push(totalCpu);
      cpuSystemUsage.push(systemCpu);
      cpuUserUsage.push(userCpu);
      gpuUsage.push(totalGpu);
      memoryUsage.push(totalMemory);
    }

    cpuUsage[cpuUsage.length - 1] = summary.cpu;
    gpuUsage[gpuUsage.length - 1] = summary.gpu;
    memoryUsage[memoryUsage.length - 1] = summary.memory;

    return {
      node_id: summary.node_id,
      period: '1h',
      labels,
      cpu_system_usage: cpuSystemUsage,
      cpu_user_usage: cpuUserUsage,
      cpu_usage: cpuUsage,
      gpu_usage: gpuUsage,
      memory_usage: memoryUsage,
    };
  });

  return { summaries, dashboards, histories };
}

function buildOverview(summaries) {
  const topNodes = [...summaries]
    .sort((left, right) => right.process_count - left.process_count)
    .slice(0, 5)
    .map((summary) => ({
      node_id: summary.node_id,
      hostname: summary.hostname,
      process_count: summary.process_count,
      port_count: summary.port_count,
    }));

  return {
    process_total: summaries.reduce((sum, item) => sum + item.process_count, 0),
    port_total: summaries.reduce((sum, item) => sum + item.port_count, 0),
    host_total: summaries.reduce((sum, item) => sum + item.host_count, 0),
    top_nodes: topNodes,
  };
}

function buildTraffic(allocations) {
  const flowMap = new Map();
  const protocolTotals = {
    TCP: 0,
    UDP: 0,
    RDMA: 0,
  };

  allocations.forEach((allocation) => {
    const flowKey = `${allocation.source_ip}|${allocation.target_ip}`;
    flowMap.set(flowKey, (flowMap.get(flowKey) || 0) + allocation.allocated_bandwidth_mbps);

    if (allocation.qos === 'LS') {
      protocolTotals.RDMA += allocation.allocated_bandwidth_mbps * 0.52;
      protocolTotals.TCP += allocation.allocated_bandwidth_mbps * 0.33;
      protocolTotals.UDP += allocation.allocated_bandwidth_mbps * 0.15;
    } else if (allocation.qos === 'BE') {
      protocolTotals.TCP += allocation.allocated_bandwidth_mbps * 0.56;
      protocolTotals.UDP += allocation.allocated_bandwidth_mbps * 0.28;
      protocolTotals.RDMA += allocation.allocated_bandwidth_mbps * 0.16;
    } else {
      protocolTotals.TCP += allocation.allocated_bandwidth_mbps * 0.48;
      protocolTotals.UDP += allocation.allocated_bandwidth_mbps * 0.18;
      protocolTotals.RDMA += allocation.allocated_bandwidth_mbps * 0.34;
    }
  });

  const flowEntries = [...flowMap.entries()]
    .map(([key, value]) => {
      const [source, target] = key.split('|');
      return { source, target, value: Math.round(value) };
    })
    .sort((left, right) => right.value - left.value)
    .slice(0, 12);

  const nodeNames = new Set();
  flowEntries.forEach((entry) => {
    nodeNames.add(entry.source);
    nodeNames.add(entry.target);
  });

  const sankey = {
    nodes: [...nodeNames].map((name) => ({ name })),
    links: flowEntries,
  };

  const protocolPie = Object.entries(protocolTotals)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((left, right) => right.value - left.value);

  const multipliers = [0.78, 0.84, 0.9, 0.97, 1.03, 1.08];
  const labels = ['T-5h', 'T-4h', 'T-3h', 'T-2h', 'T-1h', 'T-0h'];

  return {
    trafficSankey: {
      sankey,
      protocol_pie: protocolPie,
    },
    trafficLines: {
      labels,
      series: [
        {
          name: 'TCP ingress',
          data: multipliers.map((multiplier) => Math.round(protocolTotals.TCP * 0.16 * multiplier)),
          color: '#1677ff',
        },
        {
          name: 'TCP egress',
          data: multipliers.map((multiplier) => Math.round(protocolTotals.TCP * 0.13 * multiplier)),
          color: '#52c41a',
        },
        {
          name: 'RDMA sync',
          data: multipliers.map((multiplier) => Math.round(protocolTotals.RDMA * 0.18 * multiplier)),
          color: '#faad14',
        },
      ],
    },
  };
}

function buildStrategyComparison(allocations, summaries) {
  const completionBaseline = average(
    allocations.map((allocation) => allocation.wait_time_sec + allocation.estimated_finish_time_sec),
  );
  const utilizationBaseline = average(
    summaries.map((summary) => average([summary.cpu, summary.memory, summary.gpu])),
  );

  return {
    xData: ['Round Robin', 'Random', 'Greedy', 'RL Scheduler'],
    avg_completion_time: [
      Math.round(completionBaseline * 1.24),
      Math.round(completionBaseline * 1.16),
      Math.round(completionBaseline * 0.96),
      Math.round(completionBaseline * 0.83),
    ],
    resource_utilization: [
      round(clamp(utilizationBaseline * 0.86, 45, 78)),
      round(clamp(utilizationBaseline * 0.91, 48, 82)),
      round(clamp(utilizationBaseline * 1.03, 55, 88)),
      round(clamp(utilizationBaseline * 1.11, 62, 93)),
    ],
    load_balance_score: [72, 68, 83, 91],
  };
}

function writeJson(fileName, payload) {
  const filePath = path.join(DATASET_DIR, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function main() {
  ensureDir(DATASET_DIR);

  const updatedAt = Math.floor(Date.now() / 1000);
  const nodeRows = readCsv(SOURCE_PATHS.nodes);
  const podRows = readCsv(SOURCE_PATHS.pods);
  const jobDurationRows = readCsv(SOURCE_PATHS.jobDurations);

  const nodePool = pickNodePool(nodeRows);
  const podFacts = buildPodFacts(podRows);
  const durationStats = buildDurationStats(jobDurationRows);
  const { dayPrediction, monthPrediction } = buildPredictionSeries(podFacts);
  const { allocations, nodeStates } = buildAllocationRecords(nodePool, podFacts, durationStats);
  const { summaries, dashboards, histories } = buildNodeSnapshots(nodeStates);
  const nodesOverview = buildOverview(summaries);
  const { trafficSankey, trafficLines } = buildTraffic(allocations);
  const strategyComparison = buildStrategyComparison(allocations, summaries);
  const withUpdatedAt = (payload) => ({ ...payload, updated_at: updatedAt });

  writeJson('dataset_manifest.json', {
    version: 'prediction-allocation-v1',
    generated_at: new Date().toISOString(),
    generated_by: 'scripts/generate_prediction_allocation_dataset.js',
    source_files: [
      'clusterdata-master/cluster-trace-gpu-v2023/csv/openb_node_list_gpu_node.csv',
      'clusterdata-master/cluster-trace-gpu-v2023/csv/openb_pod_list_default.csv',
      'clusterdata-master/cluster-trace-gpu-v2020/simulator/traces/pai/pai_job_duration_estimate_100K.csv',
    ],
    derived_counts: {
      source_nodes: nodeRows.length,
      source_pods: podRows.length,
      selected_nodes: nodePool.length,
      selected_allocations: allocations.length,
    },
    synthetic_dimensions: [
      'pseudo ip mapping',
      'allocated bandwidth',
      'allocated storage',
      'node traffic flow',
      'load balance score',
      'strategy comparison',
      'time-series prediction smoothing',
    ],
  });

  writeJson('daily_prediction.json', withUpdatedAt(dayPrediction));
  writeJson('monthly_prediction.json', withUpdatedAt(monthPrediction));
  writeJson('allocation_results.json', withUpdatedAt({ results: allocations }));
  writeJson('strategy_comparison.json', withUpdatedAt(strategyComparison));
  writeJson('nodes.json', withUpdatedAt({ nodes: summaries }));
  writeJson('nodes_overview.json', withUpdatedAt(nodesOverview));
  writeJson(
    'node_dashboards.json',
    withUpdatedAt({ dashboards: keyBy(dashboards, (item) => item.node_id) }),
  );
  writeJson(
    'node_histories.json',
    withUpdatedAt({ histories: keyBy(histories, (item) => item.node_id) }),
  );
  writeJson('traffic_sankey.json', withUpdatedAt(trafficSankey));
  writeJson('traffic_lines.json', withUpdatedAt(trafficLines));

  console.log(`Generated prediction-allocation dataset with ${allocations.length} allocations.`);
}

main();
