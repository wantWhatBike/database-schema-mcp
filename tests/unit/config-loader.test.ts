import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, unlink } from 'fs/promises';
import { loadConfig, getDatabaseConfig, getDatabaseNames } from '../src/config/loader.js';

describe('Config Loader', () => {
  const testConfigPath = './test-config.json';

  afterEach(async () => {
    try {
      await unlink(testConfigPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe('loadConfig', () => {
    it('should load valid config file', async () => {
      const config = {
        databases: {
          test_db: {
            type: 'mysql',
            host: 'localhost',
            port: 3306,
            database: 'testdb',
            user: 'root',
            password: 'password',
          },
        },
      };

      await writeFile(testConfigPath, JSON.stringify(config));
      const loaded = await loadConfig(testConfigPath);

      expect(loaded).toEqual(config);
      expect(loaded.databases.test_db.type).toBe('mysql');
    });

    it('should replace environment variables', async () => {
      process.env.TEST_PASSWORD = 'secret123';

      const config = {
        databases: {
          test_db: {
            type: 'mysql',
            host: 'localhost',
            password: '${TEST_PASSWORD}',
          },
        },
      };

      await writeFile(testConfigPath, JSON.stringify(config));
      const loaded = await loadConfig(testConfigPath);

      expect(loaded.databases.test_db.password).toBe('secret123');

      delete process.env.TEST_PASSWORD;
    });

    it('should throw error for undefined environment variable', async () => {
      const config = {
        databases: {
          test_db: {
            type: 'mysql',
            password: '${UNDEFINED_VAR}',
          },
        },
      };

      await writeFile(testConfigPath, JSON.stringify(config));

      await expect(loadConfig(testConfigPath)).rejects.toThrow(
        'Environment variable UNDEFINED_VAR is not defined'
      );
    });

    it('should throw error for invalid JSON', async () => {
      await writeFile(testConfigPath, 'invalid json');

      await expect(loadConfig(testConfigPath)).rejects.toThrow();
    });

    it('should throw error for missing databases object', async () => {
      await writeFile(testConfigPath, JSON.stringify({}));

      await expect(loadConfig(testConfigPath)).rejects.toThrow(
        'Invalid config: missing "databases" object'
      );
    });

    it('should throw error for non-existent file', async () => {
      await expect(loadConfig('./non-existent.json')).rejects.toThrow();
    });
  });

  describe('getDatabaseConfig', () => {
    it('should get specific database config', async () => {
      const config = {
        databases: {
          db1: { type: 'mysql', host: 'localhost' },
          db2: { type: 'postgresql', host: 'postgres-host' },
        },
      };

      await writeFile(testConfigPath, JSON.stringify(config));
      const loaded = await loadConfig(testConfigPath);
      const dbConfig = getDatabaseConfig(loaded, 'db1');

      expect(dbConfig.type).toBe('mysql');
      expect(dbConfig.host).toBe('localhost');
    });

    it('should throw error for non-existent database', async () => {
      const config = {
        databases: {
          db1: { type: 'mysql' },
        },
      };

      await writeFile(testConfigPath, JSON.stringify(config));
      const loaded = await loadConfig(testConfigPath);

      expect(() => getDatabaseConfig(loaded, 'non_existent')).toThrow(
        'Database "non_existent" not found in configuration'
      );
    });
  });

  describe('getDatabaseNames', () => {
    it('should return all database names', async () => {
      const config = {
        databases: {
          db1: { type: 'mysql' },
          db2: { type: 'postgresql' },
          db3: { type: 'mongodb' },
        },
      };

      await writeFile(testConfigPath, JSON.stringify(config));
      const loaded = await loadConfig(testConfigPath);
      const names = getDatabaseNames(loaded);

      expect(names).toEqual(['db1', 'db2', 'db3']);
    });

    it('should return empty array for no databases', async () => {
      const config = {
        databases: {},
      };

      await writeFile(testConfigPath, JSON.stringify(config));
      const loaded = await loadConfig(testConfigPath);
      const names = getDatabaseNames(loaded);

      expect(names).toEqual([]);
    });
  });
});
