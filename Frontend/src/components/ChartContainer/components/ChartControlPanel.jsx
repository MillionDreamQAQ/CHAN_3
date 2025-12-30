import { useState, useEffect, useRef } from "react";
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
  const [localLimit, setLocalLimit] = useState(limit);
  const timerRef = useRef(null);

  useEffect(() => {
    setLocalLimit(limit);
  }, [limit]);

  const handleLocalLimitChange = (value) => {
    setLocalLimit(value);
    if (value) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        onLimitChange(value);
      }, 1000);
    }
  };

  return (
    <div className={`chart-control-panel ${darkMode ? "dark" : ""}`}>
      <div className="kline-buttons">
        <Space.Compact>
          {KLINE_GROUPS.map((item) => (
            <Button
              key={item.value}
              type={klineType === item.value ? "primary" : "default"}
              size="medium"
              style={{ width: 32 }}
              onClick={() => onKlineTypeChange(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </Space.Compact>
      </div>
      <InputNumber
        value={localLimit}
        onChange={handleLocalLimitChange}
        placeholder="数据条数"
        changeOnWheel={true}
        step={1000}
        min={1000}
        max={20000}
        size="medium"
        className="limit-input"
      />
      <Button
        type="default"
        icon={<ReloadOutlined />}
        onClick={onRefresh}
        className="refresh-button"
        title="刷新数据"
        size="medium"
      />
    </div>
  );
};

export default ChartControlPanel;
