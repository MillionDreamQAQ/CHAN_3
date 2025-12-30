import { forwardRef, memo } from "react";
import "./ChartTooltip.css";

const ChartTooltip = forwardRef((props, ref) => {
  return <div ref={ref} className="chart-tooltip" />;
});

ChartTooltip.displayName = "ChartTooltip";

export default memo(ChartTooltip);
