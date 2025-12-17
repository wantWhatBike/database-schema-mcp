/**
 * Etcd Integration Tests
 *
 * These tests connect to a real Etcd instance (no mocks).
 * Requires Docker environment to be running: ./tests/integration/setup.sh setup
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EtcdConnector } from '../../src/connectors/etcd.js';
import type { EtcdConfig } from '../../src/types/schema.js';
import { Etcd3 } from 'etcd3';
import fs from 'fs';
import path from 'path';

// Load integration test config
const configPath = path.join(__dirname, 'config.json');
const testConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const INTEGRATION_TIMEOUT = 30000;

describe('Etcd Integration Tests (Real Database)', () => {
  let connector: EtcdConnector;
  let client: Etcd3;
  const config: EtcdConfig = testConfig.databases.etcd;

  beforeEach(async () => {
    // Create a direct Etcd connection for test data setup
    client = new Etcd3({
      hosts: config.hosts.split(','),
    });

    // Clean up any existing test keys
    await client.delete().prefix('/test/');

    // Insert test data with various key patterns
    await client.put('/test/users/1/name').value('Alice');
    await client.put('/test/users/1/email').value('alice@example.com');
    await client.put('/test/users/2/name').value('Bob');
    await client.put('/test/users/2/email').value('bob@example.com');
    await client.put('/test/users/3/name').value('Charlie');

    await client.put('/test/config/db/host').value('localhost');
    await client.put('/test/config/db/port').value('5432');
    await client.put('/test/config/db/database').value('testdb');

    await client.put('/test/cache/page1').value('cached_content_1');
    await client.put('/test/cache/page2').value('cached_content_2');

    await client.put('/test/counters/views').value('1000');
    await client.put('/test/counters/likes').value('500');

    await client.put('/test/sessions/abc123').value('session_data_1');
    await client.put('/test/sessions/def456').value('session_data_2');

    // Create connector instance
    connector = new EtcdConnector(config);
    await connector.connect();
  }, INTEGRATION_TIMEOUT);

  afterEach(async () => {
    // Cleanup
    if (connector) {
      await connector.disconnect();
    }
    if (client) {
      await client.delete().prefix('/test/');
      client.close();
    }
  }, INTEGRATION_TIMEOUT);

  it('should connect to real Etcd instance', () => {
    expect(connector).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should get schema information', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('etcd');
    expect(schema.databaseName).toBe('etcd-cluster');
    expect(schema.etcdKeyPatterns).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should analyze key patterns', async () => {
    const schema = await connector.getSchema();

    expect(schema.etcdKeyPatterns).toBeDefined();
    expect(schema.etcdKeyPatterns!.length).toBeGreaterThan(0);

    // Should identify /test/users/ pattern
    const usersPattern = schema.etcdKeyPatterns!.find(p =>
      p.prefix.includes('/test/users')
    );
    expect(usersPattern).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should report total key count', async () => {
    const schema = await connector.getSchema();

    // We inserted 14 keys under /test/
    expect(schema.etcdTotalKeys).toBeGreaterThanOrEqual(10);
  }, INTEGRATION_TIMEOUT);

  it('should list key patterns as tables', async () => {
    const tables = await connector.listTables();

    expect(tables).toBeDefined();
    expect(tables.length).toBeGreaterThan(0);

    // Check that patterns are listed
    const tableNames = tables.map(t => t.name);
    expect(tableNames.some(name => name.includes('/test/'))).toBe(true);
  }, INTEGRATION_TIMEOUT);

  it('should get table details for a pattern', async () => {
    const tables = await connector.listTables();
    expect(tables.length).toBeGreaterThan(0);

    const firstTable = tables[0];
    const details = await connector.getTableDetails(firstTable.name);

    expect(details).toBeDefined();
    expect(details?.name).toBe(firstTable.name);
    expect(details?.type).toBe('collection');
    expect(details?.columns).toBeDefined();
    expect(details?.columns.length).toBeGreaterThan(0);

    // Check columns
    const keyColumn = details?.columns.find(c => c.name === 'key');
    expect(keyColumn).toBeDefined();
    expect(keyColumn?.type).toBe('string');

    const valueColumn = details?.columns.find(c => c.name === 'value');
    expect(valueColumn).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should test connection successfully', async () => {
    const testConnector = new EtcdConnector(config);
    await testConnector.connect();
    const result = await testConnector.testConnection();

    expect(result).toBe(true);
    await testConnector.disconnect();
  }, INTEGRATION_TIMEOUT);

  it('should handle connection with invalid host', async () => {
    const invalidConfig: EtcdConfig = {
      hosts: 'invalid-host:2379',
    };

    const failingConnector = new EtcdConnector(invalidConfig);

    await expect(failingConnector.connect()).rejects.toThrow();
  }, INTEGRATION_TIMEOUT);

  it('should verify keys can be set and retrieved', async () => {
    // This test verifies the Etcd instance is working
    const testKey = '/test/integration/key';
    const testValue = 'test_value';

    await client.put(testKey).value(testValue);

    const retrieved = await client.get(testKey).string();
    expect(retrieved).toBe(testValue);
  }, INTEGRATION_TIMEOUT);

  it('should handle key deletion', async () => {
    const testKey = '/test/deleteme';
    await client.put(testKey).value('will_be_deleted');

    // Verify it exists
    const beforeDelete = await client.get(testKey).string();
    expect(beforeDelete).toBe('will_be_deleted');

    // Delete it
    await client.delete().key(testKey);

    // Verify it's gone
    const afterDelete = await client.get(testKey).string();
    expect(afterDelete).toBeNull();
  }, INTEGRATION_TIMEOUT);

  it('should handle range queries with prefix', async () => {
    // Get all keys under /test/users/
    const userKeys = await client.getAll().prefix('/test/users/').keys();

    expect(userKeys).toBeDefined();
    expect(userKeys.length).toBeGreaterThan(0);
    expect(userKeys.every(key => key.toString().startsWith('/test/users/'))).toBe(true);
  }, INTEGRATION_TIMEOUT);

  it('should handle watch operations', async () => {
    const testKey = '/test/watch/key';

    // Set initial value
    await client.put(testKey).value('initial');

    // Watch is async, just verify we can create a watcher
    const watcher = await client.watch().key(testKey).create();
    expect(watcher).toBeDefined();

    // Cancel the watch
    await watcher.cancel();
  }, INTEGRATION_TIMEOUT);

  it('should handle hierarchical key structures', async () => {
    const schema = await connector.getSchema();

    const patterns = schema.etcdKeyPatterns || [];
    expect(patterns.length).toBeGreaterThan(0);

    // Verify depth is calculated for hierarchical keys
    for (const pattern of patterns) {
      expect(pattern.depth).toBeGreaterThan(0);
    }
  }, INTEGRATION_TIMEOUT);

  it('should provide sample keys for each pattern', async () => {
    const schema = await connector.getSchema();

    for (const pattern of schema.etcdKeyPatterns || []) {
      expect(pattern.sampleKeys).toBeDefined();
    }
  }, INTEGRATION_TIMEOUT);

  it('should handle empty results gracefully', async () => {
    const details = await connector.getTableDetails('/nonexistent/prefix/');

    expect(details).toBeDefined();
    expect(details?.rowCount).toBe(0);
  }, INTEGRATION_TIMEOUT);
});
