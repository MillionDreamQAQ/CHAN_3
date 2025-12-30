import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ConfigProvider, theme, Button, message } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import {
  ScanConfigPanel,
  TaskListPanel,
  ResultPanel,
} from "../../components/ScanPage";
import { scanApi } from "../../services/api";
import { DEFAULT_SCAN_CONFIG } from "../../constants/scan";
import "./ScanPage.css";

const ScanPage = () => {
  const navigate = useNavigate();

  // 暗黑模式状态
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("darkMode");
    return saved ? JSON.parse(saved) : false;
  });

  // 扫描配置
  const [config, setConfig] = useState({ ...DEFAULT_SCAN_CONFIG });

  // 是否只读模式（查看历史任务时）
  const [readOnly, setReadOnly] = useState(false);

  // 扫描状态
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [currentTaskId, setCurrentTaskId] = useState(null);

  // 任务列表
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [totalTasks, setTotalTasks] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // 结果
  const [results, setResults] = useState([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [selectedTaskStatus, setSelectedTaskStatus] = useState(null);

  // 主题配置
  const themeConfig = {
    algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
  };

  // 加载任务列表
  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const response = await scanApi.getTasks(page, pageSize);
      setTasks(response.tasks);
      setTotalTasks(response.total);
    } catch (error) {
      console.error("加载任务列表失败:", error);
      message.error("加载任务列表失败");
    } finally {
      setTasksLoading(false);
    }
  }, [page, pageSize]);

  // 初始加载
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // 选择任务
  const handleSelectTask = async (taskId) => {
    if (taskId === selectedTaskId) return;

    setSelectedTaskId(taskId);
    setResultsLoading(true);

    try {
      const detail = await scanApi.getTaskDetail(taskId);
      setResults(detail.results);
      setSelectedTaskStatus(detail.task.status);

      // 填充配置（只读模式）
      setConfig({
        stockPool: detail.task.stock_pool,
        boards: detail.task.boards || [],
        stockCodes: detail.task.stock_codes || [],
        klineType: detail.task.kline_type,
        bspTypes: detail.task.bsp_types,
        timeWindowDays: detail.task.time_window_days,
        limit: detail.task.kline_limit,
      });
      setReadOnly(true);

      // 如果任务正在运行，订阅进度
      if (detail.task.status === "running") {
        setScanning(true);
        setCurrentTaskId(taskId);
        subscribeToProgress(taskId);
      }
    } catch (error) {
      console.error("加载任务详情失败:", error);
      message.error("加载任务详情失败");
    } finally {
      setResultsLoading(false);
    }
  };

  // 订阅进度
  const subscribeToProgress = (taskId) => {
    const eventSource = scanApi.subscribeProgress(
      taskId,
      (progressData) => {
        setProgress(progressData);

        // 任务完成时刷新
        if (["completed", "cancelled", "error"].includes(progressData.status)) {
          setScanning(false);
          setSelectedTaskStatus(progressData.status);
          loadTasks();

          // 重新加载结果
          scanApi.getTaskDetail(taskId).then((detail) => {
            setResults(detail.results);
          });
        }
      },
      (error) => {
        console.error("SSE连接错误:", error);
        setScanning(false);
      }
    );

    return eventSource;
  };

  // 开始扫描
  const handleStartScan = async () => {
    try {
      const request = {
        stock_pool: config.stockPool,
        boards: config.stockPool === "boards" ? config.boards : undefined,
        stock_codes:
          config.stockPool === "custom" ? config.stockCodes : undefined,
        kline_type: config.klineType,
        bsp_types: config.bspTypes,
        time_window_days: config.timeWindowDays,
        limit: config.limit,
      };

      const response = await scanApi.startScan(request);
      setCurrentTaskId(response.task_id);
      setSelectedTaskId(response.task_id);
      setScanning(true);
      setResults([]);
      setSelectedTaskStatus("running");

      // 订阅进度
      subscribeToProgress(response.task_id);

      // 刷新任务列表
      setTimeout(loadTasks, 500);
    } catch (error) {
      console.error("启动扫描失败:", error);
      message.error("启动扫描失败");
    }
  };

  // 取消扫描
  const handleCancelScan = async () => {
    if (!currentTaskId) return;

    try {
      await scanApi.cancelScan(currentTaskId);
      setScanning(false);
      setSelectedTaskStatus("cancelled");
      message.success("已取消扫描");
      loadTasks();
    } catch (error) {
      console.error("取消扫描失败:", error);
      message.error("取消扫描失败");
    }
  };

  // 删除任务
  const handleDeleteTask = async (taskId) => {
    try {
      await scanApi.deleteTask(taskId);
      message.success("任务已删除");

      // 如果删除的是当前选中的任务，清空选择
      if (taskId === selectedTaskId) {
        setSelectedTaskId(null);
        setResults([]);
        setSelectedTaskStatus(null);
        setReadOnly(false);
        setConfig({ ...DEFAULT_SCAN_CONFIG });
      }

      loadTasks();
    } catch (error) {
      console.error("删除任务失败:", error);
      message.error("删除任务失败");
    }
  };

  // 新建任务
  const handleNewTask = () => {
    setReadOnly(false);
    setSelectedTaskId(null);
    setResults([]);
    setSelectedTaskStatus(null);
    setConfig({ ...DEFAULT_SCAN_CONFIG });
    setProgress(null);
  };

  // 选择股票（跳转到图表页面）
  const handleSelectStock = (record) => {
    // 将股票信息存储到 localStorage，供图表页面使用
    localStorage.setItem(
      "selectedStock",
      JSON.stringify({
        code: record.code,
        klineType: record.kline_type,
      })
    );
    navigate("/");
  };

  // 页码变化
  const handlePageChange = (newPage) => {
    setPage(newPage);
  };

  return (
    <ConfigProvider theme={themeConfig}>
      <div className={`scan-page ${darkMode ? "dark-mode" : ""}`}>
        {/* 头部 */}
        <div className="scan-page-header">
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/")}
          >
            返回图表
          </Button>
          <span className="page-title">扫描买点</span>
          <div style={{ width: 100 }} />
        </div>

        {/* 内容区域 */}
        <div className="scan-page-content">
          {/* 左侧面板 */}
          <div className="scan-left-panel">
            {/* 配置区域 */}
            <div className="scan-config-section">
              <ScanConfigPanel
                config={config}
                setConfig={setConfig}
                readOnly={readOnly}
                scanning={scanning}
                progress={progress}
                onStartScan={handleStartScan}
                onCancelScan={handleCancelScan}
                onNewTask={handleNewTask}
              />
            </div>

            {/* 任务列表区域 */}
            <div className="scan-task-list-section">
              <TaskListPanel
                tasks={tasks}
                loading={tasksLoading}
                selectedTaskId={selectedTaskId}
                onSelectTask={handleSelectTask}
                onDeleteTask={handleDeleteTask}
                onRefresh={loadTasks}
                total={totalTasks}
                page={page}
                pageSize={pageSize}
                onPageChange={handlePageChange}
              />
            </div>
          </div>

          {/* 右侧结果面板 */}
          <div className="scan-right-panel">
            <ResultPanel
              results={results}
              loading={resultsLoading}
              onSelectStock={handleSelectStock}
              taskStatus={selectedTaskStatus}
            />
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
};

export default ScanPage;
