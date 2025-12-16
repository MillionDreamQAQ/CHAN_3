# 缠论分析后端API

基于FastAPI和chan.py构建的缠论分析后端服务。

## 安装

```bash
pip install -r requirements.txt
```

## 运行

```bash
python run.py
```

服务将在 http://localhost:8000 启动

## API文档

启动服务后访问:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## API接口

### POST /api/chan/calculate

计算缠论数据

**请求体:**
```json
{
  "code": "sz.000001",
  "begin_time": "2023-01-01",
  "end_time": "2023-12-31"
}
```

**响应:**
```json
{
  "code": "sz.000001",
  "klines": [...],
  "bi_list": [...],
  "seg_list": [...],
  "bs_points": [...],
  "zs_list": [...],
  "cbsp_list": [...]
}
```
