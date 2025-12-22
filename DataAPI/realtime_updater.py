"""
实时数据更新器
从 AkShare 获取当天的实时K线数据并智能存储：
- 已完成的K线 → 直接存入历史表
- 进行中的K线 → 临时存入实时表

支持所有K线级别：日线、60分钟、30分钟、15分钟、5分钟
"""

import logging
import akshare as ak
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict
from Backend.utils.database import DatabaseConnection
from DataAPI.kline_time_rules import KLineTimeRules

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


class RealtimeDataUpdater:
    """实时数据更新器 - 智能分流存储"""

    # AkShare period 映射
    PERIOD_MAP = {
        "daily": None,  # 日线使用不同的接口
        "5min": "5",
        "15min": "15",
        "30min": "30",
        "60min": "60",
    }

    @staticmethod
    def update_realtime_kline_smart(code: str, kline_type: str, db_conn, db_cursor):
        """
        智能更新今天的K线数据（用于TimescaleAPI按需调用）

        工作流程：
        1. 从AkShare获取当天数据
        2. 判断每根K线是否已完成（根据当前时间）
        3. 已完成的K线 → 直接存入历史表（stock_kline_*）
        4. 进行中的K线 → 临时存入实时表（stock_kline_realtime）

        Args:
            code: 股票代码（如 sh.600519）
            kline_type: K线类型（'daily', '60min', '30min', '15min', '5min'）
            db_conn: 数据库连接（复用外部连接）
            db_cursor: 数据库游标（复用外部游标）
        """
        try:
            pure_code = code.split(".")[-1]  # 转换为纯数字代码（600519）

            if kline_type == "daily":
                # 日K线处理
                RealtimeDataUpdater._update_daily_smart(
                    code, pure_code, kline_type, db_conn, db_cursor
                )
            else:
                # 分钟K线处理
                RealtimeDataUpdater._update_minute_smart(
                    code, pure_code, kline_type, db_conn, db_cursor
                )

        except Exception as e:
            logger.error(f"智能更新 {code} {kline_type} 失败: {e}")
            raise

    @staticmethod
    def _update_daily_smart(
        code: str, pure_code: str, kline_type: str, db_conn, db_cursor
    ):
        """
        智能更新日K线

        Args:
            code: 完整股票代码（如 sh.600519）
            pure_code: 纯数字代码（如 600519）
            kline_type: K线类型（'daily'）
            db_conn: 数据库连接
            db_cursor: 数据库游标
        """
        today = datetime.now().strftime("%Y%m%d")

        # 从 AkShare 获取当天日K数据
        df = ak.stock_zh_a_hist(
            symbol=pure_code,
            period="daily",
            start_date=today,
            end_date=today,
            adjust="qfq",
        )

        if df.empty:
            logger.warning(f"{code} 当天无日K数据（可能未开盘或停牌）")
            return

        row = df.iloc[-1]
        start_time, end_time, is_finished = KLineTimeRules.get_kline_at_time("daily")

        kline_data = {
            "open": float(row["开盘"]),
            "high": float(row["最高"]),
            "low": float(row["最低"]),
            "close": float(row["收盘"]),
            "volume": int(row["成交量"]),
            "amount": float(row["成交额"]),
            "turn": float(row.get("换手率", 0)) if "换手率" in row else None,
        }

        # 智能分流存储
        if is_finished:
            # 已完成（收盘后） → 历史表
            RealtimeDataUpdater._save_to_history_table(
                code, kline_type, start_time, kline_data, db_conn, db_cursor
            )
            logger.info(f"✓ {code} 日K线 → 历史表 (已完成)")
        else:
            # 进行中（盘中） → 实时表
            RealtimeDataUpdater._save_to_realtime_table_with_conn(
                code,
                kline_type,
                start_time,
                kline_data,
                is_finished,
                db_conn,
                db_cursor,
            )
            logger.info(f"✓ {code} 日K线 → 实时表 (进行中)")

    @staticmethod
    def _update_minute_smart(
        code: str, pure_code: str, kline_type: str, db_conn, db_cursor
    ):
        """
        智能更新分钟K线

        策略：
        - 直接使用AkShare的聚合数据（数据准确，时间戳为K线结束时间）

        Args:
            code: 完整股票代码（如 sh.600519）
            pure_code: 纯数字代码（如 600519）
            kline_type: K线类型（'60min', '30min', '15min', '5min'）
            db_conn: 数据库连接
            db_cursor: 数据库游标
        """
        period = RealtimeDataUpdater.PERIOD_MAP[kline_type]
        minutes = int(kline_type.replace("min", ""))

        # 直接使用AkShare的聚合数据
        df = ak.stock_zh_a_hist_min_em(
            symbol=pure_code, period=period, adjust="qfq"
        )

        if df.empty:
            logger.warning(f"{code} {kline_type} 当天无数据")
            return

        df["时间"] = pd.to_datetime(df["时间"])
        today = datetime.now().date()

        finished_count = 0
        ongoing_count = 0

        # 只处理当天的数据
        df_today = df[df["时间"].dt.date == today]

        # 遍历AkShare返回的每根K线
        for idx, row in df_today.iterrows():
            kline_end_time = row["时间"]  # AkShare返回的是K线结束时间

            # K线数据
            kline_data = {
                "open": float(row["开盘"]),
                "high": float(row["最高"]),
                "low": float(row["最低"]),
                "close": float(row["收盘"]),
                "volume": int(row["成交量"]) * 100,
                "amount": float(row["成交额"]),
                "turn": None,  # 分钟线没有换手率
            }

            # 判断是否完成（当前时间 >= K线结束时间）
            is_finished = datetime.now() >= kline_end_time

            # 智能分流存储（直接使用AkShare的结束时间，不需要转换）
            if is_finished:
                # 已完成 → 历史表
                RealtimeDataUpdater._save_to_history_table_direct(
                    code, kline_type, kline_end_time, kline_data, db_conn, db_cursor
                )
                finished_count += 1
            else:
                # 进行中 → 实时表
                RealtimeDataUpdater._save_to_realtime_table_direct(
                    code,
                    kline_type,
                    kline_end_time,
                    kline_data,
                    is_finished,
                    db_conn,
                    db_cursor,
                )
                ongoing_count += 1

        logger.info(
            f"✓ {code} {kline_type}: {finished_count}根→历史表, {ongoing_count}根→实时表"
        )

    @staticmethod
    def _save_to_history_table(
        code: str,
        kline_type: str,
        kline_time: datetime,
        kline_data: Dict,
        db_conn,
        db_cursor,
    ):
        """
        保存到历史表（已完成的K线）

        Args:
            code: 股票代码
            kline_type: K线类型
            kline_time: K线开始时间（AkShare格式）
            kline_data: K线数据字典
            db_conn: 数据库连接
            db_cursor: 数据库游标

        注意：
            AkShare 使用开始时间，BaoStock 使用结束时间
            需要将开始时间转换为结束时间以保持一致
            例如：09:30 (开始) → 10:30 (结束) for 60min
        """
        # 根据类型选择表名
        table_map = {
            "daily": "stock_kline_daily",
            "5min": "stock_kline_5min",
            "15min": "stock_kline_15min",
            "30min": "stock_kline_30min",
            "60min": "stock_kline_60min",
        }
        table_name = table_map.get(kline_type)
        if not table_name:
            return

        if kline_type == "daily":
            # 日K线
            sql = f"""
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
            db_cursor.execute(
                sql,
                (
                    kline_time.date(),
                    code,
                    kline_data["open"],
                    kline_data["high"],
                    kline_data["low"],
                    kline_data["close"],
                    kline_data["volume"],
                    kline_data["amount"],
                    kline_data.get("turn"),
                ),
            )
        else:
            # 分钟K线：将开始时间转换为结束时间（与BaoStock保持一致）
            minutes = int(kline_type.replace("min", ""))
            end_time = kline_time + timedelta(minutes=minutes)

            sql = f"""
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
            db_cursor.execute(
                sql,
                (
                    kline_time.date(),
                    end_time,  # 使用结束时间
                    code,
                    kline_data["open"],
                    kline_data["high"],
                    kline_data["low"],
                    kline_data["close"],
                    kline_data["volume"],
                    kline_data["amount"],
                ),
            )

        db_conn.commit()

    @staticmethod
    def _save_to_realtime_table_with_conn(
        code: str,
        kline_type: str,
        kline_time: datetime,
        kline_data: Dict,
        is_finished: bool,
        db_conn,
        db_cursor,
    ):
        """
        保存到实时表（进行中的K线）

        Args:
            code: 股票代码
            kline_type: K线类型
            kline_time: K线开始时间（AkShare格式）
            kline_data: K线数据字典
            is_finished: 是否完成（通常为 False）
            db_conn: 数据库连接
            db_cursor: 数据库游标

        注意：
            需要将开始时间转换为结束时间以与BaoStock保持一致
        """
        # 将开始时间转换为结束时间（与BaoStock保持一致）
        if kline_type == "daily":
            end_time = kline_time
        else:
            minutes = int(kline_type.replace("min", ""))
            end_time = kline_time + timedelta(minutes=minutes)

        sql = """
            INSERT INTO stock_kline_realtime
            (code, kline_type, datetime, open, high, low, close, volume, amount, turn, is_finished, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (code, kline_type, datetime) DO UPDATE SET
                open = EXCLUDED.open,
                high = EXCLUDED.high,
                low = EXCLUDED.low,
                close = EXCLUDED.close,
                volume = EXCLUDED.volume,
                amount = EXCLUDED.amount,
                turn = EXCLUDED.turn,
                is_finished = EXCLUDED.is_finished,
                updated_at = NOW()
        """

        db_cursor.execute(
            sql,
            (
                code,
                kline_type,
                end_time,  # 使用结束时间
                kline_data["open"],
                kline_data["high"],
                kline_data["low"],
                kline_data["close"],
                kline_data["volume"],
                kline_data["amount"],
                kline_data.get("turn"),
                is_finished,
            ),
        )
        db_conn.commit()

    @staticmethod
    def _save_to_history_table_direct(
        code: str,
        kline_type: str,
        kline_end_time: datetime,
        kline_data: Dict,
        db_conn,
        db_cursor,
    ):
        """
        直接保存到历史表（不转换时间，AkShare已经提供结束时间）

        Args:
            code: 股票代码
            kline_type: K线类型
            kline_end_time: K线结束时间（AkShare格式，已经是结束时间）
            kline_data: K线数据字典
            db_conn: 数据库连接
            db_cursor: 数据库游标
        """
        # 根据类型选择表名
        table_map = {
            "daily": "stock_kline_daily",
            "5min": "stock_kline_5min",
            "15min": "stock_kline_15min",
            "30min": "stock_kline_30min",
            "60min": "stock_kline_60min",
        }
        table_name = table_map.get(kline_type)
        if not table_name:
            return

        if kline_type == "daily":
            # 日K线
            sql = f"""
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
            db_cursor.execute(
                sql,
                (
                    kline_end_time.date(),
                    code,
                    kline_data["open"],
                    kline_data["high"],
                    kline_data["low"],
                    kline_data["close"],
                    kline_data["volume"],
                    kline_data["amount"],
                    kline_data.get("turn"),
                ),
            )
        else:
            # 分钟K线：直接使用AkShare的结束时间，不需要转换
            sql = f"""
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
            db_cursor.execute(
                sql,
                (
                    kline_end_time.date(),
                    kline_end_time,  # 直接使用结束时间，不转换
                    code,
                    kline_data["open"],
                    kline_data["high"],
                    kline_data["low"],
                    kline_data["close"],
                    kline_data["volume"],
                    kline_data["amount"],
                ),
            )

        db_conn.commit()

    @staticmethod
    def _save_to_realtime_table_direct(
        code: str,
        kline_type: str,
        kline_end_time: datetime,
        kline_data: Dict,
        is_finished: bool,
        db_conn,
        db_cursor,
    ):
        """
        直接保存到实时表（不转换时间，AkShare已经提供结束时间）

        Args:
            code: 股票代码
            kline_type: K线类型
            kline_end_time: K线结束时间（AkShare格式，已经是结束时间）
            kline_data: K线数据字典
            is_finished: 是否完成（通常为 False）
            db_conn: 数据库连接
            db_cursor: 数据库游标
        """
        sql = """
            INSERT INTO stock_kline_realtime
            (code, kline_type, datetime, open, high, low, close, volume, amount, turn, is_finished, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (code, kline_type, datetime) DO UPDATE SET
                open = EXCLUDED.open,
                high = EXCLUDED.high,
                low = EXCLUDED.low,
                close = EXCLUDED.close,
                volume = EXCLUDED.volume,
                amount = EXCLUDED.amount,
                turn = EXCLUDED.turn,
                is_finished = EXCLUDED.is_finished,
                updated_at = NOW()
        """

        db_cursor.execute(
            sql,
            (
                code,
                kline_type,
                kline_end_time,  # 直接使用结束时间，不转换
                kline_data["open"],
                kline_data["high"],
                kline_data["low"],
                kline_data["close"],
                kline_data["volume"],
                kline_data["amount"],
                kline_data.get("turn"),
                is_finished,
            ),
        )
        db_conn.commit()
