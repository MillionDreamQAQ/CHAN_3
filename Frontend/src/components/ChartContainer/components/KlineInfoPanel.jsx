import { memo } from "react";
import { FORMAT_CONFIG } from "../../../config/config";

const KlineInfoPanel = ({ klineInfo }) => {
  if (!klineInfo) return null;

  const isUp = klineInfo.close >= klineInfo.prevClose;
  const priceChange = klineInfo.close - klineInfo.prevClose;
  const priceChangePercent = (priceChange / klineInfo.prevClose) * 100;

  return (
    <div className="kline-info-panel">
      <div className="kline-info-left">
        <div
          className={`kline-info-close ${
            isUp ? "kline-info-up" : "kline-info-down"
          }`}
        >
          {klineInfo.close.toFixed(FORMAT_CONFIG.priceDecimal)}
        </div>
        <div className="kline-info-change-row">
          <span
            className={`kline-info-change-value ${
              isUp ? "kline-info-up" : "kline-info-down"
            }`}
          >
            {isUp ? "+" : ""}
            {priceChange.toFixed(FORMAT_CONFIG.priceDecimal)}
          </span>
          <span
            className={`kline-info-change-value ${
              isUp ? "kline-info-up" : "kline-info-down"
            }`}
          >
            {isUp ? "+" : ""}
            {priceChangePercent.toFixed(2)}%
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
  );
};

export default memo(KlineInfoPanel);
