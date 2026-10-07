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

// ───────────── 第一次使用：在上方函式下拉選單選這個「setup」執行 ─────────────
// （其他函式是給網頁呼叫的，請不要直接執行）
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


// ───────────── 房型設定（改價格或數量只要改這裡） ─────────────
// zone：'1' 包棟必選區、'2' 四間包區、'3' 包棟加選區
var ROOMS = [
  { id: 'jeep', zone: '1', name: '吉普三人房', beds: '1大床+1小床', qty: 2, p26: '4,900', price: 4700, why: '老客戶折扣 200' },
  { id: 'zimu', zone: '1', name: '子母四人房', beds: '1大床+2小床', qty: 2, p26: '5,800', price: 5600, why: '老客戶折扣 200' },
  { id: 'train', zone: '1', name: '火車四人秋千房', beds: '1大床+2小床', qty: 1, p26: '6,800', price: 6600, why: '老客戶折扣 200' },
  { id: 'bunny', zone: '1', name: '兔窩四人秋千房', beds: '1大床+2小床', qty: 1, p26: '6,800', price: 6600, why: '老客戶折扣 200' },
  { id: 'castle', zone: '1', name: '城堡四人秋千房', beds: '1大床+2小床', qty: 1, p26: '6,800', price: 6600, why: '老客戶折扣 200' },
  { id: 'fire', zone: '1', name: '消防英雄滑梯房', beds: '2大床', qty: 2, p26: '6,800', price: 6600, why: '老客戶折扣 200' },
  { id: 'supercar', zone: '1', name: '超跑星空滑梯房', beds: '2大床', qty: 1, p26: '6,800', price: 6600, why: '老客戶折扣 200' },
  { id: 'bus', zone: '1', name: '快樂巴士滑梯房', beds: '2大床', qty: 2, p26: '6,800', price: 6800, why: '原價 7,700，老闆降價' },
  { id: 'rabbit', zone: '2', name: '包區兔兔房', beds: '2大床', qty: 1, p26: '6,800', price: 6800, why: '原價 7,125，老闆降價' },
  { id: 'sail', zone: '2', name: '包區航海房', beds: '2大床', qty: 1, p26: '6,800', price: 6800, why: '原價 7,125，老闆降價' },
  { id: 'lego', zone: '2', name: '包區樂高房', beds: '2大床', qty: 1, p26: '6,800', price: 6800, why: '原價 7,125，老闆降價' },
  { id: 'dino', zone: '2', name: '包區恐龍房', beds: '2大床', qty: 1, p26: '6,800', price: 6800, why: '原價 7,125，老闆降價' },
  { id: 'water', zone: '3', name: '水上漂雙人房', beds: '雙人床+120cm 小床', qty: 2, p26: '4,800', price: 3600, why: '3,800 減老客戶折扣 200' },
  { id: 'diudiu', zone: '3', name: '丟丟噹雙人房', beds: '雙人床', qty: 2, p26: '未知', price: 3600, why: '3,800 減老客戶折扣 200' }
];
var C_MIN = 3;       // 分類 2 包區成立門檻（間）
var SEAT_MAX = 24;   // 座號 1～24
var RELATIONS = ['本人家庭', '親友家庭'];

// 登記名稱：「3號 本人家庭」或「3號 親友家庭（阿姨一家）」
function cleanFriend(t) { return String(t || '').replace(/[（）()]/g, '').trim().slice(0, 20); }
function makeName(seat, rel, friend) { return seat + '號 ' + (rel === '親友家庭' ? '親友家庭（' + cleanFriend(friend) + '）' : rel); }
function parseName(name) {
  var m = /^(\d+)號 (本人家庭|親友家庭)/.exec(String(name || ''));
  return m ? { seat: Number(m[1]), rel: m[2] } : { seat: 999, rel: String(name || '') };
}
function nameOrder(name) {
  var p = parseName(name), i = RELATIONS.indexOf(p.rel);
  return p.seat * 10 + (i < 0 ? 9 : i);
}

// ───────────── 統計（純函式，不碰試算表） ─────────────
/**
 * rooms 每個房型：登記需求、家庭清單、差額、是否需協調。
 * 分類 1「住滿」＝每個分類 1 房型的登記需求都 ≥ 間數。
 * 分類 2、3 的「候補」只在分類 1 協調不到時才需要，所以另外計數，不算進衝突。
 */
function summarize(regs, rooms) {
  regs = regs || [];
  rooms = rooms || ROOMS;
  var order = regs.slice().sort(function (x, y) {
    return nameOrder(x.name) - nameOrder(y.name) || (x.createdAt || 0) - (y.createdAt || 0) || String(x.id).localeCompare(String(y.id));
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

  var aRooms = rooms.filter(function (r) { return r.zone === '1'; });
  var aTotal = 0, aFilled = 0, aDemand = 0;
  aRooms.forEach(function (r) { aTotal += r.qty; aDemand += stat[r.id].demand; aFilled += Math.min(r.qty, stat[r.id].demand); });
  var aFull = aFilled >= aTotal;
  var cDemand = 0, cBackup = 0;
  rooms.forEach(function (r) { if (r.zone === '2') { cDemand += stat[r.id].demand; cBackup += stat[r.id].backup; } });
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
      else if (room.zone === '3' && !aFull) status = 'pending_open';
      else if (room.zone === '2' && !cFormed) status = 'pending_group';
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

var STATUS_TEXT = { clear: '沒有衝突', conflict: '需協調', pending_open: '待分類 1 住滿', pending_group: '待成團', backup: '候補' };

// ───────────── 試算表存取 ─────────────
var SHEET_DATA = '登記資料';
var SHEET_DETAIL = '登記明細';
var SHEET_SUMMARY = '房型統計';
var DATA_HEADERS = ['id', 'editKey', 'createdAt', 'updatedAt', '座號/身分', '大人', '小孩', '房間(JSON)', '可接受分類1(JSON)', '特殊需求'];

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
  var sum = [['分類', '房型', '床型', '間數', '登記需求', '差額', '狀態', '候補', '2027 價格', '登記的家庭', '說明']];
  ROOMS.forEach(function (r) {
    var st = res.rooms[r.id];
    var state = st.over > 0 ? '需協調（超出 ' + st.over + ' 間）' : (st.left > 0 ? '剩 ' + st.left + ' 間' : '剛好');
    var fam = st.families.filter(function (f) { return f.mode !== 'backup'; })
      .map(function (f) { return f.name + (f.qty > 1 ? '×' + f.qty : ''); }).join('、');
    sum.push([r.zone, r.name, r.beds, r.qty, st.demand, st.demand - r.qty, state, st.backup || '', r.price, fam, r.why]);
  });
  sum.push(['', '', '', '', '', '', '', '', '', '', '']);
  sum.push(['分類 1', '已登記 ' + s.aFilled + ' / ' + s.aTotal + ' 間', s.aFull ? '已住滿' : '未住滿', '', '', '', '', '', '', '', '']);
  sum.push(['分類 3', s.bOpen ? '開放條件已達成' : '等分類 1 住滿', '', '', '', '', '', '', '', '', '']);
  sum.push(['分類 2', '登記 ' + s.cDemand + ' 間（門檻 ' + s.cMin + '）', s.cFormed ? '已成團' : '未成團', '', '', '', '', '', '', '', '']);
  sum.push(['人數', s.families + ' 個家庭', '大人 ' + s.adults, '小孩 ' + s.kids, '', '', '', '', '', '', '']);
  var sh2 = ss.getSheetByName(SHEET_SUMMARY) || ss.insertSheet(SHEET_SUMMARY);
  sh2.clearContents();
  sh2.getRange(1, 1, sum.length, sum[0].length).setValues(sum);
  sh2.getRange(1, 1, 1, sum[0].length).setFontWeight('bold');
  sh2.setFrozenRows(1);

  // 登記明細：一個家庭一列，每個房型一欄
  var head = ['順序', '座號/身分', '大人', '小孩'].concat(ROOMS.map(function (r) { return '分類' + r.zone + ' ' + r.name; }))
    .concat(['候補房型', '可接受的其他分類 1 房型', '特殊需求']);
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
      var dup = readRegs().filter(function (r) { return r.name === clean.name && r.id !== id; })[0];
      if (dup) return json({ ok: false, error: clean.name + ' 已經登記過了。要修改請到「目前統計」找到那筆登記按「修改」。' });
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
  var seat = Math.round(Number(r.seat) || 0);
  if (seat < 1 || seat > SEAT_MAX) return { error: '請選擇座號。' };
  if (RELATIONS.indexOf(r.rel) < 0) return { error: '請選擇本人家庭或親友家庭。' };
  if (r.rel === '親友家庭' && !cleanFriend(r.friend)) return { error: '請填寫親友家庭說明。' };
  var name = makeName(seat, r.rel, r.friend);
  var adults = clampInt(r.adults, 0, 20), kids = clampInt(r.kids, 0, 20);
  if (adults + kids < 1) return { error: '請填寫入住人數。' };
  var byId = {};
  ROOMS.forEach(function (x) { byId[x.id] = x; });
  var items = [], seen = {};
  (r.items || []).forEach(function (it) {
    var room = byId[it.type];
    var q = room ? clampInt(it.qty, 0, room.qty) : 0;
    var mode = room && room.zone !== '1' && it.mode === 'backup' ? 'backup' : 'want';
    if (!room || q < 1 || seen[it.type + mode]) return;
    seen[it.type + mode] = true;
    items.push({ type: it.type, qty: q, mode: mode });
  });
  if (!items.some(function (it) { return byId[it.type].zone === '1'; })) return { error: '分類 1 包棟必選區至少要選一間。' };
  var alts = [];
  (r.alts || []).forEach(function (a) {
    if (byId[a] && byId[a].zone === '1' && alts.indexOf(a) < 0) alts.push(a);
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
  return { ok: true, rooms: ROOMS, cMin: C_MIN, seatMax: SEAT_MAX, relations: RELATIONS, result: res, at: Date.now() };
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

if (typeof module !== 'undefined') module.exports = { summarize: summarize, ROOMS: ROOMS, validate: validate };
