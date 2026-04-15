# FL System Project Context For LLM

## 1. Project goal

This repository is a prototype system for reinforced federated learning and typical applications. It has a React + TypeScript frontend and a FastAPI backend.

The current high-priority page for data integration is:

- `src/pages/ComputingSchedule/PredictionAllocation/index.tsx`

This page is the owner page for collaborative prediction and allocation. It needs stable and repeatable data so the frontend can be refined and later connected to real APIs without changing the page structure again.

## 2. Key architecture

### Frontend

- Entry: `src/main.tsx`
- Routing: `src/router.tsx`
- Shared layout: `src/layouts/MainLayout.tsx`
- Shared charts: `src/components/Charts/*`
- Prediction/allocation data client: `src/services/api/predictionAllocation.ts`

### Backend

- App entry: `server/app/main.py`
- Prediction API: `server/app/api/routes/prediction.py`
- Allocation API: `server/app/api/routes/allocation.py`
- Dataset loader: `server/app/services/prediction_allocation_data.py`
- Dataset generator: `scripts/generate_prediction_allocation_dataset.js`
- Computing-schedule mock generator: `scripts/generate_mock_json_datasets.py`
- Settings: `server/app/core/config.py`

### Dataset Mocking Workstream

There is also a separate local data-mocking pipeline for the computing-schedule prototype.

Its purpose is different from the JSON-backed backend dataset above:

- it reads raw CSV files from `dataset/`
- it aligns timestamps across heterogeneous sources
- it synthesizes a small, stable 2-hour frontend demo dataset
- it writes JSON back to `dataset/` for direct frontend consumption

Primary files for this workstream:

- `scripts/generate_mock_json_datasets.py`
- `dataset/server_monitor.csv`
- `dataset/disaggregated_DLRM_trace.csv`
- `dataset/Load_Balancing_Dataset_with_Tasks.csv`
- `dataset/nodes_monitor.json`
- `dataset/task_trace.json`
- `dataset/global_kpi.json`
- the Chinese dataset delivery note under `docs/`
- `docs/COMPUTING_SCHEDULE_DATA_CONTEXT_FOR_LLM.md`

## 3. Dataset strategy

Primary source files:

- `clusterdata-master/cluster-trace-gpu-v2023/csv/openb_node_list_gpu_node.csv`
- `clusterdata-master/cluster-trace-gpu-v2023/csv/openb_pod_list_default.csv`

Supplemental source file:

- `clusterdata-master/cluster-trace-gpu-v2020/simulator/traces/pai/pai_job_duration_estimate_100K.csv`

Reason for this combination:

- `v2023` provides real node and pod resource structures.
- `v2020` trace sample provides realistic job duration and wait-time distribution.
- Some dimensions required by the UI do not exist directly in the source data, so they are synthesized in a controlled way:
  - pseudo IP mapping
  - bandwidth allocation
  - storage allocation
  - source-to-target traffic flow
  - load-balance score
  - strategy comparison

## 4. Generated data contract

Generated files are stored in:

- `server/app/data/prediction_allocation/`

Current generated files:

- `dataset_manifest.json`
- `daily_prediction.json`
- `monthly_prediction.json`
- `allocation_results.json`
- `strategy_comparison.json`
- `nodes.json`
- `nodes_overview.json`
- `node_dashboards.json`
- `node_histories.json`
- `traffic_sankey.json`
- `traffic_lines.json`

Important contract note:

- Existing API paths stay unchanged so the frontend does not need a routing refactor.
- Response payloads keep the old fields already used by the page.
- Additional fields are added for later frontend refinement.

## 5. PredictionAllocation page mapping

The page currently contains:

- daily demand prediction
- monthly demand prediction
- allocation table
- strategy comparison
- node monitor panel
- node overview
- traffic sankey
- traffic time-series chart

Backend route mapping:

- `/api/prediction/daily`
- `/api/prediction/monthly`
- `/api/allocation/results`
- `/api/allocation/strategy-comparison`
- `/api/allocation/nodes`
- `/api/allocation/nodes/overview`
- `/api/allocation/nodes/{node_id}/dashboard`
- `/api/allocation/nodes/{node_id}/history`
- `/api/allocation/traffic/sankey`
- `/api/allocation/traffic/lines`

## 6. Regeneration workflow

When the source CSV or frontend data contract changes, regenerate the dataset with:

```bash
node scripts/generate_prediction_allocation_dataset.js
```

After regeneration, the backend reads the new JSON from `server/app/data/prediction_allocation/`.
The loader reads files directly, so regenerated JSON can be picked up without changing route code.

For the computing-schedule mock pipeline, regenerate with:

```bash
python scripts/generate_mock_json_datasets.py
```

This writes:

- `dataset/nodes_monitor.json`
- `dataset/task_trace.json`
- `dataset/global_kpi.json`

These files are aligned to the same 2-hour window and 5-second timeline.

Important implementation notes for this pipeline:

- `T_start` comes from the first row of `dataset/server_monitor.csv`
- `Node_1999` is the real seed node
- `Node_0008` and `Node_0042` are synthetic variants derived from the seed
- DLRM task times are converted from relative time to absolute time
- global CPU KPIs are recomputed from the generated node telemetry, not trusted from the macro CSV

## 7. Update rule for future modifications

This file should be updated after each meaningful project change involving:

- page structure
- API contract
- dataset generation logic
- backend route changes
- core architectural decisions

Update checklist:

1. revise the affected architecture or contract section
2. refresh the latest update section below
3. keep file references accurate

## 8. Latest update

Date:

- 2026-04-13

Changes introduced in this update:

- added a deterministic prediction/allocation dataset generator
- generated a stable JSON dataset under `server/app/data/prediction_allocation/`
- switched prediction/allocation routes from random mock data to JSON-backed responses
- added a dedicated dataset loader that reads the latest files directly
- made backend settings parsing more robust for environment values like `DEBUG=release`
- documented the project structure and prediction/allocation data flow for future LLM-assisted edits
- added a Chinese delivery document for data fields, page display wording, and reporting usage
- added a separate Python-based computing-schedule mock data generator at `scripts/generate_mock_json_datasets.py`
- added aligned mock outputs under `dataset/`: `nodes_monitor.json`, `task_trace.json`, and `global_kpi.json`
- documented the computing-schedule CSV alignment and mock-data rules for future LLM handoff
