## 1. 创建数据库

```sql
-- 创建数据库
CREATE DATABASE stock_db;

-- 连接到数据库
\c stock_db

-- 启用 TimescaleDB 扩展
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 验证
\dx
```

## 2. 创建数据库并启用扩展

```bash
# 打开 psql
psql -U postgres

# 创建数据库
CREATE DATABASE stock_db;

# 连接到数据库
\c stock_db

```

## 3. env 文件

在项目根目录和 Backend 文件夹下创建名为 `.env` 的文件，添加以下内容：

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=stock_db
DB_USER=postgres
DB_PASSWORD=postgres
```
