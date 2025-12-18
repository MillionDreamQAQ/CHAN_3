import { useEffect, useRef, useState, useMemo } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  createSeriesMarkers,
} from "lightweight-charts";
import { MACD } from "technicalindicators";
import "./ChartContainer.css";
import { getBsPointData } from "../utils/utils";
import dayjs from "dayjs";

// 颜色配置常量
const COLORS = {
  upColor: "#ef5350",
  downColor: "#26a69a",
  biLine: "#3300ffff",
  segLine: "#ff0000ff",
  zsLine: "#000000ff",
  difLine: "#2962FF",
  deaLine: "#FF6D00",
  zeroLine: "#787B86",
  buyMarker: "#ff0000ff",
  sellMarker: "#1bb31bff",
};

// 通用图表配置
const getChartConfig = (width, height, showTimeVisible = true) => ({
  width,
  height,
  layout: {
    background: { color: "#ffffff" },
    textColor: "#333",
  },
  grid: {
    vertLines: { color: "#f0f0f0" },
    horzLines: { color: "#f0f0f0" },
  },
  crosshair: {
    mode: 1,
  },
  rightPriceScale: {
    borderColor: "#d1d4dc",
  },
  timeScale: {
    borderColor: "#d1d4dc",
    timeVisible: showTimeVisible,
    secondsVisible: false,
  },
  localization: {
    dateFormat: "yyyy-MM-dd",
  },
});

// LineSeries 配置模板
const LINE_SERIES_CONFIGS = {
  bi: {
    color: COLORS.biLine,
    lineWidth: 1,
    lineStyle: 0,
    priceLineVisible: false,
    lastValueVisible: false,
  },
  seg: {
    color: COLORS.segLine,
    lineWidth: 2,
    lineStyle: 0,
    priceLineVisible: false,
    lastValueVisible: false,
  },
  zs: {
    color: COLORS.zsLine,
    lineWidth: 2,
    lineStyle: 0,
    priceLineVisible: false,
    lastValueVisible: false,
  },
  dif: {
    color: COLORS.difLine,
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
  },
  dea: {
    color: COLORS.deaLine,
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
  },
  zero: {
    color: COLORS.zeroLine,
    lineWidth: 1,
    lineStyle: 2,
    priceLineVisible: false,
    lastValueVisible: false,
  },
};

const ChartContainer = ({ data }) => {
  const [loading, setLoading] = useState(true);

  const chartContainerRef = useRef(null);
  const macdContainerRef = useRef(null);
  const mainChartRef = useRef(null);
  const macdChartRef = useRef(null);
  const candlestickSeriesRef = useRef(null);
  const lineSeriesListRef = useRef([]);
  const macdSeriesListRef = useRef([]);
  const histogramSeriesRef = useRef(null);
  const tooltipRef = useRef(null);
  const markersDataRef = useRef([]);
  const seriesMarkersRef = useRef(null);
  const klineDataRef = useRef([]);
  const [klineInfo, setKlineInfo] = useState(null);

  const convertToUnixTimestamp = (timeStr) => {
    return dayjs(timeStr).add(8, "hour").add(1, "minute").unix() - 60;
  };

  // 通用的添加线段系列函数
  const addLineSegments = (chart, dataList, config, convertTime, getDataPoints) => {
    const seriesList = [];

    if (dataList && dataList.length > 0) {
      dataList.forEach((item) => {
        const lineSeries = chart.addSeries(LineSeries, config);
        lineSeries.setData(getDataPoints(item, convertTime));
        seriesList.push(lineSeries);
      });
    }

    return seriesList;
  };

  useEffect(() => {
    setLoading(true);

    if (!chartContainerRef.current || !macdContainerRef.current) return;

    const containerWidth =
      chartContainerRef.current.parentElement?.clientWidth ||
      chartContainerRef.current.clientWidth;

    // 使用通用配置创建主图表
    const mainChart = createChart(
      chartContainerRef.current,
      getChartConfig(containerWidth, chartContainerRef.current.clientHeight || 400, true)
    );
    mainChartRef.current = mainChart;

    // 使用通用配置创建MACD图表
    const macdChart = createChart(
      macdContainerRef.current,
      getChartConfig(containerWidth, macdContainerRef.current.clientHeight || 150, false)
    );
    macdChartRef.current = macdChart;

    const candlestickSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: COLORS.upColor,
      downColor: COLORS.downColor,
      borderVisible: false,
      wickUpColor: COLORS.upColor,
      wickDownColor: COLORS.downColor,
    });
    candlestickSeriesRef.current = candlestickSeries;

    mainChart.timeScale().subscribeVisibleLogicalRangeChange((timeRange) => {
      macdChart.timeScale().setVisibleLogicalRange(timeRange);
    });

    const handleResize = () => {
      const resizeWidth =
        chartContainerRef.current?.parentElement?.clientWidth ||
        chartContainerRef.current?.clientWidth;

      if (chartContainerRef.current && resizeWidth) {
        mainChart.applyOptions({
          width: resizeWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
      if (macdContainerRef.current && resizeWidth) {
        macdChart.applyOptions({
          width: resizeWidth,
          height: macdContainerRef.current.clientHeight,
        });
      }
    };

    mainChart.subscribeCrosshairMove((param) => {
      if (param.time && candlestickSeriesRef.current) {
        const data = param.seriesData.get(candlestickSeriesRef.current);
        if (data) {
          const originalKline = klineDataRef.current.find(
            (k) => k.time === param.time
          );

          setKlineInfo({
            time: param.time,
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
            volume: originalKline?.volume || 0,
          });
        }
      } else {
        if (klineDataRef.current.length > 0) {
          const lastKline =
            klineDataRef.current[klineDataRef.current.length - 1];
          setKlineInfo({
            time: lastKline.time,
            open: lastKline.open,
            high: lastKline.high,
            low: lastKline.low,
            close: lastKline.close,
            volume: lastKline.volume || 0,
          });
        }
      }

      if (
        !tooltipRef.current ||
        !param.time ||
        !markersDataRef.current.length
      ) {
        if (tooltipRef.current) {
          tooltipRef.current.style.display = "none";
        }
        return;
      }

      const marker = markersDataRef.current.find((m) => m.time === param.time);

      if (marker && marker.tooltip) {
        const coordinate = candlestickSeriesRef.current.priceToCoordinate(
          param.seriesData.get(candlestickSeriesRef.current)?.close || 0
        );

        if (coordinate !== null) {
          tooltipRef.current.style.display = "block";
          tooltipRef.current.style.left = param.point.x + 10 + "px";
          tooltipRef.current.style.top = coordinate - 30 + "px";
          tooltipRef.current.innerHTML = marker.tooltip;
        }
      } else {
        tooltipRef.current.style.display = "none";
      }
    });

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (seriesMarkersRef.current) {
        seriesMarkersRef.current.detach();
      }
      mainChart.remove();
      macdChart.remove();
    };
  }, []);

  // 使用 useMemo 缓存转换后的 kline 数据，避免重复转换
  const klineData = useMemo(() => {
    if (!data?.klines) return [];
    return data.klines.map((k) => ({
      time: convertToUnixTimestamp(k.time),
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume || 0,
    }));
  }, [data?.klines]);

  useEffect(() => {
    if (!data || !candlestickSeriesRef.current) return;

    setLoading(true);

    klineDataRef.current = klineData;

    candlestickSeriesRef.current.setData(klineData);

    // 设置初始K线信息为最后一根K线
    if (klineData.length > 0) {
      const lastKline = klineData[klineData.length - 1];
      setKlineInfo({
        time: lastKline.time,
        open: lastKline.open,
        high: lastKline.high,
        low: lastKline.low,
        close: lastKline.close,
        volume: lastKline.volume || 0,
      });
    }

    // 清除之前的线段系列
    lineSeriesListRef.current.forEach((series) => {
      mainChartRef.current.removeSeries(series);
    });
    lineSeriesListRef.current = [];

    // 绘制笔线段
    if (mainChartRef.current) {
      const biSeries = addLineSegments(
        mainChartRef.current,
        data.bi_list,
        LINE_SERIES_CONFIGS.bi,
        convertToUnixTimestamp,
        (bi, convertTime) => [
          { time: convertTime(bi.begin_time), value: bi.begin_value },
          { time: convertTime(bi.end_time), value: bi.end_value },
        ]
      );
      lineSeriesListRef.current.push(...biSeries);

      // 绘制线段
      const segSeries = addLineSegments(
        mainChartRef.current,
        data.seg_list,
        LINE_SERIES_CONFIGS.seg,
        convertToUnixTimestamp,
        (seg, convertTime) => [
          { time: convertTime(seg.begin_time), value: seg.begin_value },
          { time: convertTime(seg.end_time), value: seg.end_value },
        ]
      );
      lineSeriesListRef.current.push(...segSeries);

      // 绘制中枢（顶部和底部线）
      if (data.zs_list && data.zs_list.length > 0) {
        data.zs_list.forEach((zs) => {
          // 顶部线
          const zsTopSeries = addLineSegments(
            mainChartRef.current,
            [zs],
            LINE_SERIES_CONFIGS.zs,
            convertToUnixTimestamp,
            (item, convertTime) => [
              { time: convertTime(item.begin_time), value: item.high },
              { time: convertTime(item.end_time), value: item.high },
            ]
          );

          // 底部线
          const zsBottomSeries = addLineSegments(
            mainChartRef.current,
            [zs],
            LINE_SERIES_CONFIGS.zs,
            convertToUnixTimestamp,
            (item, convertTime) => [
              { time: convertTime(item.begin_time), value: item.low },
              { time: convertTime(item.end_time), value: item.low },
            ]
          );

          lineSeriesListRef.current.push(...zsTopSeries, ...zsBottomSeries);
        });
      }
    }

    if (seriesMarkersRef.current) {
      seriesMarkersRef.current.detach();
      seriesMarkersRef.current = null;
    }

    if (data.bs_points && data.bs_points.length > 0) {
      const bsMarkers = data.bs_points.map((bs) => {
        const textData = getBsPointData(bs.type, bs.is_buy);
        return {
          time: convertToUnixTimestamp(bs.time),
          position: bs.is_buy ? "belowBar" : "aboveBar",
          color: bs.is_buy ? COLORS.buyMarker : COLORS.sellMarker,
          shape: bs.is_buy ? "arrowUp" : "arrowDown",
          text: textData.text,
          size: 2,
          tooltip: `
            <div style="font-size: 12px; font-weight: bold; margin-bottom: 4px;">
              ${bs.is_buy ? "买点" : "卖点"}: ${textData.text}
            </div>
            <div style="font-size: 11px;">类型: ${textData.description}</div>
            <div style="font-size: 11px;">时间: ${bs.time}</div>
          `,
        };
      });

      bsMarkers.sort((a, b) => new Date(a.time) - new Date(b.time));
      markersDataRef.current = bsMarkers;

      seriesMarkersRef.current = createSeriesMarkers(
        candlestickSeriesRef.current,
        bsMarkers
      );
    } else {
      markersDataRef.current = [];
    }

    if (macdChartRef.current) {
      macdSeriesListRef.current.forEach((series) => {
        macdChartRef.current.removeSeries(series);
      });
      macdSeriesListRef.current = [];

      if (data.klines && data.klines.length >= 26) {
        const macdData = calculateMACD(data.klines);

        if (
          macdData.histogram.length > 0 &&
          macdData.dif.length > 0 &&
          macdData.dea.length > 0
        ) {
          const macdHistogramSeries = macdChartRef.current.addSeries(
            HistogramSeries,
            {
              color: COLORS.downColor,
              priceFormat: {
                type: "price",
                precision: 3,
                minMove: 0.001,
              },
              priceLineVisible: false,
              lastValueVisible: true,
            }
          );
          histogramSeriesRef.current = macdHistogramSeries;
          macdHistogramSeries.setData(macdData.histogram);

          const difLineSeries = macdChartRef.current.addSeries(LineSeries, LINE_SERIES_CONFIGS.dif);
          difLineSeries.setData(macdData.dif);

          const deaLineSeries = macdChartRef.current.addSeries(LineSeries, LINE_SERIES_CONFIGS.dea);
          deaLineSeries.setData(macdData.dea);

          const zeroLineSeries = macdChartRef.current.addSeries(LineSeries, LINE_SERIES_CONFIGS.zero);
          const zeroLineData = macdData.dif.map((item) => ({
            time: item.time,
            value: 0,
          }));
          zeroLineSeries.setData(zeroLineData);

          macdSeriesListRef.current.push(
            macdHistogramSeries,
            difLineSeries,
            deaLineSeries,
            zeroLineSeries
          );
        }
      }
    }

    mainChartRef.current.subscribeCrosshairMove(handleMainCrosshairMove);
    macdChartRef.current.subscribeCrosshairMove(handleMACDCrosshairMove);

    mainChartRef.current
      .timeScale()
      .subscribeVisibleLogicalRangeChange(syncTimeFromMain);
    macdChartRef.current
      .timeScale()
      .subscribeVisibleLogicalRangeChange(syncTimeFromMacd);

    setLoading(false);

    return () => {
      mainChartRef.current.unsubscribeCrosshairMove(handleMainCrosshairMove);
      macdChartRef.current.unsubscribeCrosshairMove(handleMACDCrosshairMove);

      mainChartRef.current
        .timeScale()
        .unsubscribeVisibleLogicalRangeChange(syncTimeFromMain);
      macdChartRef.current
        .timeScale()
        .unsubscribeVisibleLogicalRangeChange(syncTimeFromMacd);
    };
  }, [data, klineData]);

  const handleMainCrosshairMove = (param) => {
    if (param.time) {
      const macdHistogramData = histogramSeriesRef.current.dataByIndex(
        param.logical
      );

      if (macdHistogramData) {
        macdChartRef.current.setCrosshairPosition(
          macdHistogramData.value,
          param.time,
          histogramSeriesRef.current
        );
      }
    } else {
      macdChartRef.current.clearCrosshairPosition();
    }
  };

  const handleMACDCrosshairMove = (param) => {
    if (param.time) {
      const klineData = candlestickSeriesRef.current.dataByIndex(param.logical);

      if (klineData) {
        mainChartRef.current.setCrosshairPosition(
          klineData.close,
          param.time,
          candlestickSeriesRef.current
        );
      }
    } else {
      mainChartRef.current.clearCrosshairPosition();
    }
  };

  const syncTimeFromMain = () => {
    const mainRange = mainChartRef.current.timeScale().getVisibleLogicalRange();
    if (mainRange) {
      macdChartRef.current.timeScale().setVisibleLogicalRange(mainRange);
    }
  };

  const syncTimeFromMacd = () => {
    const macdRange = macdChartRef.current.timeScale().getVisibleLogicalRange();
    if (macdRange) {
      mainChartRef.current.timeScale().setVisibleLogicalRange(macdRange);
    }
  };

  const calculateMACD = (klines) => {
    try {
      if (!klines || klines.length < 26) {
        return { dif: [], dea: [], histogram: [] };
      }

      const closePrices = klines.map((k) => parseFloat(k.close));

      const macdInput = {
        values: closePrices,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
      };

      const macdResult = MACD.calculate(macdInput);

      if (!macdResult || macdResult.length === 0) {
        return { dif: [], dea: [], histogram: [] };
      }

      const difData = [];
      const deaData = [];
      const histogram = [];

      const startIndex = closePrices.length - macdResult.length;

      for (let i = 0; i < klines.length; i++) {
        const time = convertToUnixTimestamp(klines[i].time);

        if (i < startIndex) {
          // 前面没有MACD数据的部分，用0填充
          difData.push({ time, value: 0 });
          deaData.push({ time, value: 0 });
          histogram.push({ time, value: 0, color: "rgba(0,0,0,0)" });
        } else {
          const macdIndex = i - startIndex;
          const item = macdResult[macdIndex];

          if (item.histogram) {
            item.histogram = item.histogram * 2;
          }

          if (item) {
            difData.push({
              time,
              value: item.MACD ?? 0,
            });

            deaData.push({
              time,
              value: item.signal ?? 0,
            });

            histogram.push({
              time,
              value: item.histogram ?? 0,
              color: item.histogram >= 0 ? COLORS.upColor : COLORS.downColor,
            });
          }
        }
      }

      return { dif: difData, dea: deaData, histogram };
    } catch (error) {
      console.error("MACD calculation error:", error);
      return { dif: [], dea: [], histogram: [] };
    }
  };

  return (
    <div className="chart-container">
      {loading && (
        <div className="loading-indicator">
          <div className="spinner" />
          <p>图表数据加载中...</p>
        </div>
      )}
      <div className="chart-wrapper" ref={chartContainerRef}>
        {data && (data.name || data.code) && (
          <div className="stock-title">
            <span className="stock-name">{data.name || "未知股票"}</span>
            <span className="stock-code">{data.code}</span>
          </div>
        )}
        {klineInfo && (
          <div className="kline-info-panel">
            <div className="kline-info-item">
              <span className="kline-info-label">开</span>
              <span className="kline-info-value">
                {klineInfo.open.toFixed(2)}
              </span>
            </div>
            <div className="kline-info-item">
              <span className="kline-info-label">高</span>
              <span className="kline-info-value kline-info-high">
                {klineInfo.high.toFixed(2)}
              </span>
            </div>
            <div className="kline-info-item">
              <span className="kline-info-label">低</span>
              <span className="kline-info-value kline-info-low">
                {klineInfo.low.toFixed(2)}
              </span>
            </div>
            <div className="kline-info-item">
              <span className="kline-info-label">收</span>
              <span
                className={`kline-info-value ${
                  klineInfo.close >= klineInfo.open
                    ? "kline-info-up"
                    : "kline-info-down"
                }`}
              >
                {klineInfo.close.toFixed(2)}
              </span>
            </div>
            <div className="kline-info-item">
              <span className="kline-info-label">量</span>
              <span className="kline-info-value">
                {klineInfo.volume >= 100000000
                  ? `${(klineInfo.volume / 100000000).toFixed(2)}亿`
                  : `${(klineInfo.volume / 10000).toFixed(2)}万`}
              </span>
            </div>
          </div>
        )}
        <div
          ref={tooltipRef}
          style={{
            position: "absolute",
            display: "none",
            padding: "8px 12px",
            background: "rgba(0, 0, 0, 0.85)",
            color: "white",
            borderRadius: "4px",
            fontSize: "12px",
            pointerEvents: "none",
            zIndex: 1000,
            whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
          }}
        />
      </div>
      <div className="macd-wrapper" ref={macdContainerRef} />
    </div>
  );
};

export default ChartContainer;
