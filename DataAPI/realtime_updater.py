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

    # K线类型到表名映射
    TABLE_MAP = {
        "daily": "stock_kline_daily",
        "weekly": "stock_kline_weekly",
        "monthly": "stock_kline_monthly",
        "5min": "stock_kline_5min",
        "15min": "stock_kline_15min",
        "30min": "stock_kline_30min",
        "60min": "stock_kline_60min",
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
        table_name = RealtimeDataUpdater.TABLE_MAP.get(kline_type)
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
                        f"√ {code} {kline_type} 已收盘且数据完整，跳过AkShare请求"
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
                # 获取所有K线时间点
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
                        f"√ {code} {kline_type} 数据完整 (已完成{finished_klines}根，数据库{total_count}条)，跳过AkShare请求"
                    )
                    return True
                else:
                    logger.info(
                        f"x {code} {kline_type} 数据不完整 (已完成{finished_klines}根，数据库仅{total_count}条)，需要从AkShare更新"
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
            logger.info(f"√ {code} 日K线 → 历史表 (已完成)")
        else:
            # 进行中（盘中） → 实时表
            RealtimeDataUpdater._save_to_realtime_table(
                code,
                kline_type,
                start_time,
                kline_data,
                is_finished,
                db_conn,
                db_cursor,
            )
            logger.info(f"√ {code} 日K线 → 实时表 (进行中)")

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
        now = datetime.now()

        # 只处理当天的数据
        df_today = df[df["时间"].dt.date == today]

        # 分类收集数据（批量处理）
        history_records = []  # 已完成的K线 → 历史表
        realtime_records = []  # 进行中的K线 → 实时表

        # 遍历AkShare返回的每根K线，分类收集
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
            is_finished = now >= kline_end_time

            if is_finished:
                # 已完成 → 收集到历史表批次
                history_records.append((kline_end_time, kline_data))
            else:
                # 进行中 → 收集到实时表批次
                realtime_records.append((kline_end_time, kline_data, is_finished))

        # 批量插入历史表
        if history_records:
            RealtimeDataUpdater._batch_save_to_history_table(
                code, kline_type, history_records, db_conn, db_cursor
            )

        # 批量插入实时表
        if realtime_records:
            RealtimeDataUpdater._batch_save_to_realtime_table(
                code, kline_type, realtime_records, db_conn, db_cursor
            )

        logger.info(
            f"√ {code} {kline_type}: {len(history_records)}根→历史表, {len(realtime_records)}根→实时表"
        )

    @staticmethod
    def _save_to_history_table(
        code: str,
        kline_type: str,
        kline_time: datetime,
        kline_data: Dict,
        db_conn,
        db_cursor,
        time_is_end: bool = False,
    ):
        """
        保存到历史表（已完成的K线）

        Args:
            code: 股票代码
            kline_type: K线类型
            kline_time: K线时间（开始时间或结束时间，由 time_is_end 参数决定）
            kline_data: K线数据字典
            db_conn: 数据库连接
            db_cursor: 数据库游标
            time_is_end: 时间是否已经是结束时间（默认 False，表示需要转换）

        注意：
            - time_is_end=False: kline_time 是开始时间，需要转换为结束时间（与BaoStock保持一致）
            - time_is_end=True: kline_time 已经是结束时间，直接使用
        """
        # 使用类常量获取表名
        table_name = RealtimeDataUpdater.TABLE_MAP.get(kline_type)
        if not table_name:
            return

        # 处理时间转换
        if kline_type in ["daily", "weekly", "monthly"]:
            # 日K线、周K线、月K线 - 不需要转换
            final_time = kline_time
        else:
            # 分钟K线 - 根据 time_is_end 参数决定是否转换
            if time_is_end:
                final_time = kline_time  # 已经是结束时间
            else:
                # 需要将开始时间转换为结束时间
                minutes = int(kline_type.replace("min", ""))
                final_time = kline_time + timedelta(minutes=minutes)

        # 执行插入
        if kline_type in ["daily", "weekly", "monthly"]:
            # 日/周/月K线
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
                    final_time.date(),
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
            # 分钟K线
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
                    final_time.date(),
                    final_time,
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
    def _save_to_realtime_table(
        code: str,
        kline_type: str,
        kline_time: datetime,
        kline_data: Dict,
        is_finished: bool,
        db_conn,
        db_cursor,
        time_is_end: bool = False,
    ):
        """
        保存到实时表（进行中的K线）

        Args:
            code: 股票代码
            kline_type: K线类型
            kline_time: K线时间（开始时间或结束时间，由 time_is_end 参数决定）
            kline_data: K线数据字典
            is_finished: 是否完成（通常为 False）
            db_conn: 数据库连接
            db_cursor: 数据库游标
            time_is_end: 时间是否已经是结束时间（默认 False，表示需要转换）

        注意：
            - time_is_end=False: kline_time 是开始时间，需要转换为结束时间（与BaoStock保持一致）
            - time_is_end=True: kline_time 已经是结束时间，直接使用
        """
        # 处理时间转换
        if kline_type in ["daily", "weekly", "monthly"]:
            final_time = kline_time
        else:
            if time_is_end:
                final_time = kline_time  # 已经是结束时间
            else:
                # 需要将开始时间转换为结束时间
                minutes = int(kline_type.replace("min", ""))
                final_time = kline_time + timedelta(minutes=minutes)

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
                final_time,
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
    def _batch_save_to_history_table(
        code: str,
        kline_type: str,
        records: list,
        db_conn,
        db_cursor,
    ):
        """
        批量保存到历史表（已完成的K线）

        Args:
            code: 股票代码
            kline_type: K线类型
            records: 记录列表，每条记录为 (kline_end_time, kline_data)
            db_conn: 数据库连接
            db_cursor: 数据库游标
        """
        if not records:
            return

        # 使用类常量获取表名
        table_name = RealtimeDataUpdater.TABLE_MAP.get(kline_type)
        if not table_name:
            return

        # 构建批量插入SQL
        if kline_type in ["daily", "weekly", "monthly"]:
            # 日/周/月K线
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
            # 准备批量数据
            batch_data = [
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
                )
                for kline_time, kline_data in records
            ]
        else:
            # 分钟K线
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
            # 准备批量数据
            batch_data = [
                (
                    kline_time.date(),
                    kline_time,
                    code,
                    kline_data["open"],
                    kline_data["high"],
                    kline_data["low"],
                    kline_data["close"],
                    kline_data["volume"],
                    kline_data["amount"],
                )
                for kline_time, kline_data in records
            ]

        # 批量执行
        db_cursor.executemany(sql, batch_data)
        db_conn.commit()

    @staticmethod
    def _batch_save_to_realtime_table(
        code: str,
        kline_type: str,
        records: list,
        db_conn,
        db_cursor,
    ):
        """
        批量保存到实时表（进行中的K线）

        Args:
            code: 股票代码
            kline_type: K线类型
            records: 记录列表，每条记录为 (kline_end_time, kline_data, is_finished)
            db_conn: 数据库连接
            db_cursor: 数据库游标
        """
        if not records:
            return

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

        # 准备批量数据
        batch_data = [
            (
                code,
                kline_type,
                kline_time,
                kline_data["open"],
                kline_data["high"],
                kline_data["low"],
                kline_data["close"],
                kline_data["volume"],
                kline_data["amount"],
                kline_data.get("turn"),
                is_finished,
            )
            for kline_time, kline_data, is_finished in records
        ]

        # 批量执行
        db_cursor.executemany(sql, batch_data)
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
        start_time, end_time, is_finished = KLineTimeRules.get_kline_at_time("daily")

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
            logger.info(f"√ {code} 指数日K线 → 历史表 (已完成)")
        else:
            # 进行中（盘中） → 实时表
            RealtimeDataUpdater._save_to_realtime_table(
                code,
                kline_type,
                start_time,
                kline_data,
                is_finished,
                db_conn,
                db_cursor,
            )
            logger.info(f"√ {code} 指数日K线 → 实时表 (进行中)")
