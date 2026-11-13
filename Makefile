# Firo - common development tasks.
# Targets wrap the yarn scripts in package.json (yarn workspaces monorepo).
# Run `make help` to list them.

YARN ?= yarn
# A single full-suite pass accumulates heap per worker across files; 1536
# OOMs workers mid-run. 3072 completed 356 files / 5161 tests green on an
# 8 GB host (2026-11-13, head 83cef557). Override per host as needed.
TEST_NODE_OPTIONS ?= --max-old-space-size=3072

.PHONY: help install start build test coverage typecheck lint format fix verify check

help: ## List available targets
	@grep -hE '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*## "}; {printf "  %-12s %s\n", $$1, $$2}'

install: ## Install dependencies (yarn workspaces)
	$(YARN) install

start: ## Start the web app dev server
	$(YARN) start

build: ## Production build of the web app (needs >2 GB free RAM)
	$(YARN) build

test: ## Run the vitest suite once
	NODE_OPTIONS="$(TEST_NODE_OPTIONS)" $(YARN) test:app --watch=false

coverage: ## Run vitest with coverage
	NODE_OPTIONS="$(TEST_NODE_OPTIONS)" $(YARN) test:coverage --watch=false

typecheck: ## TypeScript project check (tsc)
	NODE_OPTIONS="$(TEST_NODE_OPTIONS)" $(YARN) test:typecheck

lint: ## ESLint, zero warnings allowed
	$(YARN) test:code

format: ## Prettier check (lists files that differ)
	$(YARN) test:other

fix: ## Auto-fix formatting, then lint issues
	$(YARN) fix

verify: ## Contrast and accessibility verification scripts
	$(YARN) verify:contrast && $(YARN) verify:a11y

check: typecheck lint format test ## Full local gate: typecheck, lint, format, tests
