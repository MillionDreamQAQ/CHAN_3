import { useState, useEffect, useRef } from "react";
import { Modal, Input, List, Spin } from "antd";
import { SearchOutlined, StarOutlined, StarFilled } from "@ant-design/icons";
import "./StockSearchModal.css";

/**
 * 股票搜索弹窗组件
 */
const StockSearchModal = ({
  open,
  onClose,
  onSelectStock,
  favorites,
  onToggleFavorite,
  stocksLoading,
  search,
}) => {
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const searchInputRef = useRef(null);

  // 打开弹窗时聚焦输入框并显示收藏
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      handleSearch("");
    } else {
      setSearchText("");
      setSearchResults([]);
    }
  }, [open]);

  // 收藏变化时更新搜索结果
  useEffect(() => {
    if (open) {
      handleSearch(searchText);
    }
  }, [favorites]);

  const handleSearch = (text) => {
    const results = search(text, favorites);
    setSearchResults(results);
  };

  const handleSelectStock = (stockCode) => {
    onSelectStock(stockCode);
    onClose();
  };

  return (
    <Modal
      title="搜索股票"
      open={open}
      onCancel={onClose}
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
  );
};

export default StockSearchModal;
