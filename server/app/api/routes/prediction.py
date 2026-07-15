from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.prediction_allocation_data import (
    get_daily_prediction,
    get_monthly_prediction,
)
from app.core.cache import cached
from app.services.scheduling_context import get_prediction_scheduling_insights


router = APIRouter()


@router.get("/daily")
async def daily_prediction(db: Session = Depends(get_db)):
    return get_daily_prediction(db)


@router.get("/monthly")
async def monthly_prediction(db: Session = Depends(get_db)):
    return get_monthly_prediction(db)


@router.get("/scheduling-insights")
@cached(ttl=20, key_prefix="prediction_scheduling_insights")
async def scheduling_insights():
    return get_prediction_scheduling_insights()
