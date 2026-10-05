# Two targets from one file: `api` (slim) and `worker` (Playwright + Chromium).
# Build context: backend/

FROM ghcr.io/astral-sh/uv:0.12 AS uv

# ---------- api ----------
FROM python:3.12-slim-bookworm AS api
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_PROJECT_ENVIRONMENT=/opt/venv UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy \
    PATH=/opt/venv/bin:$PATH PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY . .
RUN useradd --create-home --uid 1000 app && mkdir -p /data/artifacts && chown -R app /data
USER app
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]

# ---------- worker ----------
# Tag must match the playwright version pinned in pyproject.toml.
FROM mcr.microsoft.com/playwright/python:v1.63.0-noble AS worker
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_PROJECT_ENVIRONMENT=/opt/venv UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never PATH=/opt/venv/bin:$PATH PYTHONUNBUFFERED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY . .
# The base image ships a non-root user `pwuser`.
RUN mkdir -p /data/artifacts && chown -R pwuser /data
USER pwuser
CMD ["arq", "worker.WorkerSettings"]
