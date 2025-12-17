import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { SQLiteConnector } from '../../src/connectors/sqlite.js';
import type { SQLiteConfig } from '../../src/types/schema.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync } from 'fs';

describe('SQLite Security Tests', () => {
  const testDbPath = join(tmpdir(), 'sqlite-security-test.db');

  it('should handle table names with spaces', async () => {
    const db = new Database(testDbPath);

    try {
      // Create table with space in name
      db.exec('CREATE TABLE "test table" (id INTEGER PRIMARY KEY, name TEXT)');
      db.exec('INSERT INTO "test table" (name) VALUES (\'test\')');

      const config: SQLiteConfig = {
        type: 'sqlite',
        database: testDbPath,
      };

      const connector = new SQLiteConnector(config);
      await connector.connect();

      // Should be able to get details for table with space
      const details = await connector.getTableDetails('test table');
      expect(details).toBeDefined();
      expect(details?.name).toBe('test table');
      expect(details?.columns.length).toBeGreaterThan(0);

      await connector.disconnect();
    } finally {
      db.close();
      try { unlinkSync(testDbPath); } catch {}
    }
  });

  it('should handle table names with double quotes', async () => {
    const db = new Database(testDbPath);

    try {
      // Create table with double quote in name (escaped as "")
      db.exec('CREATE TABLE "test""table" (id INTEGER PRIMARY KEY, name TEXT)');
      db.exec('INSERT INTO "test""table" (name) VALUES (\'test\')');

      const config: SQLiteConfig = {
        type: 'sqlite',
        database: testDbPath,
      };

      const connector = new SQLiteConnector(config);
      await connector.connect();

      // Should be able to get details for table with double quote
      const details = await connector.getTableDetails('test"table');
      expect(details).toBeDefined();
      expect(details?.name).toBe('test"table');
      expect(details?.columns.length).toBeGreaterThan(0);

      await connector.disconnect();
    } finally {
      db.close();
      try { unlinkSync(testDbPath); } catch {}
    }
  });

  it('should handle table names with special characters', async () => {
    const db = new Database(testDbPath);

    try {
      // Create tables with various special characters
      db.exec('CREATE TABLE "test-table" (id INTEGER PRIMARY KEY, name TEXT)');
      db.exec('CREATE TABLE "test.table" (id INTEGER PRIMARY KEY, name TEXT)');
      db.exec('CREATE TABLE "test$table" (id INTEGER PRIMARY KEY, name TEXT)');

      const config: SQLiteConfig = {
        type: 'sqlite',
        database: testDbPath,
      };

      const connector = new SQLiteConnector(config);
      await connector.connect();

      // Test hyphen
      let details = await connector.getTableDetails('test-table');
      expect(details).toBeDefined();
      expect(details?.name).toBe('test-table');

      // Test dot
      details = await connector.getTableDetails('test.table');
      expect(details).toBeDefined();
      expect(details?.name).toBe('test.table');

      // Test dollar sign
      details = await connector.getTableDetails('test$table');
      expect(details).toBeDefined();
      expect(details?.name).toBe('test$table');

      await connector.disconnect();
    } finally {
      db.close();
      try { unlinkSync(testDbPath); } catch {}
    }
  });

  it('should reject non-existent tables (security check)', async () => {
    const db = new Database(testDbPath);

    try {
      db.exec('CREATE TABLE legitimate_table (id INTEGER PRIMARY KEY)');

      const config: SQLiteConfig = {
        type: 'sqlite',
        database: testDbPath,
      };

      const connector = new SQLiteConnector(config);
      await connector.connect();

      // Attempt to access non-existent table with potential SQL injection
      const details = await connector.getTableDetails('nonexistent"; DROP TABLE legitimate_table; --');

      // Should return null (table doesn't exist)
      expect(details).toBeNull();

      // Verify the legitimate table still exists (not dropped)
      const legitDetails = await connector.getTableDetails('legitimate_table');
      expect(legitDetails).toBeDefined();
      expect(legitDetails?.name).toBe('legitimate_table');

      await connector.disconnect();
    } finally {
      db.close();
      try { unlinkSync(testDbPath); } catch {}
    }
  });

  it('should handle tables with indexes having special characters', async () => {
    const db = new Database(testDbPath);

    try {
      db.exec('CREATE TABLE test_table (id INTEGER PRIMARY KEY, email TEXT)');
      db.exec('CREATE INDEX "email-idx" ON test_table(email)');

      const config: SQLiteConfig = {
        type: 'sqlite',
        database: testDbPath,
      };

      const connector = new SQLiteConnector(config);
      await connector.connect();

      const details = await connector.getTableDetails('test_table');
      expect(details).toBeDefined();
      expect(details?.indexes).toBeDefined();

      // Should find the index with hyphen in name
      const emailIndex = details?.indexes.find(idx => idx.name === 'email-idx');
      expect(emailIndex).toBeDefined();

      await connector.disconnect();
    } finally {
      db.close();
      try { unlinkSync(testDbPath); } catch {}
    }
  });
});
