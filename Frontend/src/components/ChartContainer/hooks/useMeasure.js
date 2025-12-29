import { useState, useCallback, useEffect, useRef } from "react";

export const useMeasure = (chartRef, seriesRef, dataRef) => {
  const [measureState, setMeasureState] = useState({
    isActive: false,
    startPoint: null,
    endPoint: null,
    measureInfo: null,
  });
  const [measureRect, setMeasureRect] = useState(null);
  const shiftKeyRef = useRef(false);

  const updateMeasureRect = useCallback(
    (startPoint, endPoint, isUp) => {
      if (!chartRef.current || !seriesRef.current?.candlestick) return;

      const timeScale = chartRef.current.timeScale();
      const x1 = timeScale.timeToCoordinate(startPoint.time);
      const x2 = timeScale.timeToCoordinate(endPoint.time);
      const y1 = seriesRef.current.candlestick.priceToCoordinate(
        startPoint.price
      );
      const y2 = seriesRef.current.candlestick.priceToCoordinate(
        endPoint.price
      );

      if (x1 === null || x2 === null || y1 === null || y2 === null) {
        setMeasureRect(null);
        return;
      }

      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);

      setMeasureRect({ left, top, width, height, isUp });
    },
    [chartRef, seriesRef]
  );

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

  const resetMeasure = useCallback(() => {
    setMeasureRect(null);
    setMeasureState({
      isActive: false,
      startPoint: null,
      endPoint: null,
      measureInfo: null,
    });
  }, []);

  // 键盘事件监听
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Shift") {
        shiftKeyRef.current = true;
      }
      if (e.key === "Escape") {
        handleClearMeasure();
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === "Shift") {
        shiftKeyRef.current = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleClearMeasure]);

  // 图表点击事件
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current?.candlestick) return;

    const handleChartClick = (param) => {
      if (!shiftKeyRef.current) return;
      if (!param.time || !param.point) return;

      const price = seriesRef.current.candlestick.coordinateToPrice(
        param.point.y
      );
      if (price === null) return;

      const klineIndex = dataRef.current.kline.findIndex(
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

    chartRef.current.subscribeClick(handleChartClick);

    return () => {
      if (chartRef.current) {
        chartRef.current.unsubscribeClick(handleChartClick);
      }
    };
  }, [
    chartRef,
    seriesRef,
    dataRef,
    calculateMeasureInfo,
    drawMeasureRect,
    clearMeasureRect,
  ]);

  // 图表缩放时更新测量区域
  useEffect(() => {
    if (!chartRef.current) return;
    if (!measureState.startPoint || !measureState.endPoint) return;

    const updateRect = () => {
      updateMeasureRect(
        measureState.startPoint,
        measureState.endPoint,
        measureState.measureInfo?.isUp ?? true
      );
    };

    chartRef.current.timeScale().subscribeVisibleLogicalRangeChange(updateRect);

    return () => {
      if (chartRef.current) {
        chartRef.current
          .timeScale()
          .unsubscribeVisibleLogicalRangeChange(updateRect);
      }
    };
  }, [
    chartRef,
    measureState.startPoint,
    measureState.endPoint,
    measureState.measureInfo,
    updateMeasureRect,
  ]);

  return {
    measureState,
    measureRect,
    shiftKeyRef,
    handleClearMeasure,
    resetMeasure,
  };
};
