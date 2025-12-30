"""
扫描任务数据库模型
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


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
