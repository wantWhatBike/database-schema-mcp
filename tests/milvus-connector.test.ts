import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MilvusConnector } from '../src/connectors/milvus.js';
import type { MilvusConfig } from '../src/types/schema.js';

// Mock @zilliz/milvus2-sdk-node module
vi.mock('@zilliz/milvus2-sdk-node', () => {
  const DataType = {
    Int64: 5,
    VarChar: 21,
    FloatVector: 101,
    BinaryVector: 100,
    Float: 10
  };

  return {
    MilvusClient: vi.fn(() => ({
      checkHealth: vi.fn().mockResolvedValue({ isHealthy: true }),
      getVersion: vi.fn().mockResolvedValue({ version: '2.3.0' }),
      listCollections: vi.fn().mockResolvedValue({
        collection_names: ['test_images', 'test_documents', 'test_products']
      }),
      getCollectionStatistics: vi.fn((params: any) => {
        const stats: Record<string, string> = {
          'test_images': '1000',
          'test_documents': '5000',
          'test_products': '2000'
        };
        return Promise.resolve({
          data: {
            row_count: stats[params.collection_name] || '0'
          }
        });
      }),
      describeCollection: vi.fn((params: any) => {
        if (params.collection_name === 'test_images') {
          return Promise.resolve({
            schema: {
              name: 'test_images',
              description: 'Image embeddings collection',
              fields: [
                { name: 'id', data_type: DataType.Int64, is_primary_key: true, autoID: false },
                { name: 'image_url', data_type: DataType.VarChar, type_params: { max_length: 512 } },
                { name: 'embedding', data_type: DataType.FloatVector, type_params: { dim: 128 } },
                { name: 'category', data_type: DataType.VarChar, type_params: { max_length: 100 } }
              ]
            },
            num_entities: 1000,
            shards_num: 2
          });
        } else if (params.collection_name === 'test_documents') {
          return Promise.resolve({
            schema: {
              name: 'test_documents',
              description: 'Document embeddings collection',
              fields: [
                { name: 'doc_id', data_type: DataType.Int64, is_primary_key: true, autoID: true },
                { name: 'title', data_type: DataType.VarChar, type_params: { max_length: 256 } },
                { name: 'embedding', data_type: DataType.FloatVector, type_params: { dim: 768 } },
                { name: 'timestamp', data_type: DataType.Int64 }
              ]
            },
            num_entities: 5000,
            shards_num: 4
          });
        } else if (params.collection_name === 'test_products') {
          return Promise.resolve({
            schema: {
              name: 'test_products',
              description: 'Product feature vectors',
              fields: [
                { name: 'product_id', data_type: DataType.Int64, is_primary_key: true, autoID: false },
                { name: 'name', data_type: DataType.VarChar, type_params: { max_length: 200 } },
                { name: 'price', data_type: DataType.Float },
                { name: 'features', data_type: DataType.BinaryVector, type_params: { dim: 256 } }
              ]
            },
            num_entities: 2000,
            shards_num: 1
          });
        }
      }),
      describeIndex: vi.fn((params: any) => {
        if (params.collection_name === 'test_images') {
          return Promise.resolve({
            index_descriptions: [{
              index_name: '_default',
              field_name: 'embedding',
              params: {
                index_type: 'IVF_FLAT',
                metric_type: 'L2',
                nlist: 128
              }
            }]
          });
        } else if (params.collection_name === 'test_documents') {
          return Promise.resolve({
            index_descriptions: [{
              index_name: '_default',
              field_name: 'embedding',
              params: {
                index_type: 'HNSW',
                metric_type: 'IP',
                M: 16,
                efConstruction: 256
              }
            }]
          });
        } else if (params.collection_name === 'test_products') {
          return Promise.resolve({
            index_descriptions: [{
              index_name: '_default',
              field_name: 'features',
              params: {
                index_type: 'BIN_IVF_FLAT',
                metric_type: 'HAMMING',
                nlist: 128
              }
            }]
          });
        }
      }),
      closeConnection: vi.fn()
    })),
    DataType
  };
});

describe('MilvusConnector Unit Tests', () => {
  let connector: MilvusConnector;

  const config: MilvusConfig = {
    type: 'milvus',
    address: 'localhost:19530'
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    connector = new MilvusConnector(config);
    await connector.connect();
  });

  it('should connect successfully', () => {
    expect(connector).toBeDefined();
  });

  it('should list all collections', async () => {
    const tables = await connector.listTables();

    expect(tables.length).toBeGreaterThanOrEqual(3);
    const collectionNames = tables.map(t => t.name);
    expect(collectionNames).toContain('test_images');
    expect(collectionNames).toContain('test_documents');
    expect(collectionNames).toContain('test_products');
  });

  it('should get complete schema', async () => {
    const schema = await connector.getSchema();

    expect(schema.databaseType).toBe('milvus');
    expect(schema.databaseName).toBe('milvus');
    expect(schema.milvusCollections).toBeDefined();
    expect(schema.milvusCollections?.length).toBeGreaterThanOrEqual(3);

    // Check test_images collection
    const imagesCollection = schema.milvusCollections?.find(c => c.name === 'test_images');
    expect(imagesCollection).toBeDefined();
    expect(imagesCollection?.description).toBe('Image embeddings collection');
    expect(imagesCollection?.numEntities).toBe(1000);
    expect(imagesCollection?.shardsNum).toBe(2);
    expect(imagesCollection?.schema.fields.length).toBe(4);

    const embeddingField = imagesCollection?.schema.fields.find(f => f.name === 'embedding');
    expect(embeddingField).toMatchObject({
      name: 'embedding',
      type: 'FloatVector',
      dimension: 128
    });

    const embeddingIndex = imagesCollection?.indexes?.find(idx => idx.fieldName === 'embedding');
    expect(embeddingIndex).toMatchObject({
      indexName: '_default',
      fieldName: 'embedding',
      indexType: 'IVF_FLAT',
      metric: 'L2'
    });

    // Check test_documents collection
    const docsCollection = schema.milvusCollections?.find(c => c.name === 'test_documents');
    expect(docsCollection).toBeDefined();
    const docsEmbedding = docsCollection?.schema.fields.find(f => f.name === 'embedding');
    expect(docsEmbedding?.dimension).toBe(768);

    const docsIndex = docsCollection?.indexes?.find(idx => idx.fieldName === 'embedding');
    expect(docsIndex?.indexType).toBe('HNSW');
    expect(docsIndex?.metric).toBe('IP');

    // Check test_products collection with binary vector
    const productsCollection = schema.milvusCollections?.find(c => c.name === 'test_products');
    expect(productsCollection).toBeDefined();
    const featuresField = productsCollection?.schema.fields.find(f => f.name === 'features');
    expect(featuresField?.type).toBe('BinaryVector');
    expect(featuresField?.dimension).toBe(256);

    const featuresIndex = productsCollection?.indexes?.find(idx => idx.fieldName === 'features');
    expect(featuresIndex?.indexType).toBe('BIN_IVF_FLAT');
    expect(featuresIndex?.metric).toBe('HAMMING');
  });

  it('should get collection details', async () => {
    const imagesDetails = await connector.getTableDetails('test_images');

    expect(imagesDetails).toBeDefined();
    expect(imagesDetails?.name).toBe('test_images');
    expect(imagesDetails?.comment).toBe('Image embeddings collection');
    expect(imagesDetails?.columns).toBeDefined();
    expect(imagesDetails?.columns.length).toBe(4);

    const idColumn = imagesDetails?.columns.find(c => c.name === 'id');
    expect(idColumn).toMatchObject({
      name: 'id',
      type: 'Int64',
      isPrimaryKey: true
    });

    const embeddingColumn = imagesDetails?.columns.find(c => c.name === 'embedding');
    expect(embeddingColumn).toMatchObject({
      name: 'embedding',
      type: 'FloatVector(128)'
    });
  });

  it('should handle searchColumns gracefully', async () => {
    const result = await connector.searchColumns('any_field');
    expect(result).toEqual([]);
  });

  it('should handle different vector types correctly', async () => {
    const schema = await connector.getSchema();

    // FloatVector
    const imagesCollection = schema.milvusCollections?.find(c => c.name === 'test_images');
    const floatVectorField = imagesCollection?.schema.fields.find(f => f.name === 'embedding');
    expect(floatVectorField?.type).toBe('FloatVector');

    // BinaryVector
    const productsCollection = schema.milvusCollections?.find(c => c.name === 'test_products');
    const binaryVectorField = productsCollection?.schema.fields.find(f => f.name === 'features');
    expect(binaryVectorField?.type).toBe('BinaryVector');
  });

  it('should handle different metric types correctly', async () => {
    const schema = await connector.getSchema();

    const imagesCollection = schema.milvusCollections?.find(c => c.name === 'test_images');
    const l2Index = imagesCollection?.indexes?.find(idx => idx.fieldName === 'embedding');
    expect(l2Index?.metric).toBe('L2');

    const docsCollection = schema.milvusCollections?.find(c => c.name === 'test_documents');
    const ipIndex = docsCollection?.indexes?.find(idx => idx.fieldName === 'embedding');
    expect(ipIndex?.metric).toBe('IP');

    const productsCollection = schema.milvusCollections?.find(c => c.name === 'test_products');
    const hammingIndex = productsCollection?.indexes?.find(idx => idx.fieldName === 'features');
    expect(hammingIndex?.metric).toBe('HAMMING');
  });

  it('should report entity counts correctly', async () => {
    const schema = await connector.getSchema();

    const imagesCollection = schema.milvusCollections?.find(c => c.name === 'test_images');
    expect(imagesCollection?.numEntities).toBe(1000);

    const docsCollection = schema.milvusCollections?.find(c => c.name === 'test_documents');
    expect(docsCollection?.numEntities).toBe(5000);
  });

  it('should disconnect properly', async () => {
    await connector.disconnect();
    // Verify no errors thrown
    expect(true).toBe(true);
  });
});
