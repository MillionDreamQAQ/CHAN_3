export interface KLineData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BiPoint {
  idx: number;
  begin_time: string;
  end_time: string;
  begin_value: number;
  end_value: number;
  direction: 'up' | 'down';
}

export interface SegPoint {
  idx: number;
  begin_time: string;
  end_time: string;
  begin_value: number;
  end_value: number;
  direction: 'up' | 'down';
}

export interface BSPoint {
  type: string;
  time: string;
  value: number;
  klu_idx: number;
  is_buy: boolean;
}

export interface ZSInfo {
  begin_time: string;
  end_time: string;
  high: number;
  low: number;
  direction: 'up' | 'down';
}

export interface ChanResponse {
  code: string;
  name?: string;
  klines: KLineData[];
  bi_list: BiPoint[];
  seg_list: SegPoint[];
  bs_points: BSPoint[];
  zs_list: ZSInfo[];
  cbsp_list: BSPoint[];
}

export interface ChanRequest {
  code: string;
  kline_type?: string;
  begin_time: string;
  end_time?: string;
}

export interface ScanRequest {
  stock_pool: 'all' | 'boards' | 'custom';
  boards?: string[];  // 板块列表: sh_main, sz_main, cyb, kcb, bj, etf
  stock_codes?: string[];
  kline_type: string;
  bsp_types: string[];
  time_window_days: number;
  limit: number;
}

export interface ScanTaskResponse {
  task_id: string;
  status: string;
  total_stocks: number;
}

export interface ScanProgress {
  task_id: string;
  status: 'running' | 'completed' | 'cancelled' | 'error';
  progress: number;
  processed_count: number;
  total_count: number;
  found_count: number;
  current_stock?: string;
  error_message?: string;
}

export interface ScanResultItem {
  code: string;
  name?: string;
  bsp_type: string;
  bsp_time: string;
  bsp_value: number;
  is_buy: boolean;
  kline_type: string;
}

export interface ScanResultResponse {
  task_id: string;
  status: string;
  results: ScanResultItem[];
  total_scanned: number;
  total_found: number;
  elapsed_time: number;
}
