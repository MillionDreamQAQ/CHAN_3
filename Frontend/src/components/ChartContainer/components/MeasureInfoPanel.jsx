import { memo } from "react";
import { FORMAT_CONFIG } from "../../../config/config";
import "./MeasureInfoPanel.css";

const MeasureInfoPanel = ({ measureInfo, onClose }) => {
  if (!measureInfo) return null;

  return (
    <div className="measure-info-panel">
      <div className="measure-info-header">
        <span className="measure-title">区间测量</span>
        <button
          className="measure-close-btn"
          onClick={onClose}
          title="清除测量"
        >
          ×
        </button>
      </div>
      <div className="measure-info-body">
        <div className="measure-row">
          <span className="measure-label">价格差</span>
          <span className={`measure-value ${measureInfo.isUp ? "up" : "down"}`}>
            {measureInfo.isUp ? "+" : ""}
            {measureInfo.priceDiff.toFixed(FORMAT_CONFIG.priceDecimal)}
          </span>
        </div>
        <div className="measure-row">
          <span className="measure-label">涨跌幅</span>
          <span className={`measure-value ${measureInfo.isUp ? "up" : "down"}`}>
            {measureInfo.isUp ? "+" : ""}
            {measureInfo.priceChangePercent.toFixed(2)}%
          </span>
        </div>
        <div className="measure-row">
          <span className="measure-label">K线数</span>
          <span className="measure-value">{measureInfo.klineCount} 根</span>
        </div>
        <div className="measure-row">
          <span className="measure-label">时间跨度</span>
          <span className="measure-value">
            {measureInfo.timeSpan} {measureInfo.timeSpanUnit}
          </span>
        </div>
        <div className="measure-divider"></div>
        <div className="measure-row time-row">
          <span className="measure-label">起点</span>
          <span className="measure-value-small">
            {measureInfo.startTime} @{" "}
            {measureInfo.startPrice.toFixed(FORMAT_CONFIG.priceDecimal)}
          </span>
        </div>
        <div className="measure-row time-row">
          <span className="measure-label">终点</span>
          <span className="measure-value-small">
            {measureInfo.endTime} @{" "}
            {measureInfo.endPrice.toFixed(FORMAT_CONFIG.priceDecimal)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default memo(MeasureInfoPanel);
