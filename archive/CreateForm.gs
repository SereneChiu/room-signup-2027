/**
 * 建立「2027 包棟房間登記」Google 表單
 *
 * 使用方式（只需做一次）：
 *   1. 打開 Google 試算表「2027 親子民宿房間登記」
 *   2. 上方選單「擴充功能」選「Apps Script」
 *   3. 左側「檔案」旁的 + 號，選「指令碼」，命名 CreateForm，貼上這整個檔案，按儲存
 *   4. 上方函式下拉選「createRoomForm」，按「執行」，依畫面授權
 *   5. 執行記錄會印出兩個網址：
 *        填寫連結：貼到群組給大家
 *        編輯連結：你自己調整表單用
 *   表單回應會自動寫進這份試算表的新分頁「表單回應 1」。
 *
 * 再執行一次會建立「另一份」新表單，不會覆蓋舊的。
 */

function createRoomForm() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var form = FormApp.create('2027 包棟房間登記');

  form.setDescription(
    '這是統計用的登記，不是搶房，沒有先到先得。\n' +
    '請每個家庭填一次想住的房型和間數。同一房型登記超過間數時，大家再一起協調，協調後可以回來修改。\n\n' +
    '- 分類 1 包棟必選區：每個家庭至少選一間\n' +
    '- 分類 2 四間包區：分類 1 住滿，且包區登記滿 3 間才成立\n' +
    '- 分類 3 包棟加選區：分類 1 住滿之後才開放\n\n' +
    '==== 房型與價格 ====\n\n' +
    '[分類 1 包棟必選區] 共 12 間\n' +
    '- 吉普三人房（1大床+1小床）共 2 間，2026 價 4,900，2027 價 4,700（老客戶折扣 200）\n' +
    '- 子母四人房（1大床+2小床）共 2 間，2026 價 5,800，2027 價 5,600（老客戶折扣 200）\n' +
    '- 火車四人秋千房（1大床+2小床）共 1 間，2026 價 6,800，2027 價 6,600（老客戶折扣 200）\n' +
    '- 兔窩四人秋千房（1大床+2小床）共 1 間，2026 價 6,800，2027 價 6,600（老客戶折扣 200）\n' +
    '- 城堡四人秋千房（1大床+2小床）共 1 間，2026 價 6,800，2027 價 6,600（老客戶折扣 200）\n' +
    '- 消防英雄滑梯房（2大床）共 2 間，2026 價 6,800，2027 價 6,600（老客戶折扣 200）\n' +
    '- 超跑星空滑梯房（2大床）共 1 間，2026 價 6,800，2027 價 6,600（老客戶折扣 200）\n' +
    '- 快樂巴士滑梯房（2大床）共 2 間，2026 價 6,800，2027 價 6,800（原價 7,700，老闆降價）\n\n' +
    '[分類 2 四間包區] 共 4 間\n' +
    '規則：分類 1 的房間住滿，且下方房間滿 3 間，才達包區標準\n' +
    '- 包區兔兔房（2大床）共 1 間，2026 價 6,800，2027 價 6,800（原價 7,125，老闆降價）\n' +
    '- 包區航海房（2大床）共 1 間，2026 價 6,800，2027 價 6,800（原價 7,125，老闆降價）\n' +
    '- 包區樂高房（2大床）共 1 間，2026 價 6,800，2027 價 6,800（原價 7,125，老闆降價）\n' +
    '- 包區恐龍房（2大床）共 1 間，2026 價 6,800，2027 價 6,800（原價 7,125，老闆降價）\n\n' +
    '[分類 3 包棟加選區] 共 4 間\n' +
    '規則：分類 1 的房間住滿之後才會開放\n' +
    '- 水上漂雙人房（雙人床+120cm 小床）共 2 間，2026 價 4,800，2027 價 3,600（3,800 減老客戶折扣 200）\n' +
    '- 丟丟噹雙人房 共 2 間，2026 價未知，2027 價 3,600（3,800 減老客戶折扣 200）'
  );
  form.setAllowResponseEdits(true);       // 送出後可以修改，不用重填
  form.setCollectEmail(false);
  form.setProgressBar(true);
  form.setConfirmationMessage('已收到！協調房間時如果需要調整，請用「編輯回應」連結修改，不用重新填寫。');

  // ───── 第 1 頁：基本資料 ─────
  form.addTextItem().setTitle('姓名（家庭代表）').setRequired(true);
  form.addTextItem().setTitle('大人人數').setRequired(true)
    .setValidation(FormApp.createTextValidation().requireNumberBetween(0, 20)
      .setHelpText('請填 0–20 的數字').build());
  form.addTextItem().setTitle('小孩人數').setRequired(true)
    .setValidation(FormApp.createTextValidation().requireNumberBetween(0, 20)
      .setHelpText('請填 0–20 的數字').build());

  // ───── 第 2 頁：分類 1 包棟必選區 ─────
  form.addPageBreakItem()
    .setTitle('分類 1：包棟必選區')
    .setHelpText('每個家庭至少選一間。同房型有 2 間的，可以選 1 間或 2 間。');

  var aRows = [
    '吉普三人房（1大床+1小床）4,700 元，共 2 間',
    '子母四人房（1大床+2小床）5,600 元，共 2 間',
    '火車四人秋千房（1大床+2小床）6,600 元，共 1 間',
    '兔窩四人秋千房（1大床+2小床）6,600 元，共 1 間',
    '城堡四人秋千房（1大床+2小床）6,600 元，共 1 間',
    '消防英雄滑梯房（2大床）6,600 元，共 2 間',
    '超跑星空滑梯房（2大床）6,600 元，共 1 間',
    '快樂巴士滑梯房（2大床）6,800 元，共 2 間'
  ];
  form.addGridItem()
    .setTitle('想住的房型與間數')
    .setHelpText('價格說明：吉普、子母、秋千、消防、超跑為 2026 價減老客戶折扣 200 元；快樂巴士原價 7,700，老闆降價為 6,800。')
    .setRows(aRows)
    .setColumns(['不需要', '1 間', '2 間']);

  form.addCheckboxItem()
    .setTitle('如果要協調，你也可以接受哪些房型？（可複選，可不填）')
    .setChoiceValues(['吉普三人房', '子母四人房', '火車四人秋千房', '兔窩四人秋千房', '城堡四人秋千房',
                      '消防英雄滑梯房', '超跑星空滑梯房', '快樂巴士滑梯房']);

  // ───── 第 3 頁：分類 2 四間包區 ─────
  form.addPageBreakItem()
    .setTitle('分類 2：四間包區（可不選）')
    .setHelpText('規則：分類 1 的房間住滿，且下方包區房登記滿 3 間，才達包區標準。\n' +
                 '想住：分類 1 之外再多住一間。候補：分類 1 協調不到房間時才需要。\n' +
                 '價格：每間 6,800 元（原價 7,125，老闆降價）。');
  form.addGridItem()
    .setTitle('包區房')
    .setRows(['包區兔兔房（2大床）', '包區航海房（2大床）', '包區樂高房（2大床）', '包區恐龍房（2大床）'])
    .setColumns(['不需要', '想住', '候補']);

  // ───── 第 4 頁：分類 3 包棟加選區 ─────
  form.addPageBreakItem()
    .setTitle('分類 3：包棟加選區（可不選）')
    .setHelpText('規則：分類 1 的房間住滿之後才會開放。\n' +
                 '想住：分類 1 之外再多住一間。候補：分類 1 協調不到房間時才需要。\n' +
                 '價格：每間 3,600 元（3,800 減老客戶折扣 200）。');
  form.addGridItem()
    .setTitle('加選區房間')
    .setRows(['水上漂雙人房（雙人床+120cm 小床），共 2 間', '丟丟噹雙人房（雙人床），共 2 間'])
    .setColumns(['不需要', '想住 1 間', '想住 2 間', '候補 1 間', '候補 2 間']);

  // ───── 第 5 頁：備註 ─────
  form.addPageBreakItem().setTitle('備註');
  form.addParagraphTextItem()
    .setTitle('備註（可不填）')
    .setHelpText('特殊需求');

  // 回應寫入這份試算表
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  Logger.log('填寫連結（給大家）：' + form.getPublishedUrl());
  Logger.log('編輯連結（你自己用）：' + form.getEditUrl());
  PropertiesService.getScriptProperties().setProperty('FORM_ID', form.getId());
}

/**
 * 給 HTML 版表單用：印出每個題目的欄位代號。
 * 執行 createRoomForm 之後，再執行一次這個函式，
 * 把執行記錄印出的那一整行 JSON 複製，貼到 form.html 開頭的 FORM_CONFIG。
 */
function exportHtmlConfig() {
  var id = PropertiesService.getScriptProperties().getProperty('FORM_ID');
  if (!id) throw new Error('找不到表單，請先執行 createRoomForm。');
  var form = FormApp.openById(id);
  var T = FormApp.ItemType;
  var keys = {};
  keys['姓名（家庭代表）'] = 'name';
  keys['大人人數'] = 'adults';
  keys['小孩人數'] = 'kids';
  keys['想住的房型與間數'] = 'catA';
  keys['如果要協調，你也可以接受哪些房型？（可複選，可不填）'] = 'alts';
  keys['包區房'] = 'catB';
  keys['加選區房間'] = 'catC';
  keys['備註（可不填）'] = 'note';
  var cfg = { action: form.getPublishedUrl().replace(/\/viewform.*$/, '/formResponse'), entries: {} };
  form.getItems().forEach(function (item) {
    var key = keys[item.getTitle()];
    if (!key) return;
    var resp = null, t = item.getType();
    if (t === T.TEXT) resp = item.asTextItem().createResponse('1');
    else if (t === T.PARAGRAPH_TEXT) resp = item.asParagraphTextItem().createResponse('x');
    else if (t === T.CHECKBOX) { var c = item.asCheckboxItem(); resp = c.createResponse([c.getChoices()[0].getValue()]); }
    else if (t === T.GRID) { var g = item.asGridItem(); var col = g.getColumns()[0]; resp = g.createResponse(g.getRows().map(function () { return col; })); }
    if (!resp) return;
    var url = form.createResponse().withItemResponse(resp).toPrefilledUrl();
    var ids = url.match(/entry\.\d+/g) || [];
    cfg.entries[key] = t === T.GRID ? ids : ids[0];
  });
  Logger.log(JSON.stringify(cfg));
}
