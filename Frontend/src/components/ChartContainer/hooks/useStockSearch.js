import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import Fuse from "fuse.js";

/**
 * 股票搜索 Hook
 * 封装股票列表加载、Fuse.js 搜索初始化和搜索方法
 */
const useStockSearch = () => {
  const [stocks, setStocks] = useState([]);
  const [fuse, setFuse] = useState(null);
  const [loading, setLoading] = useState(false);

  // 加载股票列表
  useEffect(() => {
    const loadStocks = async () => {
      setLoading(true);
      try {
        const response = await axios.get(
          "http://localhost:8000/api/stocks/list"
        );
        if (response.data.success) {
          const stocksData = response.data.data;
          setStocks(stocksData);

          // 使用 Fuse.js 创建模糊搜索引擎
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
        setLoading(false);
      }
    };

    loadStocks();
  }, []);

  /**
   * 搜索股票
   * @param {string} text - 搜索文本
   * @param {string[]} favorites - 收藏列表
   * @returns {Array} 搜索结果，收藏优先
   */
  const search = useCallback(
    (text, favorites = []) => {
      if (!fuse || !stocks) {
        return [];
      }

      // 空搜索显示收藏列表
      if (!text || text.trim().length < 1) {
        if (favorites.length === 0) {
          return [];
        }
        const favoriteStocks = stocks.filter((stock) =>
          favorites.includes(stock.code)
        );
        return favoriteStocks.map((item) => ({ ...item, isFavorite: true }));
      }

      // 模糊搜索 + 收藏优先
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

      return [...favoriteResults, ...normalResults];
    },
    [fuse, stocks]
  );

  /**
   * 根据股票代码获取股票名称
   * @param {string} code - 股票代码
   * @returns {string} 股票名称
   */
  const getStockName = useCallback(
    (code) => {
      const stock = stocks.find((s) => s.code === code);
      return stock ? stock.name : "";
    },
    [stocks]
  );

  return {
    stocks,
    loading,
    search,
    getStockName,
  };
};

export default useStockSearch;
