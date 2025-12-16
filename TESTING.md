# Testing Guide

This document describes the testing setup and how to run tests for the Database Schema MCP Server.

## Test Framework

We use **Vitest** as our testing framework because:
- Excellent TypeScript support
- Fast execution with native ESM support
- Compatible with Jest API
- Built-in code coverage

## Running Tests

### Install Dependencies

First, install all dependencies including test dependencies:

```bash
npm install
```

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

Useful during development to automatically rerun tests on file changes:

```bash
npm run test:watch
```

### Run Tests with Coverage

Generate a code coverage report:

```bash
npm run test:coverage
```

Coverage reports are generated in the `coverage/` directory:
- HTML report: `coverage/index.html`
- JSON report: `coverage/coverage-final.json`
- Text summary: Displayed in the terminal

## Test Structure

```
tests/
├── config-loader.test.ts        # Configuration loading tests
├── connector-factory.test.ts    # Connector factory tests
├── schema-formatter.test.ts     # Schema formatting tests
└── sqlite-connector.test.ts     # SQLite integration tests
```

## Test Categories

### Unit Tests

Tests for individual modules without external dependencies:

- **Config Loader** (`config-loader.test.ts`)
  - Configuration file loading
  - Environment variable substitution
  - Error handling

- **Connector Factory** (`connector-factory.test.ts`)
  - Connector registration
  - Connector creation
  - Database type validation

- **Schema Formatter** (`schema-formatter.test.ts`)
  - Markdown formatting for different database types
  - Relational database schema formatting
  - NoSQL schema formatting (MongoDB, Redis, Kafka)

### Integration Tests

Tests that interact with actual database instances:

- **SQLite Connector** (`sqlite-connector.test.ts`)
  - Connection management
  - Schema extraction (tables, columns, indexes, foreign keys)
  - Views extraction
  - Column search functionality

## Writing Tests

### Test File Naming

- Unit tests: `*.test.ts`
- Integration tests: `*.test.ts` (same convention)
- Test files should be in the `tests/` directory

### Example Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Module Name', () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  describe('Function or Feature', () => {
    it('should do something specific', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = functionToTest(input);

      // Assert
      expect(result).toBe('expected');
    });

    it('should handle edge cases', () => {
      // Test edge cases
    });

    it('should throw error for invalid input', () => {
      expect(() => functionToTest(null)).toThrow();
    });
  });
});
```

## Integration Tests Guidelines

### SQLite Tests

SQLite tests create temporary databases and clean them up automatically:

```typescript
beforeEach(() => {
  // Create test database
  db = new Database(dbPath);
  // Create test schema
});

afterEach(async () => {
  // Clean up test database
  await unlink(dbPath);
});
```

### Other Database Tests

For other databases (MySQL, PostgreSQL, MongoDB, Redis, Kafka), integration tests require:

1. **Docker Compose** setup for test databases
2. Environment variables for connection strings
3. Test containers or dedicated test instances

Example (not included in base tests):

```bash
# Start test databases
docker-compose -f docker-compose.test.yml up -d

# Run integration tests
npm run test:integration

# Stop test databases
docker-compose -f docker-compose.test.yml down
```

## Coverage Goals

Current coverage focuses on:
- ✅ Core utilities (config loader, factory)
- ✅ Schema formatter
- ✅ SQLite connector (full integration)

To add coverage for other connectors:
1. Set up test database infrastructure (Docker)
2. Create integration tests similar to `sqlite-connector.test.ts`
3. Mock external dependencies where appropriate

## Continuous Integration

When setting up CI/CD:

```yaml
# Example GitHub Actions workflow
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

### SQLite Tests Fail

Check that `better-sqlite3` is properly installed:

```bash
npm install better-sqlite3 --save
```

### Coverage Report Not Generated

Install coverage dependency:

```bash
npm install --save-dev @vitest/coverage-v8
```

## Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Always clean up resources (files, connections)
3. **Descriptive Names**: Test names should clearly describe what they test
4. **Edge Cases**: Test both happy path and error cases
5. **Mock Wisely**: Use mocks for external dependencies, real implementations for core logic

## Future Test Additions

Consider adding tests for:
- MySQL connector (requires test database)
- PostgreSQL connector (requires test database)
- MongoDB connector (requires test database)
- Redis connector (requires test instance)
- Kafka connector (requires test cluster)
- MCP tool handlers
- End-to-end MCP server tests
