import Redis from 'ioredis';
import { DatabaseConnector } from './base.js';
import { registerConnector } from './factory.js';
import type {
  SchemaInfo,
  TableInfo,
  TableDetails,
  RedisKeyPattern,
} from '../types/schema.js';

export class RedisConnector extends DatabaseConnector {
  private client: Redis | null = null;
  private maxKeys: number;
  private keyPattern: string;

  constructor(config: any) {
    super(config);
    this.maxKeys = config.maxKeys || 1000;
    this.keyPattern = config.keyPattern || '*';
  }

  async connect(): Promise<void> {
    try {
      this.client = new Redis({
        host: this.config.host || 'localhost',
        port: this.config.port || 6379,
        password: this.config.password,
        db: this.config.db || 0,
      });

      // Test connection
      await this.client.ping();
      this.connected = true;
    } catch (error) {
      throw new Error(
        `Failed to connect to Redis at ${this.config.host}:${this.config.port}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
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

  protected async getDatabaseVersion(): Promise<string | undefined> {
    this.ensureConnected();
    const info = await this.client!.info('server');
    const match = info.match(/redis_version:([^\r\n]+)/);
    return match ? `Redis ${match[1]}` : undefined;
  }

  async getSchema(): Promise<SchemaInfo> {
    this.ensureConnected();

    const [keyPatterns, totalKeys, version] = await Promise.all([
      this.analyzeKeyPatterns(),
      this.getTotalKeys(),
      this.getDatabaseVersion(),
    ]);

    return {
      databaseType: 'redis',
      databaseName: `db${this.config.db || 0}`,
      version,
      keyPatterns,
      totalKeys,
    };
  }

  async listTables(): Promise<TableInfo[]> {
    this.ensureConnected();

    const patterns = await this.analyzeKeyPatterns();

    return patterns.map((pattern) => ({
      name: pattern.pattern,
      type: 'collection' as const,
      rowCount: pattern.count,
    }));
  }

  async getTableDetails(tableName: string): Promise<TableDetails | null> {
    // For Redis, "table" is a key pattern
    // Not applicable for detailed table structure
    return null;
  }

  private async getTotalKeys(): Promise<number> {
    const dbsize = await this.client!.dbsize();
    return dbsize;
  }

  private async analyzeKeyPatterns(): Promise<RedisKeyPattern[]> {
    const keys = await this.scanKeys(this.keyPattern, this.maxKeys);

    // Group keys by pattern (e.g., "user:*", "session:*")
    const patternMap = new Map<string, { keys: string[]; types: Map<string, number> }>();

    for (const key of keys) {
      const pattern = this.extractPattern(key);

      if (!patternMap.has(pattern)) {
        patternMap.set(pattern, {
          keys: [],
          types: new Map(),
        });
      }

      const data = patternMap.get(pattern)!;
      data.keys.push(key);

      // Get key type
      const type = await this.client!.type(key);
      const currentCount = data.types.get(type) || 0;
      data.types.set(type, currentCount + 1);
    }

    // Convert to RedisKeyPattern array
    const result: RedisKeyPattern[] = [];

    for (const [pattern, data] of patternMap.entries()) {
      const types: Record<string, number> = {};
      for (const [type, count] of data.types.entries()) {
        types[type] = count;
      }

      result.push({
        pattern,
        count: data.keys.length,
        sampleKeys: data.keys.slice(0, 10), // First 10 keys as samples
        types,
      });
    }

    // Sort by count descending
    result.sort((a, b) => b.count - a.count);

    return result;
  }

  private async scanKeys(pattern: string, maxKeys: number): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, foundKeys] = await this.client!.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );

      keys.push(...foundKeys);
      cursor = nextCursor;

      // Stop if we've collected enough keys
      if (keys.length >= maxKeys) {
        break;
      }
    } while (cursor !== '0');

    return keys.slice(0, maxKeys);
  }

  private extractPattern(key: string): string {
    // Extract pattern from key
    // Examples:
    //   "user:123" -> "user:*"
    //   "session:abc:data" -> "session:*"
    //   "cache_product_456" -> "cache_product_*"

    // Split by common separators
    const separators = [':', '_', '-', '.'];
    for (const sep of separators) {
      if (key.includes(sep)) {
        const parts = key.split(sep);
        // Replace last part (usually an ID) with *
        if (parts.length > 1) {
          // Check if last part looks like an ID (number, UUID, etc.)
          const lastPart = parts[parts.length - 1];
          if (/^[0-9a-f-]+$/i.test(lastPart) || /^\d+$/.test(lastPart)) {
            parts[parts.length - 1] = '*';
            return parts.join(sep);
          }
        }
      }
    }

    // If no pattern found, return the key itself
    return key;
  }
}

// Register this connector
registerConnector('redis', RedisConnector);
