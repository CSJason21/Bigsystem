import os
import json
import threading
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Optional

# Redis 降级处理：本项目未启用 Redis，get_redis 返回 None
def get_redis():
    return None


DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "alibaba")
METRIC_FILE = os.path.normpath(os.path.join(DATA_DIR, "pai_machine_metric.csv"))

REDIS_KEY_PREFIX = "predict"

_lock = threading.Lock()
_loaded = False
_available_dates: list[str] = []
_daily_detail: dict[str, dict] = {}
_hourly_pattern: Optional[dict] = None


def _ensure_loaded():
    global _loaded
    if _loaded:
        return
    with _lock:
        if _loaded:
            return
        _load_data()
        _loaded = True


def _load_data():
    global _available_dates, _daily_detail, _hourly_pattern

    print("[AlibabaPredictor] Loading alibaba dataset...")

    if not os.path.exists(METRIC_FILE):
        print("[AlibabaPredictor] Data file not found, using fallback")
        _generate_fallback()
        return

    df = pd.read_csv(METRIC_FILE, usecols=["start_time", "machine_cpu", "machine_gpu"])
    valid = df[df["machine_cpu"].notna() & df["machine_gpu"].notna()].copy()

    if valid.empty:
        print("[AlibabaPredictor] No valid data found, using fallback")
        _generate_fallback()
        return

    t_min = int(valid["start_time"].min())
    base_epoch = t_min

    valid["hour_offset"] = ((valid["start_time"] - base_epoch) / 3600).astype(int)

    gpu_p95 = valid["machine_gpu"].quantile(0.95)
    if gpu_p95 <= 0:
        gpu_p95 = 100.0
    valid["gpu_pct"] = (valid["machine_gpu"] / gpu_p95 * 100).clip(0, 100)

    avg_cpu_max = valid["machine_cpu"].max()
    if avg_cpu_max <= 0:
        avg_cpu_max = 100.0
    valid["mem_pct"] = (
        25.0 + (valid["machine_cpu"] / avg_cpu_max) * 50.0
    ).clip(5, 95)

    hourly = (
        valid.groupby("hour_offset")
        .agg(cpu=("machine_cpu", "mean"), gpu=("gpu_pct", "mean"), mem=("mem_pct", "mean"))
        .reset_index()
    )

    base_dt = datetime(2026, 4, 30, 0, 0, 0)
    hourly["datetime"] = hourly["hour_offset"].apply(lambda h: base_dt + timedelta(hours=int(h)))
    hourly["date"] = hourly["datetime"].dt.strftime("%Y-%m-%d")
    hourly["time"] = hourly["datetime"].dt.strftime("%H:%M")
    hourly["hour"] = hourly["datetime"].dt.hour

    dates = sorted(hourly["date"].unique())
    _available_dates = dates

    daily_detail = {}
    for d in dates:
        day_data = hourly[hourly["date"] == d].sort_values("hour")
        if day_data.empty:
            continue
        daily_detail[d] = {
            "x": day_data["time"].tolist(),
            "cpu": [round(v, 1) for v in day_data["cpu"].tolist()],
            "gpu": [round(v, 1) for v in day_data["gpu"].tolist()],
            "mem": [round(v, 1) for v in day_data["mem"].tolist()],
        }

    _daily_detail = daily_detail

    pattern = hourly.groupby("hour").agg(cpu=("cpu", "mean"), gpu=("gpu", "mean"), mem=("mem", "mean")).reset_index()
    _hourly_pattern = {
        "cpu": pattern["cpu"].tolist(),
        "gpu": pattern["gpu"].tolist(),
        "mem": pattern["mem"].tolist(),
    }

    print(f"[AlibabaPredictor] Loaded {len(hourly)} hourly data points, {len(dates)} dates")


def _generate_fallback():
    global _available_dates, _daily_detail, _hourly_pattern

    now = datetime.now()
    dates = [(now - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(30, -1, -1)]
    _available_dates = sorted(dates)

    np.random.seed(42)
    daily_detail = {}
    for d in dates:
        times = [f"{h:02d}:00" for h in range(24)]
        base_cpu = 35 + 15 * np.sin(np.arange(24) * np.pi / 12)
        cpu = base_cpu + np.random.normal(0, 5, 24)
        gpu = 30 + 20 * np.sin(np.arange(24) * np.pi / 12 + 1) + np.random.normal(0, 5, 24)
        mem = 40 + 10 * np.sin(np.arange(24) * np.pi / 12 + 2) + np.random.normal(0, 3, 24)
        daily_detail[d] = {
            "x": times,
            "cpu": [round(max(0, min(100, v)), 1) for v in cpu],
            "gpu": [round(max(0, min(100, v)), 1) for v in gpu],
            "mem": [round(max(0, min(100, v)), 1) for v in mem],
        }

    _daily_detail = daily_detail
    _hourly_pattern = {
        "cpu": [round(max(0, min(100, 35 + 15 * np.sin(h * np.pi / 12))), 1) for h in range(24)],
        "gpu": [round(max(0, min(100, 30 + 20 * np.sin(h * np.pi / 12 + 1))), 1) for h in range(24)],
        "mem": [round(max(0, min(100, 40 + 10 * np.sin(h * np.pi / 12 + 2))), 1) for h in range(24)],
    }
    print("[AlibabaPredictor] Using fallback synthetic data")


# ─── Redis 缓存层 ───────────────────────────────────────────────

def _redis_key(date_str: str, hour: int) -> str:
    return f"{REDIS_KEY_PREFIX}:{date_str}:{hour:02d}"


async def _redis_set_hour(date_str: str, hour: int, data: dict):
    """将某天某小时的数据存入 Redis，永不过期"""
    redis = get_redis()
    if not redis:
        return
    try:
        payload = json.dumps(data, ensure_ascii=False)
        await redis.set(_redis_key(date_str, hour), payload)  # 无 ex 参数 = 永不过期
    except Exception as e:
        print(f"[Predictor] Redis SET failed: {e}")


async def _redis_get_day(date_str: str) -> dict[int, dict]:
    """一次性读取某天所有已缓存的小时数据"""
    redis = get_redis()
    if not redis:
        return {}
    result = {}
    try:
        pipe = redis.pipeline()
        for h in range(24):
            pipe.get(_redis_key(date_str, h))
        values = await pipe.execute()
        for h, raw in enumerate(values):
            if raw:
                result[h] = json.loads(raw)
    except Exception as e:
        print(f"[Predictor] Redis pipeline GET failed: {e}")
    return result


# ─── 预测算法 ────────────────────────────────────────────────────

def _exponential_smoothing(series: list[float], alpha: float = 0.3) -> list[float]:
    if not series:
        return []
    result = [series[0]]
    for i in range(1, len(series)):
        result.append(alpha * series[i] + (1 - alpha) * result[-1])
    return result


def _predict_current_hour(
    past_cpu: list[float], past_gpu: list[float], past_mem: list[float],
    current_hour: int,
) -> dict:
    """基于已有历史数据预测当前小时的值"""
    pattern = _hourly_pattern

    if past_cpu:
        cpu_val = past_cpu[-1] * 0.6 + (pattern["cpu"][current_hour] if pattern else 40) * 0.4 + np.random.normal(0, 1.5)
        gpu_val = past_gpu[-1] * 0.6 + (pattern["gpu"][current_hour] if pattern else 35) * 0.4 + np.random.normal(0, 1.5)
        mem_val = past_mem[-1] * 0.6 + (pattern["mem"][current_hour] if pattern else 45) * 0.4 + np.random.normal(0, 1.0)
    else:
        cpu_val = (pattern["cpu"][current_hour] if pattern else 40) + np.random.normal(0, 2)
        gpu_val = (pattern["gpu"][current_hour] if pattern else 35) + np.random.normal(0, 2)
        mem_val = (pattern["mem"][current_hour] if pattern else 45) + np.random.normal(0, 1.5)

    return {
        "cpu": round(max(2, min(98, cpu_val)), 1),
        "gpu": round(max(2, min(98, gpu_val)), 1),
        "mem": round(max(2, min(98, mem_val)), 1),
    }


def _predict_future_hours(
    history_cpu: list[float], history_gpu: list[float], history_mem: list[float],
    n_hours: int, alpha: float = 0.3,
) -> list[dict]:
    """基于历史数据预测未来 n 小时的值"""
    results = []

    if not history_cpu:
        for _ in range(n_hours):
            results.append({"cpu": 50.0, "gpu": 50.0, "mem": 50.0})
        return results

    for metric_name, history in [("cpu", history_cpu), ("gpu", history_gpu), ("mem", history_mem)]:
        smoothed = _exponential_smoothing(history, alpha)
        last_smoothed = smoothed[-1]
        n = len(history)
        recent_trend = 0.0
        if n >= 4:
            recent = history[-4:]
            x = np.arange(len(recent))
            coeffs = np.polyfit(x, recent, 1)
            recent_trend = coeffs[0] * 0.2

        for i in range(n_hours):
            if len(results) <= i:
                results.append({})
            val = last_smoothed + recent_trend * (i + 1) + np.random.normal(0, 1.0)
            results[i][metric_name] = round(max(2.0, min(98.0, val)), 1)

    return results


def _get_actual_hour_value(actual_data: Optional[dict], pattern: Optional[dict], hour: int, noise_scale: float = 0.5) -> dict:
    """从实际数据获取某小时的值，加微小波动"""
    if actual_data and hour < len(actual_data["cpu"]):
        return {
            "cpu": round(max(2, min(98, actual_data["cpu"][hour] + np.random.normal(0, noise_scale))), 1),
            "gpu": round(max(2, min(98, actual_data["gpu"][hour] + np.random.normal(0, noise_scale))), 1),
            "mem": round(max(2, min(98, actual_data["mem"][hour] + np.random.normal(0, noise_scale * 0.6))), 1),
        }
    elif pattern:
        return {
            "cpu": round(max(2, min(98, pattern["cpu"][hour] + np.random.normal(0, 2.0))), 1),
            "gpu": round(max(2, min(98, pattern["gpu"][hour] + np.random.normal(0, 2.0))), 1),
            "mem": round(max(2, min(98, pattern["mem"][hour] + np.random.normal(0, 1.5))), 1),
        }
    else:
        return {
            "cpu": round(max(2, min(98, 40 + np.random.normal(0, 5))), 1),
            "gpu": round(max(2, min(98, 35 + np.random.normal(0, 5))), 1),
            "mem": round(max(2, min(98, 45 + np.random.normal(0, 3))), 1),
        }


# ─── 公开接口 ────────────────────────────────────────────────────

def get_available_dates() -> list[str]:
    _ensure_loaded()
    today_str = datetime.now().strftime("%Y-%m-%d")
    return [d for d in _available_dates if d <= today_str]


async def get_realtime_prediction(date_str: str) -> dict:
    """
    实时预测指定日期的资源利用率（Redis 缓存版）。
    
    核心逻辑：
    1. 从 Redis 读取该日期已缓存的所有小时数据
    2. 对于当天：只预测当前小时，存入 Redis，未来小时实时预测
    3. 对于历史日期：首次加载时从数据集填充 Redis，后续直接读缓存
    4. Redis 数据永不过期
    """
    _ensure_loaded()

    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    current_hour = now.hour
    time_labels = [f"{h:02d}:00" for h in range(24)]

    # 从 Redis 批量读取该天已缓存数据
    cached_hours = await _redis_get_day(date_str)

    if date_str == today_str:
        return await _handle_today(date_str, time_labels, current_hour, cached_hours)
    elif date_str in _daily_detail:
        return await _handle_historical(date_str, time_labels, cached_hours)
    else:
        return _handle_unknown(date_str, time_labels)


async def _handle_today(date_str: str, time_labels: list[str], current_hour: int, cached_hours: dict) -> dict:
    """处理当天的实时预测"""
    actual_data = _daily_detail.get(date_str)
    pattern = _hourly_pattern

    # 已过去的小时：优先用 Redis 缓存，没有则从实际数据生成并存入 Redis
    past_cpu: list[float] = []
    past_gpu: list[float] = []
    past_mem: list[float] = []

    for h in range(current_hour):
        if h in cached_hours:
            # 有缓存直接用
            c = cached_hours[h]
            past_cpu.append(c["cpu"])
            past_gpu.append(c["gpu"])
            past_mem.append(c["mem"])
        else:
            # 无缓存：从实际数据生成并存入 Redis
            val = _get_actual_hour_value(actual_data, pattern, h, noise_scale=0.5)
            past_cpu.append(val["cpu"])
            past_gpu.append(val["gpu"])
            past_mem.append(val["mem"])
            await _redis_set_hour(date_str, h, val)

    # 当前小时：每次都重新预测（实时变化），并存入 Redis
    current_val = _predict_current_hour(past_cpu, past_gpu, past_mem, current_hour)
    await _redis_set_hour(date_str, current_hour, current_val)

    # 未来小时：实时预测（不缓存，每次刷新都变）
    history_cpu = past_cpu + [current_val["cpu"]]
    history_gpu = past_gpu + [current_val["gpu"]]
    history_mem = past_mem + [current_val["mem"]]

    n_future = 23 - current_hour
    future_vals = _predict_future_hours(history_cpu, history_gpu, history_mem, n_future)

    # 组装24小时数据
    all_cpu = past_cpu + [current_val["cpu"]] + [f["cpu"] for f in future_vals]
    all_gpu = past_gpu + [current_val["gpu"]] + [f["gpu"] for f in future_vals]
    all_mem = past_mem + [current_val["mem"]] + [f["mem"] for f in future_vals]

    return {
        "date": date_str,
        "x": time_labels,
        "currentTimeIndex": current_hour,
        "series": [
            {"name": "CPU 利用率", "data": all_cpu},
            {"name": "内存利用率", "data": all_mem},
            {"name": "GPU 利用率", "data": all_gpu},
        ],
    }


async def _handle_historical(date_str: str, time_labels: list[str], cached_hours: dict) -> dict:
    """处理历史日期：优先用 Redis 缓存，缺失的从数据集填充"""
    actual_data = _daily_detail.get(date_str)
    pattern = _hourly_pattern

    cpu_list: list[float] = []
    gpu_list: list[float] = []
    mem_list: list[float] = []

    for h in range(24):
        if h in cached_hours:
            c = cached_hours[h]
            cpu_list.append(c["cpu"])
            gpu_list.append(c["gpu"])
            mem_list.append(c["mem"])
        else:
            val = _get_actual_hour_value(actual_data, pattern, h, noise_scale=0.3)
            cpu_list.append(val["cpu"])
            gpu_list.append(val["gpu"])
            mem_list.append(val["mem"])
            await _redis_set_hour(date_str, h, val)

    return {
        "date": date_str,
        "x": time_labels,
        "currentTimeIndex": -1,
        "series": [
            {"name": "CPU 利用率", "data": cpu_list},
            {"name": "内存利用率", "data": mem_list},
            {"name": "GPU 利用率", "data": gpu_list},
        ],
    }


def _handle_unknown(date_str: str, time_labels: list[str]) -> dict:
    """处理不在数据集中的日期（纯预测）"""
    pattern = _hourly_pattern
    base_data = _find_similar_day(date_str)

    cpu_list: list[float] = []
    gpu_list: list[float] = []
    mem_list: list[float] = []

    for h in range(24):
        val = _get_actual_hour_value(base_data, pattern, h, noise_scale=2.0)
        cpu_list.append(val["cpu"])
        gpu_list.append(val["gpu"])
        mem_list.append(val["mem"])

    return {
        "date": date_str,
        "x": time_labels,
        "currentTimeIndex": -1,
        "series": [
            {"name": "CPU 利用率", "data": cpu_list},
            {"name": "内存利用率", "data": mem_list},
            {"name": "GPU 利用率", "data": gpu_list},
        ],
    }


def _find_similar_day(date_str: str) -> Optional[dict]:
    """找到数据集中同星期几的最近日期数据"""
    if not _daily_detail or not _available_dates:
        return None

    try:
        target = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return None

    target_weekday = target.weekday()
    best_date = None
    best_diff = float("inf")
    for d in _available_dates:
        d_weekday = datetime.strptime(d, "%Y-%m-%d").weekday()
        if d_weekday == target_weekday:
            diff = abs((target - datetime.strptime(d, "%Y-%m-%d")).days)
            if diff < best_diff:
                best_diff = diff
                best_date = d

    if best_date and best_date in _daily_detail:
        return _daily_detail[best_date]
    return None


def get_daily_overview() -> dict:
    _ensure_loaded()

    if not _daily_detail:
        return {"x": [], "series": []}

    dates = _available_dates

    def avg(arr):
        return round(sum(arr) / len(arr), 1) if arr else 0

    return {
        "x": dates,
        "series": [
            {"name": "CPU 利用率", "data": [avg(_daily_detail[d]["cpu"]) for d in dates if d in _daily_detail]},
            {"name": "内存利用率", "data": [avg(_daily_detail[d]["mem"]) for d in dates if d in _daily_detail]},
            {"name": "GPU 利用率", "data": [avg(_daily_detail[d]["gpu"]) for d in dates if d in _daily_detail]},
        ],
    }
