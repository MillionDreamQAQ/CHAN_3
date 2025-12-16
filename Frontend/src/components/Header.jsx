import { useState } from 'react';
import './Header.css';

const Header = ({ onQuery, loading }) => {
  const [code, setCode] = useState('sz.000001');
  const [beginTime, setBeginTime] = useState('2023-01-01');
  const [endTime, setEndTime] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onQuery({ code, begin_time: beginTime, end_time: endTime || undefined });
  };

  return (
    <header className="app-header">
      <div className="header-content">
        <h1 className="header-title">缠论分析系统</h1>
        <form className="query-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>股票代码</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="例如: sz.000001"
              required
            />
          </div>
          <div className="form-group">
            <label>开始时间</label>
            <input
              type="date"
              value={beginTime}
              onChange={(e) => setBeginTime(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>结束时间</label>
            <input
              type="date"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              placeholder="不填则为当前时间"
            />
          </div>
          <button type="submit" className="query-button" disabled={loading}>
            {loading ? '查询中...' : '查询'}
          </button>
        </form>
      </div>
    </header>
  );
};

export default Header;
