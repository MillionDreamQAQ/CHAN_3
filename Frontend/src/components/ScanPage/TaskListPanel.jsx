import { Table, Tag, Button, Popconfirm, Progress } from "antd";
import { DeleteOutlined, ReloadOutlined } from "@ant-design/icons";
import { TASK_STATUS_COLORS, TASK_STATUS_TEXT } from "../../utils/utils";
import "./TaskListPanel.css";

/**
 * 任务列表面板
 */
const TaskListPanel = ({
  tasks = [],
  loading = false,
  selectedTaskId,
  onSelectTask,
  onDeleteTask,
  onRefresh,
  total = 0,
  page = 1,
  pageSize = 20,
  onPageChange,
}) => {
  const columns = [
    {
      title: "时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 90,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 80,
      render: (status) => (
        <Tag color={TASK_STATUS_COLORS[status]}>
          {TASK_STATUS_TEXT[status] || status}
        </Tag>
      ),
    },
    {
      title: "进度",
      dataIndex: "progress",
      key: "progress",
      width: 60,
      render: (progress, record) =>
        record.status === "running" ? (
          <Progress percent={progress} size="small" showInfo={false} />
        ) : (
          `${progress}%`
        ),
    },
    {
      title: "买点",
      dataIndex: "found_count",
      key: "found_count",
      width: 60,
      align: "left",
    },
    {
      title: "耗时",
      dataIndex: "elapsed_time",
      key: "elapsed_time",
      width: 60,
      render: (time) => `${time.toFixed(1)}s`,
    },
    {
      title: "",
      key: "actions",
      width: 40,
      render: (_, record) => (
        <Popconfirm
          title="确定删除此任务？"
          onConfirm={(e) => {
            e.stopPropagation();
            onDeleteTask(record.id);
          }}
          okText="删除"
          cancelText="取消"
        >
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={(e) => e.stopPropagation()}
          />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="task-list-panel">
      <div className="task-list-header">
        <span className="task-list-title">任务列表</span>
        <Button
          type="text"
          icon={<ReloadOutlined />}
          onClick={onRefresh}
          loading={loading}
          size="small"
        />
      </div>
      <div className="task-list-body">
        <Table
          columns={columns}
          dataSource={tasks}
          rowKey="id"
          size="small"
          loading={loading}
          pagination={{
            current: page,
            pageSize: pageSize,
            total: total,
            onChange: onPageChange,
            showSizeChanger: false,
            size: "small",
          }}
          onRow={(record) => ({
            onClick: () => onSelectTask(record.id),
            className: record.id === selectedTaskId ? "selected-row" : "",
          })}
          locale={{ emptyText: "无任务数据" }}
        />
      </div>
    </div>
  );
};

export default TaskListPanel;
