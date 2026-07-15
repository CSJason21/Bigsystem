# Security assessment schemas
from pydantic import BaseModel
from typing import Optional


class SecurityDimension(BaseModel):
    """Schema for a single security assessment dimension."""
    name: str
    score: float
    weight: float = 1.0
    status: str = "normal"  # normal / warning / critical


class SecurityAssessment(BaseModel):
    """Full security assessment result."""
    overall_score: float
    risk_level: str  # low / medium / high / critical
    dimensions: list[SecurityDimension]
    recommendations: list[str]
    timestamp: int


class NodeResource(BaseModel):
    """Schema for node resource data."""
    node_id: str
    hostname: str
    cpu_usage: float
    memory_usage: float
    disk_usage: float
    gpu_usage: Optional[float] = None
    status: str = "online"


class FraudUser(BaseModel):
    """Schema for a detected fraud user."""
    user_id: str
    phone: str
    risk_level: str
    risk_score: float
    fraud_type: str
    call_count: int
    detected_at: int
