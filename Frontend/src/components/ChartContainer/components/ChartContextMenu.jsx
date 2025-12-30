import { useMemo } from "react";
import { Dropdown, Checkbox, Segmented, Divider } from "antd";
import {
  getColors,
  MA_COLORS,
  MOVING_AVERAGE_PERIODS,
  MA_TYPES,
} from "../../../config/config";
import "./ChartContextMenu.css";

/**
 * 图表右键菜单组件
 * 包含指标显示控制：MA/EMA 切换、MA 周期、缠论指标
 */
const ChartContextMenu = ({
  children,
  indicators,
  onSetMAType,
  onToggleMAPeriod,
  onToggleIndicator,
  darkMode,
}) => {
  const COLORS = useMemo(() => getColors(darkMode), [darkMode]);
  const maColors = useMemo(
    () =>
      MOVING_AVERAGE_PERIODS.reduce((acc, period) => {
        acc[period] = COLORS[period] || MA_COLORS[period];
        return acc;
      }, {}),
    [COLORS]
  );

  const menuItems = [
    {
      key: "ma-header",
      label: <span className="menu-section-header">均线设置</span>,
      disabled: true,
    },
    {
      key: "ma-type",
      label: (
        <div className="menu-item-content" onClick={(e) => e.stopPropagation()}>
          <Segmented
            size="small"
            value={indicators.maType}
            onChange={onSetMAType}
            options={[
              { label: "MA", value: MA_TYPES.MA },
              { label: "EMA", value: MA_TYPES.EMA },
            ]}
          />
        </div>
      ),
    },
    {
      key: "ma-periods",
      label: (
        <div
          className="menu-item-content ma-periods"
          onClick={(e) => e.stopPropagation()}
        >
          {MOVING_AVERAGE_PERIODS.map((period) => (
            <Checkbox
              key={period}
              checked={indicators.maPeriods?.[period]}
              onChange={() => onToggleMAPeriod(period)}
            >
              <span style={{ color: maColors[period] }}>{period}</span>
            </Checkbox>
          ))}
        </div>
      ),
    },
    {
      type: "divider",
    },
    {
      key: "chan-header",
      label: <span className="menu-section-header">缠论指标</span>,
      disabled: true,
    },
    {
      key: "bi",
      label: (
        <div className="menu-item-content" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={indicators.bi}
            onChange={() => onToggleIndicator("bi")}
          >
            <span style={{ color: COLORS.biLine }}>笔</span>
          </Checkbox>
        </div>
      ),
    },
    {
      key: "seg",
      label: (
        <div className="menu-item-content" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={indicators.seg}
            onChange={() => onToggleIndicator("seg")}
          >
            <span style={{ color: COLORS.segLine }}>段</span>
          </Checkbox>
        </div>
      ),
    },
    {
      key: "zs",
      label: (
        <div className="menu-item-content" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={indicators.zs}
            onChange={() => onToggleIndicator("zs")}
          >
            <span style={{ color: COLORS.zsLine }}>中枢</span>
          </Checkbox>
        </div>
      ),
    },
    {
      key: "bsPoints",
      label: (
        <div className="menu-item-content" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={indicators.bsPoints}
            onChange={() => onToggleIndicator("bsPoints")}
          >
            <span>
              <span style={{ color: COLORS.upColor }}>买</span>
              <span style={{ color: COLORS.downColor }}>卖</span>点
            </span>
          </Checkbox>
        </div>
      ),
    },
  ];

  return (
    <Dropdown
      menu={{ items: menuItems }}
      trigger={["contextMenu"]}
      overlayClassName={`chart-context-menu ${darkMode ? "dark" : ""}`}
    >
      {children}
    </Dropdown>
  );
};

export default ChartContextMenu;
