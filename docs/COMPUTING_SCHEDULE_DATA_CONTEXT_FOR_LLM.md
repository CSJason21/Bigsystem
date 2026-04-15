# Computing Schedule Data Context For LLM

## 1. Purpose

This document explains the computing-schedule data-mocking pipeline in a form that another LLM can continue from quickly.

The pipeline reads 3 unrelated CSV files, aligns them onto one shared demo timeline, and exports 3 JSON files for direct frontend use.

Scope:

- input files under `dataset/`
- generator script `scripts/generate_mock_json_datasets.py`
- generated output JSON under `dataset/`

## 2. Files that matter

Inputs:

- `dataset/server_monitor.csv`
- `dataset/disaggregated_DLRM_trace.csv`
- `dataset/Load_Balancing_Dataset_with_Tasks.csv`

Outputs:

- `dataset/nodes_monitor.json`
- `dataset/task_trace.json`
- `dataset/global_kpi.json`

Implementation:

- `scripts/generate_mock_json_datasets.py`

Human-oriented explanation:

- the Chinese dataset delivery note under `docs/`

## 3. Problem being solved

The 3 input CSV files do not align naturally:

- `server_monitor.csv` has real timestamps but represents one node
- `disaggregated_DLRM_trace.csv` uses relative timestamps
- `Load_Balancing_Dataset_with_Tasks.csv` has KPI-like records but no timestamp column

The frontend needs one coherent, fixed-window dataset. This script creates that dataset.

## 4. Output contract

All generated outputs are synchronized around the same timeline.

Fixed constraints:

- window length: 2 hours
- time granularity: 5 seconds
- timeline length: 1440 steps
- datetime output: ISO format
- JSON layout: `orient='records'`
- random seed: `20260410`

## 5. Shared time base

`T_start` is the first timestamp in `dataset/server_monitor.csv`.

That timestamp is treated as the absolute physical start time for all generated data.

Every output dataset is aligned to this shared time base.

## 6. Seed monitor handling

The generator first loads `server_monitor.csv` as the real telemetry seed.

Desired behavior:

- use the first 2 hours of real telemetry directly

Actual issue:

- the early portion of the file has a gap, so the first 2-hour slice does not contain enough rows to form a dense 5-second series

Implemented fallback:

1. try the first 2-hour real window
2. if that window has fewer than 1440 rows, take the earliest 1440 telemetry rows from the file
3. remap those rows onto a synthetic continuous 5-second timeline starting at `T_start`

This is a controlled frontend-oriented compromise, not a strict replay of real timestamps.

Relevant function:

- `load_seed_monitor()`

## 7. Node monitor generation

One real seed node is used:

- `Node_1999`
- display name: `Alpha`

Two synthetic nodes are cloned from it:

- `Node_0008` / `Beta`
- `Node_0042` / `Gamma`

Mutation rules:

- `Alpha`: keep original CPU and memory values
- `Beta`: lower-load mutation
- `Gamma`: higher-load mutation

Exact CPU / memory behavior:

- `Beta = Alpha * 0.7 + uniform noise[-3, 3]`
- `Gamma = Alpha * 1.3 + uniform noise[-3, 3]`
- values are clipped to `[0, 100]`

Additional synthesized fields:

- `jitterMs`: random float in `[2, 10]`
- `packetLoss`: `0` normally, random in `[0.5, 2.0]` when `cpu_usage_pct > 90`

Other dimensions such as GPU, disk, and throughput remain close to the seed values to keep the overall profile realistic.

Relevant functions:

- `build_node_monitor()`
- `add_network_metrics()`

## 8. Task trace alignment

`disaggregated_DLRM_trace.csv` uses relative task time.

Alignment formula:

```text
absolute_time = T_start + (raw_time - min_scheduled_time)
```

Where:

- `min_scheduled_time` is the minimum valid `scheduled_time`
- `scheduled_at` is the mapped absolute start time
- `deletion_at` is the mapped absolute end time

Window filter:

- keep tasks that overlap the 2-hour demo window

Deletion-time repair:

- if `deletion_time` is missing or invalid, sample a replacement duration from valid historical durations
- sampled durations are clipped to 300 to 3600 seconds

Relevant function:

- `build_task_trace()`

## 9. Task-to-node binding

Each task receives a synthetic `target_node_id`.

This is not reconstructed from a real scheduler log.

Current policy:

- higher `cpu_request` increases the probability of assigning the task to `Node_0042`
- lower and medium tasks are more likely to go to `Node_1999` or `Node_0008`

Implementation style:

- weighted random assignment
- deterministic across runs because the RNG seed is fixed

Relevant function:

- `choose_target_node()`

## 10. Global KPI generation

The macro KPI CSV has no timestamp, so the script generates one shared 5-second timeline and fills macro records in file order.

If the macro CSV is shorter than 1440 rows:

- loop the file until the timeline is full

Two fields are recomputed from the generated 3-node telemetry:

- `cpu_utilization`
- `load_variance`

Definitions:

- `cpu_utilization`: mean CPU utilization across the 3 nodes at the same timestamp
- `load_variance`: standard deviation of the 3-node CPU utilization at the same timestamp

This keeps node-level and global-level views consistent.

Relevant function:

- `build_global_kpi()`

## 11. Output schema summary

### `nodes_monitor.json`

One row per node per timestamp.

Important fields:

- `timestamp`
- `node_id`
- `node_name`
- `cpu_usage_pct`
- `memory_usage_pct`
- `memory_used_mb`
- `jitterMs`
- `packetLoss`

Expected size:

- `4320` rows

### `task_trace.json`

One row per task in the 2-hour aligned window.

Important fields:

- `task_id`
- `target_node_id`
- `cpu_request`
- `scheduled_at`
- `deletion_at`
- `duration_sec`

Expected size:

- depends on how many tasks overlap the aligned window

### `global_kpi.json`

One row per timestamp.

Important fields:

- `timestamp`
- `response_time`
- `throughput`
- `cpu_utilization`
- `load_variance`
- `task_count`

Expected size:

- `1440` rows

## 12. Function map

- `resolve_input_files()`
  - input file resolution and macro filename compatibility

- `load_seed_monitor()`
  - seed telemetry load and time-axis fallback logic

- `build_node_monitor()`
  - 3-node synthetic monitor generation

- `choose_target_node()`
  - weighted node assignment for tasks

- `build_task_trace()`
  - DLRM time alignment and cleanup

- `build_global_kpi()`
  - macro timeline fill and KPI recomputation

- `export_json()`
  - JSON writing

- `main()`
  - full orchestration

## 13. Safe changes

Usually safe:

- adjust noise ranges
- change node display names
- add extra derived fields
- tune the weighted assignment policy
- add validation or assertions

Risky unless frontend usage is checked first:

- changing field names
- changing timeline frequency
- changing the 2-hour window length
- changing output structure away from record arrays
- removing `target_node_id`
- removing `load_variance`

## 14. What another LLM should remember

If another model continues this module, the 4 most important facts are:

1. All 3 outputs share the same `T_start` and 5-second timeline.
2. `Node_1999` is the real seed; `Node_0008` and `Node_0042` are synthetic variants.
3. Task times are mapped from relative trace time into absolute demo time.
4. Global CPU KPIs are recomputed from generated node telemetry, not trusted from the macro CSV.
