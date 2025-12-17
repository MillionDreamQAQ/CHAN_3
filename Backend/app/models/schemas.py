from pydantic import BaseModel, Field
from typing import List, Optional

class ChanRequest(BaseModel):
    code: str = Field(..., description="股票代码，例如 sz.000001")
    begin_time: str = Field(..., description="开始时间，格式 YYYY-MM-DD")
    end_time: Optional[str] = Field(
        None, description="结束时间，格式 YYYY-MM-DD，不传则为当前时间"
    )


class KLineData(BaseModel):
    time: str
    open: float
    high: float
    low: float
    close: float
    volume: float


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
