"""
获取基金拆分数据并存储到数据库
- 使用 akshare 的 fund_cf_em 接口获取基金拆分折算信息
- 用于解决ETF K线数据因拆分导致的断崖问题
"""

import sys
from pathlib import Path
from datetime import datetime

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


class FundSplitImporter:
    """基金拆分数据导入器"""

    def __init__(self):
        pass

    def create_table_if_not_exists(self):
        """检查并创建 fund_split 表（如果不存在）"""
        with DatabaseConnection() as db:
            if not db.conn:
                logger.error("数据库连接失败")
                return False

            try:
                # 检查表是否存在
                db.cursor.execute(
                    """
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables
                        WHERE table_name = 'fund_split'
                    )
                """
                )
                table_exists = db.cursor.fetchone()[0]

                if not table_exists:
                    logger.info("fund_split 表不存在，正在创建...")
                    db.cursor.execute(
                        """
                        CREATE TABLE fund_split (
                            id SERIAL PRIMARY KEY,
                            fund_code VARCHAR(20) NOT NULL,
                            fund_name VARCHAR(100),
                            split_date DATE NOT NULL,
                            split_type VARCHAR(50),
                            split_ratio FLOAT NOT NULL,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            UNIQUE(fund_code, split_date)
                        )
                    """
                    )
                    # 创建索引
                    db.cursor.execute(
                        "CREATE INDEX IF NOT EXISTS idx_fund_split_code ON fund_split(fund_code)"
                    )
                    db.cursor.execute(
                        "CREATE INDEX IF NOT EXISTS idx_fund_split_date ON fund_split(split_date)"
                    )
                    db.conn.commit()
                    logger.info("fund_split 表创建成功")
                else:
                    logger.info("fund_split 表已存在")

                return True

            except Exception as e:
                db.conn.rollback()
                logger.error(f"创建 fund_split 表失败: {e}")
                return False

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
            带市场前缀的代码，如 "sz.159220"，非ETF代码返回 None
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
            # 根据代码规则判断市场
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

        # 检查并创建表
        if not self.create_table_if_not_exists():
            return {"success": False, "error": "创建 fund_split 表失败"}

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


def import_all_fund_splits():
    """
    导入所有基金拆分数据

    Returns:
        dict: 导入结果
    """
    importer = FundSplitImporter()
    return importer.import_all()


if __name__ == "__main__":
    # 导入基金拆分数据
    result = import_all_fund_splits()

    if result["success"]:
        logger.info("\n导入成功！")

        # 显示示例数据
        importer = FundSplitImporter()
        importer.show_sample_data()
    else:
        logger.error(f"\n导入失败: {result.get('error', '未知错误')}")
