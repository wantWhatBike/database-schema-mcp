/**
 * Kafka Integration Tests
 *
 * These tests connect to a real Kafka instance (no mocks).
 * Requires Docker environment to be running: ./tests/integration/setup.sh setup
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KafkaConnector } from '../../src/connectors/kafka.js';
import type { KafkaConfig } from '../../src/types/schema.js';
import { Kafka, Admin, Producer } from 'kafkajs';
import fs from 'fs';
import path from 'path';

// Load integration test config
const configPath = path.join(__dirname, 'config.json');
const testConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const INTEGRATION_TIMEOUT = 30000;

describe('Kafka Integration Tests (Real Database)', () => {
  let connector: KafkaConnector;
  let kafka: Kafka;
  let admin: Admin;
  let producer: Producer;
  const config: KafkaConfig = testConfig.databases.kafka;

  beforeEach(async () => {
    // Create a direct Kafka connection for test data setup
    kafka = new Kafka({
      clientId: 'integration-test-client',
      brokers: config.brokers,
    });

    admin = kafka.admin();
    await admin.connect();

    producer = kafka.producer();
    await producer.connect();

    // Clean up existing test topics
    const existingTopics = await admin.listTopics();
    const testTopics = existingTopics.filter(t => t.startsWith('test-'));
    if (testTopics.length > 0) {
      await admin.deleteTopics({
        topics: testTopics,
        timeout: 5000,
      });
    }

    // Wait a bit for deletion to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create test topics
    await admin.createTopics({
      topics: [
        {
          topic: 'test-users',
          numPartitions: 3,
          replicationFactor: 1,
          configEntries: [
            { name: 'retention.ms', value: '86400000' },
            { name: 'cleanup.policy', value: 'delete' },
          ],
        },
        {
          topic: 'test-orders',
          numPartitions: 2,
          replicationFactor: 1,
        },
        {
          topic: 'test-events',
          numPartitions: 1,
          replicationFactor: 1,
        },
      ],
    });

    // Wait for topics to be created
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Produce some test messages
    await producer.send({
      topic: 'test-users',
      messages: [
        { key: '1', value: JSON.stringify({ id: 1, name: 'Alice' }) },
        { key: '2', value: JSON.stringify({ id: 2, name: 'Bob' }) },
      ],
    });

    await producer.send({
      topic: 'test-orders',
      messages: [
        { key: '1', value: JSON.stringify({ orderId: 1, userId: 1, total: 99.99 }) },
      ],
    });

    // Create connector instance
    connector = new KafkaConnector(config);
    await connector.connect();
  }, INTEGRATION_TIMEOUT);

  afterEach(async () => {
    // Cleanup
    if (connector) {
      await connector.disconnect();
    }
    if (producer) {
      await producer.disconnect();
    }
    if (admin) {
      const existingTopics = await admin.listTopics();
      const testTopics = existingTopics.filter(t => t.startsWith('test-'));
      if (testTopics.length > 0) {
        await admin.deleteTopics({ topics: testTopics });
      }
      await admin.disconnect();
    }
  }, INTEGRATION_TIMEOUT);

  it('should connect to real Kafka instance', () => {
    expect(connector).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should retrieve Kafka version/info', async () => {
    const schema = await connector.getSchema();
    expect(schema.version).toBeDefined();
    expect(schema.version).toContain('Kafka');
  }, INTEGRATION_TIMEOUT);

  it('should list all topics', async () => {
    const tables = await connector.listTables();

    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('test-users');
    expect(tableNames).toContain('test-orders');
    expect(tableNames).toContain('test-events');
  }, INTEGRATION_TIMEOUT);

  it('should get complete schema', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('kafka');
    expect(schema.databaseName).toBe('kafka-cluster');
    expect(schema.topics).toBeDefined();
    expect(schema.topics!.length).toBeGreaterThanOrEqual(3);

    // Check test-users topic
    const usersTopic = schema.topics!.find(t => t.name === 'test-users');
    expect(usersTopic).toBeDefined();
    expect(usersTopic?.partitions).toBe(3);
    expect(usersTopic?.replicationFactor).toBe(1);
  }, INTEGRATION_TIMEOUT);

  it('should get topic configuration', async () => {
    const schema = await connector.getSchema();
    const usersTopic = schema.topics!.find(t => t.name === 'test-users');

    expect(usersTopic?.config).toBeDefined();
    expect(usersTopic?.config).toHaveProperty('cleanup.policy');
  }, INTEGRATION_TIMEOUT);

  it('should handle topics with different partition counts', async () => {
    const schema = await connector.getSchema();

    const usersTopic = schema.topics!.find(t => t.name === 'test-users');
    expect(usersTopic?.partitions).toBe(3);

    const ordersTopic = schema.topics!.find(t => t.name === 'test-orders');
    expect(ordersTopic?.partitions).toBe(2);

    const eventsTopic = schema.topics!.find(t => t.name === 'test-events');
    expect(eventsTopic?.partitions).toBe(1);
  }, INTEGRATION_TIMEOUT);

  it('should test connection successfully', async () => {
    const testConnector = new KafkaConnector(config);
    await testConnector.connect();
    const result = await testConnector.testConnection();

    expect(result).toBe(true);
    await testConnector.disconnect();
  }, INTEGRATION_TIMEOUT);

  it('should handle connection with invalid brokers', async () => {
    const invalidConfig: KafkaConfig = {
      ...config,
      brokers: ['invalid-host:9092'],
    };

    const failingConnector = new KafkaConnector(invalidConfig);

    await expect(failingConnector.connect()).rejects.toThrow();
  }, INTEGRATION_TIMEOUT);

  it('should return null for getTableDetails', async () => {
    // Kafka doesn't have traditional table details
    const details = await connector.getTableDetails('test-users');
    expect(details).toBeNull();
  }, INTEGRATION_TIMEOUT);

  it('should verify topics can receive messages', async () => {
    // This test verifies the Kafka instance is working
    const testTopic = 'test-users';
    const testMessage = { key: '99', value: JSON.stringify({ id: 99, name: 'Test User' }) };

    await producer.send({
      topic: testTopic,
      messages: [testMessage],
    });

    // Messages were produced successfully (no error thrown)
    expect(true).toBe(true);
  }, INTEGRATION_TIMEOUT);

  it('should handle topic metadata', async () => {
    const schema = await connector.getSchema();

    for (const topic of schema.topics || []) {
      expect(topic.name).toBeDefined();
      expect(topic.partitions).toBeGreaterThan(0);
      expect(topic.replicationFactor).toBeGreaterThan(0);
    }
  }, INTEGRATION_TIMEOUT);
});
