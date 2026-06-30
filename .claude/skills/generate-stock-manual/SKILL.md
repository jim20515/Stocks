---
name: generate-stock-manual
description: 為「股票看板」投資組合管理系統重新生成使用者操作手冊（DOCX）。當使用者說「重新生成手冊」、「更新操作手冊」、「截圖並生成手冊」、「更新說明文件」時使用此 skill。流程包含：重新截取所有頁面截圖 → 生成 Word 操作手冊，輸出到專案目錄。
---

# 股票看板操作手冊生成 Skill

此 skill 負責為「股票看板」系統重新截圖並生成最新的 DOCX 使用者操作手冊。

## 路徑與環境

- **專案目錄**：`/Users/jim/AI系統/Stocks`
- **截圖目錄**：`/Users/jim/AI系統/Stocks/.claude/screenshots`
- **截圖腳本**：`/Users/jim/AI系統/Stocks/.claude/skills/generate-stock-manual/scripts/screenshot-all.cjs`
- **手冊腳本**：`/Users/jim/AI系統/Stocks/.claude/skills/generate-stock-manual/scripts/gen-manual.cjs`
- **輸出手冊**：`/Users/jim/AI系統/Stocks/docs/股票看板_操作手冊.docx`
- **docx 套件**：`/Users/jim/AI系統/Stocks/.claude/skills/generate-stock-manual/node_modules`
- **Dev Server**：`http://localhost:3000`（需先確認是否執行中）

## 執行流程

### 步驟 1：確認 Dev Server 狀態

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
```

回傳 200 即可繼續。若未執行，告知使用者需先啟動 dev server（`npm run dev`）。

### 步驟 2：清除舊截圖並重新截圖

```bash
rm -f "/Users/jim/AI系統/Stocks/.claude/screenshots/"*.png
cd "/Users/jim/AI系統/Stocks" && node ".claude/skills/generate-stock-manual/scripts/screenshot-all.cjs"
```

截圖腳本說明：
- 登入帳號：jim@sixdots.com.tw / Jim2017060!
- 截取 12 個頁面，依序存為 01_總覽儀表板.png ～ 12_帳戶管理.png
- 若登入頁有 vite-error-overlay，腳本會先用 JS 移除再操作

若截圖腳本有任何錯誤（如 Playwright 找不到元素、timeout），閱讀錯誤訊息並修正對應的 selector 後重新執行。

### 步驟 3：生成 DOCX 手冊

```bash
cd "/Users/jim/AI系統/Stocks/.claude/skills/generate-stock-manual" && \
node scripts/gen-manual.cjs
```

手冊腳本說明：
- 讀取 `.claude/screenshots/` 目錄的 PNG 截圖
- 使用 skill 本地的 docx npm 套件生成 Word 文件
- 包含封面、目錄、12 個功能章節、常見問題
- 輸出到 `docs/股票看板_操作手冊.docx`

### 步驟 4：確認輸出

```bash
ls -lh "/Users/jim/AI系統/Stocks/docs/股票看板_操作手冊.docx"
```

確認檔案存在且大小合理（通常約 1～2 MB）後，告知使用者手冊已更新完成。

## 手冊章節結構

| 章節 | 內容 | 對應截圖 |
|------|------|---------|
| 1 | 系統簡介與適合對象 | — |
| 2 | 快速開始（註冊、登入） | — |
| 3 | 總覽儀表板 | 01_總覽儀表板.png |
| 4 | 持股管理（新增、匯入） | 02_持股管理.png、03_新增交易視窗.png |
| 5 | 每日漲幅 | 04_每日漲幅.png |
| 6 | 資產配置 | 05_資產配置.png |
| 7 | 水位分析 | 06_水位分析.png |
| 8 | 回測分析 | 07_回測分析.png、08_回測結果.png |
| 9 | 策略回測（網格／每日反轉／目標報酬） | 09_策略回測.png |
| 10 | 更新歷史數據 | 10_更新歷史數據.png |
| 11 | 人生目標 | 11_人生目標.png |
| 12 | 帳戶管理 | 12_帳戶管理.png |
| 13 | 常見問題 | — |

## 更新手冊內容

若系統有新增或修改頁面，需同步更新腳本：

1. **新增截圖**：在 `scripts/screenshot-all.cjs` 加入新頁面的截圖邏輯
2. **新增章節**：在 `scripts/gen-manual.cjs` 加入對應的 `h1()`、`h2()`、`imgScaled()` 內容
3. **更新說明文字**：修改對應章節的 `p()`、`bullet()` 內容

## 注意事項

- `screenshot-all.cjs` 需在 `/Users/jim/AI系統/Stocks/` 目錄執行，才能找到 Playwright
- `gen-manual.cjs` 需在 skill 目錄執行，才能找到本地 `node_modules/docx`
- 截圖共 12 張，若有缺少會影響對應章節的圖片（章節文字仍會保留）
- 手冊生成約需 5～10 秒
