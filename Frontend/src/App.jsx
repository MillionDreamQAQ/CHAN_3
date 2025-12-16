import { useState } from "react";
import Header from "./components/Header";
import ChartContainer from "./components/ChartContainer";
import { chanApi } from "./services/api";
import { message } from "antd";
import "./App.css";

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleQuery = async (request) => {
    setLoading(true);
    setError(null);

    try {
      const result = await chanApi.calculateChan(request);
      setData(result);
      message.success("查询成功！");
    } catch (err) {
      setError(
        err.response?.data?.detail || err.message || "查询失败，请检查网络连接"
      );
      console.error("Query error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <Header onQuery={handleQuery} loading={loading} />
      {error && (
        <div className="error-message">
          <span className="error-icon">⚠</span>
          <span>{error}</span>
          <button className="error-close" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
      <div className="main-content">
        <ChartContainer data={data} />
      </div>
    </div>
  );
}

export default App;
