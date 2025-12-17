/**
 * SQLite Integration Tests
 *
 * These tests connect to a real SQLite database instance (no mocks).
 * SQLite is file-based, so no Docker environment needed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteConnector } from '../../src/connectors/sqlite.js';
import type { SQLiteConfig } from '../../src/types/schema.js';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const INTEGRATION_TIMEOUT = 30000;
const TEST_DB_PATH = path.join(__dirname, 'test.db');

describe('SQLite Integration Tests (Real Database)', () => {
  let connector: SQLiteConnector;
  let db: Database.Database;
  const config: SQLiteConfig = {
    type: 'sqlite',
    database: TEST_DB_PATH,
  };

  beforeEach(async () => {
    // Remove existing test database if it exists
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Create a direct SQLite connection for test data setup
    db = new Database(TEST_DB_PATH);

    // Enable foreign keys
    db.pragma('foreign_keys = ON');

    // Create test schema with full structure
    db.exec(`
      -- Users table
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL,
        age INTEGER,
        is_active INTEGER DEFAULT 1,
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- Products table
      CREATE TABLE products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        price REAL NOT NULL,
        stock INTEGER DEFAULT 0
      );

      -- Orders table
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        order_date TEXT NOT NULL,
        total REAL,
        status TEXT DEFAULT 'pending',
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- Order items table
      CREATE TABLE order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        price REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
      );

      -- Indexes
      CREATE INDEX idx_username ON users(username);
      CREATE INDEX idx_created ON users(created_at);
      CREATE INDEX idx_user ON orders(user_id);
      CREATE INDEX idx_date ON orders(order_date);
      CREATE INDEX idx_order ON order_items(order_id);
      CREATE INDEX idx_product ON order_items(product_id);

      -- View
      CREATE VIEW active_users AS
      SELECT id, email, username
      FROM users
      WHERE is_active = 1;
    `);

    // Insert test data
    db.exec(`
      INSERT INTO users (email, username, age, is_active, metadata) VALUES
      ('user1@example.com', 'user1', 25, 1, '{"role":"admin"}'),
      ('user2@example.com', 'user2', 30, 1, '{"role":"user"}'),
      ('user3@example.com', 'user3', 17, 0, NULL);

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
    connector = new SQLiteConnector(config);
    await connector.connect();
  }, INTEGRATION_TIMEOUT);

  afterEach(async () => {
    // Cleanup
    if (connector) {
      await connector.disconnect();
    }
    if (db) {
      db.close();
    }
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  }, INTEGRATION_TIMEOUT);

  it('should connect to real SQLite database', () => {
    expect(connector).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should retrieve SQLite version', async () => {
    const schema = await connector.getSchema();
    expect(schema.version).toBeDefined();
    expect(schema.version).toContain('SQLite');
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

    expect(schema.databaseType).toBe('sqlite');
    expect(schema.databaseName).toBe(TEST_DB_PATH);
    expect(schema.tables).toHaveLength(4);

    // Check users table structure
    const usersTable = schema.tables.find(t => t.name === 'users');
    expect(usersTable).toBeDefined();
    expect(usersTable?.columns).toBeDefined();
    expect(usersTable?.columns.length).toBeGreaterThanOrEqual(7);
  }, INTEGRATION_TIMEOUT);

  it('should get table details with columns', async () => {
    const details = await connector.getTableDetails('users');

    expect(details).toBeDefined();
    expect(details?.name).toBe('users');
    expect(details?.columns.length).toBeGreaterThanOrEqual(7);

    // Check email column
    const emailColumn = details?.columns.find(c => c.name === 'email');
    expect(emailColumn).toBeDefined();
    expect(emailColumn?.type).toBe('TEXT');
    expect(emailColumn?.nullable).toBe(false);

    // Check age column (nullable)
    const ageColumn = details?.columns.find(c => c.name === 'age');
    expect(ageColumn?.nullable).toBe(true);
  }, INTEGRATION_TIMEOUT);

  it('should identify primary key', async () => {
    const details = await connector.getTableDetails('users');

    const idColumn = details?.columns.find(c => c.name === 'id');
    expect(idColumn).toBeDefined();
    expect(idColumn?.isPrimaryKey).toBe(true);
    expect(idColumn?.isAutoIncrement).toBe(true);
  }, INTEGRATION_TIMEOUT);

  it('should get indexes', async () => {
    const details = await connector.getTableDetails('users');

    expect(details?.indexes).toBeDefined();
    expect(details?.indexes!.length).toBeGreaterThanOrEqual(3);

    // Check primary key index
    const primaryIndex = details?.indexes?.find(idx => idx.isPrimary);
    expect(primaryIndex).toBeDefined();
    expect(primaryIndex?.columns).toContain('id');

    // Check username index
    const usernameIndex = details?.indexes?.find(idx => idx.name === 'idx_username');
    expect(usernameIndex).toBeDefined();
    expect(usernameIndex?.columns).toContain('username');
  }, INTEGRATION_TIMEOUT);

  it('should identify unique constraints', async () => {
    const details = await connector.getTableDetails('users');

    const emailIndex = details?.indexes?.find(idx =>
      idx.columns.includes('email') && idx.isUnique
    );
    expect(emailIndex).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should get foreign keys', async () => {
    const orderDetails = await connector.getTableDetails('orders');

    expect(orderDetails?.foreignKeys).toBeDefined();
    expect(orderDetails?.foreignKeys!.length).toBeGreaterThanOrEqual(1);

    const userFk = orderDetails?.foreignKeys?.find(fk =>
      fk.referencedTable === 'users'
    );
    expect(userFk).toBeDefined();
    expect(userFk?.columns).toContain('user_id');
    expect(userFk?.referencedColumns).toContain('id');
    expect(userFk?.onDelete).toBe('CASCADE');
  }, INTEGRATION_TIMEOUT);

  it('should handle multiple foreign keys', async () => {
    const details = await connector.getTableDetails('order_items');

    expect(details?.foreignKeys).toBeDefined();
    expect(details?.foreignKeys!.length).toBeGreaterThanOrEqual(2);

    const orderFk = details?.foreignKeys?.find(fk =>
      fk.referencedTable === 'orders'
    );
    expect(orderFk).toBeDefined();
    expect(orderFk?.columns).toContain('order_id');

    const productFk = details?.foreignKeys?.find(fk =>
      fk.referencedTable === 'products'
    );
    expect(productFk).toBeDefined();
    expect(productFk?.columns).toContain('product_id');
  }, INTEGRATION_TIMEOUT);

  it('should extract views', async () => {
    const schema = await connector.getSchema();

    expect(schema.views).toBeDefined();
    expect(schema.views!.length).toBeGreaterThanOrEqual(1);

    const activeUsersView = schema.views!.find(v => v.name === 'active_users');
    expect(activeUsersView).toBeDefined();
    expect(activeUsersView?.definition).toContain('SELECT');
  }, INTEGRATION_TIMEOUT);

  it('should handle INTEGER type for primary keys', async () => {
    const details = await connector.getTableDetails('users');
    const idColumn = details?.columns.find(c => c.name === 'id');

    expect(idColumn?.type).toBe('INTEGER');
    expect(idColumn?.isAutoIncrement).toBe(true);
  }, INTEGRATION_TIMEOUT);

  it('should handle TEXT type', async () => {
    const details = await connector.getTableDetails('users');
    const usernameColumn = details?.columns.find(c => c.name === 'username');

    expect(usernameColumn?.type).toBe('TEXT');
  }, INTEGRATION_TIMEOUT);

  it('should handle REAL type', async () => {
    const details = await connector.getTableDetails('products');
    const priceColumn = details?.columns.find(c => c.name === 'price');

    expect(priceColumn?.type).toBe('REAL');
    expect(priceColumn?.nullable).toBe(false);
  }, INTEGRATION_TIMEOUT);

  it('should handle default values', async () => {
    const details = await connector.getTableDetails('products');
    const stockColumn = details?.columns.find(c => c.name === 'stock');

    expect(stockColumn?.defaultValue).toBe('0');
  }, INTEGRATION_TIMEOUT);

  it('should handle datetime functions as defaults', async () => {
    const details = await connector.getTableDetails('users');
    const createdAtColumn = details?.columns.find(c => c.name === 'created_at');

    expect(createdAtColumn).toBeDefined();
    expect(createdAtColumn?.defaultValue).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should test connection successfully', async () => {
    const testConnector = new SQLiteConnector(config);
    const result = await testConnector.testConnection();

    expect(result).toBe(true);
  }, INTEGRATION_TIMEOUT);

  it('should handle connection with invalid path', async () => {
    // SQLite will create files anywhere, so we test with undefined database path instead
    const invalidConfig: SQLiteConfig = {
      type: 'sqlite',
      database: undefined as any,
    };

    const failingConnector = new SQLiteConnector(invalidConfig);
    const result = await failingConnector.testConnection();

    expect(result).toBe(false);
  }, INTEGRATION_TIMEOUT);

  it('should return null for non-existent table', async () => {
    const details = await connector.getTableDetails('nonexistent_table');
    expect(details).toBeNull();
  }, INTEGRATION_TIMEOUT);

  it('should handle composite primary keys', async () => {
    // Create a table with composite primary key
    db.exec(`
      CREATE TABLE composite_pk_test (
        field1 TEXT,
        field2 TEXT,
        value TEXT,
        PRIMARY KEY (field1, field2)
      );
    `);

    const details = await connector.getTableDetails('composite_pk_test');
    const primaryIndex = details?.indexes?.find(idx => idx.isPrimary);

    expect(primaryIndex).toBeDefined();
    expect(primaryIndex?.columns.length).toBe(2);
    expect(primaryIndex?.columns).toContain('field1');
    expect(primaryIndex?.columns).toContain('field2');

    db.exec('DROP TABLE composite_pk_test');
  }, INTEGRATION_TIMEOUT);

  it('should handle NULL default values', async () => {
    const details = await connector.getTableDetails('users');
    const metadataColumn = details?.columns.find(c => c.name === 'metadata');

    expect(metadataColumn?.nullable).toBe(true);
  }, INTEGRATION_TIMEOUT);

  it('should handle boolean-like integers', async () => {
    const details = await connector.getTableDetails('users');
    const isActiveColumn = details?.columns.find(c => c.name === 'is_active');

    expect(isActiveColumn?.type).toBe('INTEGER');
    expect(isActiveColumn?.defaultValue).toBe('1');
  }, INTEGRATION_TIMEOUT);
});
