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

local:
	bash deploy/local/up.sh

verify:
	bash deploy/verify.sh

codegen:
	cd codes/core-service && PYTHONPATH=. uv run python scripts/export_openapi.py
	cd codes/web && npm run codegen:types
