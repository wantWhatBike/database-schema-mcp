import type {
  DatabaseConfig,
  SchemaInfo,
  TableInfo,
  TableDetails,
} from '../types/schema.js';

/**
 * Abstract base class for database connectors
 * All database-specific connectors must implement this interface
 */
export abstract class DatabaseConnector {
  protected config: DatabaseConfig;
  protected connected: boolean = false;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  /**
   * Establish connection to the database
   * @throws Error if connection fails
   */
  abstract connect(): Promise<void>;

  /**
   * Close the database connection
   */
  abstract disconnect(): Promise<void>;

  /**
   * Test if the connection is working
   * @returns true if connection is successful
   */
  abstract testConnection(): Promise<boolean>;

  /**
   * Get complete schema information for the database
   * @returns SchemaInfo object containing all schema details
   */
  abstract getSchema(): Promise<SchemaInfo>;

  /**
   * List all tables/collections/topics in the database
   * @returns Array of table information
   */
  abstract listTables(): Promise<TableInfo[]>;

  /**
   * Get detailed information about a specific table/collection
   * @param tableName The name of the table
   * @returns Detailed table information
   */
  abstract getTableDetails(tableName: string): Promise<TableDetails | null>;

  /**
   * Search for tables containing columns with specified name
   * Only applicable to relational databases
   * @param columnName The column name to search for
   * @returns Array of table names containing the column
   */
  async searchColumns(columnName: string): Promise<string[]> {
    const tables = await this.listTables();
    const results: string[] = [];

    for (const table of tables) {
      if (table.type === 'collection' || table.type === 'topic') {
        continue; // Skip non-relational structures
      }

      const details = await this.getTableDetails(table.name);
      if (details && details.columns) {
        const hasColumn = details.columns.some(
          (col) => col.name.toLowerCase() === columnName.toLowerCase()
        );
        if (hasColumn) {
          results.push(table.name);
        }
      }
    }

    return results;
  }

  /**
   * Helper method to ensure connection is established
   * @throws Error if not connected
   */
  protected ensureConnected(): void {
    if (!this.connected) {
      throw new Error(
        'Database not connected. Call connect() first.'
      );
    }
  }

  /**
   * Get database version string
   * @returns Version string or undefined if not available
   */
  protected abstract getDatabaseVersion(): Promise<string | undefined>;
}
