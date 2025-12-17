// Base types for all database schemas

export type DatabaseType =
  | 'mysql'
  | 'postgresql'
  | 'opengauss'
  | 'sqlite'
  | 'oracle'
  | 'mongodb'
  | 'redis'
  | 'memcached'
  | 'kafka'
  | 'rabbitmq'
  | 'elasticsearch'
  | 'etcd'
  | 'clickhouse'
  | 'milvus';

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

// Memcached key pattern (similar to Redis)
export interface MemcachedKeyPattern {
  pattern: string; // e.g., "cache:*", "session:*"
  count: number;
  sampleKeys: string[];
  exampleValue?: string;
}

// Kafka topic info
export interface KafkaTopicInfo {
  name: string;
  partitions: number;
  replicationFactor: number;
  config: Record<string, string>;
}

// RabbitMQ queue info
export interface RabbitMQQueueInfo {
  name: string;
  durable: boolean;
  autoDelete: boolean;
  exclusive: boolean;
  messages: number;
  consumers: number;
  arguments?: Record<string, any>;
}

// RabbitMQ exchange info
export interface RabbitMQExchangeInfo {
  name: string;
  type: string; // direct, fanout, topic, headers
  durable: boolean;
  autoDelete: boolean;
  internal: boolean;
  arguments?: Record<string, any>;
}

// RabbitMQ binding info
export interface RabbitMQBindingInfo {
  source: string; // exchange name
  destination: string; // queue or exchange name
  destinationType: 'queue' | 'exchange';
  routingKey: string;
  arguments?: Record<string, any>;
}

// Elasticsearch index info
export interface ElasticsearchIndexInfo {
  name: string;
  health: string; // green, yellow, red
  status: string; // open, close
  docsCount: number;
  docsDeleted: number;
  storeSize: string;
  primaryShards: number;
  replicaShards: number;
  mappings?: Record<string, any>; // field mappings
  settings?: Record<string, any>; // index settings
}

// Elasticsearch field mapping
export interface ElasticsearchFieldInfo {
  name: string;
  type: string; // text, keyword, integer, date, etc.
  fields?: Record<string, any>; // multi-fields
  analyzer?: string;
  index?: boolean;
  properties?: ElasticsearchFieldInfo[]; // nested fields
}

// etcd key pattern
export interface EtcdKeyPattern {
  prefix: string; // e.g., "/services/", "/config/"
  count: number;
  sampleKeys: string[];
  depth: number; // directory depth
}

// ClickHouse table info (extends TableDetails)
export interface ClickHouseTableInfo {
  name: string;
  database: string;
  engine: string; // MergeTree, ReplicatedMergeTree, etc.
  partitionKey?: string;
  sortingKey?: string;
  primaryKey?: string;
  samplingKey?: string;
  totalRows?: number;
  totalBytes?: number;
}

// Milvus collection info
export interface MilvusCollectionInfo {
  name: string;
  description?: string;
  numEntities: number;
  schema: {
    fields: MilvusFieldInfo[];
    description?: string;
  };
  indexes?: MilvusIndexInfo[];
  shardsNum?: number;
}

// Milvus field info
export interface MilvusFieldInfo {
  name: string;
  fieldId: number;
  type: string; // Int64, Float, FloatVector, BinaryVector, etc.
  isPrimary: boolean;
  autoId?: boolean;
  description?: string;
  dimension?: number; // for vector fields
}

// Milvus index info
export interface MilvusIndexInfo {
  fieldName: string;
  indexName: string;
  indexType: string; // IVF_FLAT, IVF_SQ8, HNSW, etc.
  metric: string; // L2, IP, COSINE
  params?: Record<string, any>;
}

// Complete schema information
export interface SchemaInfo {
  databaseType: DatabaseType;
  databaseName: string;
  version?: string;

  // Relational databases (MySQL, PostgreSQL, SQLite, Oracle, ClickHouse)
  tables?: TableDetails[];
  views?: ViewInfo[];
  procedures?: ProcedureInfo[];

  // MongoDB
  collections?: MongoCollectionDetails[];

  // Redis
  keyPatterns?: RedisKeyPattern[];
  totalKeys?: number;

  // Memcached
  memcachedKeyPatterns?: MemcachedKeyPattern[];
  memcachedTotalKeys?: number;

  // Kafka
  topics?: KafkaTopicInfo[];

  // RabbitMQ
  queues?: RabbitMQQueueInfo[];
  exchanges?: RabbitMQExchangeInfo[];
  bindings?: RabbitMQBindingInfo[];
  vhost?: string;

  // Elasticsearch
  indices?: ElasticsearchIndexInfo[];
  clusterHealth?: string;

  // etcd
  etcdKeyPatterns?: EtcdKeyPattern[];
  etcdTotalKeys?: number;

  // ClickHouse specific
  clickhouseTables?: ClickHouseTableInfo[];

  // Milvus
  milvusCollections?: MilvusCollectionInfo[];
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
  url?: string;

  // Additional options
  schema?: string; // default schema for PostgreSQL
  ssl?: boolean;
  sslCA?: string;
  sslCert?: string;
  sslKey?: string;

  // Authentication
  apiKey?: string;
  token?: string;
  accessKeyId?: string;
  secretAccessKey?: string;

  // MongoDB specific
  authSource?: string;
  sampleSize?: number; // number of documents to sample, default 1000

  // Redis specific
  db?: number;
  keyPattern?: string; // pattern to scan, default "*"
  maxKeys?: number; // max keys to scan, default 1000

  // Memcached specific
  servers?: string[]; // memcached servers, e.g., ["localhost:11211"]

  // Kafka specific
  brokers?: string[];
  clientId?: string;
  saslMechanism?: string; // PLAIN, SCRAM-SHA-256, SCRAM-SHA-512
  saslUsername?: string;
  saslPassword?: string;

  // Oracle specific
  serviceName?: string;
  sid?: string;

  // RabbitMQ specific
  vhost?: string; // virtual host, default "/"
  protocol?: string; // amqp or amqps
  heartbeat?: number;
  managementPort?: number; // RabbitMQ Management API port, default 15672

  // Elasticsearch specific
  node?: string; // Elasticsearch node URL
  nodes?: string[]; // multiple nodes
  cloudId?: string; // Elastic Cloud ID
  auth?: {
    username?: string;
    password?: string;
    apiKey?: string;
  };
  maxRetries?: number;
  requestTimeout?: number;

  // etcd specific
  hosts?: string[]; // etcd endpoints
  prefix?: string; // key prefix to scan
  maxKeysToScan?: number;
  dialTimeout?: number;
  credentials?: {
    rootCertificate?: string;
    privateKey?: string;
    certChain?: string;
  };

  // ClickHouse specific
  clickhouseSettings?: Record<string, any>;
  compression?: boolean;

  // Milvus specific
  address?: string; // Milvus server address
  collectionNames?: string[]; // specific collections to analyze
  secure?: boolean; // use TLS
}

// Configuration file structure
export interface Config {
  databases: Record<string, DatabaseConfig>;
}

// Type-specific configuration helpers
export type MySQLConfig = DatabaseConfig & { type: 'mysql' };
export type PostgreSQLConfig = DatabaseConfig & { type: 'postgresql' };
export type OpenGaussConfig = DatabaseConfig & { type: 'opengauss' };
export type SQLiteConfig = DatabaseConfig & { type: 'sqlite' };
export type OracleConfig = DatabaseConfig & { type: 'oracle' };
export type MongoDBConfig = DatabaseConfig & { type: 'mongodb' };
export type RedisConfig = DatabaseConfig & { type: 'redis' };
export type MemcachedConfig = DatabaseConfig & { type: 'memcached' };
export type KafkaConfig = DatabaseConfig & { type: 'kafka' };
export type RabbitMQConfig = DatabaseConfig & { type: 'rabbitmq' };
export type ElasticsearchConfig = DatabaseConfig & { type: 'elasticsearch' };
export type EtcdConfig = DatabaseConfig & { type: 'etcd' };
export type ClickHouseConfig = DatabaseConfig & { type: 'clickhouse' };
export type MilvusConfig = DatabaseConfig & { type: 'milvus' };
