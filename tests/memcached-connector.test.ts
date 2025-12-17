import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemcachedConnector } from '../src/connectors/memcached.js';
import type { MemcachedConfig } from '../src/types/schema.js';

// Mock memcached module
vi.mock('memcached', () => {
  return {
    default: vi.fn(() => ({
      version: vi.fn((callback) => {
        callback(null, [{ server: 'localhost:11211', version: '1.6.0' }]);
      }),
      stats: vi.fn((callback) => {
        callback(null, [{
          curr_items: 150,
          total_items: 500,
          bytes: 1024000,
          curr_connections: 5
        }]);
      }),
      end: vi.fn()
    }))
  };
});

describe('MemcachedConnector Unit Tests', () => {
  let connector: MemcachedConnector;

  const config: MemcachedConfig = {
    type: 'memcached',
    servers: ['localhost:11211']
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    connector = new MemcachedConnector(config);
    await connector.connect();
  });

  it('should connect successfully', () => {
    expect(connector).toBeDefined();
  });

  it('should list tables (returns cache stats)', async () => {
    const tables = await connector.listTables();

    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('*');
    expect(tables[0].rowCount).toBe(150);
  });

  it('should get schema with cache statistics', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('memcached');
    expect(schema.databaseName).toBe('memcached');
    expect(schema.memcachedKeyPatterns).toBeDefined();
    expect(schema.memcachedKeyPatterns?.length).toBeGreaterThanOrEqual(1);

    const pattern = schema.memcachedKeyPatterns?.[0];
    expect(pattern?.pattern).toBe('*');
    expect(pattern?.count).toBe(150);
    expect(pattern?.exampleValue).toContain('does not support key enumeration');
  });

  it('should get table details', async () => {
    const details = await connector.getTableDetails('*');

    expect(details).toBeDefined();
    expect(details?.name).toBe('*');
    expect(details?.rowCount).toBe(150);
    expect(details?.columns).toBeDefined();
    expect(details?.columns.length).toBe(3);
  });

  it('should handle searchColumns gracefully', async () => {
    const result = await connector.searchColumns('any_column');
    expect(result).toEqual([]);
  });

  it('should return total cache items', async () => {
    const schema = await connector.getSchema();

    expect(schema.memcachedTotalKeys).toBeDefined();
    expect(schema.memcachedTotalKeys).toBe(150);
  });

  it('should disconnect properly', async () => {
    await connector.disconnect();
    // Just verify no errors thrown
    expect(true).toBe(true);
  });
});
