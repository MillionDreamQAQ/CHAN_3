from pydantic import BaseModel, Field
from typing import List, Optional


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
