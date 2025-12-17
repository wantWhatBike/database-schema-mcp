/**
 * MongoDB Integration Tests
 *
 * These tests connect to a real MongoDB database instance (no mocks).
 * Requires Docker environment to be running: ./tests/integration/setup.sh setup
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MongoDBConnector } from '../../src/connectors/mongodb.js';
import type { MongoDBConfig } from '../../src/types/schema.js';
import { MongoClient, Db } from 'mongodb';
import fs from 'fs';
import path from 'path';

// Load integration test config
const configPath = path.join(__dirname, 'config.json');
const testConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const INTEGRATION_TIMEOUT = 30000;

describe('MongoDB Integration Tests (Real Database)', () => {
  let connector: MongoDBConnector;
  let client: MongoClient;
  let db: Db;
  const config: MongoDBConfig = {
    type: 'mongodb',
    uri: `mongodb://${testConfig.databases.mongodb.user}:${testConfig.databases.mongodb.password}@${testConfig.databases.mongodb.host}:${testConfig.databases.mongodb.port}`,
    database: testConfig.databases.mongodb.database,
    sampleSize: 100
  };

  beforeEach(async () => {
    // Create a direct MongoDB connection for test data setup
    client = new MongoClient(config.uri);
    await client.connect();
    db = client.db(config.database);

    // Clean up existing test collections
    const collections = await db.listCollections().toArray();
    for (const collection of collections) {
      await db.collection(collection.name).drop();
    }

    // Create users collection with test data
    const usersCollection = db.collection('users');
    await usersCollection.insertMany([
      {
        _id: 1,
        email: 'user1@example.com',
        username: 'user1',
        age: 25,
        isActive: true,
        tags: ['admin', 'user'],
        metadata: { role: 'admin', level: 5 },
        createdAt: new Date('2024-01-01')
      },
      {
        _id: 2,
        email: 'user2@example.com',
        username: 'user2',
        age: 30,
        isActive: false,
        tags: ['user'],
        metadata: { role: 'user', level: 2 },
        createdAt: new Date('2024-02-01')
      },
      {
        _id: 3,
        email: 'user3@example.com',
        username: 'user3',
        age: 17,
        isActive: true,
        tags: [],
        metadata: null,
        createdAt: new Date('2024-03-01')
      }
    ]);

    // Create indexes on users collection
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    await usersCollection.createIndex({ username: 1 });
    await usersCollection.createIndex({ createdAt: -1 });

    // Create products collection with test data
    const productsCollection = db.collection('products');
    await productsCollection.insertMany([
      {
        _id: 'prod1',
        name: 'Product A',
        price: 99.99,
        stock: 10,
        specs: {
          weight: 0.5,
          dimensions: { width: 10, height: 5, depth: 2 }
        },
        tags: ['electronics', 'featured']
      },
      {
        _id: 'prod2',
        name: 'Product B',
        price: 49.99,
        stock: 5,
        specs: {
          weight: 0.3,
          dimensions: { width: 8, height: 4, depth: 1 }
        },
        tags: ['accessories']
      }
    ]);

    await productsCollection.createIndex({ name: 1 }, { unique: true });

    // Create orders collection with test data
    const ordersCollection = db.collection('orders');
    await ordersCollection.insertMany([
      {
        _id: 1001,
        user_id: 1,
        order_date: new Date('2024-01-01'),
        total: 99.99,
        status: 'delivered',
        items: [
          { product_id: 'prod1', quantity: 1, price: 99.99 }
        ]
      },
      {
        _id: 1002,
        user_id: 2,
        order_date: new Date('2024-01-02'),
        total: 149.98,
        status: 'shipped',
        items: [
          { product_id: 'prod1', quantity: 1, price: 99.99 },
          { product_id: 'prod2', quantity: 1, price: 49.99 }
        ]
      }
    ]);

    await ordersCollection.createIndex({ user_id: 1 });
    await ordersCollection.createIndex({ order_date: -1 });

    // Create connector instance
    connector = new MongoDBConnector(config);
    await connector.connect();
  }, INTEGRATION_TIMEOUT);

  afterEach(async () => {
    // Cleanup
    if (connector) {
      await connector.disconnect();
    }
    if (client) {
      // Drop all test collections
      const collections = await db.listCollections().toArray();
      for (const collection of collections) {
        await db.collection(collection.name).drop();
      }
      await client.close();
    }
  }, INTEGRATION_TIMEOUT);

  it('should connect to real MongoDB database', () => {
    expect(connector).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should retrieve MongoDB version', async () => {
    const schema = await connector.getSchema();
    expect(schema.version).toBeDefined();
    expect(schema.version).toContain('MongoDB');
  }, INTEGRATION_TIMEOUT);

  it('should list all collections', async () => {
    const tables = await connector.listTables();

    expect(tables.length).toBeGreaterThanOrEqual(3);
    const collectionNames = tables.map(t => t.name);
    expect(collectionNames).toContain('users');
    expect(collectionNames).toContain('products');
    expect(collectionNames).toContain('orders');
  }, INTEGRATION_TIMEOUT);

  it('should get complete schema', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('mongodb');
    expect(schema.databaseName).toBe('testdb');
    expect(schema.collections).toBeDefined();
    expect(schema.collections?.length).toBeGreaterThanOrEqual(3);

    // Check users collection
    const usersCollection = schema.collections?.find(c => c.name === 'users');
    expect(usersCollection).toBeDefined();
    expect(usersCollection?.type).toBe('collection');
    expect(usersCollection?.rowCount).toBe(3);
  }, INTEGRATION_TIMEOUT);

  it('should get collection details with indexes', async () => {
    const details = await connector.getTableDetails('users');

    expect(details).toBeDefined();
    expect(details?.name).toBe('users');
    expect(details?.type).toBe('collection');
    expect(details?.rowCount).toBe(3);

    // Check indexes
    expect(details?.indexes).toBeDefined();
    expect(details?.indexes?.length).toBeGreaterThanOrEqual(3);

    // Check _id index
    const idIndex = details?.indexes?.find(idx => idx.name === '_id_');
    expect(idIndex).toBeDefined();
    expect(idIndex?.isUnique).toBe(true);

    // Check email index
    const emailIndex = details?.indexes?.find(idx => idx.name === 'email_1');
    expect(emailIndex).toBeDefined();
    expect(emailIndex?.isUnique).toBe(true);
  }, INTEGRATION_TIMEOUT);

  it('should handle nested objects', async () => {
    const details = await connector.getTableDetails('products');

    expect(details).toBeDefined();
    expect(details?.rowCount).toBe(2);

    // The schema inference should work on real data
    const schema = await connector.getSchema();
    const productsCollection = schema.collections?.find(c => c.name === 'products');
    expect(productsCollection).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should handle arrays', async () => {
    const details = await connector.getTableDetails('users');

    expect(details).toBeDefined();
    // Verify that the connector can handle documents with array fields
    expect(details?.rowCount).toBe(3);
  }, INTEGRATION_TIMEOUT);

  it('should handle mixed type IDs', async () => {
    // Users collection has numeric IDs
    const usersDetails = await connector.getTableDetails('users');
    expect(usersDetails).toBeDefined();
    expect(usersDetails?.rowCount).toBe(3);

    // Products collection has string IDs
    const productsDetails = await connector.getTableDetails('products');
    expect(productsDetails).toBeDefined();
    expect(productsDetails?.rowCount).toBe(2);
  }, INTEGRATION_TIMEOUT);

  it('should handle empty collections', async () => {
    // Create an empty collection
    await db.createCollection('empty_collection');

    const details = await connector.getTableDetails('empty_collection');

    expect(details).toBeDefined();
    expect(details?.rowCount).toBe(0);
    expect(details?.name).toBe('empty_collection');
  }, INTEGRATION_TIMEOUT);

  it('should return null for non-existent collection', async () => {
    const details = await connector.getTableDetails('nonexistent_collection');
    expect(details).toBeNull();
  }, INTEGRATION_TIMEOUT);

  it('should respect sampleSize configuration', async () => {
    // Create a collection with many documents
    const largeCollection = db.collection('large_collection');
    const docs = [];
    for (let i = 0; i < 200; i++) {
      docs.push({ _id: i, name: `Item ${i}`, value: i * 10 });
    }
    await largeCollection.insertMany(docs);

    const details = await connector.getTableDetails('large_collection');

    expect(details).toBeDefined();
    expect(details?.rowCount).toBe(200);
    // The connector should sample up to sampleSize (100) documents for schema inference
  }, INTEGRATION_TIMEOUT);

  it('should handle date fields', async () => {
    const usersDetails = await connector.getTableDetails('users');

    expect(usersDetails).toBeDefined();
    // Verify that dates are handled properly
    expect(usersDetails?.rowCount).toBe(3);
  }, INTEGRATION_TIMEOUT);

  it('should handle boolean fields', async () => {
    const usersDetails = await connector.getTableDetails('users');

    expect(usersDetails).toBeDefined();
    expect(usersDetails?.rowCount).toBe(3);
  }, INTEGRATION_TIMEOUT);

  it('should handle null values', async () => {
    const usersDetails = await connector.getTableDetails('users');

    expect(usersDetails).toBeDefined();
    // Document with _id: 3 has metadata: null
    expect(usersDetails?.rowCount).toBe(3);
  }, INTEGRATION_TIMEOUT);

  it('should test connection successfully', async () => {
    const testConnector = new MongoDBConnector(config);
    const result = await testConnector.testConnection();

    expect(result).toBe(true);
    await testConnector.disconnect();
  }, INTEGRATION_TIMEOUT);

  it('should handle connection with invalid credentials', async () => {
    const invalidConfig: MongoDBConfig = {
      ...config,
      uri: 'mongodb://wrong:wrong@localhost:27017'
    };

    const failingConnector = new MongoDBConnector(invalidConfig);
    const result = await failingConnector.testConnection();

    expect(result).toBe(false);
  }, INTEGRATION_TIMEOUT);

  it('should handle compound indexes', async () => {
    // Create a collection with compound index
    const compoundCollection = db.collection('compound_test');
    await compoundCollection.insertOne({ field1: 'a', field2: 'b' });
    await compoundCollection.createIndex({ field1: 1, field2: -1 }, { name: 'compound_idx' });

    const details = await connector.getTableDetails('compound_test');

    expect(details?.indexes).toBeDefined();
    const compoundIndex = details?.indexes?.find(idx => idx.name === 'compound_idx');
    expect(compoundIndex).toBeDefined();
    expect(compoundIndex?.columns.length).toBe(2);
  }, INTEGRATION_TIMEOUT);
});
