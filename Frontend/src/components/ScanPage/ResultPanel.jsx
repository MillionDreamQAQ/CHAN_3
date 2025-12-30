import React, { useMemo } from "react";
import { Table, Tag, Empty } from "antd";
import { BSP_TYPE_COLORS } from "../../constants/scan";
import "./ResultPanel.css";

/**
 * 扫描结果面板
 */
const ResultPanel = ({
  results = [],
  loading = false,
  onSelectStock,
  taskStatus,
}) => {
  const bspTypeFilters = useMemo(() => {
    const types = [...new Set(results.map((r) => r.bsp_type))];
    return types.map((t) => ({ text: t.toUpperCase(), value: t }));
  }, [results]);

  const columns = [
    {
      title: "代码",
      dataIndex: "code",
      key: "code",
      width: 100,
      sorter: (a, b) => a.code.localeCompare(b.code),
    },
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
      width: 100,
      ellipsis: true,
    },
    {
      title: "买点类型",
      dataIndex: "bsp_type",
      key: "bsp_type",
      width: 90,
      filters: bspTypeFilters,
      onFilter: (value, record) => record.bsp_type === value,
      render: (type) => (
        <Tag color={BSP_TYPE_COLORS[type]}>{type.toUpperCase()}</Tag>
      ),
    },
    {
      title: "买点时间",
      dataIndex: "bsp_time",
      key: "bsp_time",
      width: 140,
      sorter: (a, b) => a.bsp_time.localeCompare(b.bsp_time),
      defaultSortOrder: "descend",
    },
    {
      title: "价格",
      dataIndex: "bsp_value",
      key: "bsp_value",
      width: 80,
      align: "left",
      sorter: (a, b) => a.bsp_value - b.bsp_value,
      render: (value) => value.toFixed(2),
    },
    {
      title: "K线级别",
      dataIndex: "kline_type",
      key: "kline_type",
      width: 80,
    },
  ];

  if (!results.length && !loading) {
    return (
      <div className="result-panel empty">
        <Empty
          description={
            taskStatus
              ? taskStatus === "running"
                ? "扫描进行中..."
                : "未找到符合条件的买点"
              : "请选择一个任务查看结果"
          }
        />
      </div>
    );
  }

  return (
    <div className="result-panel">
      <div className="result-header">
        <span className="result-title">扫描结果</span>
        <span className="result-count">共 {results.length} 个买点</span>
      </div>
      <div className="result-body">
        <Table
          columns={columns}
          dataSource={results}
          rowKey={(record) =>
            `${record.code}-${record.bsp_time}-${record.bsp_type}`
          }
          size="small"
          loading={loading}
          pagination={{
            pageSize: 50,
            showSizeChanger: false,
            size: "small",
            showTotal: (total) => `共 ${total} 条`,
          }}
          onRow={(record) => ({
            onClick: () => onSelectStock?.(record),
            style: { cursor: "pointer" },
          })}
        />
      </div>
    </div>
  );
};

export default ResultPanel;
