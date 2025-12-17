@echo off
REM Integration Test Setup Script for Windows
REM This script manages the Docker environment for integration tests

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set COMPOSE_FILE=%SCRIPT_DIR%docker-compose.yml

if "%1"=="" goto usage
if "%1"=="start" goto start
if "%1"=="stop" goto stop
if "%1"=="restart" goto restart
if "%1"=="status" goto status
if "%1"=="logs" goto logs
if "%1"=="cleanup" goto cleanup
if "%1"=="init" goto init
if "%1"=="setup" goto setup
goto usage

:start
echo [INFO] Starting integration test environment...
if "%2"=="" (
    docker-compose -f "%COMPOSE_FILE%" up -d
) else (
    docker-compose -f "%COMPOSE_FILE%" up -d %2 %3 %4 %5 %6
)
echo [INFO] Waiting for services to be healthy...
timeout /t 10 /nobreak >nul
goto wait_health

:stop
echo [INFO] Stopping integration test environment...
docker-compose -f "%COMPOSE_FILE%" down
goto end

:restart
echo [INFO] Restarting integration test environment...
call :stop
call :start %2 %3 %4 %5 %6
goto end

:status
echo [INFO] Service status:
docker-compose -f "%COMPOSE_FILE%" ps
goto end

:logs
echo [INFO] Showing logs...
if "%2"=="" (
    docker-compose -f "%COMPOSE_FILE%" logs --tail=100
) else (
    docker-compose -f "%COMPOSE_FILE%" logs --tail=100 %2
)
goto end

:cleanup
echo [WARN] Cleaning up all containers, volumes, and networks...
docker-compose -f "%COMPOSE_FILE%" down -v
echo [INFO] Cleanup complete
goto end

:init
echo [INFO] Initializing test data...
timeout /t 15 /nobreak >nul

REM MySQL
echo [INFO] Initializing MySQL test data...
docker exec mcp-integration-mysql mysql -uroot -ptest_password testdb -e "CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), email VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP); CREATE INDEX idx_email ON users(email);"

REM PostgreSQL
echo [INFO] Initializing PostgreSQL test data...
docker exec mcp-integration-postgres psql -U postgres -d testdb -c "CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(100), email VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP); CREATE INDEX IF NOT EXISTS idx_email ON users(email);"

REM MongoDB
echo [INFO] Initializing MongoDB test data...
docker exec mcp-integration-mongodb mongosh -u root -p test_password --authenticationDatabase admin testdb --eval "db.users.createIndex({ email: 1 }); db.createCollection('products');"

REM Redis
echo [INFO] Initializing Redis test data...
docker exec mcp-integration-redis redis-cli -a test_password SET test:key "test_value"

REM Kafka
echo [INFO] Creating Kafka test topics...
docker exec mcp-integration-kafka kafka-topics --bootstrap-server localhost:9092 --create --if-not-exists --topic test-topic --partitions 1 --replication-factor 1

REM RabbitMQ
echo [INFO] Creating RabbitMQ test resources...
docker exec mcp-integration-rabbitmq rabbitmqadmin -u guest -p test_password declare queue name=test-queue durable=true

REM Elasticsearch
echo [INFO] Creating Elasticsearch test index...
docker exec mcp-integration-elasticsearch curl -X PUT "localhost:9200/test-index" -H "Content-Type: application/json" -d "{\"mappings\":{\"properties\":{\"name\":{\"type\":\"text\"},\"age\":{\"type\":\"integer\"}}}}"

REM ClickHouse
echo [INFO] Initializing ClickHouse test data...
docker exec mcp-integration-clickhouse clickhouse-client --password=test_password --query="CREATE TABLE IF NOT EXISTS testdb.events (id UInt32, name String, timestamp DateTime) ENGINE = MergeTree() ORDER BY id;"

echo [INFO] Test data initialization complete
goto end

:wait_health
echo [INFO] Waiting for all services to be healthy...
set /a attempt=0
set /a max_attempts=60

:health_loop
if !attempt! geq !max_attempts! (
    echo [WARN] Some services may not be healthy yet, but continuing...
    goto status
)

set /a attempt+=1
echo [INFO] Attempt !attempt!/!max_attempts!: Checking service health...
timeout /t 5 /nobreak >nul

REM Simple check - count running containers
for /f %%i in ('docker-compose -f "%COMPOSE_FILE%" ps ^| find /c "Up"') do set running_count=%%i
if !running_count! geq 10 (
    echo [INFO] Services are running!
    goto end
)

goto health_loop

:setup
call :start %2 %3 %4 %5 %6
call :init
echo [INFO] Integration test environment is ready!
goto end

:usage
echo Usage: %~nx0 {start^|stop^|restart^|status^|logs^|cleanup^|init^|setup} [service]
echo.
echo Commands:
echo   start [service]   - Start all services or specific service
echo   stop              - Stop all services
echo   restart [service] - Restart all services or specific service
echo   status            - Show service status
echo   logs [service]    - Show logs for all or specific service
echo   cleanup           - Remove all containers, volumes, and networks
echo   init              - Initialize test data in databases
echo   setup [service]   - Start services, wait for health, and initialize data
echo.
echo Examples:
echo   %~nx0 setup                 # Full setup
echo   %~nx0 start mysql postgres  # Start only MySQL and PostgreSQL
echo   %~nx0 logs mysql            # Show MySQL logs
goto end

:end
endlocal
