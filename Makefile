.PHONY: help install build dev test test-unit test-integration test-watch test-watch-unit test-watch-integration test-coverage test-db-up test-db-down建 clean clean-test

# Default target
help:
	@echo "Database Schema MCP Server - Available Commands"
	@echo ""
	@echo "Installation & Build:"
	@echo "  make install              - Install dependencies"
	@echo "  make build                - Build TypeScript code"
	@echo "  make dev                  - Run in watch mode (auto-rebuild)"
	@echo ""
	@echo "Testing:"
	@echo "  make test                 - Run all tests (unit + integration)"
	@echo "  make test-unit            - Run unit tests only"
	@echo "  make test-integration     - Run integration tests with databases"
	@echo "  make test-watch           - Run all tests in watch mode"
	@echo "  make test-watch-unit      - Run unit tests in watch mode"
	@echo "  make test-watch-integration - Run integration tests in watch mode"
	@echo "  make test-coverage        - Run tests with coverage report"
	@echo ""
	@echo "Test Databases:"
	@echo "  make test-db-up           - Start all test databases (Docker)"
	@echo "  make test-db-down         - Stop and remove test databases"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean                - Remove build artifacts and dependencies"
	@echo "  make clean-test           - Remove test artifacts only"
	@echo ""

# Installation & Build
install:
	npm install

build:
	npm run build

dev:
	npm run dev

# Testing
test:
	npm test

test-unit:
	npm run test:unit

test-integration: test-db-up
	@echo "Waiting for databases to be ready..."
	@sleep 10
	npm run test:integration
	@$(MAKE) test-db-down

test-watch:
	npm run test:watch

test-watch-unit:
	npm run test:watch:unit

test-watch-integration:
	npm run test:watch:integration

test-coverage:
	npm run test:coverage

# Test Database Management
test-db-up:
	cd tests/integration && docker-compose up -d
	@echo "Waiting for databases to initialize..."
	@sleep 5
	@cd tests/integration && docker-compose ps

# Clean
clean:
	rm -rf node_modules dist coverage
	find . -name "*.sqlite" -type f -delete
	find . -name "test-*.json" -type f -delete

clean-test:
	rm -rf coverage
	find . -name "*.sqlite" -type f -delete
	find . -name "test-*.json" -type f -delete

# Quick start for development
start: install build
	npm start

# Full test cycle
test-all: clean install build test-integration test-coverage
