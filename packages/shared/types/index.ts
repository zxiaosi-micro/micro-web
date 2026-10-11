// index.ts · types 聚合出口。
// admin-bff 为默认聚合；mobile-bff 类型经 "@micro/shared/types/mobile-bff" 子路径导入
// （两端 BFF 契约存在同名类型 TokenPair/RefreshReq 等，双 export * 会 TS2308 冲突）。
export * from "./admin-bff";
