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
    def is_index_code(code: str) -> bool:
        """
        判断是否为指数代码

        Args:
            code: 带前缀的代码，如 sh.000001 或 sz.399001

        Returns:
            True: 指数, False: 股票
        """
        return code.startswith("sh.000") or code.startswith("sz.399")

    @staticmethod
    def update_realtime_kline_smart(code: str, kline_type: str, db_conn, db_cursor):
        """
        智能更新今天的K线数据（用于TimescaleAPI按需调用）

        工作流程：
        1. 判断是股票还是指数
        2. 从AkShare获取当天数据（调用不同接口）
        3. 判断每根K线是否已完成（根据当前时间）
        4. 已完成的K线 → 直接存入历史表（stock_kline_*）
        5. 进行中的K线 → 临时存入实时表（stock_kline_realtime）

        Args:
            code: 股票/指数代码（如 sh.600519 或 sh.000001）
            kline_type: K线类型（'monthly', 'weekly', 'daily', '60min', '30min', '15min', '5min'）
            db_conn: 数据库连接（复用外部连接）
            db_cursor: 数据库游标（复用外部游标）
        """
        try:
            pure_code = code.split(".")[-1]  # 转换为纯数字代码（600519 或 000001）
            is_index = RealtimeDataUpdater.is_index_code(code)  # 判断是否为指数

            logger.info(f"{code} 类型: {'指数' if is_index else '股票'}")

            if (
                kline_type == "daily"
                or kline_type == "monthly"
                or kline_type == "weekly"
            ):
                # 日K线处理
                if is_index:
                    RealtimeDataUpdater._update_index_daily_smart(
                        code, pure_code, kline_type, db_conn, db_cursor
                    )
                else:
                    RealtimeDataUpdater._update_daily_smart(
                        code, pure_code, kline_type, db_conn, db_cursor
                    )
            else:
                # 分钟K线处理
                if is_index:
                    logger.warning(f"{code} 暂不支持指数分钟K线数据")
                    return
                else:
                    RealtimeDataUpdater._update_minute_smart(
                        code, pure_code, kline_type, db_conn, db_cursor
                    )

        except Exception as e:
            logger.error(f"智能更新 {code} {kline_type} 失败: {e}")
            raise

    @staticmethod
    def _check_today_data_exists(code: str, kline_type: str, db_cursor) -> bool:
        """
        检查数据库中今天的数据是否完整（历史表 + 实时表）

        Args:
            code: 股票/指数代码
            kline_type: K线类型
            db_cursor: 数据库游标

        Returns:
            True: 数据完整, False: 数据不完整或不存在
        """
        today = datetime.now().date()
        now = datetime.now()

        # 1. 检查历史表
        table_map = {
            "daily": "stock_kline_daily",
            "weekly": "stock_kline_weekly",
            "monthly": "stock_kline_monthly",
            "5min": "stock_kline_5min",
            "15min": "stock_kline_15min",
            "30min": "stock_kline_30min",
            "60min": "stock_kline_60min",
        }
        table_name = table_map.get(kline_type)
        if not table_name:
            return False

        try:
            # 获取历史表中今天的数据数量
            if kline_type in ["daily", "weekly", "monthly"]:
                # 日线/周线/月线：只有1根
                sql = f"SELECT COUNT(*) FROM {table_name} WHERE code = %s AND date = %s"
                db_cursor.execute(sql, (code, today))
                history_count = db_cursor.fetchone()[0]

                # 如果已收盘且历史表有数据，说明数据完整
                _, _, is_finished = KLineTimeRules.get_kline_at_time(kline_type, now)
                if is_finished and history_count > 0:
                    logger.info(
                        f"✓ {code} {kline_type} 已收盘且数据完整，跳过AkShare请求"
                    )
                    return True

            else:
                # 分钟线：需要检查数据是否完整
                sql = f"SELECT COUNT(*) FROM {table_name} WHERE code = %s AND time::date = %s"
                db_cursor.execute(sql, (code, today))
                history_count = db_cursor.fetchone()[0]

            # 2. 检查实时表
            sql_realtime = """
                SELECT COUNT(*) FROM stock_kline_realtime
                WHERE code = %s AND kline_type = %s AND datetime::date = %s
            """
            db_cursor.execute(sql_realtime, (code, kline_type, today))
            realtime_count = db_cursor.fetchone()[0]

            total_count = history_count + realtime_count

            # 3. 判断数据是否完整（针对分钟线）
            if kline_type in ["5min", "15min", "30min", "60min"]:
                # 获取当前应有的K线数量
                expected_count = KLineTimeRules.get_expected_count(kline_type)
                all_kline_times = KLineTimeRules.get_all_kline_times(kline_type, today)

                # 计算已经完成的K线数量
                finished_klines = sum(
                    1
                    for kt in all_kline_times
                    if now >= kt + timedelta(minutes=int(kline_type.replace("min", "")))
                )

                # 如果已完成的K线数量 == 数据库中的数量，说明数据完整
                if total_count >= finished_klines and finished_klines > 0:
                    logger.info(
                        f"✓ {code} {kline_type} 数据完整 (已完成{finished_klines}根，数据库{total_count}条)，跳过AkShare请求"
                    )
                    return True
                else:
                    logger.info(
                        f"✗ {code} {kline_type} 数据不完整 (已完成{finished_klines}根，数据库仅{total_count}条)，需要从AkShare更新"
                    )
                    return False

            return False

        except Exception as e:
            logger.warning(f"检查今天数据失败: {e}，继续从AkShare获取")
            return False

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
        # 先检查数据库中是否已有今天的数据
        if RealtimeDataUpdater._check_today_data_exists(code, kline_type, db_cursor):
            return

        today = datetime.now().strftime("%Y%m%d")

        # 从 AkShare 获取当天日K数据
        logger.info(f"从AkShare获取 {code} {kline_type} 数据...")
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
            "volume": int(row["成交量"]) * 100,
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
        # 先检查数据库中是否已有今天的数据
        if RealtimeDataUpdater._check_today_data_exists(code, kline_type, db_cursor):
            return

        period = RealtimeDataUpdater.PERIOD_MAP[kline_type]
        minutes = int(kline_type.replace("min", ""))

        # 直接使用AkShare的聚合数据
        logger.info(f"从AkShare获取 {code} {kline_type} 数据...")
        df = ak.stock_zh_a_hist_min_em(symbol=pure_code, period=period, adjust="qfq")

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
        if kline_type == "daily" or kline_type == "monthly" or kline_type == "weekly":
            # 日K线、月K线、周K线
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

    @staticmethod
    def _update_index_daily_smart(
        code: str, pure_code: str, kline_type: str, db_conn, db_cursor
    ):
        """
        智能更新指数日K线

        Args:
            code: 完整指数代码（如 sh.000001）
            pure_code: 纯数字代码（如 000001）
            kline_type: K线类型（'daily'）
            db_conn: 数据库连接
            db_cursor: 数据库游标
        """
        # 先检查数据库中是否已有今天的数据
        if RealtimeDataUpdater._check_today_data_exists(code, kline_type, db_cursor):
            return

        today = datetime.now().strftime("%Y%m%d")

        # 从 AkShare 获取指数日K数据（注意：使用 index_zh_a_hist）
        logger.info(f"从AkShare获取 {code} 指数{kline_type} 数据...")
        df = ak.index_zh_a_hist(
            symbol=pure_code,
            period="daily",
            start_date=today,
            end_date=today,
        )

        if df.empty:
            logger.warning(f"{code} 当天无指数日K数据（可能未开盘）")
            return

        row = df.iloc[-1]
        start_time, is_finished = KLineTimeRules.get_kline_at_time("daily")

        kline_data = {
            "open": float(row["开盘"]),
            "high": float(row["最高"]),
            "low": float(row["最低"]),
            "close": float(row["收盘"]),
            "volume": int(row["成交量"]) * 100,
            "amount": float(row["成交额"]),
            "turn": float((row["换手率"])),
        }

        # 智能分流存储
        if is_finished:
            # 已完成（收盘后） → 历史表
            RealtimeDataUpdater._save_to_history_table(
                code, kline_type, start_time, kline_data, db_conn, db_cursor
            )
            logger.info(f"✓ {code} 指数日K线 → 历史表 (已完成)")
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
            logger.info(f"✓ {code} 指数日K线 → 实时表 (进行中)")
