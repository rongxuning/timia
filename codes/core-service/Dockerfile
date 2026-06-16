FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

ARG BUILD_REVISION=local
RUN echo "core-service revision: ${BUILD_REVISION}"

COPY alembic.ini ./
COPY app ./app

ENV PYTHONPATH=.

EXPOSE 8000

CMD ["sh", "-c", "uv run python -m alembic upgrade head && uv run python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"]
