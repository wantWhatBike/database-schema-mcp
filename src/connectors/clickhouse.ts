import { DatabaseConnector } from './base.js';
import { registerConnector } from './factory.js';
import type {
  ClickHouseConfig,
  SchemaInfo,
  TableInfo,
  TableDetails,
  ClickHouseTableInfo,
  ColumnInfo,
  IndexInfo,
  ViewInfo,
} from '../types/schema.js';
import { createClient, ClickHouseClient } from '@clickhouse/client';

export class ClickHouseConnector extends DatabaseConnector {
  private client: ClickHouseClient | null = null;

  constructor(config: ClickHouseConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    const {
      host = 'localhost',
      port = 8123,
      database = 'default',
      username,
      user,
      password,
      url,
      clickhouseSettings,
      compression = true,
    } = this.config;

    const actualUser = username || user || 'default';

    this.client = createClient({
      host: url || `http://${host}:${port}`,
      username: actualUser,
      password: password || '',
      database,
      clickhouse_settings: clickhouseSettings,
      compression: compression ? { request: true, response: true } : undefined,
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
      if (!this.client) {
        return false;
      }
      const result = await this.client.ping();
      return result.success;
    } catch {
      return false;
    }
  }

  async getSchema(): Promise<SchemaInfo> {
    if (!this.client) {
      throw new Error('Not connected to ClickHouse');
    }

    const database = this.config.database || 'default';

    // Get tables
    const tables = await this.getTables();

    // Get views
    const views = await this.getViews();

    return {
      databaseType: 'clickhouse',
      databaseName: database,
      version: await this.getDatabaseVersion(),
      tables,
      views,
      clickhouseTables: await this.getClickHouseTables(),
    };
  }

  async listTables(): Promise<TableInfo[]> {
    if (!this.client) {
      throw new Error('Not connected to ClickHouse');
    }

    const database = this.config.database || 'default';

    const result = await this.client.query({
      query: `
        SELECT name, engine, total_rows, total_bytes
        FROM system.tables
        WHERE database = {database: String}
          AND name NOT LIKE '.%'
        ORDER BY name
      `,
      format: 'JSONEachRow',
      query_params: { database },
    });

    const rows = await result.json<any>();

    return rows.map((row: any) => ({
      name: row.name,
      type: 'table' as const,
      rowCount: parseInt(row.total_rows, 10),
      comment: `Engine: ${row.engine}, Size: ${this.formatBytes(row.total_bytes)}`,
    }));
  }

  async getTableDetails(tableName: string): Promise<TableDetails | null> {
    if (!this.client) {
      throw new Error('Not connected to ClickHouse');
    }

    const database = this.config.database || 'default';

    try {
      // Get table structure
      const columnsResult = await this.client.query({
        query: `
          SELECT name, type, default_kind, default_expression, comment
          FROM system.columns
          WHERE database = {database: String} AND table = {table: String}
          ORDER BY position
        `,
        format: 'JSONEachRow',
        query_params: { database, table: tableName },
      });

      const columnRows = await columnsResult.json<any>();

      const columns: ColumnInfo[] = columnRows.map((row: any) => ({
        name: row.name,
        type: row.type,
        nullable: row.type.includes('Nullable'),
        defaultValue: row.default_expression || null,
        comment: row.comment || undefined,
      }));

      // Get primary key
      const pkResult = await this.client.query({
        query: `
          SELECT primary_key
          FROM system.tables
          WHERE database = {database: String} AND name = {table: String}
        `,
        format: 'JSONEachRow',
        query_params: { database, table: tableName },
      });

      const pkRows = await pkResult.json<any>();
      const primaryKey = pkRows[0]?.primary_key;

      const indexes: IndexInfo[] = [];
      if (primaryKey) {
        indexes.push({
          name: 'PRIMARY',
          columns: [primaryKey],
          isUnique: true,
          isPrimary: true,
        });
      }

      return {
        name: tableName,
        type: 'table' as const,
        columns,
        indexes,
        foreignKeys: [], // ClickHouse doesn't enforce foreign keys
      };
    } catch (error) {
      this.logError(`Error getting details for table ${tableName}`, error);
      return null;
    }
  }

  /**
   * Escape special LIKE pattern characters for use in ILIKE queries.
   * Escapes % and _ characters so they're treated literally, not as wildcards.
   *
   * @param searchTerm The user's search term
   * @returns Escaped search term safe for LIKE patterns
   */
  private escapeLikePattern(searchTerm: string): string {
    // Escape backslash first, then % and _
    return searchTerm
      .replace(/\\/g, '\\\\')  // \ → \\
      .replace(/%/g, '\\%')    // % → \%
      .replace(/_/g, '\\_');   // _ → \_
  }

  async searchColumns(columnName: string): Promise<string[]> {
    if (!this.client) {
      throw new Error('Not connected to ClickHouse');
    }

    const database = this.config.database || 'default';

    // Escape special LIKE characters to treat them literally
    const escapedColumnName = this.escapeLikePattern(columnName);

    const result = await this.client.query({
      query: `
        SELECT DISTINCT table
        FROM system.columns
        WHERE database = {database: String}
          AND name ILIKE {columnName: String} ESCAPE '\\\\'
        ORDER BY table
      `,
      format: 'JSONEachRow',
      query_params: {
        database,
        columnName: `%${escapedColumnName}%`,
      },
    });

    const rows = await result.json<any>();
    return rows.map((row: any) => row.table);
  }

  protected async getDatabaseVersion(): Promise<string | undefined> {
    if (!this.client) {
      return undefined;
    }

    try {
      const result = await this.client.query({
        query: 'SELECT version() as version',
        format: 'JSONEachRow',
      });

      const rows = await result.json<any>();
      return rows[0]?.version;
    } catch {
      return undefined;
    }
  }

  private async getTables(): Promise<TableDetails[]> {
    const tables = await this.listTables();
    const tableDetails: TableDetails[] = [];

    for (const table of tables) {
      const details = await this.getTableDetails(table.name);
      if (details) {
        tableDetails.push(details);
      }
    }

    return tableDetails;
  }

  private async getViews(): Promise<ViewInfo[]> {
    if (!this.client) {
      return [];
    }

    const database = this.config.database || 'default';

    try {
      const result = await this.client.query({
        query: `
          SELECT name, as_select
          FROM system.tables
          WHERE database = {database: String}
            AND engine = 'View'
          ORDER BY name
        `,
        format: 'JSONEachRow',
        query_params: { database },
      });

      const rows = await result.json<any>();

      return rows.map((row: any) => ({
        name: row.name,
        definition: row.as_select || '',
      }));
    } catch (error) {
      return [];
    }
  }

  private async getClickHouseTables(): Promise<ClickHouseTableInfo[]> {
    if (!this.client) {
      return [];
    }

    const database = this.config.database || 'default';

    const result = await this.client.query({
      query: `
        SELECT
          name,
          database,
          engine,
          partition_key,
          sorting_key,
          primary_key,
          sampling_key,
          total_rows,
          total_bytes
        FROM system.tables
        WHERE database = {database: String}
          AND name NOT LIKE '.%'
        ORDER BY name
      `,
      format: 'JSONEachRow',
      query_params: { database },
    });

    const rows = await result.json<any>();

    return rows.map((row: any) => ({
      name: row.name,
      database: row.database,
      engine: row.engine,
      partitionKey: row.partition_key || undefined,
      sortingKey: row.sorting_key || undefined,
      primaryKey: row.primary_key || undefined,
      samplingKey: row.sampling_key || undefined,
      totalRows: parseInt(row.total_rows, 10),
      totalBytes: parseInt(row.total_bytes, 10),
    }));
  }

  private formatBytes(bytes: string | number): string {
    const b = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    if (b === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(b) / Math.log(k));

    return Math.round((b / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

registerConnector('clickhouse', ClickHouseConnector);
