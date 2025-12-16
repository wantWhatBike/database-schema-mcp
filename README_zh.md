# 数据库 Schema MCP 服务器

[English](README.md) | [中文](README_zh.md)

---

数据库 Schema MCP 服务器 - 用于从多种数据库类型中提取 schema 信息的 Model Context Protocol (MCP) 服务器。旨在为 LLM 提供全面的数据库结构信息，以便更好地生成 SQL、进行数据分析和理解数据库。

## 功能特性

- **多数据库支持**：连接 7+ 种数据库类型
  - 关系型：MySQL、PostgreSQL、SQLite、Oracle
  - NoSQL：MongoDB、Redis
  - 消息队列：Kafka

- **全面的 Schema 提取**：
  - 表、列、数据类型
  - 主键、索引、唯一约束
  - 外键关系
  - 视图和存储过程
  - MongoDB 字段类型推断（基于采样）
  - Redis 键模式分析
  - Kafka 主题配置

- **LLM 优化输出**：所有 schema 信息格式化为清晰、结构化的 Markdown

- **可扩展架构**：轻松添加对新数据库类型的支持（Pulsar、etcd、Cassandra 等）

- **环境变量支持**：通过 `${VAR_NAME}` 语法安全管理密码

## 安装

```bash
npm install
npm run build
```

## 配置

### 1. 创建配置文件

复制示例配置并自定义：

```bash
cp config.example.json config.json
```

### 2. 配置数据库

编辑 `config.json` 添加数据库连接：

```json
{
  "databases": {
    "my_mysql": {
      "type": "mysql",
      "host": "localhost",
      "port": 3306,
      "database": "myapp",
      "user": "root",
      "password": "${MYSQL_PASSWORD}"
    },
    "my_postgres": {
      "type": "postgresql",
      "connectionString": "postgresql://user:pass@localhost:5432/mydb"
    },
    "my_mongodb": {
      "type": "mongodb",
      "uri": "mongodb://localhost:27017",
      "database": "myapp",
      "sampleSize": 1000
    }
  }
}
```

### 3. 设置环境变量

对于敏感凭据，使用环境变量：

```bash
export MYSQL_PASSWORD="your_password"
export POSTGRES_PASSWORD="your_password"
export REDIS_PASSWORD="your_password"
```

## 使用方法

### 运行 MCP 服务器

```bash
npm start
```

或设置自定义配置路径：

```bash
DB_SCHEMA_CONFIG=/path/to/config.json npm start
```

### 可用的 MCP 工具

#### 1. `get_database_schema`

以 Markdown 格式获取完整数据库 schema。

**参数：**
- `databaseName` (string)：config.json 中的数据库名称

**示例：**
```json
{
  "databaseName": "my_mysql"
}
```

#### 2. `list_tables`

列出数据库中的所有表/集合/主题。

**参数：**
- `databaseName` (string)：config.json 中的数据库名称

#### 3. `get_table_details`

获取特定表的详细信息。

**参数：**
- `databaseName` (string)：config.json 中的数据库名称
- `tableName` (string)：表名

#### 4. `search_columns`

搜索包含特定列的表（仅限关系型数据库）。

**参数：**
- `databaseName` (string)：config.json 中的数据库名称
- `columnName` (string)：要搜索的列名

## 数据库特定配置

### MySQL

```json
{
  "type": "mysql",
  "host": "localhost",
  "port": 3306,
  "database": "mydb",
  "user": "root",
  "password": "password"
}
```

### PostgreSQL

```json
{
  "type": "postgresql",
  "host": "localhost",
  "port": 5432,
  "database": "mydb",
  "user": "postgres",
  "password": "password",
  "schema": "public"
}
```

或使用连接字符串：

```json
{
  "type": "postgresql",
  "connectionString": "postgresql://user:pass@localhost:5432/mydb"
}
```

### SQLite

```json
{
  "type": "sqlite",
  "database": "/path/to/database.db"
}
```

### Oracle

```json
{
  "type": "oracle",
  "host": "localhost",
  "port": 1521,
  "user": "system",
  "password": "password",
  "serviceName": "ORCL"
}
```

**注意：** 需要在系统上安装 Oracle Instant Client。

### MongoDB

```json
{
  "type": "mongodb",
  "uri": "mongodb://localhost:27017",
  "database": "mydb",
  "sampleSize": 1000
}
```

**字段推断：** MongoDB 连接器采样最多 `sampleSize` 个文档（默认：1000）来推断字段类型和出现率。

### Redis

```json
{
  "type": "redis",
  "host": "localhost",
  "port": 6379,
  "password": "password",
  "db": 0,
  "maxKeys": 1000,
  "keyPattern": "*"
}
```

**键模式分析：** 扫描最多 `maxKeys` 个匹配 `keyPattern` 的键，以识别命名模式和数据类型。

### Kafka

```json
{
  "type": "kafka",
  "brokers": ["localhost:9092"],
  "clientId": "database-schema-mcp"
}
```

## 添加新数据库类型

架构设计便于扩展。添加新数据库类型的步骤：

1. **在 `src/connectors/` 中创建连接器**：

```typescript
// src/connectors/etcd.ts
import { DatabaseConnector } from './base.js';
import { registerConnector } from './factory.js';

export class EtcdConnector extends DatabaseConnector {
  async connect() { /* 实现 */ }
  async disconnect() { /* 实现 */ }
  async getSchema() { /* 实现 */ }
  // ... 实现其他必需方法
}

registerConnector('etcd', EtcdConnector);
```

2. **在 `src/index.ts` 中导入连接器**：

```typescript
import './connectors/etcd.js';
```

3. **重新构建并使用**：

```bash
npm run build
```

## 架构

```
database-schema-mcp/
├── src/
│   ├── index.ts              # MCP 服务器入口
│   ├── types/schema.ts       # 类型定义
│   ├── config/loader.ts      # 配置文件加载器
│   ├── connectors/
│   │   ├── base.ts           # 抽象基类
│   │   ├── factory.ts        # 连接器注册中心和工厂
│   │   ├── mysql.ts          # MySQL 实现
│   │   ├── postgresql.ts     # PostgreSQL 实现
│   │   ├── sqlite.ts         # SQLite 实现
│   │   ├── oracle.ts         # Oracle 实现
│   │   ├── mongodb.ts        # MongoDB 实现
│   │   ├── redis.ts          # Redis 实现
│   │   └── kafka.ts          # Kafka 实现
│   ├── schema/formatter.ts   # Markdown 格式化器
│   └── tools/schema-tools.ts # MCP 工具处理器
└── config.json               # 你的数据库配置
```

## 开发

```bash
# 安装依赖
npm install

# 构建 TypeScript
npm run build

# 监视模式（更改时自动重新构建）
npm run dev
```

## 测试

运行测试套件：

```bash
# 运行所有测试
npm test

# 监视模式运行测试
npm run test:watch

# 运行测试并生成覆盖率报告
npm run test:coverage
```

项目包含：
- **单元测试**：配置加载器、连接器工厂、Schema 格式化器
- **集成测试**：SQLite 连接器真实数据库操作

详细测试文档请参考 [TESTING.md](TESTING.md)。

## 安全注意事项

- 永远不要提交包含真实凭据的 `config.json`
- 对敏感数据使用环境变量
- 仅授予必要的数据库权限（建议只读）
- 生产使用时，考虑加密配置文件

## 故障排除

### Oracle 连接问题

确保已安装 Oracle Instant Client：
- 从 Oracle 网站下载
- 设置 `LD_LIBRARY_PATH`（Linux）或 `PATH`（Windows）到 Instant Client 目录

### MongoDB 采样性能

对于非常大的集合，在配置中减少 `sampleSize` 以提高性能：

```json
{
  "sampleSize": 100
}
```

### Redis 键扫描

如果 Redis 有数百万个键，使用 `maxKeys` 限制扫描并使用特定模式：

```json
{
  "maxKeys": 500,
  "keyPattern": "user:*"
}
```

## 许可证

MIT

## 贡献

欢迎贡献！添加对其他数据库的支持：

1. Fork 仓库
2. 按照现有模式创建新连接器
3. 添加测试和文档
4. 提交 pull request

### 计划支持的数据库

- Pulsar（消息队列）
- etcd（键值存储）
- Cassandra（宽列存储）
- ElasticSearch（搜索引擎）
- ClickHouse（OLAP 数据库）
- TiDB（分布式 SQL）
