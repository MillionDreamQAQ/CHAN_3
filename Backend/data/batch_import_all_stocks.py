"""
批量导入所有股票的K线数据
从 stocks 表获取所有股票，使用 baostock 获取日K、周K、月K数据并存储到对应的数据库表
"""

import sys
from pathlib import Path

# 将项目根目录添加到 Python 路径
root_dir = Path(__file__).parent.parent
sys.path.insert(0, str(root_dir))

import logging
import time
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import baostock as bs
import pandas as pd
from utils.database import DatabaseConnection

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(
            f"batch_import_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
        ),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)


class BatchStockDataImporter:
    """批量股票数据导入器"""

    def __init__(self):
        self.lg = None
        self.db_conn = None
        self.success_count = 0
        self.failed_count = 0
        self.failed_stocks = []

    def login_baostock(self):
        """登录 baostock"""
        self.lg = bs.login()
        if self.lg.error_code != "0":
            logger.error("baostock 登录失败: %s", self.lg.error_msg)
            return False
        logger.info("baostock 登录成功")
        return True

    def logout_baostock(self):
        """退出 baostock"""
        if self.lg:
            bs.logout()
            logger.info("baostock 退出登录")

    def get_all_stocks(self) -> List[Dict]:
        """
        从 stocks 表获取所有股票信息

        Returns:
            List[Dict]: 股票列表，每个元素包含 code, name, list_date
        """
        logger.info("开始从数据库获取股票列表...")

        try:
            with DatabaseConnection() as db:
                if not db.conn:
                    logger.error("数据库连接失败")
                    return []

                query = """
                    SELECT code, name, list_date
                    FROM stocks
                    WHERE code NOT LIKE 'bj.%'
                    ORDER BY code
                """

                db.cursor.execute(query)
                stocks = db.cursor.fetchall()

                stock_list = []
                for stock in stocks:
                    stock_list.append(
                        {"code": stock[0], "name": stock[1], "list_date": stock[2]}
                    )

                logger.info("成功获取 %d 只股票（已排除北交所）", len(stock_list))
                return stock_list

        except Exception as e:
            logger.error("获取股票列表失败: %s", e)
            return []

    def format_stock_code(self, code: str) -> str:
        """
        验证并返回股票代码（数据库中已经是 baostock 格式）

        Args:
            code: 股票代码，格式为 sh.600519 或 sz.000001

        Returns:
            str: baostock 格式的代码
        """
        # 数据库中的 code 已经是完整格式（sh./sz./bj.），直接返回
        return code

    def calculate_start_date(
        self, list_date: Optional[str], default_years: int = 5
    ) -> str:
        """
        计算开始日期

        Args:
            list_date: 股票上市日期
            default_years: 默认获取年数

        Returns:
            str: 开始日期，格式 YYYY-MM-DD
        """
        # 默认从当前日期往前推 default_years 年
        default_start = datetime.now() - timedelta(days=365 * default_years)

        if list_date:
            # 如果有上市日期，取上市日期和默认日期中较晚的
            if isinstance(list_date, str):
                list_dt = datetime.strptime(list_date, "%Y-%m-%d")
            else:
                list_dt = list_date

            # convert list_dt to datetime if it's not already
            if not isinstance(list_dt, datetime):
                list_dt = datetime.strptime(list_dt.strftime("%Y-%m-%d"), "%Y-%m-%d")

            start_date = min(list_dt, default_start)
        else:
            start_date = default_start

        return start_date.strftime("%Y-%m-%d")

    def fetch_kline_data(
        self, code: str, start_date: str, end_date: str, frequency: str
    ) -> Optional[pd.DataFrame]:
        """
        从 baostock 获取K线数据

        Args:
            code: 股票代码，如 sh.600519
            start_date: 开始日期，格式 YYYY-MM-DD
            end_date: 结束日期，格式 YYYY-MM-DD
            frequency: 数据频率，d=日，w=周，m=月

        Returns:
            DataFrame: K线数据
        """
        try:
            fields = "date,code,open,high,low,close,volume,amount,turn"

            rs = bs.query_history_k_data_plus(
                code,
                fields,
                start_date=start_date,
                end_date=end_date,
                frequency=frequency,
                adjustflag="2",  # 前复权
            )

            if rs.error_code != "0":
                if "登录" in rs.error_msg or "login" in rs.error_msg.lower():
                    logger.error(
                        "查询失败: %s [可能是登录会话过期，将在下次重新登录]",
                        rs.error_msg,
                    )
                else:
                    logger.error("查询失败: %s", rs.error_msg)
                return None

            # 获取数据
            data_list = []
            while (rs.error_code == "0") & rs.next():
                data_list.append(rs.get_row_data())

            if not data_list:
                logger.warning("%s 在指定时间范围内没有 %s 线数据", code, frequency)
                return None

            # 转换为 DataFrame
            df = pd.DataFrame(data_list, columns=rs.fields)

            # 数据类型转换
            numeric_columns = [
                "open",
                "high",
                "low",
                "close",
                "volume",
                "amount",
                "turn",
            ]
            for col in numeric_columns:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors="coerce")

            # 过滤掉无效数据
            df = df.dropna(subset=["open", "high", "low", "close"], how="all")

            return df

        except Exception as e:
            logger.error("获取 %s 的 %s 线数据时出错: %s", code, frequency, e)
            return None

    def save_to_database(self, df: pd.DataFrame, table_name: str, conn, cursor) -> bool:
        """
        保存数据到数据库

        Args:
            df: 数据DataFrame
            table_name: 表名
            conn: 数据库连接
            cursor: 数据库游标

        Returns:
            bool: 是否成功
        """
        if df is None or df.empty:
            return False

        try:
            insert_sql = f"""
                INSERT INTO {table_name}
                (date, code, open, high, low, close, volume, amount, turn)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (date, code) DO NOTHING
            """

            # 准备数据
            records = []
            for _, row in df.iterrows():
                records.append(
                    (
                        row["date"],
                        row["code"],
                        float(row["open"]) if pd.notna(row["open"]) else None,
                        float(row["high"]) if pd.notna(row["high"]) else None,
                        float(row["low"]) if pd.notna(row["low"]) else None,
                        float(row["close"]) if pd.notna(row["close"]) else None,
                        int(row["volume"]) if pd.notna(row["volume"]) else None,
                        float(row["amount"]) if pd.notna(row["amount"]) else None,
                        float(row["turn"]) if pd.notna(row["turn"]) else None,
                    )
                )

            # 批量插入
            cursor.executemany(insert_sql, records)
            conn.commit()

            return True

        except Exception as e:
            conn.rollback()
            logger.error("保存数据到 %s 失败: %s", table_name, e)
            return False

    def import_single_stock(
        self, stock_info: Dict, start_date: str, end_date: str
    ) -> Dict:
        """
        导入单个股票的数据

        Args:
            stock_info: 股票信息字典，包含 code, name, list_date
            start_date: 开始日期
            end_date: 结束日期

        Returns:
            dict: 导入结果
        """
        code = stock_info["code"]
        name = stock_info["name"]

        # 格式化股票代码
        bs_code = self.format_stock_code(code)

        logger.info(
            "\n处理股票: %s (%s) - %s 至 %s", name, bs_code, start_date, end_date
        )

        results = {
            "code": code,
            "name": name,
            "success": False,
            "daily": {"success": False, "count": 0},
            "weekly": {"success": False, "count": 0},
            "monthly": {"success": False, "count": 0},
        }

        try:
            with DatabaseConnection() as db:
                if not db.conn:
                    logger.error("数据库连接失败")
                    return results

                # 导入日K线数据
                df_daily = self.fetch_kline_data(bs_code, start_date, end_date, "d")
                if df_daily is not None:
                    results["daily"]["success"] = self.save_to_database(
                        df_daily, "stock_kline_daily", db.conn, db.cursor
                    )
                    results["daily"]["count"] = len(df_daily)
                    logger.info("  日K线: %d 条", len(df_daily))

                # 导入周K线数据
                df_weekly = self.fetch_kline_data(bs_code, start_date, end_date, "w")
                if df_weekly is not None:
                    results["weekly"]["success"] = self.save_to_database(
                        df_weekly, "stock_kline_weekly", db.conn, db.cursor
                    )
                    results["weekly"]["count"] = len(df_weekly)
                    logger.info("  周K线: %d 条", len(df_weekly))

                # 导入月K线数据
                df_monthly = self.fetch_kline_data(bs_code, start_date, end_date, "m")
                if df_monthly is not None:
                    results["monthly"]["success"] = self.save_to_database(
                        df_monthly, "stock_kline_monthly", db.conn, db.cursor
                    )
                    results["monthly"]["count"] = len(df_monthly)
                    logger.info("  月K线: %d 条", len(df_monthly))

                # 判断整体是否成功（至少一个频率成功）
                results["success"] = (
                    results["daily"]["success"]
                    or results["weekly"]["success"]
                    or results["monthly"]["success"]
                )

        except Exception as e:
            logger.error("导入股票 %s (%s) 失败: %s", name, code, e)
            results["success"] = False

        return results

    def batch_import(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        delay: float = 0.5,
        max_stocks: Optional[int] = None,
        relogin_interval: int = 50,
        start_index: int = 0,
    ):
        """
        批量导入所有股票数据

        Args:
            start_date: 开始日期，格式 YYYY-MM-DD，如果为 None 则根据上市日期自动计算
            end_date: 结束日期，格式 YYYY-MM-DD，默认为今天
            delay: 每个股票之间的延迟时间（秒），避免请求过快
            max_stocks: 最多处理的股票数量，用于测试，None 表示处理所有
            relogin_interval: 每处理多少只股票后重新登录，默认 50
            start_index: 从第几只股票开始处理（0-based），用于中断后续传，默认 0
        """
        logger.info("=" * 80)
        logger.info("开始批量导入股票数据")
        logger.info("=" * 80)

        # 设置结束日期
        if end_date is None:
            end_date = datetime.now().strftime("%Y-%m-%d")

        # 获取所有股票
        all_stocks = self.get_all_stocks()
        if not all_stocks:
            logger.error("没有获取到股票列表，退出")
            return

        total_stocks = len(all_stocks)

        # 验证 start_index
        if start_index < 0:
            logger.error("start_index 不能为负数")
            return
        if start_index >= total_stocks:
            logger.error(
                "start_index (%d) 超出股票总数 (%d)", start_index, total_stocks
            )
            return

        # 从指定位置开始切片
        stocks = all_stocks[start_index:]

        # 限制处理数量（用于测试）
        if max_stocks:
            stocks = stocks[:max_stocks]
            logger.info(
                "测试模式：处理 %d 只股票（从第 %d 只开始）",
                len(stocks),
                start_index + 1,
            )
        elif start_index > 0:
            logger.info(
                "续传模式：从第 %d 只股票开始，剩余 %d 只", start_index + 1, len(stocks)
            )

        total = len(stocks)
        logger.info("准备导入 %d 只股票的数据（总共 %d 只）", total, total_stocks)

        # 登录 baostock
        if not self.login_baostock():
            logger.error("baostock 登录失败，无法继续")
            return

        # 开始时间
        start_time = time.time()

        # 遍历所有股票
        for idx, stock in enumerate(stocks, 1):
            try:
                # 计算全局索引（显示用）
                global_idx = start_index + idx

                # 定期重新登录，保持会话活跃
                if (idx - 1) % relogin_interval == 0 and idx > 1:
                    logger.info(
                        "\n>>> 已处理 %d 只股票，重新登录 baostock 以保持会话...",
                        idx - 1,
                    )
                    self.logout_baostock()
                    time.sleep(1)  # 等待1秒再重新登录
                    if not self.login_baostock():
                        logger.error("重新登录失败，程序终止")
                        break
                    logger.info(">>> 重新登录成功，继续处理...\n")

                # 计算开始日期
                stock_start_date = start_date
                if stock_start_date is None:
                    stock_start_date = self.calculate_start_date(stock.get("list_date"))

                logger.info(
                    "\n[%d/%d] (全局 %d/%d) 开始处理...",
                    idx,
                    total,
                    global_idx,
                    total_stocks,
                )

                # 导入单个股票
                result = self.import_single_stock(stock, stock_start_date, end_date)

                # 统计结果
                if result["success"]:
                    self.success_count += 1
                    logger.info("成功: %s (%s)", result["name"], result["code"])
                else:
                    self.failed_count += 1
                    self.failed_stocks.append(
                        {"code": result["code"], "name": result["name"]}
                    )
                    logger.warning("失败: %s (%s)", result["name"], result["code"])

                # 进度提示
                logger.info(
                    "进度: %d/%d (成功: %d, 失败: %d)",
                    idx,
                    total,
                    self.success_count,
                    self.failed_count,
                )

                # 延迟，避免请求过快
                if idx < total:
                    time.sleep(delay)

            except Exception as e:
                logger.error("处理股票时发生异常: %s", e)
                self.failed_count += 1
                continue

        # 退出 baostock
        self.logout_baostock()

        # 计算耗时
        elapsed_time = time.time() - start_time

        # 输出最终统计
        logger.info("\n" + "=" * 80)
        logger.info("批量导入完成！")
        logger.info("=" * 80)
        logger.info("总计: %d 只股票", total)
        logger.info("成功: %d 只", self.success_count)
        logger.info("失败: %d 只", self.failed_count)
        logger.info("耗时: %.2f 秒 (%.2f 分钟)", elapsed_time, elapsed_time / 60)

        # 输出失败的股票列表
        if self.failed_stocks:
            logger.info("\n失败的股票列表:")
            for stock in self.failed_stocks:
                logger.info("  - %s (%s)", stock["name"], stock["code"])

        logger.info("=" * 80)


def main():
    """主函数"""
    import argparse

    parser = argparse.ArgumentParser(description="批量导入所有股票的K线数据")
    parser.add_argument(
        "--start-date", type=str, help="开始日期 (YYYY-MM-DD)，不指定则从上市日期开始"
    )
    parser.add_argument(
        "--end-date", type=str, help="结束日期 (YYYY-MM-DD)，默认为今天"
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.5,
        help="每个股票之间的延迟时间（秒），默认 0.5",
    )
    parser.add_argument("--max-stocks", type=int, help="最多处理的股票数量，用于测试")
    parser.add_argument(
        "--relogin-interval",
        type=int,
        default=300,
        help="每处理多少只股票后重新登录，默认 300",
    )
    parser.add_argument(
        "--start-index",
        type=int,
        default=0,
        help="从第几只股票开始处理（0-based），用于中断后续传，默认 0",
    )

    args = parser.parse_args()

    # 创建导入器实例
    importer = BatchStockDataImporter()

    # 执行批量导入
    importer.batch_import(
        start_date=args.start_date,
        end_date=args.end_date,
        delay=args.delay,
        max_stocks=args.max_stocks,
        relogin_interval=args.relogin_interval,
        # start_index=args.start_index,
        start_index=477,
    )


if __name__ == "__main__":
    main()
