"""
TDX Docker API 数据源
从本地部署的通达信Docker服务获取K线数据
API地址: http://localhost:8080
"""

import logging
import os
import requests
from datetime import datetime
from typing import Optional
from Common.CEnum import AUTYPE, DATA_FIELD, KL_TYPE
from Common.CTime import CTime
from KLine.KLine_Unit import CKLine_Unit
from .CommonStockAPI import CCommonStockApi

logger = logging.getLogger(__name__)


class CTdxStockAPI(CCommonStockApi):
    """
    基于TDX Docker API的股票数据接口
    支持股票、ETF和指数的K线数据获取
    """

    # API基础地址（从环境变量读取，默认为localhost:8080）
    API_BASE_URL = os.getenv("TDX_API_URL", "http://localhost:8080")

    # K线类型映射（TDX API格式）
    KLINE_TYPE_MAP = {
        KL_TYPE.K_1M: "minute1",
        KL_TYPE.K_5M: "minute5",
        KL_TYPE.K_15M: "minute15",
        KL_TYPE.K_30M: "minute30",
        KL_TYPE.K_60M: "hour",
        KL_TYPE.K_DAY: "day",
        KL_TYPE.K_WEEK: "week",
        KL_TYPE.K_MON: "month",
    }

    def __init__(
        self,
        code,
        k_type=KL_TYPE.K_DAY,
        begin_date=None,  # 保留兼容性，但不使用
        end_date=None,  # 保留兼容性，但不使用
        autype=AUTYPE.QFQ,  # TDX API自动前复权，此参数保留但不使用
        limit=2000,  # 新增：数据条数限制
    ):
        self.limit = limit

        # 调用父类初始化（begin_date/end_date 保留兼容性）
        super(CTdxStockAPI, self).__init__(code, k_type, begin_date, end_date, autype)

    def get_kl_data(self):
        """
        获取K线数据（主方法）
        从TDX Docker API获取数据并转换为标准格式
        """
        try:
            # 判断是 ETF、指数还是股票
            is_etf = self._is_etf_code(self.code)
            is_index = self._is_index_code(self.code)

            # 转换代码格式
            api_code = self._convert_code_format(self.code, is_index, is_etf)

            # 获取K线类型
            kline_type = self.KLINE_TYPE_MAP.get(self.k_type)
            if not kline_type:
                raise Exception(f"不支持的K线类型: {self.k_type}")

            # 选择API端点
            # ETF 和股票使用 /api/kline-all，指数使用 /api/index/all
            endpoint = "/api/index/all" if is_index else "/api/kline-all"

            # 构建请求URL
            url = f"{self.API_BASE_URL}{endpoint}"
            params = {
                "code": api_code,
                "type": kline_type,
                "limit": self.limit,
            }

            logger.info(f"请求TDX API: {url}, 参数: {params}")

            # 发起请求
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()

            # 解析响应
            data = response.json()

            if data.get("code") != 0:
                raise Exception(f"API返回错误: {data.get('message', 'Unknown error')}")

            kline_list = data.get("data", {}).get("list", [])

            if not kline_list:
                logger.warning(f"{self.code} 无K线数据")
                return

            logger.info(f"成功获取 {len(kline_list)} 条K线数据")

            # 转换数据格式并返回
            for kline_item in kline_list:
                yield self._convert_to_kline_unit(kline_item)

        except requests.RequestException as e:
            logger.error(f"请求TDX API失败: {e}")
            raise Exception(f"无法连接到TDX Docker服务: {e}")
        except Exception as e:
            logger.error(f"获取K线数据失败: {e}")
            raise

    def _is_etf_code(self, code: str) -> bool:
        """
        判断是否为 ETF 代码

        Args:
            code: 代码（如 sz.159929, sh.589220）

        Returns:
            True: ETF, False: 非ETF
        """
        # 提取市场和代码
        if "." in code:
            market, number = code.split(".")
        elif len(code) >= 8:
            market, number = code[:2], code[2:]
        else:
            return False

        if len(number) != 6:
            return False

        # ETF规则字典
        etf_prefixes = {"sz": ["15", "16", "18"], "sh": ["51", "52", "56", "58"]}

        return market in etf_prefixes and number[:2] in etf_prefixes[market]

    def _is_index_code(self, code: str) -> bool:
        """
        判断是否为指数代码

        Args:
            code: 股票代码（如 sh.000001, sz.399001）

        Returns:
            True: 指数, False: 股票
        """
        return code.startswith("sh.000") or code.startswith("sz.399")

    def _convert_code_format(
        self, code: str, is_index: bool, is_etf: bool = False
    ) -> str:
        """
        转换代码格式为TDX API所需格式

        Args:
            code: 原始代码（如 sh.600519, sh.000001, sz.159929）
            is_index: 是否为指数
            is_etf: 是否为ETF

        Returns:
            转换后的代码
            - 股票: 纯数字（如 600519）
            - ETF: 字母+数字（如 sh589220, sz159929）
            - 指数: 字母+数字（如 sh000001）
        """
        if is_etf or is_index:
            # ETF: sh.589220 → sh589220, sz.159929 → sz159929
            # 指数: sh.000001 → sh000001
            return code.replace(".", "")
        else:
            # 股票: sh.600519 → 600519
            return code.split(".")[-1]

    def _convert_to_kline_unit(self, kline_item: dict) -> CKLine_Unit:
        """
        将TDX API返回的K线数据转换为CKLine_Unit对象

        Args:
            kline_item: API返回的K线数据字典

        Returns:
            CKLine_Unit对象
        """
        # 解析时间（格式: "2025-12-26T15:00:00+08:00"）
        time_str = kline_item["Time"]
        time_obj = self._parse_time(time_str)

        # 构建数据字典
        # 注意：TDX API的价格是以厘为单位（需要除以1000），成交量已经是正确单位
        data_dict = {
            DATA_FIELD.FIELD_TIME: time_obj,
            DATA_FIELD.FIELD_OPEN: float(kline_item["Open"]) / 1000.0,
            DATA_FIELD.FIELD_HIGH: float(kline_item["High"]) / 1000.0,
            DATA_FIELD.FIELD_LOW: float(kline_item["Low"]) / 1000.0,
            DATA_FIELD.FIELD_CLOSE: float(kline_item["Close"]) / 1000.0,
            DATA_FIELD.FIELD_VOLUME: float(kline_item["Volume"]),
            DATA_FIELD.FIELD_TURNOVER: float(kline_item["Amount"]) / 1000.0,
        }

        return CKLine_Unit(data_dict)

    def _parse_time(self, time_str: str) -> CTime:
        """
        解析时间字符串

        Args:
            time_str: 时间字符串（如 "2025-12-26T15:00:00+08:00"）

        Returns:
            CTime对象
        """
        # 去掉时区信息，解析时间
        # "2025-12-26T15:00:00+08:00" → "2025-12-26T15:00:00"
        if "+" in time_str:
            time_str = time_str.split("+")[0]
        elif time_str.endswith("Z"):
            time_str = time_str[:-1]

        # 解析时间
        dt = datetime.fromisoformat(time_str)

        return CTime(dt.year, dt.month, dt.day, dt.hour, dt.minute)

    def SetBasciInfo(self):
        """
        设置股票基本信息（名称等）
        注意：TDX API不提供股票名称，需要从数据库获取
        """
        try:
            import psycopg
            from dotenv import load_dotenv

            load_dotenv()

            # 从数据库获取股票名称
            with psycopg.connect(
                host=os.getenv("DB_HOST", "localhost"),
                port=os.getenv("DB_PORT", "5432"),
                user=os.getenv("DB_USER", "postgres"),
                password=os.getenv("DB_PASSWORD"),
                dbname=os.getenv("DB_NAME", "stock_db"),
            ) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        "SELECT name FROM stocks WHERE code = %s", (self.code,)
                    )
                    row = cursor.fetchone()

                    if row:
                        self.name = row[0]
                        self.is_stock = not self._is_index_code(self.code)
                        logger.debug(f"从数据库获取股票信息: {self.code} - {self.name}")
                    else:
                        # 数据库中没有，使用代码作为名称
                        self.name = self.code
                        self.is_stock = not self._is_index_code(self.code)
                        logger.warning(f"数据库中未找到 {self.code}，使用代码作为名称")

        except Exception as e:
            logger.warning(f"获取股票基本信息失败: {e}")
            # 失败时使用默认值
            self.name = self.code
            self.is_stock = not self._is_index_code(self.code)

    @classmethod
    def do_init(cls):
        """
        初始化（TDX API不需要登录，此方法为空实现）
        """
        logger.info("TDX API 不需要初始化")

    @classmethod
    def do_close(cls):
        """
        关闭连接（TDX API不需要登出，此方法为空实现）
        """
        logger.info("TDX API 不需要关闭连接")
