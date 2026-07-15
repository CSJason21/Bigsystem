from __future__ import annotations

from math import ceil
from pathlib import Path

import numpy as np
import pandas as pd


DATASET_DIR = Path(__file__).resolve().parents[1] / "dataset"
OUTPUT_DIR = DATASET_DIR
RNG = np.random.default_rng(20260410)
TIME_STEPS = 1440
TIME_FREQ = "5s"
WINDOW_DURATION = pd.Timedelta(hours=2)
NODE_CONFIGS = [
    {"node_id": "Node_1999", "node_name": "Alpha", "cpu_scale": 1.0, "memory_scale": 1.0, "with_noise": False},
    {"node_id": "Node_0008", "node_name": "Beta", "cpu_scale": 0.7, "memory_scale": 0.7, "with_noise": True},
    {"node_id": "Node_0042", "node_name": "Gamma", "cpu_scale": 1.3, "memory_scale": 1.3, "with_noise": True},
]


def resolve_input_files() -> dict[str, Path]:
    """兼容需求描述和当前目录中真实存在的文件名。"""
    server_path = DATASET_DIR / "server_monitor.csv"
    trace_path = DATASET_DIR / "disaggregated_DLRM_trace.csv"

    macro_candidates = [
        DATASET_DIR / "Load_Balancing_Dataset.csv",
        DATASET_DIR / "Load_Balancing_Dataset_with_Tasks.csv",
    ]
    macro_path = next((path for path in macro_candidates if path.exists()), None)

    if not server_path.exists():
        raise FileNotFoundError(f"未找到探针数据文件: {server_path}")
    if not trace_path.exists():
        raise FileNotFoundError(f"未找到任务流数据文件: {trace_path}")
    if macro_path is None:
        raise FileNotFoundError("未找到宏观 KPI 数据文件: Load_Balancing_Dataset*.csv")

    return {
        "server": server_path,
        "trace": trace_path,
        "macro": macro_path,
    }


def round_numeric_columns(df: pd.DataFrame, digits: int = 2) -> pd.DataFrame:
    numeric_columns = df.select_dtypes(include=["number"]).columns
    df.loc[:, numeric_columns] = df.loc[:, numeric_columns].round(digits)
    return df


def load_seed_monitor(server_path: Path) -> tuple[pd.DataFrame, pd.Timestamp]:
    df = pd.read_csv(server_path, parse_dates=["Timestamp"]).sort_values("Timestamp").reset_index(drop=True)
    t_start = df.loc[0, "Timestamp"]
    window_end = t_start + WINDOW_DURATION
    raw_window = df[(df["Timestamp"] >= t_start) & (df["Timestamp"] < window_end)].copy()

    # 中文说明：
    # 原始探针在首个 2 小时窗口内存在长时间空洞，无法直接形成约 1440 个 5 秒时间步。
    # 因此优先使用首个 2 小时内的数据；若样本不足，则回退为抽取最早的 1440 条真实样本，
    # 再将这些样本重映射到从 T_start 开始的连续 5 秒时间轴上。
    if len(raw_window) >= TIME_STEPS:
        seed = raw_window.head(TIME_STEPS).copy()
    else:
        seed = df.head(TIME_STEPS).copy()

    time_axis = pd.date_range(start=t_start, periods=TIME_STEPS, freq=TIME_FREQ)
    seed = seed.reset_index(drop=True)
    seed["timestamp"] = time_axis

    rename_map = {
        "CPU_Usage_%": "cpu_usage_pct",
        "Memory_Usage_%": "memory_usage_pct",
        "Memory_Used_MB": "memory_used_mb",
        "Disk_Usage_%": "disk_usage_pct",
        "Net_In_KB/s": "net_in_kbps",
        "Net_Out_KB/s": "net_out_kbps",
        "gpu_0_util_%": "gpu_0_util_pct",
        "gpu_1_util_%": "gpu_1_util_pct",
        "gpu_2_util_%": "gpu_2_util_pct",
        "gpu_3_util_%": "gpu_3_util_pct",
    }
    seed = seed.rename(columns=rename_map).drop(columns=["Timestamp"])

    safe_memory_ratio = seed["memory_usage_pct"].replace(0, np.nan) / 100.0
    seed["memory_total_mb"] = (seed["memory_used_mb"] / safe_memory_ratio).fillna(seed["memory_used_mb"])

    return seed, t_start


def add_network_metrics(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["jitterMs"] = RNG.uniform(2, 10, size=len(df))
    df["packetLoss"] = 0.0
    high_cpu_mask = df["cpu_usage_pct"] > 90
    if high_cpu_mask.any():
        df.loc[high_cpu_mask, "packetLoss"] = RNG.uniform(0.5, 2.0, size=int(high_cpu_mask.sum()))
    return df


def build_node_monitor(seed_monitor: pd.DataFrame) -> pd.DataFrame:
    node_frames: list[pd.DataFrame] = []

    for config in NODE_CONFIGS:
        node_df = seed_monitor.copy()

        # 中文说明：
        # 仅对 CPU / 内存相关指标做克隆变异，其他 GPU / 磁盘 / 网络吞吐指标沿用真实探针值，
        # 以保持数据整体分布稳定，同时补充前端需要的网络抖动与丢包指标。
        if config["with_noise"]:
            cpu_noise = RNG.uniform(-3, 3, size=len(node_df))
            mem_noise = RNG.uniform(-3, 3, size=len(node_df))
        else:
            cpu_noise = np.zeros(len(node_df))
            mem_noise = np.zeros(len(node_df))

        node_df["cpu_usage_pct"] = np.clip(
            node_df["cpu_usage_pct"] * config["cpu_scale"] + cpu_noise,
            0,
            100,
        )
        node_df["memory_usage_pct"] = np.clip(
            node_df["memory_usage_pct"] * config["memory_scale"] + mem_noise,
            0,
            100,
        )
        node_df["memory_used_mb"] = node_df["memory_total_mb"] * node_df["memory_usage_pct"] / 100.0
        node_df["node_id"] = config["node_id"]
        node_df["node_name"] = config["node_name"]
        node_df = add_network_metrics(node_df)
        node_frames.append(node_df)

    nodes_monitor = pd.concat(node_frames, ignore_index=True)
    nodes_monitor = nodes_monitor.drop(columns=["memory_total_mb"])

    ordered_columns = [
        "timestamp",
        "node_id",
        "node_name",
        "cpu_usage_pct",
        "memory_usage_pct",
        "memory_used_mb",
        "disk_usage_pct",
        "net_in_kbps",
        "net_out_kbps",
        "jitterMs",
        "packetLoss",
        "gpu_0_util_pct",
        "gpu_0_mem_used_mb",
        "gpu_0_mem_total_mb",
        "gpu_1_util_pct",
        "gpu_1_mem_used_mb",
        "gpu_1_mem_total_mb",
        "gpu_2_util_pct",
        "gpu_2_mem_used_mb",
        "gpu_2_mem_total_mb",
        "gpu_3_util_pct",
        "gpu_3_mem_used_mb",
        "gpu_3_mem_total_mb",
    ]
    return round_numeric_columns(nodes_monitor.loc[:, ordered_columns])


def choose_target_node(cpu_request: float) -> str:
    """CPU 请求越高，越倾向分配到高负载的 Gamma 节点。"""
    normalized = min(max(cpu_request / 192.0, 0.0), 1.0)
    weights = np.array(
        [
            0.40 - 0.10 * normalized,  # Node_1999
            0.35 - 0.20 * normalized,  # Node_0008
            0.25 + 0.30 * normalized,  # Node_0042
        ]
    )
    weights = weights / weights.sum()
    return RNG.choice(
        ["Node_1999", "Node_0008", "Node_0042"],
        p=weights,
    )


def build_task_trace(trace_path: Path, t_start: pd.Timestamp, window_end: pd.Timestamp) -> pd.DataFrame:
    trace_df = pd.read_csv(trace_path)
    trace_df["scheduled_time"] = pd.to_numeric(trace_df["scheduled_time"], errors="coerce")
    trace_df["deletion_time"] = pd.to_numeric(trace_df["deletion_time"], errors="coerce")
    trace_df["cpu_request"] = pd.to_numeric(trace_df["cpu_request"], errors="coerce")

    trace_df = trace_df[trace_df["scheduled_time"].notna()].copy()
    min_time = trace_df["scheduled_time"].min()

    # 中文说明：
    # 先把相对时间戳映射到绝对物理时间：
    # 真实时间 = T_start + (原始时间 - min_time)
    trace_df["scheduled_at"] = t_start + pd.to_timedelta(trace_df["scheduled_time"] - min_time, unit="s")

    duration_pool = (trace_df["deletion_time"] - trace_df["scheduled_time"]).dropna()
    duration_pool = duration_pool[duration_pool > 0].clip(lower=300, upper=3600)
    if duration_pool.empty:
        duration_pool = pd.Series([1800.0])

    missing_deletion_mask = trace_df["deletion_time"].isna() | (
        trace_df["deletion_time"] <= trace_df["scheduled_time"]
    )
    sampled_durations = RNG.choice(duration_pool.to_numpy(), size=int(missing_deletion_mask.sum()), replace=True)
    trace_df.loc[missing_deletion_mask, "deletion_time"] = (
        trace_df.loc[missing_deletion_mask, "scheduled_time"].to_numpy() + sampled_durations
    )
    trace_df["deletion_at"] = t_start + pd.to_timedelta(trace_df["deletion_time"] - min_time, unit="s")

    filtered = trace_df[
        (trace_df["scheduled_at"] < window_end) & (trace_df["deletion_at"] > t_start)
    ].copy()

    filtered["target_node_id"] = filtered["cpu_request"].apply(choose_target_node)
    filtered["task_id"] = filtered["instance_sn"]
    filtered["duration_sec"] = (
        (filtered["deletion_at"] - filtered["scheduled_at"]).dt.total_seconds().clip(lower=0).round(0)
    )

    output_columns = [
        "task_id",
        "target_node_id",
        "role",
        "app_name",
        "cpu_request",
        "cpu_limit",
        "gpu_request",
        "gpu_limit",
        "rdma_request",
        "rdma_limit",
        "memory_request",
        "memory_limit",
        "disk_request",
        "disk_limit",
        "max_instance_per_node",
        "scheduled_time",
        "deletion_time",
        "scheduled_at",
        "deletion_at",
        "duration_sec",
    ]
    return round_numeric_columns(filtered.loc[:, output_columns].sort_values("scheduled_at").reset_index(drop=True))


def build_global_kpi(
    macro_path: Path,
    node_monitor_df: pd.DataFrame,
    t_start: pd.Timestamp,
) -> pd.DataFrame:
    time_axis = pd.date_range(start=t_start, periods=TIME_STEPS, freq=TIME_FREQ)
    macro_df = pd.read_csv(macro_path)
    macro_df = macro_df.rename(columns={"No. of Tasks": "task_count"})

    repeat_times = ceil(TIME_STEPS / len(macro_df))
    macro_df = pd.concat([macro_df] * repeat_times, ignore_index=True).head(TIME_STEPS).copy()
    macro_df["timestamp"] = time_axis

    cpu_pivot = (
        node_monitor_df.pivot(index="timestamp", columns="node_id", values="cpu_usage_pct")
        .reindex(time_axis)
        .sort_index()
    )

    # 中文说明：
    # 宏观大盘里的 cpu_utilization 和 load_variance 以 3 个虚拟节点的同刻 CPU 数据为准重算，
    # 覆盖掉原始 CSV 中的同名列，使其和节点监控视图严格一致。
    macro_df["cpu_utilization"] = cpu_pivot.mean(axis=1).to_numpy()
    macro_df["load_variance"] = cpu_pivot.std(axis=1, ddof=0).to_numpy()

    ordered_columns = [
        "timestamp",
        "response_time",
        "throughput",
        "cpu_utilization",
        "load_variance",
        "cpu_capacity",
        "memory_capacity",
        "storage_capacity",
        "bandwidth",
        "task_size",
        "cpu_demand",
        "memory_demand",
        "io_demand",
        "arrival_time",
        "execution_time",
        "priority",
        "reliability_score",
        "scheduling_overhead",
        "makespan",
        "memory_utilization",
        "storage_utilization",
        "task_count",
    ]
    return round_numeric_columns(macro_df.loc[:, ordered_columns])


def export_json(df: pd.DataFrame, output_path: Path) -> None:
    output_path.write_text(
        df.to_json(orient="records", date_format="iso", force_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> None:
    files = resolve_input_files()
    seed_monitor, t_start = load_seed_monitor(files["server"])
    window_end = t_start + WINDOW_DURATION

    nodes_monitor = build_node_monitor(seed_monitor)
    task_trace = build_task_trace(files["trace"], t_start=t_start, window_end=window_end)
    global_kpi = build_global_kpi(files["macro"], node_monitor_df=nodes_monitor, t_start=t_start)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    export_json(nodes_monitor, OUTPUT_DIR / "nodes_monitor.json")
    export_json(task_trace, OUTPUT_DIR / "task_trace.json")
    export_json(global_kpi, OUTPUT_DIR / "global_kpi.json")

    print(f"T_start: {t_start}")
    print(f"nodes_monitor rows: {len(nodes_monitor)}")
    print(f"task_trace rows: {len(task_trace)}")
    print(f"global_kpi rows: {len(global_kpi)}")
    print(f"output dir: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
