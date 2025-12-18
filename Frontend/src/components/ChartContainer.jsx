import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  createSeriesMarkers,
} from "lightweight-charts";
import "./ChartContainer.css";
import {
  getBsPointData,
  calculateMACD,
  convertToUnixTimestamp,
  MACD_CONFIG,
} from "../utils/utils";

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

const FORMAT_CONFIG = {
  volumeThreshold: 100000000,
  volumeDivisor: 10000,
  volumeDivisorLarge: 100000000,
  priceDecimal: 2,
  volumeDecimal: 2,
};

const CHART_SIZES = {
  mainHeight: 400,
  macdHeight: 150,
};

const ChartContainer = ({ data }) => {
  const [loading, setLoading] = useState(true);
  const [klineInfo, setKlineInfo] = useState(null);

  const containerRefs = useRef({
    main: null, // 主图表容器
    macd: null, // MACD图表容器
    tooltip: null, // 提示框容器
  });

  const chartRefs = useRef({
    main: null, // 主图表实例
    macd: null, // MACD图表实例
  });

  const seriesRefs = useRef({
    candlestick: null, // K线系列
    lineList: [], // 线段列表（bi、seg、zs）
    macdList: [], // MACD系列列表
    histogram: null, // MACD柱状图
    markers: null, // 买卖点标记
  });

  const dataRefs = useRef({
    kline: [], // K线数据
    markers: [], // 标记数据
  });

  const addLineSegments = (
    chart,
    dataList,
    config,
    convertTime,
    getDataPoints
  ) => {
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

    if (!containerRefs.current.main || !containerRefs.current.macd) return;

    const containerWidth =
      containerRefs.current.main.parentElement?.clientWidth ||
      containerRefs.current.main.clientWidth;

    const mainChart = createChart(
      containerRefs.current.main,
      getChartConfig(
        containerWidth,
        containerRefs.current.main.clientHeight || CHART_SIZES.mainHeight,
        true
      )
    );
    chartRefs.current.main = mainChart;

    const macdChart = createChart(
      containerRefs.current.macd,
      getChartConfig(
        containerWidth,
        containerRefs.current.macd.clientHeight || CHART_SIZES.macdHeight,
        false
      )
    );
    chartRefs.current.macd = macdChart;

    const candlestickSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: COLORS.upColor,
      downColor: COLORS.downColor,
      borderVisible: false,
      wickUpColor: COLORS.upColor,
      wickDownColor: COLORS.downColor,
    });
    seriesRefs.current.candlestick = candlestickSeries;

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

    mainChart.subscribeCrosshairMove((param) => {
      if (param.time && seriesRefs.current.candlestick) {
        const data = param.seriesData.get(seriesRefs.current.candlestick);
        if (data) {
          const originalKline = dataRefs.current.kline.find(
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
        if (dataRefs.current.kline.length > 0) {
          const lastKline =
            dataRefs.current.kline[dataRefs.current.kline.length - 1];
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

    return () => {
      window.removeEventListener("resize", handleResize);
      if (seriesRefs.current.markers) {
        seriesRefs.current.markers.detach();
      }
      mainChart.remove();
      macdChart.remove();
    };
  }, []);

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
    if (!data || !seriesRefs.current.candlestick) return;

    setLoading(true);

    dataRefs.current.kline = klineData;

    seriesRefs.current.candlestick.setData(klineData);

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

    seriesRefs.current.lineList.forEach((series) => {
      chartRefs.current.main.removeSeries(series);
    });
    seriesRefs.current.lineList = [];

    if (chartRefs.current.main) {
      const biSeries = addLineSegments(
        chartRefs.current.main,
        data.bi_list,
        LINE_SERIES_CONFIGS.bi,
        convertToUnixTimestamp,
        (bi, convertTime) => [
          { time: convertTime(bi.begin_time), value: bi.begin_value },
          { time: convertTime(bi.end_time), value: bi.end_value },
        ]
      );
      seriesRefs.current.lineList.push(...biSeries);

      const segSeries = addLineSegments(
        chartRefs.current.main,
        data.seg_list,
        LINE_SERIES_CONFIGS.seg,
        convertToUnixTimestamp,
        (seg, convertTime) => [
          { time: convertTime(seg.begin_time), value: seg.begin_value },
          { time: convertTime(seg.end_time), value: seg.end_value },
        ]
      );
      seriesRefs.current.lineList.push(...segSeries);

      if (data.zs_list && data.zs_list.length > 0) {
        data.zs_list.forEach((zs) => {
          const zsTopSeries = addLineSegments(
            chartRefs.current.main,
            [zs],
            LINE_SERIES_CONFIGS.zs,
            convertToUnixTimestamp,
            (item, convertTime) => [
              { time: convertTime(item.begin_time), value: item.high },
              { time: convertTime(item.end_time), value: item.high },
            ]
          );

          const zsBottomSeries = addLineSegments(
            chartRefs.current.main,
            [zs],
            LINE_SERIES_CONFIGS.zs,
            convertToUnixTimestamp,
            (item, convertTime) => [
              { time: convertTime(item.begin_time), value: item.low },
              { time: convertTime(item.end_time), value: item.low },
            ]
          );

          seriesRefs.current.lineList.push(...zsTopSeries, ...zsBottomSeries);
        });
      }
    }

    if (seriesRefs.current.markers) {
      seriesRefs.current.markers.detach();
      seriesRefs.current.markers = null;
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
      dataRefs.current.markers = bsMarkers;

      seriesRefs.current.markers = createSeriesMarkers(
        seriesRefs.current.candlestick,
        bsMarkers
      );
    } else {
      dataRefs.current.markers = [];
    }

    if (chartRefs.current.macd) {
      seriesRefs.current.macdList.forEach((series) => {
        chartRefs.current.macd.removeSeries(series);
      });
      seriesRefs.current.macdList = [];

      if (data.klines && data.klines.length >= MACD_CONFIG.minDataLength) {
        const macdData = calculateMACD(data.klines);

        if (
          macdData.histogram.length > 0 &&
          macdData.dif.length > 0 &&
          macdData.dea.length > 0
        ) {
          const macdHistogramSeries = chartRefs.current.macd.addSeries(
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
          seriesRefs.current.histogram = macdHistogramSeries;
          macdHistogramSeries.setData(macdData.histogram);

          const difLineSeries = chartRefs.current.macd.addSeries(
            LineSeries,
            LINE_SERIES_CONFIGS.dif
          );
          difLineSeries.setData(macdData.dif);

          const deaLineSeries = chartRefs.current.macd.addSeries(
            LineSeries,
            LINE_SERIES_CONFIGS.dea
          );
          deaLineSeries.setData(macdData.dea);

          const zeroLineSeries = chartRefs.current.macd.addSeries(
            LineSeries,
            LINE_SERIES_CONFIGS.zero
          );
          const zeroLineData = macdData.dif.map((item) => ({
            time: item.time,
            value: 0,
          }));
          zeroLineSeries.setData(zeroLineData);

          seriesRefs.current.macdList.push(
            macdHistogramSeries,
            difLineSeries,
            deaLineSeries,
            zeroLineSeries
          );
        }
      }
    }

    setLoading(false);
  }, [data, klineData]);

  const handleMainCrosshairMove = useCallback((param) => {
    if (param.time && seriesRefs.current.histogram && chartRefs.current.macd) {
      const macdHistogramData = seriesRefs.current.histogram.dataByIndex(
        param.logical
      );

      if (macdHistogramData) {
        chartRefs.current.macd.setCrosshairPosition(
          macdHistogramData.value,
          param.time,
          seriesRefs.current.histogram
        );
      }
    } else if (chartRefs.current.macd) {
      chartRefs.current.macd.clearCrosshairPosition();
    }
  }, []);

  const handleMACDCrosshairMove = useCallback((param) => {
    if (
      param.time &&
      seriesRefs.current.candlestick &&
      chartRefs.current.main
    ) {
      const klineData = seriesRefs.current.candlestick.dataByIndex(
        param.logical
      );

      if (klineData) {
        chartRefs.current.main.setCrosshairPosition(
          klineData.close,
          param.time,
          seriesRefs.current.candlestick
        );
      }
    } else if (chartRefs.current.main) {
      chartRefs.current.main.clearCrosshairPosition();
    }
  }, []);

  const syncTimeFromMain = useCallback(() => {
    if (chartRefs.current.main && chartRefs.current.macd) {
      const mainRange = chartRefs.current.main
        .timeScale()
        .getVisibleLogicalRange();
      if (mainRange) {
        chartRefs.current.macd.timeScale().setVisibleLogicalRange(mainRange);
      }
    }
  }, []);

  const syncTimeFromMacd = useCallback(() => {
    if (chartRefs.current.macd && chartRefs.current.main) {
      const macdRange = chartRefs.current.macd
        .timeScale()
        .getVisibleLogicalRange();
      if (macdRange) {
        chartRefs.current.main.timeScale().setVisibleLogicalRange(macdRange);
      }
    }
  }, []);

  useEffect(() => {
    if (!chartRefs.current.main || !chartRefs.current.macd) return;

    chartRefs.current.main.subscribeCrosshairMove(handleMainCrosshairMove);
    chartRefs.current.macd.subscribeCrosshairMove(handleMACDCrosshairMove);

    chartRefs.current.main
      .timeScale()
      .subscribeVisibleLogicalRangeChange(syncTimeFromMain);
    chartRefs.current.macd
      .timeScale()
      .subscribeVisibleLogicalRangeChange(syncTimeFromMacd);

    return () => {
      if (chartRefs.current.main) {
        chartRefs.current.main.unsubscribeCrosshairMove(
          handleMainCrosshairMove
        );
        chartRefs.current.main
          .timeScale()
          .unsubscribeVisibleLogicalRangeChange(syncTimeFromMain);
      }

      if (chartRefs.current.macd) {
        chartRefs.current.macd.unsubscribeCrosshairMove(
          handleMACDCrosshairMove
        );
        chartRefs.current.macd
          .timeScale()
          .unsubscribeVisibleLogicalRangeChange(syncTimeFromMacd);
      }
    };
  }, [
    handleMainCrosshairMove,
    handleMACDCrosshairMove,
    syncTimeFromMain,
    syncTimeFromMacd,
  ]);

  return (
    <div className="chart-container">
      {loading && (
        <div className="loading-indicator">
          <div className="spinner" />
          <p>图表数据加载中...</p>
        </div>
      )}
      <div
        className="chart-wrapper"
        ref={(el) => (containerRefs.current.main = el)}
      >
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
                {klineInfo.open.toFixed(FORMAT_CONFIG.priceDecimal)}
              </span>
            </div>
            <div className="kline-info-item">
              <span className="kline-info-label">高</span>
              <span className="kline-info-value kline-info-high">
                {klineInfo.high.toFixed(FORMAT_CONFIG.priceDecimal)}
              </span>
            </div>
            <div className="kline-info-item">
              <span className="kline-info-label">低</span>
              <span className="kline-info-value kline-info-low">
                {klineInfo.low.toFixed(FORMAT_CONFIG.priceDecimal)}
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
                {klineInfo.close.toFixed(FORMAT_CONFIG.priceDecimal)}
              </span>
            </div>
            <div className="kline-info-item">
              <span className="kline-info-label">量</span>
              <span className="kline-info-value">
                {klineInfo.volume >= FORMAT_CONFIG.volumeThreshold
                  ? `${(
                      klineInfo.volume / FORMAT_CONFIG.volumeDivisorLarge
                    ).toFixed(FORMAT_CONFIG.volumeDecimal)}亿`
                  : `${(klineInfo.volume / FORMAT_CONFIG.volumeDivisor).toFixed(
                      FORMAT_CONFIG.volumeDecimal
                    )}万`}
              </span>
            </div>
          </div>
        )}
        <div
          ref={(el) => (containerRefs.current.tooltip = el)}
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
      <div
        className="macd-wrapper"
        ref={(el) => (containerRefs.current.macd = el)}
      />
    </div>
  );
};

export default ChartContainer;
