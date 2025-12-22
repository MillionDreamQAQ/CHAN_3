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

# 启用扩展
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

### 创建股票数据库表结构

安装完成后，执行以下 SQL 创建表：

```sql
-- 连接到数据库
\c stock_db

-- 创建股票基本信息表
CREATE TABLE stocks (
    code TEXT PRIMARY KEY,
    name VARCHAR(50),
    list_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建日K线表
CREATE TABLE stock_kline_daily (
    date TIMESTAMPTZ NOT NULL,
    code TEXT NOT NULL,
    open DECIMAL(10,3),
    high DECIMAL(10,3),
    low DECIMAL(10,3),
    close DECIMAL(10,3),
    volume BIGINT,
    amount DECIMAL(20,3),
    turn DECIMAL(10,3),
    PRIMARY KEY (date, code)
);
SELECT create_hypertable('stock_kline_daily', 'date');
CREATE INDEX idx_daily_code_time ON stock_kline_daily (code, date DESC);

-- 创建周K线表
CREATE TABLE stock_kline_weekly (
    date TIMESTAMPTZ NOT NULL,
    code TEXT NOT NULL,
    open DECIMAL(10,3),
    high DECIMAL(10,3),
    low DECIMAL(10,3),
    close DECIMAL(10,3),
    volume BIGINT,
    amount DECIMAL(20,3),
    turn DECIMAL(10,3),
    PRIMARY KEY (date, code)
);
SELECT create_hypertable('stock_kline_weekly', 'date');
CREATE INDEX idx_weekly_code_time ON stock_kline_weekly (code, date DESC);

-- 创建月K线表
CREATE TABLE stock_kline_monthly (
    date TIMESTAMPTZ NOT NULL,
    code TEXT NOT NULL,
    open DECIMAL(10,3),
    high DECIMAL(10,3),
    low DECIMAL(10,3),
    close DECIMAL(10,3),
    volume BIGINT,
    amount DECIMAL(20,3),
    turn DECIMAL(10,3),
    PRIMARY KEY (date, code)
);
SELECT create_hypertable('stock_kline_monthly', 'date');
CREATE INDEX idx_monthly_code_time ON stock_kline_monthly (code, date DESC);

-- 创建5分钟线表
CREATE TABLE stock_kline_5min (
    date TIMESTAMPTZ NOT NULL,
    time TIMESTAMPTZ NOT NULL,
    code TEXT NOT NULL,
    open DECIMAL(10,3),
    high DECIMAL(10,3),
    low DECIMAL(10,3),
    close DECIMAL(10,3),
    volume BIGINT,
    amount DECIMAL(20,3),
    PRIMARY KEY (time, code)
);
SELECT create_hypertable('stock_kline_5min', 'time');
CREATE INDEX idx_5min_code_time ON stock_kline_5min (code, time DESC);

-- 创建15分钟线表
CREATE TABLE stock_kline_15min (
    date TIMESTAMPTZ NOT NULL,
    time TIMESTAMPTZ NOT NULL,
    code TEXT NOT NULL,
    open DECIMAL(10,3),
    high DECIMAL(10,3),
    low DECIMAL(10,3),
    close DECIMAL(10,3),
    volume BIGINT,
    amount DECIMAL(20,3),
    PRIMARY KEY (time, code)    
);
SELECT create_hypertable('stock_kline_15min', 'time');
CREATE INDEX idx_15min_code_time ON stock_kline_15min (code, time DESC);

-- 创建30分钟线表
CREATE TABLE stock_kline_30min (
    date TIMESTAMPTZ NOT NULL,
    time TIMESTAMPTZ NOT NULL,
    code TEXT NOT NULL,
    open DECIMAL(10,3),
    high DECIMAL(10,3),
    low DECIMAL(10,3),
    close DECIMAL(10,3),
    volume BIGINT,
    amount DECIMAL(20,3),
    PRIMARY KEY (time, code)    
);
SELECT create_hypertable('stock_kline_30min', 'time');
CREATE INDEX idx_30min_code_time ON stock_kline_30min (code, time DESC);

-- 创建60分钟线表
CREATE TABLE stock_kline_60min (
    date TIMESTAMPTZ NOT NULL,
    time TIMESTAMPTZ NOT NULL,
    code TEXT NOT NULL,
    open DECIMAL(10,3),
    high DECIMAL(10,3),
    low DECIMAL(10,3),
    close DECIMAL(10,3),
    volume BIGINT,
    amount DECIMAL(20,3),
    PRIMARY KEY (time, code)    
);
SELECT create_hypertable('stock_kline_60min', 'time');
CREATE INDEX idx_60min_code_time ON stock_kline_60min (code, time DESC);

-- 创建实时K线表（用于存储当天实时数据）
CREATE TABLE stock_kline_realtime (
    code TEXT NOT NULL,
    kline_type TEXT NOT NULL,
    datetime TIMESTAMPTZ NOT NULL,
    open DECIMAL(10,3),
    high DECIMAL(10,3),
    low DECIMAL(10,3),
    close DECIMAL(10,3),
    volume BIGINT,
    amount DECIMAL(20,3),
    turn DECIMAL(10,3),
    is_finished BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (code, kline_type, datetime)
);
CREATE INDEX idx_realtime_code_type ON stock_kline_realtime (code, kline_type, datetime DESC);
CREATE INDEX idx_realtime_finished ON stock_kline_realtime (is_finished, datetime);
CREATE INDEX idx_realtime_updated ON stock_kline_realtime (updated_at DESC);
```

## 3. env文件
在项目根目录和Backend文件夹下创建名为 `.env` 的文件，添加以下内容：

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=stock_db
DB_USER=postgres
DB_PASSWORD=postgres
```
