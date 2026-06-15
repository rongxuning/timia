.PHONY: dev db api web api-install web-install verify local codegen

dev: db
	@echo "Run in separate terminals:"
	@echo "  make api-install && make api"
	@echo "  make web-install && make web"

db:
	docker compose -f docker-compose.local.yml up -d db

UV_HTTP_TIMEOUT ?= 300

api-install:
	cd codes/api && UV_HTTP_TIMEOUT=$(UV_HTTP_TIMEOUT) uv sync

api: api-install
	cd codes/api && PYTHONPATH=. uv run python -m alembic upgrade head && uv run uvicorn app.main:app --reload --port 8000

web-install:
	cd codes/web && npm install

web:
	cd codes/web && npm run dev -- --port 3000 --webpack

local:
	bash deploy/local/up.sh

verify:
	bash deploy/verify.sh

codegen:
	cd codes/api && PYTHONPATH=. uv run python scripts/export_openapi.py
	cd codes/web && npm run codegen:types

