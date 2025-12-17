import sys
import os
import psycopg
from dotenv import load_dotenv

# 添加父目录到路径，以便导入Chan模块
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from Chan import CChan
from ChanConfig import CChanConfig
from Common.CEnum import AUTYPE, DATA_SRC, KL_TYPE, BSP_TYPE
from app.models.schemas import (
    ChanRequest,
    ChanResponse,
    KLineData,
    BiPoint,
    SegPoint,
    BSPoint,
    ZSInfo,
)
from typing import List, Optional

# 加载环境变量
load_dotenv()


class ChanService:
    @staticmethod
    def get_stock_name(code: str) -> Optional[str]:
        """
        从数据库获取股票名称

        Args:
            code: 股票代码

        Returns:
            股票名称，如果未找到则返回 None
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
            cursor.execute("SELECT name FROM stocks WHERE code = %s", (code,))
            row = cursor.fetchone()
            cursor.close()
            conn.close()

            return row[0] if row else None
        except Exception as e:
            print(f"获取股票名称失败: {e}")
            return None

    @staticmethod
    def calculate_chan(request: ChanRequest) -> ChanResponse:
        # K线级别映射
        kline_type_map = {
            "day": KL_TYPE.K_DAY,
            "week": KL_TYPE.K_WEEK,
            "month": KL_TYPE.K_MON,
            "5m": KL_TYPE.K_5M,
            "15m": KL_TYPE.K_15M,
            "30m": KL_TYPE.K_30M,
            "60m": KL_TYPE.K_60M,
        }
        kl_type = kline_type_map.get(request.kline_type or "day", KL_TYPE.K_DAY)

        # 创建Chan配置
        config = CChanConfig(
            {
                "bi_strict": True,
                "trigger_step": False,
                "skip_step": 0,
                "divergence_rate": float("inf"),
                "bsp2_follow_1": False,
                "bsp3_follow_1": False,
                "min_zs_cnt": 0,
                "bs1_peak": False,
                "macd_algo": "peak",
                "bs_type": "1,2,3a,1p,2s,3b",
                "print_warning": True,
                "zs_algo": "normal",
            }
        )

        # 创建CChan实例
        chan = CChan(
            code=request.code,
            begin_time=request.begin_time,
            end_time=request.end_time,
            data_src=DATA_SRC.TIMESCALE,
            lv_list=[kl_type],
            config=config,
            autype=AUTYPE.QFQ,
        )

        # 获取K线数据
        klines = ChanService._extract_klines(chan)

        # 获取笔列表
        bi_list = ChanService._extract_bi_list(chan)

        # 获取线段列表
        seg_list = ChanService._extract_seg_list(chan)

        # 获取买卖点
        bs_points = ChanService._extract_bs_points(chan)

        # 获取中枢列表
        zs_list = ChanService._extract_zs_list(chan)

        # 获取中枢买卖点
        cbsp_list = ChanService._extract_cbsp_list(chan)

        # 获取股票名称
        stock_name = ChanService.get_stock_name(request.code)

        return ChanResponse(
            code=request.code,
            name=stock_name,
            klines=klines,
            bi_list=bi_list,
            seg_list=seg_list,
            bs_points=bs_points,
            zs_list=zs_list,
            cbsp_list=cbsp_list,
        )

    @staticmethod
    def _extract_klines(chan: CChan) -> List[KLineData]:
        klines = []
        kl_list = chan[0]

        for klc in kl_list:
            for klu in klc.lst:
                # 获取成交量，CTradeInfo使用metric字典存储数据
                volume = 0
                if hasattr(klu, "trade_info") and klu.trade_info:
                    volume = klu.trade_info.metric.get("volume", 0) or 0

                klines.append(
                    KLineData(
                        time=str(klu.time),
                        open=klu.open,
                        high=klu.high,
                        low=klu.low,
                        close=klu.close,
                        volume=volume,
                    )
                )

        return klines

    @staticmethod
    def _extract_bi_list(chan: CChan) -> List[BiPoint]:
        bi_list = []
        kl_list = chan[0]

        if not hasattr(kl_list, "bi_list") or not kl_list.bi_list:
            return bi_list

        for idx, bi in enumerate(kl_list.bi_list):
            bi_list.append(
                BiPoint(
                    idx=idx,
                    begin_time=str(bi.get_begin_klu().time),
                    end_time=str(bi.get_end_klu().time),
                    begin_value=bi.get_begin_val(),
                    end_value=bi.get_end_val(),
                    direction="up" if bi.is_up() else "down",
                )
            )

        return bi_list

    @staticmethod
    def _extract_seg_list(chan: CChan) -> List[SegPoint]:
        seg_list = []
        kl_list = chan[0]

        if not hasattr(kl_list, "seg_list") or not kl_list.seg_list:
            return seg_list

        for idx, seg in enumerate(kl_list.seg_list):
            seg_list.append(
                SegPoint(
                    idx=idx,
                    begin_time=str(seg.start_bi.get_begin_klu().time),
                    end_time=str(seg.end_bi.get_end_klu().time),
                    begin_value=seg.start_bi.get_begin_val(),
                    end_value=seg.end_bi.get_end_val(),
                    direction="up" if seg.is_up() else "down",
                )
            )

        return seg_list

    @staticmethod
    def _extract_bs_points(chan: CChan) -> List[BSPoint]:
        bs_points = []
        kl_list = chan[0]

        if not hasattr(kl_list, "bs_point_lst") or not kl_list.bs_point_lst:
            return bs_points

        # CBSPointList需要使用getSortedBspList()方法获取列表
        bsp_list = kl_list.bs_point_lst.getSortedBspList()

        for bsp in bsp_list:
            bs_points.append(
                BSPoint(
                    type=(
                        bsp.type.value if hasattr(bsp.type, "value") else str(bsp.type)
                    ),
                    time=str(bsp.klu.time),
                    value=bsp.klu.close,
                    klu_idx=bsp.klu.idx,
                    is_buy=bsp.is_buy,
                )
            )

        return bs_points

    @staticmethod
    def _extract_zs_list(chan: CChan) -> List[ZSInfo]:
        zs_list = []
        kl_list = chan[0]

        if not hasattr(kl_list, "zs_list") or not kl_list.zs_list:
            return zs_list

        for zs in kl_list.zs_list:
            zs_list.append(
                ZSInfo(
                    begin_time=str(zs.begin.time),
                    end_time=str(zs.end.time),
                    high=zs.high,
                    low=zs.low,
                )
            )

        return zs_list

    @staticmethod
    def _extract_cbsp_list(chan: CChan) -> List[BSPoint]:
        cbsp_list = []

        if hasattr(chan[0], "cbsp_strategy") and chan[0].cbsp_strategy:
            try:
                # cbsp_strategy可能也使用类似的结构，尝试获取列表
                bs_point_lst = chan[0].cbsp_strategy.bs_point_lst

                # 如果有getSortedBspList方法，使用它
                if hasattr(bs_point_lst, "getSortedBspList"):
                    cbsp_items = bs_point_lst.getSortedBspList()
                else:
                    # 否则尝试直接迭代
                    cbsp_items = bs_point_lst

                for cbsp in cbsp_items:
                    cbsp_list.append(
                        BSPoint(
                            type=(
                                cbsp.type.value
                                if hasattr(cbsp, "type") and hasattr(cbsp.type, "value")
                                else "cbsp"
                            ),
                            time=str(cbsp.klu.time),
                            value=cbsp.klu.close,
                            klu_idx=cbsp.klu.idx,
                            is_buy=cbsp.is_buy,
                        )
                    )
            except Exception as e:
                # 如果提取CBSP失败，记录但不影响整体结果
                print(f"Warning: Failed to extract CBSP list: {e}")

        return cbsp_list
