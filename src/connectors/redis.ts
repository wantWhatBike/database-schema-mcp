import { default as Redis } from 'ioredis';
import { DatabaseConnector } from './base.js';
import { registerConnector } from './factory.js';
import type {
  SchemaInfo,
  TableInfo,
  TableDetails,
  RedisKeyPattern,
} from '../types/schema.js';

export class RedisConnector extends DatabaseConnector {
  private client: any = null;
  private maxKeys: number;
  private keyPattern: string;

  constructor(config: any) {
    super(config);
    this.maxKeys = config.maxKeys || 1000;
    this.keyPattern = config.keyPattern || '*';
  }

  async connect(): Promise<void> {
    try {
      // @ts-ignore - Redis constructor exists
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
    let iterations = 0;
    const MAX_ITERATIONS = 10000; // Safety limit to prevent infinite loops

    do {
      if (iterations++ > MAX_ITERATIONS) {
        console.warn(`Redis SCAN reached maximum iterations (${MAX_ITERATIONS}), stopping scan`);
        break;
      }

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
    //   "user:1:name" -> "user:*"
    //   "session:abc:data" -> "session:*"
    //   "cache_product_456" -> "cache_product_*"
    //   "user123" -> "user*" (number suffix)

    // Pattern 1: Keys with common separators (: _ - .)
    const separators = [':', '_', '-', '.'];
    for (const sep of separators) {
      if (key.includes(sep)) {
        const parts = key.split(sep);
        let foundId = false;

        // Replace numeric or UUID-like parts with *, and once we find an ID,
        // replace everything after it with *
        const patternParts: string[] = [];

        for (let index = 0; index < parts.length; index++) {
          const part = parts[index];

          if (foundId) {
            // Once we found an ID, replace all subsequent parts with *
            // and don't add more parts
            break;
          }

          // Check if this part looks like an ID
          const isNumeric = /^[0-9]+$/.test(part);
          const isHexId = /^[0-9a-f]{6,}$/i.test(part);
          const isLongAlphanumeric = /^[0-9a-z]{10,}$/i.test(part);
          const hasNumberSuffix = /\d+$/.test(part) && part.length > 2; // e.g., game1, page1, post1

          // Don't treat the first part as ID to ensure we have a meaningful prefix
          if ((isNumeric || isHexId || isLongAlphanumeric || hasNumberSuffix) && index > 0) {
            patternParts.push('*');
            foundId = true;
          } else {
            patternParts.push(part);
          }
        }

        const pattern = patternParts.join(sep);
        // Only return pattern if it's different from original (we found an ID)
        if (pattern !== key && patternParts.includes('*')) {
          return pattern;
        }
      }
    }

    // Pattern 2: Keys with number suffix (no separator)
    // e.g., "user123", "cache456"
    const numberSuffixMatch = key.match(/^([a-z_]+)(\d+)$/i);
    if (numberSuffixMatch) {
      return numberSuffixMatch[1] + '*';
    }

    // Pattern 3: Keys with UUID-like patterns (no separator)
    // e.g., "keyabc123def456"
    if (/[a-z]+[0-9a-f]{16,}/i.test(key)) {
      // Has long hex sequence
      return key.replace(/[0-9a-f]{8,}/gi, '*');
    }

    // Pattern 4: If no pattern detected, group by prefix
    // Take first 3-5 characters as prefix
    if (key.length > 5) {
      const prefix = key.substring(0, Math.min(5, Math.floor(key.length / 2)));
      return prefix + '*';
    }

    // Fallback: return the key itself
    return key;
  }
}

// Register this connector
registerConnector('redis', RedisConnector);
