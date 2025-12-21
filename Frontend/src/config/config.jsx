export const COLORS = {
  upColor: "#eb3532",
  downColor: "#1dc36a",
  biLine: "#0048ff",
  segLine: "#ff0000",
  zsLine: "#ffb700",
  buyMarker: "#ff0000",
  sellMarker: "#1bb31b",
  difLine: "#2962FF",
  deaLine: "#FF6D00",
  zeroLine: "#787B86",
  ma5: "#e91e63",
  ma10: "#ff9800",
  ma20: "#00bcd4",
  ma30: "#9c27b0",
};

export const LINE_SERIES_CONFIGS = {
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
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: true,
  },
  dea: {
    color: COLORS.deaLine,
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: true,
  },
  zero: {
    color: COLORS.zeroLine,
    lineWidth: 1,
    lineStyle: 2,
    priceLineVisible: false,
    lastValueVisible: false,
  },
  ma5: {
    color: COLORS.ma5,
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
  },
  ma10: {
    color: COLORS.ma10,
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
  },
  ma20: {
    color: COLORS.ma20,
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
  },
  ma30: {
    color: COLORS.ma30,
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
  },
};

export const FORMAT_CONFIG = {
  volumeThreshold: 100000000,
  volumeDivisor: 10000,
  volumeDivisorLarge: 100000000,
  priceDecimal: 2,
  volumeDecimal: 2,
};

export const CHART_SIZES = {
  mainHeight: 400,
  macdHeight: 150,
};

export const getChartConfig = (
  width,
  height,
  showTimeVisible = true,
  darkMode = false
) => ({
  width,
  height,
  layout: {
    background: { color: darkMode ? "#1a1a1a" : "#ffffff" },
    textColor: darkMode ? "#e0e0e0" : "#333",
  },
  grid: {
    vertLines: { color: darkMode ? "#2a2a2a" : "#f0f0f0" },
    horzLines: { color: darkMode ? "#2a2a2a" : "#f0f0f0" },
  },
  crosshair: {
    mode: 1,
  },
  rightPriceScale: {
    borderColor: darkMode ? "#404040" : "#d1d4dc",
  },
  timeScale: {
    borderColor: darkMode ? "#404040" : "#d1d4dc",
    timeVisible: showTimeVisible,
    secondsVisible: false,
  },
  localization: {
    dateFormat: "yyyy-MM-dd",
  },
});
