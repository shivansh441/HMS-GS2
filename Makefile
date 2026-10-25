.PHONY: dev test lint migrate seed types housekeeping clean

ROOT_DIR := $(shell pwd)
PYTHON := $(shell if [ -f $(ROOT_DIR)/backend/.venv/bin/python ]; then echo $(ROOT_DIR)/backend/.venv/bin/python; else echo python3; fi)
ALEMBIC := $(shell if [ -f $(ROOT_DIR)/backend/.venv/bin/alembic ]; then echo $(ROOT_DIR)/backend/.venv/bin/alembic; else echo alembic; fi)
PYTEST := $(shell if [ -f $(ROOT_DIR)/backend/.venv/bin/pytest ]; then echo $(ROOT_DIR)/backend/.venv/bin/pytest; else echo pytest; fi)
RUFF := $(shell if [ -f $(ROOT_DIR)/backend/.venv/bin/ruff ]; then echo $(ROOT_DIR)/backend/.venv/bin/ruff; else echo ruff; fi)
MYPY := $(shell if [ -f $(ROOT_DIR)/backend/.venv/bin/mypy ]; then echo $(ROOT_DIR)/backend/.venv/bin/mypy; else echo mypy; fi)

# Run all three services in parallel
dev:
	@echo "Starting Haven Stays Monorepo (Backend :8000, Admin :5173, Public :3000)..."
	@npm run dev

# Run all test suites
test:
	@echo "==> Running Backend pytest suite..."
	@cd backend && PYTHONPATH=. $(PYTEST) -v
	@echo "==> Type-checking admin-panel..."
	@npx tsc --noEmit -p admin-panel/tsconfig.json
	@echo "==> Type-checking public-website..."
	@npx tsc --noEmit -p public-website/tsconfig.json
	@echo "All tests and type-checks passed!"

# Lint everything
lint:
	@echo "==> Checking no-animation in admin panel..."
	@node admin-panel/scripts/check-no-animation.js
	@echo "==> Linting backend with ruff..."
	@cd backend && $(RUFF) check .
	@echo "==> Type-checking backend with mypy..."
	@cd backend && $(MYPY) app
	@echo "==> Type-checking admin-panel..."
	@npx tsc --noEmit -p admin-panel/tsconfig.json
	@echo "==> Type-checking public-website..."
	@npx tsc --noEmit -p public-website/tsconfig.json
	@echo "All linters passed cleanly!"

# Database migrations
migrate:
	@echo "==> Applying Alembic migrations..."
	@cd backend && $(ALEMBIC) upgrade head

# Database seeding
seed:
	@echo "==> Seeding database with properties and tenant roles..."
	@cd backend && $(PYTHON) scripts/seed.py

# Generate typed API client contracts
types:
	@echo "==> Exporting OpenAPI schema and generating TypeScript types..."
	@cd backend && $(PYTHON) -c 'import json; from app.main import app; print(json.dumps(app.openapi()))' > openapi.json
	@node scripts/generate-types.js

# Housekeeping job (archives stale unverified accounts > 7 days)
housekeeping:
	@echo "==> Executing user account housekeeping job..."
	@cd backend && $(PYTHON) scripts/housekeeping.py

clean:
	@rm -rf backend/.pytest_cache backend/.ruff_cache backend/haven_stays.db
	@echo "Cleaned temporary files."
