import { useState, useEffect, useMemo } from "react";
import {
  AutoComplete,
  Button,
  Select,
  Spin,
  message,
  Checkbox,
  InputNumber,
} from "antd";
import {
  BulbOutlined,
  BulbFilled,
  StarOutlined,
  StarFilled,
} from "@ant-design/icons";
import { getColors } from "../config/config";
import axios from "axios";
import Fuse from "fuse.js";
import "./Header.css";

const Header = ({
  onQuery,
  loading,
  darkMode,
  onToggleDarkMode,
  indicators,
  onToggleIndicator,
  favorites,
  onToggleFavorite,
}) => {
  const COLORS = useMemo(() => getColors(darkMode), [darkMode]);

  const [code, setCode] = useState("sh.000001");
  const [curCode, setCurCode] = useState("sh.000001");
  const [klineType, setKlineType] = useState("day");
  const [limit, setLimit] = useState(2000);

  const [searchOptions, setSearchOptions] = useState([]);
  const [stocksLoading, setStocksLoading] = useState(false);
  const [fuse, setFuse] = useState(null);
  const [stocks, setStocks] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const getStockName = (stockCode) => {
    const stock = stocks.find((s) => s.code === stockCode);
    return stock ? stock.name : "";
  };

  const displayValue = useMemo(() => {
    if (!code) return "";
    const name = getStockName(code);
    return name ? `${name} - ${code}` : code;
  }, [code, stocks]);

  useEffect(() => {
    const loadStocks = async () => {
      setStocksLoading(true);
      try {
        const response = await axios.get(
          "http://localhost:8000/api/stocks/list"
        );
        if (response.data.success) {
          const stocksData = response.data.data;
          setStocks(stocksData);

          const fuseInstance = new Fuse(stocksData, {
            keys: [
              { name: "code", weight: 2.5 },
              { name: "name", weight: 2.0 },
              { name: "pinyin", weight: 1.0 },
              { name: "pinyin_short", weight: 1.5 },
            ],
            threshold: 0.3,
            includeScore: true,
            ignoreLocation: true,
            minMatchCharLength: 1,
          });
          setFuse(fuseInstance);
        }
      } catch (error) {
        console.error("加载股票列表失败:", error);
      } finally {
        setStocksLoading(false);
      }
    };

    loadStocks();
  }, []);

  useEffect(() => {
    onQuery({
      code,
      kline_type: klineType,
      limit,
    });
    setCurCode(code);
  }, []);

  const formatOption = (item, isFavorite) => ({
    value: item.code,
    label: (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "4px 0",
        }}
      >
        <span style={{ fontWeight: 500 }}>
          {isFavorite && (
            <StarFilled style={{ color: "#fadb14", marginRight: "6px" }} />
          )}
          {item.name}
        </span>
        <span style={{ color: "#999", fontSize: "12px" }}>{item.code}</span>
      </div>
    ),
  });

  const handleSearch = (searchText) => {
    if (!fuse || !stocks) {
      setSearchOptions([]);
      return;
    }

    if (!searchText || searchText.trim().length < 1) {
      if (favorites.length === 0) {
        setSearchOptions([]);
        return;
      }

      const favoriteStocks = stocks.filter((stock) =>
        favorites.includes(stock.code)
      );
      const options = favoriteStocks.map((item) => formatOption(item, true));
      setSearchOptions(options);
      return;
    }

    const results = fuse.search(searchText.trim()).slice(0, 20);

    const favoriteResults = [];
    const normalResults = [];

    results.forEach((result) => {
      const isFavorite = favorites.includes(result.item.code);
      const option = formatOption(result.item, isFavorite);

      if (isFavorite) {
        favoriteResults.push(option);
      } else {
        normalResults.push(option);
      }
    });

    setSearchOptions([...favoriteResults, ...normalResults]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!code) {
      message.warning("请输入股票代码");
      return;
    }
    if (!limit || limit <= 0) {
      message.warning("请输入有效的数据条数");
      return;
    }
    if (code.startsWith("sh.000") || code.startsWith("sz.399")) {
      if (
        klineType === "1m" ||
        klineType === "5m" ||
        klineType === "15m" ||
        klineType === "30m" ||
        klineType === "60m"
      ) {
        message.warning("指数不支持分钟线查询");
        return;
      }
    }
    setCurCode(code);
    onQuery({
      code,
      kline_type: klineType,
      limit,
    });
  };

  return (
    <header className="app-header">
      <div className="header-content">
        <div className="header-left">
          <Button
            type="text"
            icon={darkMode ? <BulbFilled /> : <BulbOutlined />}
            onClick={onToggleDarkMode}
            className="theme-toggle"
            title={darkMode ? "切换到日间模式" : "切换到夜间模式"}
          />
          <div className="indicator-divider"></div>
          <div className="indicators-control">
            <div className="indicator-group">
              <Checkbox
                checked={indicators.ma5}
                onChange={() => onToggleIndicator("ma5")}
              >
                <span style={{ color: COLORS.ma5 }}>MA5</span>
              </Checkbox>
              <Checkbox
                checked={indicators.ma10}
                onChange={() => onToggleIndicator("ma10")}
              >
                <span style={{ color: COLORS.ma10 }}>MA10</span>
              </Checkbox>
              <Checkbox
                checked={indicators.ma20}
                onChange={() => onToggleIndicator("ma20")}
              >
                <span style={{ color: COLORS.ma20 }}>MA20</span>
              </Checkbox>
              <Checkbox
                checked={indicators.ma30}
                onChange={() => onToggleIndicator("ma30")}
              >
                <span style={{ color: COLORS.ma30 }}>MA30</span>
              </Checkbox>
            </div>
            <div className="indicator-divider"></div>
            <div className="indicator-group">
              <Checkbox
                checked={indicators.bi}
                onChange={() => onToggleIndicator("bi")}
              >
                <span style={{ color: COLORS.biLine }}>笔</span>
              </Checkbox>
              <Checkbox
                checked={indicators.seg}
                onChange={() => onToggleIndicator("seg")}
              >
                <span style={{ color: COLORS.segLine }}>段</span>
              </Checkbox>
              <Checkbox
                checked={indicators.zs}
                onChange={() => onToggleIndicator("zs")}
              >
                <span style={{ color: COLORS.zsLine }}>中枢</span>
              </Checkbox>
              <Checkbox
                checked={indicators.bsPoints}
                onChange={() => onToggleIndicator("bsPoints")}
              >
                <span style={{ color: COLORS.upColor }}>买</span>
                <span style={{ color: COLORS.downColor }}>卖</span>点
              </Checkbox>
            </div>
          </div>
        </div>
        <div className="header-right">
          <form className="query-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <Button
                type="text"
                icon={
                  favorites.includes(curCode) ? (
                    <StarFilled />
                  ) : (
                    <StarOutlined />
                  )
                }
                onClick={() => onToggleFavorite(curCode)}
                className="favorite-toggle"
                title={favorites.includes(curCode) ? "取消收藏" : "收藏"}
                style={{
                  color: favorites.includes(curCode) ? "#fadb14" : undefined,
                }}
              />
            </div>
            <div className="form-group">
              <Select
                value={klineType}
                onChange={setKlineType}
                style={{
                  width: "100px",
                  backgroundColor: darkMode ? "#333" : "#fff",
                  color: darkMode ? "#fff" : "#333",
                }}
                options={[
                  { value: "day", label: "日线" },
                  { value: "week", label: "周线" },
                  { value: "month", label: "月线" },
                  { value: "1m", label: "1分线" },
                  { value: "5m", label: "5分线" },
                  { value: "15m", label: "15分线" },
                  { value: "30m", label: "30分线" },
                  { value: "60m", label: "60分线" },
                ]}
              />
            </div>
            <div className="form-group">
              <AutoComplete
                value={displayValue}
                options={searchOptions}
                open={dropdownOpen}
                showSearch={{ onSearch: handleSearch }}
                popupMatchSelectWidth={300}
                allowClear={true}
                onClick={() => {
                  handleSearch("");
                  setDropdownOpen(true);
                }}
                onSelect={(selectedCode) => {
                  setCode(selectedCode);
                  setDropdownOpen(false);
                }}
                onBlur={() => {
                  if (!code) {
                    setCode(curCode);
                  }
                  setDropdownOpen(false);
                }}
                onChange={(value) => {
                  if (!value) {
                    setCode("");
                    handleSearch("");
                    setDropdownOpen(true);
                    return;
                  }
                  const extractedCode = value.includes("-")
                    ? value.split("-")[1]
                    : value;
                  setCode(extractedCode);
                }}
                placeholder={stocksLoading ? "加载中..." : "代码/名称/拼音"}
                style={{
                  width: "200px",
                  height: "32px",
                  backgroundColor: darkMode ? "#333" : "#fff",
                  color: darkMode ? "#fff" : "#333",
                }}
                notFoundContent={
                  stocksLoading ? <Spin size="small" /> : "无匹配结果"
                }
              />
            </div>
            <div className="form-group">
              <InputNumber
                value={limit}
                onChange={(value) => setLimit(value)}
                placeholder="数据条数"
                min={1}
                max={100000}
                style={{
                  width: "120px",
                  backgroundColor: darkMode ? "#333" : "#fff",
                  color: darkMode ? "#fff" : "#333",
                }}
              />
            </div>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              className="query-button"
            >
              查询
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
};

export default Header;
