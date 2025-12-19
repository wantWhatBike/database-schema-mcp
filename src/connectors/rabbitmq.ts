import { DatabaseConnector } from './base.js';
import { registerConnector } from './factory.js';
import type {
  RabbitMQConfig,
  SchemaInfo,
  TableInfo,
  TableDetails,
  RabbitMQQueueInfo,
  RabbitMQExchangeInfo,
  RabbitMQBindingInfo,
} from '../types/schema.js';
import * as amqp from 'amqplib';

export class RabbitMQConnector extends DatabaseConnector {
  private connection: any = null;
  private channel: any = null;

  constructor(config: RabbitMQConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    const {
      protocol = 'amqp',
      host = 'localhost',
      port = 5672,
      user = 'guest',
      username,
      password = 'guest',
      vhost = '/',
      heartbeat = 60,
    } = this.config;

    const actualUser = username || user;
    const url = `${protocol}://${actualUser}:${password}@${host}:${port}${vhost}`;

    this.connection = await amqp.connect(url, {
      heartbeat,
    });

    if (this.connection) {
      this.channel = await this.connection.createChannel();

      // Add error handlers to prevent unhandled errors
      this.channel.on('error', (err: any) => {
        // Channel errors are expected in some cases (e.g., checking non-existent queues)
        // Just log and continue
      });

      this.channel.on('close', () => {
        // Channel closed, mark as null
        this.channel = null;
      });
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.channel) {
      try {
        await this.channel.close();
      } catch {
        // Channel might already be closed, ignore error
      }
      this.channel = null;
    }
    if (this.connection) {
      try {
        // @ts-ignore - close method exists on Connection
        await this.connection.close();
      } catch {
        // Connection might already be closed, ignore error
      }
      this.connection = null;
    }
    this.connected = false;
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.connection || !this.channel) {
        return false;
      }
      // Simply check if connection and channel are still open
      return !this.connection.connection.closed && this.channel !== null;
    } catch {
      return false;
    }
  }

  protected async getDatabaseVersion(): Promise<string | undefined> {
    const managementHost = this.config.host || 'localhost';
    const managementPort = this.config.managementPort || 15672;
    const user = this.config.username || this.config.user || 'guest';
    const password = this.config.password || 'guest';

    try {
      const auth = Buffer.from(`${user}:${password}`).toString('base64');
      const headers = { Authorization: `Basic ${auth}` };
      const response = await fetch(`http://${managementHost}:${managementPort}/api/overview`, { headers });
      const data = await response.json() as any;
      return data.rabbitmq_version;
    } catch {
      return undefined;
    }
  }

  async getSchema(): Promise<SchemaInfo> {
    if (!this.channel) {
      throw new Error('Not connected to RabbitMQ');
    }

    const queues = await this.getQueues();
    const exchanges = await this.getExchanges();
    const bindings = await this.getBindings();

    return {
      databaseType: 'rabbitmq',
      databaseName: this.config.vhost || '/',
      queues,
      exchanges,
      bindings,
      vhost: this.config.vhost || '/',
    };
  }

  async listTables(): Promise<TableInfo[]> {
    const queues = await this.getQueues();
    return queues.map((queue) => ({
      name: queue.name,
      type: 'collection' as const,
      rowCount: queue.messages,
    }));
  }

  async getTableDetails(tableName: string): Promise<TableDetails | null> {
    if (!this.channel) {
      throw new Error('Not connected to RabbitMQ');
    }

    try {
      // Check if queue exists
      const queueInfo = await this.channel.checkQueue(tableName);

      return {
        name: tableName,
        type: 'collection' as const,
        rowCount: queueInfo.messageCount,
        columns: [
          {
            name: 'messages',
            type: 'integer',
            nullable: false,
            comment: 'Number of messages in queue',
          },
          {
            name: 'consumers',
            type: 'integer',
            nullable: false,
            comment: 'Number of active consumers',
          },
        ],
        indexes: [],
        foreignKeys: [],
      };
    } catch (error: any) {
      // If queue doesn't exist, throw the error
      if (error.message && error.message.includes('NOT_FOUND')) {
        throw new Error(`Queue '${tableName}' does not exist`);
      }
      throw error;
    }
  }

  private async getQueues(): Promise<RabbitMQQueueInfo[]> {
    if (!this.channel) {
      throw new Error('Not connected to RabbitMQ');
    }

    // Note: amqplib doesn't provide a direct way to list all queues
    // This would typically require the RabbitMQ Management API
    // For now, we'll return an empty array and document that users
    // should use the Management API for full queue listing

    // Alternative: Use RabbitMQ Management HTTP API
    const managementApi = await this.getManagementApi();
    if (managementApi) {
      return managementApi.queues;
    }

    return [];
  }

  private async getExchanges(): Promise<RabbitMQExchangeInfo[]> {
    const managementApi = await this.getManagementApi();
    if (managementApi) {
      return managementApi.exchanges;
    }
    return [];
  }

  private async getBindings(): Promise<RabbitMQBindingInfo[]> {
    const managementApi = await this.getManagementApi();
    if (managementApi) {
      return managementApi.bindings;
    }
    return [];
  }

  private async getManagementApi(): Promise<{
    queues: RabbitMQQueueInfo[];
    exchanges: RabbitMQExchangeInfo[];
    bindings: RabbitMQBindingInfo[];
  } | null> {
    // Use RabbitMQ Management HTTP API
    const {
      host = 'localhost',
      managementPort = 15672, // Use dedicated management port
      user = 'guest',
      username,
      password = 'guest',
      vhost = '/',
    } = this.config;

    const actualUser = username || user;
    const encodedVhost = encodeURIComponent(vhost);
    const baseUrl = `http://${host}:${managementPort}/api`;

    try {
      const auth = Buffer.from(`${actualUser}:${password}`).toString('base64');
      const headers = { Authorization: `Basic ${auth}` };

      // Fetch queues
      const queuesResponse = await fetch(`${baseUrl}/queues/${encodedVhost}`, { headers });
      const queuesData = await queuesResponse.json() as any[];

      const queues: RabbitMQQueueInfo[] = queuesData.map((q) => ({
        name: q.name,
        durable: q.durable,
        autoDelete: q.auto_delete,
        exclusive: q.exclusive,
        messages: q.messages || 0,
        consumers: q.consumers || 0,
        arguments: q.arguments,
      }));

      // Fetch exchanges
      const exchangesResponse = await fetch(`${baseUrl}/exchanges/${encodedVhost}`, { headers });
      const exchangesData = await exchangesResponse.json() as any[];

      const exchanges: RabbitMQExchangeInfo[] = exchangesData
        .filter((e) => e.name !== '') // Skip default exchange
        .map((e) => ({
          name: e.name,
          type: e.type,
          durable: e.durable,
          autoDelete: e.auto_delete,
          internal: e.internal,
          arguments: e.arguments,
        }));

      // Fetch bindings
      const bindingsResponse = await fetch(`${baseUrl}/bindings/${encodedVhost}`, { headers });
      const bindingsData = await bindingsResponse.json() as any[];

      const bindings: RabbitMQBindingInfo[] = bindingsData.map((b) => ({
        source: b.source,
        destination: b.destination,
        destinationType: b.destination_type,
        routingKey: b.routing_key,
        arguments: b.arguments,
      }));

      return { queues, exchanges, bindings };
    } catch (error) {
      this.logError('Failed to fetch from RabbitMQ Management API', error);
      return null;
    }
  }
}

registerConnector('rabbitmq', RabbitMQConnector);
