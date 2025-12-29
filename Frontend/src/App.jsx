import { useState, useEffect, useCallback } from "react";
import Header from "./components/Header";
import ChartContainer from "./components/ChartContainer";
import { chanApi } from "./services/api";
import { showMessage } from "./utils/utils";
import { ConfigProvider, message, theme } from "antd";
import { getDefaultIndicators } from "./config/config";

import "./App.css";

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("darkMode");
    return saved === "true";
  });

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

  return (
    <ConfigProvider theme={themeConfig}>
      <div className="app">
        {contextHolder}
        <Header
          onQuery={handleQuery}
          loading={loading}
          darkMode={darkMode}
          indicators={indicators}
          favorites={favorites}
          onSetMAType={setMAType}
          onToggleIndicator={toggleIndicator}
          onToggleMAPeriod={toggleMAPeriod}
          onToggleDarkMode={toggleDarkMode}
          onToggleFavorite={toggleFavorite}
        />
        <div className="main-content">
          <ChartContainer
            data={data}
            darkMode={darkMode}
            indicators={indicators}
          />
        </div>
      </div>
    </ConfigProvider>
  );
}

export default App;
