import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EtcdConnector } from '../src/connectors/etcd.js';
import type { EtcdConfig } from '../src/types/schema.js';

// Mock etcd3 module
vi.mock('etcd3', () => {
  const mockKeys = vi.fn().mockResolvedValue([
    '/test/config/app/name',
    '/test/config/app/version',
    '/test/config/database/host',
    '/test/config/database/port',
    '/test/users/1/name',
    '/test/users/1/email',
    '/test/users/2/name',
    '/test/users/2/email',
    '/test/cache/session:123',
    '/test/cache/session:456',
    '/test/locks/resource1',
    '/test/locks/resource2',
    '/test/metrics/cpu',
    '/test/metrics/memory'
  ]);

  return {
    Etcd3: vi.fn(() => ({
      get: vi.fn().mockReturnValue({
        string: vi.fn().mockResolvedValue('test_value')
      }),
      getAll: vi.fn().mockReturnValue({
        prefix: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        keys: mockKeys
      }),
      close: vi.fn()
    }))
  };
});

describe('EtcdConnector Unit Tests', () => {
  let connector: EtcdConnector;

  const config: EtcdConfig = {
    type: 'etcd',
    hosts: ['localhost:2379'],
    prefix: '/',
    maxKeysToScan: 1000
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    connector = new EtcdConnector(config);
    await connector.connect();
  });

  it('should connect successfully', () => {
    expect(connector).toBeDefined();
  });

  it('should list key prefixes as tables', async () => {
    const tables = await connector.listTables();

    expect(tables.length).toBeGreaterThanOrEqual(5);
    const prefixNames = tables.map(t => t.name);
    expect(prefixNames).toContain('/test/config/');
    expect(prefixNames).toContain('/test/users/');
    expect(prefixNames).toContain('/test/cache/');
    expect(prefixNames).toContain('/test/locks/');
    expect(prefixNames).toContain('/test/metrics/');
  });

  it('should get complete schema with key patterns', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('etcd');
    expect(schema.databaseName).toBe('etcd-cluster');
    expect(schema.etcdKeyPatterns).toBeDefined();
    expect(schema.etcdKeyPatterns?.length).toBeGreaterThanOrEqual(5);

    const configPattern = schema.etcdKeyPatterns?.find(p => p.prefix === '/test/config/');
    expect(configPattern).toBeDefined();
    expect(configPattern?.count).toBeGreaterThanOrEqual(4);
    expect(configPattern?.depth).toBeGreaterThanOrEqual(2);
    expect(configPattern?.sampleKeys.length).toBeGreaterThanOrEqual(1);

    const usersPattern = schema.etcdKeyPatterns?.find(p => p.prefix === '/test/users/');
    expect(usersPattern).toBeDefined();
    expect(usersPattern?.count).toBeGreaterThanOrEqual(4);

    const cachePattern = schema.etcdKeyPatterns?.find(p => p.prefix === '/test/cache/');
    expect(cachePattern).toBeDefined();
    expect(cachePattern?.count).toBeGreaterThanOrEqual(2);
  });

  it('should get prefix details', async () => {
    const configDetails = await connector.getTableDetails('/test/config/');

    expect(configDetails).toBeDefined();
    expect(configDetails?.name).toBe('/test/config/');
    expect(configDetails?.type).toBe('collection');
    expect(configDetails?.columns).toBeDefined();
    expect(configDetails?.columns.length).toBe(3);
  });

  it('should handle searchColumns gracefully', async () => {
    const result = await connector.searchColumns('any_column');
    expect(result).toEqual([]);
  });

  it('should calculate correct key depth', async () => {
    const schema = await connector.getSchema();

    const configPattern = schema.etcdKeyPatterns?.find(p => p.prefix === '/test/config/');
    expect(configPattern?.depth).toBeGreaterThanOrEqual(2);

    const locksPattern = schema.etcdKeyPatterns?.find(p => p.prefix === '/test/locks/');
    expect(locksPattern?.depth).toBeGreaterThanOrEqual(2);
  });

  it('should provide sample keys for each pattern', async () => {
    const schema = await connector.getSchema();

    const configPattern = schema.etcdKeyPatterns?.find(p => p.prefix === '/test/config/');
    expect(configPattern?.sampleKeys).toBeDefined();
    expect(configPattern?.sampleKeys.length).toBeGreaterThanOrEqual(1);
    expect(configPattern?.sampleKeys.some(k => k.startsWith('/test/config/'))).toBe(true);
  });

  it('should return total key count', async () => {
    const schema = await connector.getSchema();

    expect(schema.etcdTotalKeys).toBeDefined();
    expect(schema.etcdTotalKeys).toBeGreaterThanOrEqual(12);
  });

  it('should disconnect properly', async () => {
    await connector.disconnect();
    // Verify no errors thrown
    expect(true).toBe(true);
  });
});
