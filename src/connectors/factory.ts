import type { DatabaseConfig, DatabaseType } from '../types/schema.js';
import { DatabaseConnector } from './base.js';

/**
 * Constructor type for database connectors
 * Uses a more flexible type to allow specific config types
 */
type ConnectorConstructor = new (config: any) => DatabaseConnector;

/**
 * Registry of database connector constructors
 */
const connectorRegistry = new Map<DatabaseType, ConnectorConstructor>();

/**
 * Register a database connector
 * @param type Database type
 * @param constructor Connector constructor
 */
export function registerConnector(
  type: DatabaseType,
  constructor: ConnectorConstructor
): void {
  connectorRegistry.set(type, constructor);
}

/**
 * Create a database connector instance
 * @param config Database configuration
 * @returns Database connector instance
 * @throws Error if connector type is not supported
 */
export function createConnector(config: DatabaseConfig): DatabaseConnector {
  const Constructor = connectorRegistry.get(config.type);

  if (!Constructor) {
    throw new Error(
      `Unsupported database type: ${config.type}. ` +
        `Supported types: ${Array.from(connectorRegistry.keys()).join(', ')}`
    );
  }

  return new Constructor(config);
}

/**
 * Get list of supported database types
 * @returns Array of supported database types
 */
export function getSupportedDatabaseTypes(): DatabaseType[] {
  return Array.from(connectorRegistry.keys());
}

/**
 * Check if a database type is supported
 * @param type Database type
 * @returns true if supported
 */
export function isSupported(type: string): type is DatabaseType {
  return connectorRegistry.has(type as DatabaseType);
}

// Import and register all connectors
// This will be done in each connector file using a side effect
// For now, we'll export the registration function for manual registration
