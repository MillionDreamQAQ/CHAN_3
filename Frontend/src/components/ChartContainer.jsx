import { useEffect, useRef, useState, useMemo, useCallback, memo } from "react";
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
  calculateMA,
  convertToUnixTimestamp,
  MACD_CONFIG,
} from "../utils/utils";
import {
  getColors,
  getLineSeriesConfigs,
  CHART_SIZES,
  FORMAT_CONFIG,
  getChartConfig,
} from "../config/config";

const ChartContainer = ({ data, darkMode = false, indicators = {} }) => {
  const [loading, setLoading] = useState(true);
  const [klineInfo, setKlineInfo] = useState(null);
  const [measureState, setMeasureState] = useState({
    isActive: false,
    startPoint: null,
    endPoint: null,
    measureInfo: null,
  });
  const [measureRect, setMeasureRect] = useState(null);

  const shiftKeyRef = useRef(false);

  const COLORS = useMemo(() => getColors(darkMode), [darkMode]);
  const LINE_SERIES_CONFIGS = useMemo(
    () => getLineSeriesConfigs(darkMode),
    [darkMode]
  );

  const containerRefs = useRef({
    main: null,
    macd: null,
    tooltip: null,
  });

  const chartRefs = useRef({
    main: null,
    macd: null,
  });

  const seriesRefs = useRef({
    candlestick: null,
    volume: null,
    bi: [],
    seg: [],
    zs: [],
    macdList: [],
    histogram: null,
    markers: null,
    ma: {},
  });

  const dataRefs = useRef({
    kline: [],
    markers: [],
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
        true,
        false
      )
    );
    chartRefs.current.main = mainChart;

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

    const candlestickSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: COLORS.upColor,
      downColor: COLORS.downColor,
      borderVisible: false,
      wickUpColor: COLORS.upColor,
      wickDownColor: COLORS.downColor,
    });
    seriesRefs.current.candlestick = candlestickSeries;

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
            prevClose: prevKline?.close || lastKline.open,
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

  useEffect(() => {
    if (!chartRefs.current.main || !chartRefs.current.macd) return;

    const themeOptions = {
      layout: {
        background: { color: darkMode ? "#1a1a1a" : "#ffffff" },
        textColor: darkMode ? "#e0e0e0" : "#333",
      },
      grid: {
        vertLines: { color: darkMode ? "#2a2a2a" : "#f0f0f0" },
        horzLines: { color: darkMode ? "#2a2a2a" : "#f0f0f0" },
      },
      rightPriceScale: {
        borderColor: darkMode ? "#404040" : "#d1d4dc",
      },
      timeScale: {
        borderColor: darkMode ? "#404040" : "#d1d4dc",
      },
    };

    chartRefs.current.main.applyOptions(themeOptions);
    chartRefs.current.macd.applyOptions(themeOptions);

    if (seriesRefs.current.candlestick) {
      seriesRefs.current.candlestick.applyOptions({
        upColor: COLORS.upColor,
        downColor: COLORS.downColor,
        wickUpColor: COLORS.upColor,
        wickDownColor: COLORS.downColor,
      });
    }

    if (seriesRefs.current.volume && dataRefs.current.kline.length > 0) {
      const volumeData = dataRefs.current.kline.map((k) => ({
        time: k.time,
        value: k.volume,
        color:
          k.close >= k.open ? `${COLORS.upColor}4d` : `${COLORS.downColor}4d`,
      }));
      seriesRefs.current.volume.setData(volumeData);
    }

    seriesRefs.current.bi.forEach((series) => {
      series.applyOptions({ color: LINE_SERIES_CONFIGS.bi.color });
    });
    seriesRefs.current.seg.forEach((series) => {
      series.applyOptions({ color: LINE_SERIES_CONFIGS.seg.color });
    });
    seriesRefs.current.zs.forEach((series) => {
      series.applyOptions({ color: LINE_SERIES_CONFIGS.zs.color });
    });

    if (seriesRefs.current.ma.ma5) {
      seriesRefs.current.ma.ma5.applyOptions({
        color: LINE_SERIES_CONFIGS.ma5.color,
      });
    }
    if (seriesRefs.current.ma.ma10) {
      seriesRefs.current.ma.ma10.applyOptions({
        color: LINE_SERIES_CONFIGS.ma10.color,
      });
    }
    if (seriesRefs.current.ma.ma20) {
      seriesRefs.current.ma.ma20.applyOptions({
        color: LINE_SERIES_CONFIGS.ma20.color,
      });
    }
    if (seriesRefs.current.ma.ma30) {
      seriesRefs.current.ma.ma30.applyOptions({
        color: LINE_SERIES_CONFIGS.ma30.color,
      });
    }

    if (seriesRefs.current.macdList.length > 0) {
      const [histogram, dif, dea, zero] = seriesRefs.current.macdList;
      if (histogram) {
        histogram.applyOptions({ color: COLORS.downColor });
      }
      if (dif) {
        dif.applyOptions({ color: LINE_SERIES_CONFIGS.dif.color });
      }
      if (dea) {
        dea.applyOptions({ color: LINE_SERIES_CONFIGS.dea.color });
      }
      if (zero) {
        zero.applyOptions({ color: LINE_SERIES_CONFIGS.zero.color });
      }
    }

    if (dataRefs.current.markers.length > 0 && seriesRefs.current.candlestick) {
      const updatedMarkers = dataRefs.current.markers.map((marker) => ({
        ...marker,
        color: marker.shape === "arrowUp" ? COLORS.upColor : COLORS.downColor,
      }));
      dataRefs.current.markers = updatedMarkers;

      if (seriesRefs.current.markers) {
        seriesRefs.current.markers.detach();
      }
      seriesRefs.current.markers = createSeriesMarkers(
        seriesRefs.current.candlestick,
        updatedMarkers
      );
      if (seriesRefs.current.markers && indicators.bsPoints) {
        seriesRefs.current.markers._private__attach();
      }
    }
  }, [darkMode, COLORS, LINE_SERIES_CONFIGS, indicators.bsPoints]);

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
    if (!data || !seriesRefs.current.candlestick || !chartRefs.current.main)
      return;

    setLoading(true);

    setMeasureRect(null);
    setMeasureState({
      isActive: false,
      startPoint: null,
      endPoint: null,
      measureInfo: null,
    });

    dataRefs.current.kline = klineData;
    seriesRefs.current.candlestick.setData(klineData);

    if (seriesRefs.current.volume) {
      const volumeData = klineData.map((k) => ({
        time: k.time,
        value: k.volume,
        color:
          k.close >= k.open ? `${COLORS.upColor}4d` : `${COLORS.downColor}4d`,
      }));
      seriesRefs.current.volume.setData(volumeData);
    }

    if (klineData.length > 0) {
      const lastIndex = klineData.length - 1;
      const lastKline = klineData[lastIndex];
      const prevKline = lastIndex > 0 ? klineData[lastIndex - 1] : null;
      setKlineInfo({
        time: lastKline.time,
        open: lastKline.open,
        high: lastKline.high,
        low: lastKline.low,
        close: lastKline.close,
        volume: lastKline.volume || 0,
        prevClose: prevKline?.close || lastKline.open,
      });
    }

    seriesRefs.current.bi.forEach((s) =>
      chartRefs.current.main.removeSeries(s)
    );
    seriesRefs.current.seg.forEach((s) =>
      chartRefs.current.main.removeSeries(s)
    );
    seriesRefs.current.zs.forEach((s) =>
      chartRefs.current.main.removeSeries(s)
    );
    Object.values(seriesRefs.current.ma).forEach((s) => {
      if (s) chartRefs.current.main.removeSeries(s);
    });
    if (seriesRefs.current.markers) {
      seriesRefs.current.markers.detach();
    }

    seriesRefs.current.bi = [];
    seriesRefs.current.seg = [];
    seriesRefs.current.zs = [];
    seriesRefs.current.ma = {};
    seriesRefs.current.markers = null;

    if (data.bi_list) {
      seriesRefs.current.bi = addLineSegments(
        chartRefs.current.main,
        data.bi_list,
        { ...LINE_SERIES_CONFIGS.bi, visible: indicators.bi },
        convertToUnixTimestamp,
        (bi, convertTime) => [
          { time: convertTime(bi.begin_time), value: bi.begin_value },
          { time: convertTime(bi.end_time), value: bi.end_value },
        ]
      );
    }

    if (data.seg_list) {
      seriesRefs.current.seg = addLineSegments(
        chartRefs.current.main,
        data.seg_list,
        { ...LINE_SERIES_CONFIGS.seg, visible: indicators.seg },
        convertToUnixTimestamp,
        (seg, convertTime) => [
          { time: convertTime(seg.begin_time), value: seg.begin_value },
          { time: convertTime(seg.end_time), value: seg.end_value },
        ]
      );
    }

    if (data.zs_list && data.zs_list.length > 0) {
      const zsSeries = [];
      data.zs_list.forEach((zs) => {
        const zsTopSeries = addLineSegments(
          chartRefs.current.main,
          [zs],
          { ...LINE_SERIES_CONFIGS.zs, visible: indicators.zs },
          convertToUnixTimestamp,
          (item, convertTime) => [
            { time: convertTime(item.begin_time), value: item.high },
            { time: convertTime(item.end_time), value: item.high },
          ]
        );
        const zsBottomSeries = addLineSegments(
          chartRefs.current.main,
          [zs],
          { ...LINE_SERIES_CONFIGS.zs, visible: indicators.zs },
          convertToUnixTimestamp,
          (item, convertTime) => [
            { time: convertTime(item.begin_time), value: item.low },
            { time: convertTime(item.end_time), value: item.low },
          ]
        );
        zsSeries.push(...zsTopSeries, ...zsBottomSeries);
      });
      seriesRefs.current.zs = zsSeries;
    }

    if (data.klines && data.klines.length > 0) {
      const maPeriods = [
        { key: "ma5", period: 5, config: LINE_SERIES_CONFIGS.ma5 },
        { key: "ma10", period: 10, config: LINE_SERIES_CONFIGS.ma10 },
        { key: "ma20", period: 20, config: LINE_SERIES_CONFIGS.ma20 },
        { key: "ma30", period: 30, config: LINE_SERIES_CONFIGS.ma30 },
      ];

      maPeriods.forEach(({ key, period, config }) => {
        const maData = calculateMA(data.klines, period);
        if (maData.length > 0) {
          const maSeries = chartRefs.current.main.addSeries(LineSeries, {
            ...config,
            visible: indicators[key],
          });
          maSeries.setData(maData);
          seriesRefs.current.ma[key] = maSeries;
        }
      });
    }

    if (data.bs_points && data.bs_points.length > 0) {
      const bsMarkers = data.bs_points.map((bs) => {
        const textData = getBsPointData(bs.type, bs.is_buy);
        return {
          time: convertToUnixTimestamp(bs.time),
          position: bs.is_buy ? "belowBar" : "aboveBar",
          color: bs.is_buy ? COLORS.upColor : COLORS.downColor,
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
      if (seriesRefs.current.markers) {
        seriesRefs.current.markers.applyOptions({
          visible: indicators.bsPoints,
        });
      }
    }

    if (chartRefs.current.macd) {
      seriesRefs.current.macdList.forEach((series) => {
        chartRefs.current.macd.removeSeries(series);
      });
      seriesRefs.current.macdList = [];

      if (data.klines && data.klines.length >= MACD_CONFIG.minDataLength) {
        const macdData = calculateMACD(data.klines, COLORS);

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

  useEffect(() => {
    seriesRefs.current.bi.forEach((series) => {
      series.applyOptions({ visible: indicators.bi });
    });
  }, [indicators.bi]);

  useEffect(() => {
    seriesRefs.current.seg.forEach((series) => {
      series.applyOptions({ visible: indicators.seg });
    });
  }, [indicators.seg]);

  useEffect(() => {
    seriesRefs.current.zs.forEach((series) => {
      series.applyOptions({ visible: indicators.zs });
    });
  }, [indicators.zs]);

  useEffect(() => {
    // apply options not work, use _private__attach and detach instead
    if (seriesRefs.current.markers) {
      if (indicators.bsPoints) {
        seriesRefs.current.markers._private__attach();
      } else {
        seriesRefs.current.markers.detach();
      }
      // seriesRefs.current.markers.applyOptions({ visible: indicators.bsPoints });
    }
  }, [indicators.bsPoints]);

  useEffect(() => {
    if (seriesRefs.current.ma.ma5) {
      seriesRefs.current.ma.ma5.applyOptions({ visible: indicators.ma5 });
    }
  }, [indicators.ma5]);

  useEffect(() => {
    if (seriesRefs.current.ma.ma10) {
      seriesRefs.current.ma.ma10.applyOptions({ visible: indicators.ma10 });
    }
  }, [indicators.ma10]);

  useEffect(() => {
    if (seriesRefs.current.ma.ma20) {
      seriesRefs.current.ma.ma20.applyOptions({ visible: indicators.ma20 });
    }
  }, [indicators.ma20]);

  useEffect(() => {
    if (seriesRefs.current.ma.ma30) {
      seriesRefs.current.ma.ma30.applyOptions({ visible: indicators.ma30 });
    }
  }, [indicators.ma30]);

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

  const updateMeasureRect = useCallback((startPoint, endPoint, isUp) => {
    if (!chartRefs.current.main || !seriesRefs.current.candlestick) return;

    const timeScale = chartRefs.current.main.timeScale();
    const x1 = timeScale.timeToCoordinate(startPoint.time);
    const x2 = timeScale.timeToCoordinate(endPoint.time);
    const y1 = seriesRefs.current.candlestick.priceToCoordinate(
      startPoint.price
    );
    const y2 = seriesRefs.current.candlestick.priceToCoordinate(endPoint.price);

    if (x1 === null || x2 === null || y1 === null || y2 === null) {
      setMeasureRect(null);
      return;
    }

    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);

    setMeasureRect({ left, top, width, height, isUp });
  }, []);

  const clearMeasureRect = useCallback(() => {
    setMeasureRect(null);
  }, []);

  const calculateMeasureInfo = useCallback((startPoint, endPoint) => {
    const priceDiff = endPoint.price - startPoint.price;
    const priceChangePercent = (priceDiff / startPoint.price) * 100;
    const isUp = priceDiff >= 0;

    const startIdx = startPoint.klineIndex;
    const endIdx = endPoint.klineIndex;
    const klineCount = Math.abs(endIdx - startIdx) + 1;

    const startTime = startPoint.time;
    const endTime = endPoint.time;
    const timeDiffSeconds = Math.abs(endTime - startTime);
    const timeDiffDays = Math.floor(timeDiffSeconds / (24 * 60 * 60));
    const timeDiffHours = Math.floor(timeDiffSeconds / (60 * 60));
    const timeDiffMinutes = Math.floor(timeDiffSeconds / 60);

    let timeSpan = "";
    let timeSpanUnit = "";
    if (timeDiffDays > 0) {
      timeSpan = `${timeDiffDays}`;
      timeSpanUnit = "天";
    } else if (timeDiffHours > 0) {
      timeSpan = `${timeDiffHours}`;
      timeSpanUnit = "小时";
    } else {
      timeSpan = `${timeDiffMinutes}`;
      timeSpanUnit = "分钟";
    }

    const formatTime = (timestamp) => {
      const date = new Date(timestamp * 1000);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours() - 8).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    };

    return {
      startTime: formatTime(startTime),
      endTime: formatTime(endTime),
      startPrice: startPoint.price,
      endPrice: endPoint.price,
      priceDiff,
      priceChangePercent,
      klineCount,
      timeSpan,
      timeSpanUnit,
      isUp,
    };
  }, []);

  const drawMeasureRect = useCallback(
    (startPoint, endPoint, measureInfo) => {
      updateMeasureRect(startPoint, endPoint, measureInfo.isUp);
    },
    [updateMeasureRect]
  );

  const handleClearMeasure = useCallback(() => {
    clearMeasureRect();
    setMeasureState({
      isActive: false,
      startPoint: null,
      endPoint: null,
      measureInfo: null,
    });
  }, [clearMeasureRect]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Shift") {
        shiftKeyRef.current = true;
        if (containerRefs.current.main) {
          containerRefs.current.main.style.cursor = "crosshair";
        }
      }
      if (e.key === "Escape") {
        handleClearMeasure();
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === "Shift") {
        shiftKeyRef.current = false;
        if (containerRefs.current.main) {
          containerRefs.current.main.style.cursor = "default";
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleClearMeasure]);

  useEffect(() => {
    if (!chartRefs.current.main || !seriesRefs.current.candlestick) return;

    const handleChartClick = (param) => {
      if (!shiftKeyRef.current) return;
      if (!param.time || !param.point) return;

      const price = seriesRefs.current.candlestick.coordinateToPrice(
        param.point.y
      );
      if (price === null) return;

      const klineIndex = dataRefs.current.kline.findIndex(
        (k) => k.time === param.time
      );

      const clickedPoint = {
        time: param.time,
        price: price,
        klineIndex: klineIndex >= 0 ? klineIndex : 0,
      };

      setMeasureState((prev) => {
        if (!prev.startPoint) {
          clearMeasureRect();
          return {
            isActive: true,
            startPoint: clickedPoint,
            endPoint: null,
            measureInfo: null,
          };
        } else {
          const measureInfo = calculateMeasureInfo(
            prev.startPoint,
            clickedPoint
          );
          drawMeasureRect(prev.startPoint, clickedPoint, measureInfo);
          return {
            isActive: false,
            startPoint: prev.startPoint,
            endPoint: clickedPoint,
            measureInfo: measureInfo,
          };
        }
      });
    };

    chartRefs.current.main.subscribeClick(handleChartClick);

    return () => {
      if (chartRefs.current.main) {
        chartRefs.current.main.unsubscribeClick(handleChartClick);
      }
    };
  }, [calculateMeasureInfo, drawMeasureRect, clearMeasureRect]);

  useEffect(() => {
    if (!chartRefs.current.main) return;
    if (!measureState.startPoint || !measureState.endPoint) return;

    const updateRect = () => {
      updateMeasureRect(
        measureState.startPoint,
        measureState.endPoint,
        measureState.measureInfo?.isUp ?? true
      );
    };

    chartRefs.current.main
      .timeScale()
      .subscribeVisibleLogicalRangeChange(updateRect);

    return () => {
      if (chartRefs.current.main) {
        chartRefs.current.main
          .timeScale()
          .unsubscribeVisibleLogicalRangeChange(updateRect);
      }
    };
  }, [
    measureState.startPoint,
    measureState.endPoint,
    measureState.measureInfo,
    updateMeasureRect,
  ]);

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
            <div className="kline-info-left">
              <div
                className={`kline-info-close ${
                  klineInfo.close >= klineInfo.prevClose
                    ? "kline-info-up"
                    : "kline-info-down"
                }`}
              >
                {klineInfo.close.toFixed(FORMAT_CONFIG.priceDecimal)}
              </div>
              <div className="kline-info-change-row">
                <span
                  className={`kline-info-change-value ${
                    klineInfo.close >= klineInfo.prevClose
                      ? "kline-info-up"
                      : "kline-info-down"
                  }`}
                >
                  {klineInfo.close >= klineInfo.prevClose ? "+" : ""}
                  {(klineInfo.close - klineInfo.prevClose).toFixed(
                    FORMAT_CONFIG.priceDecimal
                  )}
                </span>
                <span
                  className={`kline-info-change-value ${
                    klineInfo.close >= klineInfo.prevClose
                      ? "kline-info-up"
                      : "kline-info-down"
                  }`}
                >
                  {klineInfo.close >= klineInfo.prevClose ? "+" : ""}
                  {(
                    ((klineInfo.close - klineInfo.prevClose) /
                      klineInfo.prevClose) *
                    100
                  ).toFixed(2)}
                  %
                </span>
              </div>
            </div>
            <div className="kline-info-right">
              <div className="kline-info-item">
                <span className="kline-info-label">开</span>
                <span
                  className={`kline-info-value ${
                    klineInfo.open >= klineInfo.prevClose
                      ? "kline-info-up"
                      : "kline-info-down"
                  }`}
                >
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
        {measureRect && (
          <div
            className={`measure-rect ${measureRect.isUp ? "up" : "down"}`}
            style={{
              left: measureRect.left,
              top: measureRect.top,
              width: measureRect.width,
              height: measureRect.height,
            }}
          />
        )}
        {measureState.startPoint && !measureState.endPoint && (
          <div className="measure-hint">按住 Shift 点击第二个点完成测量</div>
        )}
        {measureState.measureInfo && (
          <div className="measure-info-panel">
            <div className="measure-info-header">
              <span className="measure-title">区间测量</span>
              <button
                className="measure-close-btn"
                onClick={handleClearMeasure}
                title="清除测量"
              >
                ×
              </button>
            </div>
            <div className="measure-info-body">
              <div className="measure-row">
                <span className="measure-label">价格差</span>
                <span
                  className={`measure-value ${
                    measureState.measureInfo.isUp ? "up" : "down"
                  }`}
                >
                  {measureState.measureInfo.isUp ? "+" : ""}
                  {measureState.measureInfo.priceDiff.toFixed(
                    FORMAT_CONFIG.priceDecimal
                  )}
                </span>
              </div>
              <div className="measure-row">
                <span className="measure-label">涨跌幅</span>
                <span
                  className={`measure-value ${
                    measureState.measureInfo.isUp ? "up" : "down"
                  }`}
                >
                  {measureState.measureInfo.isUp ? "+" : ""}
                  {measureState.measureInfo.priceChangePercent.toFixed(2)}%
                </span>
              </div>
              <div className="measure-row">
                <span className="measure-label">K线数</span>
                <span className="measure-value">
                  {measureState.measureInfo.klineCount} 根
                </span>
              </div>
              <div className="measure-row">
                <span className="measure-label">时间跨度</span>
                <span className="measure-value">
                  {measureState.measureInfo.timeSpan}{" "}
                  {measureState.measureInfo.timeSpanUnit}
                </span>
              </div>
              <div className="measure-divider"></div>
              <div className="measure-row time-row">
                <span className="measure-label">起点</span>
                <span className="measure-value-small">
                  {measureState.measureInfo.startTime} @{" "}
                  {measureState.measureInfo.startPrice.toFixed(
                    FORMAT_CONFIG.priceDecimal
                  )}
                </span>
              </div>
              <div className="measure-row time-row">
                <span className="measure-label">终点</span>
                <span className="measure-value-small">
                  {measureState.measureInfo.endTime} @{" "}
                  {measureState.measureInfo.endPrice.toFixed(
                    FORMAT_CONFIG.priceDecimal
                  )}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
      <div
        className="macd-wrapper"
        ref={(el) => (containerRefs.current.macd = el)}
      />
    </div>
  );
};

export default memo(ChartContainer);
