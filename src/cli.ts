#!/usr/bin/env node

import { Command } from 'commander';
import { loadConfig } from './config/loader.js';
import { SchemaTools } from './tools/schema-tools.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Import all connectors to register them
import './connectors/mysql.js';
import './connectors/postgresql.js';
import './connectors/opengauss.js';
import './connectors/sqlite.js';
import './connectors/oracle.js';
import './connectors/mongodb.js';
import './connectors/redis.js';
import './connectors/memcached.js';
import './connectors/kafka.js';
import './connectors/rabbitmq.js';
import './connectors/elasticsearch.js';
import './connectors/etcd.js';
import './connectors/clickhouse.js';
import './connectors/milvus.js';

const program = new Command();

program
  .name('db-schema')
  .description('Extract database schema information')
  .version('1.0.0');

program
  .requiredOption('-c, --config <path>', 'Path to configuration file')
  .requiredOption('-d, --database <name>', 'Database name from config')
  .option('-l, --list-tables', 'List all tables/collections/topics')
  .option('-t, --table <name>', 'Get details for a specific table')
  .option('-o, --output <path>', 'Output file path (default: stdout)')
  .parse(process.argv);

const options = program.opts();

async function main() {
  try {
    // Load configuration
    const configPath = path.resolve(options.config);
    const config = await loadConfig(configPath);

    const schemaTools = new SchemaTools(config);

    // Check if database exists
    const databases = schemaTools.listDatabases();
    if (!databases.includes(options.database)) {
      console.error(`Error: Database "${options.database}" not found in configuration.`);
      console.error(`Available databases: ${databases.join(', ')}`);
      process.exit(1);
    }

    let output: string;

    // Execute the requested operation
    if (options.listTables) {
      // List tables
      output = await schemaTools.listTables({ databaseName: options.database });
    } else if (options.table) {
      // Get table details
      output = await schemaTools.getTableDetails({
        databaseName: options.database,
        tableName: options.table,
      });
    } else {
      // Get full schema (default)
      output = await schemaTools.getDatabaseSchema({ databaseName: options.database });
    }

    // Output result
    if (options.output) {
      const outputPath = path.resolve(options.output);
      await fs.writeFile(outputPath, output, 'utf-8');
      console.log(`Schema exported to: ${outputPath}`);
    } else {
      console.log(output);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
