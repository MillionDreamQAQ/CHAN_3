import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
} from "lightweight-charts";
import { getChartConfig, CHART_SIZES } from "../../../config/config";

export const useChartInit = (
  containerRefs,
  chartRefs,
  seriesRefs,
  dataRefs,
  COLORS,
  setKlineInfo,
  setLoading
) => {
  const isInitializedRef = useRef(false);

  useEffect(() => {
    if (isInitializedRef.current) return;

    setLoading(true);

    if (!containerRefs.current.main || !containerRefs.current.macd) return;

    const containerWidth =
      containerRefs.current.main.parentElement?.clientWidth ||
      containerRefs.current.main.clientWidth;

    // 创建主图
    const mainChart = createChart(
      containerRefs.current.main,
      getChartConfig(
        containerWidth,
        containerRefs.current.main.clientHeight || CHART_SIZES.mainHeight,
        true,
        false
      )
    );
    chartRefs.current.main = mainChart;

    // 创建 MACD 图
    const macdChart = createChart(
      containerRefs.current.macd,
      getChartConfig(
        containerWidth,
        containerRefs.current.macd.clientHeight || CHART_SIZES.macdHeight,
        false,
        false
      )
    );
    chartRefs.current.macd = macdChart;

    // 创建 K 线系列
    const candlestickSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: COLORS.upColor,
      downColor: COLORS.downColor,
      borderVisible: false,
      wickUpColor: COLORS.upColor,
      wickDownColor: COLORS.downColor,
    });
    seriesRefs.current.candlestick = candlestickSeries;

    // 创建成交量系列
    const volumeSeries = mainChart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: {
        type: "volume",
      },
      color: COLORS.downColor,
    });
    seriesRefs.current.volume = volumeSeries;

    mainChart.priceScale("volume").applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    // 窗口大小改变时调整图表大小
    const handleResize = () => {
      const resizeWidth =
        containerRefs.current.main?.parentElement?.clientWidth ||
        containerRefs.current.main?.clientWidth;

      if (containerRefs.current.main && resizeWidth) {
        mainChart.applyOptions({
          width: resizeWidth,
          height: containerRefs.current.main.clientHeight,
        });
      }
      if (containerRefs.current.macd && resizeWidth) {
        macdChart.applyOptions({
          width: resizeWidth,
          height: containerRefs.current.macd.clientHeight,
        });
      }
    };

    // 十字线移动时更新 K 线信息
    mainChart.subscribeCrosshairMove((param) => {
      if (param.time && seriesRefs.current.candlestick) {
        const data = param.seriesData.get(seriesRefs.current.candlestick);
        if (data) {
          const currentIndex = dataRefs.current.kline.findIndex(
            (k) => k.time === param.time
          );
          const originalKline = dataRefs.current.kline[currentIndex];
          const prevKline =
            currentIndex > 0 ? dataRefs.current.kline[currentIndex - 1] : null;

          setKlineInfo({
            time: param.time,
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
            volume: originalKline?.volume || 0,
            amount: originalKline?.amount || 0,
            prevClose: prevKline?.close || data.open,
          });
        }
      } else {
        if (dataRefs.current.kline.length > 0) {
          const lastIndex = dataRefs.current.kline.length - 1;
          const lastKline = dataRefs.current.kline[lastIndex];
          const prevKline =
            lastIndex > 0 ? dataRefs.current.kline[lastIndex - 1] : null;
          setKlineInfo({
            time: lastKline.time,
            open: lastKline.open,
            high: lastKline.high,
            low: lastKline.low,
            close: lastKline.close,
            volume: lastKline.volume || 0,
            amount: lastKline.amount || 0,
            prevClose: prevKline?.close || lastKline.open,
          });
        }
      }

      // Tooltip 处理
      if (
        !containerRefs.current.tooltip ||
        !param.time ||
        !dataRefs.current.markers.length
      ) {
        if (containerRefs.current.tooltip) {
          containerRefs.current.tooltip.style.display = "none";
        }
        return;
      }

      const marker = dataRefs.current.markers.find(
        (m) => m.time === param.time
      );

      if (marker && marker.tooltip) {
        const coordinate = seriesRefs.current.candlestick.priceToCoordinate(
          param.seriesData.get(seriesRefs.current.candlestick)?.close || 0
        );

        if (coordinate !== null) {
          containerRefs.current.tooltip.style.display = "block";
          containerRefs.current.tooltip.style.left = param.point.x + 10 + "px";
          containerRefs.current.tooltip.style.top = coordinate - 30 + "px";
          containerRefs.current.tooltip.innerHTML = marker.tooltip;
        }
      } else {
        containerRefs.current.tooltip.style.display = "none";
      }
    });

    window.addEventListener("resize", handleResize);
    isInitializedRef.current = true;

    return () => {
      window.removeEventListener("resize", handleResize);
      if (seriesRefs.current.markers) {
        seriesRefs.current.markers.detach();
      }
      mainChart.remove();
      macdChart.remove();
      isInitializedRef.current = false;
    };
  }, []);
};
