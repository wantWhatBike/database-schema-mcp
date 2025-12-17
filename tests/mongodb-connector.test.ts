import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MongoDBConnector } from '../src/connectors/mongodb.js';
import type { MongoDBConfig } from '../src/types/schema.js';

// Use vi.hoisted to create mocks before vi.mock
const { mockConnect, mockClose, mockServerInfo, mockListCollections, mockCollection, mockDb, mockClient } = vi.hoisted(() => {
  const mockCountDocuments = vi.fn();
  const mockAggregate = vi.fn();
  const mockIndexes = vi.fn();
  const mockToArray = vi.fn();
  const mockHasNext = vi.fn();

  const mockCollection = vi.fn(() => ({
    countDocuments: mockCountDocuments,
    aggregate: mockAggregate,
    indexes: mockIndexes,
  }));

  const mockListCollections = vi.fn(() => ({
    toArray: mockToArray,
    hasNext: mockHasNext,
  }));

  const mockServerInfo = vi.fn();
  const mockAdmin = vi.fn(() => ({
    serverInfo: mockServerInfo,
  }));

  const mockDb = {
    listCollections: mockListCollections,
    collection: mockCollection,
    admin: mockAdmin,
  };

  const mockConnect = vi.fn();
  const mockClose = vi.fn();

  const mockClient = {
    connect: mockConnect,
    close: mockClose,
    db: vi.fn(() => mockDb),
  };

  return {
    mockConnect,
    mockClose,
    mockServerInfo,
    mockListCollections,
    mockCollection,
    mockCountDocuments,
    mockAggregate,
    mockIndexes,
    mockToArray,
    mockHasNext,
    mockDb,
    mockClient,
  };
});

// Mock mongodb module
vi.mock('mongodb', () => {
  return {
    MongoClient: vi.fn(() => mockClient),
  };
});

describe('MongoDBConnector Unit Tests', () => {
  let connector: MongoDBConnector;

  const config: MongoDBConfig = {
    type: 'mongodb',
    uri: 'mongodb://root:test_password@localhost:27017',
    database: 'testdb',
    sampleSize: 100
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup default mock responses
    mockConnect.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
    mockServerInfo.mockResolvedValue({ version: '6.0.5' });

    // Default listCollections response
    mockListCollections().toArray.mockResolvedValue([
      { name: 'users', type: 'collection' },
      { name: 'products', type: 'collection' },
      { name: 'orders', type: 'collection' },
    ]);

    // Default hasNext for collection existence check
    mockListCollections().hasNext.mockResolvedValue(true);

    // Default countDocuments
    const mockCountDocuments = mockCollection().countDocuments;
    mockCountDocuments.mockImplementation(() => {
      return Promise.resolve(3);
    });

    // Default aggregate (sample documents)
    const mockAggregate = mockCollection().aggregate;
    mockAggregate.mockImplementation(() => ({
      toArray: vi.fn().mockResolvedValue([
        {
          _id: 1,
          email: 'user1@example.com',
          username: 'user1',
          age: 25,
          isActive: true,
          tags: ['admin', 'user'],
          metadata: { role: 'admin', level: 5 },
          createdAt: new Date('2024-01-01')
        },
        {
          _id: 2,
          email: 'user2@example.com',
          username: 'user2',
          age: 30,
          isActive: false,
          tags: ['user'],
          metadata: { role: 'user', level: 2 },
          createdAt: new Date('2024-02-01')
        },
        {
          _id: 3,
          email: 'user3@example.com',
          username: 'user3',
          isActive: true,
          tags: [],
          metadata: null,
          createdAt: new Date('2024-03-01')
        }
      ])
    }));

    // Default indexes
    const mockIndexes = mockCollection().indexes;
    mockIndexes.mockResolvedValue([
      { name: '_id_', key: { _id: 1 }, unique: true },
      { name: 'email_1', key: { email: 1 }, unique: true },
      { name: 'username_1', key: { username: 1 }, unique: false },
      { name: 'createdAt_-1', key: { createdAt: -1 }, unique: false },
    ]);

    connector = new MongoDBConnector(config);
    await connector.connect();
  });

  it('should connect successfully', async () => {
    expect(mockConnect).toHaveBeenCalled();
    expect(connector).toBeDefined();
  });

  it('should disconnect properly', async () => {
    await connector.disconnect();
    expect(mockClose).toHaveBeenCalled();
  });

  it('should list all collections', async () => {
    const tables = await connector.listTables();

    expect(tables).toHaveLength(3);
    expect(tables[0]).toMatchObject({ name: 'users', type: 'collection' });
    expect(tables[1]).toMatchObject({ name: 'products', type: 'collection' });
    expect(tables[2]).toMatchObject({ name: 'orders', type: 'collection' });
  });

  it('should get complete schema', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('mongodb');
    expect(schema.databaseName).toBe('testdb');
    expect(schema.version).toBe('MongoDB 6.0.5');
    expect(schema.collections).toBeDefined();
    expect(schema.collections?.length).toBe(3);
  });

  it('should get collection details', async () => {
    const details = await connector.getTableDetails('users');

    expect(details).toBeDefined();
    expect(details?.name).toBe('users');
    expect(details?.type).toBe('collection');
    expect(details?.rowCount).toBe(3);
  });

  it('should return null for non-existent collection', async () => {
    mockListCollections().hasNext.mockResolvedValueOnce(false);

    const details = await connector.getTableDetails('nonexistent');
    expect(details).toBeNull();
  });

  it('should handle empty collections', async () => {
    const mockCountDocuments = mockCollection().countDocuments;
    const mockAggregate = mockCollection().aggregate;

    mockCountDocuments.mockResolvedValueOnce(0);
    mockAggregate.mockReturnValueOnce({
      toArray: vi.fn().mockResolvedValue([])
    });

    const details = await connector.getTableDetails('empty_collection');

    expect(details).toBeDefined();
    expect(details?.rowCount).toBe(0);
  });

  it('should infer field types correctly', async () => {
    const mockAggregate = mockCollection().aggregate;

    mockAggregate.mockReturnValueOnce({
      toArray: vi.fn().mockResolvedValue([
        { name: 'Alice', age: 30, isActive: true },
        { name: 'Bob', age: 25, isActive: false },
        { name: 'Charlie', age: null, isActive: true },
      ])
    });

    await connector.getTableDetails('test_collection');

    // Verify aggregate was called with correct sample size
    expect(mockAggregate).toHaveBeenCalledWith([{ $sample: { size: 3 } }]);
  });

  it('should handle nested objects', async () => {
    const mockAggregate = mockCollection().aggregate;

    mockAggregate.mockReturnValueOnce({
      toArray: vi.fn().mockResolvedValue([
        {
          _id: 'prod1',
          name: 'Product 1',
          specs: {
            weight: 0.5,
            dimensions: { width: 10, height: 5, depth: 2 }
          }
        }
      ])
    });

    const details = await connector.getTableDetails('products');

    expect(details).toBeDefined();
    expect(details?.rowCount).toBe(3);
  });

  it('should handle arrays', async () => {
    const mockAggregate = mockCollection().aggregate;

    mockAggregate.mockReturnValueOnce({
      toArray: vi.fn().mockResolvedValue([
        { tags: ['tag1', 'tag2'] },
        { tags: ['tag3'] },
        { tags: [] },
      ])
    });

    const details = await connector.getTableDetails('test_collection');

    expect(details).toBeDefined();
  });

  it('should extract indexes', async () => {
    const mockIndexes = mockCollection().indexes;

    mockIndexes.mockResolvedValueOnce([
      { name: '_id_', key: { _id: 1 }, unique: true },
      { name: 'email_1', key: { email: 1 }, unique: true },
      { name: 'compound_idx', key: { field1: 1, field2: -1 }, unique: false },
    ]);

    await connector.getTableDetails('users');

    expect(mockIndexes).toHaveBeenCalled();
  });

  it('should respect sampleSize configuration', async () => {
    const mockCountDocuments = mockCollection().countDocuments;
    const mockAggregate = mockCollection().aggregate;

    mockCountDocuments.mockResolvedValueOnce(200);
    mockAggregate.mockReturnValueOnce({
      toArray: vi.fn().mockResolvedValue([])
    });

    await connector.getTableDetails('large_collection');

    // Should sample min(sampleSize, documentCount) = min(100, 200) = 100
    expect(mockAggregate).toHaveBeenCalledWith([{ $sample: { size: 100 } }]);
  });

  it('should handle date fields', async () => {
    const mockAggregate = mockCollection().aggregate;

    mockAggregate.mockReturnValueOnce({
      toArray: vi.fn().mockResolvedValue([
        { createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-02') },
        { createdAt: new Date('2024-02-01'), updatedAt: new Date('2024-02-02') },
      ])
    });

    const details = await connector.getTableDetails('test_collection');

    expect(details).toBeDefined();
  });

  it('should handle boolean fields', async () => {
    const mockAggregate = mockCollection().aggregate;

    mockAggregate.mockReturnValueOnce({
      toArray: vi.fn().mockResolvedValue([
        { isActive: true, isDeleted: false },
        { isActive: false, isDeleted: false },
        { isActive: true, isDeleted: true },
      ])
    });

    const details = await connector.getTableDetails('test_collection');

    expect(details).toBeDefined();
  });

  it('should handle null values', async () => {
    const mockAggregate = mockCollection().aggregate;

    mockAggregate.mockReturnValueOnce({
      toArray: vi.fn().mockResolvedValue([
        { name: 'Alice', metadata: { role: 'admin' } },
        { name: 'Bob', metadata: null },
        { name: 'Charlie' }, // metadata field missing
      ])
    });

    const details = await connector.getTableDetails('test_collection');

    expect(details).toBeDefined();
  });

  it('should handle mixed type IDs', async () => {
    const mockAggregate = mockCollection().aggregate;

    // Test with number IDs
    mockAggregate.mockReturnValueOnce({
      toArray: vi.fn().mockResolvedValue([
        { _id: 1, name: 'Item 1' },
        { _id: 2, name: 'Item 2' },
      ])
    });

    let details = await connector.getTableDetails('numeric_ids');
    expect(details).toBeDefined();

    // Test with string IDs
    mockAggregate.mockReturnValueOnce({
      toArray: vi.fn().mockResolvedValue([
        { _id: 'abc123', name: 'Item 1' },
        { _id: 'def456', name: 'Item 2' },
      ])
    });

    details = await connector.getTableDetails('string_ids');
    expect(details).toBeDefined();
  });

  it('should get database version', async () => {
    const schema = await connector.getSchema();

    expect(mockServerInfo).toHaveBeenCalled();
    expect(schema.version).toBe('MongoDB 6.0.5');
  });

  it('should handle connection errors', async () => {
    mockConnect.mockRejectedValueOnce(new Error('Connection failed'));

    const failingConnector = new MongoDBConnector(config);

    await expect(failingConnector.connect()).rejects.toThrow('Failed to connect to MongoDB');
  });

  it('should test connection successfully', async () => {
    const testConnector = new MongoDBConnector(config);
    const result = await testConnector.testConnection();

    expect(result).toBe(true);
    expect(mockConnect).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });

  it('should handle test connection failure', async () => {
    mockConnect.mockRejectedValueOnce(new Error('Connection failed'));

    const testConnector = new MongoDBConnector(config);
    const result = await testConnector.testConnection();

    expect(result).toBe(false);
  });
});
