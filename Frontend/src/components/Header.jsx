import { useState, useEffect, useMemo, useRef } from "react";
import {
  Button,
  Spin,
  Checkbox,
  InputNumber,
  Modal,
  Input,
  List,
  Space,
  Segmented,
} from "antd";
import {
  BulbOutlined,
  BulbFilled,
  StarOutlined,
  StarFilled,
  SearchOutlined,
  ReloadOutlined,
  ScanOutlined,
} from "@ant-design/icons";
import ScanModal from "./ScanModal";
import {
  getColors,
  MA_COLORS,
  MOVING_AVERAGE_PERIODS,
  MA_TYPES,
} from "../config/config";
import axios from "axios";
import Fuse from "fuse.js";
import "./Header.css";

const Header = ({
  onQuery,
  darkMode,
  indicators,
  favorites,
  onSetMAType,
  onToggleIndicator,
  onToggleMAPeriod,
  onToggleDarkMode,
  onToggleFavorite,
}) => {
  const COLORS = useMemo(() => getColors(darkMode), [darkMode]);
  const maColors = useMemo(
    () =>
      MOVING_AVERAGE_PERIODS.reduce((acc, period) => {
        acc[period] = COLORS[period] || MA_COLORS[period];
        return acc;
      }, {}),
    [COLORS]
  );

  const [code, setCode] = useState("sh.000001");
  const [klineType, setKlineType] = useState("day");
  const [limit, setLimit] = useState(2000);

  const [modalOpen, setModalOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [stocksLoading, setStocksLoading] = useState(false);
  const [fuse, setFuse] = useState(null);
  const [stocks, setStocks] = useState([]);

  const searchInputRef = useRef(null);

  const getStockName = (stockCode) => {
    const stock = stocks.find((s) => s.code === stockCode);
    return stock ? stock.name : "";
  };

  const currentStockName = useMemo(() => {
    return getStockName(code);
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
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        setModalOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (modalOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      handleSearch("");
    } else {
      setSearchText("");
      setSearchResults([]);
    }
  }, [modalOpen]);

  useEffect(() => {
    if (modalOpen) {
      handleSearch(searchText);
    }
  }, [favorites]);

  useEffect(() => {
    if (code) {
      onQuery({
        code,
        kline_type: klineType,
        limit,
      });
    }
  }, [code, klineType, limit]);

  const handleSearch = (text) => {
    if (!fuse || !stocks) {
      setSearchResults([]);
      return;
    }

    if (!text || text.trim().length < 1) {
      if (favorites.length === 0) {
        setSearchResults([]);
        return;
      }

      const favoriteStocks = stocks.filter((stock) =>
        favorites.includes(stock.code)
      );
      setSearchResults(
        favoriteStocks.map((item) => ({ ...item, isFavorite: true }))
      );
      return;
    }

    const results = fuse.search(text.trim()).slice(0, 20);

    const favoriteResults = [];
    const normalResults = [];

    results.forEach((result) => {
      const isFavorite = favorites.includes(result.item.code);
      if (isFavorite) {
        favoriteResults.push({ ...result.item, isFavorite: true });
      } else {
        normalResults.push({ ...result.item, isFavorite: false });
      }
    });

    setSearchResults([...favoriteResults, ...normalResults]);
  };

  const handleSelectStock = (stockCode) => {
    setCode(stockCode);
    setModalOpen(false);
  };

  const openSearchModal = () => {
    setModalOpen(true);
  };

  const klineGroups = [
    { label: "月", value: "month" },
    { label: "周", value: "week" },
    { label: "日", value: "day" },
    { label: "60", value: "60m" },
    { label: "30", value: "30m" },
    { label: "15", value: "15m" },
    { label: "5", value: "5m" },
    { label: "1", value: "1m" },
  ];

  return (
    <>
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
                <Segmented
                  size="medium"
                  value={indicators.maType}
                  onChange={onSetMAType}
                  options={[
                    { label: "MA", value: MA_TYPES.MA },
                    { label: "EMA", value: MA_TYPES.EMA },
                  ]}
                />
                {MOVING_AVERAGE_PERIODS.map((period) => (
                  <Checkbox
                    key={period}
                    checked={indicators.maPeriods?.[period]}
                    onChange={() => onToggleMAPeriod(period)}
                  >
                    <span style={{ color: maColors[period] }}>{period}</span>
                  </Checkbox>
                ))}
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
            <div className="stock-info">
              <Button
                type="text"
                icon={<ScanOutlined />}
                onClick={() => setScanModalOpen(true)}
                className="scan-trigger"
                title="批量扫描买点"
              />
              <Button
                type="text"
                icon={<SearchOutlined />}
                onClick={openSearchModal}
                className="search-trigger"
                title="搜索股票 (Ctrl+F)"
              />
              <span className="stock-display" onClick={openSearchModal}>
                {currentStockName && (
                  <span className="stock-name">{currentStockName}</span>
                )}
                <span className="stock-code">{code}</span>
              </span>
              <Button
                type="text"
                icon={
                  favorites.includes(code) ? <StarFilled /> : <StarOutlined />
                }
                onClick={() => onToggleFavorite(code)}
                className="favorite-toggle"
                title={favorites.includes(code) ? "取消收藏" : "收藏"}
                style={{
                  color: favorites.includes(code) ? "#fadb14" : undefined,
                }}
              />
            </div>
            <div className="indicator-divider"></div>
            <div className="kline-buttons">
              <Space.Compact>
                {klineGroups.slice(0, 3).map((item) => (
                  <Button
                    key={item.value}
                    type={klineType === item.value ? "primary" : "default"}
                    size="small"
                    onClick={() => setKlineType(item.value)}
                  >
                    {item.label}
                  </Button>
                ))}
              </Space.Compact>
              <div className="kline-divider"></div>
              <Space.Compact>
                {klineGroups.slice(3, 5).map((item) => (
                  <Button
                    key={item.value}
                    type={klineType === item.value ? "primary" : "default"}
                    size="small"
                    onClick={() => setKlineType(item.value)}
                  >
                    {item.label}
                  </Button>
                ))}
              </Space.Compact>
              <div className="kline-divider"></div>
              <Space.Compact>
                {klineGroups.slice(5, 8).map((item) => (
                  <Button
                    key={item.value}
                    type={klineType === item.value ? "primary" : "default"}
                    size="small"
                    onClick={() => setKlineType(item.value)}
                  >
                    {item.label}
                  </Button>
                ))}
              </Space.Compact>
            </div>
            <InputNumber
              value={limit}
              onChange={(value) => setLimit(value)}
              placeholder="数据条数"
              changeOnWheel={true}
              step={1000}
              min={1000}
              max={20000}
              size="small"
              style={{
                width: "80px",
                height: "32px",
                backgroundColor: darkMode ? "#333" : "#fff",
                color: darkMode ? "#fff" : "#333",
              }}
            />
            <Button
              type="default"
              icon={<ReloadOutlined />}
              onClick={() => onQuery({ code, kline_type: klineType, limit })}
              className="refresh-button"
              title="刷新数据"
              size="small"
              style={{
                height: "32px",
                width: "32px",
              }}
            />
          </div>
        </div>
      </header>

      <Modal
        title="搜索股票"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={600}
        destroyOnHidden={true}
      >
        <div className="stock-search-modal">
          <Input
            ref={searchInputRef}
            placeholder="输入股票代码/名称/拼音搜索"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              handleSearch(e.target.value);
            }}
            prefix={<SearchOutlined style={{ marginRight: "6px" }} />}
            allowClear
            size="large"
            style={{ marginBottom: 16 }}
          />
          {stocksLoading ? (
            <div style={{ textAlign: "center", padding: "40px" }}>
              <Spin />
            </div>
          ) : searchResults.length > 0 ? (
            <List
              dataSource={searchResults}
              renderItem={(item) => (
                <List.Item
                  onClick={() => handleSelectStock(item.code)}
                  style={{ cursor: "pointer" }}
                  className="stock-list-item"
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      width: "100%",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 500,
                        fontSize: "14px",
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {item.isFavorite ? (
                        <StarFilled
                          style={{
                            color: "#fadb14",
                            marginRight: "8px",
                            cursor: "pointer",
                            fontSize: "16px",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(item.code);
                          }}
                          title="取消收藏"
                          className="favorite-star-icon"
                        />
                      ) : (
                        <StarOutlined
                          style={{
                            color: "#d9d9d9",
                            marginRight: "8px",
                            cursor: "pointer",
                            fontSize: "16px",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(item.code);
                          }}
                          title="添加收藏"
                          className="favorite-star-icon unfavorite"
                        />
                      )}
                      {item.name}
                    </span>
                    <span style={{ color: "#999", fontSize: "13px" }}>
                      {item.code}
                    </span>
                  </div>
                </List.Item>
              )}
              style={{ maxHeight: "400px", overflowY: "auto" }}
            />
          ) : (
            <div
              style={{
                textAlign: "center",
                padding: "40px",
                color: "#999",
              }}
            >
              {searchText ? "无匹配结果" : "请输入关键词搜索"}
            </div>
          )}
        </div>
      </Modal>

      <ScanModal
        open={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        onSelectStock={(stockCode) => {
          setCode(stockCode);
        }}
      />
    </>
  );
};

export default Header;
