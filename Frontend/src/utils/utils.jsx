import { MACD, SMA } from "technicalindicators";
import { COLORS } from "../config/config";
import dayjs from "dayjs";

export const MACD_CONFIG = {
  fastPeriod: 12,
  slowPeriod: 26,
  signalPeriod: 9,
  minDataLength: 26,
  histogramMultiplier: 2,
};

export const TIME_CONVERSION = {
  hourOffset: 8,
};

/**
 * 将时间字符串转换为 Unix 时间戳
 * @param {string} timeStr - 时间字符串
 * @returns {number} Unix 时间戳
 */
export const convertToUnixTimestamp = (timeStr) => {
  return dayjs(timeStr).add(TIME_CONVERSION.hourOffset, "hour").unix();
};

export function showMessage(api, key, type, content, duration) {
  api.open({
    key,
    type: type,
    content: content,
    duration: duration,
  });
}

/**
 * 计算 MACD 指标
 * @param {Array} klines - K线数据数组
 * @returns {Object} 包含 dif、dea、histogram 的对象
 */
export const calculateMACD = (klines) => {
  try {
    if (!klines || klines.length < MACD_CONFIG.minDataLength) {
      return { dif: [], dea: [], histogram: [] };
    }

    const closePrices = klines.map((k) => parseFloat(k.close));

    const macdInput = {
      values: closePrices,
      fastPeriod: MACD_CONFIG.fastPeriod,
      slowPeriod: MACD_CONFIG.slowPeriod,
      signalPeriod: MACD_CONFIG.signalPeriod,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    };

    const macdResult = MACD.calculate(macdInput);

    if (!macdResult || macdResult.length === 0) {
      return { dif: [], dea: [], histogram: [] };
    }

    const difData = [];
    const deaData = [];
    const histogram = [];

    const startIndex = closePrices.length - macdResult.length;

    for (let i = 0; i < klines.length; i++) {
      const time = convertToUnixTimestamp(klines[i].time);

      if (i < startIndex) {
        // 前面没有MACD数据的部分，用0填充
        difData.push({ time, value: 0 });
        deaData.push({ time, value: 0 });
        histogram.push({ time, value: 0, color: "rgba(0,0,0,0)" });
      } else {
        const macdIndex = i - startIndex;
        const item = macdResult[macdIndex];

        if (item.histogram) {
          item.histogram = item.histogram * MACD_CONFIG.histogramMultiplier;
        }

        if (item) {
          difData.push({
            time,
            value: item.MACD ?? 0,
          });

          deaData.push({
            time,
            value: item.signal ?? 0,
          });

          histogram.push({
            time,
            value: item.histogram ?? 0,
            color:
              item.histogram >= 0
                ? COLORS.upColor
                : COLORS.downColor,
          });
        }
      }
    }

    return { dif: difData, dea: deaData, histogram };
  } catch (error) {
    console.error("MACD calculation error:", error);
    return { dif: [], dea: [], histogram: [] };
  }
};

// 根据输入的字符串和isBug属性返回对应的字符和详细描述

// - 1,2：分别表示1，2，3类买卖点
// - 2s：类二买卖点
// - 1p：盘整背驰1类买卖点
// - 3a：中枢出现在1类后面的3类买卖点（3-after）
// - 3b：中枢出现在1类前面的3类买卖点（3-before）

// 返回值示例：{"text": "买1", "description": "买入点类型1"}
export const getBsPointData = (typeStr, isBuy) => {
  typeStr = typeStr.match(/'([^']+)'/)[1];
  const typeMap = {
    1: isBuy ? "买1" : "卖1",
    2: isBuy ? "买2" : "卖2",
    3: isBuy ? "买3" : "卖3",
    "2s": isBuy ? "买2s" : "卖2s",
    "1p": isBuy ? "买1p" : "卖1p",
    "3a": isBuy ? "买3a" : "卖3a",
    "3b": isBuy ? "买3b" : "卖3b",
  };
  const descriptionMap = {
    1: isBuy ? "1类买点" : "1类卖点",
    2: isBuy ? "2类买点" : "2类卖点",
    3: isBuy ? "3类买点" : "3类卖点",
    "2s": isBuy ? "类2买点" : "类2卖点",
    "1p": isBuy ? "盘整背驰1类买点" : "盘整背驰1类卖点",
    "3a": isBuy ? "中枢出现在1类后面的3类买点" : "中枢出现在1类前面的3类卖点",
    "3b": isBuy ? "中枢出现在1类前面的3类买点" : "中枢出现在1类后面的3类卖点",
  };
  return {
    text: typeMap[typeStr] || "Unknown",
    description: descriptionMap[typeStr] || "Unknown",
  };
};

/**
 * 计算移动平均线 (MA - Moving Average)
 * @param {Array} klines - K线数据数组
 * @param {number} period - 周期（如 5、10、20、30）
 * @returns {Array} 包含时间和值的移动平均线数据
 */
export const calculateMA = (klines, period) => {
  try {
    if (!klines || klines.length < period) {
      return [];
    }

    const closePrices = klines.map((k) => parseFloat(k.close));
    const maResult = SMA.calculate({ period, values: closePrices });

    if (!maResult || maResult.length === 0) {
      return [];
    }

    const maData = [];
    const startIndex = closePrices.length - maResult.length;

    for (let i = startIndex; i < klines.length; i++) {
      const maIndex = i - startIndex;
      const time = convertToUnixTimestamp(klines[i].time);
      maData.push({
        time,
        value: maResult[maIndex],
      });
    }

    return maData;
  } catch (error) {
    console.error(`MA${period} calculation error:`, error);
    return [];
  }
};
