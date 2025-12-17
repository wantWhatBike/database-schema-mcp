import type {
  SchemaInfo,
  TableDetails,
  MongoCollectionDetails,
  RedisKeyPattern,
  MemcachedKeyPattern,
  KafkaTopicInfo,
  RabbitMQQueueInfo,
  RabbitMQExchangeInfo,
  RabbitMQBindingInfo,
  ElasticsearchIndexInfo,
  EtcdKeyPattern,
  ClickHouseTableInfo,
  MilvusCollectionInfo,
} from '../types/schema.js';

/**
 * Format schema information as LLM-friendly Markdown
 */
export function formatSchemaAsMarkdown(schema: SchemaInfo): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Database Schema: ${schema.databaseName}`);
  lines.push('');
  lines.push(`**Database Type**: ${schema.databaseType.toUpperCase()}`);
  if (schema.version) {
    lines.push(`**Version**: ${schema.version}`);
  }
  lines.push('');

  // Check if there's any data to display
  const hasData =
    (schema.tables && schema.tables.length > 0) ||
    (schema.views && schema.views.length > 0) ||
    (schema.procedures && schema.procedures.length > 0) ||
    (schema.collections && schema.collections.length > 0) ||
    (schema.keyPatterns && schema.keyPatterns.length > 0) ||
    (schema.memcachedKeyPatterns && schema.memcachedKeyPatterns.length > 0) ||
    (schema.topics && schema.topics.length > 0) ||
    (schema.queues && schema.queues.length > 0) ||
    (schema.exchanges && schema.exchanges.length > 0) ||
    (schema.indices && schema.indices.length > 0) ||
    (schema.etcdKeyPatterns && schema.etcdKeyPatterns.length > 0) ||
    (schema.clickhouseTables && schema.clickhouseTables.length > 0) ||
    (schema.milvusCollections && schema.milvusCollections.length > 0);

  if (!hasData) {
    lines.push('**No schema data available**');
    lines.push('');
    lines.push('The database appears to be empty or the schema extraction found no objects.');
    return lines.join('\n');
  }

  // Format based on database type
  if (schema.tables && schema.tables.length > 0) {
    lines.push(...formatRelationalTables(schema.tables));
  }

  if (schema.views && schema.views.length > 0) {
    lines.push(...formatViews(schema));
  }

  if (schema.procedures && schema.procedures.length > 0) {
    lines.push(...formatProcedures(schema));
  }

  if (schema.collections && schema.collections.length > 0) {
    lines.push(...formatMongoCollections(schema.collections));
  }

  if (schema.keyPatterns && schema.keyPatterns.length > 0) {
    lines.push(...formatRedisKeys(schema));
  }

  if (schema.memcachedKeyPatterns && schema.memcachedKeyPatterns.length > 0) {
    lines.push(...formatMemcachedKeys(schema));
  }

  if (schema.topics && schema.topics.length > 0) {
    lines.push(...formatKafkaTopics(schema.topics));
  }

  if (schema.queues && schema.queues.length > 0) {
    lines.push(...formatRabbitMQQueues(schema));
  }

  if (schema.exchanges && schema.exchanges.length > 0) {
    lines.push(...formatRabbitMQExchanges(schema));
  }

  if (schema.indices && schema.indices.length > 0) {
    lines.push(...formatElasticsearchIndices(schema.indices));
  }

  if (schema.etcdKeyPatterns && schema.etcdKeyPatterns.length > 0) {
    lines.push(...formatEtcdKeys(schema));
  }

  if (schema.clickhouseTables && schema.clickhouseTables.length > 0) {
    lines.push(...formatClickHouseTables(schema.clickhouseTables));
  }

  if (schema.milvusCollections && schema.milvusCollections.length > 0) {
    lines.push(...formatMilvusCollections(schema.milvusCollections));
  }

  return lines.join('\n');
}

function formatRelationalTables(tables: TableDetails[]): string[] {
  const lines: string[] = [];

  lines.push(`## Tables (${tables.length})`);
  lines.push('');

  for (const table of tables) {
    lines.push(`### Table: ${table.name}`);
    if (table.schema) {
      lines.push(`**Schema**: ${table.schema}`);
    }
    if (table.comment) {
      lines.push(`**Description**: ${table.comment}`);
    }
    if (table.rowCount !== undefined) {
      lines.push(`**Row Count**: ${table.rowCount.toLocaleString()}`);
    }
    lines.push('');

    // Columns
    if (table.columns.length > 0) {
      lines.push('**Columns**:');
      lines.push('');
      lines.push('| Name | Type | Nullable | Default | Comment |');
      lines.push('|------|------|----------|---------|---------|');

      for (const col of table.columns) {
        const name = col.isPrimaryKey ? `**${col.name}** (PK)` : col.name;
        const type = col.isAutoIncrement ? `${col.type} AUTO_INCREMENT` : col.type;
        const nullable = col.nullable ? 'YES' : 'NO';
        const defaultValue = col.defaultValue || '-';
        const comment = col.comment || '';

        lines.push(`| ${name} | ${type} | ${nullable} | ${defaultValue} | ${comment} |`);
      }
      lines.push('');
    }

    // Indexes
    if (table.indexes.length > 0) {
      lines.push('**Indexes**:');
      for (const idx of table.indexes) {
        const type = idx.isPrimary ? 'PRIMARY KEY' : idx.isUnique ? 'UNIQUE' : 'INDEX';
        const indexType = idx.type ? ` (${idx.type})` : '';
        lines.push(`- ${type}${indexType}: \`${idx.name}\` on (${idx.columns.join(', ')})`);
      }
      lines.push('');
    }

    // Foreign Keys
    if (table.foreignKeys.length > 0) {
      lines.push('**Foreign Keys**:');
      for (const fk of table.foreignKeys) {
        lines.push(
          `- \`${fk.name}\`: (${fk.columns.join(', ')}) REFERENCES ${fk.referencedTable}(${fk.referencedColumns.join(', ')})`
        );
        if (fk.onDelete) {
          lines.push(`  - ON DELETE: ${fk.onDelete}`);
        }
        if (fk.onUpdate) {
          lines.push(`  - ON UPDATE: ${fk.onUpdate}`);
        }
      }
      lines.push('');
    } else {
      lines.push('**Foreign Keys**: None');
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines;
}

function formatViews(schema: SchemaInfo): string[] {
  const lines: string[] = [];

  lines.push(`## Views (${schema.views!.length})`);
  lines.push('');

  for (const view of schema.views!) {
    lines.push(`### View: ${view.name}`);
    if (view.schema) {
      lines.push(`**Schema**: ${view.schema}`);
    }
    if (view.comment) {
      lines.push(`**Description**: ${view.comment}`);
    }
    lines.push('');
    lines.push('**Definition**:');
    lines.push('```sql');
    lines.push(view.definition);
    lines.push('```');
    lines.push('');
  }

  return lines;
}

function formatProcedures(schema: SchemaInfo): string[] {
  const lines: string[] = [];

  lines.push(`## Stored Procedures (${schema.procedures!.length})`);
  lines.push('');

  for (const proc of schema.procedures!) {
    lines.push(`### ${proc.name}`);
    if (proc.schema) {
      lines.push(`**Schema**: ${proc.schema}`);
    }
    if (proc.returnType) {
      lines.push(`**Returns**: ${proc.returnType}`);
    }
    if (proc.parameters && proc.parameters.length > 0) {
      lines.push('**Parameters**:');
      for (const param of proc.parameters) {
        lines.push(`- ${param.name} (${param.type}) ${param.mode}`);
      }
    }
    lines.push('');
  }

  return lines;
}

function formatMongoCollections(collections: MongoCollectionDetails[]): string[] {
  const lines: string[] = [];

  lines.push(`## Collections (${collections.length})`);
  lines.push('');

  for (const coll of collections) {
    lines.push(`### Collection: ${coll.name}`);
    lines.push(`**Document Count**: ${coll.documentCount.toLocaleString()}`);
    lines.push('');

    // Fields
    if (coll.fields.length > 0) {
      lines.push(`**Fields** (inferred from ${coll.sampleSize} samples):`);
      lines.push('');
      lines.push('| Field | Types | Occurrence |');
      lines.push('|-------|-------|------------|');

      for (const field of coll.fields) {
        const typesStr = field.types
          .map((t) => `${t.type} (${t.percentage}%)`)
          .join(', ');
        lines.push(`| ${field.name} | ${typesStr} | ${field.occurrence}% |`);
      }
      lines.push('');
    }

    // Indexes
    if (coll.indexes.length > 0) {
      lines.push('**Indexes**:');
      for (const idx of coll.indexes) {
        const keysStr = Object.entries(idx.keys)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        const unique = idx.unique ? ' (UNIQUE)' : '';
        lines.push(`- \`${idx.name}\`${unique}: { ${keysStr} }`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines;
}

function formatRedisKeys(schema: SchemaInfo): string[] {
  const lines: string[] = [];

  lines.push(`## Key Patterns (Total Keys: ${schema.totalKeys?.toLocaleString() || 'Unknown'})`);
  lines.push('');

  for (const pattern of schema.keyPatterns!) {
    lines.push(`### Pattern: ${pattern.pattern}`);
    lines.push(`**Count**: ${pattern.count.toLocaleString()}`);
    lines.push('');

    // Types distribution
    if (Object.keys(pattern.types).length > 0) {
      lines.push('**Types**:');
      for (const [type, count] of Object.entries(pattern.types)) {
        lines.push(`- ${type}: ${count}`);
      }
      lines.push('');
    }

    // Sample keys
    if (pattern.sampleKeys.length > 0) {
      lines.push('**Sample Keys**:');
      for (const key of pattern.sampleKeys) {
        lines.push(`- ${key}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines;
}

function formatKafkaTopics(topics: KafkaTopicInfo[]): string[] {
  const lines: string[] = [];

  lines.push(`## Topics (${topics.length})`);
  lines.push('');

  for (const topic of topics) {
    lines.push(`### Topic: ${topic.name}`);
    lines.push(`**Partitions**: ${topic.partitions}`);
    lines.push(`**Replication Factor**: ${topic.replicationFactor}`);
    lines.push('');

    // Config
    if (Object.keys(topic.config).length > 0) {
      lines.push('**Configuration**:');
      for (const [key, value] of Object.entries(topic.config)) {
        lines.push(`- ${key}: ${value}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines;
}

function formatMemcachedKeys(schema: SchemaInfo): string[] {
  const lines: string[] = [];

  lines.push(`## Cache Statistics (Total Keys: ${schema.memcachedTotalKeys?.toLocaleString() || 'Unknown'})`);
  lines.push('');

  for (const pattern of schema.memcachedKeyPatterns!) {
    lines.push(`### Pattern: ${pattern.pattern}`);
    lines.push(`**Count**: ${pattern.count.toLocaleString()}`);
    lines.push('');

    if (pattern.exampleValue) {
      lines.push(`**Note**: ${pattern.exampleValue}`);
      lines.push('');
    }

    if (pattern.sampleKeys.length > 0) {
      lines.push('**Sample Keys**:');
      for (const key of pattern.sampleKeys) {
        lines.push(`- ${key}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines;
}

function formatRabbitMQQueues(schema: SchemaInfo): string[] {
  const lines: string[] = [];

  lines.push(`## Queues (${schema.queues!.length})`);
  lines.push('');

  for (const queue of schema.queues!) {
    lines.push(`### Queue: ${queue.name}`);
    lines.push(`**Durable**: ${queue.durable ? 'Yes' : 'No'}`);
    lines.push(`**Auto Delete**: ${queue.autoDelete ? 'Yes' : 'No'}`);
    lines.push(`**Messages**: ${queue.messages.toLocaleString()}`);
    lines.push(`**Consumers**: ${queue.consumers}`);
    lines.push('');

    if (queue.arguments && Object.keys(queue.arguments).length > 0) {
      lines.push('**Arguments**:');
      for (const [key, value] of Object.entries(queue.arguments)) {
        lines.push(`- ${key}: ${value}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines;
}

function formatRabbitMQExchanges(schema: SchemaInfo): string[] {
  const lines: string[] = [];

  lines.push(`## Exchanges (${schema.exchanges!.length})`);
  lines.push('');

  for (const exchange of schema.exchanges!) {
    lines.push(`### Exchange: ${exchange.name}`);
    lines.push(`**Type**: ${exchange.type}`);
    lines.push(`**Durable**: ${exchange.durable ? 'Yes' : 'No'}`);
    lines.push(`**Auto Delete**: ${exchange.autoDelete ? 'Yes' : 'No'}`);
    lines.push(`**Internal**: ${exchange.internal ? 'Yes' : 'No'}`);
    lines.push('');

    if (exchange.arguments && Object.keys(exchange.arguments).length > 0) {
      lines.push('**Arguments**:');
      for (const [key, value] of Object.entries(exchange.arguments)) {
        lines.push(`- ${key}: ${value}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines;
}

function formatElasticsearchIndices(indices: ElasticsearchIndexInfo[]): string[] {
  const lines: string[] = [];

  lines.push(`## Indices (${indices.length})`);
  lines.push('');

  for (const index of indices) {
    lines.push(`### Index: ${index.name}`);
    lines.push(`**Health**: ${index.health}`);
    lines.push(`**Status**: ${index.status}`);
    lines.push(`**Documents**: ${index.docsCount.toLocaleString()}`);
    lines.push(`**Size**: ${index.storeSize}`);
    lines.push(`**Primary Shards**: ${index.primaryShards}`);
    lines.push(`**Replica Shards**: ${index.replicaShards}`);
    lines.push('');

    lines.push('---');
    lines.push('');
  }

  return lines;
}

function formatEtcdKeys(schema: SchemaInfo): string[] {
  const lines: string[] = [];

  lines.push(`## Key Prefixes (Total Keys: ${schema.etcdTotalKeys?.toLocaleString() || 'Unknown'})`);
  lines.push('');

  for (const pattern of schema.etcdKeyPatterns!) {
    lines.push(`### Prefix: ${pattern.prefix}`);
    lines.push(`**Count**: ${pattern.count.toLocaleString()}`);
    lines.push(`**Depth**: ${pattern.depth}`);
    lines.push('');

    if (pattern.sampleKeys.length > 0) {
      lines.push('**Sample Keys**:');
      for (const key of pattern.sampleKeys.slice(0, 5)) {
        lines.push(`- ${key}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines;
}

function formatClickHouseTables(tables: ClickHouseTableInfo[]): string[] {
  const lines: string[] = [];

  lines.push(`## Tables (${tables.length})`);
  lines.push('');

  for (const table of tables) {
    lines.push(`### Table: ${table.name}`);
    lines.push(`**Engine**: ${table.engine}`);
    if (table.partitionKey) {
      lines.push(`**Partition Key**: ${table.partitionKey}`);
    }
    if (table.sortingKey) {
      lines.push(`**Sorting Key**: ${table.sortingKey}`);
    }
    if (table.primaryKey) {
      lines.push(`**Primary Key**: ${table.primaryKey}`);
    }
    if (table.totalRows !== undefined) {
      lines.push(`**Total Rows**: ${table.totalRows.toLocaleString()}`);
    }
    if (table.totalBytes !== undefined) {
      lines.push(`**Total Size**: ${formatBytes(table.totalBytes)}`);
    }
    lines.push('');

    lines.push('---');
    lines.push('');
  }

  return lines;
}

function formatMilvusCollections(collections: MilvusCollectionInfo[]): string[] {
  const lines: string[] = [];

  lines.push(`## Collections (${collections.length})`);
  lines.push('');

  for (const coll of collections) {
    lines.push(`### Collection: ${coll.name}`);
    if (coll.description) {
      lines.push(`**Description**: ${coll.description}`);
    }
    lines.push(`**Entities**: ${coll.numEntities.toLocaleString()}`);
    if (coll.shardsNum) {
      lines.push(`**Shards**: ${coll.shardsNum}`);
    }
    lines.push('');

    // Fields
    if (coll.schema.fields.length > 0) {
      lines.push('**Fields**:');
      lines.push('');
      lines.push('| Name | Type | Primary | Dimension |');
      lines.push('|------|------|---------|-----------|');

      for (const field of coll.schema.fields) {
        const name = field.isPrimary ? `**${field.name}**` : field.name;
        const dimension = field.dimension ? field.dimension.toString() : '-';
        lines.push(`| ${name} | ${field.type} | ${field.isPrimary ? 'Yes' : 'No'} | ${dimension} |`);
      }
      lines.push('');
    }

    // Indexes
    if (coll.indexes && coll.indexes.length > 0) {
      lines.push('**Indexes**:');
      for (const idx of coll.indexes) {
        lines.push(`- \`${idx.indexName}\` on \`${idx.fieldName}\`: ${idx.indexType} (${idx.metric})`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

