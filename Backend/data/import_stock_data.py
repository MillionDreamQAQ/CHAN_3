"""
股票数据导入到 TimescaleDB
从 baostock 获取日K、周K、月K数据并存储到对应的数据库表
"""

import sys
from pathlib import Path

# 将项目根目录添加到 Python 路径
root_dir = Path(__file__).parent.parent
sys.path.insert(0, str(root_dir))

import logging
import baostock as bs
import pandas as pd
from utils.database import DatabaseConnection

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


class StockDataImporter:
    """股票数据导入器"""

    def __init__(self):
        self.lg = None
        self.db_conn = None

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

    def fetch_kline_data(self, code, start_date, end_date, frequency):
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
        logger.info(
            "开始获取 %s 的 %s 线数据: %s 至 %s", code, frequency, start_date, end_date
        )

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
                logger.error("查询失败: %s", rs.error_msg)
                return None

            # 获取数据
            data_list = []
            while (rs.error_code == "0") & rs.next():
                data_list.append(rs.get_row_data())

            if not data_list:
                logger.warning("%s 在指定时间范围内没有数据", code)
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

            # 过滤掉无效数据（所有价格字段都为空的行）
            df = df.dropna(subset=["open", "high", "low", "close"], how="all")

            logger.info("成功获取 %d 条数据", len(df))
            return df

        except Exception as e:
            logger.error("获取数据时出错: %s", e)
            return None

    def save_to_database(self, df, table_name, conn, cursor, frequency):
        """
        保存数据到数据库

        Args:
            df: 数据DataFrame
            table_name: 表名
            conn: 数据库连接
            cursor: 数据库游标
            frequency: 数据频率，d=日，w=周，m=月

        Returns:
            bool: 是否成功
        """
        if df is None or df.empty:
            logger.warning("没有数据需要保存")
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
                if frequency == "d":
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
                else:
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

            # 批量插入（使用事务）
            cursor.executemany(insert_sql, records)
            conn.commit()

            # 统计插入的行数
            cursor.execute(
                f"SELECT COUNT(*) FROM {table_name} WHERE code = %s",
                (df.iloc[0]["code"],),
            )
            total_count = cursor.fetchone()[0]

            logger.info(
                "数据保存成功到 %s，共 %d 条，表中该股票共 %d 条",
                table_name,
                len(records),
                total_count,
            )
            return True

        except Exception as e:
            conn.rollback()
            logger.error("保存数据到 %s 失败: %s", table_name, e)
            return False

    def import_stock_data(self, code, start_date, end_date):
        """
        导入指定股票的日K、周K、月K数据

        Args:
            code: 股票代码，如 sh.600519
            start_date: 开始日期，格式 YYYY-MM-DD
            end_date: 结束日期，格式 YYYY-MM-DD

        Returns:
            dict: 导入结果统计
        """
        logger.info(
            "\n%s",
            "=" * 60,
        )
        logger.info("开始导入股票数据: %s", code)
        logger.info("时间范围: %s 至 %s", start_date, end_date)
        logger.info("%s", "=" * 60)

        # 登录 baostock
        if not self.login_baostock():
            return {"success": False, "error": "baostock 登录失败"}

        # 连接数据库
        with DatabaseConnection() as db:
            if not db.conn:
                self.logout_baostock()
                return {"success": False, "error": "数据库连接失败"}

            results = {
                "success": True,
                "code": code,
                "daily": {"success": False, "count": 0},
                "weekly": {"success": False, "count": 0},
                "monthly": {"success": False, "count": 0},
            }

            # 导入日K线数据
            logger.info("\n--- 导入日K线数据 ---")
            df_daily = self.fetch_kline_data(code, start_date, end_date, "d")
            if df_daily is not None:
                results["daily"]["success"] = self.save_to_database(
                    df_daily, "stock_kline_daily", db.conn, db.cursor, "d"
                )
                results["daily"]["count"] = len(df_daily)

            # 导入周K线数据
            logger.info("\n--- 导入周K线数据 ---")
            df_weekly = self.fetch_kline_data(code, start_date, end_date, "w")
            if df_weekly is not None:
                results["weekly"]["success"] = self.save_to_database(
                    df_weekly, "stock_kline_weekly", db.conn, db.cursor, "w"
                )
                results["weekly"]["count"] = len(df_weekly)

            # 导入月K线数据
            logger.info("\n--- 导入月K线数据 ---")
            df_monthly = self.fetch_kline_data(code, start_date, end_date, "m")
            if df_monthly is not None:
                results["monthly"]["success"] = self.save_to_database(
                    df_monthly, "stock_kline_monthly", db.conn, db.cursor, "m"
                )
                results["monthly"]["count"] = len(df_monthly)

        # 退出 baostock
        self.logout_baostock()

        # 汇总结果
        logger.info("\n%s", "=" * 60)
        logger.info("导入完成 - %s", code)
        logger.info(
            "日K线: %s - %d 条",
            "成功" if results["daily"]["success"] else "失败",
            results["daily"]["count"],
        )
        logger.info(
            "周K线: %s - %d 条",
            "成功" if results["weekly"]["success"] else "失败",
            results["weekly"]["count"],
        )
        logger.info(
            "月K线: %s - %d 条",
            "成功" if results["monthly"]["success"] else "失败",
            results["monthly"]["count"],
        )
        logger.info("%s", "=" * 60)

        return results


def save_stock_data(code, start_date, end_date):
    """
    保存股票数据的主函数

    Args:
        code: 股票代码，如 sh.600519 或 sz.000001
        start_date: 开始日期，格式 YYYY-MM-DD
        end_date: 结束日期，格式 YYYY-MM-DD

    Returns:
        dict: 导入结果

    Example:
        >>> save_stock_data("sh.600519", "2024-01-01", "2024-12-10")
    """
    importer = StockDataImporter()
    return importer.import_stock_data(code, start_date, end_date)


if __name__ == "__main__":
    # 示例：导入贵州茅台 2024 年的数据
    result = save_stock_data("sh.600519", "2000-01-01", "2025-12-15")

    if result["success"]:
        print("\n导入成功！")
    else:
        print(f"\n导入失败: {result.get('error', '未知错误')}")
