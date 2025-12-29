"""
批量扫描API
提供股票买点批量扫描功能
"""
import asyncio
import logging
from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.models.schemas import (
    ScanRequest,
    ScanTaskResponse,
    ScanProgress,
    ScanResultResponse,
)
from app.services.scan_service import scan_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/scan", tags=["scan"])


@router.post("/start", response_model=ScanTaskResponse)
async def start_scan(request: ScanRequest):
    """
    启动批量扫描任务

    Args:
        request: 扫描请求参数
            - stock_pool: 股票池类型 (all/custom)
            - stock_codes: 自定义股票代码列表
            - kline_type: K线级别
            - bsp_types: 买卖点类型列表
            - time_window_days: 时间窗口(天)
            - limit: K线数量限制

    Returns:
        task_id: 任务ID
        status: 任务状态
        total_stocks: 待扫描股票数量
    """
    try:
        task_id = scan_service.start_scan(request)
        task = scan_service.get_task(task_id)
        return ScanTaskResponse(
            task_id=task_id,
            status="started",
            total_stocks=task.total_count if task else 0,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"启动扫描任务失败: {e}")
        raise HTTPException(status_code=500, detail=f"启动扫描任务失败: {str(e)}")


@router.get("/progress/{task_id}")
async def get_scan_progress(task_id: str):
    """
    获取扫描进度 (SSE流)

    使用Server-Sent Events实时推送扫描进度

    Args:
        task_id: 任务ID

    Returns:
        SSE事件流，每500ms推送一次进度
    """
    task = scan_service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    async def event_generator():
        """生成SSE事件"""
        while True:
            progress = scan_service.get_progress(task_id)
            if progress is None:
                break

            yield {
                "event": "progress",
                "data": progress.model_dump_json(),
            }

            # 如果任务已完成/取消/出错，发送最后一次进度后退出
            if progress.status in ["completed", "cancelled", "error"]:
                break

            await asyncio.sleep(0.5)

    return EventSourceResponse(event_generator())


@router.get("/result/{task_id}", response_model=ScanResultResponse)
async def get_scan_result(task_id: str):
    """
    获取扫描结果

    Args:
        task_id: 任务ID

    Returns:
        扫描结果列表
    """
    result = scan_service.get_result(task_id)
    if result is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    return result


@router.post("/cancel/{task_id}")
async def cancel_scan(task_id: str):
    """
    取消扫描任务

    Args:
        task_id: 任务ID

    Returns:
        取消结果
    """
    success = scan_service.cancel_scan(task_id)
    if success:
        return {"success": True, "message": "任务已取消"}
    else:
        raise HTTPException(status_code=400, detail="无法取消任务(可能已完成或不存在)")
