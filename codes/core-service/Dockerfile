FROM python:3.12-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

COPY pyproject.toml uv.lock ./
ENV UV_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ENV UV_HTTP_TIMEOUT=600
ENV UV_CONCURRENT_DOWNLOADS=8
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --default-index https://pypi.tuna.tsinghua.edu.cn/simple

ARG BUILD_REVISION=local
RUN echo "core-service revision: ${BUILD_REVISION}"

COPY alembic.ini ./
COPY app ./app

ENV PYTHONPATH=.
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

# Use pre-built .venv directly — avoid `uv run` re-syncing deps at container start.
CMD ["sh", "-c", "python -m alembic upgrade head && exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"]
