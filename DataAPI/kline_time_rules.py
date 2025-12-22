"""
K线时间规则计算模块

核心功能：
1. 计算每天各级别K线的时间点（基于A股交易时间）
2. 判断当前时间所在的K线时间段
3. 判断K线是否已完成

A股交易时间：
- 上午：09:30 - 11:30 (2小时 = 120分钟)
- 下午：13:00 - 15:00 (2小时 = 120分钟)
- 合计：240分钟/天

支持的K线级别：
- daily: 1根/天
- 60min: 4根/天 (09:30, 10:30, 13:00, 14:00)
- 30min: 8根/天
- 15min: 16根/天
- 5min: 48根/天
"""

from datetime import datetime, time, timedelta
from typing import List, Tuple


class KLineTimeRules:
    """K线时间规则 - A股交易时间"""

    # A股交易时段
    MORNING_START = time(9, 30)  # 上午开盘
    MORNING_END = time(11, 30)  # 上午收盘
    AFTERNOON_START = time(13, 0)  # 下午开盘
    AFTERNOON_END = time(15, 0)  # 下午收盘

    # 每天各级别K线数量
    KLINE_COUNTS = {
        "daily": 1,
        "60min": 4,  # 9:30-10:30, 10:30-11:30, 13:00-14:00, 14:00-15:00
        "30min": 8,
        "15min": 16,
        "5min": 48,
    }

    @staticmethod
    def get_all_kline_times(kline_type: str, date: datetime.date) -> List[datetime]:
        """
        获取指定日期的所有K线开始时间

        Args:
            kline_type: K线类型 ('daily', '60min', '30min', '15min', '5min')
            date: 日期

        Returns:
            K线开始时间列表

        Examples:
            >>> KLineTimeRules.get_all_kline_times('60min', date(2025, 12, 22))
            [datetime(2025, 12, 22, 9, 30),
             datetime(2025, 12, 22, 10, 30),
             datetime(2025, 12, 22, 13, 0),
             datetime(2025, 12, 22, 14, 0)]

            >>> KLineTimeRules.get_all_kline_times('5min', date(2025, 12, 22))
            [datetime(2025, 12, 22, 9, 30),
             datetime(2025, 12, 22, 9, 35),
             ...
             datetime(2025, 12, 22, 14, 55)]  # 共48根
        """
        if kline_type == "daily":
            # 日K线只有一根，使用开盘时间
            return [datetime.combine(date, KLineTimeRules.MORNING_START)]

        # 分钟K线
        minutes = int(kline_type.replace("min", ""))
        kline_times = []

        # 上午时段
        current = datetime.combine(date, KLineTimeRules.MORNING_START)
        morning_end = datetime.combine(date, KLineTimeRules.MORNING_END)
        while current < morning_end:
            kline_times.append(current)
            current += timedelta(minutes=minutes)

        # 下午时段
        current = datetime.combine(date, KLineTimeRules.AFTERNOON_START)
        afternoon_end = datetime.combine(date, KLineTimeRules.AFTERNOON_END)
        while current < afternoon_end:
            kline_times.append(current)
            current += timedelta(minutes=minutes)

        return kline_times

    @staticmethod
    def get_expected_count(kline_type: str) -> int:
        """
        获取每天应有的K线数量

        Args:
            kline_type: K线类型

        Returns:
            K线数量
        """
        return KLineTimeRules.KLINE_COUNTS.get(kline_type, 0)

    @staticmethod
    def get_kline_at_time(
        kline_type: str, current_time: datetime = None
    ) -> Tuple[datetime, datetime, bool]:
        """
        获取指定时间所在的K线时间段

        Args:
            kline_type: K线类型
            current_time: 当前时间（默认为现在）

        Returns:
            (K线开始时间, K线结束时间, 是否已完成)

        Examples:
            >>> # 假设现在是 2025-12-22 10:15
            >>> KLineTimeRules.get_kline_at_time('60min')
            (datetime(2025, 12, 22, 9, 30),   # 开始
             datetime(2025, 12, 22, 10, 30),  # 结束
             False)                           # 未完成

            >>> # 假设现在是 2025-12-22 10:35
            >>> KLineTimeRules.get_kline_at_time('60min')
            (datetime(2025, 12, 22, 10, 30),  # 开始
             datetime(2025, 12, 22, 11, 30),  # 结束
             False)                           # 未完成
        """
        if current_time is None:
            current_time = datetime.now()

        date = current_time.date()

        # 日K线特殊处理
        if kline_type == "daily":
            start = datetime.combine(date, KLineTimeRules.MORNING_START)
            end = datetime.combine(date, KLineTimeRules.AFTERNOON_END)
            is_finished = current_time >= end
            return start, end, is_finished

        # 分钟K线
        all_times = KLineTimeRules.get_all_kline_times(kline_type, date)
        minutes = int(kline_type.replace("min", ""))

        # 找到当前所在的K线
        for i, kline_start in enumerate(all_times):
            kline_end = kline_start + timedelta(minutes=minutes)

            if kline_start <= current_time < kline_end:
                # 当前K线正在进行中
                return kline_start, kline_end, False
            elif current_time >= kline_end and i == len(all_times) - 1:
                # 最后一根K线已完成（收盘后）
                return kline_start, kline_end, True

        # 盘前或午休时段
        if current_time < all_times[0]:
            # 盘前，返回第一根（未完成）
            kline_end = all_times[0] + timedelta(minutes=minutes)
            return all_times[0], kline_end, False
        else:
            # 收盘后，返回最后一根（已完成）
            last_start = all_times[-1]
            last_end = last_start + timedelta(minutes=minutes)
            return last_start, last_end, True

    @staticmethod
    def is_trading_time(current_time: datetime = None) -> bool:
        """
        判断是否在交易时间内

        Args:
            current_time: 当前时间（默认为现在）

        Returns:
            是否在交易时间内
        """
        if current_time is None:
            current_time = datetime.now()

        current_time_only = current_time.time()

        # 上午时段
        if (
            KLineTimeRules.MORNING_START
            <= current_time_only
            <= KLineTimeRules.MORNING_END
        ):
            return True

        # 下午时段
        if (
            KLineTimeRules.AFTERNOON_START
            <= current_time_only
            <= KLineTimeRules.AFTERNOON_END
        ):
            return True

        return False

    @staticmethod
    def get_trading_minutes() -> int:
        """
        获取每天的交易分钟数

        Returns:
            交易分钟数（240分钟 = 4小时）
        """
        # 上午: 9:30-11:30 = 2小时 = 120分钟
        # 下午: 13:00-15:00 = 2小时 = 120分钟
        # 总计: 240分钟
        return 240
