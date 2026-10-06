/**
 * 2027 房間登記 — Google Apps Script 後端
 *
 * 安裝方式（只需做一次）：
 *   1. 打開 Google 試算表「2027 親子民宿房間登記」
 *   2. 上方選單「擴充功能」→「Apps Script」
 *   3. 把預設的 Code.gs 內容全部刪掉，貼上這整個檔案，按儲存
 *   4. 上方函式下拉選「setup」，按「執行」，依畫面授權
 *      （執行記錄會印出「管理員金鑰」，請記下來）
 *   5. 右上「部署」→「新增部署作業」→ 類型選「網頁應用程式」
 *      執行身分：我　／　誰可以存取：任何人
 *   6. 複製「網頁應用程式網址」，貼到網頁的 config.js
 *
 * 之後如果修改了這個檔案：「部署」→「管理部署作業」→ 編輯 → 版本選「新版本」→ 部署。
 * 網址不會改變。
 */

// ───────────── 房型設定（改價格或數量只要改這裡） ─────────────
var ROOMS = [
  // A 區必選
  { id: 'jeep',     zone: 'A', name: '吉普三人房',     beds: '1 大床 + 1 小床', qty: 2, price: 4700, note: '2026 價 4,900，老客戶折 200' },
  { id: 'zimu',     zone: 'A', name: '子母四人房',     beds: '1 大床 + 2 小床', qty: 2, price: 5600, note: '2026 價 5,800，老客戶折 200' },
  { id: 'swing',    zone: 'A', name: '秋千房',         beds: '1 大床 + 2 小床', qty: 3, price: 6600, note: '火車／兔窩／城堡各 1 間，老客戶折 200', themes: '火車、兔窩、城堡' },
  { id: 'fire',     zone: 'A', name: '消防英雄滑梯房', beds: '2 大床',          qty: 2, price: 6600, note: '2026 價 6,800，老客戶折 200' },
  { id: 'supercar', zone: 'A', name: '超跑星空滑梯房', beds: '2 大床',          qty: 1, price: 6600, note: '2026 價 6,800，老客戶折 200' },
  { id: 'bus',      zone: 'A', name: '快樂巴士滑梯房', beds: '2 大床',          qty: 2, price: 6800, note: '原價 7,700，老闆降價' },
  // B 區加選：A 區全滿才開放
  { id: 'water',    zone: 'B', name: '水上漂雙人房',   beds: '雙人床 + 小床',   qty: 2, price: 3600, note: '3,800，老客戶折 200' },
  { id: 'diudiu',   zone: 'B', name: '丟丟噹雙人房',   beds: '雙人床',          qty: 2, price: 3600, note: '3,800，老客戶折 200' },
  // C 區包區：A 區全滿，且 C 區登記滿 3 間才成立
  { id: 'pack',     zone: 'C', name: '包區主題房',     beds: '2 大床',          qty: 4, price: 6800, note: '兔兔／航海／樂高／恐龍各 1 間，原價 7,125 老闆降價', themes: '兔兔、航海、樂高、恐龍' }
];
var C_MIN = 3;          // C 區成團門檻
var MAX_A_ROOMS = 3;    // 每筆登記最多 A 區間數
var MAX_EXTRA_QTY = 2;  // 每種 B/C 房型最多間數

// ───────────── 分配規則（純函式，不碰試算表） ─────────────
/**
 * 依登記先後（createdAt）分配房間。
 * A 區：依志願順序分配；都沒有時若勾選「其他 A 區也可以」就分配任何剩下的 A 區房。
 * B 區：A 區 12 間全滿才開放，先到先得。
 * C 區：A 區全滿，且 C 區登記數 ≥ 3 間才成團，前 4 間確定。
 * 「加訂」＝另外多一間；「候補」＝A 區沒排到時才需要，A 區有房就自動取消。
 */
function allocate(regs, rooms) {
  rooms = rooms || ROOMS;
  var byId = {};
  rooms.forEach(function (r) { byId[r.id] = r; });
  var aTypes = rooms.filter(function (r) { return r.zone === 'A'; }).map(function (r) { return r.id; });
  var left = {};
  rooms.forEach(function (r) { left[r.id] = r.qty; });

  var order = regs.slice().sort(function (x, y) {
    return (x.createdAt || 0) - (y.createdAt || 0) || String(x.id).localeCompare(String(y.id));
  });
  var out = order.map(function (reg, i) {
    return { id: reg.id, seq: i + 1, name: reg.name, adults: reg.adults, kids: reg.kids, note: reg.note || '',
             createdAt: reg.createdAt, updatedAt: reg.updatedAt, lines: [], short: 0, reg: reg };
  });

  // A 區
  out.forEach(function (o) {
    var reg = o.reg;
    var prefs = (reg.aPrefs || []).filter(function (t) { return aTypes.indexOf(t) >= 0; });
    var seq = prefs.slice();
    if (reg.aAnyOk) aTypes.forEach(function (t) { if (seq.indexOf(t) < 0) seq.push(t); });
    for (var k = 0; k < (reg.aCount || 0); k++) {
      var got = null;
      for (var j = 0; j < seq.length; j++) { if (left[seq[j]] > 0) { got = seq[j]; break; } }
      if (got) {
        left[got]--;
        var rank = prefs.indexOf(got);
        o.lines.push({ zone: 'A', type: got, status: 'ok', pref: rank >= 0 ? rank + 1 : 0 });
      } else {
        o.lines.push({ zone: 'A', type: prefs[0] || null, status: 'wait' });
        o.short++;
      }
    }
  });
  var aUsed = aTypes.reduce(function (s, t) { return s + (byId[t].qty - left[t]); }, 0);
  var aTotal = aTypes.reduce(function (s, t) { return s + byId[t].qty; }, 0);
  var aFull = aUsed >= aTotal;

  // B / C 需求（依登記順序展開成單間）
  var bQueue = [], cQueue = [];
  out.forEach(function (o) {
    var shortage = o.short;
    (o.reg.extras || []).forEach(function (ex) {
      var room = byId[ex.type];
      if (!room || room.zone === 'A') return;
      for (var q = 0; q < (ex.qty || 0); q++) {
        var line = { zone: room.zone, type: room.id, mode: ex.mode === 'backup' ? 'backup' : 'add', status: null };
        if (line.mode === 'backup') {
          if (shortage > 0) { shortage--; } else { line.status = 'not_needed'; }
        }
        o.lines.push(line);
        if (!line.status) (room.zone === 'B' ? bQueue : cQueue).push({ o: o, line: line });
      }
    });
  });

  // B 區
  bQueue.forEach(function (it) {
    if (!aFull) { it.line.status = 'pending_open'; return; }
    if (left[it.line.type] > 0) { left[it.line.type]--; it.line.status = 'ok'; }
    else it.line.status = 'wait';
  });

  // C 區
  var cRequested = cQueue.length;
  var cFormed = aFull && cRequested >= C_MIN;
  cQueue.forEach(function (it) {
    if (!aFull) { it.line.status = 'pending_open'; return; }
    if (!cFormed) { it.line.status = 'pending_group'; return; }
    if (left[it.line.type] > 0) { left[it.line.type]--; it.line.status = 'ok'; }
    else it.line.status = 'wait';
  });

  // 候補房確定後，對應的 A 區候補標成「已改住候補房」
  out.forEach(function (o) {
    var covered = o.lines.filter(function (l) { return l.mode === 'backup' && l.status === 'ok'; }).length;
    o.lines.forEach(function (l) {
      if (covered > 0 && l.zone === 'A' && l.status === 'wait') { l.status = 'covered'; covered--; }
    });
    o.total = o.lines.reduce(function (s, l) { return s + (l.status === 'ok' ? byId[l.type].price : 0); }, 0);
    delete o.reg; delete o.short;
  });

  var used = {};
  rooms.forEach(function (r) { used[r.id] = r.qty - left[r.id]; });
  return {
    regs: out,
    summary: { aUsed: aUsed, aTotal: aTotal, aFull: aFull, bOpen: aFull, cRequested: cRequested,
               cMin: C_MIN, cFormed: cFormed, used: used, left: left }
  };
}

var STATUS_TEXT = { ok: '已確定', wait: '候補中', pending_open: '待開放（A 區未滿）', pending_group: '待成團',
                    not_needed: '不需要（A 區已有房）', covered: '已改住候補房' };

// ───────────── 試算表存取 ─────────────
var SHEET_DATA = '登記資料';
var SHEET_RESULT = '分配結果';
var SHEET_SUMMARY = '房型總覽';
var DATA_HEADERS = ['id', 'editKey', 'createdAt', 'updatedAt', '姓名', '大人', '小孩', 'A區間數', 'A區志願', '其他A區也可', 'B/C登記', '備註'];

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = ss.getSheetByName(SHEET_DATA) || ss.insertSheet(SHEET_DATA);
  if (data.getLastRow() === 0) {
    data.appendRow(DATA_HEADERS);
    data.setFrozenRows(1);
    data.getRange(1, 1, 1, DATA_HEADERS.length).setFontWeight('bold');
  }
  [SHEET_RESULT, SHEET_SUMMARY].forEach(function (n) { if (!ss.getSheetByName(n)) ss.insertSheet(n); });
  var first = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (first && ss.getSheets().length > 1) ss.deleteSheet(first);
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('ADMIN_KEY');
  if (!key) { key = Utilities.getUuid().slice(0, 8); props.setProperty('ADMIN_KEY', key); }
  writeReports(readRegs());
  Logger.log('設定完成。管理員金鑰：' + key + '（在網址後面加 ?admin=' + key + ' 即可修改或刪除任何登記）');
}

function readRegs() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_DATA);
  if (!sh || sh.getLastRow() < 2) return [];
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, DATA_HEADERS.length).getValues();
  return rows.filter(function (r) { return r[0]; }).map(function (r) {
    return { id: String(r[0]), editKey: String(r[1]), createdAt: Number(r[2]), updatedAt: Number(r[3]),
             name: String(r[4]), adults: Number(r[5]) || 0, kids: Number(r[6]) || 0, aCount: Number(r[7]) || 0,
             aPrefs: parseJson(r[8], []), aAnyOk: r[9] === true || r[9] === 'TRUE', extras: parseJson(r[10], []),
             note: String(r[11] || '') };
  });
}

function parseJson(v, dflt) { try { return v ? JSON.parse(v) : dflt; } catch (e) { return dflt; } }

function toRow(reg) {
  return [reg.id, reg.editKey, reg.createdAt, reg.updatedAt, reg.name, reg.adults, reg.kids, reg.aCount,
          JSON.stringify(reg.aPrefs), reg.aAnyOk, JSON.stringify(reg.extras), reg.note];
}

function findRow(sh, id) {
  if (sh.getLastRow() < 2) return -1;
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return -1;
}

function writeReports(regs) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var res = allocate(regs);
  var byId = {};
  ROOMS.forEach(function (r) { byId[r.id] = r; });
  var tz = ss.getSpreadsheetTimeZone();

  var rows = [['順序', '姓名', '大人', '小孩', '區', '房型', '用途', '狀態', '房價', '登記時間', '備註']];
  res.regs.forEach(function (o) {
    o.lines.forEach(function (l, i) {
      var room = l.type ? byId[l.type] : null;
      rows.push([o.seq, o.name, i === 0 ? o.adults : '', i === 0 ? o.kids : '', l.zone,
                 room ? room.name : '（未選志願）',
                 l.zone === 'A' ? (l.pref ? '第 ' + l.pref + ' 志願' : (l.status === 'ok' ? '其他 A 區' : '')) : (l.mode === 'backup' ? '候補' : '加訂'),
                 STATUS_TEXT[l.status] || l.status, l.status === 'ok' ? room.price : '',
                 i === 0 ? Utilities.formatDate(new Date(o.createdAt), tz, 'yyyy/MM/dd HH:mm') : '', i === 0 ? o.note : '']);
    });
  });
  var sh = ss.getSheetByName(SHEET_RESULT) || ss.insertSheet(SHEET_RESULT);
  sh.clearContents();
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sh.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
  sh.setFrozenRows(1);

  var s = res.summary;
  var sum = [['區', '房型', '床型', '總數', '已確定', '剩餘', '2027 價格', '說明']];
  ROOMS.forEach(function (r) { sum.push([r.zone, r.name, r.beds, r.qty, s.used[r.id], s.left[r.id], r.price, r.note]); });
  sum.push(['', '', '', '', '', '', '', '']);
  sum.push(['A 區', '已確定 ' + s.aUsed + ' / ' + s.aTotal, s.aFull ? '已滿' : '未滿', '', '', '', '', '']);
  sum.push(['B 區', s.bOpen ? '已開放' : '未開放（等 A 區滿）', '', '', '', '', '', '']);
  sum.push(['C 區', '登記 ' + s.cRequested + ' 間，門檻 ' + s.cMin, s.cFormed ? '已成團' : '未成團', '', '', '', '', '']);
  var totalAll = res.regs.reduce(function (t, o) { return t + o.total; }, 0);
  sum.push(['合計', '已確定房價總額', totalAll, '', '', '', '', '']);
  var sh2 = ss.getSheetByName(SHEET_SUMMARY) || ss.insertSheet(SHEET_SUMMARY);
  sh2.clearContents();
  sh2.getRange(1, 1, sum.length, sum[0].length).setValues(sum);
  sh2.getRange(1, 1, 1, sum[0].length).setFontWeight('bold');
  sh2.setFrozenRows(1);
  return res;
}

// ───────────── 網頁 API ─────────────
function doGet() {
  return json(publicState(readRegs()));
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    var isAdmin = body.adminKey && body.adminKey === PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_DATA);
    if (!sh) return json({ ok: false, error: '試算表尚未完成設定，請先執行 setup。' });

    if (body.action === 'checkAdmin') return json({ ok: !!isAdmin });

    if (body.action === 'delete') {
      var row = findRow(sh, String(body.id || ''));
      if (row < 0) return json({ ok: false, error: '找不到這筆登記。' });
      var key = String(sh.getRange(row, 2).getValue());
      if (!isAdmin && key !== body.editKey) return json({ ok: false, error: '只有登記本人或管理員可以刪除。' });
      sh.deleteRow(row);
      var regsD = readRegs();
      writeReports(regsD);
      return json({ ok: true, state: publicState(regsD) });
    }

    if (body.action === 'save') {
      var clean = validate(body.reg || {});
      if (clean.error) return json({ ok: false, error: clean.error });
      var now = Date.now();
      var id = String(body.id || '');
      var rowS = id ? findRow(sh, id) : -1;
      var reg;
      if (rowS > 0) {
        var old = readRegs().filter(function (r) { return r.id === id; })[0];
        if (!isAdmin && old.editKey !== body.editKey) return json({ ok: false, error: '只有登記本人或管理員可以修改這筆登記。' });
        reg = merge(clean, { id: id, editKey: old.editKey, createdAt: old.createdAt, updatedAt: now });
        sh.getRange(rowS, 1, 1, DATA_HEADERS.length).setValues([toRow(reg)]);
      } else {
        reg = merge(clean, { id: Utilities.getUuid().slice(0, 12), editKey: Utilities.getUuid(), createdAt: now, updatedAt: now });
        sh.appendRow(toRow(reg));
      }
      var regs = readRegs();
      writeReports(regs);
      return json({ ok: true, id: reg.id, editKey: reg.editKey, state: publicState(regs) });
    }
    return json({ ok: false, error: '未知的動作。' });
  } catch (err) {
    return json({ ok: false, error: '伺服器錯誤：' + err.message });
  } finally {
    lock.releaseLock();
  }
}

function validate(r) {
  var name = String(r.name || '').trim().slice(0, 30);
  if (!name) return { error: '請填寫姓名。' };
  var adults = clampInt(r.adults, 0, 20), kids = clampInt(r.kids, 0, 20);
  if (adults + kids < 1) return { error: '請填寫入住人數。' };
  var aIds = ROOMS.filter(function (x) { return x.zone === 'A'; }).map(function (x) { return x.id; });
  var aCount = clampInt(r.aCount, 1, MAX_A_ROOMS);
  var aPrefs = [];
  (r.aPrefs || []).forEach(function (t) { if (aIds.indexOf(t) >= 0 && aPrefs.indexOf(t) < 0) aPrefs.push(t); });
  aPrefs = aPrefs.slice(0, 3);
  if (!aPrefs.length) return { error: '請至少選一個 A 區志願。' };
  var bcIds = ROOMS.filter(function (x) { return x.zone !== 'A'; }).map(function (x) { return x.id; });
  var extras = [];
  (r.extras || []).forEach(function (ex) {
    var q = clampInt(ex.qty, 0, MAX_EXTRA_QTY);
    if (bcIds.indexOf(ex.type) >= 0 && q > 0) extras.push({ type: ex.type, qty: q, mode: ex.mode === 'backup' ? 'backup' : 'add' });
  });
  return { name: name, adults: adults, kids: kids, aCount: aCount, aPrefs: aPrefs, aAnyOk: !!r.aAnyOk,
           extras: extras, note: String(r.note || '').trim().slice(0, 200) };
}

function clampInt(v, lo, hi) { v = Math.round(Number(v) || 0); return Math.max(lo, Math.min(hi, v)); }
function merge(a, b) { var o = {}; [a, b].forEach(function (x) { for (var k in x) o[k] = x[k]; }); return o; }

function publicState(regs) {
  var res = allocate(regs);
  var input = {};
  regs.forEach(function (r) {
    input[r.id] = { aCount: r.aCount, aPrefs: r.aPrefs, aAnyOk: r.aAnyOk, extras: r.extras };
  });
  res.regs.forEach(function (o) { o.input = input[o.id]; });
  return { ok: true, rooms: ROOMS, cMin: C_MIN, maxA: MAX_A_ROOMS, maxExtra: MAX_EXTRA_QTY, result: res, at: Date.now() };
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

if (typeof module !== 'undefined') module.exports = { allocate: allocate, ROOMS: ROOMS, validate: validate };
