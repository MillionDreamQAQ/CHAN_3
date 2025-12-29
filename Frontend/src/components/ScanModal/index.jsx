import { useState, useEffect, useRef } from "react";
import {
  Modal,
  Button,
  Radio,
  Checkbox,
  InputNumber,
  Input,
  Progress,
  Table,
  Tag,
  Space,
  message,
  Segmented,
} from "antd";
import { ScanOutlined, StopOutlined } from "@ant-design/icons";
import { scanApi } from "../../services/api";
import "./ScanModal.css";

// 买卖点类型配置
const BSP_TYPE_OPTIONS = [
  { label: "一类(T1)", value: "1" },
  { label: "一类盘整(T1P)", value: "1p" },
  { label: "二类(T2)", value: "2" },
  { label: "二类衍生(T2S)", value: "2s" },
  { label: "三类A(T3A)", value: "3a" },
  { label: "三类B(T3B)", value: "3b" },
];

// K线级别配置
const KLINE_OPTIONS = [
  { label: "日线", value: "day" },
  { label: "周线", value: "week" },
  { label: "月线", value: "month" },
  { label: "60分", value: "60m" },
  { label: "30分", value: "30m" },
  { label: "15分", value: "15m" },
  { label: "5分", value: "5m" },
];

// 板块选项配置
const BOARD_OPTIONS = [
  { label: "沪市主板", value: "sh_main" },
  { label: "深市主板", value: "sz_main" },
  { label: "创业板", value: "cyb" },
  { label: "科创板", value: "kcb" },
  { label: "北交所", value: "bj" },
  { label: "ETF", value: "etf" },
];

// 买卖点类型颜色映射
const BSP_TYPE_COLORS = {
  1: "green",
  "1p": "cyan",
  2: "blue",
  "2s": "geekblue",
  "3a": "purple",
  "3b": "magenta",
};

const ScanModal = ({ open, onClose, onSelectStock }) => {
  // 配置状态
  const [stockPool, setStockPool] = useState("all");
  const [selectedBoards, setSelectedBoards] = useState(["sh_main", "sz_main"]);
  const [customCodes, setCustomCodes] = useState("");
  const [klineType, setKlineType] = useState("day");
  const [bspTypes, setBspTypes] = useState(["1", "1p", "2"]);
  const [timeWindowDays, setTimeWindowDays] = useState(3);
  const [limit, setLimit] = useState(500);

  // 扫描状态
  const [scanning, setScanning] = useState(false);
  const [taskId, setTaskId] = useState(null);
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);

  // SSE连接引用
  const eventSourceRef = useRef(null);

  // 清理SSE连接
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Modal关闭时重置状态
  useEffect(() => {
    if (!open) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      // 保留结果，不重置配置
    }
  }, [open]);

  // 开始扫描
  const handleStartScan = async () => {
    try {
      // 构建请求
      const request = {
        stock_pool: stockPool,
        boards: stockPool === "boards" ? selectedBoards : undefined,
        stock_codes:
          stockPool === "custom"
            ? customCodes
                .split(/[,，\n\s]+/)
                .map((s) => s.trim())
                .filter((s) => s)
            : undefined,
        kline_type: klineType,
        bsp_types: bspTypes,
        time_window_days: timeWindowDays,
        limit,
      };

      if (
        stockPool === "boards" &&
        (!selectedBoards || selectedBoards.length === 0)
      ) {
        message.error("请选择至少一个板块");
        return;
      }

      if (
        stockPool === "custom" &&
        (!request.stock_codes || request.stock_codes.length === 0)
      ) {
        message.error("请输入股票代码");
        return;
      }

      if (bspTypes.length === 0) {
        message.error("请选择至少一种买卖点类型");
        return;
      }

      setScanning(true);
      setShowResults(false);
      setResults([]);
      setProgress({
        status: "running",
        progress: 0,
        processed_count: 0,
        total_count: 0,
        found_count: 0,
      });

      // 启动扫描任务
      const response = await scanApi.startScan(request);
      setTaskId(response.task_id);

      // 订阅进度更新
      eventSourceRef.current = scanApi.subscribeProgress(
        response.task_id,
        (progressData) => {
          setProgress(progressData);

          if (progressData.status === "completed") {
            handleScanComplete(response.task_id);
          } else if (progressData.status === "error") {
            message.error(progressData.error_message || "扫描出错");
            setScanning(false);
          } else if (progressData.status === "cancelled") {
            message.info("扫描已取消");
            setScanning(false);
          }
        },
        () => {
          setScanning(false);
        }
      );
    } catch (error) {
      console.error("启动扫描失败:", error);
      message.error("启动扫描失败");
      setScanning(false);
    }
  };

  // 扫描完成后获取结果
  const handleScanComplete = async (id) => {
    try {
      const result = await scanApi.getResults(id);
      setResults(result.results);
      setShowResults(true);
      setScanning(false);
      message.success(
        `扫描完成! 共扫描 ${result.total_scanned} 只股票，找到 ${result.total_found} 个买点`
      );
    } catch (error) {
      console.error("获取结果失败:", error);
      message.error("获取扫描结果失败");
      setScanning(false);
    }
  };

  // 取消扫描
  const handleCancelScan = async () => {
    if (taskId) {
      try {
        await scanApi.cancelScan(taskId);
      } catch (error) {
        console.error("取消扫描失败:", error);
      }
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setScanning(false);
  };

  // 点击结果行跳转到股票
  const handleRowClick = (record) => {
    onSelectStock(record.code);
    onClose();
  };

  // 结果表格列定义
  const columns = [
    {
      title: "代码",
      dataIndex: "code",
      key: "code",
      width: 120,
      sorter: (a, b) => a.code.localeCompare(b.code),
    },
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
      width: 100,
      ellipsis: true,
    },
    {
      title: "买点类型",
      dataIndex: "bsp_type",
      key: "bsp_type",
      width: 100,
      render: (type) => (
        <Tag color={BSP_TYPE_COLORS[type] || "default"}>
          {BSP_TYPE_OPTIONS.find((o) => o.value === type)?.label || type}
        </Tag>
      ),
      filters: BSP_TYPE_OPTIONS.map((o) => ({ text: o.label, value: o.value })),
      onFilter: (value, record) => record.bsp_type === value,
    },
    {
      title: "时间",
      dataIndex: "bsp_time",
      key: "bsp_time",
      width: 160,
      sorter: (a, b) => a.bsp_time.localeCompare(b.bsp_time),
      defaultSortOrder: "descend",
    },
    {
      title: "价格",
      dataIndex: "bsp_value",
      key: "bsp_value",
      width: 100,
      render: (value) => value?.toFixed(2),
      sorter: (a, b) => a.bsp_value - b.bsp_value,
    },
  ];

  return (
    <Modal
      title="批量扫描买点"
      open={open}
      onCancel={onClose}
      footer={null}
      width={800}
      destroyOnHidden={true}
      className="scan-modal"
    >
      <div className="scan-modal-content">
        {/* 配置区域 */}
        {!showResults && (
          <div className="scan-config">
            {/* 股票范围 */}
            <div className="config-row">
              <span className="config-label">股票范围:</span>
              <Radio.Group
                value={stockPool}
                onChange={(e) => setStockPool(e.target.value)}
                disabled={scanning}
              >
                <Radio value="all">全市场</Radio>
                <Radio value="boards">按板块</Radio>
                <Radio value="custom">自定义</Radio>
              </Radio.Group>
            </div>

            {stockPool === "boards" && (
              <div className="config-row">
                <span className="config-label"></span>
                <Checkbox.Group
                  options={BOARD_OPTIONS}
                  value={selectedBoards}
                  onChange={setSelectedBoards}
                  disabled={scanning}
                />
              </div>
            )}

            {stockPool === "custom" && (
              <div className="config-row">
                <span className="config-label"></span>
                <Input.TextArea
                  placeholder="输入股票代码，用逗号、空格或换行分隔，如: sh.600000, sz.000001"
                  value={customCodes}
                  onChange={(e) => setCustomCodes(e.target.value)}
                  disabled={scanning}
                  rows={3}
                  style={{ flex: 1 }}
                />
              </div>
            )}

            {/* K线级别 */}
            <div className="config-row">
              <span className="config-label">K线级别:</span>
              <Segmented
                options={KLINE_OPTIONS}
                value={klineType}
                onChange={setKlineType}
                disabled={scanning}
              />
            </div>

            {/* 买卖点类型 */}
            <div className="config-row">
              <span className="config-label">买点类型:</span>
              <Checkbox.Group
                options={BSP_TYPE_OPTIONS}
                value={bspTypes}
                onChange={setBspTypes}
                disabled={scanning}
              />
            </div>

            {/* 时间窗口 */}
            <div className="config-row">
              <span className="config-label">时间窗口:</span>
              <InputNumber
                value={timeWindowDays}
                onChange={setTimeWindowDays}
                min={1}
                max={30}
                disabled={scanning}
                addonAfter="天"
                style={{ width: 120 }}
              />
              <span className="config-hint">扫描最近N天内出现的买点</span>
            </div>

            {/* K线数量 */}
            <div className="config-row">
              <span className="config-label">K线数量:</span>
              <InputNumber
                value={limit}
                onChange={setLimit}
                min={100}
                max={2000}
                step={100}
                disabled={scanning}
                style={{ width: 120 }}
              />
              <span className="config-hint">每只股票获取的K线数量</span>
            </div>

            {/* 操作按钮 */}
            <div className="config-actions">
              {!scanning ? (
                <Button
                  type="primary"
                  icon={<ScanOutlined />}
                  onClick={handleStartScan}
                  size="large"
                >
                  开始扫描
                </Button>
              ) : (
                <Button
                  danger
                  icon={<StopOutlined />}
                  onClick={handleCancelScan}
                  size="large"
                >
                  取消扫描
                </Button>
              )}
            </div>

            {/* 进度显示 */}
            {scanning && progress && (
              <div className="scan-progress">
                <Progress
                  percent={progress.progress}
                  status={progress.status === "error" ? "exception" : "active"}
                />
                <div className="progress-info">
                  <span>
                    已扫描: {progress.processed_count} / {progress.total_count}
                  </span>
                  <span>已找到: {progress.found_count} 个买点</span>
                  {progress.current_stock && (
                    <span>当前: {progress.current_stock}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 结果区域 */}
        {showResults && (
          <div className="scan-results">
            <div className="results-header">
              <Space>
                <span>
                  共找到 <strong>{results.length}</strong> 个买点
                </span>
                <Button size="small" onClick={() => setShowResults(false)}>
                  返回配置
                </Button>
              </Space>
            </div>
            <Table
              dataSource={results}
              columns={columns}
              rowKey={(record) =>
                `${record.code}-${record.bsp_time}-${record.bsp_type}`
              }
              size="small"
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 条`,
              }}
              onRow={(record) => ({
                onClick: () => handleRowClick(record),
                style: { cursor: "pointer" },
              })}
              scroll={{ y: 400 }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ScanModal;
