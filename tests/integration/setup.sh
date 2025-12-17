#!/bin/bash

# Integration Test Setup Script
# This script manages the Docker environment for integration tests

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

function print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

function print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

function start_services() {
    local services="$1"
    print_info "Starting integration test environment..."

    if [ -z "$services" ]; then
        docker-compose -f "$COMPOSE_FILE" up -d
    else
        docker-compose -f "$COMPOSE_FILE" up -d $services
    fi

    print_info "Waiting for services to be healthy..."
    sleep 10
}

function stop_services() {
    print_info "Stopping integration test environment..."
    docker-compose -f "$COMPOSE_FILE" down
}

function restart_services() {
    print_info "Restarting integration test environment..."
    stop_services
    start_services "$1"
}

function show_status() {
    print_info "Service status:"
    docker-compose -f "$COMPOSE_FILE" ps
}

function show_logs() {
    local service="$1"
    if [ -z "$service" ]; then
        docker-compose -f "$COMPOSE_FILE" logs --tail=100
    else
        docker-compose -f "$COMPOSE_FILE" logs --tail=100 "$service"
    fi
}

function cleanup() {
    print_warn "Cleaning up all containers, volumes, and networks..."
    docker-compose -f "$COMPOSE_FILE" down -v
    print_info "Cleanup complete"
}

function init_test_data() {
    print_info "Initializing test data..."

    # Wait for all services to be ready
    sleep 15

    # MySQL
    print_info "Initializing MySQL test data..."
    docker exec mcp-integration-mysql mysql -uroot -ptest_password testdb -e "
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100),
            email VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_email ON users(email);
    " || print_warn "MySQL init failed (may already exist)"

    # PostgreSQL
    print_info "Initializing PostgreSQL test data..."
    docker exec mcp-integration-postgres psql -U postgres -d testdb -c "
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100),
            email VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_email ON users(email);
    " || print_warn "PostgreSQL init failed (may already exist)"

    # MongoDB
    print_info "Initializing MongoDB test data..."
    docker exec mcp-integration-mongodb mongosh -u root -p test_password --authenticationDatabase admin testdb --eval "
        db.users.createIndex({ email: 1 });
        db.createCollection('products');
    " || print_warn "MongoDB init failed (may already exist)"

    # Redis
    print_info "Initializing Redis test data..."
    docker exec mcp-integration-redis redis-cli -a test_password SET test:key "test_value" || print_warn "Redis init failed"

    # Kafka
    print_info "Creating Kafka test topics..."
    docker exec mcp-integration-kafka kafka-topics --bootstrap-server localhost:9092 --create --if-not-exists --topic test-topic --partitions 1 --replication-factor 1 || print_warn "Kafka topic creation failed"

    # RabbitMQ
    print_info "Creating RabbitMQ test resources..."
    docker exec mcp-integration-rabbitmq rabbitmqadmin -u guest -p test_password declare queue name=test-queue durable=true || print_warn "RabbitMQ queue creation failed"

    # Elasticsearch
    print_info "Creating Elasticsearch test index..."
    docker exec mcp-integration-elasticsearch curl -X PUT "localhost:9200/test-index" -H 'Content-Type: application/json' -d'
    {
      "mappings": {
        "properties": {
          "name": { "type": "text" },
          "age": { "type": "integer" }
        }
      }
    }
    ' || print_warn "Elasticsearch index creation failed"

    # ClickHouse
    print_info "Initializing ClickHouse test data..."
    docker exec mcp-integration-clickhouse clickhouse-client --password=test_password --query="
        CREATE TABLE IF NOT EXISTS testdb.events (
            id UInt32,
            name String,
            timestamp DateTime
        ) ENGINE = MergeTree()
        ORDER BY id;
    " || print_warn "ClickHouse init failed"

    print_info "Test data initialization complete"
}

function wait_for_health() {
    print_info "Waiting for all services to be healthy..."

    local max_attempts=60
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        local healthy_count=$(docker-compose -f "$COMPOSE_FILE" ps | grep "(healthy)" | wc -l)
        local running_count=$(docker-compose -f "$COMPOSE_FILE" ps | grep "Up" | wc -l)

        print_info "Attempt $((attempt+1))/$max_attempts: $healthy_count services healthy, $running_count services running"

        if [ $healthy_count -ge 10 ]; then
            print_info "All critical services are healthy!"
            return 0
        fi

        sleep 5
        attempt=$((attempt+1))
    done

    print_warn "Some services may not be healthy yet, but continuing..."
    show_status
}

# Main script
case "${1:-}" in
    start)
        start_services "$2"
        wait_for_health
        ;;
    stop)
        stop_services
        ;;
    restart)
        restart_services "$2"
        wait_for_health
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs "$2"
        ;;
    cleanup)
        cleanup
        ;;
    init)
        init_test_data
        ;;
    setup)
        start_services "$2"
        wait_for_health
        init_test_data
        print_info "Integration test environment is ready!"
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs|cleanup|init|setup} [service]"
        echo ""
        echo "Commands:"
        echo "  start [service]   - Start all services or specific service"
        echo "  stop              - Stop all services"
        echo "  restart [service] - Restart all services or specific service"
        echo "  status            - Show service status"
        echo "  logs [service]    - Show logs for all or specific service"
        echo "  cleanup           - Remove all containers, volumes, and networks"
        echo "  init              - Initialize test data in databases"
        echo "  setup [service]   - Start services, wait for health, and initialize data"
        echo ""
        echo "Examples:"
        echo "  $0 setup                 # Full setup"
        echo "  $0 start mysql postgres  # Start only MySQL and PostgreSQL"
        echo "  $0 logs mysql            # Show MySQL logs"
        exit 1
        ;;
esac
