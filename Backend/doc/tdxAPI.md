### 1. 获取股票全部历史 K 线

**接口**: `GET /api/kline-all`

**描述**: 返回指定股票在某个周期的全部历史 K 线数据（天、周、月自动使用前复权）。

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| code | string | 是 | 股票代码 |
| type | string | 否 | K 线类型，默认 day，可选 minute1/5/15/30/hour/day/week/month/quarter/year |
| limit | int | 否 | 返回条数限制（从最近开始截取） |

**注意**: 全量数据较大，建议配合 `limit` 控制响应大小。

---

### 2. 获取指数全部历史 K 线

**接口**: `GET /api/index/all`

**描述**: 返回指数在各周期的全部历史 K 线数据。

**请求参数**与 `/api/kline-all` 相同。

---

### 3. 获取 ETF 列表

**接口**: `GET /api/etf`

**描述**: 返回当前可用的 ETF 基金列表，可按交易所过滤并限制返回数量。

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| exchange | string | 否 | 交易所，`sh` / `sz` / `all`（默认） |
| limit | int | 否 | 返回条数限制 |

**响应示例**:

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "total": 2,
    "list": [
      {
        "code": "510300",
        "name": "沪深300ETF",
        "exchange": "sh",
        "last_price": 4.123
      },
      {
        "code": "159915",
        "name": "创业板ETF",
        "exchange": "sz",
        "last_price": 1.876
      }
    ]
  }
}
```
