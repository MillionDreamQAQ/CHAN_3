import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
} from "lightweight-charts";
import "./ChartContainer.css";
import { getBsPointData } from "../utils/utils";

const ChartContainer = ({ data }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candlestickSeriesRef = useRef(null);
  const lineSeriesListRef = useRef([]);
  const tooltipRef = useRef(null);
  const markersDataRef = useRef([]);
  const seriesMarkersRef = useRef(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 600,
      layout: {
        background: { color: "#ffffff" },
        textColor: "#333",
      },
      grid: {
        vertLines: { color: "#f0f0f0" },
        horzLines: { color: "#f0f0f0" },
      },
      crosshair: {
        mode: 0, // 十字光标模式
      },
      rightPriceScale: {
        borderColor: "#d1d4dc",
      },
      timeScale: {
        borderColor: "#d1d4dc",
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        dateFormat: "yyyy-MM-dd",
      },
    });

    chartRef.current = chart;

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#ef5350",
      downColor: "#26a69a",
      borderVisible: false,
      wickUpColor: "#ef5350",
      wickDownColor: "#26a69a",
    });
    candlestickSeriesRef.current = candlestickSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    chart.subscribeCrosshairMove((param) => {
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

      // 查找当前时间点的 marker
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
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!data || !candlestickSeriesRef.current) return;

    const formatTime = (timeStr) => {
      return timeStr.replace(/\//g, "-");
    };

    const klineData = data.klines.map((k) => ({
      time: formatTime(k.time),
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
    }));

    candlestickSeriesRef.current.setData(klineData);

    lineSeriesListRef.current.forEach((series) => {
      chartRef.current.removeSeries(series);
    });
    lineSeriesListRef.current = [];

    if (data.bi_list && data.bi_list.length > 0 && chartRef.current) {
      data.bi_list.forEach((bi) => {
        const biLineSeries = chartRef.current.addSeries(LineSeries, {
          color: "#3300ffff",
          lineWidth: 1,
          lineStyle: 0,
          priceLineVisible: false,
          lastValueVisible: false,
        });

        biLineSeries.setData([
          { time: formatTime(bi.begin_time), value: bi.begin_value },
          { time: formatTime(bi.end_time), value: bi.end_value },
        ]);

        lineSeriesListRef.current.push(biLineSeries);
      });
    }

    if (data.seg_list && data.seg_list.length > 0 && chartRef.current) {
      data.seg_list.forEach((seg) => {
        const lineSeries = chartRef.current.addSeries(LineSeries, {
          color: "#ff0000ff",
          lineWidth: 2,
          lineStyle: 0,
          priceLineVisible: false,
          lastValueVisible: false,
        });

        lineSeries.setData([
          { time: formatTime(seg.begin_time), value: seg.begin_value },
          { time: formatTime(seg.end_time), value: seg.end_value },
        ]);

        lineSeriesListRef.current.push(lineSeries);
      });
    }

    // 绘制中枢
    if (data.zs_list && data.zs_list.length > 0 && chartRef.current) {
      data.zs_list.forEach((zs) => {
        // 绘制中枢上边线
        const zsTopLine = chartRef.current.addSeries(LineSeries, {
          color: "#000000ff",
          lineWidth: 2,
          lineStyle: 0,
          priceLineVisible: false,
          lastValueVisible: false,
        });

        zsTopLine.setData([
          { time: formatTime(zs.begin_time), value: zs.high },
          { time: formatTime(zs.end_time), value: zs.high },
        ]);

        // 绘制中枢下边线
        const zsBottomLine = chartRef.current.addSeries(LineSeries, {
          color: "#000000ff",
          lineWidth: 2,
          lineStyle: 0,
          priceLineVisible: false,
          lastValueVisible: false,
        });

        zsBottomLine.setData([
          { time: formatTime(zs.begin_time), value: zs.low },
          { time: formatTime(zs.end_time), value: zs.low },
        ]);

        lineSeriesListRef.current.push(zsTopLine, zsBottomLine);
      });
    }

    if (seriesMarkersRef.current) {
      seriesMarkersRef.current.detach();
      seriesMarkersRef.current = null;
    }

    if (data.bs_points && data.bs_points.length > 0) {
      const bsMarkers = data.bs_points.map((bs) => {
        const textData = getBsPointData(bs.type, bs.is_buy);
        return {
          time: formatTime(bs.time),
          position: bs.is_buy ? "belowBar" : "aboveBar",
          color: bs.is_buy ? "#ff0000ff" : "#1bb31bff",
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

    chartRef.current.timeScale().fitContent();
  }, [data]);

  return (
    <div className="chart-container">
      <div className="chart-wrapper" ref={chartContainerRef}>
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
    </div>
  );
};

export default ChartContainer;
