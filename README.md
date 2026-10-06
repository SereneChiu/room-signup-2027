# 2027 房間登記

靜態登記網頁（GitHub Pages）＋ Google 試算表（Apps Script）後端。

- `index.html`：登記網頁
- `config.js`：填入 Apps Script 網頁應用程式網址
- `Code.gs`：貼到 Google 試算表的 Apps Script（安裝步驟寫在檔案開頭）

統計規則：不自動分配。每個房型列出登記需求與間數，超過就標「需協調」，協調後再修改。B 區在 A 區住滿後開放；C 區在 A 區住滿且登記滿 3 間時成團。
在網址加上 `?admin=管理員金鑰` 可以修改或刪除任何登記。
