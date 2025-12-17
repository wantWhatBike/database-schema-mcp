import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';
import Database from 'better-sqlite3';
import { SQLiteConnector } from '../src/connectors/sqlite.js';
import type { DatabaseConfig } from '../src/types/schema.js';

describe('SQLite Connector Integration Tests', () => {
  const dbPath = './test-db.sqlite';
  let db: Database.Database;

  beforeEach(async () => {
    // Ensure old database is removed before creating new one
    try {
      if (existsSync(dbPath)) {
        await unlink(dbPath);
      }
    } catch {
      // Ignore
    }

    // Create test database
    db = new Database(dbPath);

    // Create test tables
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    db.exec(`
      CREATE INDEX idx_orders_user_id ON orders(user_id);
    `);

    db.exec(`
      CREATE INDEX idx_orders_status ON orders(status);
    `);

    db.exec(`
      CREATE VIEW active_orders AS
      SELECT * FROM orders WHERE status != 'cancelled';
    `);

    // Insert test data
    db.exec(`
      INSERT INTO users (email, name) VALUES
      ('user1@example.com', 'User 1'),
      ('user2@example.com', 'User 2');
    `);

    db.exec(`
      INSERT INTO orders (user_id, amount, status) VALUES
      (1, 99.99, 'completed'),
      (1, 149.99, 'pending'),
      (2, 79.99, 'completed');
    `);

    db.close();
  });

  afterEach(async () => {
    try {
      await unlink(dbPath);
    } catch {
      // Ignore
    }
  });

  describe('Connection Management', () => {
    it('should connect and disconnect successfully', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: dbPath,
      };

      const connector = new SQLiteConnector(config);
      await connector.connect();
      await connector.disconnect();
    });

    it('should test connection successfully', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: dbPath,
      };

      const connector = new SQLiteConnector(config);
      const result = await connector.testConnection();

      expect(result).toBe(true);
    });
  });

  describe('Schema Extraction', () => {
    it('should list all tables', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: dbPath,
      };

      const connector = new SQLiteConnector(config);
      await connector.connect();

      const tables = await connector.listTables();
      await connector.disconnect();

      expect(tables).toHaveLength(2);
      expect(tables.map((t) => t.name)).toContain('users');
      expect(tables.map((t) => t.name)).toContain('orders');
    });

    it('should get table details with columns', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: dbPath,
      };

      const connector = new SQLiteConnector(config);
      await connector.connect();

      const details = await connector.getTableDetails('users');
      await connector.disconnect();

      expect(details).toBeDefined();
      expect(details!.name).toBe('users');
      expect(details!.columns).toHaveLength(4);

      const idColumn = details!.columns.find((c) => c.name === 'id');
      expect(idColumn).toBeDefined();
      expect(idColumn!.type).toBe('INTEGER');
      expect(idColumn!.isPrimaryKey).toBe(true);
      expect(idColumn!.isAutoIncrement).toBe(true);

      const emailColumn = details!.columns.find((c) => c.name === 'email');
      expect(emailColumn).toBeDefined();
      expect(emailColumn!.type).toBe('TEXT');
      expect(emailColumn!.nullable).toBe(false);
    });

    it('should extract indexes', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: dbPath,
      };

      const connector = new SQLiteConnector(config);
      await connector.connect();

      const details = await connector.getTableDetails('orders');
      await connector.disconnect();

      expect(details).toBeDefined();
      expect(details!.indexes.length).toBeGreaterThan(0);

      const userIdIndex = details!.indexes.find((i) =>
        i.name.includes('orders_user_id')
      );
      expect(userIdIndex).toBeDefined();
      expect(userIdIndex!.columns).toContain('user_id');
    });

    it('should extract foreign keys', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: dbPath,
      };

      const connector = new SQLiteConnector(config);
      await connector.connect();

      const details = await connector.getTableDetails('orders');
      await connector.disconnect();

      expect(details).toBeDefined();
      expect(details!.foreignKeys).toHaveLength(1);

      const fk = details!.foreignKeys[0];
      expect(fk.columns).toContain('user_id');
      expect(fk.referencedTable).toBe('users');
      expect(fk.referencedColumns).toContain('id');
      expect(fk.onDelete).toBe('CASCADE');
    });

    it('should get complete schema', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: dbPath,
      };

      const connector = new SQLiteConnector(config);
      await connector.connect();

      const schema = await connector.getSchema();
      await connector.disconnect();

      expect(schema.databaseType).toBe('sqlite');
      expect(schema.databaseName).toBe(dbPath);
      expect(schema.tables).toHaveLength(2);
      expect(schema.views).toHaveLength(1);
      expect(schema.views![0].name).toBe('active_orders');
    });

    it('should search columns', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: dbPath,
      };

      const connector = new SQLiteConnector(config);
      await connector.connect();

      const tablesWithEmail = await connector.searchColumns('email');
      await connector.disconnect();

      expect(tablesWithEmail).toContain('users');
      expect(tablesWithEmail).not.toContain('orders');
    });

    it('should return null for non-existent table', async () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: dbPath,
      };

      const connector = new SQLiteConnector(config);
      await connector.connect();

      const details = await connector.getTableDetails('non_existent');
      await connector.disconnect();

      expect(details).toBeNull();
    });
  });
});
