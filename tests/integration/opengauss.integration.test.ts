/**
 * OpenGauss Integration Tests
 *
 * These tests connect to a real OpenGauss database instance (no mocks).
 * OpenGauss is compatible with PostgreSQL protocol.
 * Requires Docker environment to be running: ./tests/integration/setup.sh setup
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpenGaussConnector } from '../../src/connectors/opengauss.js';
import type { OpenGaussConfig } from '../../src/types/schema.js';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

// Load integration test config
const configPath = path.join(__dirname, 'config.json');
const testConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const INTEGRATION_TIMEOUT = 30000;

describe('OpenGauss Integration Tests (Real Database)', () => {
  let connector: OpenGaussConnector;
  let client: pg.Client;
  const config: OpenGaussConfig = {
    ...testConfig.databases.opengauss,
    schema: 'public',
  };

  beforeEach(async () => {
    // Create a direct OpenGauss/PostgreSQL connection for test data setup
    client = new pg.Client({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
    });
    await client.connect();

    // Clean up any existing test tables
    await client.query(`
      DROP TABLE IF EXISTS order_items CASCADE;
      DROP TABLE IF EXISTS orders CASCADE;
      DROP TABLE IF EXISTS products CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP VIEW IF EXISTS active_users;
      DROP FUNCTION IF EXISTS get_user_count();
    `);

    // Create test schema with full structure
    await client.query(`
      -- Users table
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        username VARCHAR(100) NOT NULL,
        age INTEGER,
        is_active BOOLEAN DEFAULT true,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT users_email_key UNIQUE (email)
      );

      COMMENT ON TABLE users IS 'User accounts';
      COMMENT ON COLUMN users.email IS 'User email address';

      CREATE INDEX idx_username ON users(username);
      CREATE INDEX idx_created ON users(created_at);

      -- Products table
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price NUMERIC(10,2) NOT NULL,
        stock INTEGER DEFAULT 0
      );

      COMMENT ON TABLE products IS 'Product catalog';

      CREATE UNIQUE INDEX idx_name ON products(name);

      -- Orders table
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        order_date TIMESTAMP NOT NULL,
        total NUMERIC(10,2),
        status VARCHAR(50) DEFAULT 'pending',
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      COMMENT ON TABLE orders IS 'Customer orders';

      CREATE INDEX idx_user ON orders(user_id);
      CREATE INDEX idx_date ON orders(order_date);

      -- Order items table
      CREATE TABLE order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        price NUMERIC(10,2) NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
      );

      CREATE INDEX idx_order ON order_items(order_id);
      CREATE INDEX idx_product ON order_items(product_id);

      -- View
      CREATE VIEW active_users AS
      SELECT id, email, username
      FROM users
      WHERE is_active = true;

      -- Function
      CREATE FUNCTION get_user_count()
      RETURNS integer AS $$
      BEGIN
        RETURN (SELECT COUNT(*) FROM users);
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Insert test data
    await client.query(`
      INSERT INTO users (email, username, age, is_active, metadata) VALUES
      ('user1@example.com', 'user1', 25, true, '{"role":"admin"}'),
      ('user2@example.com', 'user2', 30, true, '{"role":"user"}'),
      ('user3@example.com', 'user3', 17, false, NULL);

      INSERT INTO products (name, price, stock) VALUES
      ('Product A', 99.99, 10),
      ('Product B', 49.99, 5);

      INSERT INTO orders (user_id, order_date, total, status) VALUES
      (1, '2024-01-01 10:00:00', 99.99, 'delivered'),
      (2, '2024-01-02 15:30:00', 149.98, 'shipped');

      INSERT INTO order_items (order_id, product_id, quantity, price) VALUES
      (1, 1, 1, 99.99),
      (2, 1, 1, 99.99),
      (2, 2, 1, 49.99);
    `);

    // Create connector instance
    connector = new OpenGaussConnector(config);
    await connector.connect();
  }, INTEGRATION_TIMEOUT);

  afterEach(async () => {
    // Cleanup
    if (connector) {
      await connector.disconnect();
    }
    if (client) {
      await client.query(`
        DROP TABLE IF EXISTS order_items CASCADE;
        DROP TABLE IF EXISTS orders CASCADE;
        DROP TABLE IF EXISTS products CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
        DROP VIEW IF EXISTS active_users;
        DROP FUNCTION IF EXISTS get_user_count();
      `);
      await client.end();
    }
  }, INTEGRATION_TIMEOUT);

  it('should connect to real OpenGauss database', () => {
    expect(connector).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should retrieve OpenGauss version', async () => {
    const schema = await connector.getSchema();
    expect(schema.version).toBeDefined();
    // OpenGauss version string may contain "PostgreSQL" or "openGauss"
    expect(schema.version).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should list all tables', async () => {
    const tables = await connector.listTables();

    expect(tables).toHaveLength(4);
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('products');
    expect(tableNames).toContain('orders');
    expect(tableNames).toContain('order_items');
  }, INTEGRATION_TIMEOUT);

  it('should get complete schema', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('opengauss');
    expect(schema.databaseName).toBe('postgres');
    expect(schema.tables).toHaveLength(4);

    // Check users table structure
    const usersTable = schema.tables.find(t => t.name === 'users');
    expect(usersTable).toBeDefined();
    expect(usersTable?.comment).toBe('User accounts');
  }, INTEGRATION_TIMEOUT);

  it('should get table details with columns', async () => {
    const details = await connector.getTableDetails('users');

    expect(details).toBeDefined();
    expect(details?.name).toBe('users');

    // Check column with comment
    const emailColumn = details?.columns.find(c => c.name === 'email');
    expect(emailColumn?.comment).toBe('User email address');
    expect(emailColumn?.nullable).toBe(false);
  }, INTEGRATION_TIMEOUT);

  it('should identify primary keys', async () => {
    const details = await connector.getTableDetails('users');

    const primaryIndex = details?.indexes?.find(idx => idx.isPrimary);
    expect(primaryIndex).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should get indexes', async () => {
    const details = await connector.getTableDetails('users');

    expect(details?.indexes).toBeDefined();
    expect(details?.indexes!.length).toBeGreaterThanOrEqual(3);

    const emailIndex = details?.indexes?.find(idx => idx.name === 'users_email_key');
    expect(emailIndex).toMatchObject({
      isUnique: true,
      isPrimary: false,
    });
  }, INTEGRATION_TIMEOUT);

  it('should get foreign keys', async () => {
    const orderDetails = await connector.getTableDetails('orders');

    expect(orderDetails?.foreignKeys).toBeDefined();
    expect(orderDetails?.foreignKeys!.length).toBeGreaterThanOrEqual(1);

    const userFk = orderDetails?.foreignKeys?.find(fk =>
      fk.columns.includes('user_id')
    );
    expect(userFk).toBeDefined();
    expect(userFk?.referencedTable).toBe('users');
    expect(userFk?.referencedColumns).toContain('id');
  }, INTEGRATION_TIMEOUT);

  it('should handle multiple foreign keys', async () => {
    const details = await connector.getTableDetails('order_items');

    expect(details?.foreignKeys).toBeDefined();
    expect(details?.foreignKeys!.length).toBeGreaterThanOrEqual(2);

    const orderFk = details?.foreignKeys?.find(fk =>
      fk.columns.includes('order_id')
    );
    expect(orderFk).toBeDefined();

    const productFk = details?.foreignKeys?.find(fk =>
      fk.columns.includes('product_id')
    );
    expect(productFk).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should handle BOOLEAN type', async () => {
    const details = await connector.getTableDetails('users');
    const isActiveColumn = details?.columns.find(c => c.name === 'is_active');

    expect(isActiveColumn?.type).toBe('boolean');
  }, INTEGRATION_TIMEOUT);

  it('should handle SERIAL columns', async () => {
    const details = await connector.getTableDetails('users');
    const idColumn = details?.columns.find(c => c.name === 'id');

    expect(idColumn).toBeDefined();
    expect(idColumn?.type).toBe('integer');
  }, INTEGRATION_TIMEOUT);

  it('should handle NUMERIC type', async () => {
    const productDetails = await connector.getTableDetails('products');
    const priceColumn = productDetails?.columns.find(c => c.name === 'price');

    expect(priceColumn).toBeDefined();
    expect(priceColumn?.type).toBe('numeric');
    expect(priceColumn?.nullable).toBe(false);
  }, INTEGRATION_TIMEOUT);

  it('should extract views', async () => {
    const schema = await connector.getSchema();

    expect(schema.views).toBeDefined();
    expect(schema.views!.length).toBeGreaterThanOrEqual(1);

    const activeUsersView = schema.views!.find(v => v.name === 'active_users');
    expect(activeUsersView).toBeDefined();
    expect(activeUsersView?.definition).toContain('SELECT');
  }, INTEGRATION_TIMEOUT);

  it('should extract functions', async () => {
    const schema = await connector.getSchema();

    expect(schema.procedures).toBeDefined();
    expect(schema.procedures!.length).toBeGreaterThanOrEqual(1);

    const getUserCount = schema.procedures!.find(p => p.name === 'get_user_count');
    expect(getUserCount).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should handle default values', async () => {
    const productDetails = await connector.getTableDetails('products');
    const stockColumn = productDetails?.columns.find(c => c.name === 'stock');

    expect(stockColumn?.defaultValue).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should test connection successfully', async () => {
    const testConnector = new OpenGaussConnector(config);
    const result = await testConnector.testConnection();

    expect(result).toBe(true);
    await testConnector.disconnect();
  }, INTEGRATION_TIMEOUT);

  it('should handle connection with invalid credentials', async () => {
    const invalidConfig: OpenGaussConfig = {
      ...config,
      password: 'wrong_password',
    };

    const failingConnector = new OpenGaussConnector(invalidConfig);
    const result = await failingConnector.testConnection();

    expect(result).toBe(false);
  }, INTEGRATION_TIMEOUT);

  it('should return null for non-existent table', async () => {
    const details = await connector.getTableDetails('nonexistent_table');
    expect(details).toBeNull();
  }, INTEGRATION_TIMEOUT);

  it('should handle VARCHAR types', async () => {
    const details = await connector.getTableDetails('users');
    const emailColumn = details?.columns.find(c => c.name === 'email');

    expect(emailColumn?.type).toContain('character varying');
  }, INTEGRATION_TIMEOUT);

  it('should handle TIMESTAMP type', async () => {
    const details = await connector.getTableDetails('orders');
    const dateColumn = details?.columns.find(c => c.name === 'order_date');

    expect(dateColumn?.type).toContain('timestamp');
  }, INTEGRATION_TIMEOUT);
});
