// subscribe.ts · 微信订阅消息授权封装（告警提醒场景，S9-02）。
// 模板 ID 为占位常量——正式模板须在微信公众平台申请后替换（04 §3 F2 用户侧动作）。

import Taro from "@tarojs/taro";

/** 告警提醒模板 ID（占位：04 §3 F2 申请后填入；空串=未配置，跳过授权不弹窗） */
export const TPL_ID_ALERT: string = ""; // 显式 string（避免字面量 "" 收窄为 never[]）

/**
 * 请求告警提醒订阅授权（首页入口调用）。
 * 一次性订阅特性：每次触发推送前都应调用（用户勾选"总是保持以上选择"后不再弹窗）。
 * 模板未配置（占位阶段）直接返回 false；用户拒绝/场景不支持亦返回 false，不阻塞主流程。
 */
export async function requestAlertSubscribe(): Promise<boolean> {
  if (!TPL_ID_ALERT) {
    Taro.showToast({ title: "订阅消息模板未配置（占位）", icon: "none" });
    return false;
  }
  try {
    // Taro 类型把 Option 交叉了 RN 变体（entityIds 必填）——weapp 实际只需 tmplIds，收窄断言
    const res = (await Taro.requestSubscribeMessage({
      tmplIds: [TPL_ID_ALERT],
    } as never)) as Record<string, string>;
    return res[TPL_ID_ALERT] === "accept";
  } catch {
    return false;
  }
}
