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
   * Log an error with consistent formatting
   * @param context Description of where the error occurred
   * @param error The error object or message
   */
  protected logError(context: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[${this.config.type}] ${context}:`, errorMessage);
  }

  /**
   * Format error message for throwing
   * @param context Description of where the error occurred
   * @param error The error object or message
   * @returns Formatted error message
   */
  protected formatErrorMessage(context: string, error: unknown): string {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `${context}: ${errorMessage}`;
  }

  /**
   * Get all table details for tables in the database.
   * This is a helper method that calls getTableDetails for each table.
   * Can be used by connectors that need to fetch all table details.
   *
   * @returns Array of table details
   */
  protected async getAllTableDetails(): Promise<TableDetails[]> {
    const tables = await this.listTables();
    const details: TableDetails[] = [];

    for (const table of tables) {
      try {
        const detail = await this.getTableDetails(table.name);
        if (detail) {
          details.push(detail);
        }
      } catch (error) {
        // Log error but continue with other tables
        this.logError(`Error getting details for table ${table.name}`, error);
      }
    }

    return details;
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
