FROM python:3.12-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

COPY pyproject.toml uv.lock ./
COPY src ./src
ENV UV_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ENV UV_HTTP_TIMEOUT=600
ENV UV_CONCURRENT_DOWNLOADS=8
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --default-index https://pypi.tuna.tsinghua.edu.cn/simple

ARG BUILD_REVISION=local
RUN echo "mcp-server revision: ${BUILD_REVISION}"

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8100

ENV TIMIA_MCP_TRANSPORT=http
ENV TIMIA_MCP_HOST=0.0.0.0
ENV TIMIA_MCP_PORT=8100
ENV TIMIA_MCP_PATH=/mcp

CMD ["timia-mcp"]
