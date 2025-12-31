"""
数据库初始化脚本 - 项目初始化的唯一入口

运行此脚本完成：
1. 创建所有数据库表（stocks, fund_split, scan_tasks, scan_results）
2. 导入股票、指数和ETF基本信息
3. 导入基金拆分数据

使用方法：
    python Backend/data/init.py
"""

# ============================================================================
# 1. 导入和配置
# ============================================================================

import sys
from pathlib import Path
from datetime import datetime

# 将项目根目录添加到 Python 路径
root_dir = Path(__file__).parent.parent
sys.path.insert(0, str(root_dir))

import logging
import requests
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


# ============================================================================
# 2. 数据库表结构定义
# ============================================================================

# SQL常量定义

SQL_CREATE_STOCKS_TABLE = """
CREATE TABLE IF NOT EXISTS stocks (
    code VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) DEFAULT 'stock',
    pinyin VARCHAR(200),
    pinyin_short VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

SQL_CREATE_STOCKS_INDEXES = """
CREATE INDEX IF NOT EXISTS idx_stocks_pinyin ON stocks(pinyin);
CREATE INDEX IF NOT EXISTS idx_stocks_pinyin_short ON stocks(pinyin_short);
CREATE INDEX IF NOT EXISTS idx_stocks_name ON stocks(name);
CREATE INDEX IF NOT EXISTS idx_stocks_type ON stocks(type);
"""

SQL_CREATE_FUND_SPLIT_TABLE = """
CREATE TABLE IF NOT EXISTS fund_split (
    id SERIAL PRIMARY KEY,
    fund_code VARCHAR(20) NOT NULL,
    fund_name VARCHAR(100),
    split_date DATE NOT NULL,
    split_type VARCHAR(50),
    split_ratio FLOAT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(fund_code, split_date)
);

CREATE INDEX IF NOT EXISTS idx_fund_split_code ON fund_split(fund_code);
CREATE INDEX IF NOT EXISTS idx_fund_split_date ON fund_split(split_date);
"""

SQL_CREATE_SCAN_TABLES = """
-- 扫描任务表
CREATE TABLE IF NOT EXISTS scan_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- 扫描参数
    stock_pool VARCHAR(20) NOT NULL,
    boards TEXT [],
    stock_codes TEXT [],
    kline_type VARCHAR(10) NOT NULL,
    bsp_types TEXT [] NOT NULL,
    time_window_days INTEGER NOT NULL DEFAULT 3,
    kline_limit INTEGER NOT NULL DEFAULT 500,
    -- 进度
    total_count INTEGER DEFAULT 0,
    processed_count INTEGER DEFAULT 0,
    found_count INTEGER DEFAULT 0,
    current_stock VARCHAR(50),
    error_message TEXT,
    -- 时间
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    elapsed_time FLOAT DEFAULT 0
);

-- 扫描结果表
CREATE TABLE IF NOT EXISTS scan_results (
    id SERIAL PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES scan_tasks (id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(50),
    bsp_type VARCHAR(10) NOT NULL,
    bsp_time VARCHAR(30) NOT NULL,
    bsp_value FLOAT NOT NULL,
    is_buy BOOLEAN NOT NULL DEFAULT TRUE,
    kline_type VARCHAR(10) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_scan_tasks_created_at ON scan_tasks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_results_task_id ON scan_results (task_id);
"""


# 表创建函数

def create_stocks_table():
    """创建stocks表及索引"""
    try:
        with DatabaseConnection() as db:
            if not db.conn:
                logger.error("数据库连接失败")
                return False

            logger.info("创建 stocks 表...")
            db.cursor.execute(SQL_CREATE_STOCKS_TABLE)
            db.cursor.execute(SQL_CREATE_STOCKS_INDEXES)
            db.conn.commit()
            logger.info("stocks 表创建成功")
            return True

    except Exception as e:
        logger.error(f"创建 stocks 表失败: {e}")
        return False


def create_fund_split_table():
    """创建fund_split表及索引"""
    try:
        with DatabaseConnection() as db:
            if not db.conn:
                logger.error("数据库连接失败")
                return False

            logger.info("创建 fund_split 表...")
            db.cursor.execute(SQL_CREATE_FUND_SPLIT_TABLE)
            db.conn.commit()
            logger.info("fund_split 表创建成功")
            return True

    except Exception as e:
        logger.error(f"创建 fund_split 表失败: {e}")
        return False


def create_scan_tables():
    """创建scan_tasks和scan_results表及索引"""
    try:
        with DatabaseConnection() as db:
            if not db.conn:
                logger.error("数据库连接失败")
                return False

            logger.info("创建 scan_tasks 和 scan_results 表...")
            db.cursor.execute(SQL_CREATE_SCAN_TABLES)
            db.conn.commit()
            logger.info("scan_tasks 和 scan_results 表创建成功")
            return True

    except Exception as e:
        logger.error(f"创建 scan 表失败: {e}")
        return False


def create_all_tables():
    """统一创建所有表"""
    logger.info("\n" + "=" * 60)
    logger.info("开始创建数据库表")
    logger.info("=" * 60 + "\n")

    results = {
        "stocks": create_stocks_table(),
        "fund_split": create_fund_split_table(),
        "scan_tables": create_scan_tables(),
    }

    success_count = sum(1 for v in results.values() if v)
    logger.info(f"\n表创建完成: {success_count}/{len(results)} 成功\n")

    return results


# ============================================================================
# 3. 基金拆分数据导入
# ============================================================================

class FundSplitImporter:
    """基金拆分数据导入器"""

    def __init__(self):
        pass

    def fetch_split_data(self, year: str) -> pd.DataFrame:
        """
        获取指定年份的基金拆分数据

        Args:
            year: 年份字符串，如 "2025"

        Returns:
            DataFrame: 拆分数据，如果获取失败返回 None
        """
        try:
            logger.info(f"获取 {year} 年基金拆分数据...")
            df = ak.fund_cf_em(year=year)

            if df is None or df.empty:
                logger.info(f"  {year} 年无拆分数据")
                return None

            logger.info(f"  获取到 {len(df)} 条记录")
            return df

        except Exception as e:
            logger.warning(f"获取 {year} 年数据失败: {e}")
            return None

    def convert_fund_code(self, code: str) -> str:
        """
        将纯数字代码转换为带市场前缀的格式

        Args:
            code: 纯数字基金代码，如 "159220"

        Returns:
            带市场前缀的代码，如 "sz.159220"
        """
        code = str(code).zfill(6)  # 补齐6位
        prefix = code[:2]

        # 深市ETF前缀: 15, 16, 18
        if prefix in ["15", "16", "18"]:
            return f"sz.{code}"
        # 沪市ETF前缀: 51, 52, 56, 58
        elif prefix in ["51", "52", "56", "58"]:
            return f"sh.{code}"
        else:
            # 非ETF代码（如普通基金），也保存但添加默认前缀
            if code.startswith("0") or code.startswith("1") or code.startswith("2"):
                return f"sz.{code}"
            else:
                return f"sh.{code}"

    def save_to_database(self, df: pd.DataFrame) -> tuple:
        """
        保存拆分数据到数据库

        Args:
            df: 拆分数据 DataFrame

        Returns:
            tuple: (新增数量, 更新数量)
        """
        if df is None or df.empty:
            return 0, 0

        with DatabaseConnection() as db:
            if not db.conn:
                logger.error("数据库连接失败")
                return 0, 0

            try:
                insert_sql = """
                    INSERT INTO fund_split (fund_code, fund_name, split_date, split_type, split_ratio, created_at)
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (fund_code, split_date) DO UPDATE SET
                        fund_name = EXCLUDED.fund_name,
                        split_type = EXCLUDED.split_type,
                        split_ratio = EXCLUDED.split_ratio
                """

                # 获取插入前的总数
                db.cursor.execute("SELECT COUNT(*) FROM fund_split")
                count_before = db.cursor.fetchone()[0]

                # 准备数据
                records = []
                for _, row in df.iterrows():
                    fund_code = self.convert_fund_code(row["基金代码"])
                    fund_name = row.get("基金简称", "")
                    split_date = row.get("拆分折算日", "")
                    split_type = row.get("拆分类型", "")
                    split_ratio = float(row.get("拆分折算", 1))

                    # 解析日期
                    if isinstance(split_date, str):
                        try:
                            split_date = datetime.strptime(split_date, "%Y-%m-%d").date()
                        except ValueError:
                            try:
                                split_date = datetime.strptime(split_date, "%Y/%m/%d").date()
                            except ValueError:
                                logger.warning(f"无法解析日期: {split_date}")
                                continue

                    records.append((fund_code, fund_name, split_date, split_type, split_ratio))

                # 批量插入
                db.cursor.executemany(insert_sql, records)
                db.conn.commit()

                # 获取插入后的总数
                db.cursor.execute("SELECT COUNT(*) FROM fund_split")
                count_after = db.cursor.fetchone()[0]

                new_count = count_after - count_before
                update_count = len(records) - new_count

                return new_count, update_count

            except Exception as e:
                db.conn.rollback()
                logger.error(f"保存数据失败: {e}")
                return 0, 0

    def import_all(self, start_year: int = 2005):
        """
        导入所有年份的拆分数据

        Args:
            start_year: 起始年份，默认2005年

        Returns:
            dict: 导入结果
        """
        logger.info("\n" + "=" * 60)
        logger.info("开始导入基金拆分数据")
        logger.info("=" * 60 + "\n")

        current_year = datetime.now().year
        total_new = 0
        total_update = 0
        years_with_data = 0

        # 遍历所有年份
        for year in range(start_year, current_year + 1):
            df = self.fetch_split_data(str(year))

            if df is not None and not df.empty:
                new_count, update_count = self.save_to_database(df)
                total_new += new_count
                total_update += update_count
                years_with_data += 1
                logger.info(f"  {year} 年: 新增 {new_count} 条, 更新 {update_count} 条")

        # 统计结果
        with DatabaseConnection() as db:
            if db.conn:
                db.cursor.execute("SELECT COUNT(*) FROM fund_split")
                total_records = db.cursor.fetchone()[0]

                db.cursor.execute("SELECT COUNT(DISTINCT fund_code) FROM fund_split")
                unique_funds = db.cursor.fetchone()[0]
            else:
                total_records = 0
                unique_funds = 0

        result = {
            "success": True,
            "new": total_new,
            "updated": total_update,
            "total_records": total_records,
            "unique_funds": unique_funds,
            "years_processed": current_year - start_year + 1,
            "years_with_data": years_with_data,
        }

        logger.info("\n" + "=" * 60)
        logger.info("导入完成")
        logger.info(f"新增: {total_new} 条")
        logger.info(f"更新: {total_update} 条")
        logger.info(f"总记录数: {total_records} 条")
        logger.info(f"涉及基金: {unique_funds} 只")
        logger.info(f"处理年份: {start_year} - {current_year}")
        logger.info("=" * 60 + "\n")

        return result

    def show_sample_data(self, limit: int = 10):
        """显示示例数据"""
        with DatabaseConnection() as db:
            if not db.conn:
                return

            db.cursor.execute(
                """
                SELECT fund_code, fund_name, split_date, split_type, split_ratio
                FROM fund_split
                ORDER BY split_date DESC
                LIMIT %s
            """,
                (limit,),
            )

            logger.info("\n最近的拆分记录:")
            logger.info(
                "%-15s %-30s %-15s %-20s %-10s",
                "代码",
                "名称",
                "拆分日期",
                "拆分类型",
                "比例",
            )
            logger.info("-" * 90)

            for fund_code, fund_name, split_date, split_type, split_ratio in db.cursor.fetchall():
                logger.info(
                    "%-15s %-30s %-15s %-20s %-10.4f",
                    fund_code,
                    fund_name or "",
                    str(split_date),
                    split_type or "",
                    split_ratio,
                )

    def get_split_data_for_fund(self, fund_code: str) -> list:
        """
        获取指定基金的拆分数据

        Args:
            fund_code: 基金代码（如 sz.159567）

        Returns:
            list: [(split_date, split_ratio), ...] 按日期升序排列
        """
        with DatabaseConnection() as db:
            if not db.conn:
                return []

            try:
                db.cursor.execute(
                    """
                    SELECT split_date, split_ratio
                    FROM fund_split
                    WHERE fund_code = %s
                    ORDER BY split_date ASC
                """,
                    (fund_code,),
                )

                return [(row[0], row[1]) for row in db.cursor.fetchall()]

            except Exception as e:
                logger.error(f"查询拆分数据失败: {e}")
                return []


# ============================================================================
# 4. 股票/指数/ETF数据导入
# ============================================================================

class StockDataImporter:
    """股票、指数和 ETF 基本信息导入器"""

    def __init__(self, etf_api_url="http://localhost:8080/api/etf"):
        self.etf_api_url = etf_api_url

    def fetch_stock_info(self):
        """
        获取并转换所有A股股票基本信息

        Returns:
            DataFrame: 统一格式的股票基本信息（code, name, type）
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
            DataFrame: 统一格式的指数基本信息（code, name, type）
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

    def fetch_etf_info(self):
        """
        从 API 获取所有 ETF 基本信息

        Returns:
            DataFrame: 统一格式的 ETF 基本信息（code, name, type）
        """
        logger.info("开始从 API 获取 ETF 基本信息...")

        try:
            # 发送 GET 请求
            response = requests.get(self.etf_api_url, timeout=30)
            response.raise_for_status()

            # 解析 JSON 数据
            data = response.json()

            if data.get("code") != 0:
                logger.error(f"API 返回错误: {data.get('message')}")
                return None

            etf_list = data.get("data", {}).get("list", [])
            total = data.get("data", {}).get("total", 0)

            logger.info(f"从 API 获取到 {len(etf_list)} 个 ETF（总计 {total} 个）")

            if not etf_list:
                logger.warning("API 返回的 ETF 列表为空")
                return None

            # 转换为 DataFrame
            df = pd.DataFrame(etf_list)

            # 格式化代码（组合 exchange 和 code）
            df["code"] = df.apply(
                lambda row: f"{row['exchange']}.{row['code']}", axis=1
            )

            # 转换为统一格式
            df_clean = pd.DataFrame(
                {
                    "code": df["code"],
                    "name": df["name"],
                    "type": "etf",
                }
            )

            # 过滤掉代码或名称为空的数据
            df_clean = df_clean.dropna(subset=["code", "name"])

            logger.info("总计获取 %d 个有效 ETF 信息", len(df_clean))

            return df_clean

        except requests.exceptions.RequestException as e:
            logger.error(f"请求 API 失败: {e}")
            return None
        except Exception as e:
            logger.error(f"获取 ETF 信息失败: {e}")
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

    def save_to_database(self, df):
        """
        保存股票/指数信息到数据库，并自动生成拼音

        Args:
            df: 股票/指数信息DataFrame

        Returns:
            tuple: (成功数量, 更新数量)
        """
        if df is None or df.empty:
            logger.warning("没有数据需要保存")
            return 0, 0

        with DatabaseConnection() as db:
            if not db.conn:
                logger.error("数据库连接失败")
                return 0, 0

            try:
                # 使用 ON CONFLICT 处理重复数据（更新已有记录）
                insert_sql = """
                    INSERT INTO stocks (code, name, type, pinyin, pinyin_short, created_at)
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (code) DO UPDATE SET
                        name = EXCLUDED.name,
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
                            row.get("type", "stock"),
                            pinyin,
                            pinyin_short,
                        )
                    )

                # 获取插入前的总数
                db.cursor.execute("SELECT COUNT(*) FROM stocks")
                count_before = db.cursor.fetchone()[0]

                # 批量插入
                db.cursor.executemany(insert_sql, records)
                db.conn.commit()

                # 获取插入后的总数
                db.cursor.execute("SELECT COUNT(*) FROM stocks")
                count_after = db.cursor.fetchone()[0]

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
                db.conn.rollback()
                logger.error("保存数据失败: %s", e)
                return 0, 0

    def import_all(self):
        """
        导入股票、指数和 ETF 信息的主流程

        Returns:
            dict: 导入结果
        """
        logger.info("\n%s", "=" * 60)
        logger.info("开始导入股票、指数和 ETF 基本信息")
        logger.info("%s\n", "=" * 60)

        # 获取股票信息
        stocks_df = self.fetch_stock_info()

        # 获取指数信息
        indices_df = self.fetch_index_info()

        # 获取 ETF 信息
        etf_df = self.fetch_etf_info()

        # 合并所有信息
        all_dataframes = []
        if stocks_df is not None:
            all_dataframes.append(stocks_df)
        if indices_df is not None:
            all_dataframes.append(indices_df)
        if etf_df is not None:
            all_dataframes.append(etf_df)

        if not all_dataframes:
            return {"success": False, "error": "获取股票、指数和 ETF 信息失败"}

        all_data_df = pd.concat(all_dataframes, ignore_index=True)

        # 保存到数据库（包含拼音生成）
        new_count, update_count = self.save_to_database(all_data_df)

        # 统计各类型数量
        with DatabaseConnection() as db:
            if not db.conn:
                return {"success": False, "error": "数据库连接失败"}

            db.cursor.execute("SELECT type, COUNT(*) FROM stocks GROUP BY type")
            type_counts = dict(db.cursor.fetchall())

            result = {
                "success": True,
                "total": len(all_data_df),
                "new": new_count,
                "updated": update_count,
                "stocks": type_counts.get("stock", 0),
                "indices": type_counts.get("index", 0),
                "etf": type_counts.get("etf", 0),
            }

        logger.info("\n%s", "=" * 60)
        logger.info("导入完成")
        logger.info("总计: %d 条", result["total"])
        logger.info("新增: %d 条", result["new"])
        logger.info("更新: %d 条", result["updated"])
        logger.info("股票: %d 只", result["stocks"])
        logger.info("指数: %d 个", result["indices"])
        logger.info("ETF: %d 个", result["etf"])
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

            # 显示 ETF 示例
            db.cursor.execute(
                """
                SELECT code, name, type, pinyin, pinyin_short
                FROM stocks
                WHERE type = 'etf'
                LIMIT 5
            """
            )

            logger.info("\nETF 示例数据:")
            logger.info(
                "%-15s %-30s %-10s %-30s %-15s",
                "代码",
                "名称",
                "类型",
                "拼音",
                "首字母",
            )
            logger.info("-" * 100)

            for code, name, typ, pinyin, pinyin_short in db.cursor.fetchall():
                logger.info(
                    "%-15s %-30s %-10s %-30s %-15s",
                    code,
                    name,
                    typ,
                    pinyin or "",
                    pinyin_short or "",
                )


# ============================================================================
# 5. 主初始化流程
# ============================================================================

def initialize_database():
    """
    初始化数据库：创建所有表并导入数据

    Returns:
        dict: 初始化结果
    """
    logger.info("\n" + "=" * 70)
    logger.info(" " * 20 + "数据库初始化开始")
    logger.info("=" * 70 + "\n")

    results = {
        "tables": {},
        "stocks": {"success": False},
        "fund_splits": {"success": False},
    }

    # 1. 创建所有表
    logger.info("步骤 1/3: 创建数据库表...")
    results["tables"] = create_all_tables()

    # 2. 导入股票、指数和ETF数据
    logger.info("步骤 2/3: 导入股票、指数和ETF数据...")
    stock_importer = StockDataImporter()
    stock_result = stock_importer.import_all()
    results["stocks"] = stock_result

    if stock_result.get("success"):
        stock_importer.show_sample_data()

    # 3. 导入基金拆分数据
    logger.info("步骤 3/3: 导入基金拆分数据...")
    fund_importer = FundSplitImporter()
    fund_result = fund_importer.import_all()
    results["fund_splits"] = fund_result

    if fund_result.get("success"):
        fund_importer.show_sample_data()

    # 打印总结
    logger.info("\n" + "=" * 70)
    logger.info(" " * 20 + "数据库初始化完成")
    logger.info("=" * 70)

    logger.info("\n总结:")

    # 表创建结果
    table_success = sum(1 for v in results["tables"].values() if v)
    logger.info(f"  数据库表: {table_success}/{len(results['tables'])} 创建成功")

    # 股票数据结果
    logger.info(f"  股票数据: {'成功' if results['stocks'].get('success') else '失败'}")
    if results["stocks"].get("success"):
        logger.info(f"    - 股票: {results['stocks']['stocks']} 只")
        logger.info(f"    - 指数: {results['stocks']['indices']} 个")
        logger.info(f"    - ETF: {results['stocks']['etf']} 个")
        logger.info(f"    - 新增: {results['stocks']['new']} 条")
        logger.info(f"    - 更新: {results['stocks']['updated']} 条")

    # 基金拆分数据结果
    logger.info(f"  基金拆分数据: {'成功' if results['fund_splits'].get('success') else '失败'}")
    if results["fund_splits"].get("success"):
        logger.info(f"    - 总记录: {results['fund_splits']['total_records']} 条")
        logger.info(f"    - 涉及基金: {results['fund_splits']['unique_funds']} 只")
        logger.info(f"    - 新增: {results['fund_splits']['new']} 条")
        logger.info(f"    - 更新: {results['fund_splits']['updated']} 条")

    logger.info("=" * 70 + "\n")

    return results


# ============================================================================
# 6. 程序入口
# ============================================================================

if __name__ == "__main__":
    try:
        result = initialize_database()

        # 检查是否所有步骤都成功
        tables_ok = all(result["tables"].values())
        stocks_ok = result["stocks"].get("success", False)
        funds_ok = result["fund_splits"].get("success", False)

        all_success = tables_ok and stocks_ok and funds_ok

        if all_success:
            logger.info("所有初始化步骤均已成功完成！")
            sys.exit(0)
        else:
            logger.error("部分初始化步骤失败，请检查日志")
            sys.exit(1)

    except Exception as e:
        logger.error(f"初始化过程中发生错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
