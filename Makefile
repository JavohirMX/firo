# Firo - common development tasks.
# Targets wrap the yarn scripts in package.json (yarn workspaces monorepo).
# Run `make help` to list them.

YARN ?= yarn
# Test and typecheck runs are stable at this heap on small dev hosts.
TEST_NODE_OPTIONS ?= --max-old-space-size=1536

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
