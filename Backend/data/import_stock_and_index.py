"""
使用 akshare 获取股票和指数基本信息并存储到 TimescaleDB
自动生成拼音字段以支持搜索功能
"""

import sys
from pathlib import Path

# 将项目根目录添加到 Python 路径
root_dir = Path(__file__).parent.parent
sys.path.insert(0, str(root_dir))

import logging
import akshare as ak
import pandas as pd
from pypinyin import lazy_pinyin, Style
from utils.database import DatabaseConnection

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


class StockIndexImporter:
    """股票和指数基本信息导入器"""

    def __init__(self):
        self.db_conn = None
        self.db_cursor = None

    def add_required_columns(self):
        """添加必要的数据库字段（type、pinyin、pinyin_short）"""
        with DatabaseConnection() as db:
            if not db.conn:
                logger.error("数据库连接失败")
                return False

            try:
                # 检查字段是否已存在
                db.cursor.execute(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name = 'stocks'
                    AND column_name IN ('type', 'pinyin', 'pinyin_short')
                """
                )
                existing_columns = [row[0] for row in db.cursor.fetchall()]

                # 添加 type 字段
                if "type" not in existing_columns:
                    logger.info("添加 type 字段...")
                    db.cursor.execute(
                        """
                        ALTER TABLE stocks
                        ADD COLUMN type VARCHAR(20) DEFAULT 'stock'
                    """
                    )

                # 添加 pinyin 字段
                if "pinyin" not in existing_columns:
                    logger.info("添加 pinyin 字段...")
                    db.cursor.execute(
                        """
                        ALTER TABLE stocks
                        ADD COLUMN pinyin VARCHAR(200)
                    """
                    )

                # 添加 pinyin_short 字段
                if "pinyin_short" not in existing_columns:
                    logger.info("添加 pinyin_short 字段...")
                    db.cursor.execute(
                        """
                        ALTER TABLE stocks
                        ADD COLUMN pinyin_short VARCHAR(50)
                    """
                    )

                db.conn.commit()
                logger.info("数据库字段准备完成")
                return True

            except Exception as e:
                db.conn.rollback()
                logger.error(f"添加数据库字段失败: {e}")
                return False

    def fetch_stock_info(self):
        """
        获取并转换所有A股股票基本信息

        Returns:
            DataFrame: 统一格式的股票基本信息（code, name, list_date, type）
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
                    "type": "stock",
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
                    "type": "stock",
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
                    "type": "stock",
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
                    "type": "stock",
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

    def fetch_index_info(self):
        """
        获取所有指数信息（从 akshare 接口获取）

        Returns:
            DataFrame: 统一格式的指数基本信息（code, name, list_date, type）
        """
        logger.info("开始获取指数基本信息...")

        try:
            # 使用 index_stock_info 获取所有指数的基本信息
            df_index = ak.index_stock_info()

            logger.info(f"从 akshare 获取到 {len(df_index)} 个指数")

            # 处理代码格式（添加市场前缀）
            def format_index_code(code):
                """为指数代码添加市场前缀"""
                code_str = str(code)
                # 去除可能存在的前缀
                code_str = code_str.replace("sh.", "").replace("sz.", "")

                # 上证指数以 0、1 开头
                if code_str.startswith(("0", "1")):
                    return f"sh.{code_str}"
                # 深证指数以 3、8、9 开头
                elif code_str.startswith(("3", "8", "9")):
                    return f"sz.{code_str}"
                else:
                    # 默认添加 sh 前缀
                    return f"sh.{code_str}"

            # 转换为统一格式
            df_clean = pd.DataFrame(
                {
                    "code": df_index["index_code"].apply(format_index_code),
                    "name": df_index["display_name"],
                    "list_date": pd.to_datetime(
                        df_index["publish_date"], errors="coerce"
                    ),
                    "type": "index",
                }
            )

            # 过滤掉代码或名称为空的数据
            df_clean = df_clean.dropna(subset=["code", "name"])

            logger.info("总计获取 %d 个有效指数信息", len(df_clean))

            return df_clean

        except Exception as e:
            logger.error(f"获取指数信息失败: {e}")
            return None

    def generate_pinyin(self, name):
        """
        为给定名称生成拼音

        Args:
            name: 股票或指数名称

        Returns:
            tuple: (拼音全拼, 拼音首字母)
        """
        if not name:
            return None, None

        try:
            # 生成拼音全拼（去除音调）
            pinyin = "".join(lazy_pinyin(name))
            # 生成拼音首字母
            pinyin_short = "".join(lazy_pinyin(name, style=Style.FIRST_LETTER))
            return pinyin, pinyin_short
        except Exception as e:
            logger.warning(f"生成拼音失败 {name}: {e}")
            return None, None

    def save_to_database(self, df, conn, cursor):
        """
        保存股票/指数信息到数据库，并自动生成拼音

        Args:
            df: 股票/指数信息DataFrame
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
                INSERT INTO stocks (code, name, list_date, type, pinyin, pinyin_short, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (code) DO UPDATE SET
                    name = EXCLUDED.name,
                    list_date = EXCLUDED.list_date,
                    type = EXCLUDED.type,
                    pinyin = EXCLUDED.pinyin,
                    pinyin_short = EXCLUDED.pinyin_short
            """

            # 准备数据
            records = []
            for _, row in df.iterrows():
                # 生成拼音
                pinyin, pinyin_short = self.generate_pinyin(row["name"])

                records.append(
                    (
                        row["code"],
                        row["name"],
                        row["list_date"] if pd.notna(row["list_date"]) else None,
                        row.get("type", "stock"),
                        pinyin,
                        pinyin_short,
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

    def create_indexes(self, conn, cursor):
        """创建搜索索引"""
        logger.info("创建搜索索引...")
        try:
            # 创建拼音索引
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_stocks_pinyin
                ON stocks(pinyin)
            """
            )
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_stocks_pinyin_short
                ON stocks(pinyin_short)
            """
            )
            # 创建名称索引
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_stocks_name
                ON stocks(name)
            """
            )
            # 创建类型索引
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_stocks_type
                ON stocks(type)
            """
            )
            conn.commit()
            logger.info("索引创建成功")
        except Exception as e:
            logger.warning(f"创建索引失败（可能已存在）: {e}")

    def import_all(self):
        """
        导入股票和指数信息的主流程

        Returns:
            dict: 导入结果
        """
        logger.info("\n%s", "=" * 60)
        logger.info("开始导入股票和指数基本信息")
        logger.info("%s\n", "=" * 60)

        # 添加必要的数据库字段
        if not self.add_required_columns():
            return {"success": False, "error": "添加数据库字段失败"}

        # 获取股票信息
        stocks_df = self.fetch_stock_info()

        # 获取指数信息
        indices_df = self.fetch_index_info()

        # 合并股票和指数信息
        if stocks_df is not None and indices_df is not None:
            all_data_df = pd.concat([stocks_df, indices_df], ignore_index=True)
        elif stocks_df is not None:
            all_data_df = stocks_df
        elif indices_df is not None:
            all_data_df = indices_df
        else:
            return {"success": False, "error": "获取股票和指数信息失败"}

        # 连接数据库
        with DatabaseConnection() as db:
            if not db.conn:
                return {"success": False, "error": "数据库连接失败"}

            # 保存到数据库（包含拼音生成）
            new_count, update_count = self.save_to_database(
                all_data_df, db.conn, db.cursor
            )

            # 创建索引
            self.create_indexes(db.conn, db.cursor)

            # 统计各类型数量
            db.cursor.execute("SELECT type, COUNT(*) FROM stocks GROUP BY type")
            type_counts = dict(db.cursor.fetchall())

            result = {
                "success": True,
                "total": len(all_data_df),
                "new": new_count,
                "updated": update_count,
                "stocks": type_counts.get("stock", 0),
                "indices": type_counts.get("index", 0),
            }

        logger.info("\n%s", "=" * 60)
        logger.info("导入完成")
        logger.info("总计: %d 条", result["total"])
        logger.info("新增: %d 条", result["new"])
        logger.info("更新: %d 条", result["updated"])
        logger.info("股票: %d 只", result["stocks"])
        logger.info("指数: %d 个", result["indices"])
        logger.info("%s\n", "=" * 60)

        return result

    def show_sample_data(self):
        """显示示例数据"""
        with DatabaseConnection() as db:
            if not db.conn:
                return

            # 显示股票示例
            db.cursor.execute(
                """
                SELECT code, name, type, pinyin, pinyin_short
                FROM stocks
                WHERE type = 'stock'
                LIMIT 5
            """
            )

            logger.info("\n股票示例数据:")
            logger.info(
                "%-15s %-20s %-10s %-30s %-15s",
                "代码",
                "名称",
                "类型",
                "拼音",
                "首字母",
            )
            logger.info("-" * 90)

            for code, name, typ, pinyin, pinyin_short in db.cursor.fetchall():
                logger.info(
                    "%-15s %-20s %-10s %-30s %-15s",
                    code,
                    name,
                    typ,
                    pinyin or "",
                    pinyin_short or "",
                )

            # 显示指数示例
            db.cursor.execute(
                """
                SELECT code, name, type, pinyin, pinyin_short
                FROM stocks
                WHERE type = 'index'
                LIMIT 5
            """
            )

            logger.info("\n指数示例数据:")
            logger.info(
                "%-15s %-20s %-10s %-30s %-15s",
                "代码",
                "名称",
                "类型",
                "拼音",
                "首字母",
            )
            logger.info("-" * 90)

            for code, name, typ, pinyin, pinyin_short in db.cursor.fetchall():
                logger.info(
                    "%-15s %-20s %-10s %-30s %-15s",
                    code,
                    name,
                    typ,
                    pinyin or "",
                    pinyin_short or "",
                )


def import_all_stocks_and_indices():
    """
    导入所有股票和指数基本信息

    Returns:
        dict: 导入结果

    Example:
        >>> result = import_all_stocks_and_indices()
        >>> print(f"新增 {result['new']} 条记录")
        >>> print(f"股票: {result['stocks']} 只")
        >>> print(f"指数: {result['indices']} 个")
    """
    importer = StockIndexImporter()
    return importer.import_all()


if __name__ == "__main__":
    # 导入股票和指数基本信息
    result = import_all_stocks_and_indices()

    if result["success"]:
        logger.info("\n导入成功！")
        logger.info("新增: %d 条记录", result["new"])
        logger.info("更新: %d 条记录", result["updated"])
        logger.info("股票: %d 只", result["stocks"])
        logger.info("指数: %d 个", result["indices"])

        # 显示示例数据
        importer = StockIndexImporter()
        importer.show_sample_data()
    else:
        logger.error("\n导入失败: %s", result.get("error", "未知错误"))
