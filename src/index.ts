#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './config/loader.js';
import { SchemaTools } from './tools/schema-tools.js';
import { getSupportedDatabaseTypes } from './connectors/factory.js';

// Import all connectors to register them
import './connectors/mysql.js';
import './connectors/postgresql.js';
import './connectors/sqlite.js';
import './connectors/oracle.js';
import './connectors/mongodb.js';
import './connectors/redis.js';
import './connectors/kafka.js';

const CONFIG_PATH = process.env.DB_SCHEMA_CONFIG || './config.json';

async function main() {
  // Load configuration
  let config;
  try {
    config = await loadConfig(CONFIG_PATH);
  } catch (error) {
    console.error(`Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`Please create a config.json file. See config.example.json for reference.`);
    process.exit(1);
  }

  const schemaTools = new SchemaTools(config);

  // Create MCP server
  const server = new Server(
    {
      name: 'database-schema-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const databases = schemaTools.listDatabases();
    const supportedTypes = getSupportedDatabaseTypes();

    return {
      tools: [
        {
          name: 'get_database_schema',
          description: `Get complete database schema information in LLM-friendly Markdown format. Includes tables, columns, indexes, foreign keys, views, and stored procedures for relational databases. For NoSQL databases, includes collections/topics and their structures.\n\nAvailable databases: ${databases.join(', ')}\nSupported database types: ${supportedTypes.join(', ')}`,
          inputSchema: {
            type: 'object',
            properties: {
              databaseName: {
                type: 'string',
                description: `Name of the database as configured in config.json. Available: ${databases.join(', ')}`,
              },
            },
            required: ['databaseName'],
          },
        },
        {
          name: 'list_tables',
          description: `List all tables/collections/topics in a database.\n\nAvailable databases: ${databases.join(', ')}`,
          inputSchema: {
            type: 'object',
            properties: {
              databaseName: {
                type: 'string',
                description: `Name of the database as configured in config.json. Available: ${databases.join(', ')}`,
              },
            },
            required: ['databaseName'],
          },
        },
        {
          name: 'get_table_details',
          description: `Get detailed information about a specific table, including columns, data types, indexes, and foreign keys.\n\nAvailable databases: ${databases.join(', ')}`,
          inputSchema: {
            type: 'object',
            properties: {
              databaseName: {
                type: 'string',
                description: `Name of the database as configured in config.json. Available: ${databases.join(', ')}`,
              },
              tableName: {
                type: 'string',
                description: 'Name of the table to get details for',
              },
            },
            required: ['databaseName', 'tableName'],
          },
        },
        {
          name: 'search_columns',
          description: `Search for tables containing a specific column name. Only works with relational databases.\n\nAvailable databases: ${databases.join(', ')}`,
          inputSchema: {
            type: 'object',
            properties: {
              databaseName: {
                type: 'string',
                description: `Name of the database as configured in config.json. Available: ${databases.join(', ')}`,
              },
              columnName: {
                type: 'string',
                description: 'Name of the column to search for',
              },
            },
            required: ['databaseName', 'columnName'],
          },
        },
      ],
    };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'get_database_schema': {
          const result = await schemaTools.getDatabaseSchema(args as any);
          return {
            content: [{ type: 'text', text: result }],
          };
        }

        case 'list_tables': {
          const result = await schemaTools.listTables(args as any);
          return {
            content: [{ type: 'text', text: result }],
          };
        }

        case 'get_table_details': {
          const result = await schemaTools.getTableDetails(args as any);
          return {
            content: [{ type: 'text', text: result }],
          };
        }

        case 'search_columns': {
          const result = await schemaTools.searchColumns(args as any);
          return {
            content: [{ type: 'text', text: result }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Database Schema MCP server running on stdio');
  console.error(`Configured databases: ${schemaTools.listDatabases().join(', ')}`);
  console.error(`Supported database types: ${getSupportedDatabaseTypes().join(', ')}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
