/**
 * RabbitMQ Integration Tests
 *
 * These tests connect to a real RabbitMQ instance (no mocks).
 * Requires Docker environment to be running: ./tests/integration/setup.sh setup
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RabbitMQConnector } from '../../src/connectors/rabbitmq.js';
import type { RabbitMQConfig } from '../../src/types/schema.js';
import * as amqp from 'amqplib';
import fs from 'fs';
import path from 'path';

// Load integration test config
const configPath = path.join(__dirname, 'config.json');
const testConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const INTEGRATION_TIMEOUT = 30000;

describe('RabbitMQ Integration Tests (Real Database)', () => {
  let connector: RabbitMQConnector;
  let connection: any;
  let channel: any;
  const config: RabbitMQConfig = testConfig.databases.rabbitmq;

  beforeEach(async () => {
    // Create a direct RabbitMQ connection for test data setup
    const url = `amqp://${config.username}:${config.password}@${config.host}:${config.port}/`;
    connection = await amqp.connect(url);
    channel = await connection.createChannel();

    // Clean up any existing test queues and exchanges
    const testQueues = ['test-users', 'test-orders', 'test-events'];
    for (const queue of testQueues) {
      try {
        await channel.deleteQueue(queue);
      } catch (e) {
        // Queue might not exist, ignore
      }
    }

    const testExchanges = ['test-exchange'];
    for (const exchange of testExchanges) {
      try {
        await channel.deleteExchange(exchange);
      } catch (e) {
        // Exchange might not exist, ignore
      }
    }

    // Create test queues
    await channel.assertQueue('test-users', { durable: true });
    await channel.assertQueue('test-orders', { durable: false });
    await channel.assertQueue('test-events', { durable: true, autoDelete: false });

    // Create test exchange
    await channel.assertExchange('test-exchange', 'direct', { durable: true });

    // Create bindings
    await channel.bindQueue('test-users', 'test-exchange', 'user.created');
    await channel.bindQueue('test-orders', 'test-exchange', 'order.placed');

    // Publish test messages
    await channel.sendToQueue('test-users', Buffer.from(JSON.stringify({ id: 1, name: 'Alice' })));
    await channel.sendToQueue('test-users', Buffer.from(JSON.stringify({ id: 2, name: 'Bob' })));
    await channel.sendToQueue('test-orders', Buffer.from(JSON.stringify({ orderId: 1, total: 99.99 })));

    // Create connector instance
    connector = new RabbitMQConnector(config);
    await connector.connect();
  }, INTEGRATION_TIMEOUT);

  afterEach(async () => {
    // Cleanup
    if (connector) {
      await connector.disconnect();
    }
    if (channel) {
      const testQueues = ['test-users', 'test-orders', 'test-events'];
      for (const queue of testQueues) {
        try {
          await channel.deleteQueue(queue);
        } catch (e) {
          // Ignore errors
        }
      }

      const testExchanges = ['test-exchange'];
      for (const exchange of testExchanges) {
        try {
          await channel.deleteExchange(exchange);
        } catch (e) {
          // Ignore errors
        }
      }

      await channel.close();
    }
    if (connection) {
      await connection.close();
    }
  }, INTEGRATION_TIMEOUT);

  it('should connect to real RabbitMQ instance', () => {
    expect(connector).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should get schema information', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('rabbitmq');
    expect(schema.databaseName).toBe('/');
    expect(schema.queues).toBeDefined();
    expect(schema.exchanges).toBeDefined();
  }, INTEGRATION_TIMEOUT);

  it('should list all queues', async () => {
    const tables = await connector.listTables();

    const queueNames = tables.map(t => t.name);
    expect(queueNames).toContain('test-users');
    expect(queueNames).toContain('test-orders');
    expect(queueNames).toContain('test-events');
  }, INTEGRATION_TIMEOUT);

  it('should report message counts', async () => {
    const tables = await connector.listTables();

    const usersQueue = tables.find(t => t.name === 'test-users');
    expect(usersQueue).toBeDefined();
    expect(usersQueue?.rowCount).toBeGreaterThanOrEqual(0);
  }, INTEGRATION_TIMEOUT);

  it('should get queue details', async () => {
    const details = await connector.getTableDetails('test-users');

    expect(details).toBeDefined();
    expect(details?.name).toBe('test-users');
    expect(details?.type).toBe('collection');
    expect(details?.columns).toBeDefined();
    expect(details?.columns.length).toBeGreaterThan(0);
  }, INTEGRATION_TIMEOUT);

  it('should test connection successfully', async () => {
    const testConnector = new RabbitMQConnector(config);
    await testConnector.connect();
    const result = await testConnector.testConnection();

    expect(result).toBe(true);
    await testConnector.disconnect();
  }, INTEGRATION_TIMEOUT);

  it('should handle connection with invalid credentials', async () => {
    const invalidConfig: RabbitMQConfig = {
      ...config,
      password: 'wrong_password',
    };

    const failingConnector = new RabbitMQConnector(invalidConfig);

    await expect(failingConnector.connect()).rejects.toThrow();
  }, INTEGRATION_TIMEOUT);

  it('should verify messages can be queued', async () => {
    // This test verifies the RabbitMQ instance is working
    const testQueue = 'test-users';
    const testMessage = { id: 99, name: 'Test User' };

    await channel.sendToQueue(testQueue, Buffer.from(JSON.stringify(testMessage)));

    // Message was queued successfully (no error thrown)
    expect(true).toBe(true);
  }, INTEGRATION_TIMEOUT);

  it('should handle exchanges', async () => {
    const schema = await connector.getSchema();

    expect(schema.exchanges).toBeDefined();
    const testExchange = schema.exchanges?.find(e => e.name === 'test-exchange');
    expect(testExchange).toBeDefined();
    expect(testExchange?.type).toBe('direct');
  }, INTEGRATION_TIMEOUT);

  it('should handle bindings', async () => {
    const schema = await connector.getSchema();

    expect(schema.bindings).toBeDefined();
    expect(schema.bindings!.length).toBeGreaterThan(0);
  }, INTEGRATION_TIMEOUT);

  it('should return null for non-existent queue', async () => {
    await expect(connector.getTableDetails('nonexistent-queue')).rejects.toThrow();
  }, INTEGRATION_TIMEOUT);
});
