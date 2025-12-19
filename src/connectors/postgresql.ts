import pg from 'pg';
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

const { Client } = pg;

export class PostgreSQLConnector extends DatabaseConnector {
  private client: pg.Client | null = null;
  private schema: string;

  constructor(config: any) {
    super(config);
    this.schema = config.schema || 'public';
  }

  async connect(): Promise<void> {
    try {
      this.client = new Client({
        host: this.config.host,
        port: this.config.port || 5432,
        user: this.config.user || this.config.username,
        password: this.config.password,
        database: this.config.database,
        connectionString: this.config.connectionString,
      });
      await this.client.connect();
      this.connected = true;
    } catch (error) {
      throw new Error(
        `Failed to connect to PostgreSQL at ${this.config.host}:${this.config.port}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end();
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
    const result = await this.client!.query('SELECT version()');
    return result.rows[0]?.version;
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
      databaseType: 'postgresql',
      databaseName: this.config.database!,
      version,
      tables,
      views,
      procedures,
    };
  }

  async listTables(): Promise<TableInfo[]> {
    this.ensureConnected();

    const result = await this.client!.query(
      `
      SELECT
        t.table_name as name,
        obj_description((quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))::regclass) as comment
      FROM information_schema.tables t
      WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
      `,
      [this.schema]
    );

    // Get row counts for each table
    const tables: TableInfo[] = [];
    for (const row of result.rows) {
      const rowCount = await this.getRowCount(row.name);
      tables.push({
        name: row.name,
        schema: this.schema,
        comment: row.comment || undefined,
        type: 'table' as const,
        rowCount,
      });
    }

    return tables;
  }

  async getTableDetails(tableName: string): Promise<TableDetails | null> {
    this.ensureConnected();

    const result = await this.client!.query(
      `
      SELECT
        table_name,
        obj_description((quote_ident($2) || '.' || quote_ident(table_name))::regclass) as comment
      FROM information_schema.tables
      WHERE table_schema = $2 AND table_name = $1
      `,
      [tableName, this.schema]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const [columns, indexes, foreignKeys, rowCount] = await Promise.all([
      this.getColumns(tableName),
      this.getIndexes(tableName),
      this.getForeignKeys(tableName),
      this.getRowCount(tableName),
    ]);

    const primaryKey = indexes.find((idx) => idx.isPrimary);

    return {
      name: tableName,
      schema: this.schema,
      comment: result.rows[0].comment || undefined,
      type: 'table',
      rowCount,
      columns,
      indexes,
      foreignKeys,
      primaryKey,
    };
  }

  private async getRowCount(tableName: string): Promise<number | undefined> {
    try {
      // Use identifier quoting to prevent SQL injection
      const result = await this.client!.query(
        `SELECT COUNT(*) as count FROM ${this.client!.escapeIdentifier(this.schema)}.${this.client!.escapeIdentifier(tableName)}`
      );
      const count = result.rows[0]?.count;
      return count != null ? Number(count) : undefined;
    } catch {
      return undefined;
    }
  }

  private async getColumns(tableName: string): Promise<ColumnInfo[]> {
    const result = await this.client!.query(
      `
      SELECT
        c.column_name as name,
        c.data_type as type,
        c.is_nullable as nullable,
        c.column_default as default_value,
        c.character_maximum_length as max_length,
        col_description((quote_ident($2) || '.' || quote_ident($1))::regclass, c.ordinal_position) as comment,
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT ku.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku
          ON tc.constraint_name = ku.constraint_name
          AND tc.table_schema = ku.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = $2
          AND tc.table_name = $1
      ) pk ON c.column_name = pk.column_name
      WHERE c.table_schema = $2 AND c.table_name = $1
      ORDER BY c.ordinal_position
      `,
      [tableName, this.schema]
    );

    return result.rows.map((row) => ({
      name: row.name,
      type: row.type,
      nullable: row.nullable === 'YES',
      defaultValue: row.default_value,
      comment: row.comment || undefined,
      isPrimaryKey: row.is_primary_key,
      isAutoIncrement: row.default_value?.includes('nextval'),
      maxLength: row.max_length || undefined,
    }));
  }

  private async getIndexes(tableName: string): Promise<IndexInfo[]> {
    const result = await this.client!.query(
      `
      SELECT
        i.relname as index_name,
        ix.indisunique as is_unique,
        ix.indisprimary as is_primary,
        am.amname as index_type,
        ARRAY_AGG(a.attname ORDER BY array_position(ix.indkey::integer[], a.attnum::integer)) as column_names
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_am am ON i.relam = am.oid
      JOIN pg_namespace n ON t.relnamespace = n.oid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      WHERE n.nspname = $1 AND t.relname = $2
      GROUP BY i.relname, ix.indisunique, ix.indisprimary, am.amname, ix.indkey
      ORDER BY i.relname
      `,
      [this.schema, tableName]
    );

    return result.rows.map((row) => ({
      name: row.index_name,
      columns: row.column_names,
      isUnique: row.is_unique,
      isPrimary: row.is_primary,
      type: row.index_type,
    }));
  }

  private async getForeignKeys(tableName: string): Promise<ForeignKeyInfo[]> {
    const result = await this.client!.query(
      `
      SELECT
        tc.constraint_name as name,
        kcu.column_name,
        ccu.table_name AS referenced_table,
        ccu.column_name AS referenced_column,
        rc.update_rule as on_update,
        rc.delete_rule as on_delete
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON tc.constraint_name = rc.constraint_name
        AND tc.table_schema = rc.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2
      ORDER BY tc.constraint_name, kcu.ordinal_position
      `,
      [this.schema, tableName]
    );

    const fkMap = new Map<string, ForeignKeyInfo>();

    for (const row of result.rows) {
      if (!fkMap.has(row.name)) {
        fkMap.set(row.name, {
          name: row.name,
          columns: [],
          referencedTable: row.referenced_table,
          referencedColumns: [],
          onUpdate: row.on_update,
          onDelete: row.on_delete,
        });
      }
      fkMap.get(row.name)!.columns.push(row.column_name);
      fkMap.get(row.name)!.referencedColumns.push(row.referenced_column);
    }

    return Array.from(fkMap.values());
  }

  private async getViews(): Promise<ViewInfo[]> {
    const result = await this.client!.query(
      `
      SELECT
        table_name as name,
        view_definition as definition
      FROM information_schema.views
      WHERE table_schema = $1
      ORDER BY table_name
      `,
      [this.schema]
    );

    return result.rows.map((row) => ({
      name: row.name,
      schema: this.schema,
      definition: row.definition,
    }));
  }

  private async getProcedures(): Promise<ProcedureInfo[]> {
    const result = await this.client!.query(
      `
      SELECT
        r.routine_name as name,
        r.data_type as return_type
      FROM information_schema.routines r
      WHERE r.routine_schema = $1
      ORDER BY r.routine_name
      `,
      [this.schema]
    );

    return result.rows.map((row) => ({
      name: row.name,
      schema: this.schema,
      returnType: row.return_type || undefined,
    }));
  }
}

// Register this connector
registerConnector('postgresql', PostgreSQLConnector);
