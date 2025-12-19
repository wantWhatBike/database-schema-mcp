import { createConnector } from '../connectors/factory.js';
import { formatSchemaAsMarkdown } from '../schema/formatter.js';
import type { Config } from '../types/schema.js';

/**
 * MCP tool definitions for database schema extraction
 */

export interface ToolParams {
  databaseName: string;
  [key: string]: any;
}

/**
 * Tool handler functions
 */
export class SchemaTools {
  constructor(private config: Config) {}

  /**
   * Get complete database schema
   */
  async getDatabaseSchema(params: ToolParams): Promise<string> {
    const { databaseName } = params;

    if (!this.config.databases[databaseName]) {
      throw new Error(
        `Database "${databaseName}" not found in configuration. ` +
          `Available databases: ${Object.keys(this.config.databases).join(', ')}`
      );
    }

    const dbConfig = this.config.databases[databaseName];
    const connector = createConnector(dbConfig);

    try {
      await connector.connect();
      const schema = await connector.getSchema();
      const markdown = formatSchemaAsMarkdown(schema);
      return markdown;
    } catch (error) {
      throw new Error(
        `Failed to get schema for database "${databaseName}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      await connector.disconnect();
    }
  }

  /**
   * List all tables/collections/topics in a database
   */
  async listTables(params: ToolParams): Promise<string> {
    const { databaseName } = params;

    if (!this.config.databases[databaseName]) {
      throw new Error(
        `Database "${databaseName}" not found in configuration. ` +
          `Available databases: ${Object.keys(this.config.databases).join(', ')}`
      );
    }

    const dbConfig = this.config.databases[databaseName];
    const connector = createConnector(dbConfig);

    try {
      await connector.connect();
      const tables = await connector.listTables();

      const lines: string[] = [];
      lines.push(`# Tables in ${databaseName}`);
      lines.push('');
      lines.push(`Found ${tables.length} table(s):`);
      lines.push('');

      for (const table of tables) {
        let line = `- **${table.name}**`;
        if (table.type !== 'table') {
          line += ` (${table.type})`;
        }
        if (table.comment) {
          line += `: ${table.comment}`;
        }
        if (table.rowCount !== undefined) {
          line += ` [${table.rowCount.toLocaleString()} rows]`;
        }
        lines.push(line);
      }

      return lines.join('\n');
    } catch (error) {
      throw new Error(
        `Failed to list tables for database "${databaseName}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      await connector.disconnect();
    }
  }

  /**
   * Get detailed information about a specific table
   */
  async getTableDetails(params: ToolParams & { tableName: string }): Promise<string> {
    const { databaseName, tableName } = params;

    if (!this.config.databases[databaseName]) {
      throw new Error(
        `Database "${databaseName}" not found in configuration. ` +
          `Available databases: ${Object.keys(this.config.databases).join(', ')}`
      );
    }

    const dbConfig = this.config.databases[databaseName];
    const connector = createConnector(dbConfig);

    try {
      await connector.connect();
      const details = await connector.getTableDetails(tableName);

      if (!details) {
        return `Table "${tableName}" not found in database "${databaseName}".`;
      }

      // Format the table details as markdown
      const lines: string[] = [];
      lines.push(`# Table: ${details.name}`);
      lines.push('');

      if (details.schema) {
        lines.push(`**Schema**: ${details.schema}`);
      }
      if (details.comment) {
        lines.push(`**Description**: ${details.comment}`);
      }
      if (details.rowCount !== undefined) {
        lines.push(`**Row Count**: ${details.rowCount.toLocaleString()}`);
      }
      lines.push('');

      // Columns
      if (details.columns && details.columns.length > 0) {
        lines.push('## Columns');
        lines.push('');
        lines.push('| Name | Type | Nullable | Default | Comment |');
        lines.push('|------|------|----------|---------|---------|');

        for (const col of details.columns) {
          const name = col.isPrimaryKey ? `**${col.name}** (PK)` : col.name;
          const type = col.isAutoIncrement ? `${col.type} AUTO_INCREMENT` : col.type;
          const nullable = col.nullable ? 'YES' : 'NO';
          const defaultValue = col.defaultValue || '-';
          const comment = col.comment || '';

          lines.push(`| ${name} | ${type} | ${nullable} | ${defaultValue} | ${comment} |`);
        }
        lines.push('');
      }

      // Indexes
      if (details.indexes && details.indexes.length > 0) {
        lines.push('## Indexes');
        lines.push('');
        for (const idx of details.indexes) {
          const type = idx.isPrimary ? 'PRIMARY KEY' : idx.isUnique ? 'UNIQUE' : 'INDEX';
          const indexType = idx.type ? ` (${idx.type})` : '';
          lines.push(`- ${type}${indexType}: \`${idx.name}\` on (${idx.columns.join(', ')})`);
        }
        lines.push('');
      }

      // Foreign Keys
      if (details.foreignKeys && details.foreignKeys.length > 0) {
        lines.push('## Foreign Keys');
        lines.push('');
        for (const fk of details.foreignKeys) {
          lines.push(
            `- \`${fk.name}\`: (${fk.columns.join(', ')}) REFERENCES ${fk.referencedTable}(${fk.referencedColumns.join(', ')})`
          );
          if (fk.onDelete) {
            lines.push(`  - ON DELETE: ${fk.onDelete}`);
          }
          if (fk.onUpdate) {
            lines.push(`  - ON UPDATE: ${fk.onUpdate}`);
          }
        }
      }

      return lines.join('\n');
    } catch (error) {
      throw new Error(
        `Failed to get details for table "${tableName}" in database "${databaseName}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      await connector.disconnect();
    }
  }

  /**
   * Get list of available databases from configuration
   */
  listDatabases(): string[] {
    return Object.keys(this.config.databases);
  }
}
