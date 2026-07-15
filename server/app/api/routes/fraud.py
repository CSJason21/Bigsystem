from fastapi import APIRouter
from typing import Optional
import random
import time

router = APIRouter()


@router.get("/fraud/overview")
async def get_fraud_overview():
    """Get fraud detection overview statistics."""
    return {
        "total_calls_analyzed": random.randint(100000, 500000),
        "fraud_detected": random.randint(500, 3000),
        "fraud_rate": round(random.uniform(0.5, 3.0), 2),
        "high_risk_users": random.randint(50, 200),
        "model_accuracy": round(random.uniform(92, 98), 1),
        "last_updated": int(time.time()),
    }


@router.get("/fraud/users")
async def get_fraud_users(
    page: int = 1,
    page_size: int = 20,
    risk_level: Optional[str] = None,
):
    """Get list of identified fraud users."""
    users = [
        {
            "user_id": f"USR-{random.randint(10000, 99999)}",
            "phone": f"1{random.randint(30, 89):02d}****{random.randint(1000, 9999)}",
            "risk_level": random.choice(["high", "medium", "low"]),
            "risk_score": round(random.uniform(0.3, 0.99), 3),
            "fraud_type": random.choice(["telecom", "finance", "impersonation", "phishing"]),
            "call_count": random.randint(10, 500),
            "detected_at": int(time.time()) - random.randint(0, 604800),
        }
        for _ in range(page_size)
    ]
    if risk_level:
        users = [u for u in users if u["risk_level"] == risk_level]
    return {"page": page, "page_size": page_size, "total": 156, "users": users}


@router.get("/fraud/statistics/daily")
async def get_fraud_daily_stats(days: int = 7):
    """Get daily fraud statistics for trend analysis."""
    return {
        "days": days,
        "data": [
            {
                "date": f"2025-03-{23 - i:02d}",
                "fraud_calls": random.randint(50, 300),
                "normal_calls": random.randint(5000, 20000),
                "blocked": random.randint(30, 200),
            }
            for i in range(days)
        ],
    }


@router.get("/fraud/statistics/city")
async def get_fraud_city_stats():
    """Get fraud statistics by city."""
    cities = ["Beijing", "Shanghai", "Guangzhou", "Shenzhen", "Chengdu",
              "Hangzhou", "Wuhan", "Nanjing", "Chongqing", "Tianjin"]
    return {
        "cities": [
            {
                "name": city,
                "fraud_count": random.randint(20, 500),
                "fraud_rate": round(random.uniform(0.5, 5.0), 2),
                "longitude": round(random.uniform(104, 121), 4),
                "latitude": round(random.uniform(23, 40), 4),
            }
            for city in cities
        ]
    }


@router.get("/fraud/text-mining")
async def get_text_mining_data():
    """Get text mining analysis results for fraud SMS/messages."""
    domains = ["finance", "telecom", "government", "e-commerce", "social"]
    return {
        "domain_distribution": [
            {"domain": d, "count": random.randint(50, 500)} for d in domains
        ],
        "similarity_network": {
            "nodes": [{"id": f"msg-{i}", "label": f"Msg {i}", "group": random.choice(domains)} for i in range(20)],
            "edges": [{"source": f"msg-{random.randint(0, 19)}", "target": f"msg-{random.randint(0, 19)}", "similarity": round(random.uniform(0.5, 1.0), 2)} for _ in range(30)],
        },
        "feature_scatter": [
            {"x": round(random.uniform(-5, 5), 2), "y": round(random.uniform(-5, 5), 2), "label": random.choice(["fraud", "normal"])}
            for _ in range(100)
        ],
    }


@router.get("/fraud/communication-mining")
async def get_communication_mining_data():
    """Get communication data mining results."""
    return {
        "sms_heatmap": [
            [i, j, random.randint(0, 100)]
            for i in range(24) for j in range(7)
        ],
        "identity_phone_chart": [
            {
                "identity_id": f"ID-{i}",
                "phone_count": random.randint(1, 8),
                "fraud_score": round(random.uniform(0, 1), 2),
            }
            for i in range(15)
        ],
    }


@router.get("/fraud/behavior/{user_id}")
async def get_user_behavior(user_id: str):
    """Get behavior tracking data for a specific user."""
    return {
        "user_id": user_id,
        "behavior_hash": f"SHA256:{random.randbytes(16).hex()}",
        "call_records": [
            {
                "timestamp": int(time.time()) - random.randint(0, 86400),
                "duration": random.randint(5, 600),
                "type": random.choice(["inbound", "outbound"]),
                "flagged": random.choice([True, False]),
            }
            for _ in range(20)
        ],
        "risk_tags": random.sample(
            ["high_frequency", "short_duration", "new_contacts", "night_activity", "cross_region"],
            k=random.randint(1, 3),
        ),
    }
