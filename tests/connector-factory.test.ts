import { describe, it, expect, beforeAll } from 'vitest';
import {
  registerConnector,
  createConnector,
  getSupportedDatabaseTypes,
  isSupported,
} from '../src/connectors/factory.js';
import type { DatabaseConfig } from '../src/types/schema.js';

// Import connectors to register them
import '../src/connectors/mysql.js';
import '../src/connectors/postgresql.js';
import '../src/connectors/sqlite.js';
import '../src/connectors/mongodb.js';
import '../src/connectors/redis.js';
import '../src/connectors/kafka.js';

describe('Connector Factory', () => {
  describe('getSupportedDatabaseTypes', () => {
    it('should return all registered database types', () => {
      const types = getSupportedDatabaseTypes();

      expect(types).toContain('mysql');
      expect(types).toContain('postgresql');
      expect(types).toContain('sqlite');
      expect(types).toContain('mongodb');
      expect(types).toContain('redis');
      expect(types).toContain('kafka');
      expect(types.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('isSupported', () => {
    it('should return true for supported database types', () => {
      expect(isSupported('mysql')).toBe(true);
      expect(isSupported('postgresql')).toBe(true);
      expect(isSupported('mongodb')).toBe(true);
    });

    it('should return false for unsupported database types', () => {
      expect(isSupported('unsupported')).toBe(false);
      expect(isSupported('etcd')).toBe(false);
      expect(isSupported('')).toBe(false);
    });
  });

  describe('createConnector', () => {
    it('should create MySQL connector', () => {
      const config: DatabaseConfig = {
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        database: 'test',
        user: 'root',
        password: 'password',
      };

      const connector = createConnector(config);
      expect(connector).toBeDefined();
      expect(connector.constructor.name).toBe('MySQLConnector');
    });

    it('should create PostgreSQL connector', () => {
      const config: DatabaseConfig = {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'postgres',
        password: 'password',
      };

      const connector = createConnector(config);
      expect(connector).toBeDefined();
      expect(connector.constructor.name).toBe('PostgreSQLConnector');
    });

    it('should create SQLite connector', () => {
      const config: DatabaseConfig = {
        type: 'sqlite',
        database: '/path/to/db.sqlite',
      };

      const connector = createConnector(config);
      expect(connector).toBeDefined();
      expect(connector.constructor.name).toBe('SQLiteConnector');
    });

    it('should create MongoDB connector', () => {
      const config: DatabaseConfig = {
        type: 'mongodb',
        uri: 'mongodb://localhost:27017',
        database: 'test',
      };

      const connector = createConnector(config);
      expect(connector).toBeDefined();
      expect(connector.constructor.name).toBe('MongoDBConnector');
    });

    it('should create Redis connector', () => {
      const config: DatabaseConfig = {
        type: 'redis',
        host: 'localhost',
        port: 6379,
      };

      const connector = createConnector(config);
      expect(connector).toBeDefined();
      expect(connector.constructor.name).toBe('RedisConnector');
    });

    it('should create Kafka connector', () => {
      const config: DatabaseConfig = {
        type: 'kafka',
        brokers: ['localhost:9092'],
      };

      const connector = createConnector(config);
      expect(connector).toBeDefined();
      expect(connector.constructor.name).toBe('KafkaConnector');
    });

    it('should throw error for unsupported database type', () => {
      const config: DatabaseConfig = {
        type: 'unsupported' as any,
      };

      expect(() => createConnector(config)).toThrow(
        'Unsupported database type: unsupported'
      );
    });
  });
});
