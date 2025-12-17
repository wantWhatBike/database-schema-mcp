import { DatabaseConnector } from './base.js';
import { registerConnector } from './factory.js';
import type {
  EtcdConfig,
  SchemaInfo,
  TableInfo,
  TableDetails,
  EtcdKeyPattern,
} from '../types/schema.js';
import { Etcd3 } from 'etcd3';

export class EtcdConnector extends DatabaseConnector {
  private client: Etcd3 | null = null;

  constructor(config: EtcdConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    const {
      hosts = ['localhost:2379'],
      host,
      port = 2379,
      username,
      user,
      password,
      credentials,
      dialTimeout = 5000,
    } = this.config;

    // Build connection options
    const options: any = {
      hosts: hosts.length > 0 ? hosts : host ? [`${host}:${port}`] : ['localhost:2379'],
      dialTimeout,
    };

    // Add authentication if provided
    if (username || user) {
      options.auth = {
        username: username || user,
        password: password || '',
      };
    }

    // Add TLS credentials if provided
    if (credentials) {
      options.credentials = {
        rootCertificate: credentials.rootCertificate
          ? Buffer.from(credentials.rootCertificate)
          : undefined,
        privateKey: credentials.privateKey ? Buffer.from(credentials.privateKey) : undefined,
        certChain: credentials.certChain ? Buffer.from(credentials.certChain) : undefined,
      };
    }

    this.client = new Etcd3(options);

    // Test connection
    try {
      await this.client.get('').string();
    } catch (error: any) {
      // Connection test - ignore if key doesn't exist
      if (!error.message?.includes('key not found')) {
        throw error;
      }
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.client = null;
      this.connected = false;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.client) {
        return false;
      }
      await this.client.get('').string();
      return true;
    } catch (error: any) {
      // Connection test - if we can connect but key doesn't exist, that's still a success
      if (error.message?.includes('key not found') || error.message?.includes('not found')) {
        return true;
      }
      return false;
    }
  }

  protected async getDatabaseVersion(): Promise<string | undefined> {
    try {
      if (!this.client) {
        return undefined;
      }
      // etcd3 client doesn't have a direct version method
      // We could try to get server version from endpoints
      return undefined;
    } catch {
      return undefined;
    }
  }

  async getSchema(): Promise<SchemaInfo> {
    if (!this.client) {
      throw new Error('Not connected to etcd');
    }

    const keyPatterns = await this.analyzeKeyPatterns();

    return {
      databaseType: 'etcd',
      databaseName: 'etcd-cluster',
      etcdKeyPatterns: keyPatterns,
      etcdTotalKeys: keyPatterns.reduce((sum, pattern) => sum + pattern.count, 0),
    };
  }

  async listTables(): Promise<TableInfo[]> {
    const patterns = await this.analyzeKeyPatterns();

    return patterns.map((pattern) => ({
      name: pattern.prefix,
      type: 'collection' as const,
      rowCount: pattern.count,
      comment: `Depth: ${pattern.depth}`,
    }));
  }

  async getTableDetails(tableName: string): Promise<TableDetails | null> {
    if (!this.client) {
      throw new Error('Not connected to etcd');
    }

    try {
      // Get keys with this prefix
      const keys = await this.client.getAll().prefix(tableName).keys();

      return {
        name: tableName,
        type: 'collection' as const,
        rowCount: keys.length,
        columns: [
          {
            name: 'key',
            type: 'string',
            nullable: false,
            comment: 'etcd key',
          },
          {
            name: 'value',
            type: 'string',
            nullable: true,
            comment: 'etcd value',
          },
          {
            name: 'version',
            type: 'integer',
            nullable: false,
            comment: 'Key version',
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
    // Not applicable for etcd
    return [];
  }

  private async analyzeKeyPatterns(): Promise<EtcdKeyPattern[]> {
    if (!this.client) {
      return [];
    }

    const { prefix = '', maxKeysToScan = 1000 } = this.config;

    try {
      // Get all keys with the specified prefix
      const allKeys = await this.client.getAll().prefix(prefix).limit(maxKeysToScan).keys();

      // Group keys by prefix patterns
      const patternMap = new Map<string, string[]>();

      for (const key of allKeys) {
        const parts = key.split('/').filter((p) => p.length > 0);

        // Generate prefixes at different depths
        for (let depth = 1; depth <= parts.length; depth++) {
          const prefix = '/' + parts.slice(0, depth).join('/') + '/';

          if (!patternMap.has(prefix)) {
            patternMap.set(prefix, []);
          }

          patternMap.get(prefix)!.push(key);
        }
      }

      // Convert to EtcdKeyPattern array
      const patterns: EtcdKeyPattern[] = [];

      for (const [prefix, keys] of patternMap.entries()) {
        // Only include prefixes that have direct children
        const uniqueKeys = [...new Set(keys)];

        if (uniqueKeys.length > 0) {
          const depth = (prefix.match(/\//g) || []).length - 1;

          patterns.push({
            prefix,
            count: uniqueKeys.length,
            sampleKeys: uniqueKeys.slice(0, 5),
            depth,
          });
        }
      }

      // Sort by depth and then by count
      patterns.sort((a, b) => {
        if (a.depth !== b.depth) {
          return a.depth - b.depth;
        }
        return b.count - a.count;
      });

      // Deduplicate - keep only meaningful prefixes
      const meaningfulPatterns = patterns.filter((pattern, index) => {
        // Keep root level patterns
        if (pattern.depth === 1) return true;

        // Keep if it has a significant number of keys
        if (pattern.count >= 2) return true;

        return false;
      });

      return meaningfulPatterns.slice(0, 50); // Limit to top 50 patterns
    } catch (error) {
      this.logError('Error analyzing etcd key patterns', error);
      return [];
    }
  }
}

registerConnector('etcd', EtcdConnector);
