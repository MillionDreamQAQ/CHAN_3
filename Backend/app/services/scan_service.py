"""
批量扫描服务
使用多线程并行扫描股票买点，支持数据库持久化
"""

import sys
import os
import re
import asyncio
import threading
import time
import logging
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional
from uuid import uuid4

import psycopg
from dotenv import load_dotenv

# 添加父目录到路径
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from app.models.schemas import (
    ScanRequest,
    ScanProgress,
    ScanResultItem,
    ScanResultResponse,
    ChanRequest,
)
from app.models.scan_models import (
    ScanTaskDB,
    ScanTaskListItem,
    ScanTaskListResponse,
    ScanTaskDetailResponse,
)
from app.services.chan_service import ChanService

load_dotenv()

# 配置日志格式
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def get_db_connection():
    """获取数据库连接"""
    return psycopg.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD"),
        dbname=os.getenv("DB_NAME", "stock_db"),
    )


class ScanTask:
    """扫描任务状态"""

    def __init__(self, task_id: str, total_stocks: int):
        self.task_id = task_id
        self.status = "running"
        self.total_count = total_stocks
        self.processed_count = 0
        self.found_count = 0
        self.current_stock: Optional[str] = None
        self.results: List[ScanResultItem] = []
        self.error_message: Optional[str] = None
        self.start_time = time.time()
        self.cancelled = False
        self.lock = threading.Lock()
        # 用于SSE的异步队列
        self.progress_queue: asyncio.Queue = None

    @property
    def progress(self) -> int:
        if self.total_count == 0:
            return 100
        return int(self.processed_count / self.total_count * 100)

    @property
    def elapsed_time(self) -> float:
        return time.time() - self.start_time

    def to_progress(self) -> ScanProgress:
        return ScanProgress(
            task_id=self.task_id,
            status=self.status,
            progress=self.progress,
            processed_count=self.processed_count,
            total_count=self.total_count,
            found_count=self.found_count,
            current_stock=self.current_stock,
            error_message=self.error_message,
        )

    def to_result(self) -> ScanResultResponse:
        return ScanResultResponse(
            task_id=self.task_id,
            status=self.status,
            results=self.results,
            total_scanned=self.processed_count,
            total_found=self.found_count,
            elapsed_time=self.elapsed_time,
        )


class ScanService:
    """扫描服务"""

    MAX_WORKERS = 15
    SINGLE_STOCK_TIMEOUT = 30

    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=self.MAX_WORKERS)
        self.tasks: Dict[str, ScanTask] = {}
        self.lock = threading.Lock()

    BOARD_PATTERNS = {
        "sh_main": lambda code: code.startswith("sh.60"),  # 沪市主板 60xxxx
        "sz_main": lambda code: code.startswith("sz.00"),  # 深市主板 00xxxx
        "cyb": lambda code: code.startswith("sz.30"),  # 创业板 30xxxx
        "kcb": lambda code: code.startswith("sh.688"),  # 科创板 688xxx
        "bj": lambda code: code.startswith("bj."),  # 北交所
        "etf": lambda code: (  # ETF
            code.startswith("sh.51")
            or code.startswith("sh.56")
            or code.startswith("sh.58")
            or code.startswith("sz.15")
            or code.startswith("sz.16")
            or code.startswith("sz.18")
        ),
    }

    def get_all_stocks(self) -> List[str]:
        """从数据库获取所有股票代码"""
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT code FROM stocks ORDER BY code")
            codes = [row[0] for row in cursor.fetchall()]
            cursor.close()
            conn.close()
            return codes
        except Exception as e:
            logger.error(f"获取股票列表失败: {e}")
            return []

    def get_stocks_by_boards(self, boards: List[str]) -> List[str]:
        """根据板块筛选股票"""
        all_stocks = self.get_all_stocks()
        if not boards:
            return all_stocks

        filtered = []
        for code in all_stocks:
            for board in boards:
                pattern = self.BOARD_PATTERNS.get(board)
                if pattern and pattern(code):
                    filtered.append(code)
                    break  # 避免重复添加

        return filtered

    def get_stock_list(
        self,
        stock_pool: str,
        boards: Optional[List[str]],
        stock_codes: Optional[List[str]],
    ) -> List[str]:
        """根据股票池类型获取股票列表"""
        if stock_pool == "custom" and stock_codes:
            return stock_codes
        elif stock_pool == "boards" and boards:
            return self.get_stocks_by_boards(boards)
        else:
            return self.get_all_stocks()

    # ==================== 数据库操作 ====================

    def create_task_in_db(self, task_id: str, request: ScanRequest, total_count: int):
        """在数据库中创建任务记录"""
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO scan_tasks (
                    id, status, stock_pool, boards, stock_codes,
                    kline_type, bsp_types, time_window_days, kline_limit,
                    total_count, processed_count, found_count, created_at, started_at
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW()
                )
                """,
                (
                    task_id,
                    "running",
                    request.stock_pool,
                    request.boards,
                    request.stock_codes,
                    request.kline_type,
                    request.bsp_types,
                    request.time_window_days,
                    request.limit,
                    total_count,
                    0,
                    0,
                ),
            )
            conn.commit()
            cursor.close()
            conn.close()
            logger.info(f"任务 {task_id} 已写入数据库")
        except Exception as e:
            logger.error(f"创建任务记录失败: {e}")
            raise

    def update_task_progress(self, task: ScanTask):
        """更新任务进度到数据库"""
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE scan_tasks SET
                    status = %s,
                    processed_count = %s,
                    found_count = %s,
                    current_stock = %s,
                    error_message = %s,
                    elapsed_time = %s
                WHERE id = %s
                """,
                (
                    task.status,
                    task.processed_count,
                    task.found_count,
                    task.current_stock,
                    task.error_message,
                    task.elapsed_time,
                    task.task_id,
                ),
            )
            conn.commit()
            cursor.close()
            conn.close()
        except Exception as e:
            logger.error(f"更新任务进度失败: {e}")

    def complete_task_in_db(self, task: ScanTask):
        """完成任务并更新数据库"""
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE scan_tasks SET
                    status = %s,
                    processed_count = %s,
                    found_count = %s,
                    current_stock = NULL,
                    error_message = %s,
                    elapsed_time = %s,
                    completed_at = NOW()
                WHERE id = %s
                """,
                (
                    task.status,
                    task.processed_count,
                    task.found_count,
                    task.error_message,
                    task.elapsed_time,
                    task.task_id,
                ),
            )
            conn.commit()
            cursor.close()
            conn.close()
            logger.info(f"任务 {task.task_id} 已完成，状态已更新到数据库")
        except Exception as e:
            logger.error(f"完成任务更新失败: {e}")

    def save_results_to_db(self, task_id: str, results: List[ScanResultItem]):
        """批量保存扫描结果到数据库"""
        if not results:
            return

        try:
            conn = get_db_connection()
            cursor = conn.cursor()

            # 批量插入
            values = [
                (
                    task_id,
                    r.code,
                    r.name,
                    r.bsp_type,
                    r.bsp_time,
                    r.bsp_value,
                    r.is_buy,
                    r.kline_type,
                )
                for r in results
            ]

            cursor.executemany(
                """
                INSERT INTO scan_results (
                    task_id, code, name, bsp_type, bsp_time, bsp_value, is_buy, kline_type
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                values,
            )
            conn.commit()
            cursor.close()
            conn.close()
            logger.info(f"已保存 {len(results)} 条扫描结果到数据库")
        except Exception as e:
            logger.error(f"保存扫描结果失败: {e}")

    def get_task_list(
        self, page: int = 1, page_size: int = 20, status: Optional[str] = None
    ) -> ScanTaskListResponse:
        """获取任务列表"""
        try:
            conn = get_db_connection()
            cursor = conn.cursor()

            # 构建查询条件
            where_clause = ""
            params = []
            if status and status != "all":
                where_clause = "WHERE status = %s"
                params.append(status)

            # 获取总数
            cursor.execute(f"SELECT COUNT(*) FROM scan_tasks {where_clause}", params)
            total = cursor.fetchone()[0]

            # 获取分页数据
            offset = (page - 1) * page_size
            cursor.execute(
                f"""
                SELECT id, status, stock_pool, boards, stock_codes, kline_type, bsp_types,
                       time_window_days, total_count, processed_count, found_count,
                       elapsed_time, created_at
                FROM scan_tasks
                {where_clause}
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """,
                params + [page_size, offset],
            )

            tasks = []
            for row in cursor.fetchall():
                # 计算进度
                total_count = row[8] or 1
                processed_count = row[9] or 0
                progress = (
                    int(processed_count / total_count * 100) if total_count > 0 else 0
                )

                # 格式化时间
                created_at = row[12]
                if isinstance(created_at, datetime):
                    created_at_str = created_at.strftime("%m-%d %H:%M")
                else:
                    created_at_str = str(created_at)

                tasks.append(
                    ScanTaskListItem(
                        id=str(row[0]),
                        status=row[1],
                        created_at=created_at_str,
                        progress=progress,
                        found_count=row[10] or 0,
                        elapsed_time=row[11] or 0,
                    )
                )

            cursor.close()
            conn.close()

            return ScanTaskListResponse(
                tasks=tasks, total=total, page=page, page_size=page_size
            )
        except Exception as e:
            logger.error(f"获取任务列表失败: {e}")
            return ScanTaskListResponse(
                tasks=[], total=0, page=page, page_size=page_size
            )

    def get_task_detail(self, task_id: str) -> Optional[ScanTaskDetailResponse]:
        """获取任务详情（含结果）"""
        try:
            conn = get_db_connection()
            cursor = conn.cursor()

            # 获取任务信息
            cursor.execute(
                """
                SELECT id, status, stock_pool, boards, stock_codes, kline_type, bsp_types,
                       time_window_days, kline_limit, total_count, processed_count, found_count,
                       current_stock, error_message, created_at, started_at, completed_at, elapsed_time
                FROM scan_tasks
                WHERE id = %s
                """,
                (task_id,),
            )
            row = cursor.fetchone()
            if not row:
                cursor.close()
                conn.close()
                return None

            # 格式化时间
            def format_time(t):
                if t is None:
                    return None
                if isinstance(t, datetime):
                    return t.strftime("%Y-%m-%d %H:%M:%S")
                return str(t)

            task = ScanTaskDB(
                id=str(row[0]),
                status=row[1],
                stock_pool=row[2],
                boards=row[3],
                stock_codes=row[4],
                kline_type=row[5],
                bsp_types=row[6],
                time_window_days=row[7],
                kline_limit=row[8],
                total_count=row[9] or 0,
                processed_count=row[10] or 0,
                found_count=row[11] or 0,
                current_stock=row[12],
                error_message=row[13],
                created_at=format_time(row[14]),
                started_at=format_time(row[15]),
                completed_at=format_time(row[16]),
                elapsed_time=row[17] or 0,
            )

            # 获取结果
            cursor.execute(
                """
                SELECT code, name, bsp_type, bsp_time, bsp_value, is_buy, kline_type
                FROM scan_results
                WHERE task_id = %s
                ORDER BY bsp_time DESC
                """,
                (task_id,),
            )

            results = []
            for r in cursor.fetchall():
                results.append(
                    ScanResultItem(
                        code=r[0],
                        name=r[1],
                        bsp_type=r[2],
                        bsp_time=r[3],
                        bsp_value=r[4],
                        is_buy=r[5],
                        kline_type=r[6],
                    )
                )

            cursor.close()
            conn.close()

            return ScanTaskDetailResponse(task=task, results=results)
        except Exception as e:
            logger.error(f"获取任务详情失败: {e}")
            return None

    def delete_task(self, task_id: str) -> bool:
        """删除任务及其结果"""
        try:
            conn = get_db_connection()
            cursor = conn.cursor()

            # 先检查任务是否存在
            cursor.execute("SELECT status FROM scan_tasks WHERE id = %s", (task_id,))
            row = cursor.fetchone()
            if not row:
                cursor.close()
                conn.close()
                return False

            # 如果任务正在运行，先取消
            if row[0] == "running":
                self.cancel_scan(task_id)

            # 删除结果（因为有外键约束，会级联删除）
            cursor.execute("DELETE FROM scan_tasks WHERE id = %s", (task_id,))
            conn.commit()
            cursor.close()
            conn.close()

            # 从内存中移除
            with self.lock:
                if task_id in self.tasks:
                    del self.tasks[task_id]

            logger.info(f"任务 {task_id} 已删除")
            return True
        except Exception as e:
            logger.error(f"删除任务失败: {e}")
            return False

    def get_results_from_db(self, task_id: str) -> Optional[ScanResultResponse]:
        """从数据库获取扫描结果"""
        try:
            conn = get_db_connection()
            cursor = conn.cursor()

            # 获取任务信息
            cursor.execute(
                """
                SELECT status, processed_count, found_count, elapsed_time
                FROM scan_tasks
                WHERE id = %s
                """,
                (task_id,),
            )
            task_row = cursor.fetchone()
            if not task_row:
                cursor.close()
                conn.close()
                return None

            # 获取结果
            cursor.execute(
                """
                SELECT code, name, bsp_type, bsp_time, bsp_value, is_buy, kline_type
                FROM scan_results
                WHERE task_id = %s
                ORDER BY bsp_time DESC
                """,
                (task_id,),
            )

            results = []
            for r in cursor.fetchall():
                results.append(
                    ScanResultItem(
                        code=r[0],
                        name=r[1],
                        bsp_type=r[2],
                        bsp_time=r[3],
                        bsp_value=r[4],
                        is_buy=r[5],
                        kline_type=r[6],
                    )
                )

            cursor.close()
            conn.close()

            return ScanResultResponse(
                task_id=task_id,
                status=task_row[0],
                results=results,
                total_scanned=task_row[1] or 0,
                total_found=task_row[2] or 0,
                elapsed_time=task_row[3] or 0,
            )
        except Exception as e:
            logger.error(f"获取数据库结果失败: {e}")
            return None

    # ==================== 扫描逻辑 ====================

    def scan_single_stock(
        self, code: str, request: ScanRequest, task: ScanTask
    ) -> Optional[List[ScanResultItem]]:
        """
        扫描单只股票
        返回该股票在时间窗口内的买点列表
        """
        if task.cancelled:
            return None

        try:
            # 更新当前扫描的股票
            with task.lock:
                task.current_stock = code

            # 调用缠论计算服务
            chan_request = ChanRequest(
                code=code,
                kline_type=request.kline_type,
                limit=request.limit,
            )
            result = ChanService.calculate_chan(chan_request)

            # 记录原始买卖点数量
            total_bsp = len(result.bs_points)
            buy_points = [bsp for bsp in result.bs_points if bsp.is_buy]
            logger.debug(
                f"[{code}] 计算完成: 总买卖点={total_bsp}, 买点={len(buy_points)}"
            )

            # 记录买点详情（前5个）
            if buy_points:
                for i, bsp in enumerate(buy_points[:5]):
                    logger.debug(
                        f"  [{code}] 买点{i+1}: type={bsp.type}, time={bsp.time}, is_buy={bsp.is_buy}"
                    )

            # 过滤买点
            recent_buy_points = self.filter_buy_points(
                result.bs_points,
                request.bsp_types,
                request.time_window_days,
            )

            logger.debug(
                f"[{code}] 过滤后买点数: {len(recent_buy_points)} (筛选类型={request.bsp_types}, 时间窗口={request.time_window_days}天)"
            )

            if recent_buy_points:
                logger.info(f"[{code}] 找到 {len(recent_buy_points)} 个符合条件的买点")
                return [
                    ScanResultItem(
                        code=code,
                        name=result.name,
                        bsp_type=bsp.type,
                        bsp_time=bsp.time,
                        bsp_value=bsp.value,
                        is_buy=bsp.is_buy,
                        kline_type=request.kline_type,
                    )
                    for bsp in recent_buy_points
                ]
            return None

        except Exception as e:
            logger.warning(f"扫描股票 {code} 失败: {e}", exc_info=True)
            return None

    def filter_buy_points(
        self, bs_points: list, bsp_types: List[str], time_window_days: int
    ) -> list:
        """
        过滤买点：
        1. 只保留买点(is_buy=True)
        2. 类型在bsp_types中
        3. 时间在最近N天内
        """
        cutoff_time = datetime.now() - timedelta(days=time_window_days)
        recent_buy_points = []

        # 调试：记录过滤条件
        logger.debug(
            f"过滤条件: cutoff_time={cutoff_time}, bsp_types={bsp_types}, time_window_days={time_window_days}"
        )

        skipped_not_buy = 0
        skipped_type_mismatch = 0
        skipped_time_old = 0
        skipped_parse_error = 0

        for bsp in bs_points:
            if not bsp.is_buy:
                skipped_not_buy += 1
                continue

            # bsp.type 是一个字符串，格式如 "[<BSP_TYPE.T1P: '1p'>]"
            # 需要用正则提取其中的值如 '1p'
            bsp_type_values = []
            raw_type = bsp.type

            # 使用正则提取单引号中的内容，如 '1p', '2', '3a' 等
            matches = re.findall(r"'([^']+)'", str(raw_type))
            if matches:
                bsp_type_values = matches
            else:
                bsp_type_values = [str(raw_type)]

            # 检查是否有任意类型匹配
            type_matched = any(t in bsp_types for t in bsp_type_values)
            if not type_matched:
                skipped_type_mismatch += 1
                logger.debug(
                    f"  类型不匹配: bsp_type_values={bsp_type_values}, 期望={bsp_types}"
                )
                continue
            else:
                if len(bsp_type_values) > 1:
                    logger.debug(
                        f"  单K线存在多个买点类型: bsp_type_values={bsp_type_values}, 期望={bsp_types}, 已选择第一个匹配的买点"
                    )
                    for t in bsp_types:
                        if t in bsp_type_values:
                            bsp.type = t
                            break
                else: 
                    bsp.type = bsp_type_values[0]

            # 解析买点时间
            try:
                bsp_time_str = bsp.time
                bsp_time = None

                time_formats = "%Y/%m/%d %H:%M"
                try:
                    bsp_time = datetime.strptime(bsp_time_str, time_formats)
                except ValueError:
                    continue

                if bsp_time is None:
                    raise ValueError(f"无法解析时间格式: {bsp_time_str}")

                if bsp_time >= cutoff_time:
                    recent_buy_points.append(bsp)
                    logger.debug(
                        f"  ✓ 符合条件: type={bsp_type_values}, time={bsp.time}"
                    )
                else:
                    skipped_time_old += 1
                    logger.debug(
                        f"  时间过早: bsp_time={bsp_time}, cutoff={cutoff_time}"
                    )
            except Exception as e:
                skipped_parse_error += 1
                logger.warning(f"解析买点时间失败: {bsp.time}, 错误: {e}")
                continue

        logger.debug(
            f"过滤统计: 非买点={skipped_not_buy}, 类型不匹配={skipped_type_mismatch}, 时间过早={skipped_time_old}, 解析失败={skipped_parse_error}, 符合条件={len(recent_buy_points)}"
        )

        return recent_buy_points

    def start_scan(self, request: ScanRequest) -> str:
        """启动扫描任务"""
        task_id = str(uuid4())

        logger.info(f"========== 开始扫描任务 ==========")
        logger.info(f"任务ID: {task_id}")
        logger.info(
            f"扫描参数: stock_pool={request.stock_pool}, boards={request.boards}, kline_type={request.kline_type}"
        )
        logger.info(f"买点类型: {request.bsp_types}")
        logger.info(f"时间窗口: {request.time_window_days}天")
        logger.info(f"K线数量: {request.limit}")

        stocks = self.get_stock_list(
            request.stock_pool, request.boards, request.stock_codes
        )

        if not stocks:
            raise ValueError("没有可扫描的股票")

        logger.info(f"待扫描股票数: {len(stocks)}")
        if len(stocks) <= 10:
            logger.info(f"股票列表: {stocks}")
        else:
            logger.info(f"股票列表(前10): {stocks[:10]}...")

        # 创建数据库记录
        self.create_task_in_db(task_id, request, len(stocks))

        task = ScanTask(task_id, len(stocks))

        with self.lock:
            self.tasks[task_id] = task

        # 在后台线程中执行扫描
        threading.Thread(
            target=self._run_scan, args=(task, stocks, request), daemon=True
        ).start()

        return task_id

    def _run_scan(self, task: ScanTask, stocks: List[str], request: ScanRequest):
        """在后台线程中执行扫描"""
        last_db_update = time.time()
        DB_UPDATE_INTERVAL = 5  # 每5秒更新一次数据库

        try:
            futures = {
                self.executor.submit(self.scan_single_stock, code, request, task): code
                for code in stocks
            }

            for future in as_completed(futures):
                if task.cancelled:
                    break

                code = futures[future]
                try:
                    result = future.result(timeout=self.SINGLE_STOCK_TIMEOUT)
                    with task.lock:
                        task.processed_count += 1
                        if result:
                            task.results.extend(result)
                            task.found_count += len(result)

                    # 推送进度更新
                    self._push_progress(task)

                    # 定期更新数据库
                    if time.time() - last_db_update > DB_UPDATE_INTERVAL:
                        self.update_task_progress(task)
                        last_db_update = time.time()

                except Exception as e:
                    logger.warning(f"处理股票 {code} 结果失败: {e}")
                    with task.lock:
                        task.processed_count += 1

            # 扫描完成
            with task.lock:
                if task.cancelled:
                    task.status = "cancelled"
                else:
                    task.status = "completed"
                task.current_stock = None

            logger.info(f"========== 扫描任务完成 ==========")
            logger.info(f"任务ID: {task.task_id}")
            logger.info(f"状态: {task.status}")
            logger.info(f"已扫描: {task.processed_count}/{task.total_count}")
            logger.info(f"找到买点数: {task.found_count}")
            logger.info(f"耗时: {task.elapsed_time:.2f}秒")

            # 保存结果到数据库
            self.save_results_to_db(task.task_id, task.results)

            # 更新任务状态
            self.complete_task_in_db(task)

            # 最终进度推送
            self._push_progress(task)

        except Exception as e:
            logger.error(f"扫描任务 {task.task_id} 失败: {e}")
            with task.lock:
                task.status = "error"
                task.error_message = str(e)
            self.complete_task_in_db(task)
            self._push_progress(task)

    def _push_progress(self, task: ScanTask):
        """推送进度更新到SSE队列"""
        if task.progress_queue:
            try:
                # 使用线程安全的方式放入队列
                asyncio.run_coroutine_threadsafe(
                    task.progress_queue.put(task.to_progress()),
                    asyncio.get_event_loop(),
                )
            except Exception:
                pass

    def get_task(self, task_id: str) -> Optional[ScanTask]:
        """获取任务"""
        with self.lock:
            return self.tasks.get(task_id)

    def get_progress(self, task_id: str) -> Optional[ScanProgress]:
        """获取扫描进度"""
        task = self.get_task(task_id)
        if task:
            return task.to_progress()
        return None

    def get_result(self, task_id: str) -> Optional[ScanResultResponse]:
        """获取扫描结果（优先从内存，其次从数据库）"""
        task = self.get_task(task_id)
        if task:
            return task.to_result()
        # 如果内存中没有，从数据库获取
        return self.get_results_from_db(task_id)

    def cancel_scan(self, task_id: str) -> bool:
        """取消扫描任务"""
        task = self.get_task(task_id)
        if task and task.status == "running":
            with task.lock:
                task.cancelled = True
            return True
        return False

    def cleanup_old_tasks(self, max_age_seconds: int = 3600):
        """清理过期的内存任务（数据库中的任务保留）"""
        current_time = time.time()
        with self.lock:
            expired_tasks = [
                task_id
                for task_id, task in self.tasks.items()
                if current_time - task.start_time > max_age_seconds
            ]
            for task_id in expired_tasks:
                del self.tasks[task_id]


# 全局单例
scan_service = ScanService()
