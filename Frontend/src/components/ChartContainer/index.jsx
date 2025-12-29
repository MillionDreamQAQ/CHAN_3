import { useEffect, useRef, useState, useMemo, memo } from "react";
import {
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
} from "../../utils/utils";
import { getColors, getLineSeriesConfigs } from "../../config/config";

import { useMeasure, useChartSync, useChartInit } from "./hooks";
import { KlineInfoPanel, MeasureInfoPanel, ChartTooltip } from "./components";

const ChartContainer = ({ data, darkMode = false, indicators = {} }) => {
  const [loading, setLoading] = useState(true);
  const [klineInfo, setKlineInfo] = useState(null);

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

  // 初始化图表
  useChartInit(
    containerRefs,
    chartRefs,
    seriesRefs,
    dataRefs,
    COLORS,
    setKlineInfo,
    setLoading
  );

  // 图表同步
  useChartSync(
    { current: chartRefs.current.main },
    { current: chartRefs.current.macd },
    seriesRefs
  );

  // 测量功能
  const {
    measureState,
    measureRect,
    shiftKeyRef,
    handleClearMeasure,
    resetMeasure,
  } = useMeasure({ current: chartRefs.current.main }, seriesRefs, dataRefs);

  // 更新光标样式
  useEffect(() => {
    const updateCursor = () => {
      if (containerRefs.current.main) {
        containerRefs.current.main.style.cursor = shiftKeyRef.current
          ? "crosshair"
          : "default";
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Shift") updateCursor();
    };
    const handleKeyUp = (e) => {
      if (e.key === "Shift") updateCursor();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [shiftKeyRef]);

  // 辅助函数：添加线段系列
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

  // K线数据
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

  // 主题切换
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

    // 更新线段颜色
    seriesRefs.current.bi.forEach((series) => {
      series.applyOptions({ color: LINE_SERIES_CONFIGS.bi.color });
    });
    seriesRefs.current.seg.forEach((series) => {
      series.applyOptions({ color: LINE_SERIES_CONFIGS.seg.color });
    });
    seriesRefs.current.zs.forEach((series) => {
      series.applyOptions({ color: LINE_SERIES_CONFIGS.zs.color });
    });

    // 更新 MA 颜色
    const maKeys = ["ma5", "ma10", "ma20", "ma30"];
    maKeys.forEach((key) => {
      if (seriesRefs.current.ma[key]) {
        seriesRefs.current.ma[key].applyOptions({
          color: LINE_SERIES_CONFIGS[key].color,
        });
      }
    });

    // 更新 MACD 颜色
    if (seriesRefs.current.macdList.length > 0) {
      const [histogram, dif, dea, zero] = seriesRefs.current.macdList;
      if (histogram) histogram.applyOptions({ color: COLORS.downColor });
      if (dif) dif.applyOptions({ color: LINE_SERIES_CONFIGS.dif.color });
      if (dea) dea.applyOptions({ color: LINE_SERIES_CONFIGS.dea.color });
      if (zero) zero.applyOptions({ color: LINE_SERIES_CONFIGS.zero.color });
    }

    // 更新买卖点标记颜色
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

  // 数据更新
  useEffect(() => {
    if (!data || !seriesRefs.current.candlestick || !chartRefs.current.main)
      return;

    setLoading(true);
    resetMeasure();

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

    // 设置初始 K 线信息
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

    // 清除旧系列
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

    // 添加笔
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

    // 添加线段
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

    // 添加中枢
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

    // 添加均线
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

    // 添加买卖点
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

    // 添加 MACD
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
  }, [data, klineData, resetMeasure]);

  // 指标可见性控制 - 合并为单个 useEffect
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
    if (seriesRefs.current.markers) {
      if (indicators.bsPoints) {
        seriesRefs.current.markers._private__attach();
      } else {
        seriesRefs.current.markers.detach();
      }
    }
  }, [indicators.bsPoints]);

  // MA 指标可见性 - 合并处理
  useEffect(() => {
    const maKeys = ["ma5", "ma10", "ma20", "ma30"];
    maKeys.forEach((key) => {
      if (seriesRefs.current.ma[key]) {
        seriesRefs.current.ma[key].applyOptions({ visible: indicators[key] });
      }
    });
  }, [indicators.ma5, indicators.ma10, indicators.ma20, indicators.ma30]);

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
        <KlineInfoPanel klineInfo={klineInfo} />
        <ChartTooltip ref={(el) => (containerRefs.current.tooltip = el)} />
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
        <MeasureInfoPanel
          measureInfo={measureState.measureInfo}
          onClose={handleClearMeasure}
        />
      </div>
      <div
        className="macd-wrapper"
        ref={(el) => (containerRefs.current.macd = el)}
      />
    </div>
  );
};

export default memo(ChartContainer);
