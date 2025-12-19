/**
 * ClickHouse Integration Tests
 *
 * These tests connect to a real ClickHouse database instance (no mocks).
 * Requires Docker environment to be running: ./tests/integration/setup.sh setup
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClickHouseConnector } from '../../src/connectors/clickhouse.js';
import type { ClickHouseConfig } from '../../src/types/schema.js';
import { createClient, ClickHouseClient } from '@clickhouse/client';
import fs from 'fs';
import path from 'path';

// Load integration test config
const configPath = path.join(__dirname, 'config.json');
const testConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const INTEGRATION_TIMEOUT = 30000;

describe('ClickHouse Integration Tests (Real Database)', () => {
  let connector: ClickHouseConnector;
  let client: ClickHouseClient;
  const config: ClickHouseConfig = testConfig.databases.clickhouse;

  beforeEach(async () => {
    // Create a direct ClickHouse connection for test data setup
    client = createClient({
      url: `http://${config.host}:${config.port}`,
      username: config.username,
      password: config.password,
      database: config.database,
    });

    // Clean up any existing test tables
    await client.command({
      query: 'DROP TABLE IF EXISTS users',
    });
    await client.command({
      query: 'DROP TABLE IF EXISTS products',
    });
    await client.command({
      query: 'DROP TABLE IF EXISTS orders',
    });
    await client.command({
      query: 'DROP TABLE IF EXISTS events',
    });
    await client.command({
      query: 'DROP VIEW IF EXISTS active_users',
    });

    // Create test schema with ClickHouse-specific features
    await client.command({
      query: `
        CREATE TABLE users (
          id UInt32,
          email String,
          username String,
          age UInt8,
          created_at DateTime DEFAULT now(),
          metadata String
        )
        ENGINE = MergeTree()
        ORDER BY id
        PRIMARY KEY id
        COMMENT 'User accounts'
      `,
    });

    await client.command({
      query: `
        CREATE TABLE products (
          id UInt32,
          name String,
          price Decimal(10, 2),
          stock Int32,
          tags Array(String)
        )
        ENGINE = MergeTree()
        ORDER BY id
        PRIMARY KEY id
        COMMENT 'Product catalog'
      `,
    });

    await client.command({
      query: `
        CREATE TABLE orders (
          id UInt32,
          user_id UInt32,
          order_date DateTime,
          total Decimal(10, 2),
          status Enum('pending' = 1, 'shipped' = 2, 'delivered' = 3)
        )
        ENGINE = MergeTree()
        ORDER BY (user_id, order_date)
        PRIMARY KEY user_id
        COMMENT 'Customer orders'
      `,
    });

    await client.command({
      query: `
        CREATE TABLE events (
          event_time DateTime,
          event_type String,
          user_id UInt32,
          data String
        )
        ENGINE = MergeTree()
        PARTITION BY toYYYYMM(event_time)
        ORDER BY event_time
      `,
    });

    // Create a view
    await client.command({
      query: `
        CREATE VIEW active_users AS
        SELECT id, email, username
        FROM users
        WHERE age >= 18
      `,
    });

    // Insert test data
    await client.insert({
      table: 'users',
      values: [
        { id: 1, email: 'user1@example.com', username: 'user1', age: 25, metadata: '{"role":"admin"}' },
        { id: 2, email: 'user2@example.com', username: 'user2', age: 30, metadata: '{"role":"user"}' },
        { id: 3, email: 'user3@example.com', username: 'user3', age: 17, metadata: '{}' },
      ],
      format: 'JSONEachRow',
    });

    await client.insert({
      table: 'products',
      values: [
        { id: 1, name: 'Product A', price: '99.99', stock: 10, tags: ['electronics', 'featured'] },
        { id: 2, name: 'Product B', price: '49.99', stock: 5, tags: ['accessories'] },
      ],
      format: 'JSONEachRow',
    });

    await client.insert({
      table: 'orders',
      values: [
        { id: 1, user_id: 1, order_date: '2024-01-01 10:00:00', total: '99.99', status: 'delivered' },
        { id: 2, user_id: 2, order_date: '2024-01-02 15:30:00', total: '149.98', status: 'shipped' },
      ],
      format: 'JSONEachRow',
    });

    await client.insert({
      table: 'events',
      values: [
        { event_time: '2024-01-01 10:00:00', event_type: 'login', user_id: 1, data: 'user logged in' },
        { event_time: '2024-01-02 15:00:00', event_type: 'purchase', user_id: 2, data: 'order placed' },
      ],
      format: 'JSONEachRow',
    });

    // Create connector instance
    connector = new ClickHouseConnector(config);
    await connector.connect();
  }, INTEGRATION_TIMEOUT);

  afterEach(async () => {
    // Cleanup
    if (connector) {
      await connector.disconnect();
    }
    if (client) {
      await client.command({ query: 'DROP TABLE IF EXISTS users' });
      await client.command({ query: 'DROP TABLE IF EXISTS products' });
      await client.command({ query: 'DROP TABLE IF EXISTS orders' });
      await client.command({ query: 'DROP TABLE IF EXISTS events' });
      await client.command({ query: 'DROP VIEW IF EXISTS active_users' });
      await client.close();
    }
  }, INTEGRATION_TIMEOUT);

  it('should connect to real ClickHouse database', () => {
    expect(connector).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should retrieve ClickHouse version', async () => {
    const schema = await connector.getSchema();
    expect(schema.version).toBeDefined();
    expect(schema.version).toMatch(/\d+\.\d+/);
  }, INTEGRATION_TIMEOUT);

  it('should list all tables', async () => {
    const tables = await connector.listTables();

    expect(tables.length).toBeGreaterThanOrEqual(4);
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('products');
    expect(tableNames).toContain('orders');
    expect(tableNames).toContain('events');

    // Check row counts
    const usersTable = tables.find(t => t.name === 'users');
    expect(usersTable?.rowCount).toBeGreaterThanOrEqual(3);
  }, INTEGRATION_TIMEOUT);

  it('should get complete schema with ClickHouse-specific info', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('clickhouse');
    expect(schema.databaseName).toBe('testdb');
    expect(schema.tables).toBeDefined();
    expect(schema.tables.length).toBeGreaterThanOrEqual(4);

    // Check ClickHouse-specific tables info
    expect(schema.clickhouseTables).toBeDefined();
    expect(schema.clickhouseTables!.length).toBeGreaterThanOrEqual(4);

    const usersTable = schema.clickhouseTables!.find(t => t.name === 'users');
    expect(usersTable).toBeDefined();
    expect(usersTable?.engine).toBe('MergeTree');
    expect(usersTable?.primaryKey).toBe('id');
  }, INTEGRATION_TIMEOUT);

  it('should get table details with columns', async () => {
    const details = await connector.getTableDetails('users');

    expect(details).toBeDefined();
    expect(details?.name).toBe('users');
    expect(details?.columns).toBeDefined();
    expect(details?.columns.length).toBeGreaterThanOrEqual(5);

    // Check specific columns
    const emailColumn = details?.columns.find(c => c.name === 'email');
    expect(emailColumn).toBeDefined();
    expect(emailColumn?.type).toBe('String');
    expect(emailColumn?.nullable).toBe(false);

    const idColumn = details?.columns.find(c => c.name === 'id');
    expect(idColumn?.type).toBe('UInt32');
  }, INTEGRATION_TIMEOUT);

  it('should handle Array type', async () => {
    const details = await connector.getTableDetails('products');

    const tagsColumn = details?.columns.find(c => c.name === 'tags');
    expect(tagsColumn).toBeDefined();
    expect(tagsColumn?.type).toContain('Array');
  }, INTEGRATION_TIMEOUT);

  it('should handle Decimal type', async () => {
    const details = await connector.getTableDetails('products');

    const priceColumn = details?.columns.find(c => c.name === 'price');
    expect(priceColumn).toBeDefined();
    expect(priceColumn?.type).toContain('Decimal');
  }, INTEGRATION_TIMEOUT);

  it('should handle Enum type', async () => {
    const details = await connector.getTableDetails('orders');

    const statusColumn = details?.columns.find(c => c.name === 'status');
    expect(statusColumn).toBeDefined();
    expect(statusColumn?.type).toContain('Enum');
  }, INTEGRATION_TIMEOUT);

  it('should handle DateTime type', async () => {
    const details = await connector.getTableDetails('orders');

    const dateColumn = details?.columns.find(c => c.name === 'order_date');
    expect(dateColumn).toBeDefined();
    expect(dateColumn?.type).toBe('DateTime');
  }, INTEGRATION_TIMEOUT);

  it('should extract views', async () => {
    const schema = await connector.getSchema();

    expect(schema.views).toBeDefined();
    expect(schema.views!.length).toBeGreaterThanOrEqual(1);

    const activeUsersView = schema.views!.find(v => v.name === 'active_users');
    expect(activeUsersView).toBeDefined();
    expect(activeUsersView?.definition).toContain('SELECT');
  }, INTEGRATION_TIMEOUT);

  it('should identify MergeTree engine', async () => {
    const schema = await connector.getSchema();
    const clickhouseTables = schema.clickhouseTables || [];

    const usersTable = clickhouseTables.find(t => t.name === 'users');
    expect(usersTable?.engine).toBe('MergeTree');
  }, INTEGRATION_TIMEOUT);

  it('should identify partition key', async () => {
    const schema = await connector.getSchema();
    const clickhouseTables = schema.clickhouseTables || [];

    const eventsTable = clickhouseTables.find(t => t.name === 'events');
    expect(eventsTable).toBeDefined();
    expect(eventsTable?.partitionKey).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should identify sorting key', async () => {
    const schema = await connector.getSchema();
    const clickhouseTables = schema.clickhouseTables || [];

    const ordersTable = clickhouseTables.find(t => t.name === 'orders');
    expect(ordersTable).toBeDefined();
    expect(ordersTable?.sortingKey).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should test connection successfully', async () => {
    const testConnector = new ClickHouseConnector(config);
    const result = await testConnector.testConnection();

    expect(result).toBe(true);
    await testConnector.disconnect();
  }, INTEGRATION_TIMEOUT);

  it('should handle connection with invalid credentials', async () => {
    const invalidConfig: ClickHouseConfig = {
      ...config,
      password: 'wrong_password',
    };

    const failingConnector = new ClickHouseConnector(invalidConfig);
    const result = await failingConnector.testConnection();

    expect(result).toBe(false);
  }, INTEGRATION_TIMEOUT);

  it('should handle Nullable types', async () => {
    // Create a table with nullable columns
    await client.command({
      query: `
        CREATE TABLE nullable_test (
          id UInt32,
          optional_field Nullable(String)
        )
        ENGINE = MergeTree()
        ORDER BY id
      `,
    });

    const details = await connector.getTableDetails('nullable_test');
    const optionalField = details?.columns.find(c => c.name === 'optional_field');
    expect(optionalField?.nullable).toBe(true);

    await client.command({ query: 'DROP TABLE IF EXISTS nullable_test' });
  }, INTEGRATION_TIMEOUT);

  it('should handle default values', async () => {
    const details = await connector.getTableDetails('users');
    const createdAtColumn = details?.columns.find(c => c.name === 'created_at');

    expect(createdAtColumn).toBeDefined();
    expect(createdAtColumn?.defaultValue).toBeDefined();
  }, INTEGRATION_TIMEOUT);
});
