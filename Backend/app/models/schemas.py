from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


# ============ 缠论分析相关模型 ============

class ChanRequest(BaseModel):
    code: str = Field(..., description="股票代码，例如 sz.000001")
    kline_type: Optional[str] = Field(
        "day",
        description="K线级别，day=日线，week=周线，month=月线, 1m=1分钟线, 5m=5分钟线, 15m=15分钟线, 30m=30分钟线, 60m=60分钟线",
    )
    limit: Optional[int] = Field(2000, description="返回K线数据条数，默认2000条")


class KLineData(BaseModel):
    time: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    amount: float


class BiPoint(BaseModel):
    idx: int
    begin_time: str
    end_time: str
    begin_value: float
    end_value: float
    direction: str


class SegPoint(BaseModel):
    idx: int
    begin_time: str
    end_time: str
    begin_value: float
    end_value: float
    direction: str


class BSPoint(BaseModel):
    type: str
    time: str
    value: float
    klu_idx: int
    is_buy: bool


class ZSInfo(BaseModel):
    begin_time: str
    end_time: str
    high: float
    low: float


class ChanResponse(BaseModel):
    code: str
    name: Optional[str] = Field(None, description="股票名称")
    klines: List[KLineData]
    bi_list: List[BiPoint]
    seg_list: List[SegPoint]
    bs_points: List[BSPoint]
    zs_list: List[ZSInfo]
    cbsp_list: List[BSPoint]


# ============ 扫描功能相关模型 ============

class ScanRequest(BaseModel):
    """扫描请求"""
    stock_pool: str = Field(
        "all",
        description="股票池类型: all=全市场, boards=按板块, custom=自定义"
    )
    boards: Optional[List[str]] = Field(
        None,
        description="板块列表，当stock_pool=boards时使用。可选值: sh_main(沪市主板), sz_main(深市主板), cyb(创业板), kcb(科创板), bj(北交所), etf(ETF)"
    )
    stock_codes: Optional[List[str]] = Field(
        None,
        description="自定义股票代码列表，当stock_pool=custom时使用"
    )
    kline_type: str = Field(
        "day",
        description="K线级别: day/week/month/1m/5m/15m/30m/60m"
    )
    bsp_types: List[str] = Field(
        ["1", "1p", "2", "2s", "3a", "3b"],
        description="要扫描的买卖点类型"
    )
    time_window_days: int = Field(
        3,
        description="时间窗口(天)，扫描最近N天内出现的买点"
    )
    limit: int = Field(
        500,
        description="每只股票获取的K线数量"
    )


class ScanTaskResponse(BaseModel):
    """扫描任务启动响应"""
    task_id: str
    status: str = "started"
    total_stocks: int


class ScanProgress(BaseModel):
    """扫描进度"""
    task_id: str
    status: str  # running / completed / cancelled / error
    progress: int  # 0-100
    processed_count: int
    total_count: int
    found_count: int
    current_stock: Optional[str] = None
    error_message: Optional[str] = None


class ScanResultItem(BaseModel):
    """单个扫描结果"""
    code: str
    name: Optional[str] = None
    bsp_type: str
    bsp_time: str
    bsp_value: float
    is_buy: bool
    kline_type: str


class ScanResultResponse(BaseModel):
    """扫描结果响应"""
    task_id: str
    status: str
    results: List[ScanResultItem]
    total_scanned: int
    total_found: int
    elapsed_time: float


# ============ 扫描任务数据库模型 ============

class ScanTaskDB(BaseModel):
    """数据库中的扫描任务"""
    id: str
    status: str
    stock_pool: str
    boards: Optional[List[str]] = None
    stock_codes: Optional[List[str]] = None
    kline_type: str
    bsp_types: List[str]
    time_window_days: int
    kline_limit: int
    total_count: int = 0
    processed_count: int = 0
    found_count: int = 0
    current_stock: Optional[str] = None
    error_message: Optional[str] = None
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    elapsed_time: float = 0


class ScanTaskListItem(BaseModel):
    """任务列表项"""
    id: str
    status: str
    created_at: str
    progress: int
    found_count: int
    elapsed_time: float


class ScanTaskListResponse(BaseModel):
    """任务列表响应"""
    tasks: List[ScanTaskListItem]
    total: int
    page: int
    page_size: int


class ScanTaskDetailResponse(BaseModel):
    """任务详情响应（含结果）"""
    task: ScanTaskDB
    results: List  # ScanResultItem list
