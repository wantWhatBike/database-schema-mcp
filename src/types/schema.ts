// Base types for all database schemas

export type DatabaseType =
  | 'mysql'
  | 'postgresql'
  | 'sqlite'
  | 'oracle'
  | 'mongodb'
  | 'redis'
  | 'kafka';

// Column/Field types
export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string | null;
  comment?: string;
  isPrimaryKey?: boolean;
  isAutoIncrement?: boolean;
  maxLength?: number;
}

// Index types
export interface IndexInfo {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
  type?: string; // e.g., BTREE, HASH
}

// Foreign key constraint
export interface ForeignKeyInfo {
  name: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onDelete?: string; // CASCADE, SET NULL, etc.
  onUpdate?: string;
}

// Table information (for relational databases)
export interface TableInfo {
  name: string;
  schema?: string; // for databases with schema namespaces
  comment?: string;
  type: 'table' | 'view' | 'collection' | 'topic'; // collection for MongoDB, topic for Kafka
  rowCount?: number;
}

// Detailed table structure
export interface TableDetails extends TableInfo {
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  foreignKeys: ForeignKeyInfo[];
  primaryKey?: IndexInfo;
}

// View information
export interface ViewInfo {
  name: string;
  schema?: string;
  definition: string;
  comment?: string;
}

// Stored procedure/function
export interface ProcedureInfo {
  name: string;
  schema?: string;
  returnType?: string;
  parameters?: Array<{
    name: string;
    type: string;
    mode: 'IN' | 'OUT' | 'INOUT';
  }>;
  definition?: string;
}

// MongoDB specific: inferred field info
export interface MongoFieldInfo {
  name: string;
  types: Array<{
    type: string; // string, number, object, array, null, etc.
    percentage: number; // 0-100
  }>;
  occurrence: number; // 0-100 percentage
}

// MongoDB collection details
export interface MongoCollectionDetails {
  name: string;
  documentCount: number;
  sampleSize: number;
  fields: MongoFieldInfo[];
  indexes: Array<{
    name: string;
    keys: Record<string, number>; // e.g., { email: 1 }
    unique?: boolean;
  }>;
}

// Redis key pattern
export interface RedisKeyPattern {
  pattern: string; // e.g., "user:*", "session:*"
  count: number;
  sampleKeys: string[];
  types: Record<string, number>; // e.g., { string: 10, hash: 5 }
}

// Kafka topic info
export interface KafkaTopicInfo {
  name: string;
  partitions: number;
  replicationFactor: number;
  config: Record<string, string>;
}

// Complete schema information
export interface SchemaInfo {
  databaseType: DatabaseType;
  databaseName: string;
  version?: string;

  // Relational databases
  tables?: TableDetails[];
  views?: ViewInfo[];
  procedures?: ProcedureInfo[];

  // MongoDB
  collections?: MongoCollectionDetails[];

  // Redis
  keyPatterns?: RedisKeyPattern[];
  totalKeys?: number;

  // Kafka
  topics?: KafkaTopicInfo[];
}

// Database configuration
export interface DatabaseConfig {
  type: DatabaseType;

  // Common connection options
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  username?: string;
  password?: string;

  // Alternative connection string
  connectionString?: string;
  uri?: string;

  // Additional options
  schema?: string; // default schema for PostgreSQL
  ssl?: boolean;

  // MongoDB specific
  authSource?: string;

  // Redis specific
  db?: number;
  keyPattern?: string; // pattern to scan, default "*"
  maxKeys?: number; // max keys to scan, default 1000

  // MongoDB specific
  sampleSize?: number; // number of documents to sample, default 1000

  // Kafka specific
  brokers?: string[];
  clientId?: string;

  // Oracle specific
  serviceName?: string;
  sid?: string;
}

// Configuration file structure
export interface Config {
  databases: Record<string, DatabaseConfig>;
}
