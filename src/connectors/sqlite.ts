import Database from 'better-sqlite3';
import { DatabaseConnector } from './base.js';
import { registerConnector } from './factory.js';
import type {
  SchemaInfo,
  TableInfo,
  TableDetails,
  ColumnInfo,
  IndexInfo,
  ForeignKeyInfo,
  ViewInfo,
} from '../types/schema.js';

export class SQLiteConnector extends DatabaseConnector {
  private db: Database.Database | null = null;

  /**
   * Safely escape SQLite identifier for use in PRAGMA statements.
   * PRAGMA statements don't support parameter binding, so we must use string interpolation.
   *
   * Security measures:
   * 1. Only called after verifying table exists via parameterized query
   * 2. Escapes double quotes by doubling them (SQL standard)
   * 3. Wraps identifier in double quotes
   *
   * @param identifier Table or index name from database
   * @returns Safely escaped identifier
   */
  private escapeSQLiteIdentifier(identifier: string): string {
    // Escape double quotes by doubling them (SQL standard)
    const escaped = identifier.replace(/"/g, '""');
    // Wrap in double quotes
    return `"${escaped}"`;
  }

  async connect(): Promise<void> {
    try {
      // SQLite uses file path in config.database or config.connectionString
      const dbPath = this.config.database || this.config.connectionString;
      if (!dbPath) {
        throw new Error('SQLite requires database path in config');
      }
      this.db = new Database(dbPath);
      this.connected = true;
    } catch (error) {
      throw new Error(
        `Failed to connect to SQLite database: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
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
    const result = this.db!.prepare('SELECT sqlite_version() as version').get() as any;
    return result?.version ? `SQLite ${result.version}` : undefined;
  }

  async getSchema(): Promise<SchemaInfo> {
    this.ensureConnected();

    const tables = await this.getAllTableDetails();
    const views = await this.getViews();
    const version = await this.getDatabaseVersion();

    return {
      databaseType: 'sqlite',
      databaseName: this.config.database!,
      version,
      tables,
      views,
    };
  }

  async listTables(): Promise<TableInfo[]> {
    this.ensureConnected();

    const tables = this.db!
      .prepare(
        `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
        `
      )
      .all() as any[];

    return tables.map((row) => ({
      name: row.name,
      type: 'table' as const,
    }));
  }

  async getTableDetails(tableName: string): Promise<TableDetails | null> {
    this.ensureConnected();

    // Security check: Verify table exists using parameterized query
    // This prevents SQL injection and ensures tableName is a valid table in the database
    // All subsequent PRAGMA calls use this verified tableName with proper escaping
    const tableExists = this.db!
      .prepare(
        `
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name = ?
        `
      )
      .get(tableName);

    if (!tableExists) {
      return null;
    }

    const columns = await this.getColumns(tableName);
    const indexes = await this.getIndexes(tableName);
    const foreignKeys = await this.getForeignKeys(tableName);
    const primaryKey = indexes.find((idx) => idx.isPrimary);

    return {
      name: tableName,
      type: 'table',
      columns,
      indexes,
      foreignKeys,
      primaryKey,
    };
  }

  private async getColumns(tableName: string): Promise<ColumnInfo[]> {
    // Security: tableName is already verified to exist via parameterized query in getTableDetails
    // Use safe escaping for PRAGMA statement (which doesn't support parameter binding)
    const escapedTableName = this.escapeSQLiteIdentifier(tableName);
    const columns = this.db!.prepare(`PRAGMA table_info(${escapedTableName})`).all() as any[];

    return columns.map((col) => ({
      name: col.name,
      type: col.type,
      nullable: col.notnull === 0,
      defaultValue: col.dflt_value,
      isPrimaryKey: col.pk === 1,
      isAutoIncrement: col.pk === 1 && col.type.toUpperCase() === 'INTEGER',
    }));
  }

  private async getIndexes(tableName: string): Promise<IndexInfo[]> {
    // Security: tableName is already verified to exist via parameterized query in getTableDetails
    const escapedTableName = this.escapeSQLiteIdentifier(tableName);
    const indexList = this.db!.prepare(`PRAGMA index_list(${escapedTableName})`).all() as any[];

    const indexes: IndexInfo[] = [];

    for (const idx of indexList) {
      // Index names come from database, but we still escape them for safety
      const escapedIndexName = this.escapeSQLiteIdentifier(idx.name);
      const indexInfo = this.db!
        .prepare(`PRAGMA index_info(${escapedIndexName})`)
        .all() as any[];

      const columns = indexInfo.map((col) => col.name);

      indexes.push({
        name: idx.name,
        columns,
        isUnique: idx.unique === 1,
        isPrimary: idx.origin === 'pk',
      });
    }

    // Add primary key if not already present
    const cols = await this.getColumns(tableName);
    const pkCols = cols.filter((c) => c.isPrimaryKey).map((c) => c.name);
    if (pkCols.length > 0 && !indexes.some((idx) => idx.isPrimary)) {
      indexes.unshift({
        name: 'PRIMARY',
        columns: pkCols,
        isUnique: true,
        isPrimary: true,
      });
    }

    return indexes;
  }

  private async getForeignKeys(tableName: string): Promise<ForeignKeyInfo[]> {
    // Security: tableName is already verified to exist via parameterized query in getTableDetails
    const escapedTableName = this.escapeSQLiteIdentifier(tableName);
    const fkList = this.db!.prepare(`PRAGMA foreign_key_list(${escapedTableName})`).all() as any[];

    const fkMap = new Map<number, ForeignKeyInfo>();

    for (const fk of fkList) {
      if (!fkMap.has(fk.id)) {
        fkMap.set(fk.id, {
          name: `fk_${tableName}_${fk.id}`,
          columns: [],
          referencedTable: fk.table,
          referencedColumns: [],
          onUpdate: fk.on_update,
          onDelete: fk.on_delete,
        });
      }
      fkMap.get(fk.id)!.columns.push(fk.from);
      fkMap.get(fk.id)!.referencedColumns.push(fk.to);
    }

    return Array.from(fkMap.values());
  }

  private async getViews(): Promise<ViewInfo[]> {
    const views = this.db!
      .prepare(
        `
        SELECT name, sql as definition
        FROM sqlite_master
        WHERE type = 'view'
        ORDER BY name
        `
      )
      .all() as any[];

    return views.map((row) => ({
      name: row.name,
      definition: row.definition || '',
    }));
  }
}

// Register this connector
registerConnector('sqlite', SQLiteConnector);

