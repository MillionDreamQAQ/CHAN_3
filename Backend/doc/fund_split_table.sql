CREATE TABLE fund_split (
    id SERIAL PRIMARY KEY,
    fund_code VARCHAR(20) NOT NULL,        -- 基金代码（含市场前缀，如sz.159220）
    fund_name VARCHAR(100),                 -- 基金简称
    split_date DATE NOT NULL,               -- 拆分折算日
    split_type VARCHAR(50),                 -- 拆分类型（份额分拆/份额折算）
    split_ratio FLOAT NOT NULL,             -- 拆分比例（如2表示1拆2，价格减半）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(fund_code, split_date)           -- 同一基金同一日期只能有一条记录
);

-- 创建索引
CREATE INDEX idx_fund_split_code ON fund_split(fund_code);
CREATE INDEX idx_fund_split_date ON fund_split(split_date);
