"""
为stocks表生成拼音字段
需要先安装: pip install pypinyin
"""

import sys
from pathlib import Path

# 将项目根目录添加到 Python 路径
root_dir = Path(__file__).parent.parent
sys.path.insert(0, str(root_dir))

import logging
from pypinyin import lazy_pinyin, Style
from utils.database import DatabaseConnection

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def add_pinyin_columns():
    """添加拼音字段到stocks表"""
    with DatabaseConnection() as db:
        if not db.conn:
            logger.error("数据库连接失败")
            return False

        try:
            # 检查字段是否已存在
            db.cursor.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'stocks'
                AND column_name IN ('pinyin', 'pinyin_short')
            """)
            existing_columns = [row[0] for row in db.cursor.fetchall()]

            if 'pinyin' not in existing_columns:
                logger.info("添加 pinyin 字段...")
                db.cursor.execute("ALTER TABLE stocks ADD COLUMN pinyin VARCHAR(200)")

            if 'pinyin_short' not in existing_columns:
                logger.info("添加 pinyin_short 字段...")
                db.cursor.execute("ALTER TABLE stocks ADD COLUMN pinyin_short VARCHAR(50)")

            db.conn.commit()
            logger.info("拼音字段添加成功")
            return True

        except Exception as e:
            db.conn.rollback()
            logger.error(f"添加拼音字段失败: {e}")
            return False


def generate_pinyin_for_stocks():
    """为所有股票生成拼音"""
    logger.info("\n%s", "=" * 60)
    logger.info("开始生成股票拼音数据")
    logger.info("%s\n", "=" * 60)

    # 添加拼音字段
    if not add_pinyin_columns():
        return

    with DatabaseConnection() as db:
        if not db.conn:
            logger.error("数据库连接失败")
            return

        try:
            # 查询所有股票
            db.cursor.execute("SELECT code, name FROM stocks WHERE name IS NOT NULL")
            stocks = db.cursor.fetchall()

            logger.info(f"找到 {len(stocks)} 只股票，开始生成拼音...")

            success_count = 0
            for i, (code, name) in enumerate(stocks, 1):
                try:
                    # 生成拼音全拼（去除音调）
                    pinyin = ''.join(lazy_pinyin(name))

                    # 生成拼音首字母
                    pinyin_short = ''.join(lazy_pinyin(name, style=Style.FIRST_LETTER))

                    # 更新数据库
                    db.cursor.execute(
                        """
                        UPDATE stocks
                        SET pinyin = %s, pinyin_short = %s
                        WHERE code = %s
                        """,
                        (pinyin, pinyin_short, code)
                    )

                    success_count += 1

                    # 每100条提交一次
                    if i % 100 == 0:
                        db.conn.commit()
                        logger.info(f"已处理 {i}/{len(stocks)} 只股票...")

                except Exception as e:
                    logger.warning(f"处理 {code}-{name} 失败: {e}")

            # 最后提交
            db.conn.commit()

            # 创建索引加速搜索
            logger.info("创建索引...")
            try:
                db.cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_stocks_pinyin
                    ON stocks(pinyin)
                """)
                db.cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_stocks_pinyin_short
                    ON stocks(pinyin_short)
                """)
                db.cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_stocks_name
                    ON stocks(name)
                """)
                db.conn.commit()
                logger.info("索引创建成功")
            except Exception as e:
                logger.warning(f"创建索引失败（可能已存在）: {e}")

            logger.info("\n%s", "=" * 60)
            logger.info("拼音生成完成")
            logger.info("成功: %d 只", success_count)
            logger.info("失败: %d 只", len(stocks) - success_count)
            logger.info("%s\n", "=" * 60)

        except Exception as e:
            db.conn.rollback()
            logger.error(f"生成拼音失败: {e}")


def show_sample_data():
    """显示示例数据"""
    with DatabaseConnection() as db:
        if not db.conn:
            return

        db.cursor.execute("""
            SELECT code, name, pinyin, pinyin_short
            FROM stocks
            WHERE pinyin IS NOT NULL
            LIMIT 10
        """)

        logger.info("\n示例数据:")
        logger.info("%-15s %-20s %-30s %-15s", "代码", "名称", "拼音", "首字母")
        logger.info("-" * 80)

        for code, name, pinyin, pinyin_short in db.cursor.fetchall():
            logger.info("%-15s %-20s %-30s %-15s", code, name, pinyin, pinyin_short)


if __name__ == "__main__":
    generate_pinyin_for_stocks()
    show_sample_data()
