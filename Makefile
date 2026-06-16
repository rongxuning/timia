.PHONY: dev db core-service web core-service-install web-install verify local codegen

dev: db
	@echo "Run in separate terminals:"
	@echo "  make core-service-install && make core-service"
	@echo "  make web-install && make web"

db:
	docker compose -f docker-compose.local.yml up -d db

UV_HTTP_TIMEOUT ?= 300

# --- Backend services (codes/<service>/, independent uv + docker + nginx location) ---

core-service-install:
	cd codes/core-service && UV_HTTP_TIMEOUT=$(UV_HTTP_TIMEOUT) uv sync

core-service: core-service-install
	cd codes/core-service && PYTHONPATH=. uv run python -m alembic upgrade head && uv run python -m uvicorn app.main:app --reload --port 8000

# Future: notification-service-install / notification-service (port 8001), etc.

web-install:
	cd codes/web && npm install

web:
	cd codes/web && npm run dev -- --port 3000 --webpack

local: db
	@echo ""
	@echo "Next (separate terminals):"
	@echo "  make core-service-install && make core-service"
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
	if curl -sf -o /dev/null -w "%{http_code}" http://127.0.0.1:3000 | grep -qE '^(200|307|308)$$'; then \
	  echo "OK  Web http://127.0.0.1:3000"; \
	else \
	  echo "WARN Web not reachable (start with: make web)"; \
	fi; \
	[[ $$fail -eq 0 ]] && echo "Verify passed." || exit 1

codegen:
	cd codes/core-service && PYTHONPATH=. uv run python scripts/export_openapi.py
	cd codes/web && npm run codegen:types
