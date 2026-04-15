from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from loguru import logger

from app.core.config import settings
from app.core.database import engine, Base
from app.api.routes import resources, tasks, fraud, chat, prediction, allocation


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup & shutdown events."""
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    # Create database tables
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created")
    yield
    logger.info("Shutting down...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Backend API for the Reinforced Federated Learning Prototype System",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(resources.router, prefix=settings.API_PREFIX, tags=["Resources"])
app.include_router(tasks.router, prefix=settings.API_PREFIX, tags=["Tasks"])
app.include_router(fraud.router, prefix=settings.API_PREFIX, tags=["Fraud Detection"])
app.include_router(chat.router, prefix=settings.API_PREFIX, tags=["Chat"])

# Computing Network Collaborative Prediction & Allocation
app.include_router(
    prediction.router,
    prefix=f"{settings.API_PREFIX}/prediction",
    tags=["算力预测"],
)
app.include_router(
    allocation.router,
    prefix=f"{settings.API_PREFIX}/allocation",
    tags=["算力分配"],
)


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "version": settings.APP_VERSION}
