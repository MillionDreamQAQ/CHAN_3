/**
 * 扫描功能相关常量
 */

export const BSP_TYPE_OPTIONS = [
  { label: "一类(T1)", value: "1" },
  { label: "一类盘整(T1P)", value: "1p" },
  { label: "二类(T2)", value: "2" },
  { label: "二类衍生(T2S)", value: "2s" },
  { label: "三类A(T3A)", value: "3a" },
  { label: "三类B(T3B)", value: "3b" },
];

export const KLINE_OPTIONS = [
  { label: "日线", value: "day" },
  { label: "周线", value: "week" },
  { label: "月线", value: "month" },
  { label: "60分", value: "60m" },
  { label: "30分", value: "30m" },
  { label: "15分", value: "15m" },
  { label: "5分", value: "5m" },
];

export const BOARD_OPTIONS = [
  { label: "沪市主板", value: "sh_main" },
  { label: "深市主板", value: "sz_main" },
  { label: "创业板", value: "cyb" },
  { label: "科创板", value: "kcb" },
  { label: "北交所", value: "bj" },
  { label: "ETF", value: "etf" },
];

export const BSP_TYPE_COLORS = {
  1: "green",
  "1p": "cyan",
  2: "blue",
  "2s": "geekblue",
  "3a": "purple",
  "3b": "magenta",
};

export const TASK_STATUS_COLORS = {
  running: "processing",
  completed: "success",
  cancelled: "default",
  error: "error",
  pending: "default",
};

export const TASK_STATUS_TEXT = {
  running: "运行中",
  completed: "已完成",
  cancelled: "已取消",
  error: "异常",
  pending: "等待中",
};

export const DEFAULT_SCAN_CONFIG = {
  stockPool: "boards",
  boards: ["sh_main", "sz_main"],
  stockCodes: [],
  klineType: "day",
  bspTypes: ["2", "2s"],
  timeWindowDays: 1,
  limit: 1000,
};
