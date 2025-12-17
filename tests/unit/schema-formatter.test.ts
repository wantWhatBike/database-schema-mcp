import { describe, it, expect } from 'vitest';
import { formatSchemaAsMarkdown } from '../src/schema/formatter.js';
import type { SchemaInfo, TableDetails } from '../src/types/schema.js';

describe('Schema Formatter', () => {
  describe('formatSchemaAsMarkdown - Relational Database', () => {
    it('should format MySQL schema with tables', () => {
      const schema: SchemaInfo = {
        databaseType: 'mysql',
        databaseName: 'testdb',
        version: 'MySQL 8.0.32',
        tables: [
          {
            name: 'users',
            type: 'table',
            comment: 'User accounts',
            rowCount: 100,
            columns: [
              {
                name: 'id',
                type: 'INT',
                nullable: false,
                isPrimaryKey: true,
                isAutoIncrement: true,
              },
              {
                name: 'email',
                type: 'VARCHAR(255)',
                nullable: false,
                comment: 'User email address',
              },
            ],
            indexes: [
              {
                name: 'PRIMARY',
                columns: ['id'],
                isUnique: true,
                isPrimary: true,
              },
              {
                name: 'idx_email',
                columns: ['email'],
                isUnique: true,
                isPrimary: false,
              },
            ],
            foreignKeys: [],
            primaryKey: {
              name: 'PRIMARY',
              columns: ['id'],
              isUnique: true,
              isPrimary: true,
            },
          },
        ],
      };

      const markdown = formatSchemaAsMarkdown(schema);

      expect(markdown).toContain('# Database Schema: testdb');
      expect(markdown).toContain('**Database Type**: MYSQL');
      expect(markdown).toContain('**Version**: MySQL 8.0.32');
      expect(markdown).toContain('## Tables (1)');
      expect(markdown).toContain('### Table: users');
      expect(markdown).toContain('**Description**: User accounts');
      expect(markdown).toContain('**Row Count**: 100');
      expect(markdown).toContain('**Columns**:');
      expect(markdown).toContain('| Name | Type | Nullable | Default | Comment |');
      expect(markdown).toContain('| **id** (PK) | INT AUTO_INCREMENT | NO |');
      expect(markdown).toContain('| email | VARCHAR(255) | NO |');
      expect(markdown).toContain('**Indexes**:');
      expect(markdown).toContain('- PRIMARY KEY: `PRIMARY` on (id)');
      expect(markdown).toContain('- UNIQUE: `idx_email` on (email)');
    });

    it('should format schema with foreign keys', () => {
      const schema: SchemaInfo = {
        databaseType: 'postgresql',
        databaseName: 'testdb',
        tables: [
          {
            name: 'orders',
            type: 'table',
            columns: [],
            indexes: [],
            foreignKeys: [
              {
                name: 'fk_user',
                columns: ['user_id'],
                referencedTable: 'users',
                referencedColumns: ['id'],
                onDelete: 'CASCADE',
                onUpdate: 'RESTRICT',
              },
            ],
          },
        ],
      };

      const markdown = formatSchemaAsMarkdown(schema);

      expect(markdown).toContain('**Foreign Keys**:');
      expect(markdown).toContain('- `fk_user`: (user_id) REFERENCES users(id)');
      expect(markdown).toContain('- ON DELETE: CASCADE');
      expect(markdown).toContain('- ON UPDATE: RESTRICT');
    });

    it('should format schema with views', () => {
      const schema: SchemaInfo = {
        databaseType: 'mysql',
        databaseName: 'testdb',
        tables: [],
        views: [
          {
            name: 'active_users',
            definition: 'SELECT * FROM users WHERE status = "active"',
            comment: 'View of active users',
          },
        ],
      };

      const markdown = formatSchemaAsMarkdown(schema);

      expect(markdown).toContain('## Views (1)');
      expect(markdown).toContain('### View: active_users');
      expect(markdown).toContain('**Definition**:');
      expect(markdown).toContain('```sql');
      expect(markdown).toContain('SELECT * FROM users WHERE status = "active"');
    });
  });

  describe('formatSchemaAsMarkdown - MongoDB', () => {
    it('should format MongoDB schema', () => {
      const schema: SchemaInfo = {
        databaseType: 'mongodb',
        databaseName: 'mydb',
        version: 'MongoDB 6.0',
        collections: [
          {
            name: 'users',
            documentCount: 1000,
            sampleSize: 100,
            fields: [
              {
                name: '_id',
                types: [{ type: 'ObjectId', percentage: 100 }],
                occurrence: 100,
              },
              {
                name: 'email',
                types: [
                  { type: 'string', percentage: 95 },
                  { type: 'null', percentage: 5 },
                ],
                occurrence: 100,
              },
            ],
            indexes: [
              {
                name: '_id_',
                keys: { _id: 1 },
                unique: true,
              },
              {
                name: 'email_1',
                keys: { email: 1 },
                unique: true,
              },
            ],
          },
        ],
      };

      const markdown = formatSchemaAsMarkdown(schema);

      expect(markdown).toContain('# Database Schema: mydb');
      expect(markdown).toContain('**Database Type**: MONGODB');
      expect(markdown).toContain('## Collections (1)');
      expect(markdown).toContain('### Collection: users');
      expect(markdown).toContain('**Document Count**: 1,000');
      expect(markdown).toContain('**Fields** (inferred from 100 samples):');
      expect(markdown).toContain('| _id | ObjectId (100%) | 100% |');
      expect(markdown).toContain('| email | string (95%), null (5%) | 100% |');
      expect(markdown).toContain('**Indexes**:');
      expect(markdown).toContain('- `_id_` (UNIQUE): { _id: 1 }');
    });
  });

  describe('formatSchemaAsMarkdown - Redis', () => {
    it('should format Redis schema', () => {
      const schema: SchemaInfo = {
        databaseType: 'redis',
        databaseName: 'db0',
        version: 'Redis 7.0',
        totalKeys: 1500,
        keyPatterns: [
          {
            pattern: 'user:*',
            count: 1000,
            sampleKeys: ['user:123', 'user:456'],
            types: { string: 800, hash: 200 },
          },
          {
            pattern: 'session:*',
            count: 500,
            sampleKeys: ['session:abc', 'session:def'],
            types: { string: 500 },
          },
        ],
      };

      const markdown = formatSchemaAsMarkdown(schema);

      expect(markdown).toContain('# Database Schema: db0');
      expect(markdown).toContain('**Database Type**: REDIS');
      expect(markdown).toContain('## Key Patterns (Total Keys: 1,500)');
      expect(markdown).toContain('### Pattern: user:*');
      expect(markdown).toContain('**Count**: 1,000');
      expect(markdown).toContain('**Types**:');
      expect(markdown).toContain('- string: 800');
      expect(markdown).toContain('- hash: 200');
      expect(markdown).toContain('**Sample Keys**:');
      expect(markdown).toContain('- user:123');
    });
  });

  describe('formatSchemaAsMarkdown - Kafka', () => {
    it('should format Kafka schema', () => {
      const schema: SchemaInfo = {
        databaseType: 'kafka',
        databaseName: 'kafka-cluster',
        version: 'Kafka',
        topics: [
          {
            name: 'user-events',
            partitions: 3,
            replicationFactor: 2,
            config: {
              'retention.ms': '604800000',
              'max.message.bytes': '1048576',
            },
          },
        ],
      };

      const markdown = formatSchemaAsMarkdown(schema);

      expect(markdown).toContain('# Database Schema: kafka-cluster');
      expect(markdown).toContain('**Database Type**: KAFKA');
      expect(markdown).toContain('## Topics (1)');
      expect(markdown).toContain('### Topic: user-events');
      expect(markdown).toContain('**Partitions**: 3');
      expect(markdown).toContain('**Replication Factor**: 2');
      expect(markdown).toContain('**Configuration**:');
      expect(markdown).toContain('- retention.ms: 604800000');
    });
  });
});
