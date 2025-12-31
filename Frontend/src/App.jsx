import { useState, useEffect } from "react";
import { ConfigProvider, message, theme } from "antd";
import { Outlet } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext";
import "./App.css";

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("darkMode");
    return saved === "true";
  });

  const [messageApi, contextHolder] = message.useMessage();

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

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev);
  };

  return (
    <ConfigProvider theme={themeConfig}>
      <ThemeProvider
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
        messageApi={messageApi}
        contextHolder={contextHolder}
      >
        <div className="app">
          {contextHolder}
          <div className="main-content">
            <Outlet />
          </div>
        </div>
      </ThemeProvider>
    </ConfigProvider>
  );
}

export default App;
