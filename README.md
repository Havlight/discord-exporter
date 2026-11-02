# Discord Channel Exporter (Firefox)

匯出目前在 Discord 開啟的頻道 / 私訊，在你選定的時間範圍內的對話紀錄，可輸出 **HTML、JSON、TXT、CSV**。

目前版本：**0.1.2**。查看 [隱私權政策](PRIVACY.md)、[ISC 授權條款](LICENSE)及 [Mozilla 審核與建置說明](REVIEWER-NOTES.md)。

## 資料處理

匯出由使用者按下按鈕後啟動，會將登入權杖、頻道／伺服器識別資訊及訊息分頁參數直接傳送至 Discord。安裝時會要求同意必要的「驗證資訊」與「瀏覽活動」資料傳輸。訊息與匯出檔案在本機處理，開發者沒有接收權杖或聊天內容的伺服器。HTML 中的附件圖片仍可能從原始網址載入，並非完整離線備份。

## 運作方式

- 偵測目前分頁的網址 `discord.com/channels/{伺服器}/{頻道}`，得知要匯出的頻道（私訊、群組、討論串皆可）。
- 讀取你已登入帳號的工作階段權杖，以與 Discord 網頁相同的授權呼叫私有 API `/api/v9/channels/{id}/messages`，每次 100 則往後翻頁。
- 利用 Discord 訊息 ID（snowflake）內含的時間戳，把你選的起訖時間換算成分頁游標，精準定位時間範圍。
- 內建 429 限速退避；完成後由背景程式透過瀏覽器下載功能存成檔案。

## ⚠ 重要風險

本工具以**使用者帳號**自動呼叫 Discord 私有 API。**自動化使用者帳號違反 Discord 服務條款，可能導致帳號被停權。** 僅供匯出你自己有權存取的資料，風險自負。若用於正式用途，Discord 官方建議改用 bot 權杖。

## 開發 / 載入

需要 Node.js 與 npm。

```bash
npm ci
```

執行單元測試（snowflake 換算、格式輸出、多 runtime 登入模組查找與錯誤訊息）：

```bash
npm test
```

檢查擴充套件：

```bash
npm run lint
```

在 Firefox 臨時載入並即時測試（會開一個乾淨的 Firefox 設定檔）：

```bash
npm start
```

或手動載入：開啟 `about:debugging#/runtime/this-firefox` → 「載入暫時性附加元件」→ 選 `src/manifest.json`。重開瀏覽器後會消失。

打包成 zip（上架 AMO 或自行簽署用）：

```bash
npm run build
```

## 使用

1. 在 Firefox 開啟並登入 `discord.com`，點進要匯出的頻道或私訊。
2. 點工具列的插件圖示。
3. 選時間範圍（預設今天 00:00 到現在；或用快捷鈕：今天 / 昨天 / 近 24 小時 / 近 7 天 / 全部）。起訖顛倒會自動對調。
4. 勾選要的格式，按「匯出」。檔案會存到你的下載資料夾。

## 檔案結構

```
src/
  manifest.json      擴充套件設定（MV3）
  background.js      接收檔案內容、呼叫下載 API
  content.js         注入 discord.com：翻頁抓訊息、產生匯出檔案
  lib/
    session.js       在頁面 MAIN 環境查找所有 runtime 的登入模組、產生錯誤訊息
    snowflake.js     時間 ⇄ 訊息 ID 換算
    formatters.js    HTML / JSON / TXT / CSV 輸出
  popup/             工具列面板：日期、格式、匯出
test/
  run.js             純邏輯單元測試
```

## 永久安裝

臨時載入每次重開 Firefox 都會消失。要永久安裝需簽署：

- 上傳到 [addons.mozilla.org](https://addons.mozilla.org/developers/)（可選「自行發布 / unlisted」不公開），用 `npm run build` 產生的 zip，Mozilla 簽署後得到 `.xpi` 安裝。
- 或改用 Firefox Developer Edition / Nightly，在 `about:config` 將 `xpinstall.signatures.required` 設為 `false` 後安裝未簽署版本。
