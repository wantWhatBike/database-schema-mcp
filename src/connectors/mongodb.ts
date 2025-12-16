import { MongoClient, Db } from 'mongodb';
import { DatabaseConnector } from './base.js';
import { registerConnector } from './factory.js';
import type {
  SchemaInfo,
  TableInfo,
  TableDetails,
  MongoCollectionDetails,
  MongoFieldInfo,
} from '../types/schema.js';

export class MongoDBConnector extends DatabaseConnector {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private sampleSize: number;

  constructor(config: any) {
    super(config);
    this.sampleSize = config.sampleSize || 1000;
  }

  async connect(): Promise<void> {
    try {
      const uri = this.config.uri || this.config.connectionString ||
        `mongodb://${this.config.host}:${this.config.port || 27017}`;

      this.client = new MongoClient(uri);
      await this.client.connect();
      this.db = this.client.db(this.config.database);
      this.connected = true;
    } catch (error) {
      throw new Error(
        `Failed to connect to MongoDB: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
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
    this.ensureConnected();
    const serverInfo = await this.db!.admin().serverInfo();
    return `MongoDB ${serverInfo.version}`;
  }

  async getSchema(): Promise<SchemaInfo> {
    this.ensureConnected();

    const collections = await this.getAllCollectionDetails();
    const version = await this.getDatabaseVersion();

    return {
      databaseType: 'mongodb',
      databaseName: this.config.database!,
      version,
      collections,
    };
  }

  async listTables(): Promise<TableInfo[]> {
    this.ensureConnected();

    const collections = await this.db!.listCollections().toArray();

    return collections.map((coll) => ({
      name: coll.name,
      type: 'collection' as const,
    }));
  }

  async getTableDetails(tableName: string): Promise<TableDetails | null> {
    this.ensureConnected();

    const collectionExists = await this.db!
      .listCollections({ name: tableName })
      .hasNext();

    if (!collectionExists) {
      return null;
    }

    const details = await this.getCollectionDetails(tableName);

    // Convert MongoDB collection details to TableDetails format
    return {
      name: tableName,
      type: 'collection',
      columns: [],
      indexes: [],
      foreignKeys: [],
      rowCount: details.documentCount,
    };
  }

  private async getCollectionDetails(
    collectionName: string
  ): Promise<MongoCollectionDetails> {
    const collection = this.db!.collection(collectionName);

    // Get document count
    const documentCount = await collection.countDocuments();

    // Sample documents to infer schema
    const sampleDocs = await collection
      .aggregate([{ $sample: { size: Math.min(this.sampleSize, documentCount) } }])
      .toArray();

    // Infer fields
    const fields = this.inferFields(sampleDocs);

    // Get indexes
    const indexes = await collection.indexes();
    const formattedIndexes = indexes.map((idx) => ({
      name: idx.name || '',
      keys: idx.key as Record<string, number>,
      unique: idx.unique || false,
    }));

    return {
      name: collectionName,
      documentCount,
      sampleSize: sampleDocs.length,
      fields,
      indexes: formattedIndexes,
    };
  }

  private inferFields(documents: any[]): MongoFieldInfo[] {
    if (documents.length === 0) {
      return [];
    }

    const fieldStats = new Map<
      string,
      { types: Map<string, number>; occurrences: number }
    >();

    // Analyze each document
    for (const doc of documents) {
      const fields = this.flattenDocument(doc);

      for (const [fieldName, value] of Object.entries(fields)) {
        if (!fieldStats.has(fieldName)) {
          fieldStats.set(fieldName, {
            types: new Map(),
            occurrences: 0,
          });
        }

        const stats = fieldStats.get(fieldName)!;
        stats.occurrences++;

        const type = this.getValueType(value);
        const currentCount = stats.types.get(type) || 0;
        stats.types.set(type, currentCount + 1);
      }
    }

    // Convert stats to MongoFieldInfo
    const totalDocs = documents.length;
    const result: MongoFieldInfo[] = [];

    for (const [fieldName, stats] of fieldStats.entries()) {
      const types = Array.from(stats.types.entries()).map(([type, count]) => ({
        type,
        percentage: Math.round((count / stats.occurrences) * 100),
      }));

      // Sort by percentage descending
      types.sort((a, b) => b.percentage - a.percentage);

      result.push({
        name: fieldName,
        types,
        occurrence: Math.round((stats.occurrences / totalDocs) * 100),
      });
    }

    // Sort by field name
    result.sort((a, b) => a.name.localeCompare(b.name));

    return result;
  }

  private flattenDocument(
    obj: any,
    prefix: string = ''
  ): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      const fieldName = prefix ? `${prefix}.${key}` : key;

      if (value === null || value === undefined) {
        result[fieldName] = value;
      } else if (Array.isArray(value)) {
        result[fieldName] = value;
        // Optionally analyze array elements
      } else if (typeof value === 'object' && !(value instanceof Date)) {
        // Flatten nested objects
        Object.assign(result, this.flattenDocument(value, fieldName));
      } else {
        result[fieldName] = value;
      }
    }

    return result;
  }

  private getValueType(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    if (value instanceof Date) return 'date';
    if (typeof value === 'object') {
      // Check for MongoDB specific types
      if (value._bsontype === 'ObjectId') return 'ObjectId';
      return 'object';
    }
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'number' : 'double';
    }
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'string') return 'string';
    return 'unknown';
  }

  private async getAllCollectionDetails(): Promise<MongoCollectionDetails[]> {
    const tables = await this.listTables();
    const details: MongoCollectionDetails[] = [];

    for (const table of tables) {
      const detail = await this.getCollectionDetails(table.name);
      details.push(detail);
    }

    return details;
  }
}

// Register this connector
registerConnector('mongodb', MongoDBConnector);
