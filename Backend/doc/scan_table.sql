CREATE TABLE scan_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- 扫描参数
    stock_pool VARCHAR(20) NOT NULL,
    boards TEXT [],
    stock_codes TEXT [],
    kline_type VARCHAR(10) NOT NULL,
    bsp_types TEXT [] NOT NULL,
    time_window_days INTEGER NOT NULL DEFAULT 3,
    kline_limit INTEGER NOT NULL DEFAULT 500,
    -- 进度
    total_count INTEGER DEFAULT 0,
    processed_count INTEGER DEFAULT 0,
    found_count INTEGER DEFAULT 0,
    current_stock VARCHAR(50),
    error_message TEXT,
    -- 时间
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    elapsed_time FLOAT DEFAULT 0
);

CREATE INDEX idx_scan_tasks_created_at ON scan_tasks (created_at DESC);

CREATE TABLE scan_results (
    id SERIAL PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES scan_tasks (id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(50),
    bsp_type VARCHAR(10) NOT NULL,
    bsp_time VARCHAR(30) NOT NULL,
    bsp_value FLOAT NOT NULL,
    is_buy BOOLEAN NOT NULL DEFAULT TRUE,
    kline_type VARCHAR(10) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_scan_results_task_id ON scan_results (task_id);