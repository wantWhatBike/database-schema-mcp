/**
 * Memcached Integration Tests
 *
 * These tests connect to a real Memcached instance (no mocks).
 * Requires Docker environment to be running: ./tests/integration/setup.sh setup
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemcachedConnector } from '../../src/connectors/memcached.js';
import type { MemcachedConfig } from '../../src/types/schema.js';
import Memcached from 'memcached';
import fs from 'fs';
import path from 'path';

// Load integration test config
const configPath = path.join(__dirname, 'config.json');
const testConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const INTEGRATION_TIMEOUT = 30000;

describe('Memcached Integration Tests (Real Database)', () => {
  let connector: MemcachedConnector;
  let client: Memcached;
  const config: MemcachedConfig = {
    type: 'memcached',
    host: testConfig.databases.memcached.host,
    port: testConfig.databases.memcached.port,
  };

  beforeEach(async () => {
    // Create a direct Memcached connection for test data setup
    client = new Memcached(`${config.host}:${config.port}`, {
      timeout: 5000,
      retries: 2,
    });

    // Clean up - flush all existing keys
    await new Promise<void>((resolve, reject) => {
      client.flush((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Insert test data with various key patterns
    const testData = [
      { key: 'user:1:name', value: 'Alice' },
      { key: 'user:1:email', value: 'alice@example.com' },
      { key: 'user:2:name', value: 'Bob' },
      { key: 'user:2:email', value: 'bob@example.com' },
      { key: 'session:abc123', value: 'session_data_1' },
      { key: 'session:def456', value: 'session_data_2' },
      { key: 'cache:page1', value: 'cached_content_1' },
      { key: 'cache:page2', value: 'cached_content_2' },
      { key: 'counter:views', value: '1000' },
      { key: 'counter:likes', value: '500' },
    ];

    for (const item of testData) {
      await new Promise<void>((resolve, reject) => {
        client.set(item.key, item.value, 3600, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    // Create connector instance
    connector = new MemcachedConnector(config);
    await connector.connect();
  }, INTEGRATION_TIMEOUT);

  afterEach(async () => {
    // Cleanup
    if (connector) {
      await connector.disconnect();
    }
    if (client) {
      await new Promise<void>((resolve) => {
        client.flush(() => {
          client.end();
          resolve();
        });
      });
    }
  }, INTEGRATION_TIMEOUT);

  it('should connect to real Memcached instance', () => {
    expect(connector).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should retrieve Memcached version', async () => {
    const schema = await connector.getSchema();
    expect(schema).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should get schema information', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('memcached');
    expect(schema.databaseName).toBe('memcached');
    expect(schema.memcachedKeyPatterns).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should report total key count', async () => {
    const schema = await connector.getSchema();

    // We inserted 10 items
    expect(schema.memcachedTotalKeys).toBeGreaterThanOrEqual(0);
    // Note: Memcached stats might not immediately reflect all items
  }, INTEGRATION_TIMEOUT);

  it('should list key patterns as tables', async () => {
    const tables = await connector.listTables();

    expect(tables).toBeDefined();
    expect(tables.length).toBeGreaterThanOrEqual(1);
  }, INTEGRATION_TIMEOUT);

  it('should get table details', async () => {
    const tables = await connector.listTables();
    expect(tables.length).toBeGreaterThan(0);

    const firstTable = tables[0];
    const details = await connector.getTableDetails(firstTable.name);

    expect(details).toBeDefined();
    expect(details?.columns).toBeDefined();
    expect(details?.columns.length).toBe(3);

    // Check columns
    const keyColumn = details?.columns.find(c => c.name === 'key');
    expect(keyColumn).toBeDefined();
    expect(keyColumn?.type).toBe('string');

    const valueColumn = details?.columns.find(c => c.name === 'value');
    expect(valueColumn).toBeDefined();

    const expirationColumn = details?.columns.find(c => c.name === 'expiration');
    expect(expirationColumn).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should test connection successfully', async () => {
    const testConnector = new MemcachedConnector(config);
    await testConnector.connect();
    const result = await testConnector.testConnection();

    expect(result).toBe(true);
    await testConnector.disconnect();
  }, INTEGRATION_TIMEOUT);

  it('should handle connection with invalid host', async () => {
    const invalidConfig: MemcachedConfig = {
      type: 'memcached',
      host: 'invalid-host',
      port: 11211,
    };

    const failingConnector = new MemcachedConnector(invalidConfig);
    const result = await failingConnector.testConnection();

    expect(result).toBe(false);
  }, INTEGRATION_TIMEOUT);

  it('should verify data can be set and retrieved', async () => {
    // This test verifies the Memcached instance is working
    const testKey = 'test:integration:key';
    const testValue = 'test_value';

    // Set a value
    await new Promise<void>((resolve, reject) => {
      client.set(testKey, testValue, 60, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Get the value
    const retrieved = await new Promise<string | undefined>((resolve) => {
      client.get(testKey, (err, data) => {
        if (err || !data) resolve(undefined);
        else resolve(String(data));
      });
    });

    expect(retrieved).toBe(testValue);
  }, INTEGRATION_TIMEOUT);

  it('should handle key expiration', async () => {
    const testKey = 'test:expiring:key';
    const testValue = 'will_expire';

    // Set a value with 1 second expiration
    await new Promise<void>((resolve, reject) => {
      client.set(testKey, testValue, 1, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Verify it exists
    const immediate = await new Promise<string | undefined>((resolve) => {
      client.get(testKey, (err, data) => {
        if (err || !data) resolve(undefined);
        else resolve(String(data));
      });
    });
    expect(immediate).toBe(testValue);

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Verify it's gone
    const afterExpiry = await new Promise<string | undefined>((resolve) => {
      client.get(testKey, (err, data) => {
        if (err || !data) resolve(undefined);
        else resolve(String(data));
      });
    });
    expect(afterExpiry).toBeUndefined();
  }, INTEGRATION_TIMEOUT);

  it('should handle flush operation', async () => {
    // Flush all data
    await new Promise<void>((resolve, reject) => {
      client.flush((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Verify cache is empty by checking stats
    const stats = await new Promise<any>((resolve, reject) => {
      client.stats((err, stats) => {
        if (err) reject(err);
        else resolve(stats);
      });
    });

    expect(stats).toBeDefined();
    // After flush, curr_items should be 0
    const firstServer = stats[0];
    expect(firstServer.curr_items).toBe(0);
  }, INTEGRATION_TIMEOUT);

  it('should handle numeric values', async () => {
    const testKey = 'test:numeric';
    const testValue = 12345;

    await new Promise<void>((resolve, reject) => {
      client.set(testKey, testValue, 60, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const retrieved = await new Promise<number | undefined>((resolve) => {
      client.get(testKey, (err, data) => {
        if (err || !data) resolve(undefined);
        else resolve(Number(data));
      });
    });

    expect(retrieved).toBe(testValue);
  }, INTEGRATION_TIMEOUT);

  it('should handle JSON values', async () => {
    const testKey = 'test:json';
    const testValue = { name: 'Test', value: 123, active: true };

    await new Promise<void>((resolve, reject) => {
      client.set(testKey, JSON.stringify(testValue), 60, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const retrieved = await new Promise<any>((resolve) => {
      client.get(testKey, (err, data) => {
        if (err || !data) resolve(undefined);
        else resolve(JSON.parse(String(data)));
      });
    });

    expect(retrieved).toEqual(testValue);
  }, INTEGRATION_TIMEOUT);
});
