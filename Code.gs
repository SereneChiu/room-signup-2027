/**
 * 2027 房間登記（統計用）— Google Apps Script 後端
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
 *
 * 這個系統只做統計，不自動分配房間：
 * 每個房型會列出「間數」和「登記需求」，需求超過間數就標成「需協調」，
 * 協調好之後由本人或管理員修改登記即可。
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
var C_MIN = 3;       // C 區成團門檻（間）
var MAX_QTY = 3;     // 每個房型每筆登記最多幾間

// ───────────── 統計（純函式，不碰試算表） ─────────────
/**
 * rooms 每個房型：登記需求、家庭清單、差額、是否需協調。
 * A 區「住滿」＝每個 A 區房型的需求都 ≥ 間數。
 * B/C 的「候補」只在 A 區沒排到時才需要，所以另外計數，不算進衝突。
 */
function summarize(regs, rooms) {
  rooms = rooms || ROOMS;
  var order = regs.slice().sort(function (x, y) {
    return (x.createdAt || 0) - (y.createdAt || 0) || String(x.id).localeCompare(String(y.id));
  });
  var stat = {};
  rooms.forEach(function (r) { stat[r.id] = { id: r.id, qty: r.qty, demand: 0, backup: 0, families: [] }; });

  order.forEach(function (reg) {
    (reg.items || []).forEach(function (it) {
      var s = stat[it.type];
      if (!s || !(it.qty > 0)) return;
      if (it.mode === 'backup') s.backup += it.qty; else s.demand += it.qty;
      s.families.push({ id: reg.id, name: reg.name, qty: it.qty, mode: it.mode || 'want', alts: reg.alts || [] });
    });
  });

  var aRooms = rooms.filter(function (r) { return r.zone === 'A'; });
  var aTotal = 0, aFilled = 0, aDemand = 0;
  aRooms.forEach(function (r) { aTotal += r.qty; aDemand += stat[r.id].demand; aFilled += Math.min(r.qty, stat[r.id].demand); });
  var aFull = aFilled >= aTotal;
  var cDemand = 0, cBackup = 0;
  rooms.forEach(function (r) { if (r.zone === 'C') { cDemand += stat[r.id].demand; cBackup += stat[r.id].backup; } });
  var cFormed = aFull && cDemand >= C_MIN;

  var conflicts = 0;
  rooms.forEach(function (r) {
    var s = stat[r.id];
    s.over = Math.max(0, s.demand - r.qty);
    s.left = Math.max(0, r.qty - s.demand);
    if (s.over > 0) conflicts++;
  });

  var byId = {};
  rooms.forEach(function (r) { byId[r.id] = r; });
  var out = order.map(function (reg, i) {
    var est = 0;
    var items = (reg.items || []).filter(function (it) { return byId[it.type] && it.qty > 0; }).map(function (it) {
      var room = byId[it.type], s = stat[it.type];
      var status;
      if (it.mode === 'backup') status = 'backup';
      else if (room.zone === 'B' && !aFull) status = 'pending_open';
      else if (room.zone === 'C' && !cFormed) status = 'pending_group';
      else status = s.over > 0 ? 'conflict' : 'clear';
      if (it.mode !== 'backup') est += room.price * it.qty;
      return { zone: room.zone, type: it.type, qty: it.qty, mode: it.mode || 'want', status: status };
    });
    return { id: reg.id, seq: i + 1, name: reg.name, adults: reg.adults, kids: reg.kids, note: reg.note || '',
             alts: reg.alts || [], items: items, estimate: est, createdAt: reg.createdAt, updatedAt: reg.updatedAt };
  });

  return {
    regs: out,
    rooms: stat,
    summary: { aTotal: aTotal, aFilled: aFilled, aDemand: aDemand, aFull: aFull, bOpen: aFull,
               cDemand: cDemand, cBackup: cBackup, cMin: C_MIN, cFormed: cFormed, conflicts: conflicts,
               families: out.length,
               adults: out.reduce(function (t, o) { return t + (o.adults || 0); }, 0),
               kids: out.reduce(function (t, o) { return t + (o.kids || 0); }, 0) }
  };
}

var STATUS_TEXT = { clear: '沒有衝突', conflict: '需協調', pending_open: '待 A 區滿', pending_group: '待成團', backup: '候補' };

// ───────────── 試算表存取 ─────────────
var SHEET_DATA = '登記資料';
var SHEET_DETAIL = '登記明細';
var SHEET_SUMMARY = '房型統計';
var DATA_HEADERS = ['id', 'editKey', 'createdAt', 'updatedAt', '姓名', '大人', '小孩', '房間(JSON)', '可接受A區(JSON)', '備註'];

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = ss.getSheetByName(SHEET_DATA) || ss.insertSheet(SHEET_DATA);
  if (data.getLastRow() === 0) {
    data.appendRow(DATA_HEADERS);
    data.setFrozenRows(1);
    data.getRange(1, 1, 1, DATA_HEADERS.length).setFontWeight('bold');
  }
  [SHEET_SUMMARY, SHEET_DETAIL].forEach(function (n) { if (!ss.getSheetByName(n)) ss.insertSheet(n); });
  var first = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (first && ss.getSheets().length > 1) ss.deleteSheet(first);
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('ADMIN_KEY');
  if (!key) { key = Utilities.getUuid().slice(0, 8); props.setProperty('ADMIN_KEY', key); }
  writeReports(readRegs());
  Logger.log('設定完成。管理員金鑰：' + key + '（在網頁網址後面加 ?admin=' + key + ' 即可修改或刪除任何登記）');
}

function readRegs() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_DATA);
  if (!sh || sh.getLastRow() < 2) return [];
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, DATA_HEADERS.length).getValues();
  return rows.filter(function (r) { return r[0]; }).map(function (r) {
    return { id: String(r[0]), editKey: String(r[1]), createdAt: Number(r[2]), updatedAt: Number(r[3]),
             name: String(r[4]), adults: Number(r[5]) || 0, kids: Number(r[6]) || 0,
             items: parseJson(r[7], []), alts: parseJson(r[8], []), note: String(r[9] || '') };
  });
}

function parseJson(v, dflt) { try { return v ? JSON.parse(v) : dflt; } catch (e) { return dflt; } }

function toRow(reg) {
  return [reg.id, reg.editKey, reg.createdAt, reg.updatedAt, reg.name, reg.adults, reg.kids,
          JSON.stringify(reg.items), JSON.stringify(reg.alts), reg.note];
}

function findRow(sh, id) {
  if (sh.getLastRow() < 2) return -1;
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return -1;
}

function writeReports(regs) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var res = summarize(regs);
  var byId = {};
  ROOMS.forEach(function (r) { byId[r.id] = r; });
  var s = res.summary;

  // 房型統計
  var sum = [['區', '房型', '床型', '間數', '登記需求', '差額', '狀態', '候補', '2027 價格', '登記的家庭', '說明']];
  ROOMS.forEach(function (r) {
    var st = res.rooms[r.id];
    var state = st.over > 0 ? '需協調（超出 ' + st.over + ' 間）' : (st.left > 0 ? '剩 ' + st.left + ' 間' : '剛好');
    var fam = st.families.filter(function (f) { return f.mode !== 'backup'; })
      .map(function (f) { return f.name + (f.qty > 1 ? '×' + f.qty : ''); }).join('、');
    sum.push([r.zone, r.name, r.beds, r.qty, st.demand, st.demand - r.qty, state, st.backup || '', r.price, fam, r.note]);
  });
  sum.push(['', '', '', '', '', '', '', '', '', '', '']);
  sum.push(['A 區', '已登記 ' + s.aFilled + ' / ' + s.aTotal + ' 間', s.aFull ? '已住滿' : '未住滿', '', '', '', '', '', '', '', '']);
  sum.push(['B 區', s.bOpen ? '開放條件已達成' : '等 A 區住滿', '', '', '', '', '', '', '', '', '']);
  sum.push(['C 區', '登記 ' + s.cDemand + ' 間（門檻 ' + s.cMin + '）', s.cFormed ? '已成團' : '未成團', '', '', '', '', '', '', '', '']);
  sum.push(['人數', s.families + ' 個家庭', '大人 ' + s.adults, '小孩 ' + s.kids, '', '', '', '', '', '', '']);
  var sh2 = ss.getSheetByName(SHEET_SUMMARY) || ss.insertSheet(SHEET_SUMMARY);
  sh2.clearContents();
  sh2.getRange(1, 1, sum.length, sum[0].length).setValues(sum);
  sh2.getRange(1, 1, 1, sum[0].length).setFontWeight('bold');
  sh2.setFrozenRows(1);

  // 登記明細：一個家庭一列，每個房型一欄
  var head = ['順序', '姓名', '大人', '小孩'].concat(ROOMS.map(function (r) { return r.zone + ' ' + r.name; }))
    .concat(['候補房型', '可接受的其他 A 區', '預估金額', '備註']);
  var rows = [head];
  res.regs.forEach(function (o) {
    var row = [o.seq, o.name, o.adults, o.kids];
    ROOMS.forEach(function (r) {
      var q = 0;
      o.items.forEach(function (it) { if (it.type === r.id && it.mode !== 'backup') q += it.qty; });
      row.push(q || '');
    });
    row.push(o.items.filter(function (it) { return it.mode === 'backup'; })
      .map(function (it) { return byId[it.type].name + (it.qty > 1 ? '×' + it.qty : ''); }).join('、'));
    row.push(o.alts.map(function (a) { return byId[a] ? byId[a].name : a; }).join('、'));
    row.push(o.estimate);
    row.push(o.note);
    rows.push(row);
  });
  var sh = ss.getSheetByName(SHEET_DETAIL) || ss.insertSheet(SHEET_DETAIL);
  sh.clearContents();
  sh.getRange(1, 1, rows.length, head.length).setValues(rows);
  sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
  sh.setFrozenRows(1);
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
    var isAdmin = !!body.adminKey && body.adminKey === PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_DATA);
    if (!sh) return json({ ok: false, error: '試算表尚未完成設定，請先執行 setup。' });

    if (body.action === 'checkAdmin') return json({ ok: isAdmin });

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
  var byId = {};
  ROOMS.forEach(function (x) { byId[x.id] = x; });
  var items = [], seen = {};
  (r.items || []).forEach(function (it) {
    var room = byId[it.type];
    var q = clampInt(it.qty, 0, MAX_QTY);
    var mode = room && room.zone !== 'A' && it.mode === 'backup' ? 'backup' : 'want';
    if (!room || q < 1 || seen[it.type + mode]) return;
    seen[it.type + mode] = true;
    items.push({ type: it.type, qty: q, mode: mode });
  });
  if (!items.some(function (it) { return byId[it.type].zone === 'A'; })) return { error: 'A 區至少要選一間。' };
  var alts = [];
  (r.alts || []).forEach(function (a) {
    if (byId[a] && byId[a].zone === 'A' && alts.indexOf(a) < 0) alts.push(a);
  });
  return { name: name, adults: adults, kids: kids, items: items, alts: alts,
           note: String(r.note || '').trim().slice(0, 200) };
}

function clampInt(v, lo, hi) { v = Math.round(Number(v) || 0); return Math.max(lo, Math.min(hi, v)); }
function merge(a, b) { var o = {}; [a, b].forEach(function (x) { for (var k in x) o[k] = x[k]; }); return o; }

function publicState(regs) {
  var res = summarize(regs);
  var input = {};
  regs.forEach(function (r) { input[r.id] = { items: r.items, alts: r.alts }; });
  res.regs.forEach(function (o) { o.input = input[o.id]; });
  return { ok: true, rooms: ROOMS, cMin: C_MIN, maxQty: MAX_QTY, result: res, at: Date.now() };
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

if (typeof module !== 'undefined') module.exports = { summarize: summarize, ROOMS: ROOMS, validate: validate };
