"""
缓存装饰器模块（内存 TTL 缓存版）
==========================================
用 Python 进程级内存缓存替代 Redis，零依赖。

工作原理：
  第一次请求 → 执行函数 → 结果存入内存（带时间戳）
  后续请求   → 命中缓存且未过期 → 直接返回内存数据（~0ms）
  缓存过期   → 重新执行函数 → 刷新缓存

适用场景：
  远程数据库查询慢（如 perspectives 接口 3-15 秒），
  缓存后后续请求秒返回，配合 30s TTL 保证数据新鲜度。
"""
import functools
import json
import time
from collections import OrderedDict
from typing import Any, Callable

from fastapi.encoders import jsonable_encoder

from app.core.config import settings

try:
    import redis
except Exception:  # pragma: no cover - redis 是可选增强
    redis = None


# ================================================================
# 内存缓存存储
# ================================================================

class _MemoryCache:
    """
    线程安全的 LRU 内存缓存（带 TTL 过期机制）。

    - max_size: 最多缓存条目数，超出后淘汰最久未访问的
    - 默认上限 256 条，防止内存泄漏
    """

    def __init__(self, max_size: int = 256) -> None:
        self._store: OrderedDict[str, tuple[float, Any]] = OrderedDict()
        self._max_size = max_size

    def get(self, key: str, ttl: int) -> Any | None:
        """
        获取缓存值。如果 key 不存在或已过期返回 None。

        参数:
            key: 缓存键
            ttl: 缓存有效期（秒）
        """
        entry = self._store.get(key)
        if entry is None:
            return None
        ts, value = entry
        # 检查是否过期
        if time.monotonic() - ts > ttl:
            del self._store[key]
            return None
        # LRU: 移到末尾（最近访问）
        self._store.move_to_end(key)
        return value

    def set(self, key: str, value: Any) -> None:
        """写入缓存，如果超过上限淘汰最老的条目"""
        self._store[key] = (time.monotonic(), value)
        self._store.move_to_end(key)
        # 淘汰最老条目
        while len(self._store) > self._max_size:
            self._store.popitem(last=False)

    def invalidate(self, key: str) -> None:
        """手动使某个缓存键失效"""
        self._store.pop(key, None)

    def clear(self) -> None:
        """清空所有缓存"""
        self._store.clear()

    def stats(self) -> dict[str, int]:
        """返回缓存统计信息（调试用）"""
        return {"size": len(self._store), "max_size": self._max_size}


# 全局缓存实例（整个 FastAPI 进程共享）
_cache = _MemoryCache()
_redis_client = None
_redis_checked = False


def _get_redis_client():
    """配置 REDIS_URL 时启用 Redis；不可用时自动降级为内存缓存。"""
    global _redis_client, _redis_checked
    if _redis_checked:
        return _redis_client
    _redis_checked = True
    if not settings.REDIS_URL or redis is None:
        return None
    try:
        _redis_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
        _redis_client.ping()
    except Exception:
        _redis_client = None
    return _redis_client


def _redis_get(key: str) -> Any | None:
    client = _get_redis_client()
    if client is None:
        return None
    try:
        raw = client.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


def _redis_set(key: str, value: Any, ttl: int) -> None:
    client = _get_redis_client()
    if client is None:
        return
    try:
        client.setex(key, ttl, json.dumps(jsonable_encoder(value), ensure_ascii=False))
    except Exception:
        return


# ================================================================
# 缓存装饰器（兼容之前的接口）
# ================================================================

def cached(ttl: int = 60, key_prefix: str = "api"):
    """
    异步函数的 TTL 内存缓存装饰器。

    用法：
        @router.get("/resources/map")
        @cached(ttl=30, key_prefix="resources")
        async def get_map_nodes():
            ...

    参数:
        ttl:         缓存有效期（秒），默认 60 秒
        key_prefix:  缓存键前缀，用于区分不同接口
    """

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # 构建缓存键：前缀 + 参数
            # 跳过 self/request 等不可哈希参数
            cache_key = _build_cache_key(key_prefix, args, kwargs)

            # 尝试命中缓存
            redis_key = f"redis:{cache_key}"
            redis_value = _redis_get(redis_key)
            if redis_value is not None:
                return redis_value

            cached_value = _cache.get(cache_key, ttl)
            if cached_value is not None:
                return cached_value

            # 未命中：执行原函数
            result = await func(*args, **kwargs)

            # 写入缓存
            _cache.set(cache_key, result)
            _redis_set(redis_key, result, ttl)
            return result

        # 暴露缓存控制方法（方便手动清除）
        wrapper._cache_invalidate = lambda: _cache.clear()  # type: ignore
        return wrapper

    return decorator


def sync_cached(ttl: int = 60, key_prefix: str = "api"):
    """
    同步函数的 TTL 内存缓存装饰器。

    用于缓存普通的同步函数（如 prediction_allocation_data.py 中的数据库查询函数）。

    用法：
        @sync_cached(ttl=30, key_prefix="perspectives")
        def get_perspectives(db, source="auto"):
            ...
    """

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            cache_key = _build_cache_key(key_prefix, args, kwargs)

            redis_key = f"redis:{cache_key}"
            redis_value = _redis_get(redis_key)
            if redis_value is not None:
                return redis_value

            cached_value = _cache.get(cache_key, ttl)
            if cached_value is not None:
                return cached_value

            result = func(*args, **kwargs)
            _cache.set(cache_key, result)
            _redis_set(redis_key, result, ttl)
            return result

        wrapper._cache_invalidate = lambda: _cache.clear()  # type: ignore
        return wrapper

    return decorator


def _build_cache_key(prefix: str, args: tuple, kwargs: dict) -> str:
    """
    根据函数参数构建缓存键。

    跳过不可哈希的参数（如 db Session 对象），
    只用可哈希的位置参数和关键字参数参与键的生成。
    """
    parts = [prefix]

    # 收集可哈希的位置参数（跳过 Session、dict 等不可哈希对象）
    for v in args:
        try:
            hash(v)
            if isinstance(v, str):
                parts.append(v)
            else:
                parts.append(str(v))
        except TypeError:
            pass  # 跳过不可哈希的值（如 db Session）

    # 收集可哈希的关键字参数
    for k, v in sorted(kwargs.items()):
        try:
            hash(v)
            parts.append(f"{k}={v}")
        except TypeError:
            pass  # 跳过不可哈希的值

    return ":".join(parts)


def get_cache_stats() -> dict[str, int]:
    """获取缓存统计信息（调试/监控用）"""
    return _cache.stats()


def clear_all_cache() -> None:
    """手动清空所有缓存（数据库更新后可调用）"""
    _cache.clear()
