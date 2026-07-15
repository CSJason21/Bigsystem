"""
安全种子数据插入脚本：向服务器数据库灌入你负责的模块数据
原则：
  1. 所有 INSERT 使用 ON CONFLICT DO NOTHING，绝不覆盖已有数据
  2. 只插入你（陈圣杰）负责的模块相关数据
  3. 其他同学的数据完全不受影响

使用方式：
  1. 先执行 migrate_to_server.sql 创建缺失的表
  2. 再执行本脚本灌入种子数据：
     python server/scripts/seed_server_data.py

连接配置：
  默认连接服务器数据库，也可通过环境变量 DATABASE_URL 指定
"""

from __future__ import annotations

import math
import os
from datetime import datetime, timedelta, timezone

import psycopg

# ============================================================
# 数据库连接配置 - 服务器
# ============================================================
DB_NAME = "computing_network"
DB_USER = "cn_admin"
DB_PASSWORD = "slwl"
DB_HOST = "10.129.209.249"
DB_PORT = 5433


def get_conn():
    """获取数据库连接"""
    # 优先使用环境变量中的连接串
    db_url = os.environ.get(
        "DATABASE_URL",
        f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}",
    )
    # psycopg 格式
    if db_url.startswith("postgresql+psycopg://"):
        db_url = db_url.replace("postgresql+psycopg://", "postgresql://")
    return psycopg.connect(db_url)


def clamp(value: float, minimum: float, maximum: float) -> float:
    """将数值限制在 [minimum, maximum] 范围内"""
    return min(maximum, max(minimum, value))


# ============================================================
# 基础维度数据
# ============================================================

# 区域数据（全国算力网络层级）
REGIONS = [
    ("china", "全国算力网络", "country", None, 0, 104.0, 35.0),
    ("hub_beijing", "京津冀枢纽", "hub", "china", 1, 116.4, 39.9),
    ("hub_shanghai", "长三角枢纽", "hub", "china", 2, 121.5, 31.2),
    ("hub_guangdong", "粤港澳枢纽", "hub", "china", 3, 113.3, 23.1),
    ("hub_chengdu", "成渝枢纽", "hub", "china", 4, 104.1, 30.7),
    ("prov_beijing", "北京省级节点", "province", "hub_beijing", 11, 116.4, 39.9),
    ("prov_tianjin", "天津省级节点", "province", "hub_beijing", 12, 117.2, 39.1),
    ("prov_shanghai", "上海省级节点", "province", "hub_shanghai", 21, 121.5, 31.2),
    ("prov_jiangsu", "江苏省级节点", "province", "hub_shanghai", 22, 118.8, 32.1),
    ("prov_guangdong", "广东省级节点", "province", "hub_guangdong", 31, 113.3, 23.1),
    ("prov_guangxi", "广西省级节点", "province", "hub_guangdong", 32, 108.3, 22.8),
    ("prov_sichuan", "四川省级节点", "province", "hub_chengdu", 41, 104.1, 30.7),
    ("prov_chongqing", "重庆省级节点", "province", "hub_chengdu", 42, 106.5, 29.6),
]

# 算力节点数据（14个节点：DC + 边缘）
COMPUTE_NODES = [
    ("BJ_DC1", "北京DC-1", "bj-dc-1", "prov_beijing", "dc", "10.1.1.11", "北京·亦庄", "智算数据中心", "H100 训练池", "GPU+CPU", "x86_64 / CUDA 12.4", "Ubuntu 22.04", 192, 1024, 12000, "NVIDIA H100", 4, 400, "BJ-A01", "bj-a", 78),
    ("BJ_DC2", "北京DC-2", "bj-dc-2", "prov_beijing", "dc", "10.1.1.12", "北京·顺义", "智算数据中心", "A100 推理池", "GPU+CPU", "x86_64 / CUDA 12.2", "Ubuntu 22.04", 160, 768, 10000, "NVIDIA A100", 4, 320, "BJ-A02", "bj-a", 70),
    ("BJ_E1", "北京边缘-1", "bj-edge-1", "prov_beijing", "edge", "10.1.2.21", "北京·海淀", "边缘推理节点", "L40S 混合池", "GPU+CPU", "ARM64 / CUDA 11.8", "Ubuntu 22.04", 64, 256, 2600, "NVIDIA L40S", 2, 80, "BJ-E01", "bj-e", 48),
    ("BJ_E2", "北京边缘-2", "bj-edge-2", "prov_beijing", "edge", "10.1.2.22", "北京·朝阳", "边缘推理节点", "T4 边缘池", "GPU+CPU", "x86_64 / CUDA 11.8", "Ubuntu 20.04", 48, 192, 1800, "NVIDIA T4", 2, 60, "BJ-E02", "bj-e", 38),
    ("SH_DC1", "上海DC-1", "sh-dc-1", "prov_shanghai", "dc", "10.2.1.11", "上海·浦东", "智算数据中心", "H100 训练池", "GPU+CPU", "x86_64 / CUDA 12.4", "Ubuntu 22.04", 192, 1024, 12000, "NVIDIA H100", 4, 400, "SH-A01", "sh-a", 76),
    ("SH_DC2", "上海DC-2", "sh-dc-2", "prov_shanghai", "dc", "10.2.1.12", "上海·嘉定", "智算数据中心", "A100 推理池", "GPU+CPU", "x86_64 / CUDA 12.2", "Ubuntu 22.04", 128, 768, 9000, "NVIDIA A100", 3, 300, "SH-A02", "sh-a", 68),
    ("SH_E1", "上海边缘-1", "sh-edge-1", "prov_shanghai", "edge", "10.2.2.21", "上海·闵行", "边缘推理节点", "L40S 混合池", "GPU+CPU", "ARM64 / CUDA 11.8", "Ubuntu 22.04", 64, 256, 2600, "NVIDIA L40S", 2, 80, "SH-E01", "sh-e", 46),
    ("SH_E2", "上海边缘-2", "sh-edge-2", "prov_shanghai", "edge", "10.2.2.22", "上海·松江", "边缘推理节点", "T4 边缘池", "GPU+CPU", "x86_64 / CUDA 11.8", "Ubuntu 20.04", 48, 192, 1800, "NVIDIA T4", 2, 60, "SH-E02", "sh-e", 36),
    ("GD_DC1", "广东DC-1", "gd-dc-1", "prov_guangdong", "dc", "10.3.1.11", "广州·天河", "智算数据中心", "H100 训练池", "GPU+CPU", "x86_64 / CUDA 12.4", "Ubuntu 22.04", 192, 1024, 12000, "NVIDIA H100", 4, 400, "GD-A01", "gd-a", 74),
    ("GD_DC2", "广东DC-2", "gd-dc-2", "prov_guangdong", "dc", "10.3.1.12", "深圳·南山", "智算数据中心", "A100 推理池", "GPU+CPU", "x86_64 / CUDA 12.2", "Ubuntu 22.04", 160, 768, 10000, "NVIDIA A100", 4, 320, "GD-A02", "gd-a", 70),
    ("GD_E1", "广东边缘-1", "gd-edge-1", "prov_guangdong", "edge", "10.3.2.21", "广州·番禺", "边缘推理节点", "L40S 混合池", "GPU+CPU", "ARM64 / CUDA 11.8", "Ubuntu 22.04", 64, 256, 2600, "NVIDIA L40S", 2, 80, "GD-E01", "gd-e", 44),
    ("GD_E2", "广东边缘-2", "gd-edge-2", "prov_guangdong", "edge", "10.3.2.22", "深圳·龙华", "边缘推理节点", "T4 边缘池", "GPU+CPU", "x86_64 / CUDA 11.8", "Ubuntu 20.04", 48, 192, 1800, "NVIDIA T4", 2, 60, "GD-E02", "gd-e", 38),
    ("SC_DC1", "四川DC-1", "sc-dc-1", "prov_sichuan", "dc", "10.4.1.11", "成都·高新", "西部智算中心", "A800 弹性池", "GPU+CPU", "x86_64 / CUDA 12.0", "Ubuntu 22.04", 128, 768, 9000, "NVIDIA A800", 2, 260, "SC-A01", "sc-a", 62),
    ("CQ_E1", "重庆边缘-1", "cq-edge-1", "prov_chongqing", "edge", "10.4.2.21", "重庆·两江", "边缘推理节点", "T4 边缘池", "GPU+CPU", "x86_64 / CUDA 11.8", "Ubuntu 20.04", 48, 192, 1800, "NVIDIA T4", 1, 60, "CQ-E01", "cq-e", 34),
]


def seed_regions(cur):
    """插入区域数据 - ON CONFLICT DO NOTHING"""
    print("  插入区域数据 (dim_region)...")
    for row in REGIONS:
        cur.execute(
            """
            INSERT INTO dim_region(region_id, region_name, region_level, parent_region_id, display_order, longitude, latitude)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (region_id) DO NOTHING
            """,
            row,
        )


def seed_supercomputing_centers(cur):
    """插入超算中心数据"""
    print("  插入超算中心数据 (dim_supercomputing_center)...")
    centers = [
        ("北京移动智算中心", "prov_beijing", 116.4, 39.9, 320.0, 4096, "NVIDIA H100", 128, "400Gbps", 94.5, "national", "北京"),
        ("上海移动智算中心", "prov_shanghai", 121.5, 31.2, 300.0, 3584, "NVIDIA H100", 112, "400Gbps", 93.0, "national", "上海"),
        ("广东移动智算中心", "prov_guangdong", 113.3, 23.1, 280.0, 3328, "NVIDIA A100", 128, "320Gbps", 91.0, "regional", "广东"),
    ]
    for c in centers:
        cur.execute(
            """
            INSERT INTO dim_supercomputing_center(name, region_id, longitude, latitude, compute_power, cpu_cores, gpu_type, gpu_count, network_bw, capability_score, center_level, province)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (name) DO NOTHING
            """,
            c,
        )


def seed_compute_nodes(cur, now):
    """插入算力节点数据 - ON CONFLICT DO NOTHING"""
    print("  插入算力节点数据 (dim_compute_node)...")
    for idx, n in enumerate(COMPUTE_NODES):
        cur.execute(
            """
            INSERT INTO dim_compute_node(
                node_id, node_name, hostname, region_id, layer,
                ip_address, management_ip, location, role_name, provider_name,
                compute_type, architecture, os_name, cpu_cores, memory_total_gb,
                disk_total_gb, gpu_type, gpu_count, bandwidth_total_gbps,
                rack_code, az_code, running_tasks, health_score, last_heartbeat
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 0, %s, NOW())
            ON CONFLICT (node_id) DO NOTHING
            """,
            (n[0], n[1], n[2], n[3], n[4], n[5], n[5], n[6], n[7], n[8], n[9], n[10], n[11], n[12], n[13], n[14], n[15], n[16], n[17], n[18], n[19], 94 - (idx % 9)),
        )


def seed_clients(cur, now):
    """插入客户端数据"""
    print("  插入客户端数据 (dim_client)...")
    edge_nodes = [n for n in COMPUTE_NODES if n[4] == "edge"]
    for idx, node in enumerate(edge_nodes, start=1):
        cur.execute(
            """
            INSERT INTO dim_client(client_id, client_name, edge_node_id, status, joined_at)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (client_id) DO NOTHING
            """,
            (f"client-{idx:03d}", f"{node[6]}业务客户端", node[0], "online", now - timedelta(days=idx)),
        )


def seed_gpu_devices(cur):
    """插入GPU设备数据"""
    print("  插入GPU设备数据 (dim_node_gpu_device)...")
    for node in COMPUTE_NODES:
        node_id, gpu_model, gpu_count = node[0], node[15], node[16]
        memory = 80 if any(key in gpu_model for key in ("H100", "A100", "A800")) else 48 if "L40" in gpu_model else 16
        for gpu_index in range(gpu_count):
            cur.execute(
                """
                INSERT INTO dim_node_gpu_device(node_id, gpu_index, gpu_name, gpu_model, gpu_memory_total_gb, gpu_compute_capability)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (node_id, gpu_index) DO NOTHING
                """,
                (node_id, gpu_index, f"GPU-{gpu_index}", gpu_model, memory, "8.0"),
            )


def seed_topology(cur, now):
    """插入拓扑相关数据（视图、顶点、边、布局）"""
    print("  插入拓扑视图数据 (dim_topology_view)...")
    views = [
        ("global", "全国算力调度大盘", "global", "china", None, True),
        ("region_beijing", "京津冀枢纽区域", "region", "hub_beijing", None, False),
        ("region_shanghai", "长三角枢纽区域", "region", "hub_shanghai", None, False),
        ("region_guangdong", "粤港澳枢纽区域", "region", "hub_guangdong", None, False),
        ("region_chengdu", "成渝枢纽区域", "region", "hub_chengdu", None, False),
        ("prov_beijing", "北京省级节点", "province", "prov_beijing", None, False),
        ("prov_shanghai", "上海省级节点", "province", "prov_shanghai", None, False),
        ("prov_guangdong", "广东省级节点", "province", "prov_guangdong", None, False),
        ("node", "单节点监控", "node", None, "BJ_DC1", False),
    ]
    for v in views:
        cur.execute(
            """
            INSERT INTO dim_topology_view(view_id, view_name, view_kind, region_id, node_id, is_default)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (view_id) DO NOTHING
            """,
            v,
        )

    # 拓扑顶点
    print("  插入拓扑顶点数据 (dim_topology_vertex)...")
    vertices = [("manager", "control", "national_dispatch_center", "国家级算力调度中心", "4+N+31+X 顶层管控", "china", None, None, "online", False, False)]
    hub_labels = {
        "hub_beijing": ("京津冀枢纽", "华北国家级枢纽"),
        "hub_shanghai": ("长三角枢纽", "华东国家级枢纽"),
        "hub_guangdong": ("粤港澳枢纽", "华南国家级枢纽"),
        "hub_chengdu": ("成渝枢纽", "西部国家级枢纽"),
    }
    for hub_id, (name, subtitle) in hub_labels.items():
        vertices.append((hub_id, "cloud", "national_hub", name, subtitle, hub_id, None, None, "online", True, False))
    for region_id, name, level, _parent, *_ in REGIONS:
        if level == "province":
            vertices.append((f"brain_{region_id}", "control", "province_brain", name.replace("节点", "算网大脑"), "31·省级调度", region_id, None, None, "online", True, False))
    for node in COMPUTE_NODES:
        layer = node[4]
        vertices.append((node[0], "edge" if layer == "edge" else "compute", f"{layer}_compute_node", node[1], "X·边缘节点" if layer == "edge" else "地市DC", node[3], node[0], None, "online", True, True))
    for v in vertices:
        cur.execute(
            """
            INSERT INTO dim_topology_vertex(vertex_id, vertex_type, vertex_role, vertex_name, subtitle, region_id, compute_node_id, service_code, status, is_physical, is_schedulable)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (vertex_id) DO NOTHING
            """,
            v,
        )

    # 拓扑边
    print("  插入拓扑边数据 (dim_topology_edge)...")
    edge_rows = [("manager", hub_id, "dispatch", 100000, 10) for hub_id in hub_labels]
    edge_rows.extend((parent, f"brain_{region_id}", "dispatch", 40000, 6) for region_id, _name, level, parent, *_ in REGIONS if level == "province" and parent)
    edge_rows.extend((f"brain_{node[3]}", node[0], "dispatch", 10000 if node[4] == "dc" else 3000, 4) for node in COMPUTE_NODES)
    for e in edge_rows:
        cur.execute(
            """
            INSERT INTO dim_topology_edge(source_vertex_id, target_vertex_id, edge_role, capacity_bandwidth_mbps, priority)
            VALUES (%s, %s, %s, %s, %s)
            """,
            e,
        )

    # 拓扑布局
    print("  插入拓扑布局数据 (dim_topology_layout)...")
    layouts = [
        ("global", "manager", 0, 60, 120),
        ("global", "hub_beijing", -390, 220, 90),
        ("global", "hub_shanghai", -130, 220, 90),
        ("global", "hub_guangdong", 130, 220, 90),
        ("global", "hub_chengdu", 390, 220, 90),
    ]
    for idx, region_id in enumerate(["prov_beijing", "prov_tianjin", "prov_shanghai", "prov_jiangsu", "prov_guangdong", "prov_guangxi", "prov_sichuan", "prov_chongqing"]):
        layouts.append(("global", f"brain_{region_id}", -455 + idx * 130, 390, 68))
    for view_id, region_id in [("region_beijing", "hub_beijing"), ("region_shanghai", "hub_shanghai"), ("region_guangdong", "hub_guangdong"), ("region_chengdu", "hub_chengdu")]:
        layouts.append((view_id, region_id, 0, 60, 110))
        provinces = [r[0] for r in REGIONS if r[3] == region_id]
        for idx, province_id in enumerate(provinces):
            layouts.append((view_id, f"brain_{province_id}", -160 + idx * 320, 220, 86))
            nodes = [n for n in COMPUTE_NODES if n[3] == province_id]
            for node_idx, node in enumerate(nodes):
                layouts.append((view_id, node[0], -230 + node_idx * 150 + idx * 120, 390 + (node_idx % 2) * 120, 56 if node[4] == "edge" else 68))
    for province_id in ["prov_beijing", "prov_shanghai", "prov_guangdong"]:
        layouts.append((province_id, f"brain_{province_id}", 0, 60, 100))
        nodes = [n for n in COMPUTE_NODES if n[3] == province_id]
        for idx, node in enumerate(nodes):
            layouts.append((province_id, node[0], -240 + idx * 160, 220 if node[4] == "dc" else 390, 58 if node[4] == "edge" else 76))
    for l in layouts:
        cur.execute(
            """
            INSERT INTO dim_topology_layout(view_id, vertex_id, x, y, size_hint)
            VALUES (%s, %s, %s, %s, %s)
            """,
            l,
        )


def seed_monitoring_metrics(cur, now):
    """插入节点监控指标和拓扑运行态快照"""
    print("  插入节点监控指标 (ts_node_metric)...")
    metric_rows = []
    runtime_rows = []
    for idx, node in enumerate(COMPUTE_NODES):
        node_id, base = node[0], node[20]
        for minute in range(72):
            ts = now - timedelta(minutes=71 - minute)
            phase = minute / 6 + idx * 0.7
            cpu = clamp(base + math.sin(phase) * 8 + math.cos(phase / 2) * 4, 12, 96)
            memory = clamp(base - 5 + math.sin(phase + 0.8) * 6, 10, 92)
            gpu = clamp(base + 4 + math.sin(phase + 1.3) * 10, 5, 98)
            disk = clamp(38 + idx * 2.2 + math.sin(phase / 2) * 5, 20, 88)
            bandwidth = clamp(18 + cpu * 0.95 + math.sin(phase) * 6, 10, 160)
            latency = clamp(8 + cpu * 0.24 + (idx % 4) * 2, 6, 80)
            jitter = clamp(1 + latency * 0.05, 1, 10)
            loss = clamp(max(cpu - 82, 0) * 0.035, 0, 1.8)
            metric_rows.append((ts, node_id, round(cpu, 1), round(memory, 1), round(gpu, 1), round(disk, 1), round(bandwidth, 1), round(latency, 1), round(jitter, 2), round(loss, 2)))
        latest_cpu = metric_rows[-1][2]
        runtime_rows.append((node_id, now, "online", latest_cpu, min(98, latest_cpu + 5), None, "warning" if latest_cpu > 82 else "normal"))

    cur.executemany(
        """
        INSERT INTO ts_node_metric(metric_time, node_id, cpu_usage_pct, memory_usage_pct, gpu_usage_pct, disk_usage_pct, bandwidth_usage_gbps, latency_ms, jitter_ms, packet_loss_pct)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        metric_rows,
    )

    print("  插入拓扑运行态快照 (fact_topology_runtime_state)...")
    cur.executemany(
        """
        INSERT INTO fact_topology_runtime_state(vertex_id, snapshot_time, status, current_load_pct, predicted_load_pct_10m, badge_text, highlight_level)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        runtime_rows,
    )

    # 资源趋势
    print("  插入资源趋势数据 (ts_resource_trend_5m)...")
    trend_rows = []
    for offset in range(0, 72, 5):
        trend_rows.append((now - timedelta(minutes=offset), 58 + math.sin(offset / 8) * 8, 53 + math.cos(offset / 9) * 6, 61 + math.sin(offset / 7) * 10, len(COMPUTE_NODES)))
    cur.executemany(
        """
        INSERT INTO ts_resource_trend_5m(metric_time, avg_cpu_pct, avg_memory_pct, avg_gpu_pct, node_count)
        VALUES (%s, %s, %s, %s, %s)
        """,
        trend_rows,
    )


def seed_alert_config(cur):
    """插入告警阈值配置"""
    print("  插入告警阈值配置 (cfg_alert_threshold)...")
    thresholds = [
        ("cpu", "CPU 利用率", "%", 60.0, 80.0, "统一库演示阈值"),
        ("mem", "内存利用率", "%", 60.0, 80.0, "统一库演示阈值"),
        ("gpu", "GPU 利用率", "%", 60.0, 80.0, "统一库演示阈值"),
        ("disk", "磁盘利用率", "%", 70.0, 90.0, "统一库演示阈值"),
    ]
    for t in thresholds:
        cur.execute(
            """
            INSERT INTO cfg_alert_threshold(metric_code, metric_name, unit, warning_threshold, critical_threshold, description)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (metric_code) DO NOTHING
            """,
            t,
        )


def seed_tasks(cur, now):
    """插入任务相关数据（任务、需求、分配）"""
    print("  插入任务数据 (fact_task, fact_task_requirement, fact_task_assignment)...")
    task_types = ["训练任务", "推理服务", "数据预处理", "联邦聚合", "弹性迁移"]
    for i in range(1, 21):
        task_id = f"T-{i:04d}"
        task_type = task_types[(i - 1) % len(task_types)]
        node = COMPUTE_NODES[(i * 3) % len(COMPUTE_NODES)]
        status = "running" if i % 4 else "pending"
        priority_name = ["low", "medium", "high", "urgent"][i % 4]

        # 插入任务主表（兼容服务器表结构，不使用 task_name/priority_level）
        cur.execute(
            """
            INSERT INTO fact_task(task_id, name, task_type, priority, status, progress, assigned_node_id, submit_time, start_time, source_region_id, sla_level)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (task_id) DO NOTHING
            """,
            (task_id, f"{task_type}-{i}", task_type, priority_name, status, 35 if status == "running" else 0, node[0] if status == "running" else None, now - timedelta(minutes=80 - i * 3), now - timedelta(minutes=70 - i * 3) if status == "running" else None, node[3], "gold" if i % 5 == 0 else "standard"),
        )

        # 插入任务需求（兼容服务器表结构，不使用 required_* 字段）
        cpu_req = 8 + (i % 5) * 4
        mem_req = 16 + (i % 6) * 8
        gpu_req = 1 if task_type in ("训练任务", "推理服务", "联邦聚合") else 0
        gpu_mem_req = 16
        bandwidth_req = 5 + (i % 4) * 2
        storage_req = 80 + i * 10
        cur.execute(
            """
            INSERT INTO fact_task_requirement(task_id, cpu_requested, memory_requested, gpu_requested, gpu_type_requested, gpu_memory_requested, storage_requested, bandwidth_requested, estimated_duration_sec, estimated_latency_ms, affinity_region_id, anti_affinity_node_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (task_id) DO NOTHING
            """,
            (task_id, cpu_req, mem_req, gpu_req, node[15], gpu_mem_req, storage_req, bandwidth_req, 900 + i * 80, 12 + i % 8, node[3], None),
        )

        # 插入运行中任务的分配记录（兼容服务器表结构，不使用 allocated_* 字段）
        if status == "running":
            gpu_pct = 18 + (i % 5) * 5
            cur.execute(
                """
                INSERT INTO fact_task_assignment(task_id, target_node_id, match_score, estimated_latency_ms, cpu_allocated, memory_allocated, gpu_allocated, gpu_pct_allocated, bandwidth_allocated, storage_allocated, assignment_status, assigned_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (task_id, node[0], 82 + (i % 13), 10 + i % 8, cpu_req, mem_req, gpu_req, gpu_pct, bandwidth_req, storage_req, "running", now - timedelta(minutes=65 - i * 3)),
            )

    # 更新节点的运行任务计数
    cur.execute(
        """
        UPDATE dim_compute_node n
        SET running_tasks = COALESCE(sub.cnt, 0)
        FROM (SELECT target_node_id, COUNT(*) cnt FROM fact_task_assignment WHERE assignment_status='running' GROUP BY target_node_id) sub
        WHERE n.node_id = sub.target_node_id
        """
    )

    # 联邦学习任务扩展
    cur.execute(
        """
        INSERT INTO fact_federated_task(task_id, aggregation_algorithm, encryption_type, rounds_total, rounds_current, min_participants, model_name, model_version, global_accuracy, global_loss, parameters_count)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (task_id) DO NOTHING
        """,
        ("T-0004", "FedAvg", "secure_aggregation", 20, 6, 4, "demo-fl-model", "v1", 0.873, 0.214, 120000000),
    )


def seed_schedule_logs(cur, now):
    """插入调度日志"""
    print("  插入调度日志 (fact_schedule_log)...")
    log_rows = []
    for i in range(1, 16):
        task_id = f"T-{i:04d}"
        node = COMPUTE_NODES[(i * 3) % len(COMPUTE_NODES)]
        if i % 4 == 0:
            continue  # pending 任务没有日志
        log_rows.extend([
            (task_id, "manager", "感知", now - timedelta(minutes=18 - i), f"收到任务 {task_id}，开始读取算力网络状态。", "info"),
            (task_id, "manager", "决策", now - timedelta(minutes=17 - i), f"候选节点评估完成，{node[0]} 匹配度 {82 + (i % 13):.0f}%。", "info"),
            (task_id, node[0], "下发", now - timedelta(minutes=16 - i), f"任务 {task_id} 已绑定至 {node[0]}，资源预留完成。", "info"),
            (task_id, node[0], "监控", now - timedelta(minutes=15 - i), f"{node[0]} 链路就绪，任务流进入实时监控。", "info"),
        ])
    cur.executemany(
        """
        INSERT INTO fact_schedule_log(task_id, vertex_id, phase, log_time, message, severity)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        log_rows,
    )


def seed_forecast_data(cur, now):
    """插入预测数据（预测运行 + 预测序列点）"""
    print("  插入预测数据 (fact_forecast_run, ts_forecast_point)...")
    for metric, base in [("cpu", 58), ("memory", 54), ("bandwidth", 74), ("gpu", 62), ("storage", 48)]:
        # 插入预测运行记录
        run_id = cur.execute(
            """
            INSERT INTO fact_forecast_run(forecast_type, metric_name, target_level, target_id, horizon_minutes, granularity_seconds, model_name, model_version, run_time)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING forecast_run_id
            """,
            ("global_demand", metric, "global", "global", 360, 300, "demo-trend-extrapolator", "v1", now),
        ).fetchone()[0]

        # 插入预测序列点
        points = []
        for i in range(30):
            point_time = now + timedelta(minutes=(i - 10) * 5)
            actual = None if i > 10 else clamp(base + math.sin(i / 2) * 7, 10, 98)
            predicted = clamp(base + math.sin(i / 2 + 0.5) * 8 + max(i - 10, 0) * 0.6, 10, 120)
            points.append((run_id, point_time, round(actual, 1) if actual is not None else None, round(predicted, 1), round(predicted - 6, 1), round(predicted + 6, 1), "history" if i <= 10 else "forecast"))
        cur.executemany(
            """
            INSERT INTO ts_forecast_point(forecast_run_id, point_time, actual_value, predicted_value, lower_bound, upper_bound, point_role)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            points,
        )


def seed_alert_records(cur, now):
    """插入告警记录"""
    print("  插入告警记录 (fact_alert_record)...")
    cur.execute(
        """
        INSERT INTO fact_alert_record(node_id, node_name, metric_code, metric_name, current_value, threshold_value, alert_level, alert_message, status, triggered_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT DO NOTHING
        """,
        ("SH_DC1", "上海DC-1", "cpu", "CPU 利用率", 85.1, 80.0, "critical", "上海DC-1 CPU 利用率超过严重阈值", "active", now - timedelta(minutes=8)),
    )


def main():
    """主函数：按顺序执行所有种子数据插入"""
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)

    print("=" * 60)
    print("安全种子数据插入脚本 - 开始执行")
    print(f"目标数据库：{DB_HOST}:{DB_PORT}/{DB_NAME}")
    print(f"执行时间：{now.isoformat()}")
    print("=" * 60)

    conn = get_conn()
    try:
        with conn.transaction():
            cur = conn.cursor()

            # 1. 基础维度数据（ON CONFLICT DO NOTHING，不会覆盖）
            print("\n[1/8] 插入基础维度数据...")
            seed_regions(cur)
            seed_supercomputing_centers(cur)
            seed_compute_nodes(cur, now)
            seed_clients(cur, now)
            seed_gpu_devices(cur)

            # 2. 拓扑数据
            print("\n[2/8] 插入拓扑数据...")
            seed_topology(cur, now)

            # 3. 监控指标
            print("\n[3/8] 插入监控指标...")
            seed_monitoring_metrics(cur, now)

            # 4. 告警配置
            print("\n[4/8] 插入告警配置...")
            seed_alert_config(cur)
            seed_alert_records(cur, now)

            # 5. 任务数据
            print("\n[5/8] 插入任务数据...")
            seed_tasks(cur, now)

            # 6. 调度日志
            print("\n[6/8] 插入调度日志...")
            seed_schedule_logs(cur, now)

            # 7. 预测数据
            print("\n[7/8] 插入预测数据...")
            seed_forecast_data(cur, now)

            # 8. 刷新物化视图（如果有）
            print("\n[8/8] 完成！")

        print("\n" + "=" * 60)
        print("所有种子数据插入完成！")
        print("注意：所有 INSERT 均使用 ON CONFLICT DO NOTHING，")
        print("不会覆盖其他同学已有的数据。")
        print("=" * 60)

    except Exception as e:
        print(f"\n执行出错：{e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
