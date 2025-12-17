import { Kafka, Admin } from 'kafkajs';
import { DatabaseConnector } from './base.js';
import { registerConnector } from './factory.js';
import type {
  SchemaInfo,
  TableInfo,
  TableDetails,
  KafkaTopicInfo,
} from '../types/schema.js';

export class KafkaConnector extends DatabaseConnector {
  private kafka: Kafka | null = null;
  private admin: Admin | null = null;

  async connect(): Promise<void> {
    try {
      const brokers = this.config.brokers || [
        `${this.config.host}:${this.config.port || 9092}`,
      ];

      this.kafka = new Kafka({
        clientId: this.config.clientId || 'database-schema-mcp',
        brokers,
      });

      this.admin = this.kafka.admin();
      await this.admin.connect();
      this.connected = true;
    } catch (error) {
      throw new Error(
        `Failed to connect to Kafka: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.admin) {
      await this.admin.disconnect();
      this.admin = null;
      this.kafka = null;
      this.connected = false;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      await this.disconnect();
      return true;
    } catch {
      return false;
    }
  }

  protected async getDatabaseVersion(): Promise<string | undefined> {
    // Get Kafka broker version from cluster metadata
    this.ensureConnected();

    try {
      const cluster = await this.admin!.describeCluster();
      // Try to extract version from broker information
      if (cluster.brokers && cluster.brokers.length > 0) {
        // KafkaJS doesn't directly expose broker version in describeCluster
        // We can infer from API versions, but for now return Kafka with controller info
        const controller = cluster.brokers.find(b => b.nodeId === cluster.controller);
        if (controller) {
          return `Kafka (Controller: ${controller.host}:${controller.port})`;
        }
        return `Kafka (${cluster.brokers.length} brokers)`;
      }
      return 'Kafka';
    } catch (error) {
      return 'Kafka';
    }
  }

  async getSchema(): Promise<SchemaInfo> {
    this.ensureConnected();

    const topics = await this.getAllTopicInfo();
    const version = await this.getDatabaseVersion();

    return {
      databaseType: 'kafka',
      databaseName: 'kafka-cluster',
      version,
      topics,
    };
  }

  async listTables(): Promise<TableInfo[]> {
    this.ensureConnected();

    const topics = await this.admin!.listTopics();

    return topics.map((topic) => ({
      name: topic,
      type: 'topic' as const,
    }));
  }

  async getTableDetails(tableName: string): Promise<TableDetails | null> {
    // For Kafka, we don't have a traditional table structure
    return null;
  }

  private async getAllTopicInfo(): Promise<KafkaTopicInfo[]> {
    const topics = await this.admin!.listTopics();
    const topicInfos: KafkaTopicInfo[] = [];

    // Fetch metadata for all topics
    const metadata = await this.admin!.fetchTopicMetadata({ topics });

    for (const topicMetadata of metadata.topics) {
      const config = await this.getTopicConfig(topicMetadata.name);

      // Calculate replication factor from first partition
      const replicationFactor =
        topicMetadata.partitions.length > 0
          ? topicMetadata.partitions[0].replicas.length
          : 0;

      topicInfos.push({
        name: topicMetadata.name,
        partitions: topicMetadata.partitions.length,
        replicationFactor,
        config,
      });
    }

    return topicInfos;
  }

  private async getTopicConfig(topicName: string): Promise<Record<string, string>> {
    try {
      const { resources } = await this.admin!.describeConfigs({
        resources: [
          {
            type: 2, // TOPIC
            name: topicName,
          },
        ],
        includeSynonyms: false,
      });

      const config: Record<string, string> = {};

      if (resources.length > 0) {
        for (const configEntry of resources[0].configEntries) {
          // Only include non-default, important configs
          if (!configEntry.isDefault && configEntry.configValue) {
            config[configEntry.configName] = configEntry.configValue;
          }
        }
      }

      return config;
    } catch (error) {
      // If config fetch fails, return empty object
      return {};
    }
  }
}

// Register this connector
registerConnector('kafka', KafkaConnector);
