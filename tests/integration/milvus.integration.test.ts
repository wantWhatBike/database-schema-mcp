/**
 * Milvus Integration Tests
 *
 * These tests connect to a real Milvus instance (no mocks).
 * Requires Docker environment to be running: ./tests/integration/setup.sh setup
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MilvusConnector } from '../../src/connectors/milvus.js';
import type { MilvusConfig } from '../../src/types/schema.js';
import { MilvusClient, DataType } from '@zilliz/milvus2-sdk-node';
import fs from 'fs';
import path from 'path';

// Load integration test config
const configPath = path.join(__dirname, 'config.json');
const testConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const INTEGRATION_TIMEOUT = 60000; // Milvus operations can take longer

describe('Milvus Integration Tests (Real Database)', () => {
  let connector: MilvusConnector;
  let client: MilvusClient;
  const config: MilvusConfig = testConfig.databases.milvus;

  beforeEach(async () => {
    // Create a direct Milvus connection for test data setup
    client = new MilvusClient({ address: config.address });

    // Clean up any existing test collections
    const testCollections = ['test_users', 'test_products', 'test_embeddings'];
    for (const collectionName of testCollections) {
      try {
        await client.dropCollection({ collection_name: collectionName });
      } catch (e) {
        // Collection might not exist, ignore
      }
    }

    // Wait for deletion to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create test collection: test_users
    await client.createCollection({
      collection_name: 'test_users',
      fields: [
        {
          name: 'id',
          data_type: DataType.Int64,
          is_primary_key: true,
          autoID: false,
        },
        {
          name: 'age',
          data_type: DataType.Int32,
        },
        {
          name: 'embedding',
          data_type: DataType.FloatVector,
          dim: 128,
        },
      ],
    });

    // Create index on embedding field
    await client.createIndex({
      collection_name: 'test_users',
      field_name: 'embedding',
      index_type: 'IVF_FLAT',
      metric_type: 'L2',
      params: { nlist: 128 },
    });

    // Load collection
    await client.loadCollection({ collection_name: 'test_users' });

    // Insert test data
    const embeddings = Array.from({ length: 10 }, (_, i) =>
      Array.from({ length: 128 }, () => Math.random())
    );

    await client.insert({
      collection_name: 'test_users',
      data: Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        age: 20 + i,
        embedding: embeddings[i],
      })),
    });

    // Create another test collection: test_products
    await client.createCollection({
      collection_name: 'test_products',
      fields: [
        {
          name: 'product_id',
          data_type: DataType.Int64,
          is_primary_key: true,
          autoID: false,
        },
        {
          name: 'price',
          data_type: DataType.Float,
        },
        {
          name: 'feature_vector',
          data_type: DataType.FloatVector,
          dim: 64,
        },
      ],
    });

    await client.createIndex({
      collection_name: 'test_products',
      field_name: 'feature_vector',
      index_type: 'IVF_FLAT',
      metric_type: 'IP',
      params: { nlist: 64 },
    });

    await client.loadCollection({ collection_name: 'test_products' });

    const productEmbeddings = Array.from({ length: 5 }, (_, i) =>
      Array.from({ length: 64 }, () => Math.random())
    );

    await client.insert({
      collection_name: 'test_products',
      data: Array.from({ length: 5 }, (_, i) => ({
        product_id: i + 1,
        price: 99.99 + i * 10,
        feature_vector: productEmbeddings[i],
      })),
    });

    // Wait for inserts to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create connector instance
    connector = new MilvusConnector(config);
    await connector.connect();
  }, INTEGRATION_TIMEOUT);

  afterEach(async () => {
    // Cleanup
    if (connector) {
      await connector.disconnect();
    }
    if (client) {
      const testCollections = ['test_users', 'test_products', 'test_embeddings'];
      for (const collectionName of testCollections) {
        try {
          await client.dropCollection({ collection_name: collectionName });
        } catch (e) {
          // Ignore errors
        }
      }
    }
  }, INTEGRATION_TIMEOUT);

  it('should connect to real Milvus instance', () => {
    expect(connector).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should retrieve Milvus version', async () => {
    const schema = await connector.getSchema();
    expect(schema.version).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should list all collections', async () => {
    const tables = await connector.listTables();

    const collectionNames = tables.map(t => t.name);
    expect(collectionNames).toContain('test_users');
    expect(collectionNames).toContain('test_products');
  }, INTEGRATION_TIMEOUT);

  it('should report entity counts', async () => {
    const tables = await connector.listTables();

    const usersCollection = tables.find(t => t.name === 'test_users');
    expect(usersCollection).toBeDefined();
    expect(usersCollection?.rowCount).toBeGreaterThanOrEqual(10);

    const productsCollection = tables.find(t => t.name === 'test_products');
    expect(productsCollection?.rowCount).toBeGreaterThanOrEqual(5);
  }, INTEGRATION_TIMEOUT);

  it('should get complete schema', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('milvus');
    expect(schema.databaseName).toBe('milvus');
    expect(schema.milvusCollections).toBeDefined();
    expect(schema.milvusCollections!.length).toBeGreaterThanOrEqual(2);
  }, INTEGRATION_TIMEOUT);

  it('should get collection details with fields', async () => {
    const details = await connector.getTableDetails('test_users');

    expect(details).toBeDefined();
    expect(details?.name).toBe('test_users');
    expect(details?.columns).toBeDefined();
    expect(details?.columns.length).toBeGreaterThanOrEqual(3);

    // Check primary key field
    const idField = details?.columns.find(c => c.name === 'id');
    expect(idField).toBeDefined();
    expect(idField?.isPrimaryKey).toBe(true);
    expect(idField?.type).toContain('Int64');

    // Check vector field
    const embeddingField = details?.columns.find(c => c.name === 'embedding');
    expect(embeddingField).toBeDefined();
    expect(embeddingField?.type).toContain('FloatVector');
  }, INTEGRATION_TIMEOUT);

  it('should handle FloatVector type', async () => {
    const details = await connector.getTableDetails('test_users');
    const embeddingField = details?.columns.find(c => c.name === 'embedding');

    expect(embeddingField?.type).toContain('FloatVector');
  }, INTEGRATION_TIMEOUT);

  it('should handle Int64 type', async () => {
    const details = await connector.getTableDetails('test_users');
    const idField = details?.columns.find(c => c.name === 'id');

    expect(idField?.type).toContain('Int64');
  }, INTEGRATION_TIMEOUT);

  it('should handle Int32 type', async () => {
    const details = await connector.getTableDetails('test_users');
    const ageField = details?.columns.find(c => c.name === 'age');

    expect(ageField?.type).toContain('Int32');
  }, INTEGRATION_TIMEOUT);

  it('should handle Float type', async () => {
    const details = await connector.getTableDetails('test_products');
    const priceField = details?.columns.find(c => c.name === 'price');

    expect(priceField?.type).toContain('Float');
  }, INTEGRATION_TIMEOUT);

  it('should get index information', async () => {
    const schema = await connector.getSchema();

    const usersCollection = schema.milvusCollections?.find(c => c.name === 'test_users');
    expect(usersCollection).toBeDefined();
    expect(usersCollection?.indexes).toBeDefined();
    expect(usersCollection?.indexes!.length).toBeGreaterThan(0);

    const embeddingIndex = usersCollection?.indexes?.find(idx =>
      idx.fieldName === 'embedding'
    );
    expect(embeddingIndex).toBeDefined();
    expect(embeddingIndex?.indexType).toBe('IVF_FLAT');
  }, INTEGRATION_TIMEOUT);

  it('should handle different metric types', async () => {
    const schema = await connector.getSchema();

    const usersCollection = schema.milvusCollections?.find(c => c.name === 'test_users');
    const usersIndex = usersCollection?.indexes?.find(idx => idx.fieldName === 'embedding');
    expect(usersIndex?.metricType).toBe('L2');

    const productsCollection = schema.milvusCollections?.find(c => c.name === 'test_products');
    const productsIndex = productsCollection?.indexes?.find(idx => idx.fieldName === 'feature_vector');
    expect(productsIndex?.metricType).toBe('IP');
  }, INTEGRATION_TIMEOUT);

  it('should test connection successfully', async () => {
    const testConnector = new MilvusConnector(config);
    await testConnector.connect();
    const result = await testConnector.testConnection();

    expect(result).toBe(true);
    await testConnector.disconnect();
  }, INTEGRATION_TIMEOUT);

  it('should handle connection with invalid address', async () => {
    const invalidConfig: MilvusConfig = {
      address: 'invalid-host:19530',
    };

    const failingConnector = new MilvusConnector(invalidConfig);

    await expect(failingConnector.connect()).rejects.toThrow();
  }, INTEGRATION_TIMEOUT);

  it('should return null for non-existent collection', async () => {
    const details = await connector.getTableDetails('nonexistent_collection');
    expect(details).toBeNull();
  }, INTEGRATION_TIMEOUT);

  it('should verify data can be inserted', async () => {
    // This test verifies the Milvus instance is working
    const newEmbedding = Array.from({ length: 128 }, () => Math.random());

    await client.insert({
      collection_name: 'test_users',
      data: [{
        id: 999,
        age: 99,
        embedding: newEmbedding,
      }],
    });

    // Data was inserted successfully (no error thrown)
    expect(true).toBe(true);
  }, INTEGRATION_TIMEOUT);

  it('should handle collections with different vector dimensions', async () => {
    const usersDetails = await connector.getTableDetails('test_users');
    const usersEmbedding = usersDetails?.columns.find(c => c.name === 'embedding');
    expect(usersEmbedding?.type).toContain('128');

    const productsDetails = await connector.getTableDetails('test_products');
    const productsVector = productsDetails?.columns.find(c => c.name === 'feature_vector');
    expect(productsVector?.type).toContain('64');
  }, INTEGRATION_TIMEOUT);
});
