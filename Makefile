.PHONY: dev db core-service file-service web core-service-install file-service-install web-install verify local codegen kill-port-8000 kill-port-8003 kill-port-3000 mcp-server-install mcp-server-test mcp-server-http docker-up docker-down docker-ps docker-logs docker-verify

# Kill whatever is holding port 8000 (uvicorn / fastapi). No-op if free.
# 1s grace period, then SIGKILL if still alive.
kill-port-8000:
	@PID=$$(lsof -ti :8000 2>/dev/null); \
	if [ -n "$$PID" ]; then \
		echo "Port 8000 busy, killing PID $$PID"; \
		kill $$PID 2>/dev/null; sleep 1; \
		PID=$$(lsof -ti :8000 2>/dev/null); \
		if [ -n "$$PID" ]; then echo "  force-kill $$PID"; kill -9 $$PID 2>/dev/null; sleep 1; fi; \
	else \
		echo "Port 8000 free"; \
	fi

# Same for the Next.js dev server.
kill-port-3000:
	@PID=$$(lsof -ti :3000 2>/dev/null); \
	if [ -n "$$PID" ]; then \
		echo "Port 3000 busy, killing PID $$PID"; \
		kill $$PID 2>/dev/null; sleep 1; \
		PID=$$(lsof -ti :3000 2>/dev/null); \
		if [ -n "$$PID" ]; then echo "  force-kill $$PID"; kill -9 $$PID 2>/dev/null; sleep 1; fi; \
	else \
		echo "Port 3000 free"; \
	fi

# Wipe both — handy when you know nothing should be running.
kill-port-8003:
	@PID=$$(lsof -ti :8003 2>/dev/null); \
	if [ -n "$$PID" ]; then \
		echo "Port 8003 busy, killing PID $$PID"; \
		kill $$PID 2>/dev/null; sleep 1; \
		PID=$$(lsof -ti :8003 2>/dev/null); \
		if [ -n "$$PID" ]; then echo "  force-kill $$PID"; kill -9 $$PID 2>/dev/null; sleep 1; fi; \
	else \
		echo "Port 8003 free"; \
	fi

kill-ports: kill-port-8000 kill-port-8003 kill-port-3000
	@true

dev: db
	@echo "Run in separate terminals:"
	@echo "  make core-service-install && make core-service"
	@echo "  make file-service-install && make file-service"
	@echo "  make web-install && make web"

DOCKER_COMPOSE_LOCAL = docker compose -f docker-compose.local.yml --env-file .env.docker

db:
	$(DOCKER_COMPOSE_LOCAL) up -d db minio

# Full stack in Docker (web + APIs + mcp + nginx). Open http://localhost:8080
docker-up:
	$(DOCKER_COMPOSE_LOCAL) up -d --build

docker-down:
	$(DOCKER_COMPOSE_LOCAL) down

docker-ps:
	$(DOCKER_COMPOSE_LOCAL) ps

docker-logs:
	$(DOCKER_COMPOSE_LOCAL) logs -f --tail=80

docker-verify:
	@fail=0; \
	if curl -sf http://127.0.0.1:8080/core-service/health | grep -q '"ok"'; then \
	  echo "OK  API  http://127.0.0.1:8080/core-service/health"; \
	else \
	  echo "FAIL API  http://127.0.0.1:8080/core-service/health"; fail=1; \
	fi; \
	if curl -sf http://127.0.0.1:8080/file-service/health | grep -q '"ok"'; then \
	  echo "OK  File http://127.0.0.1:8080/file-service/health"; \
	else \
	  echo "FAIL File http://127.0.0.1:8080/file-service/health"; fail=1; \
	fi; \
	if curl -sf http://127.0.0.1:8080/mcp-health | grep -q '"ok"'; then \
	  echo "OK  MCP  http://127.0.0.1:8080/mcp-health"; \
	else \
	  echo "FAIL MCP  http://127.0.0.1:8080/mcp-health"; fail=1; \
	fi; \
	code=$$(curl -sf -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/); \
	if echo "$$code" | grep -qE '^(200|307|308)$$'; then \
	  echo "OK  Web  http://127.0.0.1:8080/ ($$code)"; \
	else \
	  echo "FAIL Web  http://127.0.0.1:8080/ ($$code)"; fail=1; \
	fi; \
	[[ $$fail -eq 0 ]] && echo "Docker stack verify passed." || exit 1

UV_HTTP_TIMEOUT ?= 300

# --- Backend services (codes/<service>/, independent uv + docker + nginx location) ---

core-service-install:
	cd codes/core-service && UV_HTTP_TIMEOUT=$(UV_HTTP_TIMEOUT) uv sync

core-service: core-service-install kill-port-8000
	cd codes/core-service && PYTHONPATH=. uv run python -m alembic upgrade head && uv run python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

file-service-install:
	cd codes/file-service && UV_HTTP_TIMEOUT=$(UV_HTTP_TIMEOUT) uv sync

file-service: file-service-install kill-port-8003
	set -a; \
	[ -f codes/core-service/.env ] && . codes/core-service/.env; \
	[ -f codes/file-service/.env ] && . codes/file-service/.env; \
	set +a; \
	cd codes/file-service && PYTHONPATH=. \
	  MEDIA_BACKEND=$${MEDIA_BACKEND:-s3} \
	  MEDIA_S3_ENDPOINT=$${MEDIA_S3_ENDPOINT:-http://127.0.0.1:9000} \
	  uv run python -m alembic upgrade head && \
	  PYTHONPATH=. MEDIA_BACKEND=$${MEDIA_BACKEND:-s3} \
	  MEDIA_S3_ENDPOINT=$${MEDIA_S3_ENDPOINT:-http://127.0.0.1:9000} \
	  uv run python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8003

# Future: notification-service-install / notification-service (port 8001), etc.

web-install:
	cd codes/web && npm install

web: kill-port-3000
	cd codes/web && npm run dev -- --port 3000 --webpack

local: db
	@echo ""
	@echo "Next (separate terminals):"
	@echo "  make core-service-install && make core-service"
	@echo "  make file-service-install && make file-service"
	@echo "  make web-install && make web"
	@echo ""
	@echo "Verify: make verify"

verify:
	@fail=0; \
	if curl -sf http://127.0.0.1:8000/health | grep -q '"ok"'; then \
	  echo "OK  API health http://127.0.0.1:8000/health"; \
	else \
	  echo "FAIL API health http://127.0.0.1:8000/health"; fail=1; \
	fi; \
	if curl -sf http://127.0.0.1:8003/health | grep -q '"ok"'; then \
	  echo "OK  File API health http://127.0.0.1:8003/health"; \
	else \
	  echo "WARN File API not reachable (start with: make file-service)"; \
	fi; \
	if curl -sf -o /dev/null -w "%{http_code}" http://127.0.0.1:3000 | grep -qE '^(200|307|308)$$'; then \
	  echo "OK  Web http://127.0.0.1:3000"; \
	else \
	  echo "WARN Web not reachable (start with: make web)"; \
	fi; \
	[[ $$fail -eq 0 ]] && echo "Verify passed." || exit 1

codegen:
	cd codes/core-service && PYTHONPATH=. uv run python scripts/export_openapi.py
	cd codes/file-service && PYTHONPATH=. uv run python scripts/export_openapi.py
	cd codes/web && npm run codegen:types && npm run codegen:file-types

mcp-server-install:
	cd codes/mcp-server && UV_HTTP_TIMEOUT=$(UV_HTTP_TIMEOUT) uv sync

mcp-server-test: mcp-server-install
	cd codes/mcp-server && uv run pytest -q

mcp-server-http: mcp-server-install
	cd codes/mcp-server && \
	  TIMIA_MCP_TRANSPORT=http TIMIA_MCP_HOST=127.0.0.1 \
	  TIMIA_API_BASE=$${TIMIA_API_BASE:-http://127.0.0.1:8000} \
	  uv run timia-mcp
