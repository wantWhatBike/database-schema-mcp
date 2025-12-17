import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClickHouseConnector } from '../src/connectors/clickhouse.js';
import type { ClickHouseConfig } from '../src/types/schema.js';

// Mock @clickhouse/client module
vi.mock('@clickhouse/client', () => {
  const mockQuery = vi.fn();
  const mockPing = vi.fn().mockResolvedValue({ success: true });

  return {
    createClient: vi.fn(() => ({
      query: mockQuery,
      ping: mockPing,
      close: vi.fn()
    }))
  };
});

describe('ClickHouseConnector Unit Tests', () => {
  let connector: ClickHouseConnector;
  let mockClient: any;

  const config: ClickHouseConfig = {
    type: 'clickhouse',
    host: 'localhost',
    port: 8123,
    database: 'testdb',
    username: 'default',
    password: 'test_password'
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const { createClient } = await import('@clickhouse/client');
    mockClient = createClient({});

    // Mock tables query
    mockClient.query.mockImplementation(async (options: any) => {
      if (options.query.includes('FROM system.tables')) {
        return {
          json: async () => [
            {
              name: 'users',
              engine: 'MergeTree',
              partition_key: '',
              sorting_key: 'id',
              primary_key: 'id',
              total_rows: 1000,
              total_bytes: 102400
            },
            {
              name: 'events',
              engine: 'MergeTree',
              partition_key: 'toYYYYMM(event_time)',
              sorting_key: 'event_time, event_id',
              primary_key: 'event_id',
              total_rows: 5000,
              total_bytes: 512000
            },
            {
              name: 'analytics',
              engine: 'MergeTree',
              partition_key: 'toYYYYMM(date)',
              sorting_key: 'country, city, date',
              primary_key: '',
              total_rows: 10000,
              total_bytes: 1024000
            }
          ]
        };
      } else if (options.query.includes('SELECT DISTINCT table')) {
        // searchColumns query
        const columnName = options.query_params?.columnName || '';
        const results = [];

        if (columnName.includes('id')) {
          results.push({ table: 'users' }, { table: 'events' }, { table: 'analytics' });
        }
        if (columnName.includes('email')) {
          results.push({ table: 'users' });
        }
        if (columnName.includes('name')) {
          results.push({ table: 'users' }, { table: 'analytics' });
        }

        return {
          json: async () => results
        };
      } else if (options.query.includes('FROM system.columns')) {
        return {
          json: async () => [
            { name: 'id', type: 'UInt32', default_expression: '' },
            { name: 'email', type: 'String', default_expression: '' },
            { name: 'name', type: 'String', default_expression: '' },
            { name: 'age', type: 'UInt8', default_expression: '' },
            { name: 'created_at', type: 'DateTime', default_expression: '' }
          ]
        };
      }
      return { json: async () => [] };
    });

    connector = new ClickHouseConnector(config);
    await connector.connect();
  });

  it('should connect successfully', () => {
    expect(connector).toBeDefined();
  });

  it('should list all tables', async () => {
    const tables = await connector.listTables();

    expect(tables.length).toBeGreaterThanOrEqual(3);
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('events');
    expect(tableNames).toContain('analytics');
  });

  it('should get complete schema', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('clickhouse');
    expect(schema.databaseName).toBe('testdb');
    expect(schema.clickhouseTables).toBeDefined();
    expect(schema.clickhouseTables?.length).toBeGreaterThanOrEqual(3);

    const usersTable = schema.clickhouseTables?.find(t => t.name === 'users');
    expect(usersTable).toMatchObject({
      name: 'users',
      engine: 'MergeTree',
      sortingKey: 'id',
      primaryKey: 'id',
      totalRows: 1000,
      totalBytes: 102400
    });

    const eventsTable = schema.clickhouseTables?.find(t => t.name === 'events');
    expect(eventsTable).toMatchObject({
      name: 'events',
      engine: 'MergeTree',
      partitionKey: 'toYYYYMM(event_time)',
      sortingKey: 'event_time, event_id',
      primaryKey: 'event_id',
      totalRows: 5000
    });

    const analyticsTable = schema.clickhouseTables?.find(t => t.name === 'analytics');
    expect(analyticsTable).toMatchObject({
      name: 'analytics',
      partitionKey: 'toYYYYMM(date)',
      sortingKey: 'country, city, date'
    });
  });

  it('should get table details', async () => {
    const usersDetails = await connector.getTableDetails('users');

    expect(usersDetails).toBeDefined();
    expect(usersDetails?.name).toBe('users');
    expect(usersDetails?.columns).toBeDefined();
    expect(usersDetails?.columns.length).toBeGreaterThanOrEqual(5);

    const idColumn = usersDetails?.columns.find(c => c.name === 'id');
    expect(idColumn).toMatchObject({
      name: 'id',
      type: 'UInt32',
      nullable: false
    });

    const emailColumn = usersDetails?.columns.find(c => c.name === 'email');
    expect(emailColumn).toMatchObject({
      name: 'email',
      type: 'String',
      nullable: false
    });
  });

  it('should search for columns', async () => {
    const idTables = await connector.searchColumns('id');
    expect(idTables.length).toBeGreaterThanOrEqual(1);
    expect(idTables).toContain('users');

    const emailTables = await connector.searchColumns('email');
    expect(emailTables).toContain('users');
  });

  it('should report table sizes', async () => {
    const schema = await connector.getSchema();

    const usersTable = schema.clickhouseTables?.find(t => t.name === 'users');
    expect(usersTable?.totalBytes).toBe(102400);
    expect(usersTable?.totalRows).toBe(1000);
  });

  it('should disconnect properly', async () => {
    await connector.disconnect();
    // Verify no errors thrown
    expect(true).toBe(true);
  });
});
