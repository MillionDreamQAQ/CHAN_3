import React, { useMemo } from "react";
import { Table, Tag, Empty, Button, Space, message } from "antd";
import { FileExcelOutlined, EyeOutlined } from "@ant-design/icons";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
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
  onViewAllResults,
  viewingAll = false,
  allResultsData = null,
}) => {
  const bspTypeFilters = useMemo(() => {
    const types = [...new Set(results.map((r) => r.bsp_type))];
    return types.map((t) => ({ text: t.toUpperCase(), value: t }));
  }, [results]);

  const handleExportExcel = () => {
    if (!results || results.length === 0) {
      message.warning("暂无数据可导出");
      return;
    }

    try {
      const wb = XLSX.utils.book_new();

      if (viewingAll && allResultsData && allResultsData.tasks) {
        const tasksData = allResultsData.tasks.map((task, index) => ({
          序号: index + 1,
          任务ID: task.id.substring(0, 8) + "...",
          创建时间: task.created_at,
          状态: task.status,
          股票池: task.stock_pool,
          板块: task.boards ? task.boards.join(", ") : "-",
          K线级别: task.kline_type,
          买点类型: task.bsp_types.join(", "),
          "时间窗口(天)": task.time_window_days,
          找到买点数: task.found_count,
          "耗时(秒)": task.elapsed_time.toFixed(2),
        }));

        const ws1 = XLSX.utils.json_to_sheet(tasksData);
        ws1["!cols"] = [
          { wch: 6 },
          { wch: 15 },
          { wch: 20 },
          { wch: 10 },
          { wch: 10 },
          { wch: 20 },
          { wch: 10 },
          { wch: 15 },
          { wch: 12 },
          { wch: 12 },
          { wch: 12 },
        ];
        XLSX.utils.book_append_sheet(wb, ws1, "任务信息");
      }

      const resultsData = results.map((item, index) => ({
        序号: index + 1,
        股票代码: item.code,
        股票名称: item.name || "-",
        买点类型: item.bsp_type.toUpperCase(),
        买点时间: item.bsp_time,
        价格: item.bsp_value.toFixed(2),
        K线级别: item.kline_type,
        ...(viewingAll && {
          任务ID: item.task_id?.substring(0, 8) + "..." || "-",
        }),
      }));

      const ws2 = XLSX.utils.json_to_sheet(resultsData);
      const cols = [
        { wch: 6 },
        { wch: 12 },
        { wch: 12 },
        { wch: 10 },
        { wch: 20 },
        { wch: 10 },
        { wch: 10 },
      ];
      if (viewingAll) cols.push({ wch: 15 });
      ws2["!cols"] = cols;

      XLSX.utils.book_append_sheet(wb, ws2, "扫描结果");

      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:-]/g, "")
        .replace("T", "_");
      const filename = viewingAll
        ? `扫描结果汇总_${timestamp}.xlsx`
        : `扫描结果_${timestamp}.xlsx`;

      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], { type: "application/octet-stream" });
      saveAs(blob, filename);

      message.success(`已导出 ${results.length} 条结果`);
    } catch (error) {
      console.error("导出Excel失败:", error);
      message.error("导出Excel失败，请重试");
    }
  };

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
    },
    {
      title: "价格",
      dataIndex: "bsp_value",
      key: "bsp_value",
      width: 80,
      align: "left",
      sorter: (a, b) => a.bsp_value - b.bsp_value,
      render: (value) => value.toFixed(2),
      defaultSortOrder: "descend",
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
        <span className="result-title">
          {viewingAll ? "所有任务扫描结果" : "当前扫描结果"}
        </span>
        <Space size="small">
          <span className="result-count">共 {results.length} 个买点</span>
          {!viewingAll && (
            <Button
              type="primary"
              size="small"
              icon={<EyeOutlined />}
              onClick={onViewAllResults}
            >
              查看所有结果
            </Button>
          )}
          <Button
            type="primary"
            size="small"
            icon={<FileExcelOutlined />}
            onClick={handleExportExcel}
            disabled={!results || results.length === 0}
          >
            导出Excel
          </Button>
        </Space>
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
