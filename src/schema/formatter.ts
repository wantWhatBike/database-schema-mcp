import type {
  SchemaInfo,
  TableDetails,
  MongoCollectionDetails,
  RedisKeyPattern,
  KafkaTopicInfo,
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

  if (schema.topics && schema.topics.length > 0) {
    lines.push(...formatKafkaTopics(schema.topics));
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
