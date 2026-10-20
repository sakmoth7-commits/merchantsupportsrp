/**
 * Field Activity Tracker - Google Apps Script backend
 * - Auth (admin / user) with signed tokens
 * - Records saved to Google Sheets (no photos)
 * - Telegram bot sends text + photos to a group
 *
 * Script Properties (Project Settings > Script properties):
 *   BOT_TOKEN  = token from @BotFather
 *   CHAT_ID    = Telegram group chat id (e.g. -1001234567890)
 *   SECRET     = any long random string
 */
const SHEET_RECORDS = 'Records';
const SHEET_USERS = 'Users';
const TZ = 'Asia/Phnom_Penh';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const HEADERS = ['Timestamp','Username','Full Name','Activity Group','Activity Type','Merchant Name','Merchant ID','TID','Phone','Latitude','Longitude','Map Link','Business Hours','Business Type','Notes','Photo Count'];

/* ================= SETUP (run once from the editor) ================= */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let rec = ss.getSheetByName(SHEET_RECORDS) || ss.insertSheet(SHEET_RECORDS);
  rec.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  rec.setFrozenRows(1);
  rec.getRange(2, 1, rec.getMaxRows() - 1, HEADERS.length).setNumberFormat('@'); // keep text (phone, MID, TID)
  let usr = ss.getSheetByName(SHEET_USERS) || ss.insertSheet(SHEET_USERS);
  usr.getRange(1, 1, 1, 4).setValues([['Username','PasswordHash','Role','Full Name']]).setFontWeight('bold');
  if (!props_().getProperty('SECRET')) props_().setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
}
/** Edit the values then run to create/update a user. role = 'admin' or 'user' */
function addUser() {
  const username = 'admin', password = 'ChangeMe123', role = 'admin', fullName = 'Administrator';
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
  const data = sh.getDataRange().getValues();
  const row = [username, hash_(password), role, fullName];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === username.toLowerCase()) { sh.getRange(i + 1, 1, 1, 4).setValues([row]); return; }
  }
  sh.appendRow(row);
}

/* ================= HELPERS ================= */
function props_() { return PropertiesService.getScriptProperties(); }
function hash_(pw) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, props_().getProperty('SECRET') + ':' + pw, Utilities.Charset.UTF_8);
  return raw.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
function sign_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, props_().getProperty('SECRET')));
}
function makeToken_(u) {
  const body = Utilities.base64EncodeWebSafe(JSON.stringify({ u: u.username, r: u.role, n: u.fullName, e: Date.now() + TOKEN_TTL_MS }));
  return body + '.' + sign_(body);
}
function verify_(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  if (sign_(body) !== sig) return null;
  const p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(body)).getDataAsString());
  if (p.e < Date.now()) return null;
  return { username: p.u, role: p.r, fullName: p.n };
}
function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/* ================= ENTRY POINTS ================= */
function doGet() { return out_({ ok: true, msg: 'Field Activity Tracker API' }); }

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.action === 'login') return out_(login_(req));
    const user = verify_(req.token);
    if (!user) return out_({ ok: false, error: 'AUTH' });
    if (['listUsers', 'saveUser', 'deleteUser'].indexOf(req.action) >= 0) {
      if (user.role !== 'admin') return out_({ ok: false, error: 'មានតែ admin ទេ' });
      if (req.action === 'listUsers') return out_(listUsers_());
      if (req.action === 'saveUser') return out_(saveUser_(req, user));
      return out_(deleteUser_(req, user));
    }
    if (req.action === 'submit') return out_(submit_(req, user));
    if (req.action === 'list') return out_(list_(user));
    return out_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

/* ================= ACTIONS ================= */
function login_(req) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
  const data = sh.getDataRange().getValues();
  const h = hash_(String(req.password || ''));
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(req.username || '').toLowerCase() && data[i][1] === h) {
      const u = { username: String(data[i][0]), role: String(data[i][2]).toLowerCase() === 'admin' ? 'admin' : 'user', fullName: String(data[i][3] || data[i][0]) };
      return { ok: true, token: makeToken_(u), username: u.username, role: u.role, fullName: u.fullName };
    }
  }
  return { ok: false, error: 'Username ឬ Password មិនត្រឹមត្រូវ' };
}

function usersSheet_() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS); }

function listUsers_() {
  const data = usersSheet_().getDataRange().getValues();
  const users = data.slice(1).filter(r => r[0]).map(r => ({ username: String(r[0]), role: String(r[2]).toLowerCase() === 'admin' ? 'admin' : 'user', fullName: String(r[3] || '') }));
  return { ok: true, users: users };
}

function saveUser_(r, me) {
  const username = String(r.username || '').trim();
  const role = r.role === 'admin' ? 'admin' : 'user';
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(username)) return { ok: false, error: 'Username ត្រូវមាន 3-30 តួ (A-Z, 0-9, . _ -)' };
  if (r.password && String(r.password).length < 6) return { ok: false, error: 'Password យ៉ាងតិច 6 តួ' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = usersSheet_(), data = sh.getDataRange().getValues();
    let idx = -1;
    for (let i = 1; i < data.length; i++) if (String(data[i][0]).toLowerCase() === username.toLowerCase()) { idx = i; break; }
    if (idx < 0) {
      if (r.isEdit) return { ok: false, error: 'រក user មិនឃើញ' };
      if (!r.password) return { ok: false, error: 'សូមបញ្ចូល Password' };
      sh.appendRow([username, hash_(String(r.password)), role, r.fullName || username]);
    } else {
      if (!r.isEdit) return { ok: false, error: 'Username នេះមានរួចហើយ' };
      if (String(data[idx][0]).toLowerCase() === me.username.toLowerCase() && role !== 'admin') return { ok: false, error: 'មិនអាចដក role admin ពីខ្លួនឯង' };
      const pw = r.password ? hash_(String(r.password)) : data[idx][1];
      sh.getRange(idx + 1, 1, 1, 4).setValues([[data[idx][0], pw, role, r.fullName || data[idx][0]]]);
    }
  } finally { lock.releaseLock(); }
  return { ok: true };
}

function deleteUser_(r, me) {
  const username = String(r.username || '');
  if (username.toLowerCase() === me.username.toLowerCase()) return { ok: false, error: 'មិនអាចលុបខ្លួនឯង' };
  const sh = usersSheet_(), data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === username.toLowerCase()) { sh.deleteRow(i + 1); return { ok: true }; }
  }
  return { ok: false, error: 'រក user មិនឃើញ' };
}

function submit_(r, user) {
  if (user.role !== 'user') return { ok: false, error: 'មានតែ role user ទេដែលអាចបញ្ចូលទិន្នន័យ' };
  const now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
  const photos = (r.photos || []).slice(0, 10);
  const mapLink = r.lat && r.lng ? 'https://www.google.com/maps?q=' + r.lat + ',' + r.lng : '';
  const row = [now, user.username, user.fullName, r.activityGroup, r.activityType, r.merchantName, r.mid, r.tid, r.phone,
               r.lat, r.lng, mapLink, r.businessHours, r.businessType, r.notes, String(photos.length)].map(v => String(v == null ? '' : v));

  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_RECORDS);
    const next = sh.getLastRow() + 1;
    sh.getRange(next, 1, 1, row.length).setNumberFormat('@').setValues([row]);
  } finally { lock.releaseLock(); }

  let tg = false;
  try { tg = sendTelegram_(row, photos); } catch (err) { console.error(err); }
  return { ok: true, telegram: tg };
}

function list_(user) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_RECORDS);
  const last = sh.getLastRow();
  if (last < 2) return { ok: true, rows: [] };
  const start = Math.max(2, last - 4999);
  const vals = sh.getRange(start, 1, last - start + 1, HEADERS.length).getDisplayValues();
  let rows = vals.map(v => { const o = {}; HEADERS.forEach((h, i) => (o[h] = v[i])); return o; });
  if (user.role !== 'admin') rows = rows.filter(o => o['Username'] === user.username);
  return { ok: true, rows: rows };
}

/* ================= TELEGRAM ================= */
function sendTelegram_(row, photos) {
  const token = props_().getProperty('BOT_TOKEN'), chat = props_().getProperty('CHAT_ID');
  if (!token || !chat) return false;
  const api = 'https://api.telegram.org/bot' + token + '/';
  const g = i => esc_(row[i]);
  const text =
    '📋 <b>' + g(4) + '</b>\n' +
    '🗂 Group: ' + g(3) + '\n' +
    '👤 Staff: ' + g(2) + ' (@' + g(1) + ')\n' +
    '🕒 ' + g(0) + '\n\n' +
    '🏪 Merchant: <b>' + g(5) + '</b>\n' +
    '🆔 MID: ' + g(6) + '\n' +
    '🖥 TID: ' + g(7) + '\n' +
    '📞 Phone: ' + g(8) + '\n' +
    '🏷 Business Type: ' + g(13) + '\n' +
    '⏰ Business Hour: ' + g(12) + '\n' +
    (row[11] ? '📍 <a href="' + row[11] + '">Open Map</a> (' + g(9) + ', ' + g(10) + ')\n' : '') +
    (row[14] ? '\n📝 Notes: ' + g(14) : '');

  const res = UrlFetchApp.fetch(api + 'sendMessage', {
    method: 'post', muteHttpExceptions: true,
    payload: { chat_id: chat, text: text, parse_mode: 'HTML', disable_web_page_preview: 'true' }
  });
  let ok = res.getResponseCode() === 200;

  if (photos.length === 1) {
    const r = UrlFetchApp.fetch(api + 'sendPhoto', { method: 'post', muteHttpExceptions: true,
      payload: { chat_id: chat, photo: blob_(photos[0], 0) } });
    ok = ok && r.getResponseCode() === 200;
  } else if (photos.length > 1) {
    const payload = { chat_id: chat }, media = [];
    photos.forEach((b64, i) => { payload['photo' + i] = blob_(b64, i); media.push({ type: 'photo', media: 'attach://photo' + i }); });
    payload.media = JSON.stringify(media);
    const r = UrlFetchApp.fetch(api + 'sendMediaGroup', { method: 'post', muteHttpExceptions: true, payload: payload });
    ok = ok && r.getResponseCode() === 200;
  }
  return ok;
}
function blob_(b64, i) { return Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', 'photo' + (i + 1) + '.jpg'); }
