RoadAnalyzer Chrome 插件 — 架構總覽
技術棧
Manifest V3 Chrome Extension
TypeScript + Vite（搭配 @crxjs/vite-plugin）
Lit（輕量 Web Components，僅 5KB）
核心功能
功能 說明
自動偵測 DOM 掃描 + Canvas 讀取，辨識網頁上的路子
五種路子 大路、珠盤路、大眼仔、小路、曱甴路
預測分析 連莊分析 + 模式匹配 + 衍生路共識，信心度上限 75%
多語系 繁中 / 簡中 / 英文
即時更新 MutationObserver 偵測新結果
三層付費制
等級 價格 功能
免費 $0 五種路子 + 基本預測 + 廣告
去廣告 ~$4.99/月 同上，無廣告
進階版 ~$9.99/月 進階預測 + 歷史統計 + 匯出
開發階段
Phase 1 — 路子演算法 + Popup UI + i18n
Phase 2 — 網頁偵測引擎 + 覆蓋層
Phase 3 — 預測系統 + 信心度
Phase 4 — Stripe 付費 + 廣告
Phase 5 — 打磨 + 上架 Chrome Web Store
