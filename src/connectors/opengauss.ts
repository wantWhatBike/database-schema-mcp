import { DatabaseConnector } from './base.js';
import { registerConnector } from './factory.js';
import type {
  OpenGaussConfig,
  SchemaInfo,
  TableInfo,
  TableDetails,
  ColumnInfo,
  IndexInfo,
  ForeignKeyInfo,
  ViewInfo,
  ProcedureInfo,
} from '../types/schema.js';
import pg from 'pg';

// OpenGauss is compatible with PostgreSQL protocol
// OpenGauss 是华为基于 PostgreSQL 开发的国产数据库，使用 PostgreSQL 协议
export class OpenGaussConnector extends DatabaseConnector {
  private pool: pg.Pool | null = null;

  constructor(config: OpenGaussConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    const { connectionString, host, port, database, user, username, password, schema, ssl } =
      this.config;

    if (connectionString) {
      this.pool = new pg.Pool({ connectionString });
    } else {
      this.pool = new pg.Pool({
        host: host || 'localhost',
        port: port || 5432,
        database: database || 'postgres',
        user: username || user || 'postgres',
        password: password || '',
        ssl: ssl ? { rejectUnauthorized: false } : false,
      });
    }

    // Test connection
    const client = await this.pool.connect();
    client.release();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.connected = false;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      if (!this.pool) {
        return false;
      }
      const client = await this.pool.connect();
      client.release();
      return true;
    } catch {
      return false;
    }
  }

  async getSchema(): Promise<SchemaInfo> {
    if (!this.pool) {
      throw new Error('Not connected to OpenGauss');
    }

    const schema = this.config.schema || 'public';

    const tables = await this.getTables();
    const views = await this.getViews();
    const procedures = await this.getProcedures();

    return {
      databaseType: 'opengauss',
      databaseName: this.config.database || 'postgres',
      version: await this.getDatabaseVersion(),
      tables,
      views,
      procedures,
    };
  }

  async listTables(): Promise<TableInfo[]> {
    if (!this.pool) {
      throw new Error('Not connected to OpenGauss');
    }

    const schema = this.config.schema || 'public';

    const result = await this.pool.query(
      `
      SELECT
        tablename as name,
        obj_description((schemaname || '.' || tablename)::regclass) as comment
      FROM pg_tables
      WHERE schemaname = $1
      ORDER BY tablename
    `,
      [schema]
    );

    return result.rows.map((row) => ({
      name: row.name,
      schema,
      type: 'table' as const,
      comment: row.comment,
    }));
  }

  async getTableDetails(tableName: string): Promise<TableDetails | null> {
    if (!this.pool) {
      throw new Error('Not connected to OpenGauss');
    }

    const schema = this.config.schema || 'public';

    try {
      // Get columns
      const columnsResult = await this.pool.query(
        `
        SELECT
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          pgd.description as comment,
          c.character_maximum_length,
          c.numeric_precision,
          c.numeric_scale
        FROM information_schema.columns c
        LEFT JOIN pg_catalog.pg_statio_all_tables st ON c.table_schema = st.schemaname AND c.table_name = st.relname
        LEFT JOIN pg_catalog.pg_description pgd ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
        WHERE c.table_schema = $1 AND c.table_name = $2
        ORDER BY c.ordinal_position
      `,
        [schema, tableName]
      );

      const columns: ColumnInfo[] = columnsResult.rows.map((row) => ({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
        defaultValue: row.column_default,
        comment: row.comment,
        maxLength: row.character_maximum_length,
      }));

      // Get indexes
      const indexesResult = await this.pool.query(
        `
        SELECT
          i.indexname as index_name,
          i.indexdef as index_definition,
          ix.indisunique as is_unique,
          ix.indisprimary as is_primary,
          ARRAY_AGG(a.attname ORDER BY array_position(ix.indkey, a.attnum)) as column_names
        FROM pg_indexes i
        JOIN pg_class c ON i.tablename = c.relname
        JOIN pg_index ix ON c.oid = ix.indrelid
        JOIN pg_class ic ON ix.indexrelid = ic.oid
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(ix.indkey)
        WHERE i.schemaname = $1 AND i.tablename = $2
        GROUP BY i.indexname, i.indexdef, ix.indisunique, ix.indisprimary
      `,
        [schema, tableName]
      );

      const indexes: IndexInfo[] = indexesResult.rows.map((row) => ({
        name: row.index_name,
        columns: row.column_names,
        isUnique: row.is_unique,
        isPrimary: row.is_primary,
      }));

      // Get foreign keys
      const fkResult = await this.pool.query(
        `
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.delete_rule,
          rc.update_rule
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints AS rc
          ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = $1
          AND tc.table_name = $2
        ORDER BY tc.constraint_name, kcu.ordinal_position
      `,
        [schema, tableName]
      );

      // Group foreign keys by constraint name to handle multi-column FKs
      const fkMap = new Map<string, ForeignKeyInfo>();

      for (const row of fkResult.rows) {
        if (!fkMap.has(row.constraint_name)) {
          fkMap.set(row.constraint_name, {
            name: row.constraint_name,
            columns: [],
            referencedTable: row.foreign_table_name,
            referencedColumns: [],
            onDelete: row.delete_rule,
            onUpdate: row.update_rule,
          });
        }
        fkMap.get(row.constraint_name)!.columns.push(row.column_name);
        fkMap.get(row.constraint_name)!.referencedColumns.push(row.foreign_column_name);
      }

      const foreignKeys: ForeignKeyInfo[] = Array.from(fkMap.values());

      return {
        name: tableName,
        schema,
        type: 'table' as const,
        columns,
        indexes,
        foreignKeys,
      };
    } catch (error) {
      this.logError(`Error getting table details for ${tableName}`, error);
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
    if (!this.pool) {
      throw new Error('Not connected to OpenGauss');
    }

    const schema = this.config.schema || 'public';

    // Escape special LIKE characters to treat them literally
    const escapedColumnName = this.escapeLikePattern(columnName);

    const result = await this.pool.query(
      `
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE table_schema = $1 AND column_name ILIKE $2 ESCAPE '\\'
      ORDER BY table_name
    `,
      [schema, `%${escapedColumnName}%`]
    );

    return result.rows.map((row) => row.table_name);
  }

  protected async getDatabaseVersion(): Promise<string | undefined> {
    if (!this.pool) {
      return undefined;
    }

    try {
      const result = await this.pool.query('SELECT version()');
      return result.rows[0]?.version;
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
    if (!this.pool) {
      return [];
    }

    const schema = this.config.schema || 'public';

    try {
      const result = await this.pool.query(
        `
        SELECT
          viewname as name,
          definition,
          obj_description((schemaname || '.' || viewname)::regclass) as comment
        FROM pg_views
        WHERE schemaname = $1
        ORDER BY viewname
      `,
        [schema]
      );

      return result.rows.map((row) => ({
        name: row.name,
        schema,
        definition: row.definition,
        comment: row.comment,
      }));
    } catch (error) {
      return [];
    }
  }

  private async getProcedures(): Promise<ProcedureInfo[]> {
    if (!this.pool) {
      return [];
    }

    const schema = this.config.schema || 'public';

    try {
      const result = await this.pool.query(
        `
        SELECT
          p.proname as name,
          pg_get_function_result(p.oid) as return_type,
          pg_get_functiondef(p.oid) as definition
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = $1
        ORDER BY p.proname
      `,
        [schema]
      );

      return result.rows.map((row) => ({
        name: row.name,
        schema,
        returnType: row.return_type,
        definition: row.definition,
      }));
    } catch (error) {
      return [];
    }
  }
}

registerConnector('opengauss', OpenGaussConnector);
