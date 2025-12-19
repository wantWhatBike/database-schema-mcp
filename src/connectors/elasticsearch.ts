import { DatabaseConnector } from './base.js';
import { registerConnector } from './factory.js';
import type {
  ElasticsearchConfig,
  SchemaInfo,
  TableInfo,
  TableDetails,
  ElasticsearchIndexInfo,
  ElasticsearchFieldInfo,
  ColumnInfo,
} from '../types/schema.js';
import { Client } from '@elastic/elasticsearch';

export class ElasticsearchConnector extends DatabaseConnector {
  private client: Client | null = null;

  constructor(config: ElasticsearchConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    const {
      node,
      nodes,
      cloudId,
      auth,
      apiKey,
      username,
      password,
      ssl,
      sslCA,
      sslCert,
      sslKey,
      maxRetries = 3,
      requestTimeout = 30000,
    } = this.config;

    // Determine authentication
    let authConfig: any = undefined;
    if (apiKey || auth?.apiKey) {
      authConfig = { apiKey: apiKey || auth?.apiKey };
    } else if (auth?.username && auth?.password) {
      authConfig = { username: auth.username, password: auth.password };
    } else if (username && password) {
      authConfig = { username, password };
    }

    // Determine nodes
    const nodeList = nodes || (node ? [node] : undefined);

    // SSL configuration
    const sslConfig = ssl
      ? {
          ca: sslCA,
          cert: sslCert,
          key: sslKey,
          rejectUnauthorized: true,
        }
      : undefined;

    this.client = new Client({
      node: nodeList,
      cloud: cloudId ? { id: cloudId } : undefined,
      auth: authConfig,
      tls: sslConfig,
      maxRetries,
      requestTimeout,
    });

    // Test connection
    await this.client.ping();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
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

  async getSchema(): Promise<SchemaInfo> {
    if (!this.client) {
      throw new Error('Not connected to Elasticsearch');
    }

    // Get cluster health
    const health = await this.client.cluster.health();
    const clusterHealth = health.status;

    // Get all indices
    const indices = await this.getIndices();

    return {
      databaseType: 'elasticsearch',
      databaseName: health.cluster_name,
      version: await this.getDatabaseVersion(),
      indices,
      clusterHealth,
    };
  }

  async listTables(): Promise<TableInfo[]> {
    if (!this.client) {
      throw new Error('Not connected to Elasticsearch');
    }

    const catIndices = await this.client.cat.indices({ format: 'json' });
    const indices = catIndices as any[];

    return indices.map((index) => ({
      name: index.index,
      type: 'table' as const,
      rowCount: parseInt(index['docs.count'] || '0', 10),
      comment: `Health: ${index.health}, Status: ${index.status}`,
    }));
  }

  async getTableDetails(tableName: string): Promise<TableDetails | null> {
    if (!this.client) {
      throw new Error('Not connected to Elasticsearch');
    }

    try {
      // Get index mapping
      const mapping = await this.client.indices.getMapping({ index: tableName });
      const indexMapping = mapping[tableName];

      if (!indexMapping) {
        return null;
      }

      // Get index stats
      const stats = await this.client.indices.stats({ index: tableName });
      const indexStats = stats.indices?.[tableName];

      // Extract fields from mapping
      const properties = indexMapping.mappings?.properties || {};
      const columns = this.extractFields(properties);

      // Get index settings
      const settings = await this.client.indices.getSettings({ index: tableName });
      const indexSettings = settings[tableName]?.settings;

      return {
        name: tableName,
        type: 'table' as const,
        rowCount: indexStats?.total?.docs?.count || 0,
        columns,
        indexes: [],
        foreignKeys: [],
        comment: `Shards: ${indexSettings?.index?.number_of_shards}, Replicas: ${indexSettings?.index?.number_of_replicas}`,
      };
    } catch (error) {
      this.logError(`Error getting details for index ${tableName}`, error);
      return null;
    }
  }

  protected async getDatabaseVersion(): Promise<string | undefined> {
    if (!this.client) {
      return undefined;
    }

    try {
      const info = await this.client.info();
      return info.version?.number;
    } catch {
      return undefined;
    }
  }

  private async getIndices(): Promise<ElasticsearchIndexInfo[]> {
    if (!this.client) {
      return [];
    }

    const catIndices = await this.client.cat.indices({ format: 'json' });
    const indices = catIndices as any[];

    const indexInfoList: ElasticsearchIndexInfo[] = [];

    for (const index of indices) {
      try {
        const indexName = index.index;

        // Get mappings
        const mapping = await this.client.indices.getMapping({ index: indexName });
        const indexMapping = mapping[indexName];

        // Get settings
        const settings = await this.client.indices.getSettings({ index: indexName });
        const indexSettings = settings[indexName]?.settings;

        indexInfoList.push({
          name: indexName,
          health: index.health,
          status: index.status,
          docsCount: parseInt(index['docs.count'] || '0', 10),
          docsDeleted: parseInt(index['docs.deleted'] || '0', 10),
          storeSize: index['store.size'] || '0b',
          primaryShards: parseInt(index.pri || '0', 10),
          replicaShards: parseInt(index.rep || '0', 10),
          mappings: indexMapping?.mappings,
          settings: indexSettings,
        });
      } catch (error) {
        this.logError(`Error getting info for index ${index.index}`, error);
      }
    }

    return indexInfoList;
  }

  private extractFields(properties: Record<string, any>, prefix = ''): ColumnInfo[] {
    const columns: ColumnInfo[] = [];

    for (const [fieldName, fieldDef] of Object.entries(properties)) {
      const fullName = prefix ? `${prefix}.${fieldName}` : fieldName;

      columns.push({
        name: fullName,
        type: fieldDef.type || 'object',
        nullable: true, // ES fields are typically nullable
        comment: fieldDef.analyzer ? `Analyzer: ${fieldDef.analyzer}` : undefined,
      });

      // Recursively extract nested fields
      if (fieldDef.properties) {
        const nestedFields = this.extractFields(fieldDef.properties, fullName);
        columns.push(...nestedFields);
      }

      // Handle multi-fields
      if (fieldDef.fields) {
        for (const [subFieldName, subFieldDef] of Object.entries(fieldDef.fields)) {
          columns.push({
            name: `${fullName}.${subFieldName}`,
            type: (subFieldDef as any).type || 'unknown',
            nullable: true,
          });
        }
      }
    }

    return columns;
  }
}

registerConnector('elasticsearch', ElasticsearchConnector);
