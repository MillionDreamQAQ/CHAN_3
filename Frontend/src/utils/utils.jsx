//根据输入的字符串和isBug属性返回对应的字符和详细描述

// - 1,2：分别表示1，2，3类买卖点
// - 2s：类二买卖点
// - 1p：盘整背驰1类买卖点
// - 3a：中枢出现在1类后面的3类买卖点（3-after）
// - 3b：中枢出现在1类前面的3类买卖点（3-before）

// 返回值示例：{"text": "买1", "description": "买入点类型1"}
export const getBsPointData = (typeStr, isBuy) => {
  typeStr = typeStr.match(/'([^']+)'/)[1];
  const typeMap = {
    1: isBuy ? "买1" : "卖1",
    2: isBuy ? "买2" : "卖2",
    3: isBuy ? "买3" : "卖3",
    "2s": isBuy ? "买2s" : "卖2s",
    "1p": isBuy ? "买1p" : "卖1p",
    "3a": isBuy ? "买3a" : "卖3a",
    "3b": isBuy ? "买3b" : "卖3b",
  };
  const descriptionMap = {
    1: isBuy ? "1类买点" : "1类卖点",
    2: isBuy ? "2类买点" : "2类卖点",
    3: isBuy ? "3类买点" : "3类卖点",
    "2s": isBuy ? "类2买点" : "类2卖点",
    "1p": isBuy ? "盘整背驰1类买点" : "盘整背驰1类卖点",
    "3a": isBuy ? "中枢出现在1类后面的3类买点" : "中枢出现在1类前面的3类卖点",
    "3b": isBuy ? "中枢出现在1类前面的3类买点" : "中枢出现在1类后面的3类卖点",
  };
  return {
    text: typeMap[typeStr] || "Unknown",
    description: descriptionMap[typeStr] || "Unknown",
  };
};
