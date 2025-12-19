# Database Schema MCP Server

[English](README.md) | [中文](README_zh.md)

---

A Model Context Protocol (MCP) server for extracting database schema information from multiple database types. Designed to provide LLMs with comprehensive database structure information for better SQL generation, data analysis, and database understanding.

## Features

- **Multi-Database Support**: Connect to 14+ database types
  - Relational: MySQL, PostgreSQL, OpenGauss, SQLite, Oracle, ClickHouse
  - NoSQL: MongoDB, Redis, Memcached
  - Message Queues: Kafka, RabbitMQ
  - Search/Analytics: Elasticsearch
  - Key-Value Stores: etcd
  - Vector Databases: Milvus

- **Comprehensive Schema Extraction**:
  - Tables, columns, data types
  - Primary keys, indexes, unique constraints
  - Foreign key relationships
  - Views and stored procedures
  - MongoDB field type inference (sampling-based)
  - Redis key pattern analysis
  - Kafka topic configurations

- **LLM-Optimized Output**: All schema information is formatted as clean, structured Markdown

- **Extensible Architecture**: Easy to add support for new database types (Pulsar, etcd, Cassandra, etc.)

- **Environment Variable Support**: Secure password management via `${VAR_NAME}` syntax

## Installation

```bash
npm install
npm run build
```

## Configuration

### 1. Create Configuration File

Copy the example configuration and customize it:

```bash
cp config.example.json config.json
```

### 2. Configure Your Databases

Edit `config.json` to add your database connections:

```json
{
  "databases": {
    "my_mysql": {
      "type": "mysql",
      "host": "localhost",
      "port": 3306,
      "database": "myapp",
      "user": "root",
      "password": "${MYSQL_PASSWORD}"
    },
    "my_postgres": {
      "type": "postgresql",
      "connectionString": "postgresql://user:pass@localhost:5432/mydb"
    },
    "my_mongodb": {
      "type": "mongodb",
      "uri": "mongodb://localhost:27017",
      "database": "myapp",
      "sampleSize": 1000
    }
  }
}
```

### 3. Set Environment Variables

For sensitive credentials, use environment variables:

```bash
export MYSQL_PASSWORD="your_password"
export POSTGRES_PASSWORD="your_password"
export REDIS_PASSWORD="your_password"
```

## Usage

This tool provides two ways to access database schema information:

1. **CLI Tool** - Command-line interface for quick schema extraction
2. **MCP Server** - Model Context Protocol server for integration with Claude Desktop and other MCP clients

### Using the CLI Tool

After building and linking the package, you can use the `db-schema` command:

```bash
# Install and link the package
npm install
npm run build
npm link

# Get complete database schema
db-schema --config config.json --database my_mysql

# List all tables
db-schema --config config.json --database my_mysql --list-tables

# Get details for a specific table
db-schema --config config.json --database my_mysql --table users

# Export schema to a file
db-schema --config config.json --database my_mysql --output schema.md

# Use environment variable for config path
export DB_SCHEMA_CONFIG=config.json
db-schema --database my_mysql
```

**CLI Options:**
- `-c, --config <path>` - Path to configuration file (required unless DB_SCHEMA_CONFIG is set)
- `-d, --database <name>` - Database name from config (required)
- `-l, --list-tables` - List all tables/collections/topics
- `-t, --table <name>` - Get details for a specific table
- `-o, --output <path>` - Output file path (default: stdout)

### Running the MCP Server

```bash
npm start
```

Or set a custom config path:

```bash
DB_SCHEMA_CONFIG=/path/to/config.json npm start
```

### Available MCP Tools

#### 1. `get_database_schema`

Get complete database schema in Markdown format.

**Parameters:**
- `databaseName` (string): Name of the database from config.json

**Example:**
```json
{
  "databaseName": "my_mysql"
}
```

#### 2. `list_tables`

List all tables/collections/topics in a database.

**Parameters:**
- `databaseName` (string): Name of the database from config.json

#### 3. `get_table_details`

Get detailed information about a specific table.

**Parameters:**
- `databaseName` (string): Name of the database from config.json
- `tableName` (string): Name of the table

## Database-Specific Configuration

### MySQL

```json
{
  "type": "mysql",
  "host": "localhost",
  "port": 3306,
  "database": "mydb",
  "user": "root",
  "password": "password"
}
```

### PostgreSQL

```json
{
  "type": "postgresql",
  "host": "localhost",
  "port": 5432,
  "database": "mydb",
  "user": "postgres",
  "password": "password",
  "schema": "public"
}
```

Or use connection string:

```json
{
  "type": "postgresql",
  "connectionString": "postgresql://user:pass@localhost:5432/mydb"
}
```

### OpenGauss

OpenGauss is compatible with PostgreSQL protocol:

```json
{
  "type": "opengauss",
  "host": "localhost",
  "port": 5433,
  "database": "mydb",
  "user": "gaussdb",
  "password": "password",
  "schema": "public"
}
```

### SQLite

```json
{
  "type": "sqlite",
  "database": "/path/to/database.db"
}
```

### Oracle

```json
{
  "type": "oracle",
  "host": "localhost",
  "port": 1521,
  "user": "system",
  "password": "password",
  "serviceName": "ORCL"
}
```

**Note:** Requires Oracle Instant Client installed on your system.

### MongoDB

```json
{
  "type": "mongodb",
  "uri": "mongodb://localhost:27017",
  "database": "mydb",
  "sampleSize": 1000
}
```

**Field Inference:** MongoDB connector samples up to `sampleSize` documents (default: 1000) to infer field types and occurrence rates.

### Redis

```json
{
  "type": "redis",
  "host": "localhost",
  "port": 6379,
  "password": "password",
  "db": 0,
  "maxKeys": 1000,
  "keyPattern": "*"
}
```

**Key Pattern Analysis:** Scans up to `maxKeys` keys matching `keyPattern` to identify naming patterns and data types.

### Memcached

```json
{
  "type": "memcached",
  "servers": ["localhost:11211"]
}
```

**Note**: Memcached does not support key enumeration. The connector provides cache statistics only.

### Kafka

```json
{
  "type": "kafka",
  "brokers": ["localhost:9092"],
  "clientId": "database-schema-mcp"
}
```

### RabbitMQ

```json
{
  "type": "rabbitmq",
  "host": "localhost",
  "port": 5672,
  "user": "guest",
  "password": "password",
  "vhost": "/"
}
```

**Note**: Requires RabbitMQ Management API enabled for full queue/exchange listing.

### Elasticsearch

```json
{
  "type": "elasticsearch",
  "node": "http://localhost:9200"
}
```

With authentication:

```json
{
  "type": "elasticsearch",
  "nodes": ["http://localhost:9200"],
  "auth": {
    "username": "elastic",
    "password": "password"
  }
}
```

Elastic Cloud:

```json
{
  "type": "elasticsearch",
  "cloudId": "your-cloud-id",
  "auth": {
    "apiKey": "your-api-key"
  }
}
```

### etcd

```json
{
  "type": "etcd",
  "hosts": ["localhost:2379"],
  "prefix": "/",
  "maxKeysToScan": 1000
}
```

With authentication:

```json
{
  "type": "etcd",
  "hosts": ["localhost:2379"],
  "username": "root",
  "password": "password"
}
```

### ClickHouse

```json
{
  "type": "clickhouse",
  "host": "localhost",
  "port": 8123,
  "database": "default",
  "username": "default",
  "password": "password"
}
```

### Milvus

```json
{
  "type": "milvus",
  "address": "localhost:19530"
}
```

With authentication:

```json
{
  "type": "milvus",
  "address": "localhost:19530",
  "username": "root",
  "password": "password",
  "secure": false
}
```

## Adding New Database Types

The architecture is designed for easy extension. To add a new database type:

1. **Create a connector** in `src/connectors/`:

```typescript
// src/connectors/etcd.ts
import { DatabaseConnector } from './base.js';
import { registerConnector } from './factory.js';

export class EtcdConnector extends DatabaseConnector {
  async connect() { /* implementation */ }
  async disconnect() { /* implementation */ }
  async getSchema() { /* implementation */ }
  // ... implement other required methods
}

registerConnector('etcd', EtcdConnector);
```

2. **Import the connector** in `src/index.ts`:

```typescript
import './connectors/etcd.js';
```

3. **Rebuild and use**:

```bash
npm run build
```

## Architecture

```
database-schema-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── types/schema.ts       # Type definitions
│   ├── config/loader.ts      # Config file loader
│   ├── connectors/
│   │   ├── base.ts           # Abstract base class
│   │   ├── factory.ts        # Connector registry & factory
│   │   ├── mysql.ts          # MySQL implementation
│   │   ├── postgresql.ts     # PostgreSQL implementation
│   │   ├── sqlite.ts         # SQLite implementation
│   │   ├── oracle.ts         # Oracle implementation
│   │   ├── mongodb.ts        # MongoDB implementation
│   │   ├── redis.ts          # Redis implementation
│   │   └── kafka.ts          # Kafka implementation
│   ├── schema/formatter.ts   # Markdown formatter
│   └── tools/schema-tools.ts # MCP tool handlers
└── config.json               # Your database configuration
```

## Development

### Using Makefile (Recommended)

The project includes a Makefile for common development tasks:

```bash
# View all available commands
make help

# Install dependencies
make install

# Build the project
make build

# Run in watch mode (auto-rebuild on changes)
make dev

# Quick start (install + build + start)
make start
```

### Using npm directly

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode (auto-rebuild on changes)
npm run dev
```

## Testing

### Quick Testing with Makefile

```bash
# Run all tests (unit + integration)
make test

# Run only unit tests (fast, no databases required)
make test-unit

# Run integration tests with test databases
make test-integration

# Run tests in watch mode
make test-watch

# Run tests with coverage report
make test-coverage
```

### Managing Test Databases

The project uses Docker Compose to provide test databases:

```bash
# Start all test databases (MySQL, PostgreSQL, MongoDB, Redis, Kafka)
make test-db-up

# Stop and remove test databases
make test-db-down

# View test database logs
make test-db-logs

# Check test database status
make test-db-status
```

### Using npm directly

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests (requires databases)
npm run test:integration

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Test Coverage

The project includes comprehensive tests:
- **Unit tests**: Config loader, connector factory, schema formatter
- **Integration tests**: All database connectors with real database operations
  - MySQL connector
  - PostgreSQL connector
  - SQLite connector
  - MongoDB connector
  - Redis connector
  - Kafka connector

See [TESTING.md](TESTING.md) for detailed testing documentation.

## Security Considerations

- Never commit `config.json` with real credentials
- Use environment variables for sensitive data
- Grant only necessary database permissions (read-only recommended)
- For production use, consider encrypting the configuration file

## Troubleshooting

### Oracle Connection Issues

Make sure Oracle Instant Client is installed:
- Download from Oracle website
- Set `LD_LIBRARY_PATH` (Linux) or `PATH` (Windows) to the Instant Client directory

### MongoDB Sampling Performance

For very large collections, reduce `sampleSize` in configuration to improve performance:

```json
{
  "sampleSize": 100
}
```

### Redis Key Scanning

If Redis has millions of keys, limit the scan with `maxKeys` and use specific patterns:

```json
{
  "maxKeys": 500,
  "keyPattern": "user:*"
}
```

## License

MIT

## Contributing

Contributions are welcome! To add support for additional databases:

1. Fork the repository
2. Create a new connector following the existing patterns
3. Add tests and documentation
4. Submit a pull request

### Planned Database Support

- Pulsar (message queue)
- etcd (key-value store)
- Cassandra (wide-column store)
- ElasticSearch (search engine)
- ClickHouse (OLAP database)
- TiDB (distributed SQL)
