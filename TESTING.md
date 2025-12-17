# Testing Guide

This document describes the testing setup and how to run tests for the Database Schema MCP Server.

## Test Framework

We use **Vitest** as our testing framework because:
- Excellent TypeScript support
- Fast execution with native ESM support
- Compatible with Jest API
- Built-in code coverage

## Running Tests

### Quick Start with Makefile (Recommended)

The easiest way to run tests is using the provided Makefile:

```bash
# Run all tests (unit + integration)
make test

# Run only unit tests (fast, no databases required)
make test-unit

# Run only integration tests (with databases)
make test-integration

# Run tests in watch mode
make test-watch

# Run tests with coverage
make test-coverage
```

### Test Execution

All tests are unit tests that use mocks, so no external dependencies are required:

```bash
# Run all unit tests (fast, no databases required)
make test-unit

# Run in watch mode
make test-watch

# Run with coverage
make test-coverage
```

### Using npm Directly

If you prefer using npm commands directly:

```bash
# Install dependencies
npm install

# Run all tests (all are unit tests)
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

Coverage reports are generated in the `coverage/` directory:
- HTML report: `coverage/index.html`
- JSON report: `coverage/coverage-final.json`
- Text summary: Displayed in the terminal

## Test Structure

```
tests/
├── config-loader.test.ts          # Configuration loading tests
├── connector-factory.test.ts      # Connector factory tests
├── schema-formatter.test.ts       # Schema formatting tests
├── sqlite-connector.test.ts       # SQLite integration tests
├── mysql-connector.test.ts        # MySQL integration tests
├── postgresql-connector.test.ts   # PostgreSQL integration tests
├── opengauss-connector.test.ts    # OpenGauss integration tests
├── mongodb-connector.test.ts      # MongoDB integration tests
├── redis-connector.test.ts        # Redis integration tests
├── memcached-connector.test.ts    # Memcached integration tests
├── kafka-connector.test.ts        # Kafka integration tests
├── rabbitmq-connector.test.ts     # RabbitMQ integration tests
├── elasticsearch-connector.test.ts # Elasticsearch integration tests
├── etcd-connector.test.ts         # etcd integration tests
├── clickhouse-connector.test.ts   # ClickHouse integration tests
└── milvus-connector.test.ts       # Milvus integration tests
```

## Test Categories

### Unit Tests

All connector tests are unit tests that use mocks to avoid external dependencies. They test individual modules in isolation and run quickly without requiring any database instances.

```bash
# Run all unit tests (fast)
npm test
```

- **Config Loader** (`config-loader.test.ts`)
  - Configuration file loading
  - Environment variable substitution with `${VAR_NAME}` syntax
  - Error handling for missing files and undefined variables

- **Connector Factory** (`connector-factory.test.ts`)
  - Connector registration for all 14 database types
  - Connector creation from configuration
  - Database type validation
  - Error handling for unsupported database types

- **Schema Formatter** (`schema-formatter.test.ts`)
  - Markdown formatting for different database types
  - Relational database schema formatting (MySQL, PostgreSQL, OpenGauss, SQLite, Oracle, ClickHouse)
  - NoSQL schema formatting (MongoDB field inference, Redis/Memcached key patterns)
  - Message queue formatting (Kafka topics, RabbitMQ queues/exchanges)
  - Search engine formatting (Elasticsearch indices)
  - Key-value store formatting (etcd hierarchical keys)
  - Vector database formatting (Milvus collections)

### Database Connector Tests (with Mocks)

All database connector tests use vitest mocks to simulate database client behavior without requiring actual database instances. This makes tests fast, reliable, and easy to run in any environment.

**Test Coverage by Database:**

- **SQLite Connector** (`sqlite-connector.test.ts`)
  - In-memory database creation and cleanup
  - Schema extraction (tables, columns, data types)
  - Index extraction (primary keys, unique indexes)
  - Foreign key relationships
  - View extraction
  - Column search functionality

- **MySQL Connector** (`mysql-connector.test.ts`)
  - Connection to MySQL 8.0 test database
  - Complete schema extraction with table comments
  - Column details (VARCHAR, INT, DECIMAL, ENUM, TIMESTAMP)
  - Index types (PRIMARY, UNIQUE, regular indexes)
  - Foreign key relationships with ON DELETE CASCADE
  - View extraction with SQL definitions
  - Stored procedure extraction
  - AUTO_INCREMENT handling

- **PostgreSQL Connector** (`postgresql-connector.test.ts`)
  - Connection to PostgreSQL 15 test database
  - Schema extraction from `public` schema
  - Column comments and table comments
  - Advanced data types (JSONB, ARRAY, BOOLEAN, NUMERIC)
  - SERIAL type handling
  - Multi-column indexes
  - Foreign key constraints with ON DELETE CASCADE
  - View extraction
  - Function/procedure extraction (PL/pgSQL)
  - CHECK constraints

- **MongoDB Connector** (`mongodb-connector.test.ts`)
  - Connection to MongoDB 6 test database
  - Collection listing and document counting
  - Field type inference from document sampling
  - Field occurrence percentage calculation
  - Nested object field detection
  - Array field type detection
  - Mixed type field handling
  - Index extraction (including compound indexes)
  - Empty collection handling
  - Configurable sample size testing

- **Redis Connector** (`redis-connector.test.ts`)
  - Connection to Redis 7 test instance
  - Key pattern analysis and grouping
  - Data type detection (string, hash, list, set, zset)
  - Pattern-based key filtering (`user:*`, `cache:*`, etc.)
  - Key counting per pattern
  - Example key extraction
  - TTL (Time-To-Live) handling
  - Empty database handling
  - Configurable max keys scanning

- **Kafka Connector** (`kafka-connector.test.ts`)
  - Connection to Kafka cluster with Zookeeper
  - Topic listing and creation
  - Partition count and replication factor
  - Topic configuration extraction (retention.ms, compression.type, cleanup.policy)
  - Partition metadata (leader, replicas, ISR)
  - Multi-partition topic handling
  - Non-existent topic error handling

- **OpenGauss Connector** (`opengauss-connector.test.ts`)
  - Mock PostgreSQL client for OpenGauss-compatible testing
  - Schema extraction from `public` schema
  - Column and table metadata testing
  - Index and foreign key extraction
  - View and function extraction
  - Data type handling (VARCHAR, INTEGER, NUMERIC, BOOLEAN, TIMESTAMP)

- **Memcached Connector** (`memcached-connector.test.ts`)
  - Mock memcached client for cache statistics
  - Tests cache stats extraction (key limitation note)
  - Handles lack of key enumeration gracefully
  - Returns metadata about cache status

- **RabbitMQ Connector** (`rabbitmq-connector.test.ts`)
  - Mock AMQP library for queue/exchange testing
  - Mock Management API for full listing
  - Queue properties (durability, auto-delete, messages, consumers)
  - Exchange types (direct, fanout, topic)
  - Queue arguments (x-max-priority, etc.)

- **Elasticsearch Connector** (`elasticsearch-connector.test.ts`)
  - Mock Elasticsearch client
  - Index health and status testing
  - Mapping extraction with nested fields
  - Multi-field detection (text + keyword)
  - Data types (keyword, text, integer, float, boolean, date)
  - Shard and document count testing

- **etcd Connector** (`etcd-connector.test.ts`)
  - Mock etcd3 client
  - Hierarchical key pattern analysis
  - Key prefix grouping and depth calculation
  - Sample key extraction
  - Total key count reporting

- **ClickHouse Connector** (`clickhouse-connector.test.ts`)
  - Mock ClickHouse client
  - Table engine types (MergeTree, etc.)
  - Column types (UInt32, String, DateTime, Float64)
  - Partition, sorting, and primary key extraction
  - Table size and row count testing

- **Milvus Connector** (`milvus-connector.test.ts`)
  - Mock Milvus SDK client
  - Vector field detection (FloatVector, BinaryVector)
  - Vector dimension extraction
  - Index types (IVF_FLAT, HNSW, BIN_IVF_FLAT)
  - Metric types (L2, IP, HAMMING, COSINE)
  - Entity count and collection metadata

## Writing Tests

### Test File Naming

- Unit tests: `*.test.ts`
- Integration tests: `*.test.ts` (same convention)
- Test files should be in the `tests/` directory

### Example Test Structure with Mocks

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock external dependencies
vi.mock('database-client-library', () => {
  return {
    Client: vi.fn(() => ({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      close: vi.fn()
    }))
  };
});

describe('DatabaseConnector', () => {
  let connector: DatabaseConnector;
  let mockClient: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    connector = new DatabaseConnector(config);
    await connector.connect();

    // Get mocked client instance
    const lib = await import('database-client-library');
    mockClient = new lib.Client();
  });

  it('should extract schema correctly', async () => {
    // Arrange - Setup mock responses
    mockClient.query.mockResolvedValueOnce({
      rows: [{ table_name: 'users', schema_name: 'public' }]
    });

    // Act
    const tables = await connector.listTables();

    // Assert
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('users');
  });
});
```

## Best Practices for Unit Tests with Mocks

1. **Isolation**: Each test should be independent and use fresh mocks
2. **Clear Mocks**: Always call `vi.clearAllMocks()` in `beforeEach`
3. **Descriptive Names**: Test names should clearly describe what they verify
4. **Mock Setup**: Define mock responses that match expected data structures
5. **Edge Cases**: Test both happy path and error cases
6. **Verify Calls**: Check that mocked functions are called with expected parameters
7. **Async Handling**: Properly await all async operations
8. **Type Safety**: Use TypeScript types to ensure mock data matches real types

## Writing Mock-Based Tests

### For a New Database Connector

1. Create test file: `tests/{database}-connector.test.ts`
2. Mock the database client library using `vi.mock()`
3. Define mock responses that simulate database behavior
4. Test all connector methods:
   - `connect()` and `disconnect()`
   - `listTables()` with mocked table data
   - `getSchema()` with complete schema structure
   - `getTableDetails()` with column and index information
   - `searchColumns()` with search results
5. Test error handling with rejected promises
6. Follow the pattern from existing connector tests

### Example Mock Setup

```typescript
// Mock the database client
vi.mock('pg', () => {
  const mockQuery = vi.fn();
  return {
    default: {
      Pool: vi.fn(() => ({
        query: mockQuery,
        end: vi.fn()
      }))
    }
  };
});

// In test, configure mock responses
mockPool.query.mockResolvedValueOnce({
  rows: [{ table_name: 'users' }]
});
```

## Coverage Goals

The project has comprehensive test coverage across all components:

✅ **Core Utilities**
- Configuration loader with environment variable substitution
- Connector factory with registration system
- Schema formatter for all database types

✅ **All Database Connectors (with Mocks)**
- MySQL connector - Mock-based unit tests
- PostgreSQL connector - Mock-based unit tests
- OpenGauss connector - Mock-based unit tests
- SQLite connector - Mock-based unit tests (or in-memory database)
- MongoDB connector - Mock-based unit tests
- Redis connector - Mock-based unit tests
- Memcached connector - Mock-based unit tests
- Kafka connector - Mock-based unit tests
- RabbitMQ connector - Mock-based unit tests
- Elasticsearch connector - Mock-based unit tests
- etcd connector - Mock-based unit tests
- ClickHouse connector - Mock-based unit tests
- Milvus connector - Mock-based unit tests

✅ **Unit Testing Approach**
- All tests use mocks, no external dependencies required
- Fast execution (no database containers needed)
- Easy to run in CI/CD environments
- Consistent test behavior across environments

### Coverage Statistics

Run coverage report to see detailed statistics:

```bash
make test-coverage
# Opens coverage/index.html for detailed view
```

### Future Enhancements

Consider adding:
- Oracle connector mock tests (currently requires Oracle Instant Client setup)
- Integration tests with real databases (optional, for manual verification)
- MCP tool handlers end-to-end tests
- Performance benchmarks for large schemas
- Stress testing with many concurrent connections

## Continuous Integration

When setting up CI/CD, all tests run without Docker since they use mocks:

```yaml
# Example GitHub Actions workflow
- name: Install dependencies
  run: npm install

- name: Run tests
  run: npm test

- name: Generate coverage
  run: npm run test:coverage

- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/coverage-final.json
```

## Troubleshooting

### Tests Fail with Import Errors

Make sure to build the TypeScript code first:

```bash
npm run build
```

### Mock Not Working

Ensure `vi.clearAllMocks()` is called in `beforeEach`:

```typescript
beforeEach(() => {
  vi.clearAllMocks();
});
```

### Coverage Report Not Generated

Install coverage dependency:

```bash
npm install --save-dev @vitest/coverage-v8
```

## Best Practices

1. **Isolation**: Each test should be independent and use fresh mocks
2. **Cleanup**: Always call `vi.clearAllMocks()` to reset mocks between tests
3. **Descriptive Names**: Test names should clearly describe what they test
4. **Edge Cases**: Test both happy path and error cases
5. **Mock Wisely**: Mock external dependencies, test internal logic
6. **Type Safety**: Ensure mock data matches expected types
7. **Async Handling**: Properly await all async operations
8. **Error Testing**: Verify error messages and error types, not just that errors are thrown

## Adding New Tests

### For a New Database Connector

1. Create test file: `tests/{database}-connector.test.ts`
2. Mock the database client library using `vi.mock()`
3. Follow the pattern from existing connector tests:
   - Mock connection and client methods
   - Test connection, schema extraction, table listing
   - Test error handling
4. Ensure all connector methods are tested
5. Add to test documentation

### For New Features

1. Create unit test file in `tests/` directory
2. Use descriptive test names
3. Mock all external dependencies
4. Test both success and failure scenarios
5. Update this documentation with test coverage information

