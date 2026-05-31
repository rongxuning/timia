.PHONY: dev db api web api-install web-install

dev: db
	@echo "Run in separate terminals:"
	@echo "  make api-install && make api"
	@echo "  make web-install && make web"

db:
	docker compose up -d db

UV_HTTP_TIMEOUT ?= 300

api-install:
	cd apps/api && UV_HTTP_TIMEOUT=$(UV_HTTP_TIMEOUT) uv sync

api: api-install
	cd apps/api && PYTHONPATH=. uv run alembic upgrade head && uv run uvicorn app.main:app --reload --port 8000

web-install:
	cd apps/web && npm install

web:
	cd apps/web && npm run dev -- --port 3000

