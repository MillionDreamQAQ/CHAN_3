import { useNavigate } from "react-router-dom";
import { Button } from "antd";
import { BulbOutlined, BulbFilled, ScanOutlined } from "@ant-design/icons";
import "./Header.css";

const Header = ({ darkMode, onToggleDarkMode }) => {
  const navigate = useNavigate();

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
        </div>
        <div className="header-right">
          <Button
            type="text"
            icon={<ScanOutlined />}
            onClick={() => navigate("/scan")}
            className="scan-trigger"
            title="打开扫描页面"
          />
        </div>
      </div>
    </header>
  );
};

export default Header;
