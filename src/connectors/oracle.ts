// @ts-ignore - oracledb types may not be available
import oracledb from 'oracledb';
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

export class OracleConnector extends DatabaseConnector {
  private connection: oracledb.Connection | null = null;
  private schema: string;

  constructor(config: any) {
    super(config);
    // Oracle uses username as schema by default
    this.schema = (config.schema || config.user || config.username)?.toUpperCase();
  }

  async connect(): Promise<void> {
    try {
      this.connection = await oracledb.getConnection({
        user: this.config.user || this.config.username,
        password: this.config.password,
        connectString: this.config.connectionString ||
          `${this.config.host}:${this.config.port || 1521}/${this.config.serviceName || this.config.sid}`,
      });
      this.connected = true;
    } catch (error) {
      throw new Error(
        `Failed to connect to Oracle at ${this.config.host}:${this.config.port}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
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
    const result = await this.connection!.execute('SELECT * FROM v$version WHERE ROWNUM = 1');
    return result.rows?.[0]?.[0] as string;
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
      databaseType: 'oracle',
      databaseName: this.schema,
      version,
      tables,
      views,
      procedures,
    };
  }

  async listTables(): Promise<TableInfo[]> {
    this.ensureConnected();

    const result = await this.connection!.execute(
      `
      SELECT
        table_name,
        num_rows
      FROM all_tables
      WHERE owner = :schema
      ORDER BY table_name
      `,
      { schema: this.schema }
    );

    return (result.rows || []).map((row: any) => ({
      name: row[0],
      schema: this.schema,
      type: 'table' as const,
      rowCount: row[1] || undefined,
    }));
  }

  async getTableDetails(tableName: string): Promise<TableDetails | null> {
    this.ensureConnected();

    const result = await this.connection!.execute(
      `SELECT table_name FROM all_tables WHERE owner = :schema AND table_name = :tableName`,
      { schema: this.schema, tableName: tableName.toUpperCase() }
    );

    if (!result.rows || result.rows.length === 0) {
      return null;
    }

    const [columns, indexes, foreignKeys] = await Promise.all([
      this.getColumns(tableName),
      this.getIndexes(tableName),
      this.getForeignKeys(tableName),
    ]);

    const primaryKey = indexes.find((idx) => idx.isPrimary);

    return {
      name: tableName,
      schema: this.schema,
      type: 'table',
      columns,
      indexes,
      foreignKeys,
      primaryKey,
    };
  }

  private async getColumns(tableName: string): Promise<ColumnInfo[]> {
    const result = await this.connection!.execute(
      `
      SELECT
        c.column_name,
        c.data_type,
        c.data_length,
        c.nullable,
        c.data_default,
        cc.comments,
        CASE WHEN pk.column_name IS NOT NULL THEN 'Y' ELSE 'N' END as is_primary
      FROM all_tab_columns c
      LEFT JOIN all_col_comments cc
        ON c.owner = cc.owner AND c.table_name = cc.table_name AND c.column_name = cc.column_name
      LEFT JOIN (
        SELECT col.column_name
        FROM all_constraints con
        JOIN all_cons_columns col
          ON con.owner = col.owner AND con.constraint_name = col.constraint_name
        WHERE con.owner = :schema
          AND con.table_name = :tableName
          AND con.constraint_type = 'P'
      ) pk ON c.column_name = pk.column_name
      WHERE c.owner = :schema AND c.table_name = :tableName
      ORDER BY c.column_id
      `,
      { schema: this.schema, tableName: tableName.toUpperCase() }
    );

    return (result.rows || []).map((row: any) => ({
      name: row[0],
      type: row[1] + (row[2] ? `(${row[2]})` : ''),
      nullable: row[3] === 'Y',
      defaultValue: row[4]?.trim() || undefined,
      comment: row[5] || undefined,
      isPrimaryKey: row[6] === 'Y',
    }));
  }

  private async getIndexes(tableName: string): Promise<IndexInfo[]> {
    const result = await this.connection!.execute(
      `
      SELECT
        i.index_name,
        ic.column_name,
        i.uniqueness,
        c.constraint_type
      FROM all_indexes i
      JOIN all_ind_columns ic
        ON i.owner = ic.index_owner AND i.index_name = ic.index_name
      LEFT JOIN all_constraints c
        ON i.owner = c.owner AND i.index_name = c.constraint_name
      WHERE i.owner = :schema AND i.table_name = :tableName
      ORDER BY i.index_name, ic.column_position
      `,
      { schema: this.schema, tableName: tableName.toUpperCase() }
    );

    const indexMap = new Map<string, IndexInfo>();

    for (const row of result.rows || []) {
      const [indexName, columnName, uniqueness, constraintType] = row as any[];
      if (!indexMap.has(indexName)) {
        indexMap.set(indexName, {
          name: indexName,
          columns: [],
          isUnique: uniqueness === 'UNIQUE',
          isPrimary: constraintType === 'P',
        });
      }
      indexMap.get(indexName)!.columns.push(columnName);
    }

    return Array.from(indexMap.values());
  }

  private async getForeignKeys(tableName: string): Promise<ForeignKeyInfo[]> {
    const result = await this.connection!.execute(
      `
      SELECT
        c.constraint_name,
        cc.column_name,
        rc.table_name as referenced_table,
        rcc.column_name as referenced_column,
        c.delete_rule
      FROM all_constraints c
      JOIN all_cons_columns cc
        ON c.owner = cc.owner AND c.constraint_name = cc.constraint_name
      JOIN all_constraints rc
        ON c.r_owner = rc.owner AND c.r_constraint_name = rc.constraint_name
      JOIN all_cons_columns rcc
        ON rc.owner = rcc.owner AND rc.constraint_name = rcc.constraint_name
        AND cc.position = rcc.position
      WHERE c.owner = :schema
        AND c.table_name = :tableName
        AND c.constraint_type = 'R'
      ORDER BY c.constraint_name, cc.position
      `,
      { schema: this.schema, tableName: tableName.toUpperCase() }
    );

    const fkMap = new Map<string, ForeignKeyInfo>();

    for (const row of result.rows || []) {
      const [name, columnName, referencedTable, referencedColumn, deleteRule] = row as any[];
      if (!fkMap.has(name)) {
        fkMap.set(name, {
          name,
          columns: [],
          referencedTable,
          referencedColumns: [],
          onDelete: deleteRule,
        });
      }
      fkMap.get(name)!.columns.push(columnName);
      fkMap.get(name)!.referencedColumns.push(referencedColumn);
    }

    return Array.from(fkMap.values());
  }

  private async getViews(): Promise<ViewInfo[]> {
    const result = await this.connection!.execute(
      `
      SELECT view_name, text
      FROM all_views
      WHERE owner = :schema
      ORDER BY view_name
      `,
      { schema: this.schema }
    );

    return (result.rows || []).map((row: any) => ({
      name: row[0],
      schema: this.schema,
      definition: row[1],
    }));
  }

  private async getProcedures(): Promise<ProcedureInfo[]> {
    const result = await this.connection!.execute(
      `
      SELECT object_name, object_type
      FROM all_procedures
      WHERE owner = :schema AND object_type IN ('PROCEDURE', 'FUNCTION')
      ORDER BY object_name
      `,
      { schema: this.schema }
    );

    return (result.rows || []).map((row: any) => ({
      name: row[0],
      schema: this.schema,
    }));
  }
}

// Register this connector
registerConnector('oracle', OracleConnector);

