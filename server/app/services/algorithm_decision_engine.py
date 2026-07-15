"""
联邦聚合算法决策引擎（强化学习策略模拟）

核心功能：
1. 根据恶意梯度比例（malicious_ratio）动态推荐最鲁棒的聚合算法
2. 生成各算法的收敛曲线（准确率 + 损失），用于前端对比展示
3. 输出决策日志，解释为什么选这个算法

算法池：FedAvg / Krum / GeometricMedian / Bulyan

决策逻辑（模拟 RL 策略）：
  - malicious_ratio <= 10%  → FedAvg 足够（开销最低）
  - 10% < ratio <= 25%      → Krum（中等防御，开销适中）
  - 25% < ratio <= 40%      → Bulyan（最强防御）
  - ratio > 40%             → Bulyan + 告警（仍选最强，但标记风险）

安全联动：
  - 安全评分 < 70 时，强制升级到 Bulyan（无论恶意比例多少）
"""
import math
from typing import Any

# ============================================================
# 算法画像（用于推荐理由和鲁棒性/开销评分）
# ============================================================
ALGORITHM_PROFILES: dict[str, dict[str, Any]] = {
    "FedAvg": {
        "robustness": 35,        # 鲁棒性评分（满分100）
        "accuracy_baseline": 80, # 无攻击时的基准精度
        "overhead": 10,          # 计算开销（%）
        "max_tolerated_malicious": 10,  # 能容忍的最大恶意比例
        "note": "无防御机制，恶意梯度下精度崩溃",
    },
    "Krum": {
        "robustness": 82,
        "accuracy_baseline": 85,
        "overhead": 20,
        "max_tolerated_malicious": 25,
        "note": "基于距离的鲁棒聚合，计算开销较低",
    },
    "GeometricMedian": {
        "robustness": 78,
        "accuracy_baseline": 82,
        "overhead": 25,
        "max_tolerated_malicious": 20,
        "note": "几何中位数防御，鲁棒性中等",
    },
    "Bulyan": {
        "robustness": 95,
        "accuracy_baseline": 88,
        "overhead": 30,
        "max_tolerated_malicious": 40,
        "note": "最强鲁棒聚合，35% 恶意梯度下仍稳定收敛",
    },
}

# 算法优先级（数字越小优先级越高）
_ALGORITHM_PRIORITY = ["Bulyan", "Krum", "GeometricMedian", "FedAvg"]


def recommend_algorithm(
    malicious_ratio: float,
    security_score: float | None = None,
) -> tuple[str, str]:
    """
    根据恶意比例和安全评分，推荐最优聚合算法（模拟 RL 策略）

    参数：
        malicious_ratio: 恶意梯度比例（0-100）
        security_score:  算法层安全评分（0-100），可选

    返回：
        (算法名称, 推荐理由)
    """
    # 安全联动：如果安全评分很低，强制升级到 Bulyan
    if security_score is not None and security_score < 70:
        return "Bulyan", f"算法安全评分仅 {security_score:.0f} 分（低于阈值 70），RL 策略强制升级至 Bulyan 聚合。"

    # 根据恶意比例选择算法
    if malicious_ratio <= 10:
        return "FedAvg", f"恶意梯度比例仅 {malicious_ratio:.0f}%，FedAvg 足以维持稳定训练，无需额外防御开销。"
    elif malicious_ratio <= 20:
        return "GeometricMedian", f"恶意梯度比例 {malicious_ratio:.0f}%，RL 策略选择 GeometricMedian 中等防御。"
    elif malicious_ratio <= 25:
        return "Krum", f"恶意梯度比例 {malicious_ratio:.0f}%，RL 策略选择 Krum 聚合，平衡鲁棒性与开销。"
    else:
        return "Bulyan", f"恶意梯度比例高达 {malicious_ratio:.0f}%，RL 策略选择 Bulyan 最强鲁棒聚合。"


def _generate_convergence_curve(
    algorithm: str,
    malicious_ratio: float,
    num_rounds: int = 20,
) -> tuple[list[float], list[float]]:
    """
    生成单个算法的收敛曲线（准确率 + 损失）

    核心逻辑：
    - 无攻击时：所有算法都能正常收敛到 baseline
    - 有攻击时：
      * 防御能力弱的算法（FedAvg）：精度从峰值下降，最终崩溃
      * 防御能力强的算法（Bulyan）：精度持续上升，稳定收敛

    参数：
        algorithm: 算法名称
        malicious_ratio: 恶意梯度比例
        num_rounds: 训练轮次

    返回：
        (accuracy_list, loss_list)  每轮的准确率和损失值
    """
    profile = ALGORITHM_PROFILES[algorithm]
    baseline = profile["accuracy_baseline"]
    robustness = profile["robustness"]
    max_tolerated = profile["max_tolerated_malicious"]

    # 攻击强度因子：恶意比例越高，对弱防御算法的破坏越大
    attack_factor = max(0, malicious_ratio - max_tolerated) / 100

    # 最终精度：防御强的算法受攻击影响小
    if attack_factor > 0:
        # 超出容忍范围，精度损失与（1 - robustness/100）成正比
        final_accuracy = baseline - attack_factor * (100 - robustness) * 1.2
    else:
        final_accuracy = baseline

    final_accuracy = max(50, min(95, final_accuracy))

    # 如果是 FedAvg 且受到严重攻击，精度先升后降（崩溃曲线）
    collapse = algorithm == "FedAvg" and malicious_ratio > 15

    accuracy: list[float] = []
    loss: list[float] = []

    for r in range(1, num_rounds + 1):
        progress = r / num_rounds

        if collapse:
            # FedAvg 崩溃模式：前 30% 正常上升，之后快速下降
            if progress <= 0.3:
                acc = 55 + (baseline - 55) * (1 - math.exp(-progress * 5))
            else:
                decay = (progress - 0.3) / 0.7
                acc = baseline - (baseline - final_accuracy) * decay
                acc += math.sin(r / 2) * 1.5  # 加点抖动
        else:
            # 正常收敛：指数趋近 final_accuracy
            acc = 55 + (final_accuracy - 55) * (1 - math.exp(-progress * 3.2))
            acc += math.sin(r / 3) * 0.6  # 微小抖动

        acc = round(max(50, min(95, acc)), 1)
        accuracy.append(acc)

        # 损失 = 基础损失 * (1 - 精度/100) 的近似
        base_loss = 1.4
        loss_val = base_loss * (1 - acc / 100) + math.sin(r / 4) * 0.05
        loss.append(round(max(0.2, loss_val), 3))

    return accuracy, loss


def generate_aggregation_strategy(
    task_id: str,
    malicious_ratio: float = 35,
    attack_type: str = "gradient_reverse",
    security_score: float | None = None,
) -> dict[str, Any]:
    """
    生成完整的算法策略决策结果

    参数：
        task_id: 任务 ID
        malicious_ratio: 恶意梯度比例
        attack_type: 攻击类型
        security_score: 算法层安全评分（用于安全联动）

    返回：
        完整的策略决策数据（供前端展示）
    """
    # 1. 推荐算法
    recommended, reason = recommend_algorithm(malicious_ratio, security_score)

    # 2. 生成所有算法的收敛曲线
    rounds = list(range(1, 21))
    curves = []
    for algo in ["FedAvg", "Krum", "GeometricMedian", "Bulyan"]:
        acc, loss = _generate_convergence_curve(algo, malicious_ratio)
        curves.append({
            "algorithm": algo,
            "rounds": rounds,
            "accuracy": acc,
            "loss": loss,
        })

    # 3. 生成决策日志
    decision_logs: list[str] = []

    if malicious_ratio > 10:
        decision_logs.append(
            f"训练监控检测到梯度异常，恶意比例 {malicious_ratio:.0f}%，攻击类型：{attack_type}。"
        )

    if security_score is not None and security_score < 70:
        decision_logs.append(
            f"安全态势评估：算法层评分 {security_score:.0f} 分（低于阈值 70），触发强制升级。"
        )

    decision_logs.append(f"RL 策略评估完成，推荐算法：{recommended}。")
    decision_logs.append(f"决策依据：{reason}")

    if recommended != "FedAvg":
        # 计算与 FedAvg 的精度差距（展示防御收益）
        fedavg_final = curves[0]["accuracy"][-1]
        recommended_final = next(c["accuracy"][-1] for c in curves if c["algorithm"] == recommended)
        gain = round(recommended_final - fedavg_final, 1)
        decision_logs.append(
            f"相比 FedAvg（最终精度 {fedavg_final}%），{recommended} 提升精度 {gain:+.1f} 个百分点。"
        )

    return {
        "taskId": task_id,
        "currentAlgorithm": recommended,
        "mode": "rl_auto",
        "maliciousRatio": round(malicious_ratio, 1),
        "attackType": attack_type,
        "reason": reason,
        "curves": curves,
        "decisionLogs": decision_logs,
    }


def calculate_algorithm_security_score(
    current_algorithm: str,
    malicious_ratio: float,
) -> float:
    """
    根据当前算法和恶意比例，计算算法层安全评分（0-100）

    用于安全→调度联动：算法层评分会影响整体安全态势

    参数：
        current_algorithm: 当前使用的聚合算法
        malicious_ratio: 恶意梯度比例

    返回：
        算法层安全评分（0-100）
    """
    profile = ALGORITHM_PROFILES.get(current_algorithm, ALGORITHM_PROFILES["FedAvg"])
    robustness = profile["robustness"]
    max_tolerated = profile["max_tolerated_malicious"]

    # 基础分 = 鲁棒性评分
    base_score = robustness

    # 如果恶意比例超出算法容忍范围，扣分
    if malicious_ratio > max_tolerated:
        overflow = malicious_ratio - max_tolerated
        penalty = overflow * 1.5
        base_score -= penalty

    return round(max(30, min(100, base_score)), 1)
