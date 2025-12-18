import { useState, useEffect, useCallback } from "react";
import Header from "./components/Header";
import ChartContainer from "./components/ChartContainer";
import { chanApi } from "./services/api";
import { message } from "antd";
import "./App.css";

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("darkMode");
    return saved === "true";
  });

  const [indicators, setIndicators] = useState({
    ma5: true,
    ma10: true,
    ma20: true,
    ma30: true,
    bi: true,
    seg: true,
    zs: true,
    bsPoints: true,
  });

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add("dark-mode");
    } else {
      document.body.classList.remove("dark-mode");
    }
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev);
  };

  const toggleIndicator = useCallback((key) => {
    setIndicators((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const handleQuery = async (request) => {
    message.info("正在查询，请稍候...");
    setLoading(true);

    try {
      const result = await chanApi.calculateChan(request);
      setData(result);
      message.success("查询成功！");
    } catch (err) {
      message.error("查询失败，请检查控制台报错信息！");
      console.error(
        err.response?.data?.detail || err.message || "查询失败，请检查网络连接"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <Header
        onQuery={handleQuery}
        loading={loading}
        darkMode={darkMode}
        indicators={indicators}
        onToggleIndicator={toggleIndicator}
        onToggleDarkMode={toggleDarkMode}
      />
      <div className="main-content">
        <ChartContainer
          data={data}
          darkMode={darkMode}
          indicators={indicators}
        />
      </div>
    </div>
  );
}

export default App;
