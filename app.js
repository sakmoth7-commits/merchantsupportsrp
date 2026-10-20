/* Field Activity Tracker - Frontend */
const CFG = window.APP_CONFIG;
const $ = (id) => document.getElementById(id);

const ACTIVITIES = {
  "Merchant Visit": [
    "ចុះមើល QR ថ្មី និងអាចប្រើបាន (Record merchant info)",
    "Merchant មិនព្រមប្រើផលិតផលរបស់យើង",
    "Merchant ទទួលការទូទាត់តែលុយសុទ្ធ",
    "Merchant មិនប្រើដោយហេតុផលណាមួយ",
    "Merchant ទទួលបានអត្ថប្រយោជន៍ពីដៃគូប្រកួតប្រជែង",
    "កម្មវិធីទូរស័ព្ទរបស់គាត់មិនអាចបើកចូលបាន",
    "Onboard new merchant",
    "Open IA account",
    "ចុះមើលទីតាំងសម្រាប់ជួលដាក់ម៉ាស៊ីនស្វ័យប្រវត្តិ",
    "នាំយកឯកសារទៅឱ្យ Merchant ស៊ីញ៉េ"
  ],
  "POS": [
    "New POS installation", "Replacement POS", "Maintenance POS",
    "POS Return/Termination", "Battery POS replacement", "Fixed POS issue", "Provide paper roll"
  ],
  "Soundbox": [
    "New Soundbox installation", "Soundbox replacement", "Maintenance Soundbox",
    "Fixed Soundbox issue", "Soundbox return/termination", "Soundbox battery replacement"
  ]
};
const BUSINESS_TYPES = ["Restaurant","Café / Coffee shop","Grocery / Mini mart","Supermarket","Pharmacy","Salon / Spa","Fashion / Clothing","Electronics / Phone shop","Gas station","Hotel / Guesthouse","Street vendor","Service","Other"];
const COLS = ["Timestamp","Username","Full Name","Activity Group","Activity Type","Merchant Name","Merchant ID","TID","Phone","Latitude","Longitude","Map Link","Business Hours","Business Type","Notes","Photo Count"];

let session = null;       // {token, username, fullName, role}
let rows = [];            // loaded records
let photos = [];          // [{name, b64}]
let charts = {};

/* ---------- helpers ---------- */
function toast(msg, kind) {
  const t = $("toast");
  t.textContent = msg; t.className = "toast " + (kind || ""); t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 3500);
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function api(action, data) {
  if (!CFG.API_URL || CFG.API_URL.startsWith("PASTE")) throw new Error("មិនទាន់កំណត់ API_URL ក្នុង config.js");
  const res = await fetch(CFG.API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoid CORS preflight
    body: JSON.stringify({ action, token: session && session.token, ...data })
  });
  const json = await res.json();
  if (!json.ok) {
    if (json.error === "AUTH") { logout(); throw new Error("Session ផុតកំណត់ សូមចូលម្តងទៀត"); }
    throw new Error(json.error || "Server error");
  }
  return json;
}

/* ---------- auth ---------- */
function saveSession() { localStorage.setItem("ft_session", JSON.stringify(session)); }
function logout() {
  session = null; localStorage.removeItem("ft_session");
  $("appView").hidden = true; $("loginView").hidden = false;
}
$("logoutBtn").onclick = logout;

$("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  $("loginErr").textContent = ""; $("loginBtn").disabled = true;
  try {
    const r = await api("login", { username: $("loginUser").value.trim(), password: $("loginPass").value });
    session = { token: r.token, username: r.username, fullName: r.fullName, role: r.role };
    saveSession(); startApp();
  } catch (err) { $("loginErr").textContent = err.message; }
  $("loginBtn").disabled = false;
};

/* ---------- app shell ---------- */
function startApp() {
  $("loginView").hidden = true; $("appView").hidden = false;
  $("whoName").textContent = session.fullName || session.username;
  $("whoRole").textContent = session.role;
  const isAdmin = session.role === "admin";
  const tabs = isAdmin
    ? [["data", "📊 Dashboard"], ["users", "👥 Users"]]
    : [["form", "📝 បញ្ចូលទិន្នន័យ"], ["data", "📋 លទ្ធផលរបស់ខ្ញុំ"]];
  $("tabs").innerHTML = "";
  tabs.forEach(([id, label]) => {
    const b = document.createElement("button"); b.textContent = label; b.dataset.tab = id;
    b.onclick = () => showTab(id); $("tabs").appendChild(b);
  });
  $("fUserWrap").hidden = !isAdmin;
  $("charts").hidden = !isAdmin;
  showTab(tabs[0][0]);
}
function showTab(id) {
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
  $("formView").hidden = id !== "form";
  $("dataView").hidden = id !== "data";
  $("usersView").hidden = id !== "users";
  if (id === "data") loadData();
  if (id === "users") loadUsers();
}

/* ---------- user management (admin) ---------- */
let userList = [];
async function loadUsers() {
  try {
    const r = await api("listUsers", {});
    userList = r.users;
    $("userTable").innerHTML = "<thead><tr><th>Username</th><th>Full Name</th><th>Role</th><th></th></tr></thead><tbody>" +
      userList.map((u, i) => `<tr><td>${esc(u.username)}</td><td>${esc(u.fullName)}</td><td>${esc(u.role)}</td>` +
        `<td><button class="btn small" data-edit="${i}">កែ</button> <button class="btn small" data-del="${i}">លុប</button></td></tr>`).join("") + "</tbody>";
  } catch (err) { toast(err.message, "bad"); }
}
function clearUserForm() {
  $("userForm").reset(); $("uOrig").value = ""; $("uName").readOnly = false;
  $("uPass").placeholder = ""; $("uTitle").textContent = "បន្ថែម User ថ្មី";
}
$("uClear").onclick = clearUserForm;
$("userTable").onclick = async (e) => {
  const ed = e.target.dataset.edit, dl = e.target.dataset.del;
  if (ed !== undefined) {
    const u = userList[+ed];
    $("uOrig").value = u.username; $("uName").value = u.username; $("uName").readOnly = true;
    $("uFull").value = u.fullName; $("uRole").value = u.role; $("uPass").value = "";
    $("uPass").placeholder = "ទុកទទេ បើមិនប្តូរ"; $("uTitle").textContent = "កែ User: " + u.username;
    $("userForm").scrollIntoView({ behavior: "smooth" });
  } else if (dl !== undefined) {
    const u = userList[+dl];
    if (!confirm(`លុប user "${u.username}" ?`)) return;
    try { await api("deleteUser", { username: u.username }); toast("បានលុប", "ok"); loadUsers(); }
    catch (err) { toast(err.message, "bad"); }
  }
};
$("userForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api("saveUser", {
      isEdit: !!$("uOrig").value, username: $("uName").value.trim(),
      fullName: $("uFull").value.trim(), role: $("uRole").value, password: $("uPass").value
    });
    toast("រក្សាទុកហើយ ✔", "ok"); clearUserForm(); loadUsers();
  } catch (err) { toast(err.message, "bad"); }
};

/* ---------- form setup ---------- */
function fillSelects() {
  const sel = $("activityType");
  sel.innerHTML = '<option value="">-- ជ្រើសរើស --</option>';
  Object.entries(ACTIVITIES).forEach(([group, list]) => {
    const og = document.createElement("optgroup"); og.label = group;
    list.forEach((a) => { const o = document.createElement("option"); o.value = a; o.textContent = a; o.dataset.group = group; og.appendChild(o); });
    sel.appendChild(og);
  });
  $("businessType").innerHTML = '<option value="">-- ជ្រើសរើស --</option>' + BUSINESS_TYPES.map((b) => `<option>${esc(b)}</option>`).join("");
  $("fType").innerHTML = '<option value="">ទាំងអស់</option>' + Object.values(ACTIVITIES).flat().map((a) => `<option>${esc(a)}</option>`).join("");
}
fillSelects();

/* ---------- QR scan & decode ---------- */
function parseTLV(s) {
  const o = {}; let i = 0;
  while (i + 4 <= s.length) {
    const tag = s.substr(i, 2), len = parseInt(s.substr(i + 2, 2), 10);
    if (isNaN(len) || i + 4 + len > s.length) break;
    o[tag] = s.substr(i + 4, len); i += 4 + len;
  }
  return o;
}
function decodeQR(text) {
  $("rawText").textContent = text; $("rawBox").hidden = false;
  let name = "", mid = "", tid = "";
  const root = parseTLV(text);
  if (root["00"] && root["59"]) {               // EMV / KHQR
    name = root["59"];
    const ad = root["62"] ? parseTLV(root["62"]) : {};
    tid = ad["07"] || "";                       // terminal label
    for (const t of ["29", "30"]) {             // MID from tag 29 or 30
      if (root[t]) { const sub = parseTLV(root[t]); mid = sub["00"] || root[t]; break; }
    }
  } else {                                      // plain-text fallback
    const m = (re) => { const r = text.match(re); return r ? r[1].trim() : ""; };
    name = m(/name\s*[:=]\s*([^\n,;|&]+)/i);
    mid = m(/mid\s*[:=]\s*([A-Za-z0-9_-]+)/i);
    tid = m(/tid\s*[:=]\s*([A-Za-z0-9_-]+)/i);
  }
  if (name) $("merchantName").value = name;
  if (mid) $("mid").value = mid;
  if (tid) $("tid").value = tid;
  toast(name || mid ? "បានអាន QR ✔ សូមពិនិត្យព័ត៌មាន" : "អាន QR បាន តែរកមិនឃើញព័ត៌មាន Merchant", name || mid ? "ok" : "bad");
}
let scanner = null;
$("scanBtn").onclick = async () => {
  if (scanner) { await stopScan(); return; }
  $("qrReader").hidden = false;
  scanner = new Html5Qrcode("qrReader");
  try {
    await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 240 }, async (txt) => { await stopScan(); decodeQR(txt); });
    $("scanBtn").textContent = "⏹ បិទកាមេរ៉ា";
  } catch (e) { toast("បើកកាមេរ៉ាមិនបាន: " + e, "bad"); await stopScan(); }
};
async function stopScan() {
  try { if (scanner) { await scanner.stop(); scanner.clear(); } } catch (_) {}
  scanner = null; $("qrReader").hidden = true; $("scanBtn").textContent = "📷 Scan QR";
}
$("scanFileBtn").onclick = () => $("qrFile").click();
$("qrFile").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const s = new Html5Qrcode("qrReader");
    const txt = await s.scanFile(f, false); s.clear(); $("qrReader").hidden = true; decodeQR(txt);
  } catch (err) { toast("រក QR មិនឃើញក្នុងរូបភាព", "bad"); }
  e.target.value = "";
};

/* ---------- location ---------- */
let map = null, marker = null;
function setLoc(lat, lng) {
  $("lat").value = lat.toFixed(6); $("lng").value = lng.toFixed(6);
  $("locText").textContent = `📍 ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  if (marker) marker.setLatLng([lat, lng]);
}
$("gpsBtn").onclick = () => {
  if (!navigator.geolocation) return toast("ឧបករណ៍មិនគាំទ្រ GPS", "bad");
  $("locText").textContent = "កំពុងរកទីតាំង...";
  navigator.geolocation.getCurrentPosition(
    (p) => { setLoc(p.coords.latitude, p.coords.longitude); if (map) { map.setView([p.coords.latitude, p.coords.longitude], 17); } },
    () => { $("locText").textContent = "មិនទាន់ជ្រើសទីតាំង"; toast("មិនអាចទទួលទីតាំង សូមអនុញ្ញាត Location", "bad"); },
    { enableHighAccuracy: true, timeout: 15000 }
  );
};
$("mapBtn").onclick = () => {
  $("map").hidden = !$("map").hidden;
  if ($("map").hidden) return;
  if (!map) {
    const start = [11.5564, 104.9282]; // Phnom Penh
    map = L.map("map").setView($("lat").value ? [+$("lat").value, +$("lng").value] : start, 15);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    marker = L.marker(start, { draggable: true }).addTo(map);
    marker.on("dragend", () => { const p = marker.getLatLng(); setLoc(p.lat, p.lng); });
    map.on("click", (e) => { marker.setLatLng(e.latlng); setLoc(e.latlng.lat, e.latlng.lng); });
  }
  setTimeout(() => map.invalidateSize(), 100);
  if ($("lat").value) marker.setLatLng([+$("lat").value, +$("lng").value]);
};

/* ---------- photos ---------- */
$("photoBtn").onclick = () => $("photoInput").click();
$("photoInput").onchange = async (e) => {
  for (const f of e.target.files) {
    try { photos.push({ name: f.name, b64: await compress(f), url: null }); } catch (_) { toast("រូបភាពមួយមិនអាចអានបាន", "bad"); }
  }
  e.target.value = ""; renderPreviews();
};
function compress(file, max = 1280, q = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u); resolve(c.toDataURL("image/jpeg", q).split(",")[1]);
    };
    img.onerror = reject; img.src = u;
  });
}
function renderPreviews() {
  $("previews").innerHTML = "";
  photos.forEach((p, i) => {
    const d = document.createElement("div");
    d.innerHTML = `<img src="data:image/jpeg;base64,${p.b64}"><button type="button" title="លុប">×</button>`;
    d.querySelector("button").onclick = () => { photos.splice(i, 1); renderPreviews(); };
    $("previews").appendChild(d);
  });
}

/* ---------- submit ---------- */
$("activityForm").onsubmit = async (e) => {
  e.preventDefault();
  const opt = $("activityType").selectedOptions[0];
  if (!$("activityType").value) return toast("សូមជ្រើស Activity Type", "bad");
  if (!$("merchantName").value.trim()) return toast("សូមបំពេញ Merchant Name", "bad");
  const o = $("openTime").value, c = $("closeTime").value;
  const payload = {
    activityGroup: opt.dataset.group || "",
    activityType: $("activityType").value,
    merchantName: $("merchantName").value.trim(),
    mid: $("mid").value.trim(), tid: $("tid").value.trim(), phone: $("phone").value.trim(),
    lat: $("lat").value, lng: $("lng").value,
    businessHours: o || c ? `${o || "?"} - ${c || "?"}` : "",
    businessType: $("businessType").value, notes: $("notes").value.trim(),
    photos: photos.map((p) => p.b64)
  };
  $("submitBtn").disabled = true; $("submitBtn").textContent = "កំពុងផ្ញើ...";
  try {
    const r = await api("submit", payload);
    toast(r.telegram ? "រក្សាទុក និងផ្ញើ Telegram ជោគជ័យ ✔" : "រក្សាទុកហើយ តែផ្ញើ Telegram មិនបាន ⚠", r.telegram ? "ok" : "bad");
    $("activityForm").reset(); photos = []; renderPreviews();
    $("lat").value = $("lng").value = ""; $("locText").textContent = "មិនទាន់ជ្រើសទីតាំង"; $("rawBox").hidden = true;
  } catch (err) { toast(err.message, "bad"); }
  $("submitBtn").disabled = false; $("submitBtn").textContent = "Submit";
};

/* ---------- data / dashboard ---------- */
async function loadData() {
  try {
    const r = await api("list", {});
    rows = r.rows;
    const users = [...new Set(rows.map((x) => x["Username"]))].sort();
    const cur = $("fUser").value;
    $("fUser").innerHTML = '<option value="">ទាំងអស់</option>' + users.map((u) => `<option>${esc(u)}</option>`).join("");
    $("fUser").value = cur;
    render();
  } catch (err) { toast(err.message, "bad"); }
}
function filtered() {
  const from = $("fFrom").value, to = $("fTo").value, type = $("fType").value, user = $("fUser").value, q = $("fSearch").value.trim().toLowerCase();
  return rows.filter((r) => {
    const d = (r["Timestamp"] || "").slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (type && r["Activity Type"] !== type) return false;
    if (user && r["Username"] !== user) return false;
    if (q && !`${r["Merchant Name"]} ${r["Merchant ID"]} ${r["TID"]}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
const countBy = (arr, key) => arr.reduce((m, r) => ((m[r[key]] = (m[r[key]] || 0) + 1), m), {});
function render() {
  const data = filtered();
  $("rowCount").textContent = data.length;
  const today = new Date().toISOString().slice(0, 10);
  const todayN = data.filter((r) => (r["Timestamp"] || "").startsWith(today)).length;
  const grp = countBy(data, "Activity Group");
  $("stats").innerHTML = [["សរុប", data.length], ["ថ្ងៃនេះ", todayN], ["Merchant Visit", grp["Merchant Visit"] || 0], ["POS", grp["POS"] || 0], ["Soundbox", grp["Soundbox"] || 0]]
    .map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");

  $("dataTable").innerHTML = "<thead><tr>" + COLS.map((c) => `<th>${c}</th>`).join("") + "</tr></thead><tbody>" +
    data.slice().reverse().slice(0, 500).map((r) => "<tr>" + COLS.map((c) =>
      c === "Map Link" && r[c] ? `<td><a href="${esc(r[c])}" target="_blank" rel="noopener">Map</a></td>` : `<td>${esc(r[c])}</td>`).join("") + "</tr>").join("") + "</tbody>";

  if (session.role === "admin") drawCharts(data);
}
function drawChart(id, type, labels, values, horizontal) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart($(id), {
    type, data: { labels, datasets: [{ data: values, backgroundColor: "#1f6feb", borderColor: "#1f6feb", tension: .3 }] },
    options: { indexAxis: horizontal ? "y" : "x", plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 } }, y: { ticks: { precision: 0 } } } }
  });
}
function drawCharts(data) {
  const t = countBy(data, "Activity Type"); drawChart("chType", "bar", Object.keys(t), Object.values(t), true);
  const d = {}; data.forEach((r) => { const k = (r["Timestamp"] || "").slice(0, 10); d[k] = (d[k] || 0) + 1; });
  const dk = Object.keys(d).sort(); drawChart("chDay", "line", dk, dk.map((k) => d[k]));
  const u = countBy(data, "Username"); drawChart("chUser", "bar", Object.keys(u), Object.values(u));
}
["fFrom", "fTo", "fType", "fUser"].forEach((id) => ($(id).onchange = render));
$("fSearch").oninput = render;
$("refreshBtn").onclick = loadData;

/* ---------- export ---------- */
function stamp() { return new Date().toISOString().slice(0, 10); }
$("csvBtn").onclick = () => {
  const data = filtered();
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "﻿" + [COLS.map(q).join(",")].concat(data.map((r) => COLS.map((c) => q(r[c])).join(","))).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `activities_${stamp()}.csv`; a.click();
};
$("xlsxBtn").onclick = () => {
  const data = filtered().map((r) => Object.fromEntries(COLS.map((c) => [c, r[c]])));
  const ws = XLSX.utils.json_to_sheet(data, { header: COLS }), wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Activities"); XLSX.writeFile(wb, `activities_${stamp()}.xlsx`);
};

/* ---------- boot ---------- */
try { session = JSON.parse(localStorage.getItem("ft_session") || "null"); } catch (_) {}
if (session && session.token) startApp();
