import { useState, useEffect } from "react";
import { Input, DatePicker, Button } from "antd";
import dayjs from "dayjs";
import "./Header.css";

const Header = ({ onQuery, loading }) => {
  const getTodayDate = () => {
    return dayjs().format("YYYY-MM-DD");
  };

  const [code, setCode] = useState("sh.000001");
  const [beginTime, setBeginTime] = useState(
    new dayjs().subtract(10, "year").format("YYYY-MM-DD")
  );
  const [endTime, setEndTime] = useState(getTodayDate());

  useEffect(() => {
    onQuery({ code, begin_time: beginTime, end_time: endTime });
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    onQuery({ code, begin_time: beginTime, end_time: endTime || undefined });
  };

  return (
    <header className="app-header">
      <div className="header-content">
        <form className="query-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="如: sz.000001"
              style={{
                border: "1px solid #d9d9d9",
                borderRadius: "6px",
                width: "160px",
              }}
            />
          </div>
          <div className="form-group">
            <DatePicker
              value={beginTime ? dayjs(beginTime) : null}
              onChange={(date, dateString) => setBeginTime(dateString)}
              placeholder="选择开始时间"
              format="YYYY-MM-DD"
              style={{ width: "100%" }}
            />
          </div>
          <div className="form-group">
            <DatePicker
              value={endTime ? dayjs(endTime) : null}
              onChange={(date, dateString) => setEndTime(dateString)}
              placeholder="选择结束时间"
              format="YYYY-MM-DD"
              style={{ width: "100%" }}
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
