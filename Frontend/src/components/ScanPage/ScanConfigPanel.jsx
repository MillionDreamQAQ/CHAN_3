import {
  Radio,
  Checkbox,
  Segmented,
  InputNumber,
  Button,
  Tag,
  Progress,
  Space,
  Input,
} from "antd";
import {
  PlayCircleOutlined,
  StopOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  BSP_TYPE_OPTIONS,
  KLINE_OPTIONS,
  BOARD_OPTIONS,
  BSP_TYPE_COLORS,
} from "../../utils/utils";
import "./ScanConfigPanel.css";

/**
 * 扫描配置面板
 * 支持编辑模式和只读模式
 */
const ScanConfigPanel = ({
  config,
  setConfig,
  readOnly = false,
  scanning = false,
  progress = null,
  onStartScan,
  onCancelScan,
  onNewTask,
}) => {
  const handleStockPoolChange = (e) => {
    setConfig({ ...config, stockPool: e.target.value });
  };

  const handleBoardsChange = (checkedValues) => {
    setConfig({ ...config, boards: checkedValues });
  };

  const handleKlineTypeChange = (value) => {
    setConfig({ ...config, klineType: value });
  };

  const handleBspTypesChange = (checkedValues) => {
    setConfig({ ...config, bspTypes: checkedValues });
  };

  const handleTimeWindowChange = (value) => {
    setConfig({ ...config, timeWindowDays: value });
  };

  const handleLimitChange = (value) => {
    setConfig({ ...config, limit: value });
  };

  const handleStockCodesChange = (e) => {
    const codes = e.target.value
      .split(/[,，\s]+/)
      .filter((code) => code.trim());
    setConfig({ ...config, stockCodes: codes });
  };

  return (
    <div className="scan-config-panel">
      <div className="config-header">
        <span className="config-title">扫描配置</span>
        {readOnly && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="small"
            onClick={onNewTask}
          >
            新建任务
          </Button>
        )}
      </div>

      <div className="config-body">
        <div className="config-row">
          <span className="config-label">股票范围：</span>
          <div className="config-content">
            <Radio.Group
              value={config.stockPool}
              onChange={handleStockPoolChange}
              disabled={readOnly}
            >
              <Radio value="all">全市场</Radio>
              <Radio value="boards">按板块</Radio>
              <Radio value="custom">自定义</Radio>
            </Radio.Group>
          </div>
        </div>

        {config.stockPool === "boards" && (
          <div className="config-row">
            <span className="config-label">选择板块：</span>
            <div className="config-content">
              <Checkbox.Group
                options={BOARD_OPTIONS}
                value={config.boards}
                onChange={handleBoardsChange}
                disabled={readOnly}
              />
            </div>
          </div>
        )}

        {config.stockPool === "custom" && (
          <div className="config-row">
            <span className="config-label">股票代码：</span>
            <div className="config-content">
              <Input.TextArea
                placeholder="输入股票代码，用逗号或空格分隔，如：sh.600000, sz.000001"
                value={config.stockCodes?.join(", ") || ""}
                onChange={handleStockCodesChange}
                disabled={readOnly}
                rows={2}
              />
            </div>
          </div>
        )}

        <div className="config-row">
          <span className="config-label">K 线级别：</span>
          <div className="config-content">
            <Segmented
              options={KLINE_OPTIONS}
              value={config.klineType}
              onChange={handleKlineTypeChange}
              disabled={readOnly}
            />
          </div>
        </div>

        <div className="config-row">
          <span className="config-label">买点类型：</span>
          <div className="config-content bsp-types">
            <Checkbox.Group
              value={config.bspTypes}
              onChange={handleBspTypesChange}
              disabled={readOnly}
            >
              {BSP_TYPE_OPTIONS.map((opt) => (
                <Checkbox key={opt.value} value={opt.value}>
                  <Tag color={BSP_TYPE_COLORS[opt.value]}>{opt.label}</Tag>
                </Checkbox>
              ))}
            </Checkbox.Group>
          </div>
        </div>

        <div className="config-row">
          <span className="config-label">时间窗口：</span>
          <div className="config-content">
            <Space>
              <InputNumber
                min={1}
                max={30}
                value={config.timeWindowDays}
                onChange={handleTimeWindowChange}
                disabled={readOnly}
                suffix="天"
                style={{ width: 100 }}
              />
              <span className="config-label" style={{ marginLeft: 16 }}>
                K 线数量：
              </span>
              <InputNumber
                min={1000}
                max={20000}
                step={1000}
                value={config.limit}
                onChange={handleLimitChange}
                disabled={readOnly}
                style={{ width: 100 }}
              />
            </Space>
          </div>
        </div>

        {scanning && progress && (
          <div className="config-row progress-row">
            <div className="progress-info">
              <Progress
                percent={progress.progress}
                size="small"
                status={progress.status === "running" ? "active" : "normal"}
              />
              <div className="progress-text">
                <span>
                  已扫描: {progress.processed_count}/{progress.total_count}
                </span>
                <span>找到买点: {progress.found_count}</span>
                {progress.current_stock && (
                  <span>当前: {progress.current_stock}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {!readOnly && (
          <div className="config-row actions-row">
            <Space>
              {!scanning ? (
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={onStartScan}
                  disabled={
                    config.stockPool === "boards" && config.boards.length === 0
                  }
                >
                  开始扫描
                </Button>
              ) : (
                <Button danger icon={<StopOutlined />} onClick={onCancelScan}>
                  取消扫描
                </Button>
              )}
            </Space>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScanConfigPanel;
