# Common tasks. `make help` lists them.

.DEFAULT_GOAL := help
POETRY ?= poetry

# pydantic-settings reads `.env` for the `ZZ_*` fields only; boto3 reads its
# credentials from the process environment. Exporting the file here gives the
# server and the scripts the same view of it (locally: moto's dummy keys).
-include .env
export

.PHONY: help install up down bootstrap migrate revision run test lint format typecheck check seed dev clean

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install:  ## Install dependencies (creates the lock file if missing)
	$(POETRY) install

up:  ## Start Postgres and the AWS emulator
	docker compose up -d
	@echo "postgres :5432 · moto :5001"

bootstrap:  ## Create the user pool, bucket and table in the emulator; write the ids to .env
	$(POETRY) run python -m zeitzeuge_api.scripts.bootstrap_local

dev: up bootstrap migrate seed  ## Everything a fresh laptop needs before `make run`

down:  ## Stop them
	docker compose down

migrate:  ## Apply migrations
	$(POETRY) run alembic upgrade head

revision:  ## Autogenerate a migration: make revision m="add x"
	$(POETRY) run alembic revision --autogenerate -m "$(m)"

run:  ## Run the API with reload
	$(POETRY) run uvicorn zeitzeuge_api.main:app --reload --port 8000

test:  ## Run the unit suite (no Docker required)
	$(POETRY) run pytest

test-integration:  ## Run everything, including the Postgres RLS tests
	$(POETRY) run pytest -m "integration or not integration"

lint:  ## Lint
	$(POETRY) run ruff check src tests

format:  ## Format
	$(POETRY) run ruff format src tests

typecheck:  ## Type-check
	$(POETRY) run mypy src

check: lint typecheck test  ## Everything CI runs

seed:  ## Create the local demo tenant and guest user
	$(POETRY) run python -m zeitzeuge_api.scripts.seed_demo

clean:
	rm -rf .pytest_cache .ruff_cache .mypy_cache htmlcov .coverage
	find . -name '__pycache__' -type d -prune -exec rm -rf {} +
