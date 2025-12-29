import { useCallback, useEffect } from "react";

export const useChartSync = (mainChartRef, macdChartRef, seriesRef) => {
  // 主图十字线移动时同步 MACD 图
  const handleMainCrosshairMove = useCallback(
    (param) => {
      if (param.time && seriesRef.current?.histogram && macdChartRef.current) {
        const macdHistogramData = seriesRef.current.histogram.dataByIndex(
          param.logical
        );

        if (macdHistogramData) {
          macdChartRef.current.setCrosshairPosition(
            macdHistogramData.value,
            param.time,
            seriesRef.current.histogram
          );
        }
      } else if (macdChartRef.current) {
        macdChartRef.current.clearCrosshairPosition();
      }
    },
    [macdChartRef, seriesRef]
  );

  // MACD 图十字线移动时同步主图
  const handleMACDCrosshairMove = useCallback(
    (param) => {
      if (
        param.time &&
        seriesRef.current?.candlestick &&
        mainChartRef.current
      ) {
        const klineData = seriesRef.current.candlestick.dataByIndex(
          param.logical
        );

        if (klineData) {
          mainChartRef.current.setCrosshairPosition(
            klineData.close,
            param.time,
            seriesRef.current.candlestick
          );
        }
      } else if (mainChartRef.current) {
        mainChartRef.current.clearCrosshairPosition();
      }
    },
    [mainChartRef, seriesRef]
  );

  // 从主图同步时间轴到 MACD 图
  const syncTimeFromMain = useCallback(() => {
    if (mainChartRef.current && macdChartRef.current) {
      const mainRange = mainChartRef.current
        .timeScale()
        .getVisibleLogicalRange();
      if (mainRange) {
        macdChartRef.current.timeScale().setVisibleLogicalRange(mainRange);
      }
    }
  }, [mainChartRef, macdChartRef]);

  // 从 MACD 图同步时间轴到主图
  const syncTimeFromMacd = useCallback(() => {
    if (macdChartRef.current && mainChartRef.current) {
      const macdRange = macdChartRef.current
        .timeScale()
        .getVisibleLogicalRange();
      if (macdRange) {
        mainChartRef.current.timeScale().setVisibleLogicalRange(macdRange);
      }
    }
  }, [mainChartRef, macdChartRef]);

  // 订阅图表同步事件
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
    mainChartRef,
    macdChartRef,
    handleMainCrosshairMove,
    handleMACDCrosshairMove,
    syncTimeFromMain,
    syncTimeFromMacd,
  ]);
};
