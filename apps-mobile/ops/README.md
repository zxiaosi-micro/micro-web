# ops App（Taro 4 + React Native 双目标，S9-05）

登录/工作台/告警/工单离线草稿/巡检/设置；对接 mobile-bff（client=OPS_APP）。

## 多语言与主题（i18n/prefs，六端统一基建）

偏好中心由 `@micro/shared/prefs` 提供（语言 zh-CN/en-US + 主题 light/dark），本端经
`src/i18n.ts` 的 `setupPrefs()` 装配（app.ts useLaunch 首个调用；AsyncStorage 异步读回）。

**页面落地时的书写规范**（后续新增页面必读）：

1. **文案**：一律 `t("key")`，词条登记在 `src/locales/{zh-CN,en-US}.ts`（zh 为正本，
   en 用 `satisfies OpsMessages` 强制同型，漏键编译期报错）；枚举/状态/会话等跨端
   文案已在 shared `prefs-common`（`enum.ticket.*`/`enum.device.*`/`session.*` 等），
   用 `enumLabel("enum.ticket", status)` 消费，勿重复登记；miss 时枚举回退原值、
   普通词条回退中文，不会白板。
2. **主题**：RN 的 css-to-rn 只支持扁平单类选择器，不支持 CSS 变量——用
   `themed("app-card")`（shared prefs 导出，dark 时返回 `app-card app-card--dark`）
   取成对类；页面根 View 挂 `themed("theme-dark")` 判定底色。样式表在
   `app.scss` 的「暗色主题扁平类集」段维护 `--dark` 变体，新增样式类须同步成对。
3. **切换入口**：设置页落地时提供语言切换（`switchLocale`）与主题开关（`setTheme`），
   参考 `apps-miniapp/*/src/prefs-row.tsx` 的行样式（RN 下用 Pressable 重写）。
