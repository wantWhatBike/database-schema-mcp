import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KafkaConnector } from '../src/connectors/kafka.js';
import type { KafkaConfig } from '../src/types/schema.js';

// Use vi.hoisted to create mocks before vi.mock
const { mockConnect, mockDisconnect, mockListTopics, mockFetchTopicMetadata, mockDescribeConfigs, mockAdmin } = vi.hoisted(() => {
  const mockConnect = vi.fn();
  const mockDisconnect = vi.fn();
  const mockListTopics = vi.fn();
  const mockFetchTopicMetadata = vi.fn();
  const mockDescribeConfigs = vi.fn();

  const mockAdmin = {
    connect: mockConnect,
    disconnect: mockDisconnect,
    listTopics: mockListTopics,
    fetchTopicMetadata: mockFetchTopicMetadata,
    describeConfigs: mockDescribeConfigs
  };

  return { mockConnect, mockDisconnect, mockListTopics, mockFetchTopicMetadata, mockDescribeConfigs, mockAdmin };
});

// Mock kafkajs module
vi.mock('kafkajs', () => {
  return {
    Kafka: vi.fn(() => ({
      admin: vi.fn(() => mockAdmin)
    }))
  };
});

describe('KafkaConnector Unit Tests', () => {
  let connector: KafkaConnector;

  const config: KafkaConfig = {
    type: 'kafka',
    brokers: ['localhost:9092'],
    clientId: 'test-client'
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup default mock responses
    mockConnect.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);

    mockListTopics.mockResolvedValue([
      'user-events',
      'order-events',
      'product-updates',
      'notifications'
    ]);

    mockFetchTopicMetadata.mockResolvedValue({
      topics: [
        {
          name: 'user-events',
          partitions: [
            { partition: 0, leader: 0, replicas: [0], isr: [0] },
            { partition: 1, leader: 0, replicas: [0], isr: [0] },
            { partition: 2, leader: 0, replicas: [0], isr: [0] }
          ]
        },
        {
          name: 'order-events',
          partitions: [
            { partition: 0, leader: 0, replicas: [0], isr: [0] },
            { partition: 1, leader: 0, replicas: [0], isr: [0] }
          ]
        },
        {
          name: 'product-updates',
          partitions: [
            { partition: 0, leader: 0, replicas: [0], isr: [0] }
          ]
        },
        {
          name: 'notifications',
          partitions: [
            { partition: 0, leader: 0, replicas: [0], isr: [0] },
            { partition: 1, leader: 0, replicas: [0], isr: [0] },
            { partition: 2, leader: 0, replicas: [0], isr: [0] },
            { partition: 3, leader: 0, replicas: [0], isr: [0] }
          ]
        }
      ]
    });

    mockDescribeConfigs.mockImplementation((params: any) => {
      const topicName = params.resources[0].name;

      const configs: Record<string, any> = {
        'user-events': {
          resources: [{
            configEntries: [
              { configName: 'retention.ms', configValue: '86400000', isDefault: false },
              { configName: 'compression.type', configValue: 'gzip', isDefault: false },
              { configName: 'segment.ms', configValue: '604800000', isDefault: true }
            ]
          }]
        },
        'order-events': {
          resources: [{
            configEntries: [
              { configName: 'retention.ms', configValue: '604800000', isDefault: false },
              { configName: 'cleanup.policy', configValue: 'delete', isDefault: false }
            ]
          }]
        },
        'product-updates': {
          resources: [{
            configEntries: []
          }]
        },
        'notifications': {
          resources: [{
            configEntries: []
          }]
        }
      };

      return Promise.resolve(configs[topicName] || { resources: [{ configEntries: [] }] });
    });

    connector = new KafkaConnector(config);
    await connector.connect();
  });

  it('should connect successfully', () => {
    expect(connector).toBeDefined();
    expect(mockConnect).toHaveBeenCalled();
  });

  it('should list all topics', async () => {
    const tables = await connector.listTables();

    expect(tables).toHaveLength(4);
    const topicNames = tables.map(t => t.name);
    expect(topicNames).toContain('user-events');
    expect(topicNames).toContain('order-events');
    expect(topicNames).toContain('product-updates');
    expect(topicNames).toContain('notifications');
  });

  it('should get complete schema with topic configurations', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('kafka');
    expect(schema.databaseName).toBe('kafka-cluster');
    expect(schema.topics).toBeDefined();
    expect(schema.topics?.length).toBe(4);

    // Check user-events topic
    const userEventsTopic = schema.topics?.find(t => t.name === 'user-events');
    expect(userEventsTopic).toBeDefined();
    expect(userEventsTopic?.partitions).toBe(3);
    expect(userEventsTopic?.replicationFactor).toBe(1);
  });

  it('should get topic with partition information', async () => {
    const schema = await connector.getSchema();
    const userEventsTopic = schema.topics?.find(t => t.name === 'user-events');

    expect(userEventsTopic).toBeDefined();
    expect(userEventsTopic?.name).toBe('user-events');
    expect(userEventsTopic?.partitions).toBe(3);
    expect(userEventsTopic?.replicationFactor).toBe(1);
  });

  it('should get topic configurations', async () => {
    const schema = await connector.getSchema();
    const userEventsTopic = schema.topics?.find(t => t.name === 'user-events');

    expect(userEventsTopic?.config).toBeDefined();
    expect(userEventsTopic?.config).toBeTypeOf('object');

    // Check specific configurations
    const config = userEventsTopic?.config as Record<string, string>;
    expect(config['retention.ms']).toBe('86400000');
    expect(config['compression.type']).toBe('gzip');
  });

  it('should handle topics with different partition counts', async () => {
    const schema = await connector.getSchema();

    const userEvents = schema.topics?.find(t => t.name === 'user-events');
    expect(userEvents?.partitions).toBe(3);

    const orderEvents = schema.topics?.find(t => t.name === 'order-events');
    expect(orderEvents?.partitions).toBe(2);

    const productUpdates = schema.topics?.find(t => t.name === 'product-updates');
    expect(productUpdates?.partitions).toBe(1);

    const notifications = schema.topics?.find(t => t.name === 'notifications');
    expect(notifications?.partitions).toBe(4);
  });

  it('should calculate replication factor from partition replicas', async () => {
    const schema = await connector.getSchema();

    for (const topic of schema.topics || []) {
      expect(topic.replicationFactor).toBe(1);
    }
  });

  it('should list topics without filtering', async () => {
    const tables = await connector.listTables();
    expect(tables.length).toBeGreaterThanOrEqual(4);
  });

  it('should handle topic with cleanup policy', async () => {
    const schema = await connector.getSchema();
    const orderEvents = schema.topics?.find(t => t.name === 'order-events');

    expect(orderEvents?.config).toBeDefined();
    const config = orderEvents?.config as Record<string, string>;
    expect(config['cleanup.policy']).toBe('delete');
  });

  it('should get all topics in schema', async () => {
    const schema = await connector.getSchema();

    const testTopicNames = ['user-events', 'order-events', 'product-updates', 'notifications'];
    for (const topicName of testTopicNames) {
      const topic = schema.topics?.find(t => t.name === topicName);
      expect(topic).toBeDefined();
    }
  });

  it('should handle topic with retention configuration', async () => {
    const schema = await connector.getSchema();
    const userEvents = schema.topics?.find(t => t.name === 'user-events');

    expect(userEvents?.config).toBeDefined();
    const config = userEvents?.config as Record<string, string>;

    // Retention should be set to 1 day (86400000 ms)
    expect(config['retention.ms']).toBe('86400000');
  });

  it('should provide replication factor information', async () => {
    const schema = await connector.getSchema();
    const userEvents = schema.topics?.find(t => t.name === 'user-events');

    expect(userEvents?.replicationFactor).toBe(1);
  });

  it('should only include non-default configs', async () => {
    const schema = await connector.getSchema();
    const userEvents = schema.topics?.find(t => t.name === 'user-events');

    const config = userEvents?.config as Record<string, string>;

    // Should include non-default configs
    expect(config['retention.ms']).toBeDefined();
    expect(config['compression.type']).toBeDefined();

    // Should NOT include default configs
    expect(config['segment.ms']).toBeUndefined();
  });

  it('should disconnect properly', async () => {
    await connector.disconnect();
    expect(mockDisconnect).toHaveBeenCalled();
  });
});
