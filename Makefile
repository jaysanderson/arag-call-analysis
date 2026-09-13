# Call Analysis — task runner. bun installs dependencies and dev tooling; npm is never used.
BUN ?= bun
NODE ?= node
PORT ?= 3000
IMAGE ?= call-analysis:local

.PHONY: help install dev build start test coverage e2e lint format typecheck audit check docs showcase smoke smoke-write docker fly-validate provision ingest gen-media reset clean

help:
	@echo "make install      bun install (exact pins, committed bun.lock)"
	@echo "make dev          run Next.js in dev mode on :$(PORT) (ARAG_MOCK=1 unless .env has credentials)"
	@echo "make build        production build (standalone output)"
	@echo "make start        run the production build"
	@echo "make test         unit + integration + contract tests against the mock ARAG"
	@echo "make coverage     tests with the 80% coverage gate on lib/ and services/"
	@echo "make e2e          Playwright: dashboard → calls → detail → ask → citation, and admin"
	@echo "make lint         biome check"
	@echo "make format       biome format --write"
	@echo "make typecheck    tsc --noEmit"
	@echo "make audit        dependency audit; fails on un-waived high/critical advisories"
	@echo "make check        lint + typecheck + audit + coverage"
	@echo "make docs         regenerate docs/developer/api-reference.md from the OpenAPI document"
	@echo "make showcase     record the showcase walkthrough into showcase/out"
	@echo "make smoke        OPT-IN read-only live check against the real Knowledge Box"
	@echo "make smoke-write  OPT-IN live WRITE check (CALLS_ALLOW_LIVE_WRITE=1); cleans up after itself"
	@echo "make docker       build the container image"
	@echo "make fly-validate validate fly.toml"
	@echo "make provision    create labelsets + (re)start agents on a running server"
	@echo "make gen-media    render demo call media (optional, macOS say + ffmpeg) + manifest"
	@echo "make ingest       ingest scripts/output/manifest.json into a running server"

install:
	$(BUN) install --frozen-lockfile || $(BUN) install

dev:
	@test -f .env || cp .env.example .env
	@if grep -qE '^ARAG_API_KEY=.+' .env 2>/dev/null; then \
		PORT=$(PORT) $(BUN)x next dev -p $(PORT); \
	else \
		echo "No ARAG_API_KEY in .env — starting against the in-process mock ARAG (ARAG_MOCK=1)."; \
		ARAG_MOCK=1 ADMIN_TOKEN=$${ADMIN_TOKEN:-dev-admin-token} PORT=$(PORT) $(BUN)x next dev -p $(PORT); \
	fi

build:
	ENV_FILE=/dev/null ARAG_MOCK=1 $(BUN)x next build

start:
	NODE_ENV=production $(BUN)x next start -p $(PORT)

# The integration and contract suites drive a real `next start`, so the build must be current
# before they run. The harness also rebuilds on demand, but doing it here keeps the run
# deterministic when vitest executes files in parallel.
test: build
	$(BUN)x vitest run

coverage: build
	$(BUN)x vitest run --coverage

# The Playwright fixture directory is wiped first: `DATA_DIR=./data/e2e` persists settings, API
# keys, saved views and share links between runs, so a suite that inherited them would be testing
# the previous run rather than the product. The specs clean up after themselves as well — this is
# the belt to that pair of braces.
e2e: build
	rm -rf data/e2e
	PW_DISABLE_TS_ESM=1 $(BUN)x playwright test

lint:
	$(BUN)x biome check .

format:
	$(BUN)x biome format --write .

typecheck:
	$(BUN)x tsc --noEmit -p tsconfig.json

audit:
	$(NODE) scripts/audit.ts --level high

check: lint typecheck audit coverage

docs:
	$(NODE) scripts/gen-api-reference.ts

showcase: build
	SHOWCASE=1 PW_DISABLE_TS_ESM=1 $(BUN)x playwright test --config playwright.config.ts

smoke:
	$(NODE) scripts/smoke.ts

# OPT-IN live WRITE check. Creates and deletes real Knowledge Box resources; refuses to run
# without CALLS_ALLOW_LIVE_WRITE=1, and never touches the seeded demo calls.
smoke-write: build
	$(NODE) scripts/smoke-write.ts

docker:
	docker build -t $(IMAGE) .

fly-validate:
	fly config validate -c fly.toml

provision:
	$(NODE) scripts/provision.ts

gen-media:
	$(NODE) scripts/gen-media.ts

ingest:
	$(NODE) scripts/ingest.ts

reset:
	$(NODE) scripts/reset.ts --yes-i-know

clean:
	rm -rf .next data test-results showcase/out coverage
