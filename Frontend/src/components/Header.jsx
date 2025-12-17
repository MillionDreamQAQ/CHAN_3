import { useState, useEffect } from "react";
import { Input, DatePicker, Button, Select } from "antd";
import dayjs from "dayjs";
import "./Header.css";

const Header = ({ onQuery, loading }) => {
  const getTodayDate = () => {
    return dayjs().format("YYYY-MM-DD");
  };

  const [code, setCode] = useState("sh.000001");
  const [klineType, setKlineType] = useState("day");
  const [beginTime, setBeginTime] = useState(
    new dayjs().subtract(3, "year").format("YYYY-MM-DD")
  );
  const [endTime, setEndTime] = useState(getTodayDate());

  useEffect(() => {
    onQuery({
      code,
      kline_type: klineType,
      begin_time: beginTime,
      end_time: endTime,
    });
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
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
              style={{ width: "80px" }}
              options={[
                { value: "day", label: "日线" },
                { value: "week", label: "周线" },
                { value: "month", label: "月线" },
              ]}
            />
          </div>
          <div className="form-group">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="如: sz.000001"
              style={{
                border: "1px solid #d9d9d9",
                borderRadius: "6px",
                width: "100px",
              }}
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
