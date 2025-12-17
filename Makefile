.PHONY: help install build dev test test-watch test-coverage test-db-up test-db-down test-db-logs test-integration clean lint format

# Default target
help:
	@echo "Database Schema MCP Server - Available Commands"
	@echo ""
	@echo "Installation & Build:"
	@echo "  make install          - Install dependencies"
	@echo "  make build            - Build TypeScript code"
	@echo "  make dev              - Run in watch mode (auto-rebuild)"
	@echo ""
	@echo "Testing:"
	@echo "  make test             - Run all tests"
	@echo "  make test-watch       - Run tests in watch mode"
	@echo "  make test-coverage    - Run tests with coverage report"
	@echo "  make test-integration - Run integration tests with databases"
	@echo ""
	@echo "Test Databases:"
	@echo "  make test-db-up       - Start all test databases (Docker)"
	@echo "  make test-db-down     - Stop and remove test databases"
	@echo "  make test-db-logs     - Show test database logs"
	@echo "  make test-db-status   - Check test database status"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean            - Remove build artifacts and dependencies"
	@echo "  make clean-test       - Remove test artifacts only"
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

test-watch:
	npm run test:watch

test-coverage:
	npm run test:coverage

# Integration tests with databases
test-integration: test-db-up
	@echo "Waiting for databases to be ready..."
	@sleep 10
	npm run test:integration
	@$(MAKE) test-db-down

# Test Database Management
test-db-up:
	docker-compose up -d
	@echo "Waiting for databases to initialize..."
	@sleep 5
	@docker-compose ps

test-db-down:
	docker-compose down -v

test-db-logs:
	docker-compose logs -f

test-db-status:
	@docker-compose ps
	@echo ""
	@echo "Testing database connectivity..."
	@docker-compose exec -T mysql mysqladmin ping -h localhost -ptest_password || echo "MySQL: Not ready"
	@docker-compose exec -T postgres pg_isready -U postgres || echo "PostgreSQL: Not ready"
	@docker-compose exec -T mongodb mongosh --eval "db.adminCommand('ping')" || echo "MongoDB: Not ready"
	@docker-compose exec -T redis redis-cli -a test_password ping || echo "Redis: Not ready"

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
