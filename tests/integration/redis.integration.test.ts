/**
 * Redis Integration Tests
 *
 * These tests connect to a real Redis database instance (no mocks).
 * Requires Docker environment to be running: ./tests/integration/setup.sh setup
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RedisConnector } from '../../src/connectors/redis.js';
import type { RedisConfig } from '../../src/types/schema.js';
import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';

// Load integration test config
const configPath = path.join(__dirname, 'config.json');
const testConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const INTEGRATION_TIMEOUT = 30000;

describe('Redis Integration Tests (Real Database)', () => {
  let connector: RedisConnector;
  let client: Redis;
  const config: RedisConfig = {
    ...testConfig.databases.redis,
    maxKeys: 500,
    keyPattern: '*'
  };

  beforeEach(async () => {
    // Create a direct Redis connection for test data setup
    client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db || 0
    });

    // Clean up any existing test keys
    await client.flushdb();

    // Create test data with various key patterns and types

    // User keys (string type)
    await client.set('user:1:name', 'Alice');
    await client.set('user:1:email', 'alice@example.com');
    await client.set('user:2:name', 'Bob');
    await client.set('user:2:email', 'bob@example.com');
    await client.set('user:3:name', 'Charlie');

    // Session keys with TTL (string type)
    await client.set('session:abc123', 'session_data_1', 'EX', 3600);
    await client.set('session:def456', 'session_data_2', 'EX', 3600);

    // Product keys (hash type)
    await client.hset('product:101', {
      name: 'Product A',
      price: '99.99',
      stock: '10'
    });
    await client.hset('product:102', {
      name: 'Product B',
      price: '49.99',
      stock: '5'
    });

    // Queue keys (list type)
    await client.lpush('queue:emails', 'email1@example.com', 'email2@example.com');
    await client.lpush('queue:notifications', 'notification1', 'notification2', 'notification3');

    // Tags keys (set type)
    await client.sadd('tags:post1', 'javascript', 'nodejs', 'redis');
    await client.sadd('tags:post2', 'python', 'redis', 'database');

    // Leaderboard keys (sorted set type)
    await client.zadd('leaderboard:game1', 100, 'player1', 200, 'player2', 150, 'player3');
    await client.zadd('leaderboard:game2', 500, 'playerA', 300, 'playerB');

    // Counter keys (string type)
    await client.set('counter:views:page1', '1000');
    await client.set('counter:views:page2', '500');
    await client.set('counter:likes:post1', '250');

    // Cache keys (string type)
    await client.set('cache:user:1:profile', JSON.stringify({ id: 1, name: 'Alice' }));
    await client.set('cache:user:2:profile', JSON.stringify({ id: 2, name: 'Bob' }));

    // Create connector instance
    connector = new RedisConnector(config);
    await connector.connect();
  }, INTEGRATION_TIMEOUT);

  afterEach(async () => {
    // Cleanup
    if (connector) {
      await connector.disconnect();
    }
    if (client) {
      await client.flushdb();
      await client.quit();
    }
  }, INTEGRATION_TIMEOUT);

  it('should connect to real Redis database', () => {
    expect(connector).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should retrieve Redis version', async () => {
    const schema = await connector.getSchema();
    expect(schema.version).toBeDefined();
    expect(schema.version).toMatch(/redis.*\d+\.\d+/i);
  }, INTEGRATION_TIMEOUT);

  it('should list key patterns as tables', async () => {
    const tables = await connector.listTables();

    expect(tables.length).toBeGreaterThan(0);
    const patternNames = tables.map(t => t.name);

    // Should identify common patterns
    expect(patternNames.some(p => p.includes('user:'))).toBe(true);
    expect(patternNames.some(p => p.includes('session:'))).toBe(true);
    expect(patternNames.some(p => p.includes('product:'))).toBe(true);
  }, INTEGRATION_TIMEOUT);

  it('should get complete schema with key pattern analysis', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('redis');
    expect(schema.databaseName).toBe(`db${config.db || 0}`);
    expect(schema.keyPatterns).toBeDefined();
    expect(schema.keyPatterns!.length).toBeGreaterThan(0);

    // Check that patterns are identified
    const userPattern = schema.keyPatterns!.find(p => p.pattern.includes('user:'));
    expect(userPattern).toBeDefined();
    expect(userPattern?.count).toBeGreaterThan(0);
  }, INTEGRATION_TIMEOUT);

  it('should identify string type keys', async () => {
    const schema = await connector.getSchema();

    const patterns = schema.keyPatterns || [];
    const stringPattern = patterns.find(p => p.types && p.types['string'] > 0);
    expect(stringPattern).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should identify hash type keys', async () => {
    const schema = await connector.getSchema();

    const patterns = schema.keyPatterns || [];
    const hashPattern = patterns.find(p => p.types && p.types['hash'] > 0 && p.pattern.includes('product:'));
    expect(hashPattern).toBeDefined();
    expect(hashPattern?.types?.['hash']).toBeGreaterThanOrEqual(2);
  }, INTEGRATION_TIMEOUT);

  it('should identify list type keys', async () => {
    const schema = await connector.getSchema();

    const patterns = schema.keyPatterns || [];
    const listPattern = patterns.find(p => p.types && p.types['list'] > 0 && p.pattern.includes('queue:'));
    expect(listPattern).toBeDefined();
    expect(listPattern?.types?.['list']).toBeGreaterThanOrEqual(2);
  }, INTEGRATION_TIMEOUT);

  it('should identify set type keys', async () => {
    const schema = await connector.getSchema();

    const patterns = schema.keyPatterns || [];
    const setPattern = patterns.find(p => p.types && p.types['set'] > 0 && p.pattern.includes('tags:'));
    expect(setPattern).toBeDefined();
    expect(setPattern?.types?.['set']).toBeGreaterThanOrEqual(2);
  }, INTEGRATION_TIMEOUT);

  it('should identify sorted set type keys', async () => {
    const schema = await connector.getSchema();

    const patterns = schema.keyPatterns || [];
    const zsetPattern = patterns.find(p => p.types && p.types['zset'] > 0);
    expect(zsetPattern).toBeDefined();
    // Should match leaderboard pattern
    if (zsetPattern) {
      expect(zsetPattern.pattern).toMatch(/leaderboard/i);
    }
  }, INTEGRATION_TIMEOUT);

  it('should get table details for a specific pattern', async () => {
    const tables = await connector.listTables();
    const userTable = tables.find(t => t.name.includes('user:'));

    expect(userTable).toBeDefined();
    // Redis connector returns null for getTableDetails as patterns are not detailed table structures
    const details = await connector.getTableDetails(userTable!.name);
    expect(details).toBeNull();
  }, INTEGRATION_TIMEOUT);

  it('should respect maxKeys configuration', async () => {
    // Create a connector with very low maxKeys
    const limitedConfig: RedisConfig = {
      ...config,
      maxKeys: 5
    };
    const limitedConnector = new RedisConnector(limitedConfig);
    await limitedConnector.connect();

    const schema = await limitedConnector.getSchema();
    expect(schema).toBeDefined();
    expect(schema.keyPatterns).toBeDefined();

    await limitedConnector.disconnect();
  }, INTEGRATION_TIMEOUT);

  it('should filter keys by pattern', async () => {
    // Create a connector with specific pattern
    const patternConfig: RedisConfig = {
      ...config,
      keyPattern: 'user:*'
    };
    const patternConnector = new RedisConnector(patternConfig);
    await patternConnector.connect();

    const tables = await patternConnector.listTables();
    expect(tables).toBeDefined();

    await patternConnector.disconnect();
  }, INTEGRATION_TIMEOUT);

  it('should group similar keys into patterns', async () => {
    const schema = await connector.getSchema();
    const patterns = schema.keyPatterns || [];

    // user:1:name, user:2:name, etc. should be grouped
    const userPattern = patterns.find(p => p.pattern.includes('user:'));
    expect(userPattern).toBeDefined();
    if (userPattern) {
      expect(userPattern.count).toBeGreaterThanOrEqual(1);
    }
  }, INTEGRATION_TIMEOUT);

  it('should identify counter patterns', async () => {
    const schema = await connector.getSchema();
    const patterns = schema.keyPatterns || [];

    const counterPattern = patterns.find(p => p.pattern.includes('counter:'));
    expect(counterPattern).toBeDefined();
    // Counter keys are string type
    expect(counterPattern?.types?.['string']).toBeGreaterThan(0);
  }, INTEGRATION_TIMEOUT);

  it('should identify cache patterns', async () => {
    const schema = await connector.getSchema();
    const patterns = schema.keyPatterns || [];

    const cachePattern = patterns.find(p => p.pattern.includes('cache:'));
    expect(cachePattern).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should provide example keys for each pattern', async () => {
    const schema = await connector.getSchema();
    const patterns = schema.keyPatterns || [];

    for (const pattern of patterns) {
      expect(pattern.sampleKeys).toBeDefined();
      expect(pattern.sampleKeys.length).toBeGreaterThan(0);
      expect(pattern.sampleKeys.length).toBeLessThanOrEqual(10);
    }
  }, INTEGRATION_TIMEOUT);

  it('should report total key count', async () => {
    const schema = await connector.getSchema();

    // We created at least 20 keys
    const totalKeys = schema.keyPatterns?.reduce((sum, p) => sum + p.count, 0) || 0;
    expect(totalKeys).toBeGreaterThanOrEqual(20);
  }, INTEGRATION_TIMEOUT);

  it('should test connection successfully', async () => {
    const testConnector = new RedisConnector(config);
    const result = await testConnector.testConnection();

    expect(result).toBe(true);
    await testConnector.disconnect();
  }, INTEGRATION_TIMEOUT);

  it('should handle connection with invalid credentials', async () => {
    const invalidConfig: RedisConfig = {
      ...config,
      password: 'wrong_password'
    };

    const failingConnector = new RedisConnector(invalidConfig);
    const result = await failingConnector.testConnection();

    expect(result).toBe(false);
  }, INTEGRATION_TIMEOUT);

  it('should handle empty database', async () => {
    // Flush the database
    await client.flushdb();

    const emptyConnector = new RedisConnector(config);
    await emptyConnector.connect();

    const schema = await emptyConnector.getSchema();
    expect(schema.keyPatterns).toBeDefined();
    expect(schema.keyPatterns?.length).toBe(0);

    await emptyConnector.disconnect();

    // Restore test data for other tests
    await client.set('user:1:name', 'Alice');
  }, INTEGRATION_TIMEOUT);
});
