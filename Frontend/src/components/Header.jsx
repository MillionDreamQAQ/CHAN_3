import { useState, useEffect } from "react";
import { AutoComplete, DatePicker, Button, Select, Spin, message } from "antd";
import dayjs from "dayjs";
import axios from "axios";
import Fuse from "fuse.js";
import "./Header.css";

const Header = ({ onQuery, loading }) => {
  // baostock API只提供到昨天的数据
  const getYesterdayDate = () => {
    return dayjs().format("YYYY-MM-DD");
  };

  const [code, setCode] = useState("sh.000001");
  const [klineType, setKlineType] = useState("day");
  const [beginTime, setBeginTime] = useState(
    new dayjs().subtract(3, "year").format("YYYY-MM-DD")
  );
  const [endTime, setEndTime] = useState(getYesterdayDate());

  const [searchOptions, setSearchOptions] = useState([]);
  const [stocksLoading, setStocksLoading] = useState(false);
  const [fuse, setFuse] = useState(null);

  useEffect(() => {
    const loadStocks = async () => {
      setStocksLoading(true);
      try {
        const response = await axios.get(
          "http://localhost:8000/api/stocks/list"
        );
        if (response.data.success) {
          const stocks = response.data.data;

          const fuseInstance = new Fuse(stocks, {
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
      begin_time: beginTime,
      end_time: endTime,
    });
  }, []);

  const handleSearch = (searchText) => {
    if (!searchText || searchText.trim().length < 1 || !fuse) {
      setSearchOptions([]);
      return;
    }

    const results = fuse.search(searchText.trim()).slice(0, 20);

    const options = results.map(({ item }) => ({
      value: item.code,
      label: (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "4px 0",
          }}
        >
          <span style={{ fontWeight: 500 }}>{item.name}</span>
          <span style={{ color: "#999", fontSize: "12px" }}>{item.code}</span>
        </div>
      ),
    }));

    setSearchOptions(options);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!code) {
      message.warning("请输入股票代码");
      return;
    }
    if (!beginTime) {
      message.warning("请选择开始时间");
      return;
    }
    onQuery({
      code,
      kline_type: klineType,
      begin_time: beginTime,
      end_time: endTime || undefined,
    });
  };

  return (
    <header className="app-header">
      <div className="header-content">
        <form className="query-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <Select
              value={klineType}
              onChange={setKlineType}
              style={{ width: "100px" }}
              options={[
                { value: "day", label: "日线" },
                { value: "week", label: "周线" },
                { value: "month", label: "月线" },
                { value: "5m", label: "5分线" },
                { value: "15m", label: "15分线" },
                { value: "30m", label: "30分线" },
                { value: "60m", label: "60分线" },
              ]}
            />
          </div>
          <div className="form-group">
            <AutoComplete
              value={code}
              options={searchOptions}
              showSearch={{ onSearch: handleSearch }}
              onClick={() => setCode(null)}
              onSelect={(value) => setCode(value)}
              onChange={(value) => setCode(value)}
              placeholder={stocksLoading ? "加载中..." : "代码/名称/拼音"}
              style={{ width: "160px", height: "32px" }}
              notFoundContent={
                stocksLoading ? <Spin size="small" /> : "无匹配结果"
              }
            />
          </div>
          <div className="form-group">
            <DatePicker
              value={beginTime ? dayjs(beginTime) : null}
              onChange={(date, dateString) => setBeginTime(dateString)}
              placeholder="选择开始时间"
              format="YYYY-MM-DD"
              style={{ width: "120px" }}
            />
          </div>
          <div className="form-group">
            <DatePicker
              value={endTime ? dayjs(endTime) : null}
              onChange={(date, dateString) => setEndTime(dateString)}
              placeholder="选择结束时间"
              format="YYYY-MM-DD"
              style={{ width: "120px" }}
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
    </header>
  );
};

export default Header;
