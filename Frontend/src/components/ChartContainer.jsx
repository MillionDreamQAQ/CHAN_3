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

    if (!chartContainerRef.current || !macdContainerRef.current) return;

    const containerWidth =
      chartContainerRef.current.parentElement?.clientWidth ||
      chartContainerRef.current.clientWidth;

    const mainChart = createChart(
      chartContainerRef.current,
      getChartConfig(
        containerWidth,
        chartContainerRef.current.clientHeight || CHART_SIZES.mainHeight,
        true
      )
    );
    mainChartRef.current = mainChart;

    const macdChart = createChart(
      macdContainerRef.current,
      getChartConfig(
        containerWidth,
        macdContainerRef.current.clientHeight || CHART_SIZES.macdHeight,
        false
      )
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

    lineSeriesListRef.current.forEach((series) => {
      mainChartRef.current.removeSeries(series);
    });
    lineSeriesListRef.current = [];

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

      if (data.zs_list && data.zs_list.length > 0) {
        data.zs_list.forEach((zs) => {
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

      if (data.klines && data.klines.length >= MACD_CONFIG.minDataLength) {
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

          const difLineSeries = macdChartRef.current.addSeries(
            LineSeries,
            LINE_SERIES_CONFIGS.dif
          );
          difLineSeries.setData(macdData.dif);

          const deaLineSeries = macdChartRef.current.addSeries(
            LineSeries,
            LINE_SERIES_CONFIGS.dea
          );
          deaLineSeries.setData(macdData.dea);

          const zeroLineSeries = macdChartRef.current.addSeries(
            LineSeries,
            LINE_SERIES_CONFIGS.zero
          );
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

    setLoading(false);
  }, [data, klineData]);

  const handleMainCrosshairMove = useCallback((param) => {
    if (param.time && histogramSeriesRef.current && macdChartRef.current) {
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
    } else if (macdChartRef.current) {
      macdChartRef.current.clearCrosshairPosition();
    }
  }, []);

  const handleMACDCrosshairMove = useCallback((param) => {
    if (param.time && candlestickSeriesRef.current && mainChartRef.current) {
      const klineData = candlestickSeriesRef.current.dataByIndex(param.logical);

      if (klineData) {
        mainChartRef.current.setCrosshairPosition(
          klineData.close,
          param.time,
          candlestickSeriesRef.current
        );
      }
    } else if (mainChartRef.current) {
      mainChartRef.current.clearCrosshairPosition();
    }
  }, []);

  const syncTimeFromMain = useCallback(() => {
    if (mainChartRef.current && macdChartRef.current) {
      const mainRange = mainChartRef.current
        .timeScale()
        .getVisibleLogicalRange();
      if (mainRange) {
        macdChartRef.current.timeScale().setVisibleLogicalRange(mainRange);
      }
    }
  }, []);

  const syncTimeFromMacd = useCallback(() => {
    if (macdChartRef.current && mainChartRef.current) {
      const macdRange = macdChartRef.current
        .timeScale()
        .getVisibleLogicalRange();
      if (macdRange) {
        mainChartRef.current.timeScale().setVisibleLogicalRange(macdRange);
      }
    }
  }, []);

  useEffect(() => {
    if (!mainChartRef.current || !macdChartRef.current) return;

    mainChartRef.current.subscribeCrosshairMove(handleMainCrosshairMove);
    macdChartRef.current.subscribeCrosshairMove(handleMACDCrosshairMove);

    mainChartRef.current
      .timeScale()
      .subscribeVisibleLogicalRangeChange(syncTimeFromMain);
    macdChartRef.current
      .timeScale()
      .subscribeVisibleLogicalRangeChange(syncTimeFromMacd);

    return () => {
      if (mainChartRef.current) {
        mainChartRef.current.unsubscribeCrosshairMove(handleMainCrosshairMove);
        mainChartRef.current
          .timeScale()
          .unsubscribeVisibleLogicalRangeChange(syncTimeFromMain);
      }

      if (macdChartRef.current) {
        macdChartRef.current.unsubscribeCrosshairMove(handleMACDCrosshairMove);
        macdChartRef.current
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
