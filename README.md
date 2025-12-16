# Database Schema MCP Server

[English](README.md) | [中文](README_zh.md)

---

A Model Context Protocol (MCP) server for extracting database schema information from multiple database types. Designed to provide LLMs with comprehensive database structure information for better SQL generation, data analysis, and database understanding.

## Features

- **Multi-Database Support**: Connect to 7+ database types
  - Relational: MySQL, PostgreSQL, SQLite, Oracle
  - NoSQL: MongoDB, Redis
  - Message Queues: Kafka

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

#### 4. `search_columns`

Search for tables containing a specific column (relational databases only).

**Parameters:**
- `databaseName` (string): Name of the database from config.json
- `columnName` (string): Column name to search for

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

### Kafka

```json
{
  "type": "kafka",
  "brokers": ["localhost:9092"],
  "clientId": "database-schema-mcp"
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

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode (auto-rebuild on changes)
npm run dev
```

## Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

The project includes:
- **Unit tests**: Config loader, connector factory, schema formatter
- **Integration tests**: SQLite connector with real database operations

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
