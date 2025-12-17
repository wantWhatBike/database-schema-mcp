import { DatabaseConnector } from './base.js';
import { registerConnector } from './factory.js';
import type {
  MemcachedConfig,
  SchemaInfo,
  TableInfo,
  TableDetails,
  MemcachedKeyPattern,
} from '../types/schema.js';
import Memcached from 'memcached';

export class MemcachedConnector extends DatabaseConnector {
  private client: Memcached | null = null;

  constructor(config: MemcachedConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    const {
      servers = ['localhost:11211'],
      host,
      port = 11211,
    } = this.config;

    // Build server list
    const serverList = servers.length > 0 ? servers : host ? [`${host}:${port}`] : ['localhost:11211'];

    this.client = new Memcached(serverList, {
      timeout: 5000,
      retries: 2,
    });

    // Test connection by getting version
    const connected = await new Promise<boolean>((resolve) => {
      if (!this.client) {
        resolve(false);
        return;
      }
      this.client.version((err, result) => {
        resolve(!err && !!result);
      });
    });

    if (!connected) {
      throw new Error('Failed to connect to Memcached');
    }

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.end();
      this.client = null;
      this.connected = false;
    }
  }

  async getSchema(): Promise<SchemaInfo> {
    if (!this.client) {
      throw new Error('Not connected to Memcached');
    }

    const keyPatterns = await this.analyzeKeyPatterns();

    return {
      databaseType: 'memcached',
      databaseName: 'memcached',
      memcachedKeyPatterns: keyPatterns,
      memcachedTotalKeys: keyPatterns.reduce((sum, pattern) => sum + pattern.count, 0),
    };
  }

  async listTables(): Promise<TableInfo[]> {
    const patterns = await this.analyzeKeyPatterns();

    return patterns.map((pattern) => ({
      name: pattern.pattern,
      type: 'collection' as const,
      rowCount: pattern.count,
    }));
  }

  async getTableDetails(tableName: string): Promise<TableDetails | null> {
    if (!this.client) {
      throw new Error('Not connected to Memcached');
    }

    try {
      // Get keys matching this pattern
      const stats = await this.getStats();
      const totalItems = stats.curr_items || 0;

      return {
        name: tableName,
        type: 'collection' as const,
        rowCount: totalItems,
        columns: [
          {
            name: 'key',
            type: 'string',
            nullable: false,
            comment: 'Cache key',
          },
          {
            name: 'value',
            type: 'string',
            nullable: true,
            comment: 'Cached value',
          },
          {
            name: 'expiration',
            type: 'integer',
            nullable: true,
            comment: 'Expiration timestamp',
          },
        ],
        indexes: [],
        foreignKeys: [],
      };
    } catch (error) {
      return null;
    }
  }

  async searchColumns(columnName: string): Promise<string[]> {
    // Not applicable for Memcached
    return [];
  }

  async testConnection(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.client) {
        resolve(false);
        return;
      }

      this.client.version((err, result) => {
        if (err) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  protected async getDatabaseVersion(): Promise<string | undefined> {
    return new Promise((resolve) => {
      if (!this.client) {
        resolve(undefined);
        return;
      }

      this.client.version((err, result) => {
        if (err || !result) {
          resolve(undefined);
        } else {
          // result is an array of version strings from each server
          const firstVersion = result[0];
          resolve(firstVersion ? String(firstVersion) : undefined);
        }
      });
    });
  }

  private async getStats(): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('Not connected to Memcached'));
        return;
      }

      this.client.stats((err, stats) => {
        if (err) {
          reject(err);
        } else {
          // stats is an array of server stats
          const firstServer = stats[0];
          resolve(firstServer || {});
        }
      });
    });
  }

  private async analyzeKeyPatterns(): Promise<MemcachedKeyPattern[]> {
    if (!this.client) {
      return [];
    }

    try {
      // Memcached doesn't have a built-in way to list all keys
      // We can only get stats about the cache
      // This is a limitation of Memcached protocol

      const stats = await this.getStats();
      const totalItems = stats.curr_items || 0;

      // Since we can't enumerate keys in Memcached, we return a general pattern
      return [
        {
          pattern: '*',
          count: totalItems,
          sampleKeys: [],
          exampleValue: 'N/A (Memcached does not support key enumeration)',
        },
      ];
    } catch (error) {
      console.error('Error analyzing Memcached keys:', error);
      return [];
    }
  }

  private async getItem(key: string): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.client) {
        resolve(null);
        return;
      }

      this.client.get(key, (err, data) => {
        if (err || !data) {
          resolve(null);
        } else {
          resolve(String(data));
        }
      });
    });
  }
}

registerConnector('memcached', MemcachedConnector);
