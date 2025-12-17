import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RabbitMQConnector } from '../src/connectors/rabbitmq.js';
import type { RabbitMQConfig } from '../src/types/schema.js';

// Mock amqplib module
vi.mock('amqplib', () => {
  const mockChannel = {
    checkQueue: vi.fn().mockResolvedValue({
      queue: 'test_queue_1',
      messageCount: 10,
      consumerCount: 2
    }),
    close: vi.fn()
  };

  const mockConnection = {
    createChannel: vi.fn().mockResolvedValue(mockChannel),
    close: vi.fn()
  };

  return {
    connect: vi.fn().mockResolvedValue(mockConnection)
  };
});

// Mock global fetch for Management API
global.fetch = vi.fn();

describe('RabbitMQConnector Unit Tests', () => {
  let connector: RabbitMQConnector;

  const config: RabbitMQConfig = {
    type: 'rabbitmq',
    host: 'localhost',
    port: 5672,
    user: 'guest',
    password: 'test_password',
    vhost: '/'
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock Management API responses
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/queues')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              name: 'test_queue_1',
              durable: true,
              auto_delete: false,
              messages: 10,
              consumers: 2,
              arguments: {}
            },
            {
              name: 'test_queue_2',
              durable: false,
              auto_delete: true,
              messages: 5,
              consumers: 1,
              arguments: { 'x-max-priority': 10 }
            }
          ])
        });
      } else if (url.includes('/exchanges')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              name: 'test_exchange_direct',
              type: 'direct',
              durable: true,
              auto_delete: false,
              internal: false,
              arguments: {}
            },
            {
              name: 'test_exchange_fanout',
              type: 'fanout',
              durable: true,
              auto_delete: false,
              internal: false,
              arguments: {}
            }
          ])
        });
      } else if (url.includes('/bindings')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              source: 'test_exchange_direct',
              destination: 'test_queue_1',
              destination_type: 'queue',
              routing_key: 'test_key',
              arguments: {}
            }
          ])
        });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });

    connector = new RabbitMQConnector(config);
    await connector.connect();
  });

  it('should connect successfully', () => {
    expect(connector).toBeDefined();
  });

  it('should list queues as tables', async () => {
    const tables = await connector.listTables();

    expect(tables.length).toBeGreaterThanOrEqual(2);
    const queueNames = tables.map(t => t.name);
    expect(queueNames).toContain('test_queue_1');
    expect(queueNames).toContain('test_queue_2');
  });

  it('should get complete schema with queues and exchanges', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('rabbitmq');
    expect(schema.databaseName).toBe('/');
    expect(schema.queues).toBeDefined();
    expect(schema.queues?.length).toBeGreaterThanOrEqual(2);

    const queue1 = schema.queues?.find(q => q.name === 'test_queue_1');
    expect(queue1).toMatchObject({
      name: 'test_queue_1',
      durable: true,
      autoDelete: false,
      messages: 10,
      consumers: 2
    });

    const queue2 = schema.queues?.find(q => q.name === 'test_queue_2');
    expect(queue2).toMatchObject({
      name: 'test_queue_2',
      durable: false,
      autoDelete: true,
      messages: 5,
      consumers: 1
    });
    expect(queue2?.arguments?.['x-max-priority']).toBe(10);

    // Check exchanges
    expect(schema.exchanges).toBeDefined();
    expect(schema.exchanges?.length).toBeGreaterThanOrEqual(2);

    const directExchange = schema.exchanges?.find(e => e.name === 'test_exchange_direct');
    expect(directExchange).toMatchObject({
      name: 'test_exchange_direct',
      type: 'direct',
      durable: true,
      autoDelete: false
    });

    const fanoutExchange = schema.exchanges?.find(e => e.name === 'test_exchange_fanout');
    expect(fanoutExchange).toMatchObject({
      name: 'test_exchange_fanout',
      type: 'fanout',
      durable: true
    });
  });

  it('should get queue details', async () => {
    const queueDetails = await connector.getTableDetails('test_queue_1');

    expect(queueDetails).toBeDefined();
    expect(queueDetails?.name).toBe('test_queue_1');
    expect(queueDetails?.type).toBe('collection');
    expect(queueDetails?.rowCount).toBe(10);
    expect(queueDetails?.columns).toBeDefined();
    expect(queueDetails?.columns.length).toBe(2);
  });

  it('should handle searchColumns gracefully', async () => {
    const result = await connector.searchColumns('any_column');
    expect(result).toEqual([]);
  });

  it('should disconnect properly', async () => {
    await connector.disconnect();
    // Verify no errors thrown
    expect(true).toBe(true);
  });
});
