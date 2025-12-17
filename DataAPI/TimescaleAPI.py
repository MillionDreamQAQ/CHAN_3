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
    """
    # 周六周日不是交易日
    if date_obj.weekday() >= 5:
        return False

    # 使用chinese_calendar判断是否为节假日
    return calendar.is_workday(date_obj.date())


def adjust_to_trading_day(date_str: str, direction: str = 'backward') -> str:
    """
    调整日期到最近的交易日

    Args:
        date_str: 日期字符串 YYYY-MM-DD
        direction: 'backward' 向前找(找更早的日期), 'forward' 向后找(找更晚的日期)

    Returns:
        调整后的日期字符串 YYYY-MM-DD
    """
    date_obj = datetime.strptime(date_str, "%Y-%m-%d")

    # 如果已经是交易日，直接返回
    if is_trading_day(date_obj):
        return date_str

    # 最多尝试30天
    max_attempts = 30
    delta = timedelta(days=-1 if direction == 'backward' else 1)

    for _ in range(max_attempts):
        date_obj += delta
        if is_trading_day(date_obj):
            adjusted_date = date_obj.strftime("%Y-%m-%d")
            logger.info(f"日期 {date_str} 不是交易日，自动调整为 {adjusted_date}")
            return adjusted_date

    # 如果30天内找不到交易日（几乎不可能），返回原日期
    logger.warning(f"无法为 {date_str} 找到最近的交易日，返回原日期")
    return date_str


def create_item_dict(data, column_name):
    """创建K线数据字典"""
    for i in range(len(data)):
        data[i] = parse_time_column(data[i]) if i == 0 else str2float(data[i])
    return dict(zip(column_name, data))


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


def GetColumnNameFromFieldList(fields: str):
    """从字段列表获取列名"""
    _dict = {
        "time": DATA_FIELD.FIELD_TIME,
        "date": DATA_FIELD.FIELD_TIME,
        "open": DATA_FIELD.FIELD_OPEN,
        "high": DATA_FIELD.FIELD_HIGH,
        "low": DATA_FIELD.FIELD_LOW,
        "close": DATA_FIELD.FIELD_CLOSE,
        "volume": DATA_FIELD.FIELD_VOLUME,
        "amount": DATA_FIELD.FIELD_TURNOVER,
        "turn": DATA_FIELD.FIELD_TURNRATE,
    }
    return [_dict[x] for x in fields.split(",")]


class CTimescaleStockAPI(CCommonStockApi):
    """
    基于TimescaleDB的股票数据API
    优先从数据库获取数据，缺失时自动从BaoStock补充
    """

    is_connect = None

    def __init__(self, code, k_type=KL_TYPE.K_DAY, begin_date=None, end_date=None, autype=AUTYPE.QFQ):
        self.db_conn = None
        self.db_cursor = None

        # 智能调整日期到交易日
        if begin_date:
            begin_date = adjust_to_trading_day(begin_date, direction='backward')
        if end_date:
            end_date = adjust_to_trading_day(end_date, direction='backward')

        super(CTimescaleStockAPI, self).__init__(code, k_type, begin_date, end_date, autype)

    def get_kl_data(self):
        """
        获取K线数据（主方法）
        1. 先从数据库查询
        2. 检查数据完整性
        3. 补充缺失数据
        4. 返回完整数据
        """
        try:
            # 连接数据库
            self._connect_db()

            # 查询数据库中的数据
            db_data = list(self._query_from_database())

            # 检查数据完整性并获取缺失的日期范围
            missing_ranges = self._find_missing_ranges(db_data)

            # 如果有缺失数据，从baostock获取并保存
            if missing_ranges:
                logger.info(f"{self.code} 发现 {len(missing_ranges)} 个数据缺失区间，开始补充...")
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

    def _connect_db(self):
        """连接TimescaleDB数据库"""
        try:
            self.db_conn = psycopg.connect(
                host=os.getenv("DB_HOST", "localhost"),
                port=os.getenv("DB_PORT", "5432"),
                user=os.getenv("DB_USER", "postgres"),
                password=os.getenv("DB_PASSWORD"),
                dbname=os.getenv("DB_NAME", "stock_db"),
            )
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
        """从数据库查询K线数据"""
        table_name = self._get_table_name()

        # 构建SQL查询
        if kltype_lt_day(self.k_type):
            # 分钟级别数据（暂不支持）
            logger.warning("分钟级别数据暂不支持从数据库获取")
            return

        # 日线、周线、月线
        sql = f"""
            SELECT date, open, high, low, close, volume, amount, turn
            FROM {table_name}
            WHERE code = %s
            AND date >= %s
            AND date <= %s
            ORDER BY date ASC
        """

        try:
            self.db_cursor.execute(sql, (self.code, self.begin_date, self.end_date))
            rows = self.db_cursor.fetchall()

            logger.info(f"从数据库查询到 {len(rows)} 条 {self.code} 的数据")

            # 转换为CKLine_Unit对象
            for row in rows:
                time_str, open_val, high_val, low_val, close_val, volume, amount, turn = row

                # 解析时间
                time_obj = parse_time_column(str(time_str))

                # 构建数据字典
                data_dict = {
                    DATA_FIELD.FIELD_TIME: time_obj,
                    DATA_FIELD.FIELD_OPEN: float(open_val) if open_val else 0.0,
                    DATA_FIELD.FIELD_HIGH: float(high_val) if high_val else 0.0,
                    DATA_FIELD.FIELD_LOW: float(low_val) if low_val else 0.0,
                    DATA_FIELD.FIELD_CLOSE: float(close_val) if close_val else 0.0,
                    DATA_FIELD.FIELD_VOLUME: float(volume) if volume else 0.0,
                    DATA_FIELD.FIELD_TURNOVER: float(amount) if amount else 0.0,
                    DATA_FIELD.FIELD_TURNRATE: float(turn) if turn else 0.0,
                }

                yield CKLine_Unit(data_dict)

        except Exception as e:
            logger.error(f"从数据库查询数据失败: {e}")
            raise

    def _get_table_name(self) -> str:
        """根据K线类型获取表名"""
        if self.k_type == KL_TYPE.K_DAY:
            return "stock_kline_daily"
        elif self.k_type == KL_TYPE.K_WEEK:
            return "stock_kline_weekly"
        elif self.k_type == KL_TYPE.K_MON:
            return "stock_kline_monthly"
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
            logger.info(f"{self.code} 数据库中无数据，需要获取完整范围: {self.begin_date} 至 {self.end_date}")
            return [(self.begin_date, self.end_date)]

        missing_ranges = []

        # 将CTime转换为标准格式（YYYY-MM-DD）
        first_date = self._normalize_date(db_data[0].time)
        last_date = self._normalize_date(db_data[-1].time)

        # 检查开始日期之前是否有缺失
        if first_date > self.begin_date:
            missing_ranges.append((self.begin_date, self._date_before(first_date)))
            logger.info(f"{self.code} 缺失开始段数据: {self.begin_date} 至 {self._date_before(first_date)}")

        # 检查结束日期之后是否有缺失
        if last_date < self.end_date:
            missing_ranges.append((self._date_after(last_date), self.end_date))
            logger.info(f"{self.code} 缺失结束段数据: {self._date_after(last_date)} 至 {self.end_date}")

        # TODO: 检查中间是否有日期空洞（可选，复杂度较高）
        # 对于股票数据，通常不会有中间空洞，因为都是按交易日存储的

        return missing_ranges

    def _normalize_date(self, ctime: CTime) -> str:
        """将CTime对象转换为标准日期格式 YYYY-MM-DD"""
        return f"{ctime.year:04}-{ctime.month:02}-{ctime.day:02}"

    def _parse_date(self, date_str: str) -> datetime:
        """解析日期字符串，支持多种格式"""
        # 替换斜杠为横杠
        normalized = date_str.replace('/', '-')
        # 只取日期部分（去掉可能的时间部分）
        date_part = normalized.split()[0] if ' ' in normalized else normalized
        return datetime.strptime(date_part, "%Y-%m-%d")

    def _date_before(self, date_str: str) -> str:
        """返回给定日期的前一天"""
        date_obj = self._parse_date(date_str)
        return (date_obj - timedelta(days=1)).strftime("%Y-%m-%d")

    def _date_after(self, date_str: str) -> str:
        """返回给定日期的后一天"""
        date_obj = self._parse_date(date_str)
        return (date_obj + timedelta(days=1)).strftime("%Y-%m-%d")

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

            if rs.error_code != '0':
                logger.error(f"BaoStock查询失败: {rs.error_msg}")
                return

            # 收集数据
            data_list = []
            while rs.error_code == '0' and rs.next():
                data_list.append(rs.get_row_data())

            if not data_list:
                logger.warning(f"{self.code} 在 {start_date} 至 {end_date} 无数据")
                return

            # 保存到数据库
            self._save_to_database(data_list, fields)
            logger.info(f"成功保存 {len(data_list)} 条数据到数据库")

        except Exception as e:
            logger.error(f"从BaoStock获取数据失败: {e}")
            raise

    def _save_to_database(self, data_list: List, fields: str):
        """
        保存数据到数据库

        Args:
            data_list: 数据列表
            fields: 字段名称（逗号分隔）
        """
        table_name = self._get_table_name()

        # 构建插入SQL（使用ON CONFLICT避免重复）
        if self.k_type == KL_TYPE.K_DAY:
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
        else:  # 周线、月线
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
            records = []
            for row_data in data_list:
                date_str, open_val, high_val, low_val, close_val, volume, amount, turn = row_data

                records.append((
                    date_str,
                    self.code,
                    float(open_val) if open_val else None,
                    float(high_val) if high_val else None,
                    float(low_val) if low_val else None,
                    float(close_val) if close_val else None,
                    int(float(volume)) if volume else None,
                    float(amount) if amount else None,
                    float(turn) if turn else None,
                ))

            # 批量插入
            self.db_cursor.executemany(insert_sql, records)
            self.db_conn.commit()

            logger.debug(f"成功保存 {len(records)} 条数据到 {table_name}")

        except Exception as e:
            self.db_conn.rollback()
            logger.error(f"保存数据到数据库失败: {e}")
            raise

    def SetBasciInfo(self):
        """设置股票基本信息"""
        # 可以先尝试从数据库获取
        try:
            self._connect_db()
            sql = "SELECT name FROM stocks WHERE code = %s"
            self.db_cursor.execute(sql, (self.code,))
            row = self.db_cursor.fetchone()

            if row:
                self.name = row[0]
                self.is_stock = not self.code.startswith('sh.000') and not self.code.startswith('sz.399')
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
        if rs.error_code != '0':
            raise Exception(rs.error_msg)

        code, code_name, ipoDate, outDate, stock_type, status = rs.get_row_data()
        self.name = code_name
        self.is_stock = (stock_type == '1')

    @classmethod
    def do_init(cls):
        """初始化BaoStock连接"""
        if not cls.is_connect:
            cls.is_connect = bs.login()
            if cls.is_connect.error_code == '0':
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
            KL_TYPE.K_DAY: 'd',
            KL_TYPE.K_WEEK: 'w',
            KL_TYPE.K_MON: 'm',
        }
        return _dict.get(self.k_type, 'd')
