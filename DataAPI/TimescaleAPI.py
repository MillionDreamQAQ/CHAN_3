import os
import logging
import psycopg
from datetime import datetime, timedelta
from typing import List, Tuple, Optional
from dotenv import load_dotenv

import baostock as bs
import chinese_calendar as calendar
from Common.CEnum import AUTYPE, DATA_FIELD, KL_TYPE
from Common.CTime import CTime
from Common.func_util import kltype_lt_day, str2float
from KLine.KLine_Unit import CKLine_Unit
from .CommonStockAPI import CCommonStockApi

# 加载环境变量
load_dotenv()

logger = logging.getLogger(__name__)


def is_trading_day(date_obj: datetime) -> bool:
    """
    判断是否为交易日
    排除周末和法定节假日

    Note: chinese_calendar 仅支持 2004-2026 年，超出范围只判断周末
    """
    # 周六周日不是交易日
    if date_obj.weekday() >= 5:
        return False

    # chinese_calendar 仅支持 2004-2026 年
    year = date_obj.year
    if 2004 <= year <= 2026:
        try:
            return calendar.is_workday(date_obj.date())
        except Exception:
            # 如果查询失败，认为是交易日（仅排除周末）
            return True
    else:
        # 超出范围，只能判断周末，周一到周五认为是交易日
        return True


def adjust_to_trading_day(date_str: str, direction: str = "backward") -> str:
    """
    调整日期到最近的交易日

    Args:
        date_str: 日期字符串 YYYY-MM-DD
        direction: 'backward' 向前找(找更早的日期), 'forward' 向后找(找更晚的日期)

    Returns:
        调整后的日期字符串 YYYY-MM-DD

    Note: chinese_calendar 仅支持 2004-2026 年，超出范围只排除周末
    """
    date_obj = datetime.strptime(date_str, "%Y-%m-%d")

    # 检查年份范围，给出提示
    if date_obj.year < 2004 or date_obj.year > 2026:
        logger.info(f"日期 {date_str} 超出节假日数据范围(2004-2026)，仅排除周末")

    # 如果已经是交易日，直接返回
    if is_trading_day(date_obj):
        return date_str

    # 最多尝试30天
    max_attempts = 30
    delta = timedelta(days=-1 if direction == "backward" else 1)

    for _ in range(max_attempts):
        date_obj += delta
        if is_trading_day(date_obj):
            adjusted_date = date_obj.strftime("%Y-%m-%d")
            logger.info(f"日期 {date_str} 不是交易日，自动调整为 {adjusted_date}")
            return adjusted_date

    # 如果30天内找不到交易日（几乎不可能），返回原日期
    logger.warning(f"无法为 {date_str} 找到最近的交易日，返回原日期")
    return date_str


def parse_time_column(inp):
    """解析时间列"""
    # 转换为字符串（可能是datetime对象）
    time_str = str(inp)

    # 提取日期部分（YYYY-MM-DD）
    # 支持格式：
    # - "YYYY-MM-DD" (长度10)
    # - "YYYY-MM-DD HH:MM:SS" (长度19)
    # - "YYYY-MM-DD HH:MM:SS+TZ" (带时区)
    if len(time_str) >= 10:
        year = int(time_str[:4])
        month = int(time_str[5:7])
        day = int(time_str[8:10])
        hour = minute = 0

        # 如果有时间部分，也解析出来
        if len(time_str) >= 16:
            try:
                hour = int(time_str[11:13])
                minute = int(time_str[14:16])
            except (ValueError, IndexError):
                # 时间部分解析失败，使用默认值0
                pass
    else:
        raise Exception(f"unknown time column format:{time_str}")

    return CTime(year, month, day, hour, minute)


class CTimescaleStockAPI(CCommonStockApi):
    """
    基于TimescaleDB的股票数据API
    优先从数据库获取数据，缺失时自动从BaoStock补充
    支持自动获取当天实时数据（来自AkShare）
    """

    is_connect = None

    # K线类型映射（用于实时数据获取）
    KLINE_TYPE_MAP = {
        KL_TYPE.K_DAY: "daily",
        KL_TYPE.K_WEEK: "weekly",
        KL_TYPE.K_MON: "monthly",
        KL_TYPE.K_60M: "60min",
        KL_TYPE.K_30M: "30min",
        KL_TYPE.K_15M: "15min",
        KL_TYPE.K_5M: "5min",
    }

    def __init__(
        self,
        code,
        k_type=KL_TYPE.K_DAY,
        begin_date=None,
        end_date=None,
        autype=AUTYPE.QFQ,
    ):
        self.db_conn = None
        self.db_cursor = None

        # 1. 先查询股票的上市日期
        stock_list_date = self._get_stock_list_date(code)

        # 2. 调整开始日期
        if begin_date:
            # 如果开始日期早于上市日期，使用上市日期
            if stock_list_date and begin_date < stock_list_date:
                logger.info(
                    f"{code} 上市日期为 {stock_list_date}，调整开始日期 {begin_date} → {stock_list_date}"
                )
                begin_date = stock_list_date

            # 调整到交易日
            begin_date = adjust_to_trading_day(begin_date, direction="forward")

        # 3. 调整结束日期到交易日
        if end_date:
            end_date = adjust_to_trading_day(end_date, direction="backward")

        super(CTimescaleStockAPI, self).__init__(
            code, k_type, begin_date, end_date, autype
        )

    def get_kl_data(self):
        """
        获取K线数据（主方法）
        1. 先从数据库查询历史数据
        2. 检查数据完整性，补充缺失数据（使用BaoStock）
        3. 如果查询包含当天，从AkShare获取实时数据并智能存储
        4. 返回完整数据（历史+实时）
        """
        try:
            # 连接数据库
            self._connect_db()

            # 查询数据库中的数据（历史表+实时表）
            db_data = list(self._query_from_database())

            # 检查历史数据完整性并获取缺失的日期范围（不包括今天）
            missing_ranges = self._find_missing_ranges(db_data)

            # 如果查询包含当天，先从AkShare获取今天的实时数据
            self._fetch_today_data_if_needed()

            # 如果有缺失数据，从baostock获取并保存
            if missing_ranges:
                logger.info(
                    f"{self.code} 发现 {len(missing_ranges)} 个数据缺失区间，开始补充..."
                )
                for start_date, end_date in missing_ranges:
                    self._fetch_and_save_from_baostock(start_date, end_date)

                # 重新从数据库查询完整数据
                db_data = list(self._query_from_database())

            # 返回数据
            for kline_unit in db_data:
                yield kline_unit

        finally:
            # 关闭数据库连接
            self._close_db()

    @staticmethod
    def _get_db_connection_params() -> dict:
        """
        获取数据库连接参数

        Returns:
            数据库连接参数字典
        """
        return {
            "host": os.getenv("DB_HOST", "localhost"),
            "port": os.getenv("DB_PORT", "5432"),
            "user": os.getenv("DB_USER", "postgres"),
            "password": os.getenv("DB_PASSWORD"),
            "dbname": os.getenv("DB_NAME", "stock_db"),
        }

    def _get_stock_list_date(self, code: str) -> Optional[str]:
        """
        从数据库获取股票的上市日期

        Args:
            code: 股票代码

        Returns:
            上市日期字符串 YYYY-MM-DD，如果查询失败返回 None
        """
        try:
            with psycopg.connect(**self._get_db_connection_params()) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        "SELECT list_date FROM stocks WHERE code = %s", (code,)
                    )
                    row = cursor.fetchone()

                    if row and row[0]:
                        # 转换为字符串格式 YYYY-MM-DD
                        list_date = row[0]
                        if isinstance(list_date, str):
                            # 如果是字符串，可能是 YYYY-MM-DD 格式
                            return (
                                list_date.split()[0] if " " in list_date else list_date
                            )
                        else:
                            # 如果是 datetime 对象
                            return list_date.strftime("%Y-%m-%d")

                    return None

        except Exception as e:
            logger.warning(f"查询 {code} 上市日期失败: {e}")
            return None

    def _connect_db(self):
        """连接TimescaleDB数据库"""
        try:
            self.db_conn = psycopg.connect(**self._get_db_connection_params())
            self.db_cursor = self.db_conn.cursor()
            logger.debug("数据库连接成功")
        except Exception as e:
            logger.error(f"数据库连接失败: {e}")
            raise

    def _close_db(self):
        """关闭数据库连接"""
        if self.db_cursor:
            self.db_cursor.close()
        if self.db_conn:
            self.db_conn.close()
        logger.debug("数据库连接已关闭")

    def _query_from_database(self):
        """
        从数据库查询K线数据（历史表 + 实时表）

        查询策略：
        1. 从历史表查询所有数据（包括当天已完成的K线）
        2. 如果查询包含当天，从实时表查询进行中的K线
        3. 合并两部分数据返回

        注意：
        - 历史表查询条件为 time::date <= end_date（包含今天）
        - 实时表只保存进行中的K线，已完成的会被移到历史表
        """
        table_name = self._get_table_name()
        is_minute = kltype_lt_day(self.k_type)

        try:
            # 1. 查询历史表（包含当天已完成的K线）
            if is_minute:
                # 分钟线 - 需要将 end_date 转换为当天结束时间
                sql_history = f"""
                    SELECT date, time, open, high, low, close, volume, amount
                    FROM {table_name}
                    WHERE code = %s
                    AND time >= %s
                    AND time::date <= %s
                    ORDER BY time ASC
                """
            else:
                # 日线、周线、月线
                sql_history = f"""
                    SELECT date, open, high, low, close, volume, amount, turn
                    FROM {table_name}
                    WHERE code = %s
                    AND date >= %s
                    AND date <= %s
                    ORDER BY date ASC
                """

            self.db_cursor.execute(
                sql_history, (self.code, self.begin_date, self.end_date)
            )
            historical_rows = self.db_cursor.fetchall()

            # 2. 如果查询范围包含当天，从实时表获取
            realtime_rows = []
            today = datetime.now().strftime("%Y-%m-%d")

            if self.end_date >= today:
                kline_type = self.KLINE_TYPE_MAP.get(self.k_type)

                if kline_type:
                    # 从实时表查询当天数据（只查今天的、未完成的K线）
                    sql_realtime = """
                        SELECT datetime::date, datetime, open, high, low, close, volume, amount, turn
                        FROM stock_kline_realtime
                        WHERE code = %s
                        AND kline_type = %s
                        AND datetime::date = CURRENT_DATE
                        ORDER BY stock_kline_realtime.datetime ASC
                    """
                    self.db_cursor.execute(sql_realtime, (self.code, kline_type))
                    realtime_rows = self.db_cursor.fetchall()

            # 3. 合并数据
            all_rows = list(historical_rows) + list(realtime_rows)
            logger.info(
                f"从数据库查询到 {len(historical_rows)} 条历史数据 + {len(realtime_rows)} 条实时数据 = {len(all_rows)} 条"
            )

            # 4. 处理并返回数据
            for row in all_rows:
                if is_minute:
                    # 分钟线: date, time, open, high, low, close, volume, amount[, turn]
                    if len(row) >= 8:
                        (
                            date_str,
                            time_str,
                            open_val,
                            high_val,
                            low_val,
                            close_val,
                            volume,
                            amount,
                        ) = row[:8]
                        time_obj = parse_time_column(str(time_str))
                        data_dict = self._build_kline_data_dict(
                            time_obj,
                            open_val,
                            high_val,
                            low_val,
                            close_val,
                            volume,
                            amount,
                        )
                else:
                    # 日、周、月: date, open, high, low, close, volume, amount, turn
                    (
                        time_str,
                        open_val,
                        high_val,
                        low_val,
                        close_val,
                        volume,
                        amount,
                        turn,
                    ) = row[:8]
                    time_obj = parse_time_column(str(time_str))
                    data_dict = self._build_kline_data_dict(
                        time_obj,
                        open_val,
                        high_val,
                        low_val,
                        close_val,
                        volume,
                        amount,
                        turn,
                    )

                yield CKLine_Unit(data_dict)

        except Exception as e:
            logger.error(f"从数据库查询数据失败: {e}")
            raise

    @staticmethod
    def _safe_float(val) -> Optional[float]:
        """安全转换为float"""
        return float(val) if val else None

    @staticmethod
    def _safe_int(val) -> Optional[int]:
        """安全转换为int（volume可能是浮点数格式的字符串）"""
        return int(float(val)) if val else None

    def _build_kline_data_dict(
        self,
        time_obj: CTime,
        open_val,
        high_val,
        low_val,
        close_val,
        volume,
        amount,
        turn=None,
    ) -> dict:
        """
        构建K线数据字典

        Args:
            time_obj: 时间对象
            open_val: 开盘价
            high_val: 最高价
            low_val: 最低价
            close_val: 收盘价
            volume: 成交量
            amount: 成交额
            turn: 换手率（仅日线、周线、月线有）

        Returns:
            数据字典
        """
        data_dict = {
            DATA_FIELD.FIELD_TIME: time_obj,
            DATA_FIELD.FIELD_OPEN: float(open_val) if open_val else 0.0,
            DATA_FIELD.FIELD_HIGH: float(high_val) if high_val else 0.0,
            DATA_FIELD.FIELD_LOW: float(low_val) if low_val else 0.0,
            DATA_FIELD.FIELD_CLOSE: float(close_val) if close_val else 0.0,
            DATA_FIELD.FIELD_VOLUME: float(volume) if volume else 0.0,
            DATA_FIELD.FIELD_TURNOVER: float(amount) if amount else 0.0,
        }

        # 只有日线、周线、月线有换手率
        if turn is not None:
            data_dict[DATA_FIELD.FIELD_TURNRATE] = float(turn) if turn else 0.0

        return data_dict

    def _get_table_name(self) -> str:
        """根据K线类型获取表名"""
        if self.k_type == KL_TYPE.K_DAY:
            return "stock_kline_daily"
        elif self.k_type == KL_TYPE.K_WEEK:
            return "stock_kline_weekly"
        elif self.k_type == KL_TYPE.K_MON:
            return "stock_kline_monthly"
        elif self.k_type == KL_TYPE.K_5M:
            return "stock_kline_5min"
        elif self.k_type == KL_TYPE.K_15M:
            return "stock_kline_15min"
        elif self.k_type == KL_TYPE.K_30M:
            return "stock_kline_30min"
        elif self.k_type == KL_TYPE.K_60M:
            return "stock_kline_60min"
        else:
            raise Exception(f"不支持的K线类型: {self.k_type}")

    def _find_missing_ranges(self, db_data: List[CKLine_Unit]) -> List[Tuple[str, str]]:
        """
        检查数据完整性，找出缺失的日期范围

        Args:
            db_data: 从数据库查询到的数据列表

        Returns:
            缺失的日期范围列表 [(start_date, end_date), ...]
        """
        if not db_data:
            # 完全没有数据，返回整个请求范围
            logger.info(
                f"{self.code} 数据库中无数据，需要获取完整范围: {self.begin_date} 至 {self.end_date}"
            )
            return [(self.begin_date, self.end_date)]

        missing_ranges = []

        # 将CTime转换为标准格式（YYYY-MM-DD）
        first_date = self._normalize_date(db_data[0].time)
        last_date = self._normalize_date(db_data[-1].time)

        # 检查开始日期之前是否有缺失
        if first_date > self.begin_date:
            end_date = self._prev_trading_day(first_date)
            missing_ranges.append((self.begin_date, end_date))
            logger.info(f"{self.code} 缺失开始段数据: {self.begin_date} 至 {end_date}")

        # 检查结束日期之后是否有缺失
        if last_date < self.end_date:
            start_date = self._next_trading_day(last_date)
            missing_ranges.append((start_date, self.end_date))
            logger.info(f"{self.code} 缺失结束段数据: {start_date} 至 {self.end_date}")

        # TODO: 检查中间是否有日期空洞（可选，复杂度较高）
        # 对于股票数据，通常不会有中间空洞，因为都是按交易日存储的

        return missing_ranges

    def _normalize_date(self, ctime: CTime) -> str:
        """将CTime对象转换为标准日期格式 YYYY-MM-DD"""
        return f"{ctime.year:04}-{ctime.month:02}-{ctime.day:02}"

    def _parse_date(self, date_str: str) -> datetime:
        """解析日期字符串，支持多种格式"""
        # 替换斜杠为横杠
        normalized = date_str.replace("/", "-")
        # 只取日期部分（去掉可能的时间部分）
        date_part = normalized.split()[0] if " " in normalized else normalized
        return datetime.strptime(date_part, "%Y-%m-%d")

    def _date_before(self, date_str: str) -> str:
        """返回给定日期的前一天（日历日期，不考虑交易日）"""
        date_obj = self._parse_date(date_str)
        return (date_obj - timedelta(days=1)).strftime("%Y-%m-%d")

    def _date_after(self, date_str: str) -> str:
        """返回给定日期的后一天（日历日期，不考虑交易日）"""
        date_obj = self._parse_date(date_str)
        return (date_obj + timedelta(days=1)).strftime("%Y-%m-%d")

    def _prev_trading_day(self, date_str: str) -> str:
        """返回给定日期的前一个交易日"""
        prev_date = self._date_before(date_str)
        return adjust_to_trading_day(prev_date, direction="backward")

    def _next_trading_day(self, date_str: str) -> str:
        """返回给定日期的后一个交易日"""
        next_date = self._date_after(date_str)
        return adjust_to_trading_day(next_date, direction="forward")

    def _fetch_and_save_from_baostock(self, start_date: str, end_date: str):
        """
        从BaoStock获取数据并保存到数据库

        Args:
            start_date: 开始日期
            end_date: 结束日期
        """
        logger.info(f"从BaoStock获取 {self.code} 数据: {start_date} 至 {end_date}")

        # 登录BaoStock
        if not self.is_connect:
            self.__class__.do_init()

        # 获取数据
        if kltype_lt_day(self.k_type):
            fields = "date,time,open,high,low,close,volume,amount"
        else:
            fields = "date,open,high,low,close,volume,amount,turn"
        autype_dict = {AUTYPE.QFQ: "2", AUTYPE.HFQ: "1", AUTYPE.NONE: "3"}

        try:
            rs = bs.query_history_k_data_plus(
                code=self.code,
                fields=fields,
                start_date=start_date,
                end_date=end_date,
                frequency=self.__convert_type(),
                adjustflag=autype_dict[self.autype],
            )

            if rs.error_code != "0":
                logger.error(f"BaoStock查询失败: {rs.error_msg}")
                return

            # 收集数据
            data_list = []
            while rs.error_code == "0" and rs.next():
                data_list.append(rs.get_row_data())

            if not data_list:
                logger.warning(f"{self.code} 在 {start_date} 至 {end_date} 无数据")
                return

            # 保存到数据库
            self._save_to_database(data_list)
            logger.info(f"成功保存 {len(data_list)} 条数据到数据库")

        except Exception as e:
            logger.error(f"从BaoStock获取数据失败: {e}")
            raise

    def _prepare_insert_records(self, data_list: List) -> List[tuple]:
        """
        准备批量插入的记录

        Args:
            data_list: 原始数据列表

        Returns:
            准备好的记录列表
        """
        records = []
        is_minute = kltype_lt_day(self.k_type)

        for row_data in data_list:
            if is_minute:
                # 分钟线: date, time, open, high, low, close, volume, amount
                (
                    date_str,
                    time_str,
                    open_val,
                    high_val,
                    low_val,
                    close_val,
                    volume,
                    amount,
                ) = row_data

                # 格式化时间字符串
                time_str = time_str[:14]
                time_str = f"{time_str[:4]}-{time_str[4:6]}-{time_str[6:8]} {time_str[8:10]}:{time_str[10:12]}:{time_str[12:14]}"

                records.append(
                    (
                        date_str,
                        time_str,
                        self.code,
                        self._safe_float(open_val),
                        self._safe_float(high_val),
                        self._safe_float(low_val),
                        self._safe_float(close_val),
                        self._safe_int(volume),
                        self._safe_float(amount),
                    )
                )
            else:
                # 日、周、月: date, open, high, low, close, volume, amount, turn
                (
                    date_str,
                    open_val,
                    high_val,
                    low_val,
                    close_val,
                    volume,
                    amount,
                    turn,
                ) = row_data

                records.append(
                    (
                        date_str,
                        self.code,
                        self._safe_float(open_val),
                        self._safe_float(high_val),
                        self._safe_float(low_val),
                        self._safe_float(close_val),
                        self._safe_int(volume),
                        self._safe_float(amount),
                        self._safe_float(turn),
                    )
                )

        return records

    def _save_to_database(self, data_list: List):
        """
        保存数据到数据库

        Args:
            data_list: 数据列表
            fields: 字段名称（逗号分隔）
        """
        table_name = self._get_table_name()

        # 构建插入SQL（使用ON CONFLICT避免重复）
        if kltype_lt_day(self.k_type):
            insert_sql = f"""
                INSERT INTO {table_name}
                (date, time, code, open, high, low, close, volume, amount)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (time, code) DO UPDATE SET
                    date = EXCLUDED.date,
                    open = EXCLUDED.open,
                    high = EXCLUDED.high,
                    low = EXCLUDED.low,
                    close = EXCLUDED.close,
                    volume = EXCLUDED.volume,
                    amount = EXCLUDED.amount
            """
        else:
            insert_sql = f"""
                INSERT INTO {table_name}
                (date, code, open, high, low, close, volume, amount, turn)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (date, code) DO UPDATE SET
                    open = EXCLUDED.open,
                    high = EXCLUDED.high,
                    low = EXCLUDED.low,
                    close = EXCLUDED.close,
                    volume = EXCLUDED.volume,
                    amount = EXCLUDED.amount,
                    turn = EXCLUDED.turn
            """

        try:
            # 准备批量插入数据
            records = self._prepare_insert_records(data_list)

            # 批量插入
            self.db_cursor.executemany(insert_sql, records)
            self.db_conn.commit()

            logger.debug(f"成功保存 {len(records)} 条数据到 {table_name}")

        except Exception as e:
            self.db_conn.rollback()
            logger.error(f"保存数据到数据库失败: {e}")
            raise

    def _cleanup_old_realtime_data(self):
        """
        清理实时表中的旧数据（非当天的数据）

        说明：
        - 实时表只应该保存当天的K线数据
        - 非当天的数据已经没用了（历史数据都在历史表）
        - 定期清理可以节省存储空间、提高查询性能

        清理策略：
        - 删除所有 datetime::date < CURRENT_DATE 的数据
        """
        try:
            sql = """
                DELETE FROM stock_kline_realtime
                WHERE datetime::date < CURRENT_DATE
            """
            self.db_cursor.execute(sql)
            deleted_count = self.db_cursor.rowcount
            self.db_conn.commit()

            if deleted_count > 0:
                logger.info(f"清理实时表旧数据: 删除 {deleted_count} 条")

        except Exception as e:
            logger.warning(f"清理实时表旧数据失败: {e}")
            # 清理失败不影响主流程，继续执行

    def _fetch_today_data_if_needed(self):
        """
        如果查询包含当天，从AkShare获取今天的实时数据并智能存储

        智能分流策略：
        - 已完成的K线 → 直接存入历史表（stock_kline_*）
        - 进行中的K线 → 临时存入实时表（stock_kline_realtime）

        示例（14:20查询60分钟线）：
        - 09:30-10:30 (已完成) → stock_kline_60min
        - 10:30-11:30 (已完成) → stock_kline_60min
        - 13:00-14:00 (已完成) → stock_kline_60min
        - 14:00-15:00 (进行中) → stock_kline_realtime
        """
        today = datetime.now().strftime("%Y-%m-%d")

        # 如果查询范围不包含今天，直接返回
        if self.end_date < today:
            return

        logger.info(f"{self.code} 查询包含当天，开始从AkShare获取实时数据...")

        try:
            # 1. 清理实时表中的旧数据（非当天的数据）
            self._cleanup_old_realtime_data()

            # 2. 导入必要的模块（延迟导入避免循环依赖）
            from DataAPI.realtime_updater import RealtimeDataUpdater

            # 3. 获取K线类型
            kline_type = self.KLINE_TYPE_MAP.get(self.k_type)

            if not kline_type:
                logger.warning(f"不支持的K线类型: {self.k_type}")
                return

            # 调用更新器获取今天的数据（会自动判断并分流存储）
            RealtimeDataUpdater.update_realtime_kline_smart(
                self.code, kline_type, self.db_conn, self.db_cursor
            )

            logger.info(f"✓ {self.code} 今天的{kline_type}数据已更新")

        except ImportError as e:
            logger.warning(f"无法导入实时更新模块: {e}，跳过当天数据获取")
        except Exception as e:
            logger.warning(f"获取今天数据失败: {e}，将只返回历史数据")

    def SetBasicInfo(self):
        """设置股票基本信息"""
        # 可以先尝试从数据库获取
        try:
            self._connect_db()
            sql = "SELECT name FROM stocks WHERE code = %s"
            self.db_cursor.execute(sql, (self.code,))
            row = self.db_cursor.fetchone()

            if row:
                self.name = row[0]
                self.is_stock = not self.code.startswith(
                    "sh.000"
                ) and not self.code.startswith("sz.399")
                logger.debug(f"从数据库获取股票信息: {self.code} - {self.name}")
                self._close_db()
                return

            self._close_db()
        except Exception as e:
            logger.warning(f"从数据库获取股票信息失败: {e}")
            if self.db_conn:
                self._close_db()

        # 如果数据库没有，从BaoStock获取
        if not self.is_connect:
            self.__class__.do_init()

        rs = bs.query_stock_basic(code=self.code)
        if rs.error_code != "0":
            raise Exception(rs.error_msg)

        code, code_name, ipoDate, outDate, stock_type, status = rs.get_row_data()
        self.name = code_name
        self.is_stock = stock_type == "1"

    @classmethod
    def do_init(cls):
        """初始化BaoStock连接"""
        if not cls.is_connect:
            cls.is_connect = bs.login()
            if cls.is_connect.error_code == "0":
                logger.info("BaoStock登录成功")
            else:
                logger.error(f"BaoStock登录失败: {cls.is_connect.error_msg}")

    @classmethod
    def do_close(cls):
        """关闭BaoStock连接"""
        if cls.is_connect:
            bs.logout()
            cls.is_connect = None
            logger.info("BaoStock退出登录")

    def __convert_type(self):
        """转换K线类型为BaoStock格式"""
        _dict = {
            KL_TYPE.K_DAY: "d",
            KL_TYPE.K_WEEK: "w",
            KL_TYPE.K_MON: "m",
            KL_TYPE.K_5M: "5",
            KL_TYPE.K_15M: "15",
            KL_TYPE.K_30M: "30",
            KL_TYPE.K_60M: "60",
        }
        return _dict.get(self.k_type, "d")
