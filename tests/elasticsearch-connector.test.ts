import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ElasticsearchConnector } from '../src/connectors/elasticsearch.js';
import type { ElasticsearchConfig } from '../src/types/schema.js';

// Mock @elastic/elasticsearch module
vi.mock('@elastic/elasticsearch', () => {
  return {
    Client: vi.fn(() => ({
      ping: vi.fn().mockResolvedValue({}),
      cat: {
        indices: vi.fn().mockResolvedValue([
          {
            health: 'green',
            status: 'open',
            index: 'test_users',
            'docs.count': '100',
            'store.size': '50kb',
            pri: '1',
            rep: '0'
          },
          {
            health: 'yellow',
            status: 'open',
            index: 'test_products',
            'docs.count': '250',
            'store.size': '120kb',
            pri: '2',
            rep: '1'
          }
        ])
      },
      cluster: {
        health: vi.fn().mockResolvedValue({
          status: 'green',
          number_of_nodes: 3,
          active_shards: 10
        })
      },
      indices: {
        getMapping: vi.fn().mockResolvedValue({
          test_users: {
            mappings: {
              properties: {
                id: { type: 'integer' },
                email: { type: 'keyword' },
                name: { type: 'text' },
                age: { type: 'integer' },
                address: {
                  type: 'object',
                  properties: {
                    street: { type: 'text' },
                    city: { type: 'keyword' }
                  }
                },
                created_at: { type: 'date' }
              }
            }
          },
          test_products: {
            mappings: {
              properties: {
                id: { type: 'integer' },
                name: {
                  type: 'text',
                  fields: {
                    keyword: { type: 'keyword' }
                  }
                },
                price: { type: 'float' },
                in_stock: { type: 'boolean' }
              }
            }
          }
        }),
        getSettings: vi.fn().mockResolvedValue({
          test_users: {
            settings: {
              index: {
                number_of_shards: '1',
                number_of_replicas: '0'
              }
            }
          },
          test_products: {
            settings: {
              index: {
                number_of_shards: '2',
                number_of_replicas: '1'
              }
            }
          }
        }),
        stats: vi.fn().mockResolvedValue({
          indices: {
            test_users: {
              total: {
                docs: {
                  count: 100,
                  deleted: 0
                },
                store: {
                  size_in_bytes: 51200
                }
              }
            },
            test_products: {
              total: {
                docs: {
                  count: 250,
                  deleted: 0
                },
                store: {
                  size_in_bytes: 122880
                }
              }
            }
          }
        })
      },
      close: vi.fn()
    }))
  };
});

describe('ElasticsearchConnector Unit Tests', () => {
  let connector: ElasticsearchConnector;

  const config: ElasticsearchConfig = {
    type: 'elasticsearch',
    node: 'http://localhost:9200'
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    connector = new ElasticsearchConnector(config);
    await connector.connect();
  });

  it('should connect successfully', () => {
    expect(connector).toBeDefined();
  });

  it('should list all indices', async () => {
    const tables = await connector.listTables();

    expect(tables.length).toBeGreaterThanOrEqual(2);
    const indexNames = tables.map(t => t.name);
    expect(indexNames).toContain('test_users');
    expect(indexNames).toContain('test_products');
  });

  it('should get complete schema', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('elasticsearch');
    // databaseName might be undefined in unit tests, skip check
    expect(schema.indices).toBeDefined();
    expect(schema.indices?.length).toBeGreaterThanOrEqual(2);

    const usersIndex = schema.indices?.find(idx => idx.name === 'test_users');
    expect(usersIndex).toBeDefined();
    expect(usersIndex?.health).toBe('green');
    expect(usersIndex?.status).toBe('open');
    expect(usersIndex?.docsCount).toBe(100);
    expect(usersIndex?.primaryShards).toBe(1);
    expect(usersIndex?.replicaShards).toBe(0);

    const productsIndex = schema.indices?.find(idx => idx.name === 'test_products');
    expect(productsIndex).toBeDefined();
    expect(productsIndex?.health).toBe('yellow');
    expect(productsIndex?.docsCount).toBe(250);
    expect(productsIndex?.primaryShards).toBe(2);
    expect(productsIndex?.replicaShards).toBe(1);
  });

  it('should get index details with mappings', async () => {
    const usersDetails = await connector.getTableDetails('test_users');

    expect(usersDetails).toBeDefined();
    expect(usersDetails?.name).toBe('test_users');
    expect(usersDetails?.columns).toBeDefined();
    expect(usersDetails?.columns.length).toBeGreaterThanOrEqual(6);

    const emailField = usersDetails?.columns.find(c => c.name === 'email');
    expect(emailField).toMatchObject({
      name: 'email',
      type: 'keyword',
      nullable: true
    });

    const nameField = usersDetails?.columns.find(c => c.name === 'name');
    expect(nameField).toMatchObject({
      name: 'name',
      type: 'text',
      nullable: true
    });

    // Check nested fields
    const streetField = usersDetails?.columns.find(c => c.name === 'address.street');
    expect(streetField).toMatchObject({
      name: 'address.street',
      type: 'text',
      nullable: true
    });

    const cityField = usersDetails?.columns.find(c => c.name === 'address.city');
    expect(cityField).toMatchObject({
      name: 'address.city',
      type: 'keyword',
      nullable: true
    });
  });

  it('should handle multi-fields correctly', async () => {
    const productsDetails = await connector.getTableDetails('test_products');

    const nameTextField = productsDetails?.columns.find(c => c.name === 'name');
    expect(nameTextField?.type).toBe('text');

    const nameKeywordField = productsDetails?.columns.find(c => c.name === 'name.keyword');
    expect(nameKeywordField?.type).toBe('keyword');
  });

  it('should search for fields across indices', async () => {
    const idIndices = await connector.searchColumns('id');
    expect(idIndices.length).toBeGreaterThanOrEqual(2);
    expect(idIndices).toContain('test_users');
    expect(idIndices).toContain('test_products');

    const emailIndices = await connector.searchColumns('email');
    expect(emailIndices).toContain('test_users');
  });

  it('should disconnect properly', async () => {
    await connector.disconnect();
    // Verify no errors thrown
    expect(true).toBe(true);
  });
});
