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
  begin_time: string;
  end_time?: string;
}
