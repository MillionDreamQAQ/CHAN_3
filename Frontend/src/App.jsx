import { useState, useEffect, useCallback, useRef } from "react";
import Header from "./components/Header";
import ChartContainer from "./components/ChartContainer";
import { chanApi } from "./services/api";
import { showMessage } from "./utils/utils";
import { ConfigProvider, message, theme } from "antd";
import { getDefaultIndicators } from "./config/config";
import useStockSearch from "./components/ChartContainer/hooks/useStockSearch";

import "./App.css";

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("darkMode");
    return saved === "true";
  });

  // 股票查询相关状态
  const [currentStock, setCurrentStock] = useState({
    code: "sh.000001",
    klineType: "day",
    limit: 2000,
  });

  // 股票搜索 hook
  const stockSearch = useStockSearch();

  const initialLoadRef = useRef(true);

  // 处理从 ScanPage 跳转过来的情况
  useEffect(() => {
    const selectedStock = localStorage.getItem("selectedStock");
    if (selectedStock && initialLoadRef.current) {
      try {
        const stockInfo = JSON.parse(selectedStock);
        setCurrentStock((prev) => ({
          ...prev,
          code: stockInfo.code,
          klineType: stockInfo.klineType || prev.klineType,
        }));
        localStorage.removeItem("selectedStock");
      } catch (e) {
        console.error("解析选中股票失败:", e);
      }
    }
    initialLoadRef.current = false;
  }, []);

  const [indicators, setIndicators] = useState(() => {
    const saved = localStorage.getItem("indicators");
    return saved ? JSON.parse(saved) : getDefaultIndicators();
  });

  const [favorites, setFavorites] = useState(() => {
    const saved = localStorage.getItem("favorites");
    return saved ? JSON.parse(saved) : [];
  });

  const themeConfig = {
    algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: "#177ddc",
    },
  };

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add("dark-mode");
    } else {
      document.body.classList.remove("dark-mode");
    }
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem("indicators", JSON.stringify(indicators));
  }, [indicators]);

  useEffect(() => {
    localStorage.setItem("favorites", JSON.stringify(favorites));
  }, [favorites]);

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev);
  };

  const toggleMAPeriod = useCallback((period) => {
    setIndicators((prev) => ({
      ...prev,
      maPeriods: {
        ...prev.maPeriods,
        [period]: !prev.maPeriods[period],
      },
    }));
  }, []);

  const setMAType = useCallback((type) => {
    setIndicators((prev) => ({
      ...prev,
      maType: type,
    }));
  }, []);

  const toggleIndicator = useCallback((key) => {
    setIndicators((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const toggleFavorite = useCallback((code) => {
    setFavorites((prev) => {
      if (prev.includes(code)) {
        return prev.filter((c) => c !== code);
      } else {
        return [...prev, code];
      }
    });
  }, []);

  // 股票/周期/数量变更回调
  const handleStockChange = useCallback((code) => {
    setCurrentStock((prev) => ({ ...prev, code }));
  }, []);

  const handleKlineTypeChange = useCallback((klineType) => {
    setCurrentStock((prev) => ({ ...prev, klineType }));
  }, []);

  const handleLimitChange = useCallback((limit) => {
    if (limit) {
      setCurrentStock((prev) => ({ ...prev, limit }));
    }
  }, []);

  const handleQuery = async (request) => {
    showMessage(messageApi, "query", "info", "正在查询，请稍候...", 0);
    setLoading(true);

    try {
      const result = await chanApi.calculateChan(request);
      setData(result);
      showMessage(messageApi, "loadingData", "success", "数据加载成功！", 2);
    } catch (err) {
      message.error("查询失败，请检查控制台报错信息！");
      console.error(
        err.response?.data?.detail || err.message || "查询失败，请检查网络连接"
      );
    } finally {
      messageApi.destroy("query");
      setLoading(false);
    }
  };

  // 刷新回调
  const handleRefresh = useCallback(() => {
    handleQuery({
      code: currentStock.code,
      kline_type: currentStock.klineType,
      limit: currentStock.limit,
    });
  }, [currentStock]);

  // 股票/周期/数量变化时自动查询
  useEffect(() => {
    if (currentStock.code) {
      handleQuery({
        code: currentStock.code,
        kline_type: currentStock.klineType,
        limit: currentStock.limit,
      });
    }
  }, [currentStock.code, currentStock.klineType, currentStock.limit]);

  return (
    <ConfigProvider theme={themeConfig}>
      <div className="app">
        {contextHolder}
        <Header darkMode={darkMode} onToggleDarkMode={toggleDarkMode} />
        <div className="main-content">
          <ChartContainer
            data={data}
            darkMode={darkMode}
            indicators={indicators}
            favorites={favorites}
            currentStock={currentStock}
            stockSearch={stockSearch}
            onStockChange={handleStockChange}
            onKlineTypeChange={handleKlineTypeChange}
            onLimitChange={handleLimitChange}
            onRefresh={handleRefresh}
            onToggleFavorite={toggleFavorite}
            onSetMAType={setMAType}
            onToggleMAPeriod={toggleMAPeriod}
            onToggleIndicator={toggleIndicator}
          />
        </div>
      </div>
    </ConfigProvider>
  );
}

export default App;
