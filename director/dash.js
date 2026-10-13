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

  // الفترات الجاهزة (بالأيام)
  const L = NDAYS - 1, td = new Date(TODAY * DAY);
  const m0 = Math.round(Date.UTC(td.getUTCFullYear(), td.getUTCMonth(), 1) / DAY) - START;
  PERIODS = [
    { k: 'all', t: 'الموسم كاملاً', d: [FIRST, L] },
    { k: 'today', t: 'اليوم', d: [L, L] },
    { k: 'week', t: 'هذا الأسبوع', d: [Math.max(FIRST, wOf(L) * 7), L] },
    { k: 'month', t: 'هذا الشهر', d: [Math.max(FIRST, m0), L] }
  ];
  const T = (raw.terms || []).map(x => x == null ? null : x - START);
  if (T[0] != null && T[0] >= FIRST && T[0] < L) {
    PERIODS.push({ k: 't1', t: 'الفصل الأول', d: [FIRST, T[0]] });
    if (T[1] != null && T[1] > T[0]) {
      PERIODS.push({ k: 't2', t: 'الفصل الثاني', d: [T[0] + 1, Math.min(T[1], L)] });
      if (T[1] < L) PERIODS.push({ k: 't3', t: 'الفصل الثالث', d: [T[1] + 1, L] });
    }
  }
  if (RAM) PERIODS.push({ k: 'ram', t: 'رمضان', d: [Math.max(FIRST, RAM[0]), RAM[1]] });

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

/* ───────── التواريخ ───────── */
const WD = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const iso = d => new Date((START + d) * DAY).toISOString().slice(0, 10);
const fromIso = s => /^\d{4}-\d{2}-\d{2}$/.test(s) ? Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY) - START : null;
const dShort = d => { const x = new Date((START + d) * DAY); return WD[x.getUTCDay()] + ' ' + x.getUTCDate() + ' ' + MONTHS[x.getUTCMonth()]; };
const dTiny = d => { const x = new Date((START + d) * DAY); return x.getUTCDate() + ' ' + MONTHS[x.getUTCMonth()]; };

/* ───────── الحالة ───────── */
const F = { d0: 0, d1: 0, cls: null, tch: null, lvl: null, typ: null, stu: null, subj: null, strat: null };
let metric = 'att', tab = 'att', loaded = false, ver = '', syncedAt = 0, stuAll = false;
const STU_PAGE = 25;

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
// سطر من السجل (تقرير مطلوب، حصة قرآن، يوم لم تُقدَّم) داخل الاختيار؟
const selOf = (ok, withTeacher) => o => o.d >= F.d0 && o.d <= F.d1 && ok.has(o.c) && (F.cls == null || o.c === F.cls)
  && (!withTeacher || F.tch == null || o.t === F.tch) && (F.stu == null || o.c === students[F.stu].c);

/* ───────── أدوات العرض ───────── */
function kpiHTML(kp) {
  return kp.map(k => `<article class="kpi"><div class="k-h"><span class="k-l">${k.l}</span></div>
      <div class="k-v">${k.v}${k.of != null ? `<small class="of"> من ${k.of}</small>` : ''}</div>
      <div class="k-s${k.bad ? ' bad' : ''}">${k.s}</div></article>`).join('');
}
function table(id, head, rows, empty, foot) {
  $(id).innerHTML = `<thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>`
    + (rows.length ? rows.join('') : `<tr><td colspan="${head.length}" class="empty">${empty}</td></tr>`) + '</tbody>'
    + (foot && rows.length > 1 ? `<tfoot><tr>${foot.map(f => `<td>${f}</td>`).join('')}</tr></tfoot>` : '');
}
const of = (a, b) => `${fmt(a)}<small> / ${fmt(b)}</small>`;
const sel = (k, v) => `data-k="${k}" data-v="${v}" aria-selected="${F[k] === v}" tabindex="0"`;

/* ───────── ① الحضور والاستظهار ───────── */
// التواريخ: الأحدث أولاً. تظهر كلها عند اختيار المعلم، وإلا آخر 8 فقط
const MAX_CHIPS = 8;
function dateChips(days, full) {
  const list = days.slice().sort((a, b) => b - a), shown = full ? list : list.slice(0, MAX_CHIPS);
  return shown.map(d => `<span class="dchip">${dShort(d)}</span>`).join('')
    + (list.length > shown.length ? `<span class="dchip soft">+${fmt(list.length - shown.length)} أخرى (اضغط لعرضها)</span>` : '');
}
function renderAtt(ok) {
  // تجميع واحد على الأسطر المختارة: لكل قسم ولكل تلميذ
  let n = 0, ab = 0, l = 0, r = 0;
  const C = new Map(), Sx = new Map();
  for (const v of cf.allFiltered()) {
    n++; if (v.a === 2) ab++; else if (v.a === 1) l++; r += v.r;
    let c = C.get(v.c); if (!c) C.set(v.c, c = { n: 0, ab: 0, l: 0, r: 0, days: new Set(), stu: new Set() });
    c.n++; if (v.a === 2) c.ab++; else if (v.a === 1) c.l++; c.r += v.r; c.days.add(v.d); c.stu.add(v.s);
    let s = Sx.get(v.s); if (!s) Sx.set(v.s, s = { n: 0, ab: 0, l: 0, r: 0, last: -1 });
    s.n++; if (v.a === 2) { s.ab++; if (v.d > s.last) s.last = v.d; } else if (v.a === 1) s.l++; s.r += v.r;
  }
  const rows = logs.filter(selOf(ok, true));
  const sent = rows.reduce((a, x) => a + x.ok, 0);
  const follow = [...Sx].filter(([, s]) => s.ab > 0).map(([id, s]) => ({ st: students[id], ...s }))
    .sort((a, z) => z.ab - a.ab || (a.r / Math.max(1, a.n - a.ab)) - (z.r / Math.max(1, z.n - z.ab)) || z.n - a.n);

  $('kpis').innerHTML = kpiHTML([
    { l: 'الحضور', v: fmt(n - ab), of: fmt(n), s: `غياب: ${fmt(ab)} · تأخر: ${fmt(l)}` },
    { l: 'الاستظهار', v: fmt(r), of: fmt(n - ab) + ' حاضر', s: `لم يستظهر: ${fmt(n - ab - r)}` },
    { l: 'التقارير المُرسلة', v: fmt(sent), of: fmt(rows.length), s: rows.length ? `لم تُرسل: ${fmt(rows.length - sent)}` : 'لا توجد أيام دراسة في الاختيار', bad: rows.length > sent },
    { l: 'تلاميذ للمتابعة', v: fmt(follow.length), of: fmt(Sx.size) + ' تلميذ', s: 'غابوا يوماً أو أكثر', bad: follow.length > 0 }
  ]);

  // جدول الأقسام
  const rep = new Map();
  for (const x of rows) { const q = rep.get(x.c) || { e: 0, s: 0 }; q.e++; q.s += x.ok; rep.set(x.c, q); }
  const cls = classes.filter(c => ok.has(c.id) && (F.cls == null || c.id === F.cls) && (C.has(c.id) || rep.has(c.id)));
  const tot = { st: 0, dy: 0, p: 0, ab: 0, l: 0, r: 0, e: 0, s: 0 };
  table('t-cls', ['القسم', 'التلاميذ', 'أيام مسجّلة', 'حاضر', 'غائب', 'متأخر', 'استظهر', 'التقارير'],
    cls.map(c => {
      const g = C.get(c.id) || { n: 0, ab: 0, l: 0, r: 0, days: new Set(), stu: new Set() }, q = rep.get(c.id) || { e: 0, s: 0 };
      tot.st += g.stu.size; tot.dy += g.days.size; tot.p += g.n - g.ab; tot.ab += g.ab; tot.l += g.l; tot.r += g.r; tot.e += q.e; tot.s += q.s;
      return `<tr ${sel('cls', c.id)}><td class="nm">${esc(c.name)}<small>${esc(LV[c.lv])} · ${c.type}</small></td>
        <td class="n">${fmt(g.stu.size)}</td><td class="n">${fmt(g.days.size)}</td><td class="n">${fmt(g.n - g.ab)}</td>
        <td class="n${g.ab ? ' bad' : ''}">${fmt(g.ab)}</td><td class="n">${fmt(g.l)}</td><td class="n">${of(g.r, g.n - g.ab)}</td>
        <td class="n${q.e > q.s ? ' bad' : ''}">${of(q.s, q.e)}</td></tr>`;
    }), 'لا توجد بيانات في هذا الاختيار.',
    ['المجموع', fmt(tot.st), fmt(tot.dy), fmt(tot.p), fmt(tot.ab), fmt(tot.l), of(tot.r, tot.p), of(tot.s, tot.e)]);

  // التقارير الناقصة: لكل (معلم، قسم) مع التواريخ
  const mm = new Map();
  for (const x of rows) {
    const k = x.t + '|' + x.c; let q = mm.get(k);
    if (!q) mm.set(k, q = { t: teachers[x.t], c: classes[x.c], e: 0, miss: [] });
    q.e++; if (!x.ok) q.miss.push(x.d);
  }
  const miss = [...mm.values()].filter(q => q.miss.length).sort((a, z) => z.miss.length - a.miss.length);
  table('t-miss', ['المعلم', 'القسم', 'لم تُرسل', 'أُرسلت', 'التواريخ'],
    miss.map(q => `<tr ${sel('tch', q.t.id)}><td class="nm">${esc(q.t.name)}</td><td class="nm">${esc(q.c.name)}</td>
      <td class="n bad">${fmt(q.miss.length)}</td><td class="n">${of(q.e - q.miss.length, q.e)}</td>
      <td><div class="chips2">${dateChips(q.miss, F.tch === q.t.id)}</div></td></tr>`),
    rows.length ? 'كل التقارير المطلوبة أُرسلت في هذا الاختيار ✓' : 'لا توجد أيام دراسة في هذا الاختيار.');

  // تلاميذ للمتابعة
  const shown = stuAll ? follow : follow.slice(0, STU_PAGE);
  table('t-stu', ['#', 'التلميذ', 'القسم', 'غاب', 'تأخر', 'استظهر', 'آخر غياب'],
    shown.map((x, i) => { const rt = x.ab / x.n, tone = rt >= .2 ? 'bad' : rt >= .1 ? 'warn' : '';
      return `<tr ${sel('stu', x.st.id)}><td class="rk">${i + 1}</td><td class="nm">${esc(x.st.name)}</td>
        <td class="nm">${esc(classes[x.st.c] ? classes[x.st.c].name : '')}</td>
        <td class="n ${tone}">${fmt(x.ab)}<small> من ${fmt(x.n)} يوماً</small></td><td class="n">${fmt(x.l)}</td>
        <td class="n">${of(x.r, x.n - x.ab)}</td><td class="n">${x.last > -1 ? dShort(x.last) : '—'}</td></tr>`; }),
    Sx.size ? 'لا يوجد تلميذ غائب في هذا الاختيار ✓' : 'لا توجد أسطر حضور في هذا الاختيار.');
  const more = $('stu-more');
  more.hidden = follow.length <= STU_PAGE;
  more.textContent = stuAll ? 'عرض أول ' + STU_PAGE + ' فقط' : 'عرض الكل (' + fmt(follow.length) + ')';
  return [n, att.length, 'سطر'];
}

/* ───────── ② جودة التدريس ───────── */
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

  // المعلمون (لا يتأثر الجدول بفلتر المعلم نفسه ليبقى للمقارنة)
  const offT = new Map();
  for (const o of offs.filter(selOf(ok, false))) offT.set(o.t, (offT.get(o.t) || 0) + 1);
  const T2 = new Map(byT2.all().filter(g => g.value.n > 0).map(g => [g.key, g.value]));
  const tIds = [...new Set([...T2.keys(), ...offT.keys()])];
  const tr = tIds.map(id => ({ t: teachers[id], p: T2.get(id) || { n: 0, st: 0, to: 0, ia: 0 }, off: offT.get(id) || 0 })).sort((a, z) => z.p.n - a.p.n);
  const tt = tr.reduce((a, x) => ({ n: a.n + x.p.n, to: a.to + x.p.to, ia: a.ia + x.p.ia, st: a.st + x.p.st, off: a.off + x.off }), { n: 0, to: 0, ia: 0, st: 0, off: 0 });
  table('t-tch', ['المعلم', 'الدروس', 'بوسيلة', 'تفاعلية', 'استراتيجيات مستعملة', 'أيام لم تُقدَّم'],
    tr.map(x => `<tr ${sel('tch', x.t.id)}><td class="nm">${esc(x.t.name)}<small>${x.t.role}</small></td><td class="n">${fmt(x.p.n)}</td>
      <td class="n">${of(x.p.to, x.p.n)}</td><td class="n">${of(x.p.ia, x.p.n)}</td><td class="n">${fmt(x.p.st)}</td>
      <td class="n${x.off ? ' warn' : ''}">${fmt(x.off)}</td></tr>`),
    'لا توجد دروس في هذا الاختيار.', ['المجموع', fmt(tt.n), of(tt.to, tt.n), of(tt.ia, tt.n), fmt(tt.st), fmt(tt.off)]);

  // الاستراتيجيات (لا يتأثر بفلتر الاستراتيجية نفسه)
  const stc = new Map(bySt.all().map(g => [g.key, g.value]));
  const stRows = ST.map((nm, i) => ({ i, nm, c: stc.get(i) || 0 })).sort((a, z) => z.c - a.c);
  table('t-st', ['الاستراتيجية', 'الدروس'], stRows.map(x => `<tr ${sel('strat', x.i)}><td class="nm">${esc(x.nm)}${TRAD.has(x.i) ? '<small>تقليدية</small>' : ''}</td>
    <td class="n${x.c ? '' : ' zero'}">${fmt(x.c)}</td></tr>`), 'لا توجد استراتيجيات في القوائم.');

  // المواد: مواد منهاج المستويات المختارة + أي مادة دُرّست
  const lvs = new Set([...ok].filter(c => F.cls == null || c === F.cls).map(c => classes[c].lv));
  const cnt = new Map(bySj.all().filter(g => g.value > 0).map(g => [g.key, g.value]));
  const subs = [...new Set([...lvs].flatMap(CUR).concat([...cnt.keys()]))].map(k => ({ k, c: cnt.get(k) || 0 })).sort((a, z) => z.c - a.c);
  table('t-sj', ['المادة', 'الدروس'], subs.map(x => `<tr ${sel('subj', x.k)}><td class="nm">${esc(SJ[x.k])}</td>
    <td class="n${x.c ? '' : ' zero'}">${x.c ? fmt(x.c) : '0 · لم تُدرَّس'}</td></tr>`), 'لا توجد مواد في هذا الاختيار.');

  const cntTable = (id, names, map, head) => table(id, [head, 'الدروس'],
    names.map((nm, i) => ({ nm, c: map.get(i) || 0 })).sort((a, z) => z.c - a.c)
      .map(x => `<tr><td class="nm">${esc(x.nm)}</td><td class="n${x.c ? '' : ' zero'}">${fmt(x.c)}</td></tr>`), 'القائمة فارغة في الشيت.');
  cntTable('t-to', TO, TOc, 'الوسيلة');
  cntTable('t-tk', raw_TK(), TKc, 'المهمة');

  table('t-qr', ['نوع الحصة', 'الحصص'], QT.map((nm, i) => ({ nm, c: qRows.filter(q => q.q === i).length }))
    .map(x => `<tr><td class="nm">${esc(x.nm)}</td><td class="n${x.c ? '' : ' zero'}">${fmt(x.c)}</td></tr>`), 'لا توجد أنواع حصص في القوائم.',
    ['المجموع', fmt(qRows.length)]);

  table('t-off', ['السبب', 'الأيام', 'التواريخ'], OFFR.map((nm, i) => ({ nm, list: offRows.filter(o => o.r === i).sort((a, b) => a.d - b.d) }))
    .filter(x => x.list.length).sort((a, z) => z.list.length - a.list.length)
    .map(x => `<tr><td class="nm">${esc(x.nm)}</td><td class="n warn">${fmt(x.list.length)}</td>
      <td><div class="chips2">${x.list.map(o => `<span class="dchip soft">${dTiny(o.d)} · ${esc(classes[o.c].name)}</span>`).join('')}</div></td></tr>`),
    'لم يُسجَّل أي يوم بلا حصة في هذا الاختيار ✓');
  return [n, lessons.length, 'درس'];
}
let TKN = [];
const raw_TK = () => TKN;

/* ───────── ③ الرسوم ───────── */
let tl, cl, stc, sjc, qrc, offc;
const chartBase = () => ({ animationDuration: 300, animationDurationUpdate: 260, textStyle: { fontFamily: 'Changa, system-ui, sans-serif', color: css('--muted') } });
const tipBox = () => ({ backgroundColor: css('--surface'), borderColor: css('--line'), textStyle: { color: css('--ink'), fontFamily: 'Changa, sans-serif', fontSize: 12 }, extraCssText: 'box-shadow:' + css('--shadow') + ';border-radius:12px;direction:rtl;text-align:right' });

function buildTimeline() {
  const p = css('--p'), p3 = css('--p-3');
  const area = c => ({ type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: c + '33' }, { offset: 1, color: c + '00' }] });
  const marks = holWeeks.map(h => [{ name: h[2], xAxis: weeks[h[0]] }, { xAxis: weeks[h[1]] }]);
  if (RAM) marks.push([{ name: 'رمضان', xAxis: weeks[wOf(RAM[0])], itemStyle: { color: css('--ram') } }, { xAxis: weeks[wOf(RAM[1])] }]);
  tl.setOption(Object.assign(chartBase(), {
    grid: { top: 14, right: 40, left: 26, bottom: 58 },
    tooltip: Object.assign(tipBox(), { trigger: 'axis', valueFormatter: v => v == null ? '—' : v.toFixed(1) + '%' }),
    xAxis: { type: 'category', data: weeks, inverse: true, boundaryGap: false, axisLine: { lineStyle: { color: css('--line') } }, axisTick: { show: false }, axisLabel: { color: css('--muted'), fontSize: 11, hideOverlap: true } },
    yAxis: { type: 'value', position: 'right', min: 0, max: 100, interval: 25, splitLine: { lineStyle: { color: css('--grid') } }, axisLabel: { color: css('--muted'), formatter: '{value}%', fontSize: 11 } },
    dataZoom: [{ type: 'slider', xAxisIndex: 0, startValue: wOf(F.d0), endValue: wOf(F.d1), height: 22, bottom: 8, brushSelect: false, minValueSpan: 0,
      borderColor: css('--line'), backgroundColor: css('--surface-2'), fillerColor: css('--ring'), dataBackground: { lineStyle: { color: p, opacity: .4 }, areaStyle: { color: p, opacity: .08 } },
      selectedDataBackground: { lineStyle: { color: p }, areaStyle: { color: p, opacity: .15 } },
      handleStyle: { color: css('--surface'), borderColor: p }, moveHandleStyle: { color: p, opacity: .5 }, textStyle: { color: css('--muted'), fontSize: 11 }, labelFormatter: i => weeks[i] || '' }],
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
  let raf = 0;
  tl.on('datazoom', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
    const z = tl.getOption().dataZoom[0], a = Math.max(0, Math.round(z.startValue)), b = Math.min(NW - 1, Math.round(z.endValue));
    const d0 = Math.max(FIRST, a * 7), d1 = Math.min(NDAYS - 1, b * 7 + 6);
    if (d0 === F.d0 && d1 === F.d1) return; F.d0 = d0; F.d1 = d1; render('zoom'); }); });
  const ro = new ResizeObserver(() => [tl, cl, stc, sjc, qrc, offc].forEach(c => c.resize()));
  ['tl', 'cls', 'q-st', 'q-sj', 'q-qr', 'q-off'].forEach(id => ro.observe($(id).parentElement));
}
function renderCharts(ok, reason) {
  ensureCharts();
  [tl, cl, stc, sjc, qrc, offc].forEach(c => c.resize());
  if (reason !== 'zoom') {
    tl.setOption({ dataZoom: [{ startValue: wOf(F.d0), endValue: wOf(F.d1) }] });
    const wk = Array.from({ length: NW }, () => [null, null]);
    for (const g of byWeek.all()) if (g.value.n && g.key < NW) wk[g.key] = [+(attR(g.value) * 100).toFixed(2), recR(g.value) == null ? null : +(recR(g.value) * 100).toFixed(2)];
    tl.setOption({ series: [{ data: wk.map(x => x[0]) }, { data: wk.map(x => x[1]) }] });
  }
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
function render(reason) {
  if (!loaded) return;
  const t0 = performance.now();
  const ok = applyFilters();
  const [a, z, u] = tab === 'att' ? renderAtt(ok) : tab === 'q' ? renderQual(ok) : renderCharts(ok, reason);
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
  $('periods').innerHTML = PERIODS.map(p => `<button type="button" data-p="${p.k}" aria-pressed="false">${p.t}</button>`).join('');
  for (const id of ['f-d0', 'f-d1']) { $(id).min = iso(FIRST); $(id).max = iso(NDAYS - 1); }
}
function syncSelects() {
  $('f-cls').value = F.cls ?? ''; $('f-tch').value = F.tch ?? ''; $('f-lvl').value = F.lvl ?? ''; $('f-typ').value = F.typ ?? '';
  $('f-d0').value = iso(F.d0); $('f-d1').value = iso(F.d1);
  for (const b of $('periods').children) { const p = PERIODS.find(x => x.k === b.dataset.p); b.setAttribute('aria-pressed', p.d[0] === F.d0 && p.d[1] === F.d1); }
}
function renderActive() {
  const ch = [];
  const per = PERIODS.find(p => p.d[0] === F.d0 && p.d[1] === F.d1);
  if (!per || per.k !== 'all') ch.push(['d', 'الفترة', per ? per.t : (F.d0 === F.d1 ? dShort(F.d0) : 'من ' + dShort(F.d0) + ' إلى ' + dShort(F.d1))]);
  if (F.cls != null) ch.push(['cls', 'القسم', classes[F.cls].name]);
  if (F.tch != null) ch.push(['tch', 'المعلم', teachers[F.tch].name]);
  if (F.lvl != null) ch.push(['lvl', 'المستوى', LV[F.lvl]]);
  if (F.typ != null) ch.push(['typ', 'النوع', F.typ]);
  if (F.stu != null) ch.push(['stu', 'التلميذ', students[F.stu].name]);
  if (F.subj != null) ch.push(['subj', 'المادة', SJ[F.subj]]);
  if (F.strat != null) ch.push(['strat', 'الاستراتيجية', ST[F.strat]]);
  $('active').innerHTML = ch.map(c => `<button type="button" class="fchip" data-x="${c[0]}" aria-label="إزالة ${c[1]}"><i>×</i>${c[1]}: <b>${esc(c[2])}</b></button>`).join('')
    + (ch.length > 1 ? '<button type="button" class="clear" data-x="all">مسح الكل</button>' : '')
    + '<span class="speed" id="speed"></span>';
  syncSelects();
}
function setRange(d0, d1) {
  d0 = Math.max(FIRST, Math.min(NDAYS - 1, d0)); d1 = Math.max(FIRST, Math.min(NDAYS - 1, d1));
  if (d0 > d1) [d0, d1] = [d1, d0];
  F.d0 = d0; F.d1 = d1;
}
function showTab(t) {
  tab = t; LS.set('tab', t);
  for (const x of $('tabs').children) x.setAttribute('aria-pressed', x.dataset.t === t);
  $('v-att').hidden = t !== 'att'; $('v-q').hidden = t !== 'q'; $('v-ch').hidden = t !== 'ch';
}

let bound = false;
function bind() {
  if (bound) return; bound = true;
  const onSel = (k, conv) => e => { const v = e.target.value; F[k] = v === '' ? null : conv(v); F.stu = null; render(); };
  $('f-cls').addEventListener('change', onSel('cls', Number));
  $('f-tch').addEventListener('change', onSel('tch', Number));
  $('f-lvl').addEventListener('change', onSel('lvl', Number));
  $('f-typ').addEventListener('change', onSel('typ', String));
  const onDate = which => e => { const d = fromIso(e.target.value); if (d == null) { syncSelects(); return; }
    which ? setRange(Math.min(F.d0, d), d) : setRange(d, Math.max(F.d1, d)); render(); };
  $('f-d0').addEventListener('change', onDate(0));
  $('f-d1').addEventListener('change', onDate(1));
  $('periods').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const p = PERIODS.find(x => x.k === b.dataset.p); setRange(p.d[0], p.d[1]); render(); });
  $('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.dataset.t === tab) return; showTab(b.dataset.t); render(); });
  $('metric').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; metric = b.dataset.m;
    for (const x of $('metric').children) x.setAttribute('aria-pressed', x === b); render(); });
  $('active').addEventListener('click', e => {
    const b = e.target.closest('[data-x]'); if (!b) return; const x = b.dataset.x;
    if (x === 'd' || x === 'all') setRange(FIRST, NDAYS - 1);
    if (x === 'all') Object.assign(F, { cls: null, tch: null, lvl: null, typ: null, stu: null, subj: null, strat: null }); else if (x !== 'd') F[x] = null;
    render();
  });
  // الضغط على أي سطر في الجداول ← تصفية (والضغط مرة ثانية يلغيها)
  const pick = e => {
    const r = e.target.closest('tr[data-k]'); if (!r) return;
    const k = r.dataset.k, v = +r.dataset.v;
    F[k] = F[k] === v ? null : v; if (k !== 'stu') F.stu = null;
    render();
  };
  for (const id of ['t-cls', 't-miss', 't-stu', 't-tch', 't-st', 't-sj']) {
    $(id).addEventListener('click', pick);
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter') pick(e); });
  }
  $('stu-more').addEventListener('click', () => { stuAll = !stuAll; render(); });
  const rebuild = () => { if (!loaded) return; if (tl) buildCharts(); render(); };
  new MutationObserver(rebuild).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rebuild); } catch (e) {}
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(rebuild);
}

/* ───────── التشغيل ───────── */
function start(raw) {
  const wasAll = loaded && F.d0 === FIRST && F.d1 === NDAYS - 1;
  const prevEnd = loaded ? NDAYS - 1 : null;
  load(raw);
  TKN = raw.lists.tk || [];
  // الحفاظ على الفلاتر بعد التحديث ما دامت صالحة (الفترة الكاملة تمتد تلقائياً لليوم الجديد)
  if (!loaded || wasAll) setRange(FIRST, NDAYS - 1);
  else setRange(F.d0, F.d1 === prevEnd ? NDAYS - 1 : F.d1);
  if (F.cls != null && !classes[F.cls]) F.cls = null;
  if (F.tch != null && !teachers[F.tch]) F.tch = null;
  if (F.stu != null && !students[F.stu]) F.stu = null;
  if (F.lvl != null && !LV[F.lvl]) F.lvl = null;
  if (F.subj != null && !SJ[F.subj]) F.subj = null;
  if (F.strat != null && !ST[F.strat]) F.strat = null;

  show('app');
  $('school').textContent = raw.school || 'مدرسة نور السلام القرآنية';
  $('year').textContent = (raw.year ? raw.year + ' · ' : '') + 'اليوم ' + dLabel(NDAYS - 1);
  if (!loaded) { const want = LS.get('tab'); showTab(want === 'q' || want === 'ch' ? want : 'att'); }
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
    try { start(cached.data); setSync('ok'); } catch (e) { ver = ''; }
  } else show('boot');
  refresh();
}

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(() => {}));
boot();
})();
