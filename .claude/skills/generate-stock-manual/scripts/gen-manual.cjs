const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  PageNumber, Header, Footer, ExternalHyperlink, PageBreak,
  LevelFormat, TableOfContents
} = require('docx')
const fs = require('fs')
const path = require('path')

const SCREENSHOTS = '/Users/jim/AI系統/Stocks/.claude/screenshots'
const OUT = '/Users/jim/AI系統/Stocks/docs/股票看板_操作手冊.docx'

// A4: 11906 x 16838 DXA, 1" margins = 9026 content width
const CONTENT_W = 9026
// Image: 1440x900 → scale to content width
const IMG_W_EMU = Math.round(CONTENT_W * 635)   // 9026 * 635 ≈ 5,731,510
const IMG_H_EMU = Math.round(IMG_W_EMU * 900 / 1440)

function img(filename, altText) {
  const p = path.join(SCREENSHOTS, filename)
  if (!fs.existsSync(p)) return null
  return new Paragraph({
    spacing: { before: 120, after: 240 },
    children: [new ImageRun({
      type: 'png',
      data: fs.readFileSync(p),
      transformation: { width: Math.round(CONTENT_W * 914400 / 1440 / 914400 * 595), height: Math.round(CONTENT_W * 914400 / 1440 / 914400 * 595 * 900 / 1440) },
      altText: { title: altText, description: altText, name: altText }
    })]
  })
}

function imgScaled(filename, altText) {
  const p = path.join(SCREENSHOTS, filename)
  if (!fs.existsSync(p)) return null
  // width in points: A4 content = ~453 pt; scale to fit
  const widthPt = 453
  const heightPt = Math.round(widthPt * 900 / 1440)
  return new Paragraph({
    spacing: { before: 120, after: 240 },
    children: [new ImageRun({
      type: 'png',
      data: fs.readFileSync(p),
      transformation: { width: widthPt, height: heightPt },
      altText: { title: altText, description: altText, name: altText }
    })]
  })
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 160 },
    children: [new TextRun({ text, bold: true, size: 36, font: 'Arial' })]
  })
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 120 },
    children: [new TextRun({ text, bold: true, size: 28, font: 'Arial' })]
  })
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, size: 24, font: 'Arial' })]
  })
}

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 120 },
    children: [new TextRun({ text, size: 22, font: 'Arial', ...opts })]
  })
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, size: 22, font: 'Arial' })]
  })
}

function note(text) {
  return new Paragraph({
    spacing: { before: 80, after: 120 },
    children: [
      new TextRun({ text: '💡 ', size: 22 }),
      new TextRun({ text, size: 22, font: 'Arial', color: '4472C4', italics: true })
    ]
  })
}

function tip(text) {
  return new Paragraph({
    spacing: { before: 80, after: 120 },
    children: [
      new TextRun({ text: '⚠️ ', size: 22 }),
      new TextRun({ text, size: 22, font: 'Arial', color: 'C55A11' })
    ]
  })
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] })
}

function sep() {
  return new Paragraph({
    spacing: { before: 160, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 1 } },
    children: []
  })
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: 'Arial', color: '1F3864' },
        paragraph: { spacing: { before: 480, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'Arial', color: '2E75B6' },
        paragraph: { spacing: { before: 320, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial', color: '2E75B6' },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({ children: [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 4 } },
          children: [new TextRun({ text: '股票看板 — 使用者操作手冊', size: 18, font: 'Arial', color: '888888' })]
        })
      ]})
    },
    footers: {
      default: new Footer({ children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 4 } },
          children: [
            new TextRun({ text: '第 ', size: 18, font: 'Arial', color: '888888' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, font: 'Arial', color: '888888' }),
            new TextRun({ text: ' 頁', size: 18, font: 'Arial', color: '888888' }),
          ]
        })
      ]})
    },
    children: [
      // ── 封面 ──
      new Paragraph({ spacing: { before: 2000, after: 400 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '股票看板', size: 72, bold: true, font: 'Arial', color: '1F3864' })] }),
      new Paragraph({ spacing: { before: 0, after: 200 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'Stock Dashboard', size: 32, font: 'Arial', color: '2E75B6' })] }),
      new Paragraph({ spacing: { before: 0, after: 600 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '使用者操作手冊', size: 40, font: 'Arial', color: '444444' })] }),
      new Paragraph({ spacing: { before: 0, after: 200 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '適合長期投資者的投資組合管理工具', size: 24, font: 'Arial', color: '666666', italics: true })] }),
      new Paragraph({ spacing: { before: 400, after: 80 }, alignment: AlignmentType.CENTER,
        children: [new ExternalHyperlink({
          link: 'https://stocks-six-eta.vercel.app/',
          children: [new TextRun({ text: 'https://stocks-six-eta.vercel.app/', size: 22, font: 'Arial', style: 'Hyperlink' })]
        })]
      }),
      new Paragraph({ spacing: { before: 80, after: 80 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '最後更新：2026 年 6 月', size: 20, font: 'Arial', color: '888888' })] }),

      pageBreak(),

      // ── 目錄 ──
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: '目錄', bold: true, size: 36, font: 'Arial' })] }),
      new TableOfContents('目錄', { hyperlink: true, headingStyleRange: '1-2' }),

      pageBreak(),

      // ── 1. 系統簡介 ──
      h1('1. 系統簡介'),
      p('股票看板是一套專為長期投資者設計的個人投資組合管理系統。不同於一般券商 App 只能查看最近一年的損益，本系統能完整記錄從第一筆交易開始的所有歷史，讓你清楚掌握真實的投資績效。'),

      h2('1.1 主要特色'),
      bullet('完整損益記錄：從第一筆交易開始計算，不受時間限制'),
      bullet('多帳戶管理：整合自己、家人等多個帳戶，一目瞭然'),
      bullet('多券商整合：支援富邦、國泰等多家券商對帳單匯入'),
      bullet('策略回測：網格、每日反轉、目標報酬等策略歷史模擬'),
      bullet('每日市值追蹤：自動補齊每個交易日的總資產變化'),

      h2('1.2 適合對象'),
      bullet('長期持有台股、ETF 的投資者'),
      bullet('在多家券商開戶、需要整合查看的投資者'),
      bullet('家庭成員帳戶需要統一管理的投資者'),
      bullet('想了解歷史策略績效的投資者'),

      tip('本系統適合長期投資，不適合頻繁短線交易的追蹤。'),

      pageBreak(),

      // ── 2. 快速開始 ──
      h1('2. 快速開始'),

      h2('2.1 註冊帳號'),
      p('開啟瀏覽器前往系統網址，點選「註冊」頁籤，輸入電子郵件與密碼後即可建立帳號。'),
      bullet('建議使用常用 Email，日後可找回帳號'),
      bullet('密碼請設定至少 8 碼以上'),

      h2('2.2 登入'),
      p('輸入 Email 與密碼後點選「登入」，即可進入系統。'),
      note('若有問題或建議，可點選登入頁下方的「加入社群」連結，進入 LINE 社群與管理員聯繫。'),

      h2('2.3 初次設定建議流程'),
      new Paragraph({ numbering: { reference: 'steps', level: 0 }, spacing: { before: 40, after: 40 },
        children: [new TextRun({ text: '前往「帳戶管理」，新增帳戶別名（如：本人、老婆、小孩）', size: 22, font: 'Arial' })] }),
      new Paragraph({ numbering: { reference: 'steps', level: 0 }, spacing: { before: 40, after: 40 },
        children: [new TextRun({ text: '前往「持股管理」，匯入或手動新增交易記錄', size: 22, font: 'Arial' })] }),
      new Paragraph({ numbering: { reference: 'steps', level: 0 }, spacing: { before: 40, after: 40 },
        children: [new TextRun({ text: '回到「總覽儀表板」確認總資產與損益', size: 22, font: 'Arial' })] }),
      new Paragraph({ numbering: { reference: 'steps', level: 0 }, spacing: { before: 40, after: 40 },
        children: [new TextRun({ text: '（選用）前往「更新歷史數據」，新增要回測的股票', size: 22, font: 'Arial' })] }),

      pageBreak(),

      // ── 3. 總覽儀表板 ──
      h1('3. 總覽儀表板'),
      p('登入後的首頁，顯示目前持股的整體概況。'),
      imgScaled('01_總覽儀表板.png', '總覽儀表板'),

      h2('3.1 頁面說明'),
      bullet('總資產：現金部位 + 所有持股目前市值'),
      bullet('現金部位：尚未投入股市的現金'),
      bullet('總市值：所有持股以當前股價計算的總價值'),
      bullet('總成本：所有買進交易的總投入金額'),
      bullet('總損益：總市值 - 總成本（含漲跌百分比）'),
      bullet('持股一覽：列出各股票目前持股數與市值'),
      bullet('持股佔比：圓餅圖呈現各股票的資產比重'),
      bullet('股價資料時間：顯示目前股價的更新時間'),

      note('股價資料來源為台灣證券交易所，每日盤後更新。'),

      pageBreak(),

      // ── 4. 持股管理 ──
      h1('4. 持股管理'),
      p('記錄所有買進、賣出的交易，是整個系統的核心資料來源。'),
      imgScaled('02_持股管理.png', '持股管理'),

      h2('4.1 新增交易'),
      p('點選右上角「新增交易」按鈕，開啟新增視窗。'),
      imgScaled('03_新增交易視窗.png', '新增交易視窗'),
      bullet('股票代號：輸入股票代號（如 0050、2330）'),
      bullet('買/賣：選擇這筆是買進還是賣出'),
      bullet('日期：交易日期'),
      bullet('股數：交易股數（單位：股）'),
      bullet('單價：成交單價'),
      bullet('帳戶：選擇此筆交易所屬帳戶（需先在帳戶管理新增）'),
      note('ETF 代號請輸入完整代號，如 00675L（含英文字母）。'),

      h2('4.2 匯入 XLS'),
      p('支援富邦、國泰對帳單 Excel 直接匯入，省去手動輸入的時間。'),
      new Paragraph({ numbering: { reference: 'steps', level: 0 }, spacing: { before: 40, after: 40 },
        children: [new TextRun({ text: '點選右上角「匯入 XLS」', size: 22, font: 'Arial' })] }),
      new Paragraph({ numbering: { reference: 'steps', level: 0 }, spacing: { before: 40, after: 40 },
        children: [new TextRun({ text: '選擇從券商下載的對帳單檔案', size: 22, font: 'Arial' })] }),
      new Paragraph({ numbering: { reference: 'steps', level: 0 }, spacing: { before: 40, after: 40 },
        children: [new TextRun({ text: '系統自動解析，預覽匯入內容', size: 22, font: 'Arial' })] }),
      new Paragraph({ numbering: { reference: 'steps', level: 0 }, spacing: { before: 40, after: 40 },
        children: [new TextRun({ text: '確認無誤後點選「確認匯入」', size: 22, font: 'Arial' })] }),
      note('若使用其他券商，可點選「範本」下載通用格式，手動填入後匯入。'),

      h2('4.3 排序與篩選'),
      bullet('點選表格欄位標題可排序'),
      bullet('可依帳戶篩選顯示'),
      bullet('超過一頁時可使用分頁功能'),

      pageBreak(),

      // ── 5. 每日漲幅 ──
      h1('5. 每日漲幅'),
      p('記錄每個交易日的總資產市值與當日漲跌，讓你追蹤資產的日常變化。'),
      imgScaled('04_每日漲幅.png', '每日漲幅'),

      h2('5.1 主要功能'),
      bullet('顯示每個交易日的總市值與漲跌金額、漲跌幅'),
      bullet('「補齊至今日」：從最後一筆記錄的日期開始，補齊中間每個交易日的市值，最後抓取今日即時價格'),
      bullet('「重算所有歷史」：從第一筆交易日起，重新計算所有歷史每日市值'),

      tip('平時只需按「補齊至今日」即可。當你新增、修改或刪除過去的交易記錄時，再使用「重算所有歷史」。'),

      pageBreak(),

      // ── 6. 資產配置 ──
      h1('6. 資產配置'),
      p('以圖表方式呈現目前資產的分配狀況，協助了解投資組合的結構。'),
      imgScaled('05_資產配置.png', '資產配置'),

      pageBreak(),

      // ── 7. 水位分析 ──
      h1('7. 水位分析'),
      p('追蹤各股票的歷史高低點，分析目前價格所在的相對位置（水位），協助評估進出場時機。'),
      imgScaled('06_水位分析.png', '水位分析'),

      pageBreak(),

      // ── 8. 回測分析 ──
      h1('8. 回測分析'),
      p('輸入股票代號與時間範圍，模擬在特定期間買進並持有至今的損益結果。'),
      imgScaled('07_回測分析.png', '回測分析'),

      h2('8.1 基本設定'),
      bullet('股票代號：從下拉選單選擇，或輸入搜尋（需先在「更新歷史數據」新增）'),
      bullet('開始日期：系統會自動帶入該股票的第一個交易日'),
      bullet('結束日期：預設為今日'),
      bullet('投入本金：模擬的投入金額'),

      h2('8.2 價格模式'),
      bullet('原始收盤價：使用 TWSE/TPEx 每日收盤價，適合價格走勢觀察'),
      bullet('還原收盤價：使用調整後價格，將配息還原計算，適合長期報酬評估'),

      h2('8.3 配息處理'),
      bullet('領現金：配息直接計入損益'),
      bullet('再投入：在除息日以當日收盤價買回額外股數'),
      note('需先點選「更新配息資料」才能計算配息影響。'),

      h2('8.4 交易成本'),
      bullet('使用台股預設：手續費 0.1425%（最低 20 元）、賣出交易稅 0.3%（ETF 0.1%）'),
      bullet('自訂成本：可自訂手續費率與最低費用'),
      bullet('不計成本：不扣除任何手續費與交易稅'),

      h2('8.5 回測結果'),
      imgScaled('08_回測結果.png', '回測結果'),
      bullet('買進價格 / 賣出價格'),
      bullet('買進金額 + 手續費'),
      bullet('賣出金額 - 手續費 - 交易稅'),
      bullet('配息總金額（若有設定）'),
      bullet('最終損益金額與報酬率'),

      pageBreak(),

      // ── 9. 策略回測 ──
      h1('9. 策略回測'),
      p('選擇特定策略，模擬在歷史期間內自動執行交易的績效結果。'),
      imgScaled('09_策略回測.png', '策略回測'),

      h2('9.1 可用策略'),
      bullet('網格策略：設定參考價與網格間距，當股價下跌到一定幅度買進，上漲到一定幅度賣出'),
      bullet('每日反轉策略：根據每日漲跌訊號進行反向操作'),
      bullet('目標報酬策略：設定目標報酬率，達到後自動賣出'),

      h2('9.2 網格策略參數'),
      bullet('初始資金：模擬的初始資金'),
      bullet('初始持股：初始持有的股數（張）'),
      bullet('網格間距（%）：每個網格的價格間距百分比'),
      bullet('每次交易（張）：每次觸發時買進或賣出的張數'),
      bullet('手續費（%）與證交稅（%）：交易成本設定'),

      note('回測結果為簡化模型，不含滑價、流動性限制等實際市場因素。'),

      pageBreak(),

      // ── 10. 更新歷史數據 ──
      h1('10. 更新歷史數據'),
      p('管理回測所需的股票歷史價格資料，可新增要追蹤的股票，並更新最新的價格資料。'),
      imgScaled('10_更新歷史數據.png', '更新歷史數據'),

      h2('10.1 新增股票'),
      new Paragraph({ numbering: { reference: 'steps', level: 0 }, spacing: { before: 40, after: 40 },
        children: [new TextRun({ text: '在輸入框中輸入股票代號（如 0050）', size: 22, font: 'Arial' })] }),
      new Paragraph({ numbering: { reference: 'steps', level: 0 }, spacing: { before: 40, after: 40 },
        children: [new TextRun({ text: '點選「更新股票歷史數據」', size: 22, font: 'Arial' })] }),
      new Paragraph({ numbering: { reference: 'steps', level: 0 }, spacing: { before: 40, after: 40 },
        children: [new TextRun({ text: '系統會自動下載該股票的完整歷史收盤價', size: 22, font: 'Arial' })] }),

      h2('10.2 股票清單'),
      bullet('顯示目前已追蹤的所有股票'),
      bullet('可查看每支股票的資料起迄日期與總筆數'),
      bullet('可排序欄位'),
      bullet('點選刪除圖示可移除該股票的追蹤（若只有你一人追蹤，資料也會一併刪除）'),

      tip('同一支股票的歷史資料由所有使用者共用，任何人更新都能讓大家受益。'),

      h2('10.3 更新配息資料'),
      p('點選「更新配息資料」後，系統會從 Yahoo Finance 下載該股票的完整配息歷史，用於回測中的配息計算。'),

      pageBreak(),

      // ── 11. 人生目標 ──
      h1('11. 人生目標'),
      p('設定財務目標，追蹤目前資產距離目標的進度。'),
      imgScaled('11_人生目標.png', '人生目標'),

      pageBreak(),

      // ── 12. 帳戶管理 ──
      h1('12. 帳戶管理'),
      p('管理不同的帳戶別名，方便在新增交易時區分不同帳戶（如個人、配偶、子女）。'),
      imgScaled('12_帳戶管理.png', '帳戶管理'),

      h2('12.1 新增帳戶'),
      bullet('在輸入框中輸入帳戶別名（如：老婆、小孩）'),
      bullet('點選「新增」或按 Enter 確認'),

      h2('12.2 編輯帳戶名稱'),
      bullet('點選帳戶右側的鉛筆圖示進入編輯模式'),
      bullet('修改名稱後按 Enter 或點選「儲存」'),
      bullet('按 Esc 或點選「取消」可放棄修改'),

      h2('12.3 刪除帳戶'),
      bullet('點選帳戶右側的 × 圖示'),
      bullet('確認刪除提示後完成'),
      tip('刪除帳戶別名不會刪除該帳戶底下的交易記錄，只是移除別名標籤。'),

      pageBreak(),

      // ── 13. 常見問題 ──
      h1('13. 常見問題'),

      h3('Q：股價沒有更新怎麼辦？'),
      p('股價資料來自台灣證券交易所，盤後才會更新。若資料過舊，可至「每日漲幅」頁面點選「補齊至今日」重新抓取。'),

      h3('Q：匯入 XLS 失敗怎麼辦？'),
      p('請確認檔案格式為 .xls 或 .xlsx。目前直接支援富邦、國泰對帳單。其他券商請下載「範本」，按格式填入後匯入。'),

      h3('Q：回測找不到想要的股票？'),
      p('需先在「更新歷史數據」頁面新增該股票，下載歷史資料後，回測頁面才會出現該選項。'),

      h3('Q：我刪除了某支股票的歷史資料，會影響其他人嗎？'),
      p('歷史資料由所有追蹤該股票的使用者共用。若你是最後一個追蹤該股票的人，刪除後資料會完全移除；若還有其他人追蹤，則只是從你的清單中移除，資料仍保留。'),

      h3('Q：有問題要怎麼反映？'),
      p('歡迎加入 LINE 社群直接回報，管理員會持續改善系統。'),
      new Paragraph({
        spacing: { before: 80, after: 120 },
        children: [
          new TextRun({ text: 'LINE 社群：', size: 22, font: 'Arial' }),
          new ExternalHyperlink({
            link: 'https://ulvis.net/stocksline',
            children: [new TextRun({ text: 'https://ulvis.net/stocksline', size: 22, font: 'Arial', style: 'Hyperlink' })]
          })
        ]
      }),

      pageBreak(),

      // ── 封底 ──
      new Paragraph({ spacing: { before: 2400, after: 400 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '股票看板', size: 48, bold: true, font: 'Arial', color: '1F3864' })] }),
      new Paragraph({ spacing: { before: 0, after: 200 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '持續更新中，歡迎給予建議', size: 24, font: 'Arial', color: '666666' })] }),
      new Paragraph({ spacing: { before: 200, after: 80 }, alignment: AlignmentType.CENTER,
        children: [new ExternalHyperlink({
          link: 'https://stocks-six-eta.vercel.app/',
          children: [new TextRun({ text: 'https://stocks-six-eta.vercel.app/', size: 22, font: 'Arial', style: 'Hyperlink' })]
        })]
      }),
      new Paragraph({ spacing: { before: 80, after: 80 }, alignment: AlignmentType.CENTER,
        children: [new ExternalHyperlink({
          link: 'https://ulvis.net/stocksline',
          children: [new TextRun({ text: 'LINE 社群：https://ulvis.net/stocksline', size: 22, font: 'Arial', style: 'Hyperlink' })]
        })]
      }),
    ]
  }]
})

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUT, buf)
  console.log('✅ 手冊已產生：', OUT)
})
