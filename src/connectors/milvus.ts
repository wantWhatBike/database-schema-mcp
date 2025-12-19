import { DatabaseConnector } from './base.js';
import { registerConnector } from './factory.js';
import type {
  MilvusConfig,
  SchemaInfo,
  TableInfo,
  TableDetails,
  MilvusCollectionInfo,
  MilvusFieldInfo,
  MilvusIndexInfo,
  ColumnInfo,
} from '../types/schema.js';
import { MilvusClient, DataType } from '@zilliz/milvus2-sdk-node';

export class MilvusConnector extends DatabaseConnector {
  private client: MilvusClient | null = null;

  constructor(config: MilvusConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    const {
      address = 'localhost:19530',
      host,
      port = 19530,
      username,
      user,
      password,
      token,
      secure = false,
    } = this.config;

    const actualAddress = address || (host ? `${host}:${port}` : 'localhost:19530');

    // Build authentication
    let auth: any = undefined;
    if (token) {
      auth = { token };
    } else if (username || user) {
      auth = {
        username: username || user,
        password: password || '',
      };
    }

    this.client = new MilvusClient({
      address: actualAddress,
      ssl: secure,
      username: auth?.username,
      password: auth?.password,
      token: auth?.token,
    });

    // Test connection
    await this.client.checkHealth();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      // MilvusClient doesn't have a close method
      this.client = null;
      this.connected = false;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.client) {
        return false;
      }
      const result = await this.client.checkHealth();
      return result.isHealthy;
    } catch {
      return false;
    }
  }

  protected async getDatabaseVersion(): Promise<string | undefined> {
    try {
      if (!this.client) {
        return undefined;
      }
      const version = await this.client.getVersion();
      return version.version;
    } catch {
      return undefined;
    }
  }

  async getSchema(): Promise<SchemaInfo> {
    if (!this.client) {
      throw new Error('Not connected to Milvus');
    }

    const collections = await this.getCollections();

    return {
      databaseType: 'milvus',
      databaseName: 'milvus',
      milvusCollections: collections,
    };
  }

  async listTables(): Promise<TableInfo[]> {
    if (!this.client) {
      throw new Error('Not connected to Milvus');
    }

    const { collectionNames } = this.config;

    // Get all collections or specific ones
    let collections: string[];
    if (collectionNames && collectionNames.length > 0) {
      collections = collectionNames;
    } else {
      const result: any = await this.client.listCollections();
      collections = result.data?.collection_names || result.collection_names || [];
    }

    const tables: TableInfo[] = [];

    for (const collName of collections) {
      try {
        const stats = await this.client.getCollectionStatistics({
          collection_name: collName,
        });

        const rowCount = parseInt(stats.data.row_count || '0', 10);

        tables.push({
          name: collName,
          type: 'collection' as const,
          rowCount,
        });
      } catch (error) {
        this.logError(`Error getting stats for collection ${collName}`, error);
      }
    }

    return tables;
  }

  async getTableDetails(tableName: string): Promise<TableDetails | null> {
    if (!this.client) {
      throw new Error('Not connected to Milvus');
    }

    try {
      // Get collection schema
      const describeResult = await this.client.describeCollection({
        collection_name: tableName,
      });

      const fields = describeResult.schema?.fields || [];

      const columns: ColumnInfo[] = fields.map((field: any) => {
        const typeName = this.getDataTypeName(field.data_type);
        const dimension = field.type_params?.dim;

        return {
          name: field.name,
          type: dimension ? `${typeName}(${dimension})` : typeName,
          nullable: !field.is_primary_key,
          isPrimaryKey: field.is_primary_key,
          isAutoIncrement: field.autoID,
          comment: field.description,
        };
      });

      return {
        name: tableName,
        type: 'collection' as const,
        comment: describeResult.schema?.description,
        columns,
        indexes: [],
        foreignKeys: [],
      };
    } catch (error) {
      this.logError(`Error getting details for collection ${tableName}`, error);
      return null;
    }
  }

  private async getCollections(): Promise<MilvusCollectionInfo[]> {
    if (!this.client) {
      return [];
    }

    const tables = await this.listTables();
    const collections: MilvusCollectionInfo[] = [];

    for (const table of tables) {
      try {
        const describeResult = await this.client.describeCollection({
          collection_name: table.name,
        });

        const schema = describeResult.schema;
        const fields: MilvusFieldInfo[] = (schema?.fields || []).map((field: any) => ({
          name: field.name,
          fieldId: field.fieldID,
          type: this.getDataTypeName(field.data_type),
          isPrimary: field.is_primary_key,
          autoId: field.autoID,
          description: field.description,
          dimension: field.type_params?.dim
            ? parseInt(field.type_params.dim, 10)
            : undefined,
        }));

        // Get indexes
        const indexResult = await this.client.describeIndex({
          collection_name: table.name,
        });

        const indexes: MilvusIndexInfo[] = [];
        if (indexResult.index_descriptions) {
          for (const indexDesc of indexResult.index_descriptions) {
            const params = indexDesc.params as any;
            indexes.push({
              fieldName: indexDesc.field_name,
              indexName: indexDesc.index_name,
              indexType: params?.index_type || 'unknown',
              metric: params?.metric_type || 'unknown',
              params: indexDesc.params,
            });
          }
        }

        collections.push({
          name: table.name,
          description: schema?.description,
          numEntities: table.rowCount || 0,
          schema: {
            fields,
            description: schema?.description,
          },
          indexes,
          shardsNum: describeResult.shards_num,
        });
      } catch (error) {
        this.logError(`Error getting collection info for ${table.name}`, error);
      }
    }

    return collections;
  }

  private getDataTypeName(dataType: DataType | number): string {
    const typeMap: Record<number, string> = {
      [DataType.None]: 'None',
      [DataType.Bool]: 'Bool',
      [DataType.Int8]: 'Int8',
      [DataType.Int16]: 'Int16',
      [DataType.Int32]: 'Int32',
      [DataType.Int64]: 'Int64',
      [DataType.Float]: 'Float',
      [DataType.Double]: 'Double',
      [DataType.VarChar]: 'VarChar',
      [DataType.Array]: 'Array',
      [DataType.JSON]: 'JSON',
      [DataType.FloatVector]: 'FloatVector',
      [DataType.BinaryVector]: 'BinaryVector',
      [DataType.Float16Vector]: 'Float16Vector',
      [DataType.BFloat16Vector]: 'BFloat16Vector',
      [DataType.SparseFloatVector]: 'SparseFloatVector',
    };

    return typeMap[dataType as number] || `Unknown(${dataType})`;
  }
}

registerConnector('milvus', MilvusConnector);
