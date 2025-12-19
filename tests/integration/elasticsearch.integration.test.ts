/**
 * Elasticsearch Integration Tests
 *
 * These tests connect to a real Elasticsearch instance (no mocks).
 * Requires Docker environment to be running: ./tests/integration/setup.sh setup
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ElasticsearchConnector } from '../../src/connectors/elasticsearch.js';
import type { ElasticsearchConfig } from '../../src/types/schema.js';
import { Client } from '@elastic/elasticsearch';
import fs from 'fs';
import path from 'path';

// Load integration test config
const configPath = path.join(__dirname, 'config.json');
const testConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const INTEGRATION_TIMEOUT = 60000; // Increased timeout for Elasticsearch operations

describe('Elasticsearch Integration Tests (Real Database)', () => {
  let connector: ElasticsearchConnector;
  let client: Client;
  const config: ElasticsearchConfig = testConfig.databases.elasticsearch;

  beforeEach(async () => {
    // Create a direct Elasticsearch connection for test data setup
    client = new Client({ node: config.node });

    // Clean up any existing test indices
    // Get all indices matching test-* pattern
    try {
      const indices = await client.cat.indices({ format: 'json' });
      const testIndices = indices
        .filter((idx: any) => idx.index.startsWith('test-'))
        .map((idx: any) => idx.index);

      if (testIndices.length > 0) {
        for (const index of testIndices) {
          try {
            await client.indices.delete({ index });
          } catch (e) {
            // Ignore if index doesn't exist
          }
        }
      }
    } catch (e) {
      // Indices might not exist, ignore
    }

    // Wait for deletion to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Create test indices with mappings
    await client.indices.create({
      index: 'test-users',
      body: {
        mappings: {
          properties: {
            id: { type: 'integer' },
            name: { type: 'text' },
            email: { type: 'keyword' },
            age: { type: 'integer' },
            created_at: { type: 'date' },
          },
        },
      },
    });

    await client.indices.create({
      index: 'test-products',
      body: {
        mappings: {
          properties: {
            id: { type: 'integer' },
            name: { type: 'text' },
            price: { type: 'float' },
            stock: { type: 'integer' },
            tags: { type: 'keyword' },
          },
        },
      },
    });

    await client.indices.create({
      index: 'test-orders',
      body: {
        mappings: {
          properties: {
            id: { type: 'integer' },
            user_id: { type: 'integer' },
            total: { type: 'float' },
            status: { type: 'keyword' },
            order_date: { type: 'date' },
          },
        },
      },
    });

    // Index test documents
    await client.index({
      index: 'test-users',
      id: '1',
      body: {
        id: 1,
        name: 'Alice',
        email: 'alice@example.com',
        age: 25,
        created_at: '2024-01-01T00:00:00Z',
      },
    });

    await client.index({
      index: 'test-users',
      id: '2',
      body: {
        id: 2,
        name: 'Bob',
        email: 'bob@example.com',
        age: 30,
        created_at: '2024-01-02T00:00:00Z',
      },
    });

    await client.index({
      index: 'test-products',
      id: '1',
      body: {
        id: 1,
        name: 'Product A',
        price: 99.99,
        stock: 10,
        tags: ['electronics', 'featured'],
      },
    });

    await client.index({
      index: 'test-orders',
      id: '1',
      body: {
        id: 1,
        user_id: 1,
        total: 99.99,
        status: 'delivered',
        order_date: '2024-01-01T10:00:00Z',
      },
    });

    // Refresh indices to make documents searchable
    await client.indices.refresh({ index: 'test-users,test-products,test-orders' });

    // Create connector instance
    connector = new ElasticsearchConnector(config);
    await connector.connect();
  }, INTEGRATION_TIMEOUT);

  afterEach(async () => {
    // Cleanup
    if (connector) {
      await connector.disconnect();
    }
    if (client) {
      // Delete all test indices by listing them first
      try {
        const indices = await client.cat.indices({ format: 'json' });
        const testIndices = indices
          .filter((idx: any) => idx.index.startsWith('test-'))
          .map((idx: any) => idx.index);

        if (testIndices.length > 0) {
          for (const index of testIndices) {
            try {
              await client.indices.delete({ index });
            } catch (e) {
              // Ignore if index doesn't exist
            }
          }
        }
      } catch (e) {
        // Ignore errors
      }
      await client.close();
    }
  }, INTEGRATION_TIMEOUT);

  it('should connect to real Elasticsearch instance', () => {
    expect(connector).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should retrieve Elasticsearch version', async () => {
    const schema = await connector.getSchema();
    expect(schema.version).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should list all indices', async () => {
    const tables = await connector.listTables();

    const indexNames = tables.map(t => t.name);
    expect(indexNames).toContain('test-users');
    expect(indexNames).toContain('test-products');
    expect(indexNames).toContain('test-orders');
  }, INTEGRATION_TIMEOUT);

  it('should report document counts', async () => {
    const tables = await connector.listTables();

    const usersIndex = tables.find(t => t.name === 'test-users');
    expect(usersIndex).toBeDefined();
    expect(usersIndex?.rowCount).toBeGreaterThanOrEqual(2);
  }, INTEGRATION_TIMEOUT);

  it('should get complete schema', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('elasticsearch');
    expect(schema.indices).toBeDefined();
    expect(schema.indices!.length).toBeGreaterThanOrEqual(3);

    // Check cluster health
    expect(schema.clusterHealth).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should get index details with mappings', async () => {
    const details = await connector.getTableDetails('test-users');

    expect(details).toBeDefined();
    expect(details?.name).toBe('test-users');
    expect(details?.columns).toBeDefined();
    expect(details?.columns.length).toBeGreaterThan(0);

    // Check specific fields
    const idField = details?.columns.find(c => c.name === 'id');
    expect(idField).toBeDefined();
    expect(idField?.type).toBe('integer');

    const emailField = details?.columns.find(c => c.name === 'email');
    expect(emailField).toBeDefined();
    expect(emailField?.type).toBe('keyword');
  }, INTEGRATION_TIMEOUT);

  it('should handle text type fields', async () => {
    const details = await connector.getTableDetails('test-users');
    const nameField = details?.columns.find(c => c.name === 'name');

    expect(nameField?.type).toBe('text');
  }, INTEGRATION_TIMEOUT);

  it('should handle float type fields', async () => {
    const details = await connector.getTableDetails('test-products');
    const priceField = details?.columns.find(c => c.name === 'price');

    expect(priceField?.type).toBe('float');
  }, INTEGRATION_TIMEOUT);

  it('should handle date type fields', async () => {
    const details = await connector.getTableDetails('test-users');
    const createdAtField = details?.columns.find(c => c.name === 'created_at');

    expect(createdAtField?.type).toBe('date');
  }, INTEGRATION_TIMEOUT);

  it('should test connection successfully', async () => {
    const testConnector = new ElasticsearchConnector(config);
    await testConnector.connect();
    const result = await testConnector.testConnection();

    expect(result).toBe(true);
    await testConnector.disconnect();
  }, INTEGRATION_TIMEOUT);

  it('should handle connection with invalid node', async () => {
    const invalidConfig: ElasticsearchConfig = {
      node: 'http://invalid-host:9200',
    };

    const failingConnector = new ElasticsearchConnector(invalidConfig);

    await expect(failingConnector.connect()).rejects.toThrow();
  }, INTEGRATION_TIMEOUT);

  it('should return null for non-existent index', async () => {
    const details = await connector.getTableDetails('nonexistent-index');
    expect(details).toBeNull();
  }, INTEGRATION_TIMEOUT);

  it('should verify documents can be indexed', async () => {
    // This test verifies the Elasticsearch instance is working
    await client.index({
      index: 'test-users',
      id: '99',
      body: {
        id: 99,
        name: 'Test User',
        email: 'test@example.com',
        age: 20,
        created_at: '2024-01-10T00:00:00Z',
      },
    });

    await client.indices.refresh({ index: 'test-users' });

    // Document was indexed successfully (no error thrown)
    expect(true).toBe(true);
  }, INTEGRATION_TIMEOUT);

  it('should handle nested object fields', async () => {
    // Create an index with nested objects
    await client.indices.create({
      index: 'test-nested',
      body: {
        mappings: {
          properties: {
            user: {
              type: 'object',
              properties: {
                name: { type: 'text' },
                email: { type: 'keyword' },
              },
            },
          },
        },
      },
    });

    const details = await connector.getTableDetails('test-nested');
    expect(details).toBeDefined();

    // No need to manually delete - afterEach will clean up all test-* indices
  }, INTEGRATION_TIMEOUT);
});
