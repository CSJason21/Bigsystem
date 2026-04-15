from fastapi import APIRouter

from app.services.prediction_allocation_data import (
    get_daily_prediction,
    get_monthly_prediction,
)


router = APIRouter()


@router.get("/daily")
async def daily_prediction():
    return get_daily_prediction()


@router.get("/monthly")
async def monthly_prediction():
    return get_monthly_prediction()
