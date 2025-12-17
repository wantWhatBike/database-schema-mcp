import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PostgreSQLConnector } from '../src/connectors/postgresql.js';
import type { PostgreSQLConfig } from '../src/types/schema.js';

// Use vi.hoisted to create mocks before vi.mock
const { mockQuery, mockEnd, mockConnect, mockClient } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  const mockEnd = vi.fn();
  const mockConnect = vi.fn();
  const mockClient = {
    query: mockQuery,
    end: mockEnd,
    connect: mockConnect
  };

  return { mockQuery, mockEnd, mockConnect, mockClient };
});

// Mock pg module
vi.mock('pg', () => {
  return {
    default: {
      Client: vi.fn(() => mockClient)
    }
  };
});

describe('PostgreSQLConnector Unit Tests', () => {
  let connector: PostgreSQLConnector;

  const config: PostgreSQLConfig = {
    type: 'postgresql',
    host: 'localhost',
    port: 5432,
    database: 'testdb',
    user: 'postgres',
    password: 'test_password',
    schema: 'public'
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockQuery.mockImplementation((sql: string, params?: any[]) => {
      // Version query
      if (sql.includes('SELECT version()')) {
        return Promise.resolve({ rows: [{ version: 'PostgreSQL 15.3' }] });
      }

      // List tables query
      if (sql.includes('FROM information_schema.tables t') && sql.includes('LEFT JOIN pg_stat_user_tables')) {
        return Promise.resolve({
          rows: [
            { name: 'users', comment: 'User accounts', row_count: 100 },
            { name: 'products', comment: 'Product catalog', row_count: 250 },
            { name: 'orders', comment: 'Customer orders', row_count: 500 },
            { name: 'order_items', comment: '', row_count: 1200 }
          ]
        });
      }

      // Get specific table info (getTableDetails)
      if (sql.includes('obj_description') && sql.includes('WHERE table_schema = $2 AND table_name = $1') && params) {
        const tableName = params[0];
        const tableData: Record<string, any> = {
          'users': { table_name: 'users', comment: 'User accounts' },
          'products': { table_name: 'products', comment: 'Product catalog' },
          'orders': { table_name: 'orders', comment: 'Customer orders' },
          'order_items': { table_name: 'order_items', comment: '' }
        };
        return Promise.resolve({ rows: [tableData[tableName] || { table_name: tableName, comment: null }] });
      }

      // Row count query (pg_stat_user_tables)
      if (sql.includes('SELECT n_live_tup FROM pg_stat_user_tables') && params) {
        const tableName = params[1];
        const counts: Record<string, number> = {
          'users': 100,
          'products': 250,
          'orders': 500,
          'order_items': 1200
        };
        return Promise.resolve({ rows: [{ n_live_tup: counts[tableName] || 0 }] });
      }

      // Row count query (legacy COUNT)
      if (sql.includes('SELECT COUNT(*) as count FROM') && params) {
        const tableName = params[0].replace(/"/g, '');
        const counts: Record<string, number> = {
          'users': 100,
          'products': 250,
          'orders': 500,
          'order_items': 1200
        };
        return Promise.resolve({ rows: [{ count: counts[tableName] || 0 }] });
      }

      // Columns query
      if (sql.includes('FROM information_schema.columns') && sql.includes('col_description') && params) {
        const tableName = params[0];

        if (tableName === 'users') {
          return Promise.resolve({
            rows: [
              { name: 'id', type: 'integer', nullable: 'NO', default_value: "nextval('users_id_seq'::regclass)", max_length: null, comment: null, is_primary_key: true },
              { name: 'email', type: 'character varying', nullable: 'NO', default_value: null, max_length: 255, comment: 'User email address', is_primary_key: false },
              { name: 'username', type: 'character varying', nullable: 'NO', default_value: null, max_length: 100, comment: null, is_primary_key: false },
              { name: 'age', type: 'integer', nullable: 'YES', default_value: null, max_length: null, comment: null, is_primary_key: false },
              { name: 'is_active', type: 'boolean', nullable: 'YES', default_value: 'true', max_length: null, comment: null, is_primary_key: false },
              { name: 'metadata', type: 'jsonb', nullable: 'YES', default_value: null, max_length: null, comment: null, is_primary_key: false },
              { name: 'created_at', type: 'timestamp without time zone', nullable: 'YES', default_value: 'CURRENT_TIMESTAMP', max_length: null, comment: null, is_primary_key: false }
            ]
          });
        } else if (tableName === 'products') {
          return Promise.resolve({
            rows: [
              { name: 'id', type: 'integer', nullable: 'NO', default_value: "nextval('products_id_seq'::regclass)", max_length: null, comment: null, is_primary_key: true },
              { name: 'name', type: 'character varying', nullable: 'NO', default_value: null, max_length: 255, comment: null, is_primary_key: false },
              { name: 'price', type: 'numeric', nullable: 'NO', default_value: null, max_length: null, comment: null, is_primary_key: false },
              { name: 'stock', type: 'integer', nullable: 'YES', default_value: '0', max_length: null, comment: null, is_primary_key: false },
              { name: 'tags', type: 'ARRAY', nullable: 'YES', default_value: null, max_length: null, comment: null, is_primary_key: false }
            ]
          });
        } else if (tableName === 'orders') {
          return Promise.resolve({
            rows: [
              { name: 'id', type: 'integer', nullable: 'NO', default_value: "nextval('orders_id_seq'::regclass)", max_length: null, comment: null, is_primary_key: true },
              { name: 'user_id', type: 'integer', nullable: 'NO', default_value: null, max_length: null, comment: null, is_primary_key: false },
              { name: 'order_date', type: 'timestamp without time zone', nullable: 'NO', default_value: null, max_length: null, comment: null, is_primary_key: false },
              { name: 'total', type: 'numeric', nullable: 'YES', default_value: null, max_length: null, comment: null, is_primary_key: false },
              { name: 'status', type: 'character varying', nullable: 'YES', default_value: "'pending'::character varying", max_length: 50, comment: null, is_primary_key: false }
            ]
          });
        } else if (tableName === 'order_items') {
          return Promise.resolve({
            rows: [
              { name: 'id', type: 'integer', nullable: 'NO', default_value: "nextval('order_items_id_seq'::regclass)", max_length: null, comment: null, is_primary_key: true },
              { name: 'order_id', type: 'integer', nullable: 'NO', default_value: null, max_length: null, comment: null, is_primary_key: false },
              { name: 'product_id', type: 'integer', nullable: 'NO', default_value: null, max_length: null, comment: null, is_primary_key: false },
              { name: 'quantity', type: 'integer', nullable: 'NO', default_value: null, max_length: null, comment: null, is_primary_key: false },
              { name: 'price', type: 'numeric', nullable: 'NO', default_value: null, max_length: null, comment: null, is_primary_key: false }
            ]
          });
        }
      }

      // Indexes query
      if (sql.includes('FROM pg_class t') && sql.includes('JOIN pg_index ix') && params) {
        const tableName = params[1];

        if (tableName === 'users') {
          return Promise.resolve({
            rows: [
              { index_name: 'users_pkey', column_name: 'id', is_unique: true, is_primary: true, index_type: 'btree' },
              { index_name: 'users_email_key', column_name: 'email', is_unique: true, is_primary: false, index_type: 'btree' },
              { index_name: 'idx_username', column_name: 'username', is_unique: false, is_primary: false, index_type: 'btree' },
              { index_name: 'idx_created', column_name: 'created_at', is_unique: false, is_primary: false, index_type: 'btree' }
            ]
          });
        } else if (tableName === 'orders') {
          return Promise.resolve({
            rows: [
              { index_name: 'orders_pkey', column_name: 'id', is_unique: true, is_primary: true, index_type: 'btree' },
              { index_name: 'idx_user', column_name: 'user_id', is_unique: false, is_primary: false, index_type: 'btree' },
              { index_name: 'idx_date', column_name: 'order_date', is_unique: false, is_primary: false, index_type: 'btree' }
            ]
          });
        } else {
          return Promise.resolve({ rows: [] });
        }
      }

      // Foreign keys query
      if (sql.includes('FROM information_schema.table_constraints') && sql.includes('key_column_usage') && params) {
        const tableName = params[1];

        if (tableName === 'orders') {
          return Promise.resolve({
            rows: [
              {
                name: 'orders_user_id_fkey',
                column_name: 'user_id',
                referenced_table: 'users',
                referenced_column: 'id',
                on_update: 'NO ACTION',
                on_delete: 'CASCADE'
              }
            ]
          });
        } else if (tableName === 'order_items') {
          return Promise.resolve({
            rows: [
              {
                name: 'order_items_order_id_fkey',
                column_name: 'order_id',
                referenced_table: 'orders',
                referenced_column: 'id',
                on_update: 'NO ACTION',
                on_delete: 'CASCADE'
              },
              {
                name: 'order_items_product_id_fkey',
                column_name: 'product_id',
                referenced_table: 'products',
                referenced_column: 'id',
                on_update: 'NO ACTION',
                on_delete: 'NO ACTION'
              }
            ]
          });
        } else {
          return Promise.resolve({ rows: [] });
        }
      }

      // Views query
      if (sql.includes('FROM information_schema.views')) {
        return Promise.resolve({
          rows: [
            { name: 'active_users', definition: 'SELECT id, email, username FROM users WHERE is_active = true;' }
          ]
        });
      }

      // Functions/Procedures query
      if (sql.includes('FROM information_schema.routines')) {
        return Promise.resolve({
          rows: [
            { name: 'get_user_count', return_type: 'integer' }
          ]
        });
      }

      // Default empty result
      return Promise.resolve({ rows: [] });
    });

    connector = new PostgreSQLConnector(config);
    await connector.connect();
  });

  it('should connect successfully', () => {
    expect(connector).toBeDefined();
  });

  it('should list all tables', async () => {
    const tables = await connector.listTables();

    expect(tables).toHaveLength(4);
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('products');
    expect(tableNames).toContain('orders');
    expect(tableNames).toContain('order_items');
  });

  it('should get complete schema', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('postgresql');
    expect(schema.databaseName).toBe('testdb');
    expect(schema.tables).toHaveLength(4);

    const usersTable = schema.tables.find(t => t.name === 'users');
    expect(usersTable).toBeDefined();
    expect(usersTable?.comment).toBe('User accounts');
    expect(usersTable?.columns).toHaveLength(7);

    const emailColumn = usersTable?.columns.find(c => c.name === 'email');
    expect(emailColumn?.comment).toBe('User email address');
  });

  it('should get table details with foreign keys', async () => {
    const orderDetails = await connector.getTableDetails('orders');

    expect(orderDetails).toBeDefined();
    expect(orderDetails?.name).toBe('orders');
    expect(orderDetails?.foreignKeys?.length).toBeGreaterThanOrEqual(1);

    const userFk = orderDetails?.foreignKeys?.find(fk => fk.columns.includes('user_id'));
    expect(userFk).toMatchObject({
      columns: ['user_id'],
      referencedTable: 'users',
      referencedColumns: ['id']
    });
  });

  it('should get order_items table with multiple foreign keys', async () => {
    const details = await connector.getTableDetails('order_items');

    expect(details?.foreignKeys?.length).toBeGreaterThanOrEqual(2);

    const orderFk = details?.foreignKeys?.find(fk => fk.columns.includes('order_id'));
    expect(orderFk).toBeDefined();

    const productFk = details?.foreignKeys?.find(fk => fk.columns.includes('product_id'));
    expect(productFk).toBeDefined();
  });

  it('should handle JSONB and ARRAY types', async () => {
    const usersDetails = await connector.getTableDetails('users');
    const metadataColumn = usersDetails?.columns.find(c => c.name === 'metadata');
    expect(metadataColumn?.type).toBe('jsonb');

    const productsDetails = await connector.getTableDetails('products');
    const tagsColumn = productsDetails?.columns.find(c => c.name === 'tags');
    expect(tagsColumn?.type).toBe('ARRAY');
  });

  it('should handle BOOLEAN type', async () => {
    const userDetails = await connector.getTableDetails('users');
    const isActiveColumn = userDetails?.columns.find(c => c.name === 'is_active');

    expect(isActiveColumn?.type).toBe('boolean');
    expect(isActiveColumn?.defaultValue).toBe('true');
  });

  it('should handle SERIAL columns', async () => {
    const userDetails = await connector.getTableDetails('users');
    const idColumn = userDetails?.columns.find(c => c.name === 'id');

    expect(idColumn).toBeDefined();
    expect(idColumn?.type).toBe('integer');
    expect(idColumn?.defaultValue).toContain('nextval');
  });

  it('should extract views', async () => {
    const schema = await connector.getSchema();

    expect(schema.views).toBeDefined();
    expect(schema.views?.length).toBeGreaterThanOrEqual(1);

    const activeUsersView = schema.views?.find(v => v.name === 'active_users');
    expect(activeUsersView).toBeDefined();
  });

  it('should extract functions', async () => {
    const schema = await connector.getSchema();

    expect(schema.procedures).toBeDefined();
    expect(schema.procedures?.length).toBeGreaterThanOrEqual(1);

    const getUserCount = schema.procedures?.find(p => p.name === 'get_user_count');
    expect(getUserCount).toBeDefined();
  });

  it('should search for columns', async () => {
    const idTables = await connector.searchColumns('id');
    expect(idTables.length).toBeGreaterThanOrEqual(4);
    expect(idTables).toContain('users');

    const emailTables = await connector.searchColumns('email');
    expect(emailTables).toContain('users');
  });

  it('should disconnect properly', async () => {
    await connector.disconnect();
    expect(mockEnd).toHaveBeenCalled();
  });
});
