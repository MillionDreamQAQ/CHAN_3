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
  ma5: "#EB2E00",
  ma10: "#EABC01",
  ma20: "#14EB00",
  ma30: "#017EEB",
};

export const getColors = (isDarkMode = false) => {
  if (!isDarkMode) {
    return BASE_COLORS;
  }

  return {
    upColor: generate(BASE_COLORS.upColor, {
      theme: "dark",
      backgroundColor: "#1a1a1a",
    })[5],
    downColor: generate(BASE_COLORS.downColor, {
      theme: "dark",
      backgroundColor: "#1a1a1a",
    })[5],
    biLine: generate(BASE_COLORS.biLine, {
      theme: "dark",
      backgroundColor: "#1a1a1a",
    })[5],
    segLine: generate(BASE_COLORS.segLine, {
      theme: "dark",
      backgroundColor: "#1a1a1a",
    })[5],
    zsLine: generate(BASE_COLORS.zsLine, {
      theme: "dark",
      backgroundColor: "#1a1a1a",
    })[5],
    difLine: generate(BASE_COLORS.difLine, {
      theme: "dark",
      backgroundColor: "#1a1a1a",
    })[5],
    deaLine: generate(BASE_COLORS.deaLine, {
      theme: "dark",
      backgroundColor: "#1a1a1a",
    })[5],
    zeroLine: generate(BASE_COLORS.zeroLine, {
      theme: "dark",
      backgroundColor: "#1a1a1a",
    })[5],
    ma5: generate(BASE_COLORS.ma5, {
      theme: "dark",
      backgroundColor: "#1a1a1a",
    })[5],
    ma10: generate(BASE_COLORS.ma10, {
      theme: "dark",
      backgroundColor: "#1a1a1a",
    })[5],
    ma20: generate(BASE_COLORS.ma20, {
      theme: "dark",
      backgroundColor: "#1a1a1a",
    })[5],
    ma30: generate(BASE_COLORS.ma30, {
      theme: "dark",
      backgroundColor: "#1a1a1a",
    })[5],
  };
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
    ma5: {
      color: colors.ma5,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    },
    ma10: {
      color: colors.ma10,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    },
    ma20: {
      color: colors.ma20,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    },
    ma30: {
      color: colors.ma30,
      lineWidth: 1,
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
