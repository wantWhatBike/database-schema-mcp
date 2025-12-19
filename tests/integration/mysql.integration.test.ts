/**
 * MySQL Integration Tests
 *
 * These tests connect to a real MySQL database instance (no mocks).
 * Requires Docker environment to be running: ./tests/integration/setup.sh setup
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MySQLConnector } from '../../src/connectors/mysql.js';
import type { MySQLConfig } from '../../src/types/schema.js';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

// Load integration test config
const configPath = path.join(__dirname, 'config.json');
const testConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const INTEGRATION_TIMEOUT = 30000;

describe('MySQL Integration Tests (Real Database)', () => {
  let connector: MySQLConnector;
  let connection: mysql.Connection;
  const config: MySQLConfig = testConfig.databases.mysql;

  beforeEach(async () => {
    // Create a direct MySQL connection for test data setup
    connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      multipleStatements: true
    });

    // Clean up any existing test tables
    await connection.query(`
      DROP TABLE IF EXISTS order_items;
      DROP TABLE IF EXISTS orders;
      DROP TABLE IF EXISTS products;
      DROP TABLE IF EXISTS users;
      DROP VIEW IF EXISTS active_users;
      DROP PROCEDURE IF EXISTS get_user_count;
    `);

    // Create test schema with full structure
    await connection.query(`
      -- Users table
      CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        username VARCHAR(100) NOT NULL,
        age INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY email (email),
        KEY idx_username (username),
        KEY idx_created (created_at)
      ) COMMENT='User accounts';

      -- Products table
      CREATE TABLE products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        stock INT DEFAULT 0,
        UNIQUE KEY idx_name (name)
      ) COMMENT='Product catalog';

      -- Orders table
      CREATE TABLE orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        order_date DATETIME NOT NULL,
        total DECIMAL(10,2),
        status ENUM('pending','shipped','delivered') DEFAULT 'pending',
        KEY idx_user (user_id),
        KEY idx_date (order_date),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE RESTRICT
      ) COMMENT='Customer orders';

      -- Order items table
      CREATE TABLE order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        KEY idx_order (order_id),
        KEY idx_product (product_id),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE ON UPDATE RESTRICT,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT ON UPDATE RESTRICT
      );

      -- View
      CREATE VIEW active_users AS
      SELECT id, email, username
      FROM users
      WHERE age >= 18;

      -- Stored procedure
      CREATE PROCEDURE get_user_count()
      BEGIN
        SELECT COUNT(*) as total FROM users;
      END;
    `);

    // Insert test data
    await connection.query(`
      INSERT INTO users (email, username, age) VALUES
      ('user1@example.com', 'user1', 25),
      ('user2@example.com', 'user2', 30),
      ('user3@example.com', 'user3', 17);

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
    connector = new MySQLConnector(config);
    await connector.connect();
  }, INTEGRATION_TIMEOUT);

  afterEach(async () => {
    // Cleanup
    if (connector) {
      await connector.disconnect();
    }
    if (connection) {
      await connection.query(`
        DROP TABLE IF EXISTS order_items;
        DROP TABLE IF EXISTS orders;
        DROP TABLE IF EXISTS products;
        DROP TABLE IF EXISTS users;
        DROP VIEW IF EXISTS active_users;
        DROP PROCEDURE IF EXISTS get_user_count;
      `);
      await connection.end();
    }
  }, INTEGRATION_TIMEOUT);

  it('should connect to real MySQL database', () => {
    expect(connector).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should retrieve MySQL version', async () => {
    const schema = await connector.getSchema();
    expect(schema.version).toBeDefined();
    expect(schema.version).toContain('8.0');
  }, INTEGRATION_TIMEOUT);

  it('should list all tables', async () => {
    const tables = await connector.listTables();

    expect(tables).toHaveLength(4);
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('products');
    expect(tableNames).toContain('orders');
    expect(tableNames).toContain('order_items');

    // Check row counts
    const usersTable = tables.find(t => t.name === 'users');
    expect(usersTable?.rowCount).toBe(3);
  }, INTEGRATION_TIMEOUT);

  it('should get complete schema with all details', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('mysql');
    expect(schema.databaseName).toBe('testdb');
    expect(schema.tables).toHaveLength(4);

    // Check users table structure
    const usersTable = schema.tables.find(t => t.name === 'users');
    expect(usersTable).toBeDefined();
    expect(usersTable?.comment).toBe('User accounts');
    expect(usersTable?.columns).toHaveLength(5);

    // Check columns
    const emailColumn = usersTable?.columns.find(c => c.name === 'email');
    expect(emailColumn).toMatchObject({
      name: 'email',
      type: 'varchar(255)',
      nullable: false
    });

    const ageColumn = usersTable?.columns.find(c => c.name === 'age');
    expect(ageColumn?.nullable).toBe(true);

    // Check indexes
    expect(usersTable?.indexes?.length).toBeGreaterThanOrEqual(3);
    const primaryIndex = usersTable?.indexes?.find(idx => idx.name === 'PRIMARY');
    expect(primaryIndex).toMatchObject({
      name: 'PRIMARY',
      columns: ['id'],
      isUnique: true,
      isPrimary: true
    });

    const emailIndex = usersTable?.indexes?.find(idx => idx.name === 'email');
    expect(emailIndex).toMatchObject({
      isUnique: true,
      isPrimary: false
    });
  }, INTEGRATION_TIMEOUT);

  it('should get table details with foreign keys', async () => {
    const orderDetails = await connector.getTableDetails('orders');

    expect(orderDetails).toBeDefined();
    expect(orderDetails?.name).toBe('orders');
    expect(orderDetails?.columns).toHaveLength(5);

    // Check foreign keys
    expect(orderDetails?.foreignKeys?.length).toBeGreaterThanOrEqual(1);
    const userFk = orderDetails?.foreignKeys?.find(fk => fk.columns.includes('user_id'));
    expect(userFk).toMatchObject({
      columns: ['user_id'],
      referencedTable: 'users',
      referencedColumns: ['id']
    });

    // Check ENUM type
    const statusColumn = orderDetails?.columns.find(c => c.name === 'status');
    expect(statusColumn?.type).toContain('enum');
  }, INTEGRATION_TIMEOUT);

  it('should handle multiple foreign keys', async () => {
    const details = await connector.getTableDetails('order_items');

    expect(details?.foreignKeys?.length).toBeGreaterThanOrEqual(2);

    const orderFk = details?.foreignKeys?.find(fk => fk.columns.includes('order_id'));
    expect(orderFk).toMatchObject({
      columns: ['order_id'],
      referencedTable: 'orders',
      referencedColumns: ['id']
    });

    const productFk = details?.foreignKeys?.find(fk => fk.columns.includes('product_id'));
    expect(productFk).toMatchObject({
      columns: ['product_id'],
      referencedTable: 'products',
      referencedColumns: ['id']
    });
  }, INTEGRATION_TIMEOUT);

  it('should extract views', async () => {
    const schema = await connector.getSchema();

    expect(schema.views).toBeDefined();
    expect(schema.views?.length).toBeGreaterThanOrEqual(1);

    const activeUsersView = schema.views?.find(v => v.name === 'active_users');
    expect(activeUsersView).toBeDefined();
    expect(activeUsersView?.definition?.toUpperCase()).toContain('SELECT');
    expect(activeUsersView?.definition).toContain('users');
  }, INTEGRATION_TIMEOUT);

  it('should extract stored procedures', async () => {
    const schema = await connector.getSchema();

    expect(schema.procedures).toBeDefined();
    expect(schema.procedures?.length).toBeGreaterThanOrEqual(1);

    const getUserCount = schema.procedures?.find(p => p.name === 'get_user_count');
    expect(getUserCount).toBeDefined();
    expect(getUserCount?.name).toBe('get_user_count');
  }, INTEGRATION_TIMEOUT);

  it('should search for columns across tables', async () => {
    const idTables = await connector.searchColumns('id');
    expect(idTables.length).toBeGreaterThanOrEqual(4);
    expect(idTables).toContain('users');
    expect(idTables).toContain('orders');

    const emailTables = await connector.searchColumns('email');
    expect(emailTables).toContain('users');

    const nonExistent = await connector.searchColumns('nonexistent_column_xyz');
    expect(nonExistent).toHaveLength(0);
  }, INTEGRATION_TIMEOUT);

  it('should handle DECIMAL type correctly', async () => {
    const productDetails = await connector.getTableDetails('products');
    const priceColumn = productDetails?.columns.find(c => c.name === 'price');

    expect(priceColumn).toBeDefined();
    expect(priceColumn?.type).toBe('decimal(10,2)');
    expect(priceColumn?.nullable).toBe(false);
  }, INTEGRATION_TIMEOUT);

  it('should handle AUTO_INCREMENT correctly', async () => {
    const userDetails = await connector.getTableDetails('users');
    const idColumn = userDetails?.columns.find(c => c.name === 'id');

    expect(idColumn).toBeDefined();
    expect(idColumn?.type).toBe('int');
    expect(idColumn?.isAutoIncrement).toBe(true);
  }, INTEGRATION_TIMEOUT);

  it('should handle default values', async () => {
    const productDetails = await connector.getTableDetails('products');
    const stockColumn = productDetails?.columns.find(c => c.name === 'stock');

    expect(stockColumn?.defaultValue).toBe('0');
  }, INTEGRATION_TIMEOUT);

  it('should test connection successfully', async () => {
    const testConnector = new MySQLConnector(config);
    const result = await testConnector.testConnection();

    expect(result).toBe(true);
    await testConnector.disconnect();
  }, INTEGRATION_TIMEOUT);

  it('should handle connection with invalid credentials', async () => {
    const invalidConfig: MySQLConfig = {
      ...config,
      password: 'wrong_password'
    };

    const failingConnector = new MySQLConnector(invalidConfig);
    const result = await failingConnector.testConnection();

    expect(result).toBe(false);
  }, INTEGRATION_TIMEOUT);
});
