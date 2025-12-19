import mysql from 'mysql2/promise';
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
  ProcedureInfo,
} from '../types/schema.js';

export class MySQLConnector extends DatabaseConnector {
  private connection: mysql.Connection | null = null;

  async connect(): Promise<void> {
    try {
      this.connection = await mysql.createConnection({
        host: this.config.host,
        port: this.config.port || 3306,
        user: this.config.user || this.config.username,
        password: this.config.password,
        database: this.config.database,
      });
      this.connected = true;
    } catch (error) {
      throw new Error(
        `Failed to connect to MySQL at ${this.config.host}:${this.config.port}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
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
    const [rows] = await this.connection!.query('SELECT VERSION() as version');
    return (rows as any)[0]?.version;
  }

  async getSchema(): Promise<SchemaInfo> {
    this.ensureConnected();

    const [tables, views, procedures, version] = await Promise.all([
      this.getAllTableDetails(),
      this.getViews(),
      this.getProcedures(),
      this.getDatabaseVersion(),
    ]);

    return {
      databaseType: 'mysql',
      databaseName: this.config.database!,
      version,
      tables,
      views,
      procedures,
    };
  }

  async listTables(): Promise<TableInfo[]> {
    this.ensureConnected();

    const [rows] = await this.connection!.query(
      `
      SELECT
        TABLE_NAME as name,
        TABLE_COMMENT as comment,
        TABLE_ROWS as rowCount
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
      `,
      [this.config.database]
    );

    return (rows as any[]).map((row) => ({
      name: row.name,
      comment: row.comment || undefined,
      type: 'table' as const,
      rowCount: row.rowCount || undefined,
    }));
  }

  async getTableDetails(tableName: string): Promise<TableDetails | null> {
    this.ensureConnected();

    const [tables] = await this.connection!.query(
      `
      SELECT TABLE_NAME, TABLE_COMMENT, TABLE_ROWS
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      `,
      [this.config.database, tableName]
    );

    if ((tables as any[]).length === 0) {
      return null;
    }

    const tableInfo = (tables as any[])[0];

    const [columns, indexes, foreignKeys] = await Promise.all([
      this.getColumns(tableName),
      this.getIndexes(tableName),
      this.getForeignKeys(tableName),
    ]);

    const primaryKey = indexes.find((idx) => idx.isPrimary);

    return {
      name: tableName,
      comment: tableInfo.TABLE_COMMENT || undefined,
      type: 'table',
      rowCount: tableInfo.TABLE_ROWS || undefined,
      columns,
      indexes,
      foreignKeys,
      primaryKey,
    };
  }

  private async getColumns(tableName: string): Promise<ColumnInfo[]> {
    const [rows] = await this.connection!.query(
      `
      SELECT
        COLUMN_NAME as name,
        COLUMN_TYPE as type,
        IS_NULLABLE as nullable,
        COLUMN_DEFAULT as defaultValue,
        COLUMN_COMMENT as comment,
        COLUMN_KEY as columnKey,
        EXTRA as extra,
        CHARACTER_MAXIMUM_LENGTH as maxLength
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
      `,
      [this.config.database, tableName]
    );

    return (rows as any[]).map((row) => ({
      name: row.name,
      type: row.type,
      nullable: row.nullable === 'YES',
      defaultValue: row.defaultValue,
      comment: row.comment || undefined,
      isPrimaryKey: row.columnKey === 'PRI',
      isAutoIncrement: row.extra.includes('auto_increment'),
      maxLength: row.maxLength || undefined,
    }));
  }

  private async getIndexes(tableName: string): Promise<IndexInfo[]> {
    const [rows] = await this.connection!.query(
      `
      SELECT
        INDEX_NAME as name,
        COLUMN_NAME as columnName,
        NON_UNIQUE as nonUnique,
        SEQ_IN_INDEX as seqInIndex,
        INDEX_TYPE as indexType
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY INDEX_NAME, SEQ_IN_INDEX
      `,
      [this.config.database, tableName]
    );

    const indexMap = new Map<string, IndexInfo>();

    for (const row of rows as any[]) {
      if (!indexMap.has(row.name)) {
        indexMap.set(row.name, {
          name: row.name,
          columns: [],
          isUnique: row.nonUnique === 0,
          isPrimary: row.name === 'PRIMARY',
          type: row.indexType,
        });
      }
      indexMap.get(row.name)!.columns.push(row.columnName);
    }

    return Array.from(indexMap.values());
  }

  private async getForeignKeys(tableName: string): Promise<ForeignKeyInfo[]> {
    const [rows] = await this.connection!.query(
      `
      SELECT
        kcu.CONSTRAINT_NAME as name,
        kcu.COLUMN_NAME as columnName,
        kcu.REFERENCED_TABLE_NAME as referencedTable,
        kcu.REFERENCED_COLUMN_NAME as referencedColumn,
        rc.UPDATE_RULE as onUpdate,
        rc.DELETE_RULE as onDelete
      FROM information_schema.KEY_COLUMN_USAGE kcu
      JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
        ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
        AND kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
      WHERE kcu.TABLE_SCHEMA = ? AND kcu.TABLE_NAME = ?
      ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
      `,
      [this.config.database, tableName]
    );

    const fkMap = new Map<string, ForeignKeyInfo>();

    for (const row of rows as any[]) {
      if (!fkMap.has(row.name)) {
        fkMap.set(row.name, {
          name: row.name,
          columns: [],
          referencedTable: row.referencedTable,
          referencedColumns: [],
          onUpdate: row.onUpdate,
          onDelete: row.onDelete,
        });
      }
      fkMap.get(row.name)!.columns.push(row.columnName);
      fkMap.get(row.name)!.referencedColumns.push(row.referencedColumn);
    }

    return Array.from(fkMap.values());
  }

  private async getViews(): Promise<ViewInfo[]> {
    const [rows] = await this.connection!.query(
      `
      SELECT
        TABLE_NAME as name,
        VIEW_DEFINITION as definition
      FROM information_schema.VIEWS
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME
      `,
      [this.config.database]
    );

    return (rows as any[]).map((row) => ({
      name: row.name,
      definition: row.definition,
    }));
  }

  private async getProcedures(): Promise<ProcedureInfo[]> {
    const [rows] = await this.connection!.query(
      `
      SELECT
        ROUTINE_NAME as name,
        ROUTINE_TYPE as type,
        DTD_IDENTIFIER as returnType
      FROM information_schema.ROUTINES
      WHERE ROUTINE_SCHEMA = ?
      ORDER BY ROUTINE_NAME
      `,
      [this.config.database]
    );

    return (rows as any[]).map((row) => ({
      name: row.name,
      returnType: row.returnType || undefined,
    }));
  }
}

// Register this connector
registerConnector('mysql', MySQLConnector);
