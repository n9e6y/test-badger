from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.db import SessionLocal
from app.queue import ArqQueue
from app.routers import artifacts, auth, health, projects, runs
from app.services.demo import ensure_demo_project

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    queue = ArqQueue()
    app.state.queue = queue
    async with SessionLocal() as session:
        await ensure_demo_project(session)
    yield
    await queue.close()


app = FastAPI(
    title="ShipCheck API", docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=lifespan
)

for router in (health.router, auth.router, projects.router, runs.router, artifacts.router):
    app.include_router(router, prefix="/api")


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse({"detail": "Something went wrong on our side. Please try again."}, 500)
