"""
股票信息API
提供股票列表、搜索等功能
"""
from fastapi import APIRouter, HTTPException
import psycopg
import os
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/api/stocks", tags=["stocks"])


@router.get("/list")
async def get_stock_list():
    """
    获取所有股票列表（含拼音）

    Returns:
        {
            "success": true,
            "data": [
                {
                    "code": "sh.000001",
                    "name": "上证指数",
                    "pinyin": "shangzhengzhishu",
                    "pinyin_short": "szzs"
                },
                ...
            ]
        }
    """
    try:
        conn = psycopg.connect(
            host=os.getenv("DB_HOST", "localhost"),
            port=os.getenv("DB_PORT", "5432"),
            user=os.getenv("DB_USER", "postgres"),
            password=os.getenv("DB_PASSWORD"),
            dbname=os.getenv("DB_NAME", "stock_db"),
        )
        cursor = conn.cursor()

        # 查询所有股票
        cursor.execute("""
            SELECT code, name, pinyin, pinyin_short
            FROM stocks
            ORDER BY code
        """)

        stocks = []
        for row in cursor.fetchall():
            stocks.append({
                "code": row[0],
                "name": row[1],
                "pinyin": row[2] or "",
                "pinyin_short": row[3] or "",
            })

        cursor.close()
        conn.close()

        return {"success": True, "data": stocks, "count": len(stocks)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取股票列表失败: {str(e)}")
