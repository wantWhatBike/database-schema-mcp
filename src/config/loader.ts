import { readFile } from 'fs/promises';
import type { Config, DatabaseConfig } from '../types/schema.js';

/**
 * Replace environment variable placeholders in a string
 * Supports ${VAR_NAME} syntax
 * @param value String that may contain environment variable references
 * @returns String with environment variables replaced
 */
function replaceEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      throw new Error(
        `Environment variable ${varName} is not defined`
      );
    }
    return envValue;
  });
}

/**
 * Recursively replace environment variables in an object
 * @param obj Object to process
 * @returns Object with environment variables replaced
 */
function replaceEnvVarsInObject<T>(obj: T): T {
  if (typeof obj === 'string') {
    return replaceEnvVars(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => replaceEnvVarsInObject(item)) as T;
  }

  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = replaceEnvVarsInObject(value);
    }
    return result as T;
  }

  return obj;
}

/**
 * Load and parse configuration file
 * @param configPath Path to the configuration file
 * @returns Parsed configuration with environment variables replaced
 * @throws Error if file cannot be read or parsed
 */
export async function loadConfig(configPath: string): Promise<Config> {
  try {
    const content = await readFile(configPath, 'utf-8');
    const rawConfig = JSON.parse(content) as Config;

    // Replace environment variables in the entire config
    const config = replaceEnvVarsInObject(rawConfig);

    // Validate config structure
    if (!config.databases || typeof config.databases !== 'object') {
      throw new Error('Invalid config: missing "databases" object');
    }

    return config;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load config from ${configPath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get a specific database configuration by name
 * @param config Configuration object
 * @param dbName Database name
 * @returns Database configuration
 * @throws Error if database not found
 */
export function getDatabaseConfig(
  config: Config,
  dbName: string
): DatabaseConfig {
  const dbConfig = config.databases[dbName];
  if (!dbConfig) {
    const availableDbs = Object.keys(config.databases).join(', ');
    throw new Error(
      `Database "${dbName}" not found in configuration. Available: ${availableDbs}`
    );
  }
  return dbConfig;
}

/**
 * Get all database names from configuration
 * @param config Configuration object
 * @returns Array of database names
 */
export function getDatabaseNames(config: Config): string[] {
  return Object.keys(config.databases);
}
