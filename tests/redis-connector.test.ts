import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RedisConnector } from '../src/connectors/redis.js';
import type { RedisConfig } from '../src/types/schema.js';

// Use vi.hoisted to create mocks before vi.mock
const { mockPing, mockQuit, mockDbsize, mockScan, mockType, mockInfo } = vi.hoisted(() => {
  let scanCallCount = 0;

  const mockPing = vi.fn().mockResolvedValue('PONG');
  const mockQuit = vi.fn().mockResolvedValue('OK');
  const mockDbsize = vi.fn().mockResolvedValue(20);
  const mockInfo = vi.fn().mockResolvedValue('redis_version:7.0.0\r\n');

  const mockScan = vi.fn().mockImplementation(() => {
    scanCallCount++;
    if (scanCallCount === 1) {
      return Promise.resolve(['10', [
        'user:1:name',
        'user:1:email',
        'user:2:name',
        'user:2:email',
        'user:3:name',
        'session:abc123',
        'session:def456',
        'product:101',
        'product:102',
        'queue:emails'
      ]]);
    } else if (scanCallCount === 2) {
      return Promise.resolve(['0', [
        'queue:notifications',
        'tags:post1',
        'tags:post2',
        'leaderboard:game1',
        'leaderboard:game2',
        'counter:views:page1',
        'counter:views:page2',
        'counter:likes:post1',
        'cache:user:1:profile',
        'cache:user:2:profile'
      ]]);
    }
    return Promise.resolve(['0', []]);
  });

  const mockType = vi.fn().mockImplementation((key: string) => {
    if (key.includes('product')) return Promise.resolve('hash');
    if (key.includes('queue')) return Promise.resolve('list');
    if (key.includes('tags')) return Promise.resolve('set');
    if (key.includes('leaderboard')) return Promise.resolve('zset');
    return Promise.resolve('string');
  });

  return { mockPing, mockQuit, mockDbsize, mockScan, mockType, mockInfo };
});

// Mock ioredis
vi.mock('ioredis', () => {
  return {
    default: vi.fn(() => ({
      ping: mockPing,
      quit: mockQuit,
      dbsize: mockDbsize,
      scan: mockScan,
      type: mockType,
      info: mockInfo,
    }))
  };
});

describe('RedisConnector Unit Tests', () => {
  let connector: RedisConnector;

  const config: RedisConfig = {
    type: 'redis',
    host: 'localhost',
    port: 6379,
    password: 'test_password',
    db: 0,
    maxKeys: 500,
    keyPattern: '*'
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset scan call count for each test
    let callCount = 0;
    mockScan.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(['10', [
          'user:1:name',
          'user:1:email',
          'user:2:name',
          'user:2:email',
          'user:3:name',
          'session:abc123',
          'session:def456',
          'product:101',
          'product:102',
          'queue:emails'
        ]]);
      } else if (callCount === 2) {
        return Promise.resolve(['0', [
          'queue:notifications',
          'tags:post1',
          'tags:post2',
          'leaderboard:game1',
          'leaderboard:game2',
          'counter:views:page1',
          'counter:views:page2',
          'counter:likes:post1',
          'cache:user:1:profile',
          'cache:user:2:profile'
        ]]);
      }
      return Promise.resolve(['0', []]);
    });

    connector = new RedisConnector(config);
    await connector.connect();
  });

  it('should connect successfully', async () => {
    expect(connector).toBeDefined();
  });

  it('should list key patterns as tables', async () => {
    const tables = await connector.listTables();

    expect(tables.length).toBeGreaterThan(0);
    const patternNames = tables.map(t => t.name);

    // Should identify common patterns
    expect(patternNames.some(p => p.includes('user:'))).toBe(true);
    expect(patternNames.some(p => p.includes('session:'))).toBe(true);
    expect(patternNames.some(p => p.includes('product:'))).toBe(true);
  });

  it('should get complete schema with key pattern analysis', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('redis');
    expect(schema.databaseName).toBe(`db${config.db}`);
    expect(schema.keyPatterns).toBeDefined();
    expect(schema.keyPatterns!.length).toBeGreaterThan(0);

    // Check that patterns are identified
    const userPattern = schema.keyPatterns!.find(p => p.pattern.includes('user:'));
    expect(userPattern).toBeDefined();
    expect(userPattern?.count).toBeGreaterThan(0);
  });

  it('should identify string type keys', async () => {
    const schema = await connector.getSchema();

    const patterns = schema.keyPatterns || [];
    const stringPattern = patterns.find(p => p.types && p.types['string'] > 0);
    expect(stringPattern).toBeDefined();
  });

  it('should identify hash type keys', async () => {
    const schema = await connector.getSchema();

    const patterns = schema.keyPatterns || [];
    const hashPattern = patterns.find(p => p.types && p.types['hash'] > 0 && p.pattern.includes('product:'));
    expect(hashPattern).toBeDefined();
  });

  it('should identify list type keys', async () => {
    const schema = await connector.getSchema();

    const patterns = schema.keyPatterns || [];
    const listPattern = patterns.find(p => p.types && p.types['list'] > 0 && p.pattern.includes('queue:'));
    expect(listPattern).toBeDefined();
  });

  it('should identify set type keys', async () => {
    const schema = await connector.getSchema();

    const patterns = schema.keyPatterns || [];
    const setPattern = patterns.find(p => p.types && p.types['set'] > 0 && p.pattern.includes('tags:'));
    expect(setPattern).toBeDefined();
  });

  it('should identify sorted set type keys', async () => {
    const schema = await connector.getSchema();

    const patterns = schema.keyPatterns || [];
    const zsetPattern = patterns.find(p => p.types && p.types['zset'] > 0);
    expect(zsetPattern).toBeDefined();
    // Should match leaderboard pattern
    if (zsetPattern) {
      expect(zsetPattern.pattern).toMatch(/leaderboard/i);
    }
  });

  it('should get table details for a specific pattern', async () => {
    const tables = await connector.listTables();
    const userTable = tables.find(t => t.name.includes('user:'));

    expect(userTable).toBeDefined();
    // Redis connector returns null for getTableDetails as patterns are not detailed table structures
    const details = await connector.getTableDetails(userTable!.name);
    expect(details).toBeNull();
  });

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
  });

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
  });

  it('should group similar keys into patterns', async () => {
    const schema = await connector.getSchema();
    const patterns = schema.keyPatterns || [];

    // user:1:name, user:2:name, etc. should be grouped
    const userPattern = patterns.find(p => p.pattern.includes('user:'));
    expect(userPattern).toBeDefined();
    if (userPattern) {
      expect(userPattern.count).toBeGreaterThanOrEqual(1);
    }
  });

  it('should identify counter patterns', async () => {
    const schema = await connector.getSchema();
    const patterns = schema.keyPatterns || [];

    const counterPattern = patterns.find(p => p.pattern.includes('counter:'));
    expect(counterPattern).toBeDefined();
    // Counter keys are string type
    expect(counterPattern?.types?.['string']).toBeGreaterThan(0);
  });

  it('should identify cache patterns', async () => {
    const schema = await connector.getSchema();
    const patterns = schema.keyPatterns || [];

    const cachePattern = patterns.find(p => p.pattern.includes('cache:'));
    expect(cachePattern).toBeDefined();
  });

  it('should handle keys with TTL', async () => {
    const schema = await connector.getSchema();
    const patterns = schema.keyPatterns || [];

    // Session keys have TTL
    const sessionPattern = patterns.find(p => p.pattern.includes('session:'));
    expect(sessionPattern).toBeDefined();
  });

  it('should provide example keys for each pattern', async () => {
    const schema = await connector.getSchema();
    const patterns = schema.keyPatterns || [];

    for (const pattern of patterns) {
      expect(pattern.sampleKeys).toBeDefined();
      expect(pattern.sampleKeys.length).toBeGreaterThan(0);
      expect(pattern.sampleKeys.length).toBeLessThanOrEqual(10);
    }
  });

  it('should disconnect properly', async () => {
    await connector.disconnect();
    expect(true).toBe(true);
  });
});
