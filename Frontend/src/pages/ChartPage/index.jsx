import { useState, useEffect, useCallback, useRef } from "react";
import Header from "../../components/Header";
import ChartContainer from "../../components/ChartContainer";
import { chanApi } from "../../services/api";
import { showMessage } from "../../utils/utils";
import { message } from "antd";
import { getDefaultIndicators } from "../../config/config";
import useStockSearch from "../../components/ChartContainer/hooks/useStockSearch";
import { useTheme } from "../../contexts/ThemeContext";
import "./ChartPage.css";

function ChartPage() {
  const { darkMode, toggleDarkMode, messageApi } = useTheme();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const [currentStock, setCurrentStock] = useState({
    code: "sh.000001",
    klineType: "day",
    limit: 2000,
  });

  const stockSearch = useStockSearch();
  const initialLoadRef = useRef(true);

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

  useEffect(() => {
    localStorage.setItem("indicators", JSON.stringify(indicators));
  }, [indicators]);

  useEffect(() => {
    localStorage.setItem("favorites", JSON.stringify(favorites));
  }, [favorites]);

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

  const handleRefresh = useCallback(() => {
    handleQuery({
      code: currentStock.code,
      kline_type: currentStock.klineType,
      limit: currentStock.limit,
    });
  }, [currentStock]);

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
    <>
      <Header darkMode={darkMode} onToggleDarkMode={toggleDarkMode} />
      <div className="chart-page-content">
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
    </>
  );
}

export default ChartPage;
