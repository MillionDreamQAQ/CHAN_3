import { Button, InputNumber, Space } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import "./ChartControlPanel.css";

const KLINE_GROUPS = [
  { label: "月", value: "month" },
  { label: "周", value: "week" },
  { label: "日", value: "day" },
  { label: "60", value: "60m" },
  { label: "30", value: "30m" },
  { label: "15", value: "15m" },
  { label: "5", value: "5m" },
  { label: "1", value: "1m" },
];

/**
 * 图表控制面板组件
 * 包含 K线周期选择、K线数量输入和刷新按钮
 */
const ChartControlPanel = ({
  klineType,
  limit,
  onKlineTypeChange,
  onLimitChange,
  onRefresh,
  darkMode,
}) => {
  return (
    <div className={`chart-control-panel ${darkMode ? "dark" : ""}`}>
      <div className="kline-buttons">
        <Space.Compact size="small">
          {KLINE_GROUPS.slice(0, 3).map((item) => (
            <Button
              key={item.value}
              type={klineType === item.value ? "primary" : "default"}
              size="small"
              onClick={() => onKlineTypeChange(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </Space.Compact>
        <div className="kline-divider"></div>
        <Space.Compact size="small">
          {KLINE_GROUPS.slice(3, 5).map((item) => (
            <Button
              key={item.value}
              type={klineType === item.value ? "primary" : "default"}
              size="small"
              onClick={() => onKlineTypeChange(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </Space.Compact>
        <div className="kline-divider"></div>
        <Space.Compact size="small">
          {KLINE_GROUPS.slice(5, 8).map((item) => (
            <Button
              key={item.value}
              type={klineType === item.value ? "primary" : "default"}
              size="small"
              onClick={() => onKlineTypeChange(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </Space.Compact>
      </div>
      <InputNumber
        value={limit}
        onChange={onLimitChange}
        placeholder="数据条数"
        changeOnWheel={true}
        step={1000}
        min={1000}
        max={20000}
        size="small"
        className="limit-input"
      />
      <Button
        type="default"
        icon={<ReloadOutlined />}
        onClick={onRefresh}
        className="refresh-button"
        title="刷新数据"
        size="small"
      />
    </div>
  );
};

export default ChartControlPanel;
