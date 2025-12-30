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

  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("darkMode");
    return saved ? JSON.parse(saved) : false;
  });

  const [config, setConfig] = useState({ ...DEFAULT_SCAN_CONFIG });

  const [readOnly, setReadOnly] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [currentTaskId, setCurrentTaskId] = useState(null);

  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [totalTasks, setTotalTasks] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [results, setResults] = useState([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [selectedTaskStatus, setSelectedTaskStatus] = useState(null);

  const themeConfig = {
    algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
  };

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

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleSelectTask = async (taskId) => {
    if (taskId === selectedTaskId) return;

    setSelectedTaskId(taskId);
    setResultsLoading(true);

    try {
      const detail = await scanApi.getTaskDetail(taskId);
      setResults(detail.results);
      setSelectedTaskStatus(detail.task.status);

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

  const subscribeToProgress = (taskId) => {
    const eventSource = scanApi.subscribeProgress(
      taskId,
      (progressData) => {
        setProgress(progressData);

        if (["completed", "cancelled", "error"].includes(progressData.status)) {
          setScanning(false);
          setSelectedTaskStatus(progressData.status);
          loadTasks();

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

      subscribeToProgress(response.task_id);

      setTimeout(loadTasks, 1000);
    } catch (error) {
      console.error("启动扫描失败:", error);
      message.error("启动扫描失败");
    }
  };

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

  const handleDeleteTask = async (taskId) => {
    try {
      await scanApi.deleteTask(taskId);
      message.success("任务已删除");

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

  const handleNewTask = () => {
    setReadOnly(false);
    setSelectedTaskId(null);
    setResults([]);
    setSelectedTaskStatus(null);
    setConfig({ ...DEFAULT_SCAN_CONFIG });
    setProgress(null);
  };

  const handleSelectStock = (record) => {
    localStorage.setItem(
      "selectedStock",
      JSON.stringify({
        code: record.code,
        klineType: record.kline_type,
      })
    );
    navigate("/");
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
  };

  return (
    <ConfigProvider theme={themeConfig}>
      <div className={`scan-page ${darkMode ? "dark-mode" : ""}`}>
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

        <div className="scan-page-content">
          <div className="scan-left-panel">
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
