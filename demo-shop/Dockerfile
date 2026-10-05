# Build context: demo-shop/
FROM ghcr.io/astral-sh/uv:0.12 AS uv

FROM python:3.12-slim-bookworm
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_PROJECT_ENVIRONMENT=/opt/venv UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy \
    PATH=/opt/venv/bin:$PATH PYTHONUNBUFFERED=1 SHOP_DB_PATH=/data/shop.sqlite3
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY shop ./shop
COPY templates ./templates
COPY static ./static
RUN useradd --create-home --uid 1000 shop && mkdir -p /data && chown shop /data
USER shop
EXPOSE 8100
CMD ["uvicorn", "shop.main:app", "--host", "0.0.0.0", "--port", "8100", "--proxy-headers", "--forwarded-allow-ips=*"]
