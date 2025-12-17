/**
 * End-to-End Integration Tests
 *
 * These tests connect to real database instances running in Docker containers.
 * Make sure to run the setup script before running these tests:
 *
 * Linux/Mac: ./tests/integration/setup.sh setup
 * Windows: tests\integration\setup.bat setup
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MySQLConnector } from '../../src/connectors/mysql.js';
import { PostgreSQLConnector } from '../../src/connectors/postgresql.js';
import { MongoDBConnector } from '../../src/connectors/mongodb.js';
import { RedisConnector } from '../../src/connectors/redis.js';
import type { MySQLConfig, PostgreSQLConfig, MongoDBConfig, RedisConfig } from '../../src/types/schema.js';
import fs from 'fs';
import path from 'path';

// Load integration test config
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Test timeout for integration tests (longer than unit tests)
const INTEGRATION_TIMEOUT = 30000;

describe('MySQL E2E Integration Tests', () => {
  let connector: MySQLConnector;

  beforeAll(async () => {
    const mysqlConfig: MySQLConfig = config.databases.mysql;
    connector = new MySQLConnector(mysqlConfig);
    await connector.connect();
  }, INTEGRATION_TIMEOUT);

  afterAll(async () => {
    if (connector) {
      await connector.disconnect();
    }
  });

  it('should connect to real MySQL database', async () => {
    expect(connector).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should retrieve database version', async () => {
    const schema = await connector.getSchema();
    expect(schema.version).toBeDefined();
    expect(schema.version).toContain('8.0');
  }, INTEGRATION_TIMEOUT);

  it('should list tables from real database', async () => {
    const tables = await connector.listTables();
    expect(Array.isArray(tables)).toBe(true);

    // Check if the test table created by setup script exists
    const userTable = tables.find(t => t.name === 'users');
    expect(userTable).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should get complete schema with table details', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('mysql');
    expect(schema.databaseName).toBe('testdb');
    expect(Array.isArray(schema.tables)).toBe(true);

    // Verify users table exists and has correct structure
    const usersTable = schema.tables.find(t => t.name === 'users');
    expect(usersTable).toBeDefined();

    if (usersTable) {
      expect(usersTable.columns.length).toBeGreaterThan(0);

      // Check for expected columns
      const idColumn = usersTable.columns.find(c => c.name === 'id');
      expect(idColumn).toBeDefined();

      const nameColumn = usersTable.columns.find(c => c.name === 'name');
      expect(nameColumn).toBeDefined();

      const emailColumn = usersTable.columns.find(c => c.name === 'email');
      expect(emailColumn).toBeDefined();
    }
  }, INTEGRATION_TIMEOUT);

  it('should get table details with indexes', async () => {
    const tableDetails = await connector.getTableDetails('users');

    expect(tableDetails).toBeDefined();
    if (tableDetails) {
      expect(tableDetails.name).toBe('users');
      expect(tableDetails.columns.length).toBeGreaterThan(0);

      // Check for indexes
      expect(Array.isArray(tableDetails.indexes)).toBe(true);

      // Should have at least PRIMARY key
      const primaryIndex = tableDetails.indexes?.find(idx => idx.isPrimary);
      expect(primaryIndex).toBeDefined();
    }
  }, INTEGRATION_TIMEOUT);
});

describe('PostgreSQL E2E Integration Tests', () => {
  let connector: PostgreSQLConnector;

  beforeAll(async () => {
    const pgConfig: PostgreSQLConfig = config.databases.postgresql;
    connector = new PostgreSQLConnector(pgConfig);
    await connector.connect();
  }, INTEGRATION_TIMEOUT);

  afterAll(async () => {
    if (connector) {
      await connector.disconnect();
    }
  });

  it('should connect to real PostgreSQL database', async () => {
    expect(connector).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should retrieve database version', async () => {
    const schema = await connector.getSchema();
    expect(schema.version).toBeDefined();
    expect(schema.version).toContain('PostgreSQL');
  }, INTEGRATION_TIMEOUT);

  it('should list tables from real database', async () => {
    const tables = await connector.listTables();
    expect(Array.isArray(tables)).toBe(true);

    // Check if the test table created by setup script exists
    const userTable = tables.find(t => t.name === 'users');
    expect(userTable).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should get complete schema with table details', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('postgresql');
    expect(schema.databaseName).toBe('testdb');
    expect(Array.isArray(schema.tables)).toBe(true);

    // Verify users table structure
    const usersTable = schema.tables.find(t => t.name === 'users');
    expect(usersTable).toBeDefined();

    if (usersTable) {
      expect(usersTable.columns.length).toBeGreaterThan(0);

      // PostgreSQL should have id as SERIAL (auto-increment integer)
      const idColumn = usersTable.columns.find(c => c.name === 'id');
      expect(idColumn).toBeDefined();
      expect(idColumn?.type).toContain('int');
    }
  }, INTEGRATION_TIMEOUT);
});

describe('MongoDB E2E Integration Tests', () => {
  let connector: MongoDBConnector;

  beforeAll(async () => {
    const mongoConfig: MongoDBConfig = config.databases.mongodb;
    connector = new MongoDBConnector(mongoConfig);
    await connector.connect();
  }, INTEGRATION_TIMEOUT);

  afterAll(async () => {
    if (connector) {
      await connector.disconnect();
    }
  });

  it('should connect to real MongoDB database', async () => {
    expect(connector).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should list collections from real database', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('mongodb');
    expect(Array.isArray(schema.collections)).toBe(true);

    // Check if test collections created by setup script exist
    const collectionNames = schema.collections?.map(c => c.name) || [];
    expect(collectionNames).toContain('users');
    expect(collectionNames).toContain('products');
  }, INTEGRATION_TIMEOUT);

  it('should retrieve collection indexes', async () => {
    const schema = await connector.getSchema();

    const usersCollection = schema.collections?.find(c => c.name === 'users');
    expect(usersCollection).toBeDefined();

    if (usersCollection) {
      expect(Array.isArray(usersCollection.indexes)).toBe(true);

      // MongoDB always has _id index
      const idIndex = usersCollection.indexes?.find(idx => idx.name === '_id_');
      expect(idIndex).toBeDefined();

      // Check for email index created by setup script
      const emailIndex = usersCollection.indexes?.find(idx =>
        idx.name?.includes('email')
      );
      expect(emailIndex).toBeDefined();
    }
  }, INTEGRATION_TIMEOUT);

  it('should get database statistics', async () => {
    const schema = await connector.getSchema();

    expect(schema.version).toBeDefined();
    expect(schema.databaseName).toBe('testdb');
  }, INTEGRATION_TIMEOUT);
});

describe('Redis E2E Integration Tests', () => {
  let connector: RedisConnector;

  beforeAll(async () => {
    const redisConfig: RedisConfig = config.databases.redis;
    connector = new RedisConnector(redisConfig);
    await connector.connect();
  }, INTEGRATION_TIMEOUT);

  afterAll(async () => {
    if (connector) {
      await connector.disconnect();
    }
  });

  it('should connect to real Redis database', async () => {
    expect(connector).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should retrieve Redis info', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('redis');
    expect(schema.version).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should list keys from real database', async () => {
    const schema = await connector.getSchema();

    expect(Array.isArray(schema.keyPatterns)).toBe(true);

    // Check for test key created by setup script
    if (schema.keyPatterns && schema.keyPatterns.length > 0) {
      // Find pattern that contains the test key
      const patternWithTestKey = schema.keyPatterns.find(p =>
        p.sampleKeys.some(key => key.includes('test:key'))
      );

      if (patternWithTestKey) {
        expect(patternWithTestKey).toBeDefined();
        // Check that the pattern has string type
        expect(patternWithTestKey.types).toBeDefined();
        expect(patternWithTestKey.types['string']).toBeGreaterThan(0);
      }
    }
  }, INTEGRATION_TIMEOUT);

  it('should get Redis configuration', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseName).toBeDefined();
  }, INTEGRATION_TIMEOUT);
});

describe('Cross-Database Integration Tests', () => {
  it('should be able to connect to multiple databases concurrently', async () => {
    const mysqlConnector = new MySQLConnector(config.databases.mysql);
    const pgConnector = new PostgreSQLConnector(config.databases.postgresql);
    const mongoConnector = new MongoDBConnector(config.databases.mongodb);

    try {
      // Connect to all databases in parallel
      await Promise.all([
        mysqlConnector.connect(),
        pgConnector.connect(),
        mongoConnector.connect()
      ]);

      // Verify all connections work
      const [mysqlSchema, pgSchema, mongoSchema] = await Promise.all([
        mysqlConnector.getSchema(),
        pgConnector.getSchema(),
        mongoConnector.getSchema()
      ]);

      expect(mysqlSchema.databaseType).toBe('mysql');
      expect(pgSchema.databaseType).toBe('postgresql');
      expect(mongoSchema.databaseType).toBe('mongodb');

      // Cleanup
      await Promise.all([
        mysqlConnector.disconnect(),
        pgConnector.disconnect(),
        mongoConnector.disconnect()
      ]);
    } catch (error) {
      // Ensure cleanup on error
      await Promise.allSettled([
        mysqlConnector.disconnect(),
        pgConnector.disconnect(),
        mongoConnector.disconnect()
      ]);
      throw error;
    }
  }, INTEGRATION_TIMEOUT);
});
