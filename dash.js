/**
 * لوحة المدير — مدرسة نور السلام القرآنية
 * • البيانات تُنزَّل مضغوطة مرة واحدة من الخادم وتُحفظ في الجهاز (IndexedDB)
 * • عند الفتح: تظهر اللوحة فوراً من الجهاز، ثم يُسأل الخادم: هل تغيّر شيء؟
 * • كل الفلاتر والحسابات تجري في الجهاز (crossfilter) ← نتيجة لحظية
 */
(() => {
'use strict';

/* ───────── أدوات عامة ───────── */
const $ = id => document.getElementById(id);
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem('nsd.' + k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem('nsd.' + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem('nsd.' + k); } catch (e) {} }
};
const fmt = n => n.toLocaleString('en-US');
const pct = (v, dig = 1) => v == null ? '—' : (v * 100).toFixed(dig);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const lvlOf = (r, good, mid) => r == null ? '' : r >= good ? 'ok' : r >= mid ? 'warn' : 'bad';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hhmm = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

/* ───────── التخزين في الجهاز ───────── */
let dbP = null;
function db() {
  if (!dbP) dbP = new Promise(res => {
    try { const r = indexedDB.open('nsd', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }
    catch (e) { res(null); }
  });
  return dbP;
}
async function idbGet(k) {
  const d = await db(); if (!d) return null;
  return new Promise(res => { try { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch (e) { res(null); } });
}
async function idbSet(k, v) {
  const d = await db(); if (!d) return;
  return new Promise(res => { try { const t = d.transaction('kv', 'readwrite'); v == null ? t.objectStore('kv').delete(k) : t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = res; } catch (e) { res(); } });
}

/* ───────── الاتصال بالخادم ───────── */
const canGz = typeof DecompressionStream !== 'undefined';
async function call(body) {
  const ctrl = new AbortController(), tm = setTimeout(() => ctrl.abort(), 90000);
  try {
    const r = await fetch(window.APP_CONFIG.API_URL, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctrl.signal });
    const j = await r.json();
    if (!j.ok) { const e = new Error(j.message || 'حدث خطأ في الخادم'); e.code = j.error || 'ERROR'; throw e; }
    return j.data;
  } catch (e) {
    if (!e.code) { e.code = 'NET'; e.message = 'تعذّر الاتصال بالخادم، تحقق من الإنترنت'; }
    throw e;
  } finally { clearTimeout(tm); }
}
async function gunzip(b64) {
  const bin = atob(b64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}
async function fetchData(ver) {
  const r = await call({ action: 'dash', ver: ver || '', raw: !canGz });
  if (r.same) return { ver: r.ver, same: true };
  return { ver: r.ver, data: r.data || await gunzip(r.gz) };
}

/* ───────── المعجم والثوابت ───────── */
const DAY = 864e5;
const MONTHS = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const wdOf = n => (n + 4) % 7;   // رقم اليوم منذ 1970 ← يوم الأسبوع (0 = الأحد)

/* ───────── البيانات بعد التحويل (تُعاد عند كل تحديث) ───────── */
let START, NDAYS, NW, TODAY, FIRST, weeks, HOLI, holWeeks, RAM, PERIODS, LV, CUR, ST, TRAD, TO, SJ, OFFR, QT, W;
let classes, teachers, students, att, logs, lessons, quran, offs;
let cf, dDim, cDim, sDim, all, byWeek, byCls, byStu;
let cf2, dDim2, cDim2, tDim2, sjDim, stDim, all2, byT2, bySj, bySt;

const dLabel = d => { const x = new Date((START + d) * DAY); return x.getUTCDate() + ' ' + MONTHS[x.getUTCMonth()]; };
const wOf = d => Math.floor(d / 7);
const attR = p => p.n ? (p.n - p.ab) / p.n : null;
const recR = p => (p.n - p.ab) ? p.r / (p.n - p.ab) : null;
const add = (p, v) => { p.n++; if (v.a === 2) p.ab++; else if (v.a === 1) p.l++; p.r += v.r; return p; };
const rem = (p, v) => { p.n--; if (v.a === 2) p.ab--; else if (v.a === 1) p.l--; p.r -= v.r; return p; };
const ini = () => ({ n: 0, ab: 0, l: 0, r: 0 });
const isIA = l => l.st.some(x => !TRAD.has(x));
const add2 = (p, v) => { p.n++; p.st += v.st.length; p.to += v.to.length ? 1 : 0; p.ia += isIA(v) ? 1 : 0; return p; };
const rem2 = (p, v) => { p.n--; p.st -= v.st.length; p.to -= v.to.length ? 1 : 0; p.ia -= isIA(v) ? 1 : 0; return p; };
const ini2 = () => ({ n: 0, st: 0, to: 0, ia: 0 });
const score = p => p.n ? 100 * (W[0] * p.ia / p.n + W[1] * p.to / p.n + W[2] * Math.min(1, p.st / p.n / 2.5)) / (W[0] + W[1] + W[2] || 1) : null;

function load(raw) {
  TODAY = raw.today;
  const days = raw.att.d.concat(raw.logs.map(l => l[0]));
  const first = raw.season != null ? raw.season : (days.length ? Math.min(...days) : TODAY - 6);
  START = first - ((wdOf(first) - 6 + 7) % 7);               // الأسبوع يبدأ يوم السبت
  NDAYS = Math.max(1, TODAY - START + 1);
  NW = wOf(NDAYS - 1) + 1;
  const off0 = first - START;
  FIRST = off0;
  const inSeason = n => n >= first && n <= TODAY;
  weeks = Array.from({ length: NW }, (_, w) => dLabel(w * 7));

  HOLI = (raw.holidays || []).map(h => [h[0] - START, h[1] - START, h[2]]).filter(h => h[1] >= 0 && h[0] < NDAYS);
  const isHol = d => HOLI.some(h => d >= h[0] && d <= h[1]);
  holWeeks = HOLI.map(h => [Math.max(0, wOf(h[0]) + (h[0] % 7 > 3 ? 1 : 0)), Math.min(NW - 1, wOf(h[1]) - (h[1] % 7 < 3 ? 1 : 0)), h[2]]).filter(h => h[0] <= h[1]);
  RAM = raw.ramadan && raw.ramadan[1] - START >= 0 && raw.ramadan[0] - START < NDAYS ? [Math.max(0, raw.ramadan[0] - START), Math.min(NDAYS - 1, raw.ramadan[1] - START)] : null;

  // القوائم
  ST = raw.lists.st; TO = raw.lists.to; SJ = raw.lists.sj; OFFR = raw.lists.off; QT = raw.lists.qt;
  TRAD = new Set(ST.map((s, i) => (raw.trad || []).indexOf(s) > -1 ? i : -1).filter(i => i > -1));
  W = raw.weights || [40, 30, 30];
  LV = (raw.levels || []).slice();
  raw.classes.forEach(c => { const l = c.level || 'بدون مستوى'; if (LV.indexOf(l) < 0) LV.push(l); });
  CUR = lv => (raw.curriculum || {})[LV[lv]] || [];

  // القواميس
  classes = raw.classes.map((c, i) => ({ id: i, code: c.id, name: c.name, lv: LV.indexOf(c.level || 'بدون مستوى'), type: c.type, days: c.days || [], on: c.on, rows: 0 }));
  teachers = raw.teachers.map((t, i) => ({ id: i, code: t.id, name: t.name, on: t.on, cls: [], main: false, role: 'معلم مادة' }));
  students = raw.students.map((s, i) => ({ id: i, name: s.name, c: s.c }));
  raw.assign.forEach(a => { const t = teachers[a.t]; if (t.cls.indexOf(a.c) < 0) t.cls.push(a.c); if (a.main) { t.main = true; t.role = 'معلم قسم'; } });

  // الحضور والاستظهار
  att = [];
  const A = raw.att;
  for (let i = 0; i < A.d.length; i++) {
    if (!inSeason(A.d[i])) continue;
    const s = students[A.s[i]];
    if (s.c == null || s.c < 0) s.c = A.c[i];
    classes[A.c[i]].rows++;
    att.push({ d: A.d[i] - START, c: A.c[i], s: A.s[i], a: A.a[i], r: A.r[i] === 1 ? 1 : 0 });
  }

  // السجل اليومي ← دروس + حصص قرآن + أيام لم تُقدَّم + تقارير مُرسلة
  lessons = []; quran = []; offs = [];
  const sent = new Set();
  for (const l of raw.logs) {
    if (!inSeason(l[0])) continue;
    const d = l[0] - START, c = l[1], t = l[2];
    sent.add(d + '|' + c + '|' + t);
    classes[c].rows++;
    if (teachers[t].cls.indexOf(c) < 0) teachers[t].cls.push(c);
    if (l[4]) { offs.push({ d, c, t, r: l[5] }); continue; }
    if (l[3] && l[6] > -1) quran.push({ d, c, t, q: l[6] });
    for (const x of l[7]) lessons.push({ d, c, t, sj: x[0], st: x[1], to: x[2], tk: x[3] });
  }

  // التقارير المطلوبة: لكل معلم قسم، في كل يوم دراسة لقسمه (عدا العطل). اليوم الجاري لا يُعدّ ناقصاً بعد
  logs = [];
  for (const a of raw.assign) {
    if (!a.main) continue;
    const c = classes[a.c];
    if (!c.on) continue;
    for (let d = off0; d < NDAYS; d++) {
      const wd = wdOf(START + d);
      if (c.days.length ? c.days.indexOf(wd) < 0 : wd === 5) continue;
      if (isHol(d)) continue;
      const ok = sent.has(d + '|' + a.c + '|' + a.t) ? 1 : 0;
      if (d === NDAYS - 1 && !ok) continue;
      logs.push({ d, c: a.c, t: a.t, ok });
    }
  }

  // يوم الإرسال لكل تقرير (للتأخر) + تقارير معلمي المواد
  const delayOf = new Map();
  subLogs = [];
  for (const l of raw.logs) {
    if (!inSeason(l[0])) continue;
    const d = l[0] - START, dl = l[8] != null ? Math.max(0, l[8] - l[0]) : 0;
    delayOf.set(d + '|' + l[1] + '|' + l[2], dl);
    if (!l[3]) subLogs.push({ d, c: l[1], t: l[2], dl });
  }
  for (const x of logs) x.dl = x.ok ? (delayOf.get(x.d + '|' + x.c + '|' + x.t) || 0) : null;

  // التلاميذ المسجّلون في كل قسم
  classStu = new Map();
  raw.students.forEach((s, i) => { if (s.on === false || s.c == null || s.c < 0) return; (classStu.get(s.c) || classStu.set(s.c, []).get(s.c)).push(i); });

  // محرك الفلاتر
  cf = crossfilter(att);
  dDim = cf.dimension(r => r.d); cDim = cf.dimension(r => r.c); sDim = cf.dimension(r => r.s);
  all = cf.groupAll().reduce(add, rem, ini);
  byWeek = dDim.group(d => Math.floor(d / 7)).reduce(add, rem, ini);
  byCls = cDim.group().reduce(add, rem, ini);
  byStu = sDim.group().reduce(add, rem, ini);

  cf2 = crossfilter(lessons);
  dDim2 = cf2.dimension(r => r.d); cDim2 = cf2.dimension(r => r.c); tDim2 = cf2.dimension(r => r.t);
  sjDim = cf2.dimension(r => r.sj); stDim = cf2.dimension(r => r.st, true);
  all2 = cf2.groupAll().reduce(add2, rem2, ini2);
  byT2 = tDim2.group().reduce(add2, rem2, ini2); bySj = sjDim.group().reduceCount(); bySt = stDim.group().reduceCount();
}
let subLogs = [], classStu = new Map();

/* ───────── التواريخ والفترة ───────── */
const WD = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const iso = d => new Date((START + d) * DAY).toISOString().slice(0, 10);
const fromIso = s => /^\d{4}-\d{2}-\d{2}$/.test(s) ? Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY) - START : null;
const ymd = d => { const x = new Date((START + d) * DAY); return [x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()]; };
const dOf = (y, m, dd) => Math.round(Date.UTC(y, m, dd) / DAY) - START;
const dShort = d => { const x = new Date((START + d) * DAY); return WD[x.getUTCDay()] + ' ' + x.getUTCDate() + ' ' + MONTHS[x.getUTCMonth()]; };
const dTiny = d => { const [, m, dd] = ymd(d); return dd + ' ' + MONTHS[m]; };

// الأسبوع من السبت إلى الجمعة (ترتيب أيام صفحة البرنامج الأسبوعي)
function periodOf(unit, a) {
  if (unit === 'day') return [a, a];
  if (unit === 'week') { const s = a - ((wdOf(START + a) - 6 + 7) % 7); return [s, s + 6]; }
  const [y, m] = ymd(a); return [dOf(y, m, 1), dOf(y, m + 1, 1) - 1];
}
function periodLabel() {
  if (F.unit === 'day') return dShort(F.d0);
  if (F.unit === 'month') { const [y, m] = ymd(F.d0); return MONTHS[m] + ' ' + y; }
  return F.d0 === F.d1 ? dShort(F.d0) : dTiny(F.d0) + ' – ' + dTiny(F.d1);
}
function setPeriod(unit, anchor) { F.unit = unit; [F.d0, F.d1] = periodOf(unit, anchor); }
function shiftPeriod(dir) {
  if (F.unit === 'day') setPeriod('day', F.d0 + dir);
  else if (F.unit === 'week') setPeriod('week', F.d0 + 7 * dir);
  else if (F.unit === 'month') { const [y, m] = ymd(F.d0); setPeriod('month', dOf(y, m + dir, 1)); }
  else { const len = F.d1 - F.d0 + 1; F.d0 += dir * len; F.d1 += dir * len; }
}
const canShift = dir => dir > 0 ? F.d1 < NDAYS - 1 : F.d0 > FIRST;

/* ───────── الحالة ───────── */
const F = { unit: 'month', d0: 0, d1: 0, cls: null, tch: null, lvl: null, typ: null, stu: null, subj: null, strat: null };
let metric = 'att', tab = 'att', loaded = false, ver = '', syncedAt = 0;
const more = { 't-stu': false, 't-rstu': false };
const PAGE = 25;
const TABS = { att: 'الحضور', rec: 'الاستظهار', rep: 'جودة التقارير', q: 'جودة التدريس', ch: 'الرسوم' };

function allowedByOthers() {
  const s = new Set();
  for (const c of classes) {
    if (F.lvl != null && c.lv !== F.lvl) continue;
    if (F.typ != null && c.type !== F.typ) continue;
    if (F.tch != null && teachers[F.tch].cls.indexOf(c.id) < 0) continue;
    s.add(c.id);
  }
  return s;
}
function applyFilters() {
  const ok = allowedByOthers(), full = F.cls == null && ok.size === classes.length;
  const byC = c => ok.has(c) && (F.cls == null || c === F.cls);
  dDim.filterRange([F.d0, F.d1 + 1]);
  full ? cDim.filterAll() : cDim.filterFunction(byC);
  F.stu == null ? sDim.filterAll() : sDim.filterExact(F.stu);
  dDim2.filterRange([F.d0, F.d1 + 1]);
  full ? cDim2.filterAll() : cDim2.filterFunction(byC);
  F.tch == null ? tDim2.filterAll() : tDim2.filterExact(F.tch);
  F.subj == null ? sjDim.filterAll() : sjDim.filterExact(F.subj);
  F.strat == null ? stDim.filterAll() : stDim.filterExact(F.strat);
  return ok;
}
const selOf = (ok, withTeacher) => o => o.d >= F.d0 && o.d <= F.d1 && ok.has(o.c) && (F.cls == null || o.c === F.cls)
  && (!withTeacher || F.tch == null || o.t === F.tch) && (F.stu == null || o.c === students[F.stu].c);

/* ───────── الجداول: بناء + فرز بالضغط على رأس العمود ───────── */
// col: { h: العنوان, v: قيمة الفرز (null = غير قابل للفرز), c: محتوى الخلية, cls }
const SORT = {};
const cmp = (a, b) => {
  if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1;
  return typeof a === 'string' ? a.localeCompare(b, 'ar') : a - b;
};
function table(id, cols, data, o = {}) {
  const st = SORT[id];
  let rows = data;
  if (st && cols[st.i] && cols[st.i].v) { const f = cols[st.i].v; rows = data.slice().sort((a, b) => { const x = f(a), y = f(b); return (x == null) - (y == null) || cmp(x, y) * st.dir; }); }
  const lim = o.limit && !more[id] ? rows.slice(0, o.limit) : rows;
  $(id).innerHTML = `<thead><tr>${cols.map((c, i) => `<th${c.v ? ` class="sortable" data-sort="${i}" title="اضغط للترتيب"` : ''}>${c.h}${st && st.i === i ? `<span class="arr">${st.dir < 0 ? '▼' : '▲'}</span>` : ''}</th>`).join('')}</tr></thead><tbody>`
    + (lim.length ? lim.map((r, i) => `<tr ${o.attrs ? o.attrs(r) : ''}>${cols.map(c => `<td${c.cls ? ` class="${typeof c.cls === 'function' ? c.cls(r) : c.cls}"` : ''}>${c.c(r, i)}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${cols.length}" class="empty">${o.empty || 'لا توجد بيانات في هذا الاختيار.'}</td></tr>`) + '</tbody>'
    + (o.foot && rows.length > 1 ? `<tfoot><tr>${o.foot.map(f => `<td>${f}</td>`).join('')}</tr></tfoot>` : '');
  if (o.limit) { const b = $(o.more); b.hidden = rows.length <= o.limit; b.textContent = more[id] ? 'عرض أول ' + o.limit + ' فقط' : 'عرض الكل (' + fmt(rows.length) + ')'; }
}
const of = (a, b) => `${fmt(a)}<small> / ${fmt(b)}</small>`;
const rate = (a, b) => b ? a / b : null;
const pctTxt = v => v == null ? '—' : (v * 100).toFixed(1) + '%';
const sel = (k, v) => `data-k="${k}" data-v="${v}" aria-selected="${F[k] === v}" tabindex="0"`;
const rank = { h: '#', v: null, c: (r, i) => i + 1, cls: 'rk' };
const clsName = c => classes[c] ? esc(classes[c].name) : '';

function kpiHTML(kp) {
  return kp.map(k => `<article class="kpi"><div class="k-h"><span class="k-l">${k.l}</span></div>
      <div class="k-v">${k.v}${k.of != null ? `<small class="of"> من ${k.of}</small>` : ''}</div>
      <div class="k-s${k.bad ? ' bad' : ''}">${k.s}</div></article>`).join('');
}

/* ───────── تجميع الحضور والاستظهار (مرة واحدة على الأسطر المختارة) ───────── */
function aggAtt() {
  let n = 0, ab = 0, l = 0, r = 0;
  const C = new Map(), Sx = new Map();
  for (const v of cf.allFiltered()) {
    n++; if (v.a === 2) ab++; else if (v.a === 1) l++; r += v.r;
    let c = C.get(v.c); if (!c) C.set(v.c, c = { n: 0, ab: 0, l: 0, r: 0, days: new Set(), stu: new Set() });
    c.n++; if (v.a === 2) c.ab++; else if (v.a === 1) c.l++; c.r += v.r; c.days.add(v.d); c.stu.add(v.s);
    let s = Sx.get(v.s); if (!s) Sx.set(v.s, s = { n: 0, ab: 0, l: 0, r: 0, lastAb: -1, lastNr: -1 });
    s.n++;
    if (v.a === 2) { s.ab++; if (v.d > s.lastAb) s.lastAb = v.d; }
    else { if (v.a === 1) s.l++; if (v.r) s.r++; else if (v.d > s.lastNr) s.lastNr = v.d; }
  }
  return { n, ab, l, r, C, Sx };
}
const EMPTY_C = () => ({ n: 0, ab: 0, l: 0, r: 0, days: new Set(), stu: new Set() });
const EMPTY_S = () => ({ n: 0, ab: 0, l: 0, r: 0, lastAb: -1, lastNr: -1 });
// تلاميذ القسم المختار: المسجّلون + من له أسطر فيه
function classStudents(c, Sx) {
  const ids = new Set(classStu.get(c) || []);
  for (const id of Sx.keys()) if (students[id].c === c) ids.add(id);
  if (F.stu != null) return ids.has(F.stu) ? [F.stu] : [];
  return [...ids].map(id => ({ st: students[id], ...(Sx.get(id) || EMPTY_S()) }));
}
const regCount = c => (classStu.get(c) || []).length;

/* ───────── ① الحضور ───────── */
function renderAtt(ok) {
  const { n, ab, l, r, C, Sx } = aggAtt();
  const rows = logs.filter(selOf(ok, true)), sent = rows.reduce((a, x) => a + x.ok, 0);
  const follow = [...Sx].filter(([, s]) => s.ab > 0).map(([id, s]) => ({ st: students[id], ...s }))
    .sort((a, z) => z.ab - a.ab || rate(a.r, a.n - a.ab) - rate(z.r, z.n - z.ab) || z.n - a.n);
  $('kpis').innerHTML = kpiHTML([
    { l: 'الحضور', v: fmt(n - ab), of: fmt(n), s: `غياب: ${fmt(ab)} · تأخر: ${fmt(l)}` },
    { l: 'الاستظهار', v: fmt(r), of: fmt(n - ab) + ' حاضر', s: `لم يستظهر: ${fmt(n - ab - r)}` },
    { l: 'التقارير المُرسلة', v: fmt(sent), of: fmt(rows.length), s: rows.length ? `لم تُرسل: ${fmt(rows.length - sent)}` : 'لا توجد أيام دراسة في الاختيار', bad: rows.length > sent },
    { l: 'تلاميذ للمتابعة', v: fmt(follow.length), of: fmt(Sx.size) + ' تلميذ', s: 'غابوا يوماً أو أكثر', bad: follow.length > 0 }
  ]);

  const cls = classes.filter(c => ok.has(c.id) && (F.cls == null || c.id === F.cls) && (C.has(c.id) || regCount(c.id)))
    .map(c => ({ c, g: C.get(c.id) || EMPTY_C(), reg: regCount(c.id) }));
  const T = cls.reduce((a, x) => ({ reg: a.reg + x.reg, dy: a.dy + x.g.days.size, n: a.n + x.g.n, ab: a.ab + x.g.ab, l: a.l + x.g.l }), { reg: 0, dy: 0, n: 0, ab: 0, l: 0 });
  table('t-cls', [
    { h: 'القسم', v: x => x.c.name, c: x => `${esc(x.c.name)}<small>${esc(LV[x.c.lv])} · ${x.c.type}</small>`, cls: 'nm' },
    { h: 'عدد التلاميذ', v: x => x.reg, c: x => fmt(x.reg), cls: 'n' },
    { h: 'أيام مسجّلة', v: x => x.g.days.size, c: x => fmt(x.g.days.size), cls: 'n' },
    { h: 'حاضر', v: x => x.g.n - x.g.ab, c: x => fmt(x.g.n - x.g.ab), cls: 'n' },
    { h: 'غائب', v: x => x.g.ab, c: x => fmt(x.g.ab), cls: x => 'n' + (x.g.ab ? ' bad' : '') },
    { h: 'متأخر', v: x => x.g.l, c: x => fmt(x.g.l), cls: 'n' },
    { h: 'نسبة الغياب', v: x => rate(x.g.ab, x.g.n), c: x => pctTxt(rate(x.g.ab, x.g.n)), cls: 'n' }
  ], cls, { attrs: x => sel('cls', x.c.id), foot: ['المجموع', fmt(T.reg), fmt(T.dy), fmt(T.n - T.ab), fmt(T.ab), fmt(T.l), pctTxt(rate(T.ab, T.n))] });

  // عند اختيار قسم: كل تلاميذه
  $('c-att-stu').hidden = F.cls == null;
  if (F.cls != null) {
    $('h-att-stu').textContent = 'تلاميذ ' + classes[F.cls].name;
    const list = classStudents(F.cls, Sx).map(x => typeof x === 'number' ? { st: students[x], ...(Sx.get(x) || EMPTY_S()) } : x)
      .sort((a, z) => z.ab - a.ab || a.st.name.localeCompare(z.st.name, 'ar'));
    table('t-att-stu', [rank,
      { h: 'التلميذ', v: x => x.st.name, c: x => esc(x.st.name), cls: 'nm' },
      { h: 'أيام مسجّلة', v: x => x.n, c: x => fmt(x.n), cls: 'n' },
      { h: 'حاضر', v: x => x.n - x.ab, c: x => fmt(x.n - x.ab), cls: 'n' },
      { h: 'غائب', v: x => x.ab, c: x => fmt(x.ab), cls: x => 'n' + (x.ab ? ' bad' : '') },
      { h: 'متأخر', v: x => x.l, c: x => fmt(x.l), cls: 'n' },
      { h: 'نسبة الغياب', v: x => rate(x.ab, x.n), c: x => pctTxt(rate(x.ab, x.n)), cls: 'n' },
      { h: 'آخر غياب', v: x => x.lastAb > -1 ? x.lastAb : null, c: x => x.lastAb > -1 ? dShort(x.lastAb) : '—', cls: 'n' }
    ], list, { attrs: x => sel('stu', x.st.id), empty: 'لا يوجد تلاميذ مسجّلون في هذا القسم.' });
  }

  table('t-stu', [rank,
    { h: 'التلميذ', v: x => x.st.name, c: x => esc(x.st.name), cls: 'nm' },
    { h: 'القسم', v: x => classes[x.st.c] ? classes[x.st.c].name : '', c: x => clsName(x.st.c), cls: 'nm' },
    { h: 'غاب', v: x => x.ab, c: x => `${fmt(x.ab)}<small> من ${fmt(x.n)} يوماً</small>`, cls: x => 'n ' + (x.ab / x.n >= .2 ? 'bad' : x.ab / x.n >= .1 ? 'warn' : '') },
    { h: 'تأخر', v: x => x.l, c: x => fmt(x.l), cls: 'n' },
    { h: 'استظهر', v: x => x.r, c: x => of(x.r, x.n - x.ab), cls: 'n' },
    { h: 'آخر غياب', v: x => x.lastAb, c: x => dShort(x.lastAb), cls: 'n' }
  ], follow, { attrs: x => sel('stu', x.st.id), limit: PAGE, more: 'stu-more', empty: Sx.size ? 'لا يوجد تلميذ غائب في هذا الاختيار ✓' : 'لا توجد أسطر حضور في هذا الاختيار.' });
  return [n, att.length, 'سطر'];
}

/* ───────── ② الاستظهار ───────── */
function renderRec(ok) {
  const { n, ab, r, C, Sx } = aggAtt(), pr = n - ab;
  const follow = [...Sx].map(([id, s]) => ({ st: students[id], ...s, nr: s.n - s.ab - s.r })).filter(x => x.nr > 0)
    .sort((a, z) => z.nr - a.nr || rate(a.r, a.n - a.ab) - rate(z.r, z.n - z.ab));
  $('kpis-rec').innerHTML = kpiHTML([
    { l: 'الاستظهار', v: fmt(r), of: fmt(pr) + ' حاضر', s: 'مرات الاستظهار في الفترة' },
    { l: 'لم يستظهر', v: fmt(pr - r), of: fmt(pr) + ' حاضر', s: 'حضر ولم يستظهر', bad: pr > r },
    { l: 'الحاضرون', v: fmt(pr), of: fmt(n), s: `غياب: ${fmt(ab)} (لا يُحسب في الاستظهار)` },
    { l: 'تلاميذ للمتابعة', v: fmt(follow.length), of: fmt(Sx.size) + ' تلميذ', s: 'لم يستظهروا مرة أو أكثر', bad: follow.length > 0 }
  ]);
  const cls = classes.filter(c => ok.has(c.id) && (F.cls == null || c.id === F.cls) && (C.has(c.id) || regCount(c.id)))
    .map(c => { const g = C.get(c.id) || EMPTY_C(); return { c, g, reg: regCount(c.id), pr: g.n - g.ab }; });
  const T = cls.reduce((a, x) => ({ reg: a.reg + x.reg, pr: a.pr + x.pr, r: a.r + x.g.r }), { reg: 0, pr: 0, r: 0 });
  table('t-rcls', [
    { h: 'القسم', v: x => x.c.name, c: x => `${esc(x.c.name)}<small>${esc(LV[x.c.lv])} · ${x.c.type}</small>`, cls: 'nm' },
    { h: 'عدد التلاميذ', v: x => x.reg, c: x => fmt(x.reg), cls: 'n' },
    { h: 'حاضر', v: x => x.pr, c: x => fmt(x.pr), cls: 'n' },
    { h: 'استظهر', v: x => x.g.r, c: x => fmt(x.g.r), cls: 'n' },
    { h: 'لم يستظهر', v: x => x.pr - x.g.r, c: x => fmt(x.pr - x.g.r), cls: x => 'n' + (x.pr > x.g.r ? ' bad' : '') },
    { h: 'نسبة الاستظهار', v: x => rate(x.g.r, x.pr), c: x => pctTxt(rate(x.g.r, x.pr)), cls: 'n' }
  ], cls, { attrs: x => sel('cls', x.c.id), foot: ['المجموع', fmt(T.reg), fmt(T.pr), fmt(T.r), fmt(T.pr - T.r), pctTxt(rate(T.r, T.pr))] });

  $('c-rec-stu').hidden = F.cls == null;
  if (F.cls != null) {
    $('h-rec-stu').textContent = 'تلاميذ ' + classes[F.cls].name;
    const list = classStudents(F.cls, Sx).map(x => typeof x === 'number' ? { st: students[x], ...(Sx.get(x) || EMPTY_S()) } : x)
      .map(x => ({ ...x, pr: x.n - x.ab, nr: x.n - x.ab - x.r })).sort((a, z) => z.nr - a.nr || a.st.name.localeCompare(z.st.name, 'ar'));
    table('t-rec-stu', [rank,
      { h: 'التلميذ', v: x => x.st.name, c: x => esc(x.st.name), cls: 'nm' },
      { h: 'حاضر', v: x => x.pr, c: x => fmt(x.pr), cls: 'n' },
      { h: 'استظهر', v: x => x.r, c: x => fmt(x.r), cls: 'n' },
      { h: 'لم يستظهر', v: x => x.nr, c: x => fmt(x.nr), cls: x => 'n' + (x.nr ? ' bad' : '') },
      { h: 'نسبة الاستظهار', v: x => rate(x.r, x.pr), c: x => pctTxt(rate(x.r, x.pr)), cls: 'n' }
    ], list, { attrs: x => sel('stu', x.st.id), empty: 'لا يوجد تلاميذ مسجّلون في هذا القسم.' });
  }

  table('t-rstu', [rank,
    { h: 'التلميذ', v: x => x.st.name, c: x => esc(x.st.name), cls: 'nm' },
    { h: 'القسم', v: x => classes[x.st.c] ? classes[x.st.c].name : '', c: x => clsName(x.st.c), cls: 'nm' },
    { h: 'لم يستظهر', v: x => x.nr, c: x => `${fmt(x.nr)}<small> من ${fmt(x.n - x.ab)} حضوراً</small>`, cls: x => 'n ' + (x.nr / Math.max(1, x.n - x.ab) >= .5 ? 'bad' : 'warn') },
    { h: 'استظهر', v: x => x.r, c: x => fmt(x.r), cls: 'n' },
    { h: 'آخر مرة لم يستظهر', v: x => x.lastNr, c: x => x.lastNr > -1 ? dShort(x.lastNr) : '—', cls: 'n' }
  ], follow, { attrs: x => sel('stu', x.st.id), limit: PAGE, more: 'rstu-more', empty: Sx.size ? 'كل الحاضرين استظهروا في هذا الاختيار ✓' : 'لا توجد أسطر حضور في هذا الاختيار.' });
  return [n, att.length, 'سطر'];
}

/* ───────── ③ جودة التقارير ───────── */
// في وقته: يوم الحصة أو الموالي ← 100 · بعد يومين ← 70 · ثلاثة فأكثر ← 40 · لم يُرسل ← 0
const kindOf = dl => dl == null ? 'miss' : dl <= 1 ? 'ok' : 'late';
const pts = dl => dl == null ? 0 : dl <= 1 ? 100 : dl === 2 ? 70 : 40;
function renderRep(ok) {
  const main = logs.filter(selOf(ok, true)), sub = subLogs.filter(selOf(ok, true));
  const per = new Map();
  const get = (t, c) => { const k = t + '|' + c; let q = per.get(k); if (!q) per.set(k, q = { t: teachers[t], c, e: 0, s: 0, ok: 0, late: 0, dsum: 0, psum: 0, pn: 0, items: [], main: false }); return q; };
  for (const x of main) {
    const q = get(x.t, x.c); q.main = true; q.e++; const k = kindOf(x.dl);
    if (x.ok) { q.s++; q.dsum += x.dl; } if (k === 'ok') q.ok++; if (k === 'late') q.late++;
    q.psum += pts(x.dl); q.pn++; q.items.push({ d: x.d, k, dl: x.dl });
  }
  for (const x of sub) {
    const q = get(x.t, x.c), k = kindOf(x.dl);
    q.s++; q.dsum += x.dl; if (k === 'ok') q.ok++; else q.late++; q.psum += pts(x.dl); q.pn++; q.items.push({ d: x.d, k, dl: x.dl });
  }
  // جدول المعلمين: تجميع كل أقسام المعلم
  const byT = new Map();
  for (const q of per.values()) {
    let a = byT.get(q.t.id); if (!a) byT.set(q.t.id, a = { t: q.t, e: 0, s: 0, miss: 0, ok: 0, late: 0, dsum: 0, psum: 0, pn: 0, main: false, cls: new Set() });
    a.miss += q.items.filter(i => i.k === 'miss').length; a.e += q.e; a.s += q.s; a.ok += q.ok; a.late += q.late; a.dsum += q.dsum; a.psum += q.psum; a.pn += q.pn; a.main = a.main || q.main; a.cls.add(q.c);
  }
  const T = [...byT.values()].map(a => ({ ...a, miss: a.main ? a.miss : null, score: a.pn ? a.psum / a.pn : null, avg: a.s ? a.dsum / a.s : null }));
  T.sort((a, z) => (a.score ?? 101) - (z.score ?? 101));
  const missAll = main.filter(x => !x.ok).length, okAll = [...per.values()].reduce((s, q) => s + q.ok, 0), lateAll = [...per.values()].reduce((s, q) => s + q.late, 0);
  const sentMain = main.length - missAll;
  $('kpis-rep').innerHTML = kpiHTML([
    { l: 'التقارير المُرسلة', v: fmt(sentMain), of: fmt(main.length) + ' مطلوب', s: sub.length ? `+ ${fmt(sub.length)} من معلمي المواد` : 'من معلمي الأقسام' },
    { l: 'في وقتها', v: fmt(okAll), s: 'في يوم الحصة أو اليوم الموالي' },
    { l: 'متأخرة', v: fmt(lateAll), s: 'بعد يومين فأكثر', bad: lateAll > 0 },
    { l: 'لم تُرسل', v: fmt(missAll), s: 'أيام دراسة بلا تقرير', bad: missAll > 0 }
  ]);
  const tt = T.reduce((a, x) => ({ e: a.e + x.e, s: a.s + x.s, miss: a.miss + (x.miss || 0), ok: a.ok + x.ok, late: a.late + x.late, dsum: a.dsum + x.dsum, psum: a.psum + x.psum, pn: a.pn + x.pn }), { e: 0, s: 0, miss: 0, ok: 0, late: 0, dsum: 0, psum: 0, pn: 0 });
  const tone = v => v == null ? '' : v >= 90 ? '' : v >= 70 ? ' warn' : ' bad';
  table('t-rep', [
    { h: 'المعلم', v: x => x.t.name, c: x => `${esc(x.t.name)}<small>${x.t.role} · ${[...x.cls].map(clsName).join('، ')}</small>`, cls: 'nm' },
    { h: 'المطلوبة', v: x => x.main ? x.e : null, c: x => x.main ? fmt(x.e) : '—', cls: 'n' },
    { h: 'مُرسلة', v: x => x.s, c: x => fmt(x.s), cls: 'n' },
    { h: 'غير مُرسلة', v: x => x.miss, c: x => x.miss == null ? '—' : fmt(x.miss), cls: x => 'n' + (x.miss ? ' bad' : '') },
    { h: 'في وقتها', v: x => x.ok, c: x => fmt(x.ok), cls: 'n' },
    { h: 'متأخرة', v: x => x.late, c: x => fmt(x.late), cls: x => 'n' + (x.late ? ' warn' : '') },
    { h: 'متوسط التأخر', v: x => x.avg, c: x => x.avg == null ? '—' : x.avg.toFixed(1) + '<small> يوم</small>', cls: 'n' },
    { h: 'درجة الجودة', v: x => x.score, c: x => x.score == null ? '—' : `<b>${x.score.toFixed(0)}</b><small> / 100</small>`, cls: x => 'n' + tone(x.score) }
  ], T, { attrs: x => sel('tch', x.t.id), empty: 'لا توجد تقارير مطلوبة أو مُرسلة في هذا الاختيار.',
    foot: ['المجموع', fmt(tt.e), fmt(tt.s), fmt(tt.miss), fmt(tt.ok), fmt(tt.late), tt.s ? (tt.dsum / tt.s).toFixed(1) + ' يوم' : '—', tt.pn ? (tt.psum / tt.pn).toFixed(0) + ' / 100' : '—'] });

  // جدول التواريخ الملونة لكل (معلم، قسم)
  const D = [...per.values()].map(q => ({ ...q, miss: q.items.filter(i => i.k === 'miss').length }));
  const chip = i => `<span class="dchip ${i.k === 'ok' ? 'ok' : i.k === 'late' ? 'late' : ''}" title="${i.k === 'miss' ? 'لم يُرسل' : i.dl === 0 ? 'أُرسل في يومه' : 'أُرسل بعد ' + i.dl + ' يوم'}">${dShort(i.d)}${i.k === 'late' ? ' · +' + i.dl : ''}</span>`;
  table('t-repd', [
    { h: 'المعلم', v: x => x.t.name, c: x => `${esc(x.t.name)}<small>${x.t.role}</small>`, cls: 'nm' },
    { h: 'القسم', v: x => classes[x.c] ? classes[x.c].name : '', c: x => clsName(x.c), cls: 'nm' },
    { h: 'لم يُرسل', v: x => x.miss, c: x => fmt(x.miss), cls: x => 'n' + (x.miss ? ' bad' : '') },
    { h: 'متأخر', v: x => x.late, c: x => fmt(x.late), cls: x => 'n' + (x.late ? ' warn' : '') },
    { h: 'التواريخ', v: null, c: x => `<div class="chips2">${x.items.sort((a, b) => a.d - b.d).map(chip).join('')}</div>` }
  ], D.sort((a, z) => z.miss - a.miss || z.late - a.late), { attrs: x => sel('tch', x.t.id), empty: 'لا توجد تقارير في هذا الاختيار.' });
  return [main.length + sub.length, logs.length + subLogs.length, 'تقرير'];
}

/* ───────── ④ جودة التدريس ───────── */
function renderQual(ok) {
  let n = 0, to = 0, ia = 0;
  const TOc = new Map(), TKc = new Map();
  for (const v of cf2.allFiltered()) {
    n++; if (v.to.length) to++; if (isIA(v)) ia++;
    for (const x of v.to) TOc.set(x, (TOc.get(x) || 0) + 1);
    for (const x of v.tk) TKc.set(x, (TKc.get(x) || 0) + 1);
  }
  const offRows = offs.filter(selOf(ok, true)), qRows = quran.filter(selOf(ok, true));
  const tradNames = [...TRAD].map(i => ST[i]).join('، ');
  $('kpis2').innerHTML = kpiHTML([
    { l: 'الدروس المسجلة', v: fmt(n), s: 'في الفترة والاختيار الحاليين' },
    { l: 'دروس بوسيلة تعليمية', v: fmt(to), of: fmt(n), s: `بلا وسيلة: ${fmt(n - to)}` },
    { l: 'دروس تفاعلية', v: fmt(ia), of: fmt(n), s: tradNames ? 'فيها استراتيجية غير ' + esc(tradNames) : 'فيها استراتيجية واحدة على الأقل' },
    { l: 'أيام لم تُقدَّم فيها حصة', v: fmt(offRows.length), s: offRows.length ? 'التفاصيل في الجدول أسفله' : 'لا يوجد في هذا الاختيار', bad: offRows.length > 0 }
  ]);
  const offT = new Map();
  for (const o of offs.filter(selOf(ok, false))) offT.set(o.t, (offT.get(o.t) || 0) + 1);
  const T2 = new Map(byT2.all().filter(g => g.value.n > 0).map(g => [g.key, g.value]));
  const tr = [...new Set([...T2.keys(), ...offT.keys()])].map(id => ({ t: teachers[id], p: Object.assign({ n: 0, st: 0, to: 0, ia: 0 }, T2.get(id)), off: offT.get(id) || 0 })).sort((a, z) => z.p.n - a.p.n);
  const tt = tr.reduce((a, x) => ({ n: a.n + x.p.n, to: a.to + x.p.to, ia: a.ia + x.p.ia, st: a.st + x.p.st, off: a.off + x.off }), { n: 0, to: 0, ia: 0, st: 0, off: 0 });
  table('t-tch', [
    { h: 'المعلم', v: x => x.t.name, c: x => `${esc(x.t.name)}<small>${x.t.role}</small>`, cls: 'nm' },
    { h: 'الدروس', v: x => x.p.n, c: x => fmt(x.p.n), cls: 'n' },
    { h: 'بوسيلة', v: x => x.p.to, c: x => of(x.p.to, x.p.n), cls: 'n' },
    { h: 'تفاعلية', v: x => x.p.ia, c: x => of(x.p.ia, x.p.n), cls: 'n' },
    { h: 'استراتيجيات مستعملة', v: x => x.p.st, c: x => fmt(x.p.st), cls: 'n' },
    { h: 'أيام لم تُقدَّم', v: x => x.off, c: x => fmt(x.off), cls: x => 'n' + (x.off ? ' warn' : '') }
  ], tr, { attrs: x => sel('tch', x.t.id), empty: 'لا توجد دروس في هذا الاختيار.', foot: ['المجموع', fmt(tt.n), of(tt.to, tt.n), of(tt.ia, tt.n), fmt(tt.st), fmt(tt.off)] });

  const stc = new Map(bySt.all().map(g => [g.key, g.value]));
  table('t-st', [
    { h: 'الاستراتيجية', v: x => x.nm, c: x => esc(x.nm) + (TRAD.has(x.i) ? '<small>تقليدية</small>' : ''), cls: 'nm' },
    { h: 'الدروس', v: x => x.c, c: x => fmt(x.c), cls: x => 'n' + (x.c ? '' : ' zero') }
  ], ST.map((nm, i) => ({ i, nm, c: stc.get(i) || 0 })).sort((a, z) => z.c - a.c), { attrs: x => sel('strat', x.i), empty: 'لا توجد استراتيجيات في القوائم.' });

  const lvs = new Set([...ok].filter(c => F.cls == null || c === F.cls).map(c => classes[c].lv));
  const cnt = new Map(bySj.all().filter(g => g.value > 0).map(g => [g.key, g.value]));
  table('t-sj', [
    { h: 'المادة', v: x => SJ[x.k], c: x => esc(SJ[x.k]), cls: 'nm' },
    { h: 'الدروس', v: x => x.c, c: x => x.c ? fmt(x.c) : '0 · لم تُدرَّس', cls: x => 'n' + (x.c ? '' : ' zero') }
  ], [...new Set([...lvs].flatMap(CUR).concat([...cnt.keys()]))].map(k => ({ k, c: cnt.get(k) || 0 })).sort((a, z) => z.c - a.c),
  { attrs: x => sel('subj', x.k), empty: 'لا توجد مواد في هذا الاختيار.' });

  const cntTable = (id, names, map, head) => table(id, [
    { h: head, v: x => x.nm, c: x => esc(x.nm), cls: 'nm' },
    { h: 'الدروس', v: x => x.c, c: x => fmt(x.c), cls: x => 'n' + (x.c ? '' : ' zero') }
  ], names.map((nm, i) => ({ nm, c: map.get(i) || 0 })).sort((a, z) => z.c - a.c), { empty: 'القائمة فارغة في الشيت.' });
  cntTable('t-to', TO, TOc, 'الوسيلة');
  cntTable('t-tk', TKN, TKc, 'المهمة');

  table('t-qr', [
    { h: 'نوع الحصة', v: x => x.nm, c: x => esc(x.nm), cls: 'nm' },
    { h: 'الحصص', v: x => x.c, c: x => fmt(x.c), cls: x => 'n' + (x.c ? '' : ' zero') }
  ], QT.map((nm, i) => ({ nm, c: qRows.filter(q => q.q === i).length })), { empty: 'لا توجد أنواع حصص في القوائم.', foot: ['المجموع', fmt(qRows.length)] });

  table('t-off', [
    { h: 'السبب', v: x => x.nm, c: x => esc(x.nm), cls: 'nm' },
    { h: 'الأيام', v: x => x.list.length, c: x => fmt(x.list.length), cls: 'n warn' },
    { h: 'التواريخ', v: null, c: x => `<div class="chips2">${x.list.map(o => `<span class="dchip soft">${dTiny(o.d)} · ${clsName(o.c)}</span>`).join('')}</div>` }
  ], OFFR.map((nm, i) => ({ nm, list: offRows.filter(o => o.r === i).sort((a, b) => a.d - b.d) })).filter(x => x.list.length).sort((a, z) => z.list.length - a.list.length),
  { empty: 'لم يُسجَّل أي يوم بلا حصة في هذا الاختيار ✓' });
  return [n, lessons.length, 'درس'];
}
let TKN = [];

/* ───────── ⑤ الرسوم ───────── */
let tl, cl, stc, sjc, qrc, offc;
const chartBase = () => ({ animationDuration: 300, animationDurationUpdate: 260, textStyle: { fontFamily: 'Changa, system-ui, sans-serif', color: css('--muted') } });
const tipBox = () => ({ backgroundColor: css('--surface'), borderColor: css('--line'), textStyle: { color: css('--ink'), fontFamily: 'Changa, sans-serif', fontSize: 12 }, extraCssText: 'box-shadow:' + css('--shadow') + ';border-radius:12px;direction:rtl;text-align:right' });
function buildTimeline() {
  const p = css('--p'), p3 = css('--p-3');
  const area = c => ({ type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: c + '33' }, { offset: 1, color: c + '00' }] });
  const marks = holWeeks.map(h => [{ name: h[2], xAxis: weeks[h[0]] }, { xAxis: weeks[h[1]] }]);
  if (RAM) marks.push([{ name: 'رمضان', xAxis: weeks[wOf(RAM[0])], itemStyle: { color: css('--ram') } }, { xAxis: weeks[wOf(RAM[1])] }]);
  tl.setOption(Object.assign(chartBase(), {
    grid: { top: 14, right: 40, left: 26, bottom: 24 },
    tooltip: Object.assign(tipBox(), { trigger: 'axis', valueFormatter: v => v == null ? '—' : v.toFixed(1) + '%' }),
    xAxis: { type: 'category', data: weeks, inverse: true, boundaryGap: false, axisLine: { lineStyle: { color: css('--line') } }, axisTick: { show: false }, axisLabel: { color: css('--muted'), fontSize: 11, hideOverlap: true } },
    yAxis: { type: 'value', position: 'right', min: 0, max: 100, interval: 25, splitLine: { lineStyle: { color: css('--grid') } }, axisLabel: { color: css('--muted'), formatter: '{value}%', fontSize: 11 } },
    series: [
      { name: 'الحضور', type: 'line', smooth: .3, symbol: 'circle', symbolSize: 6, showSymbol: NW < 3, connectNulls: false, lineStyle: { width: 2.5, color: p }, itemStyle: { color: p }, areaStyle: { color: area(p) }, data: [],
        markArea: { silent: true, itemStyle: { color: css('--hol') }, label: { show: innerWidth > 560, color: css('--muted'), fontSize: 11, position: 'insideTop' }, data: marks } },
      { name: 'الاستظهار', type: 'line', smooth: .3, symbol: 'circle', symbolSize: 6, showSymbol: NW < 3, connectNulls: false, lineStyle: { width: 2.5, color: p3 }, itemStyle: { color: p3 }, areaStyle: { color: area(p3) }, data: [] }
    ]
  }), true);
}
function buildHbar(ch, rightPad) {
  ch.setOption(Object.assign(chartBase(), {
    grid: { top: 4, right: rightPad || 118, left: 58, bottom: 4 },
    tooltip: Object.assign(tipBox(), { trigger: 'item', formatter: q => q.data.tip }),
    xAxis: { type: 'value', inverse: true, min: 0, max: 100, show: false },
    yAxis: { type: 'category', position: 'right', inverse: true, data: [], axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: css('--ink'), fontSize: 12, fontFamily: 'Changa, sans-serif', margin: 10, width: (rightPad || 118) - 14, overflow: 'truncate' } },
    series: [{ type: 'bar', barWidth: 13, data: [], showBackground: true, backgroundStyle: { color: css('--surface-2'), borderRadius: 7 }, itemStyle: { borderRadius: 7 },
      label: { show: true, position: 'left', distance: 6, color: css('--ink'), fontFamily: 'Changa, sans-serif', fontSize: 12, formatter: q => q.data.lbl }, cursor: 'pointer' }]
  }), true);
}
function setBars(ch, items, max) {
  const hh = Math.max(90, items.length * 26 + 10) + 'px';
  if (ch.getDom().style.height !== hh) { ch.getDom().style.height = hh; ch.resize(); }
  ch.setOption({ xAxis: { max }, yAxis: { data: items.map(x => x.name) }, series: [{ data: items }] });
}
function pie(ch, names, counts, colors, unit) {
  const n = counts.reduce((a, b) => a + b, 0);
  ch.setOption(Object.assign(chartBase(), {
    tooltip: Object.assign(tipBox(), { trigger: 'item', formatter: q => `<b>${esc(q.name)}</b><br>${fmt(q.value)} · ${q.percent}%` }),
    graphic: [{ type: 'text', left: 'center', top: 'middle', style: { text: n ? fmt(n) + '\n' + unit : 'لا يوجد', fill: css(n ? '--ink' : '--muted'), font: '600 15px Changa, sans-serif', align: 'center', lineHeight: 20 } }],
    series: [{ type: 'pie', radius: ch.getWidth() < 420 ? ['40%', '60%'] : ['50%', '74%'], center: ['50%', '50%'], padAngle: 2, itemStyle: { borderRadius: 6, borderColor: css('--surface'), borderWidth: 2 },
      label: { color: css('--ink'), fontFamily: 'Changa, sans-serif', fontSize: 12, formatter: '{b}\n{d}%' }, labelLine: { lineStyle: { color: css('--line') } },
      data: names.map((nm, i) => ({ name: nm, value: counts[i], itemStyle: { color: colors[i % colors.length] } })).filter(x => x.value > 0) }]
  }), true);
}
function buildCharts() { buildTimeline(); buildHbar(cl, 104); buildHbar(stc, 128); buildHbar(sjc, 118); }
function ensureCharts() {
  if (tl) return;
  tl = echarts.init($('tl')); cl = echarts.init($('cls'));
  stc = echarts.init($('q-st')); sjc = echarts.init($('q-sj')); qrc = echarts.init($('q-qr')); offc = echarts.init($('q-off'));
  buildCharts();
  cl.on('click', q => { const id = q.data && q.data.key; if (id == null) return; F.cls = F.cls === id ? null : id; F.stu = null; render(); });
  stc.on('click', q => { if (q.data.key == null) return; F.strat = F.strat === q.data.key ? null : q.data.key; render(); });
  sjc.on('click', q => { if (q.data.key == null) return; F.subj = F.subj === q.data.key ? null : q.data.key; render(); });
  const ro = new ResizeObserver(() => [tl, cl, stc, sjc, qrc, offc].forEach(c => c.resize()));
  ['tl', 'cls', 'q-st', 'q-sj', 'q-qr', 'q-off'].forEach(id => ro.observe($(id).parentElement));
}
function renderCharts(ok) {
  ensureCharts();
  [tl, cl, stc, sjc, qrc, offc].forEach(c => c.resize());
  // الخط الزمني يعرض الموسم كله (سياق)، والفترة المختارة تؤثر في باقي الرسوم
  const wk = Array.from({ length: NW }, () => [null, null]);
  for (const g of byWeek.all()) if (g.value.n && g.key < NW) wk[g.key] = [+(attR(g.value) * 100).toFixed(2), recR(g.value) == null ? null : +(recR(g.value) * 100).toFixed(2)];
  tl.setOption({ series: [{ data: wk.map(x => x[0]) }, { data: wk.map(x => x[1]) }] });
  const p = css('--p'), w = css('--warn'), b = css('--bad'), mu = css('--muted');
  const fn = metric === 'att' ? attR : recR, th = metric === 'att' ? [.92, .85] : [.75, .6];
  const cs = byCls.all().filter(g => ok.has(g.key) && g.value.n).map(g => ({ c: classes[g.key], v: fn(g.value), g: g.value })).filter(x => x.v != null).sort((a, z) => z.v - a.v);
  setBars(cl, cs.map(x => ({ value: x.v * 100, key: x.c.id, name: x.c.name, lbl: (x.v * 100).toFixed(1) + '%',
    itemStyle: { color: x.v >= th[0] ? p : x.v >= th[1] ? w : b, opacity: F.cls != null && x.c.id !== F.cls ? .28 : 1 },
    tip: `<b>${esc(x.c.name)}</b><br>حاضر ${fmt(x.g.n - x.g.ab)} من ${fmt(x.g.n)} · استظهر ${fmt(x.g.r)}` })), 100);
  let base = all2.value().n;
  if (F.strat != null) { stDim.filterAll(); base = all2.value().n; stDim.filterExact(F.strat); }
  const st = bySt.all().filter(g => g.value > 0).map(g => ({ key: g.key, v: base ? g.value / base : 0, n: g.value })).sort((a, z) => z.v - a.v);
  setBars(stc, st.map(x => ({ value: x.v * 100, key: x.key, name: ST[x.key], lbl: (x.v * 100).toFixed(0) + '%',
    itemStyle: { color: TRAD.has(x.key) ? mu : p, opacity: F.strat != null && F.strat !== x.key ? .28 : 1 }, tip: `<b>${esc(ST[x.key])}</b><br>${fmt(x.n)} درس من ${fmt(base)}` })), 100);
  const sj = bySj.all().filter(g => g.value > 0).map(g => ({ key: g.key, n: g.value })).sort((a, z) => z.n - a.n);
  setBars(sjc, sj.map(x => ({ value: x.n, key: x.key, name: SJ[x.key], lbl: fmt(x.n) + ' درس',
    itemStyle: { color: p, opacity: F.subj != null && F.subj !== x.key ? .28 : 1 }, tip: `<b>${esc(SJ[x.key])}</b><br>${fmt(x.n)} درس` })), Math.max(1, ...sj.map(x => x.n)) * 1.02);
  const offRows = offs.filter(selOf(ok, true)), qRows = quran.filter(selOf(ok, true));
  pie(qrc, QT, QT.map((_, i) => qRows.filter(q => q.q === i).length), [p, css('--p-3'), css('--ok'), w], 'حصة');
  pie(offc, OFFR, OFFR.map((_, i) => offRows.filter(o => o.r === i).length), [w, p, b, mu, css('--p-3'), css('--ok')], 'يوماً');
  return [all.value().n, att.length, 'سطر'];
}

/* ───────── الرسم العام ───────── */
const RENDER = { att: renderAtt, rec: renderRec, rep: renderRep, q: renderQual, ch: renderCharts };
function render() {
  if (!loaded) return;
  const t0 = performance.now();
  const ok = applyFilters();
  const [a, z, u] = RENDER[tab](ok);
  renderActive();
  const ms = performance.now() - t0, sp = $('speed');
  sp.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>أُعيد الحساب في <b>${ms.toFixed(1)} مللي ثانية</b> على ${fmt(a)} من ${fmt(z)} ${u}`;
  sp.classList.remove('flash'); void sp.offsetWidth; sp.classList.add('flash');
}

/* ───────── الفلاتر ───────── */
const opt = (v, t) => `<option value="${v}">${esc(t)}</option>`;
function fillSelects() {
  const vis = classes.filter(c => c.on || c.rows);
  const tv = teachers.filter(t => t.on || t.cls.length);
  $('f-cls').innerHTML = opt('', 'كل الأقسام') + vis.map(c => opt(c.id, c.name)).join('');
  $('f-tch').innerHTML = opt('', 'كل المعلمين') + tv.map(t => opt(t.id, t.name)).join('');
  $('f-lvl').innerHTML = opt('', 'كل المستويات') + LV.map((l, i) => classes.some(c => c.lv === i) ? opt(i, l) : '').join('');
  $('f-typ').innerHTML = opt('', 'تلقين ومنافسة') + opt('تلقين', 'تلقين') + opt('منافسة', 'منافسة');
  for (const id of ['f-d0', 'f-d1']) { $(id).min = iso(FIRST); $(id).max = iso(NDAYS - 1); }
}
function syncSelects() {
  $('f-cls').value = F.cls ?? ''; $('f-tch').value = F.tch ?? ''; $('f-lvl').value = F.lvl ?? ''; $('f-typ').value = F.typ ?? '';
  $('f-d0').value = iso(Math.max(FIRST, F.d0)); $('f-d1').value = iso(Math.min(NDAYS - 1, F.d1));
  for (const b of $('units').children) b.setAttribute('aria-pressed', b.dataset.u === F.unit);
  $('p-label').textContent = $('m-label').textContent = periodLabel();
  $('p-prev').disabled = $('m-prev').disabled = !canShift(-1);
  $('p-next').disabled = $('m-next').disabled = !canShift(1);
}
function renderActive() {
  const ch = [];
  if (F.cls != null) ch.push(['cls', 'القسم', classes[F.cls].name]);
  if (F.tch != null) ch.push(['tch', 'المعلم', teachers[F.tch].name]);
  if (F.lvl != null) ch.push(['lvl', 'المستوى', LV[F.lvl]]);
  if (F.typ != null) ch.push(['typ', 'النوع', F.typ]);
  if (F.stu != null) ch.push(['stu', 'التلميذ', students[F.stu].name]);
  if (F.subj != null) ch.push(['subj', 'المادة', SJ[F.subj]]);
  if (F.strat != null) ch.push(['strat', 'الاستراتيجية', ST[F.strat]]);
  const chips = ch.map(c => `<button type="button" class="fchip" data-x="${c[0]}" aria-label="إزالة ${c[1]}"><i>×</i>${c[1]}: <b>${esc(c[2])}</b></button>`).join('')
    + (ch.length > 1 ? '<button type="button" class="clear" data-x="all">مسح الكل</button>' : '');
  $('active').innerHTML = chips + '<span class="speed" id="speed"></span>';
  // الهاتف: الفلاتر المفعّلة تظهر تحت الشريط المختصر + عددها على زر الفلاتر
  $('m-active').innerHTML = chips; $('m-active').hidden = !ch.length;
  $('m-badge').textContent = ch.length; $('m-badge').hidden = !ch.length;
  syncSelects();
}
const TAB_IC = {};
function showTab(t) {
  if (!TABS[t]) t = 'att';
  tab = t; LS.set('tab', t);
  for (const box of ['tabs', 'dtabs']) for (const x of $(box).children) x.setAttribute('aria-pressed', x.dataset.t === t);
  for (const k of Object.keys(TABS)) $('v-' + k).hidden = k !== t;
  const b = $('tabs').querySelector(`[data-t="${t}"]`);
  $('tab-title').innerHTML = $('m-tab').innerHTML = b ? b.innerHTML : TABS[t];
}
function sheet(open) {
  const f = $('filters');
  f.classList.toggle('open', open);
  $('backdrop').hidden = !open && !$('drawer').classList.contains('open');
  $('m-filter').setAttribute('aria-expanded', open);
}
function drawer(open) {
  const d = $('drawer'), bd = $('backdrop');
  if (open) { d.hidden = false; bd.hidden = false; requestAnimationFrame(() => d.classList.add('open')); }
  else { d.classList.remove('open'); bd.hidden = true; setTimeout(() => { if (!d.classList.contains('open')) d.hidden = true; }, 260); }
  $('menu').setAttribute('aria-expanded', open);
}

let bound = false;
function bind() {
  if (bound) return; bound = true;
  const onSel = (k, conv) => e => { const v = e.target.value; F[k] = v === '' ? null : conv(v); F.stu = null; render(); };
  $('f-cls').addEventListener('change', onSel('cls', Number));
  $('f-tch').addEventListener('change', onSel('tch', Number));
  $('f-lvl').addEventListener('change', onSel('lvl', Number));
  $('f-typ').addEventListener('change', onSel('typ', String));
  // الفترة: يوم / أسبوع / شهر + الأسهم + من/إلى
  $('units').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
    const anchor = Math.min(NDAYS - 1, Math.max(FIRST, F.unit === 'custom' ? F.d1 : Math.min(F.d1, NDAYS - 1)));
    setPeriod(b.dataset.u, anchor); render(); });
  $('p-prev').addEventListener('click', () => { if (canShift(-1)) { shiftPeriod(-1); render(); } });
  $('p-next').addEventListener('click', () => { if (canShift(1)) { shiftPeriod(1); render(); } });
  const onDate = which => e => { const d = fromIso(e.target.value); if (d == null) { syncSelects(); return; }
    let a = which ? Math.min(F.d0, d) : d, z = which ? d : Math.max(F.d1, d);
    F.unit = 'custom'; F.d0 = a; F.d1 = z; render(); };
  $('f-d0').addEventListener('change', onDate(0));
  $('f-d1').addEventListener('change', onDate(1));
  // التبويبات (الحاسوب + القائمة الجانبية في الهاتف)
  const onTab = e => { const b = e.target.closest('button[data-t]'); if (!b) return; drawer(false); if (b.dataset.t === tab) return; showTab(b.dataset.t); render(); };
  $('tabs').addEventListener('click', onTab);
  $('dtabs').addEventListener('click', onTab);
  $('menu').addEventListener('click', () => drawer($('drawer').hidden));
  $('backdrop').addEventListener('click', () => { drawer(false); sheet(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { drawer(false); sheet(false); } });
  // الهاتف: الشريط المختصر + لوحة الفلاتر
  $('m-tab').addEventListener('click', () => drawer(true));
  $('m-prev').addEventListener('click', () => { if (canShift(-1)) { shiftPeriod(-1); render(); } });
  $('m-next').addEventListener('click', () => { if (canShift(1)) { shiftPeriod(1); render(); } });
  $('m-filter').addEventListener('click', () => sheet(true));
  $('s-close').addEventListener('click', () => sheet(false));
  $('s-done').addEventListener('click', () => sheet(false));
  $('s-clear').addEventListener('click', () => { Object.assign(F, { cls: null, tch: null, lvl: null, typ: null, stu: null, subj: null, strat: null }); setPeriod('month', NDAYS - 1); render(); });
  $('metric').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; metric = b.dataset.m;
    for (const x of $('metric').children) x.setAttribute('aria-pressed', x === b); render(); });
  const onChip = e => {
    const b = e.target.closest('[data-x]'); if (!b) return; const x = b.dataset.x;
    if (x === 'all') Object.assign(F, { cls: null, tch: null, lvl: null, typ: null, stu: null, subj: null, strat: null }); else F[x] = null;
    render();
  };
  $('active').addEventListener('click', onChip);
  $('m-active').addEventListener('click', onChip);
  // الجداول: الضغط على الرأس ← ترتيب (من الأعلى إلى الأدنى ثم العكس) · الضغط على سطر ← تصفية
  document.addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (th) {
      const id = th.closest('table').id, i = +th.dataset.sort, s = SORT[id];
      SORT[id] = s && s.i === i ? { i, dir: -s.dir } : { i, dir: -1 };
      render(); return;
    }
    const r = e.target.closest('table.tbl tbody tr[data-k]');
    if (r) { const k = r.dataset.k, v = +r.dataset.v; F[k] = F[k] === v ? null : v; if (k !== 'stu') F.stu = null; render(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches && e.target.matches('tr[data-k]')) e.target.click(); });
  $('stu-more').addEventListener('click', () => { more['t-stu'] = !more['t-stu']; render(); });
  $('rstu-more').addEventListener('click', () => { more['t-rstu'] = !more['t-rstu']; render(); });
  const rebuild = () => { if (!loaded) return; if (tl) buildCharts(); render(); };
  new MutationObserver(rebuild).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rebuild); } catch (e) {}
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(rebuild);
}

/* ───────── التشغيل ───────── */
function start(raw) {
  const prevUnit = loaded ? F.unit : null;
  load(raw);
  TKN = raw.lists.tk || [];
  // عند الفتح: الشهر الجاري. بعد التحديث: نفس الفترة
  if (!prevUnit) setPeriod('month', NDAYS - 1);
  if (F.cls != null && !classes[F.cls]) F.cls = null;
  if (F.tch != null && !teachers[F.tch]) F.tch = null;
  if (F.stu != null && !students[F.stu]) F.stu = null;
  if (F.lvl != null && !LV[F.lvl]) F.lvl = null;
  if (F.subj != null && !SJ[F.subj]) F.subj = null;
  if (F.strat != null && !ST[F.strat]) F.strat = null;

  show('app');
  $('school').textContent = raw.school || 'مدرسة نور السلام القرآنية';
  $('year').textContent = (raw.year ? raw.year + ' · ' : '') + 'اليوم ' + dLabel(NDAYS - 1);
  if (!loaded) showTab(LS.get('tab') || 'att');
  fillSelects();
  if (tl) buildCharts();
  loaded = true;
  bind();
  render();
  $('foot').textContent = `${fmt(classes.filter(c => c.on).length)} قسماً · ${fmt(students.length)} تلميذاً · ${fmt(teachers.filter(t => t.on).length)} معلماً · ${fmt(att.length)} سطر حضور واستظهار · ${fmt(lessons.length)} درس مسجّل. كل الحسابات تجري على جهازك.`;
}

function show(which) {
  $('boot').hidden = which !== 'boot';
  $('app').hidden = which !== 'app';
}
function setSync(state, msg) {
  const b = $('refresh'), s = $('sync');
  b.classList.toggle('spin', state === 'loading');
  b.disabled = state === 'loading';
  s.classList.toggle('err', state === 'err');
  s.textContent = state === 'loading' ? 'جارٍ التحقق من الجديد…'
    : state === 'err' ? (msg || 'تعذّر التحديث') + (syncedAt ? ' · بيانات ' + hhmm(syncedAt) : '')
    : 'محدّثة ' + hhmm(syncedAt);
}

async function refresh() {
  setSync('loading');
  try {
    const r = await fetchData(ver);
    syncedAt = Date.now();
    if (!r.same) { ver = r.ver; start(r.data); idbSet('data', { ver, data: r.data, at: syncedAt }); }
    else idbGet('data').then(c => c && idbSet('data', Object.assign(c, { at: syncedAt })));
    setSync('ok');
  } catch (e) {
    setSync('err', e.message);
    if (!loaded) { show('boot'); $('boot-msg').textContent = e.message; $('boot-retry').hidden = false; }
  }
}

function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}

async function boot() {
  applyTheme(LS.get('theme'));
  $('refresh').addEventListener('click', refresh);
  $('boot-retry').addEventListener('click', () => { $('boot-retry').hidden = true; $('boot-msg').textContent = 'جارٍ تنزيل بيانات الموسم…'; refresh(); });
  $('theme').addEventListener('click', () => {
    const dark = getComputedStyle(document.documentElement).colorScheme.indexOf('dark') > -1;
    const t = dark ? 'light' : 'dark'; LS.set('theme', t); applyTheme(t);
  });
  window.addEventListener('online', () => { if (loaded) refresh(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && loaded && Date.now() - syncedAt > 120000) refresh(); });

  const cached = await idbGet('data');
  if (cached && cached.data) {
    ver = cached.ver; syncedAt = cached.at || 0;
    try { start(cached.data); setSync('ok'); } catch (e) { ver = ''; console.error(e); }
  } else show('boot');
  refresh();
}

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(() => {}));
boot();
})();
