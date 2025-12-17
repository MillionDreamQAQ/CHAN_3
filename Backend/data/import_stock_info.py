"""
使用 akshare 获取股票基本信息并存储到 TimescaleDB
通过上交所、深交所、北交所接口获取完整的股票列表和上市日期
"""

import sys
from pathlib import Path

# 将项目根目录添加到 Python 路径
root_dir = Path(__file__).parent.parent
sys.path.insert(0, str(root_dir))

import logging
import akshare as ak
import pandas as pd
from utils.database import DatabaseConnection

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


class StockInfoImporter:
    """股票基本信息导入器"""

    def fetch_and_transform_stock_info(self):
        """
        获取并转换所有A股股票基本信息
        在合并前就处理好各个市场的数据

        Returns:
            DataFrame: 统一格式的股票基本信息（code, name, list_date）
        """
        logger.info("开始获取股票基本信息...")

        all_stocks = []

        try:
            # 1. 获取并处理上交所主板A股
            logger.info("获取上交所主板A股...")
            df_sh_main = ak.stock_info_sh_name_code(symbol="主板A股")
            df_sh_main_clean = pd.DataFrame(
                {
                    "code": df_sh_main["证券代码"].apply(lambda x: f"sh.{x}"),
                    "name": df_sh_main["证券简称"],
                    "list_date": pd.to_datetime(
                        df_sh_main["上市日期"], errors="coerce"
                    ),
                }
            )
            all_stocks.append(df_sh_main_clean)
            logger.info("  上交所主板: %d 只", len(df_sh_main_clean))

        except Exception as e:
            logger.error("获取上交所主板失败: %s", e)

        try:
            # 2. 获取并处理上交所科创板
            logger.info("获取上交所科创板...")
            df_sh_sci = ak.stock_info_sh_name_code(symbol="科创板")
            df_sh_sci_clean = pd.DataFrame(
                {
                    "code": df_sh_sci["证券代码"].apply(lambda x: f"sh.{x}"),
                    "name": df_sh_sci["证券简称"],
                    "list_date": pd.to_datetime(df_sh_sci["上市日期"], errors="coerce"),
                }
            )
            all_stocks.append(df_sh_sci_clean)
            logger.info("  上交所科创板: %d 只", len(df_sh_sci_clean))

        except Exception as e:
            logger.error("获取上交所科创板失败: %s", e)

        try:
            # 3. 获取并处理深交所A股列表
            logger.info("获取深交所A股...")
            df_sz = ak.stock_info_sz_name_code(symbol="A股列表")
            df_sz_clean = pd.DataFrame(
                {
                    "code": df_sz["A股代码"].apply(lambda x: f"sz.{x}"),
                    "name": df_sz["A股简称"],
                    "list_date": pd.to_datetime(df_sz["A股上市日期"], errors="coerce"),
                }
            )
            all_stocks.append(df_sz_clean)
            logger.info("  深交所A股: %d 只", len(df_sz_clean))

        except Exception as e:
            logger.error("获取深交所A股失败: %s", e)

        try:
            # 4. 获取并处理北交所
            logger.info("获取北交所股票...")
            df_bj = ak.stock_info_bj_name_code()
            df_bj_clean = pd.DataFrame(
                {
                    "code": df_bj["证券代码"].apply(lambda x: f"bj.{x}"),
                    "name": df_bj["证券简称"],
                    "list_date": pd.to_datetime(df_bj["上市日期"], errors="coerce"),
                }
            )
            all_stocks.append(df_bj_clean)
            logger.info("  北交所: %d 只", len(df_bj_clean))

        except Exception as e:
            logger.error("获取北交所股票失败: %s", e)

        if not all_stocks:
            logger.error("未能获取任何股票信息")
            return None

        # 合并所有已经处理好的数据
        df_all = pd.concat(all_stocks, ignore_index=True)

        # 过滤掉代码或名称为空的数据
        df_all = df_all.dropna(subset=["code", "name"])

        logger.info("总计获取 %d 只股票信息", len(df_all))

        return df_all

    def save_to_database(self, df, conn, cursor):
        """
        保存股票信息到数据库

        Args:
            df: 股票信息DataFrame
            conn: 数据库连接
            cursor: 数据库游标

        Returns:
            tuple: (成功数量, 更新数量)
        """
        if df is None or df.empty:
            logger.warning("没有数据需要保存")
            return 0, 0

        try:
            # 使用 ON CONFLICT 处理重复数据（更新已有记录）
            insert_sql = """
                INSERT INTO stocks (code, name, list_date, created_at)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT (code) DO UPDATE SET
                    name = EXCLUDED.name,
                    list_date = EXCLUDED.list_date
            """

            # 准备数据
            records = []
            for _, row in df.iterrows():
                records.append(
                    (
                        row["code"],
                        row["name"],
                        row["list_date"] if pd.notna(row["list_date"]) else None,
                    )
                )

            # 获取插入前的总数
            cursor.execute("SELECT COUNT(*) FROM stocks")
            count_before = cursor.fetchone()[0]

            # 批量插入
            cursor.executemany(insert_sql, records)
            conn.commit()

            # 获取插入后的总数
            cursor.execute("SELECT COUNT(*) FROM stocks")
            count_after = cursor.fetchone()[0]

            new_count = count_after - count_before
            update_count = len(records) - new_count

            logger.info(
                "数据保存成功：新增 %d 条，更新 %d 条，总计 %d 条",
                new_count,
                update_count,
                count_after,
            )
            return new_count, update_count

        except Exception as e:
            conn.rollback()
            logger.error("保存数据失败: %s", e)
            return 0, 0

    def import_stock_info(self):
        """
        导入股票基本信息的主流程

        Returns:
            dict: 导入结果
        """
        logger.info("\n%s", "=" * 60)
        logger.info("开始导入股票基本信息")
        logger.info("%s\n", "=" * 60)

        # 获取并转换股票信息（新方法，已经处理好格式）
        stocks_df = self.fetch_and_transform_stock_info()
        if stocks_df is None:
            return {"success": False, "error": "获取股票信息失败"}

        # 连接数据库
        with DatabaseConnection() as db:
            if not db.conn:
                return {"success": False, "error": "数据库连接失败"}

            # 保存到数据库
            new_count, update_count = self.save_to_database(
                stocks_df, db.conn, db.cursor
            )

            result = {
                "success": True,
                "total": len(stocks_df),
                "new": new_count,
                "updated": update_count,
            }

        logger.info("\n%s", "=" * 60)
        logger.info("导入完成")
        logger.info("总计: %d 条", result["total"])
        logger.info("新增: %d 条", result["new"])
        logger.info("更新: %d 条", result["updated"])
        logger.info("%s\n", "=" * 60)

        return result


def import_all_stocks():
    """
    导入所有A股股票基本信息

    Returns:
        dict: 导入结果

    Example:
        >>> result = import_all_stocks()
        >>> print(f"新增 {result['new']} 只股票")
    """
    importer = StockInfoImporter()
    return importer.import_stock_info()


if __name__ == "__main__":
    # 导入股票基本信息
    stocks_result = import_all_stocks()

    if stocks_result["success"]:
        logger.info("\n导入成功！")
        logger.info("新增: %d 只股票", stocks_result["new"])
        logger.info("更新: %d 只股票", stocks_result["updated"])
    else:
        logger.error("\n导入失败: %s", stocks_result.get("error", "未知错误"))
