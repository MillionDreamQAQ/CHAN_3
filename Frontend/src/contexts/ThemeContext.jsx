import { createContext, useContext, useState, useEffect } from "react";

const ThemeContext = createContext(undefined);

export const ThemeProvider = ({
  children,
  darkMode,
  toggleDarkMode,
  messageApi,
  contextHolder,
}) => {
  return (
    <ThemeContext.Provider
      value={{ darkMode, toggleDarkMode, messageApi, contextHolder }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme 必须在 ThemeProvider 内使用");
  }
  return context;
};
