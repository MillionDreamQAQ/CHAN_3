from fastapi import APIRouter, HTTPException
from app.models.schemas import ChanRequest, ChanResponse
from app.services.chan_service import ChanService

router = APIRouter(prefix="/api", tags=["chan"])


@router.post("/chan/calculate", response_model=ChanResponse)
async def calculate_chan(request: ChanRequest):
    """
    计算缠论数据

    参数:
    - code: 股票代码，例如 sz.000001
    - begin_time: 开始时间，格式 YYYY-MM-DD
    - end_time: 结束时间，格式 YYYY-MM-DD（可选）

    返回:
    - K线数据、笔、线段、买卖点、中枢等完整缠论信息
    """
    try:
        print(f"Received Chan calculation request: {request}")
        result = ChanService.calculate_chan(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"计算缠论数据失败: {str(e)}")
