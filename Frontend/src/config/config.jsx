import { generate } from "@ant-design/colors";

const BASE_COLORS = {
  upColor: "#F03F31",
  downColor: "#24a03b",
  biLine: "#0048ff",
  segLine: "#ff0000",
  zsLine: "#ffb700",
  difLine: "#2962FF",
  deaLine: "#FF6D00",
  zeroLine: "#787B86",
};

export const MA_TYPES = {
  MA: "ma",
  EMA: "ema",
};

export const MOVING_AVERAGE_PERIODS = [5, 10, 20, 30];

export const MA_COLORS = {
  5: "#EB2E00",
  10: "#EABC01",
  20: "#24a03b",
  30: "#017EEB",
};

export const INDICATOR_CATEGORIES = {
  MOVING_AVERAGE: "movingAverage",
  CHAN: "chan",
};

export const getDefaultIndicators = () => ({
  maType: MA_TYPES.EMA,
  maPeriods: {
    5: true,
    10: true,
    20: false,
    30: false,
  },
  bi: true,
  seg: true,
  zs: true,
  bsPoints: true,
});

export const generateMASeriesConfigs = (
  periods,
  colors,
  isDarkMode = false
) => {
  const configs = {};
  periods.forEach((period) => {
    const baseColor = colors[period];
    const color = isDarkMode
      ? generate(baseColor, { theme: "dark", backgroundColor: "#1a1a1a" })[5]
      : baseColor;
    configs[period] = {
      color,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    };
  });
  return configs;
};

export const getColors = (isDarkMode = false) => {
  if (!isDarkMode) {
    return { ...BASE_COLORS, ...MA_COLORS };
  }

  const darkColors = {};
  Object.entries(BASE_COLORS).forEach(([key, color]) => {
    darkColors[key] = generate(color, {
      theme: "dark",
      backgroundColor: "#1a1a1a",
    })[5];
  });

  // 均线颜色
  Object.entries(MA_COLORS).forEach(([period, color]) => {
    darkColors[period] = generate(color, {
      theme: "dark",
      backgroundColor: "#1a1a1a",
    })[5];
  });

  return darkColors;
};

export const COLORS = BASE_COLORS;

export const getLineSeriesConfigs = (isDarkMode = false) => {
  const colors = getColors(isDarkMode);

  return {
    bi: {
      color: colors.biLine,
      lineWidth: 1,
      lineStyle: 0,
      priceLineVisible: false,
      lastValueVisible: false,
    },
    seg: {
      color: colors.segLine,
      lineWidth: 2,
      lineStyle: 0,
      priceLineVisible: false,
      lastValueVisible: false,
    },
    zs: {
      color: colors.zsLine,
      lineWidth: 2,
      lineStyle: 0,
      priceLineVisible: false,
      lastValueVisible: false,
    },
    dif: {
      color: colors.difLine,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    },
    dea: {
      color: colors.deaLine,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    },
    zero: {
      color: colors.zeroLine,
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    },
  };
};

export const LINE_SERIES_CONFIGS = getLineSeriesConfigs(false);

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
    mode: 0,
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
