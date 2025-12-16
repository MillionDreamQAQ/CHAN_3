import { useEffect, useRef } from "react";
import { createChart } from "lightweight-charts";
import "./ChartContainer.css";

const ChartContainer = ({ data }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candlestickSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const lineSeriesListRef = useRef([]);

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

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: "#ef5350",
      downColor: "#26a69a",
      borderVisible: false,
      wickUpColor: "#ef5350",
      wickDownColor: "#26a69a",
    });
    candlestickSeriesRef.current = candlestickSeries;

    const volumeSeries = chart.addHistogramSeries({
      color: "#26a69a",
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "",
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!data || !candlestickSeriesRef.current || !volumeSeriesRef.current)
      return;

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

    const volumeData = data.klines.map((k) => ({
      time: formatTime(k.time),
      value: k.volume,
      color: k.close >= k.open ? "#ef535080" : "#26a69a80",
    }));

    candlestickSeriesRef.current.setData(klineData);
    volumeSeriesRef.current.setData(volumeData);

    lineSeriesListRef.current.forEach((series) => {
      chartRef.current.removeSeries(series);
    });
    lineSeriesListRef.current = [];

    if (data.bi_list && data.bi_list.length > 0 && chartRef.current) {
      data.bi_list.forEach((bi) => {
        const biLineSeries = chartRef.current.addLineSeries({
          color: bi.direction === "up" ? "#ef5350" : "#26a69a",
          lineWidth: 1,
          lineStyle: 0, // 实线
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
        const lineSeries = chartRef.current.addLineSeries({
          color: seg.direction === "up" ? "#2196F3" : "#FF9800",
          lineWidth: 2,
          lineStyle: 0,
        });

        lineSeries.setData([
          { time: formatTime(seg.begin_time), value: seg.begin_value },
          { time: formatTime(seg.end_time), value: seg.end_value },
        ]);

        lineSeriesListRef.current.push(lineSeries);
      });
    }

    if (data.bs_points && data.bs_points.length > 0) {
      const bsMarkers = data.bs_points.map((bs) => ({
        time: formatTime(bs.time),
        position: bs.is_buy ? "belowBar" : "aboveBar",
        color: bs.is_buy ? "#00ff00" : "#ff0000",
        shape: bs.is_buy ? "arrowUp" : "arrowDown",
        text: bs.type,
        size: 2,
      }));

      bsMarkers.sort((a, b) => new Date(a.time) - new Date(b.time));
      candlestickSeriesRef.current.setMarkers(bsMarkers);
    }

    chartRef.current.timeScale().fitContent();
  }, [data]);

  return (
    <div className="chart-container">
      <div className="chart-wrapper" ref={chartContainerRef} />
    </div>
  );
};

export default ChartContainer;
