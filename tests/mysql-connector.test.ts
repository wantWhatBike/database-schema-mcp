import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MySQLConnector } from '../src/connectors/mysql.js';
import type { MySQLConfig } from '../src/types/schema.js';

// Use vi.hoisted to create mocks before vi.mock
const { mockQuery, mockEnd, mockConnection } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  const mockEnd = vi.fn();
  const mockConnection = {
    query: mockQuery,
    end: mockEnd
  };

  return { mockQuery, mockEnd, mockConnection };
});

// Mock mysql2/promise module
vi.mock('mysql2/promise', () => {
  return {
    default: {
      createConnection: vi.fn(() => Promise.resolve(mockConnection))
    }
  };
});

describe('MySQLConnector Unit Tests', () => {
  let connector: MySQLConnector;

  const config: MySQLConfig = {
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    database: 'testdb',
    user: 'root',
    password: 'test_password'
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup default mock responses
    mockQuery.mockImplementation((sql: string, params?: any[]) => {
      // Version query
      if (sql.includes('SELECT VERSION()')) {
        return Promise.resolve([[{ version: '8.0.33' }]]);
      }

      // List tables query
      if (sql.includes('FROM information_schema.TABLES') && sql.includes('TABLE_TYPE = \'BASE TABLE\'') && !sql.includes('TABLE_NAME = ?')) {
        return Promise.resolve([[
          { name: 'users', comment: 'User accounts', rowCount: 100 },
          { name: 'products', comment: 'Product catalog', rowCount: 250 },
          { name: 'orders', comment: 'Customer orders', rowCount: 500 },
          { name: 'order_items', comment: '', rowCount: 1200 }
        ]]);
      }

      // Get specific table info
      if (sql.includes('FROM information_schema.TABLES') && sql.includes('TABLE_NAME = ?') && params) {
        const tableName = params[1];
        const tableData: Record<string, any> = {
          'users': { TABLE_NAME: 'users', TABLE_COMMENT: 'User accounts', TABLE_ROWS: 100 },
          'products': { TABLE_NAME: 'products', TABLE_COMMENT: 'Product catalog', TABLE_ROWS: 250 },
          'orders': { TABLE_NAME: 'orders', TABLE_COMMENT: 'Customer orders', TABLE_ROWS: 500 },
          'order_items': { TABLE_NAME: 'order_items', TABLE_COMMENT: '', TABLE_ROWS: 1200 }
        };
        return Promise.resolve([[tableData[tableName]]]);
      }

      // List views query
      if (sql.includes('FROM information_schema.VIEWS')) {
        return Promise.resolve([[
          { name: 'active_users', definition: 'SELECT id, email, username FROM users WHERE age >= 18' }
        ]]);
      }

      // List procedures query
      if (sql.includes('FROM information_schema.ROUTINES')) {
        return Promise.resolve([[
          { name: 'get_user_count', type: 'PROCEDURE', returnType: null }
        ]]);
      }

      // Table columns query
      if (sql.includes('FROM information_schema.COLUMNS') && params && params[1]) {
        const tableName = params[1];

        if (tableName === 'users') {
          return Promise.resolve([[
            {
              name: 'id',
              type: 'int',
              nullable: 'NO',
              columnKey: 'PRI',
              defaultValue: null,
              extra: 'auto_increment',
              comment: '',
              maxLength: null
            },
            {
              name: 'email',
              type: 'varchar(255)',
              nullable: 'NO',
              columnKey: 'UNI',
              defaultValue: null,
              extra: '',
              comment: '',
              maxLength: 255
            },
            {
              name: 'username',
              type: 'varchar(100)',
              nullable: 'NO',
              columnKey: 'MUL',
              defaultValue: null,
              extra: '',
              comment: '',
              maxLength: 100
            },
            {
              name: 'age',
              type: 'int',
              nullable: 'YES',
              columnKey: '',
              defaultValue: null,
              extra: '',
              comment: '',
              maxLength: null
            },
            {
              name: 'created_at',
              type: 'timestamp',
              nullable: 'YES',
              columnKey: 'MUL',
              defaultValue: 'CURRENT_TIMESTAMP',
              extra: 'DEFAULT_GENERATED',
              comment: '',
              maxLength: null
            }
          ]]);
        } else if (tableName === 'products') {
          return Promise.resolve([[
            { name: 'id', type: 'int', nullable: 'NO', columnKey: 'PRI', defaultValue: null, extra: 'auto_increment', comment: '', maxLength: null },
            { name: 'name', type: 'varchar(255)', nullable: 'NO', columnKey: 'UNI', defaultValue: null, extra: '', comment: '', maxLength: 255 },
            { name: 'price', type: 'decimal(10,2)', nullable: 'NO', columnKey: '', defaultValue: null, extra: '', comment: '', maxLength: null },
            { name: 'stock', type: 'int', nullable: 'YES', columnKey: '', defaultValue: '0', extra: '', comment: '', maxLength: null }
          ]]);
        } else if (tableName === 'orders') {
          return Promise.resolve([[
            { name: 'id', type: 'int', nullable: 'NO', columnKey: 'PRI', defaultValue: null, extra: 'auto_increment', comment: '', maxLength: null },
            { name: 'user_id', type: 'int', nullable: 'NO', columnKey: 'MUL', defaultValue: null, extra: '', comment: '', maxLength: null },
            { name: 'order_date', type: 'datetime', nullable: 'NO', columnKey: 'MUL', defaultValue: null, extra: '', comment: '', maxLength: null },
            { name: 'total', type: 'decimal(10,2)', nullable: 'YES', columnKey: '', defaultValue: null, extra: '', comment: '', maxLength: null },
            { name: 'status', type: "enum('pending','shipped','delivered')", nullable: 'YES', columnKey: '', defaultValue: 'pending', extra: '', comment: '', maxLength: null }
          ]]);
        } else if (tableName === 'order_items') {
          return Promise.resolve([[
            { name: 'id', type: 'int', nullable: 'NO', columnKey: 'PRI', defaultValue: null, extra: 'auto_increment', comment: '', maxLength: null },
            { name: 'order_id', type: 'int', nullable: 'NO', columnKey: 'MUL', defaultValue: null, extra: '', comment: '', maxLength: null },
            { name: 'product_id', type: 'int', nullable: 'NO', columnKey: 'MUL', defaultValue: null, extra: '', comment: '', maxLength: null },
            { name: 'quantity', type: 'int', nullable: 'NO', columnKey: '', defaultValue: null, extra: '', comment: '', maxLength: null },
            { name: 'price', type: 'decimal(10,2)', nullable: 'NO', columnKey: '', defaultValue: null, extra: '', comment: '', maxLength: null }
          ]]);
        }
      }

      // Table indexes query
      if (sql.includes('FROM information_schema.STATISTICS') && params && params[1]) {
        const tableName = params[1];

        if (tableName === 'users') {
          return Promise.resolve([[
            { name: 'PRIMARY', columnName: 'id', nonUnique: 0, seqInIndex: 1, indexType: 'BTREE' },
            { name: 'email', columnName: 'email', nonUnique: 0, seqInIndex: 1, indexType: 'BTREE' },
            { name: 'idx_username', columnName: 'username', nonUnique: 1, seqInIndex: 1, indexType: 'BTREE' },
            { name: 'idx_created', columnName: 'created_at', nonUnique: 1, seqInIndex: 1, indexType: 'BTREE' }
          ]]);
        } else if (tableName === 'orders') {
          return Promise.resolve([[
            { name: 'PRIMARY', columnName: 'id', nonUnique: 0, seqInIndex: 1, indexType: 'BTREE' },
            { name: 'idx_user', columnName: 'user_id', nonUnique: 1, seqInIndex: 1, indexType: 'BTREE' },
            { name: 'idx_date', columnName: 'order_date', nonUnique: 1, seqInIndex: 1, indexType: 'BTREE' }
          ]]);
        } else if (tableName === 'products') {
          return Promise.resolve([[
            { name: 'PRIMARY', columnName: 'id', nonUnique: 0, seqInIndex: 1, indexType: 'BTREE' },
            { name: 'idx_name', columnName: 'name', nonUnique: 0, seqInIndex: 1, indexType: 'BTREE' }
          ]]);
        } else if (tableName === 'order_items') {
          return Promise.resolve([[
            { name: 'PRIMARY', columnName: 'id', nonUnique: 0, seqInIndex: 1, indexType: 'BTREE' },
            { name: 'idx_order', columnName: 'order_id', nonUnique: 1, seqInIndex: 1, indexType: 'BTREE' },
            { name: 'idx_product', columnName: 'product_id', nonUnique: 1, seqInIndex: 1, indexType: 'BTREE' }
          ]]);
        }
      }

      // Foreign keys query
      if (sql.includes('FROM information_schema.KEY_COLUMN_USAGE') && sql.includes('JOIN information_schema.REFERENTIAL_CONSTRAINTS') && params && params[1]) {
        const tableName = params[1];

        if (tableName === 'orders') {
          return Promise.resolve([[
            {
              name: 'orders_ibfk_1',
              columnName: 'user_id',
              referencedTable: 'users',
              referencedColumn: 'id',
              onUpdate: 'RESTRICT',
              onDelete: 'CASCADE'
            }
          ]]);
        } else if (tableName === 'order_items') {
          return Promise.resolve([[
            {
              name: 'order_items_ibfk_1',
              columnName: 'order_id',
              referencedTable: 'orders',
              referencedColumn: 'id',
              onUpdate: 'RESTRICT',
              onDelete: 'CASCADE'
            },
            {
              name: 'order_items_ibfk_2',
              columnName: 'product_id',
              referencedTable: 'products',
              referencedColumn: 'id',
              onUpdate: 'RESTRICT',
              onDelete: 'RESTRICT'
            }
          ]]);
        } else {
          return Promise.resolve([[]]);
        }
      }

      // Search columns query
      if (sql.includes('FROM information_schema.COLUMNS') && sql.includes('COLUMN_NAME LIKE') && params) {
        const searchTerm = params[1].replace(/%/g, '');

        if (searchTerm === 'id') {
          return Promise.resolve([[
            { table: 'users' },
            { table: 'products' },
            { table: 'orders' },
            { table: 'order_items' }
          ]]);
        } else if (searchTerm === 'email') {
          return Promise.resolve([[{ table: 'users' }]]);
        } else if (searchTerm === 'nonexistent_column') {
          return Promise.resolve([[]]);
        }
      }

      // Default empty result
      return Promise.resolve([[]]);
    });

    connector = new MySQLConnector(config);
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

    expect(schema.databaseType).toBe('mysql');
    expect(schema.databaseName).toBe('testdb');
    expect(schema.tables).toHaveLength(4);

    // Check users table
    const usersTable = schema.tables.find(t => t.name === 'users');
    expect(usersTable).toBeDefined();
    expect(usersTable?.comment).toBe('User accounts');
    expect(usersTable?.columns).toHaveLength(5);

    // Check columns
    const emailColumn = usersTable?.columns.find(c => c.name === 'email');
    expect(emailColumn).toMatchObject({
      name: 'email',
      type: 'varchar(255)',
      nullable: false
    });

    const ageColumn = usersTable?.columns.find(c => c.name === 'age');
    expect(ageColumn?.nullable).toBe(true);

    // Check indexes
    expect(usersTable?.indexes?.length).toBeGreaterThanOrEqual(3);
    const primaryIndex = usersTable?.indexes?.find(idx => idx.name === 'PRIMARY');
    expect(primaryIndex).toMatchObject({
      name: 'PRIMARY',
      columns: ['id'],
      isUnique: true,
      isPrimary: true
    });

    const emailIndex = usersTable?.indexes?.find(idx => idx.name === 'email');
    expect(emailIndex).toMatchObject({
      isUnique: true,
      isPrimary: false
    });
  });

  it('should get table details with foreign keys', async () => {
    const orderDetails = await connector.getTableDetails('orders');

    expect(orderDetails).toBeDefined();
    expect(orderDetails?.name).toBe('orders');
    expect(orderDetails?.columns).toHaveLength(5);

    // Check foreign keys
    expect(orderDetails?.foreignKeys?.length).toBeGreaterThanOrEqual(1);
    const userFk = orderDetails?.foreignKeys?.find(fk => fk.columns.includes('user_id'));
    expect(userFk).toMatchObject({
      columns: ['user_id'],
      referencedTable: 'users',
      referencedColumns: ['id']
    });

    // Check ENUM type
    const statusColumn = orderDetails?.columns.find(c => c.name === 'status');
    expect(statusColumn?.type).toContain('enum');
  });

  it('should get order_items table with multiple foreign keys', async () => {
    const details = await connector.getTableDetails('order_items');

    expect(details?.foreignKeys?.length).toBeGreaterThanOrEqual(2);

    const orderFk = details?.foreignKeys?.find(fk => fk.columns.includes('order_id'));
    expect(orderFk).toMatchObject({
      columns: ['order_id'],
      referencedTable: 'orders',
      referencedColumns: ['id']
    });

    const productFk = details?.foreignKeys?.find(fk => fk.columns.includes('product_id'));
    expect(productFk).toMatchObject({
      columns: ['product_id'],
      referencedTable: 'products',
      referencedColumns: ['id']
    });
  });

  it('should extract views', async () => {
    const schema = await connector.getSchema();

    expect(schema.views).toBeDefined();
    expect(schema.views?.length).toBeGreaterThanOrEqual(1);

    const activeUsersView = schema.views?.find(v => v.name === 'active_users');
    expect(activeUsersView).toBeDefined();
    expect(activeUsersView?.definition).toContain('SELECT');
    expect(activeUsersView?.definition).toContain('users');
  });

  it('should extract stored procedures', async () => {
    const schema = await connector.getSchema();

    expect(schema.procedures).toBeDefined();
    expect(schema.procedures?.length).toBeGreaterThanOrEqual(1);

    const getUserCount = schema.procedures?.find(p => p.name === 'get_user_count');
    expect(getUserCount).toBeDefined();
    expect(getUserCount?.name).toBe('get_user_count');
  });

  it('should search for columns', async () => {
    const idTables = await connector.searchColumns('id');
    expect(idTables.length).toBeGreaterThanOrEqual(4);
    expect(idTables).toContain('users');
    expect(idTables).toContain('orders');

    const emailTables = await connector.searchColumns('email');
    expect(emailTables).toContain('users');

    const nonExistent = await connector.searchColumns('nonexistent_column');
    expect(nonExistent).toHaveLength(0);
  });

  it('should handle DECIMAL type correctly', async () => {
    const productDetails = await connector.getTableDetails('products');
    const priceColumn = productDetails?.columns.find(c => c.name === 'price');

    expect(priceColumn).toBeDefined();
    expect(priceColumn?.type).toBe('decimal(10,2)');
    expect(priceColumn?.nullable).toBe(false);
  });

  it('should handle AUTO_INCREMENT correctly', async () => {
    const userDetails = await connector.getTableDetails('users');
    const idColumn = userDetails?.columns.find(c => c.name === 'id');

    expect(idColumn).toBeDefined();
    expect(idColumn?.type).toBe('int');
    expect(idColumn?.isAutoIncrement).toBe(true);
  });

  it('should disconnect properly', async () => {
    await connector.disconnect();
    expect(mockEnd).toHaveBeenCalled();
  });
});
