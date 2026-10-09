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
let START, NDAYS, NW, TODAY, weeks, HOLI, holWeeks, RAM, PERIODS, LV, CUR, ST, TRAD, TO, SJ, OFFR, QT, W;
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

  // الفترات الجاهزة
  const last = NW - 1, T = (raw.terms || []).map(x => x == null ? null : wOf(x - START));
  PERIODS = [{ k: 'all', t: 'الموسم كاملاً', w: [0, last] }];
  if (T[0] != null && T[0] >= 0 && T[0] < last) {
    PERIODS.push({ k: 't1', t: 'الفصل الأول', w: [0, T[0]] });
    if (T[1] != null && T[1] > T[0]) {
      PERIODS.push({ k: 't2', t: 'الفصل الثاني', w: [T[0] + 1, Math.min(T[1], last)] });
      if (T[1] < last) PERIODS.push({ k: 't3', t: 'الفصل الثالث', w: [T[1] + 1, last] });
    } else PERIODS.push({ k: 't2', t: 'بعد الفصل الأول', w: [T[0] + 1, last] });
  }
  if (RAM) PERIODS.push({ k: 'ram', t: 'رمضان', w: [wOf(RAM[0]), wOf(RAM[1])] });
  if (NW > 4) PERIODS.push({ k: 'm1', t: 'آخر 4 أسابيع', w: [last - 3, last] });
  if (NW > 1) PERIODS.push({ k: 'w1', t: 'هذا الأسبوع', w: [last, last] });

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

/* ───────── الحالة ───────── */
const F = { w0: 0, w1: 0, cls: null, tch: null, lvl: null, typ: null, stu: null, subj: null, strat: null };
let metric = 'att', tab = 'att', loaded = false, ver = '', syncedAt = 0;

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
  dDim.filterRange([F.w0 * 7, (F.w1 + 1) * 7]);
  full ? cDim.filterAll() : cDim.filterFunction(byC);
  F.stu == null ? sDim.filterAll() : sDim.filterExact(F.stu);
  dDim2.filterRange([F.w0 * 7, (F.w1 + 1) * 7]);
  full ? cDim2.filterAll() : cDim2.filterFunction(byC);
  F.tch == null ? tDim2.filterAll() : tDim2.filterExact(F.tch);
  F.subj == null ? sjDim.filterAll() : sjDim.filterExact(F.subj);
  F.strat == null ? stDim.filterAll() : stDim.filterExact(F.strat);
  return ok;
}

/* ───────── الرسوم ───────── */
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
    dataZoom: [{ type: 'slider', xAxisIndex: 0, startValue: F.w0, endValue: F.w1, height: 22, bottom: 8, brushSelect: false, minValueSpan: 0,
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

function kpiHTML(kp) {
  return kp.map(k => {
    const i = { ok: 0, warn: 1, bad: 2 }[k.st];
    return `<article class="kpi"><div class="k-h"><span class="k-l">${k.l}</span>${k.st ? `<span class="pill s-${k.st}">${k.stt[i]}</span>` : ''}</div>
      <div class="k-v">${k.v}<small>${k.v === '—' ? '' : k.u}</small></div>
      ${k.r == null ? '' : `<div class="meter"><i class="m-${k.st}" style="width:${(k.r * 100).toFixed(1)}%"></i></div>`}
      <div class="k-s">${k.s}</div></article>`;
  }).join('');
}

/* ───────── تبويب: الحضور والاستظهار ───────── */
function renderAtt(ok, reason) {
  const A = Object.assign({}, all.value());
  const ar = attR(A), rr = recR(A);
  const inSel = o => o.d >= F.w0 * 7 && o.d < (F.w1 + 1) * 7 && ok.has(o.c) && (F.cls == null || o.c === F.cls) && (F.tch == null || o.t === F.tch)
    && (F.stu == null || o.c === students[F.stu].c);
  const rows = logs.filter(inSel);
  const sent = rows.reduce((s, l) => s + l.ok, 0), cr = rows.length ? sent / rows.length : null;
  const stuRows = byStu.all().filter(g => g.value.n >= 5 && (F.stu == null || g.key === F.stu));
  const atRisk = stuRows.filter(g => g.value.ab / g.value.n >= .2);
  $('kpis').innerHTML = kpiHTML([
    { l: 'نسبة الحضور', v: pct(ar), u: '%', s: 'الغياب: ' + fmt(A.ab) + ' · التأخر: ' + fmt(A.l), r: ar, st: lvlOf(ar, .92, .85), stt: ['جيد', 'متوسط', 'ضعيف'] },
    { l: 'نسبة الاستظهار', v: pct(rr), u: '%', s: 'استظهر: ' + fmt(A.r) + ' من ' + fmt(A.n - A.ab) + ' حاضر', r: rr, st: lvlOf(rr, .75, .6), stt: ['جيد', 'متوسط', 'ضعيف'] },
    { l: 'التزام معلمي الأقسام بالسجل', v: pct(cr), u: '%', s: rows.length ? 'لم يُرسل: ' + fmt(rows.length - sent) + ' من ' + fmt(rows.length) : 'لا توجد أيام دراسة في الاختيار', r: cr, st: lvlOf(cr, .95, .85), stt: ['ممتاز', 'مقبول', 'ضعيف'] },
    { l: 'تلاميذ غيابهم 20% فأكثر', v: stuRows.length ? fmt(atRisk.length) : '—', u: '', s: stuRows.length ? 'من أصل ' + fmt(stuRows.length) + ' في الاختيار' : 'يلزم 5 حصص على الأقل لكل تلميذ', r: stuRows.length ? 1 - atRisk.length / stuRows.length : null,
      st: !stuRows.length ? '' : atRisk.length === 0 ? 'ok' : atRisk.length <= stuRows.length * .05 ? 'warn' : 'bad', stt: ['لا أحد', 'للمتابعة', 'مرتفع'] }
  ]);

  if (reason !== 'zoom') {
    const wk = Array.from({ length: NW }, () => [null, null]);
    for (const g of byWeek.all()) if (g.value.n && g.key < NW) wk[g.key] = [+(attR(g.value) * 100).toFixed(2), recR(g.value) == null ? null : +(recR(g.value) * 100).toFixed(2)];
    tl.setOption({ series: [{ data: wk.map(x => x[0]) }, { data: wk.map(x => x[1]) }] });
  }

  const p = css('--p'), w = css('--warn'), b = css('--bad');
  const fn = metric === 'att' ? attR : recR, th = metric === 'att' ? [.92, .85] : [.75, .6];
  const cs = byCls.all().filter(g => ok.has(g.key) && g.value.n).map(g => ({ c: classes[g.key], v: fn(g.value), g: g.value }))
    .filter(x => x.v != null).sort((a, z) => z.v - a.v);
  const hasSel = F.cls != null;
  setBars(cl, cs.map(x => ({ value: x.v * 100, key: x.c.id, name: x.c.name, lbl: (x.v * 100).toFixed(1) + '%',
    itemStyle: { color: x.v >= th[0] ? p : x.v >= th[1] ? w : b, opacity: hasSel && x.c.id !== F.cls ? .28 : 1 },
    tip: `<b>${esc(x.c.name)}</b><br>${esc(LV[x.c.lv])} · ${x.c.type}<br>الحضور: ${pct(attR(x.g))}% · الاستظهار: ${pct(recR(x.g))}%<br>${fmt(x.g.n)} سطر حضور` })), 100);
  $('cls-empty').hidden = cs.length > 0;

  const warn = byStu.all().filter(g => g.value.n >= 5 && ok.has(students[g.key].c) && (F.cls == null || students[g.key].c === F.cls))
    .map(g => ({ s: students[g.key], ab: g.value.ab / g.value.n, rr: recR(g.value), n: g.value.n }))
    .filter(x => x.ab >= .12).sort((a, z) => z.ab - a.ab).slice(0, 7);
  $('warn').innerHTML = warn.length ? warn.map(x => `<button type="button" class="row" data-stu="${x.s.id}" aria-pressed="${F.stu === x.s.id}">
      <span class="nm">${esc(x.s.name)}</span><span class="mt">${esc(classes[x.s.c] ? classes[x.s.c].name : '')} · استظهار ${pct(x.rr, 0)}% · ${x.n} يوماً</span>
      <span class="rt"><span class="pill ${x.ab >= .25 ? 's-bad' : 's-warn'}">${x.ab >= .25 ? 'خطر' : 'متابعة'}</span><span class="val">${pct(x.ab)}%</span></span></button>`).join('')
    : '<div class="empty">لا يوجد تلميذ تجاوز غيابه 12% في هذا الاختيار.</div>';

  const per = new Map();
  for (const l of rows) { const q = per.get(l.t) || { e: 0, s: 0 }; q.e++; q.s += l.ok; per.set(l.t, q); }
  const miss = [...per].map(([t, q]) => ({ t: teachers[t], m: q.e - q.s, e: q.e })).filter(x => x.m > 0).sort((a, z) => z.m - a.m || z.m / z.e - a.m / a.e).slice(0, 5);
  $('miss').innerHTML = miss.length ? miss.map(x => { const r = 1 - x.m / x.e; return `<button type="button" class="row" data-tch="${x.t.id}" aria-pressed="${F.tch === x.t.id}">
      <span class="nm">${esc(x.t.name)}</span><span class="mt">${x.t.role} · ${x.t.cls.length > 1 ? x.t.cls.length + ' أقسام' : esc(classes[x.t.cls[0]] ? classes[x.t.cls[0]].name : '')}</span>
      <span class="rt"><span class="pill s-${lvlOf(r, .95, .85)}">${x.m} ناقص</span><span class="val">${pct(r, 0)}%</span></span></button>`; }).join('')
    : '<div class="empty">كل التقارير المطلوبة أُرسلت في هذا الاختيار.</div>';
  return [A.n, att.length, 'سطر'];
}

/* ───────── تبويب: جودة التدريس ───────── */
function ensureQ() {
  if (stc) return;
  stc = echarts.init($('q-st')); sjc = echarts.init($('q-sj')); qrc = echarts.init($('q-qr')); offc = echarts.init($('q-off'));
  buildHbar(stc, 128); buildHbar(sjc, 118);
  stc.on('click', q => { if (q.data.key == null) return; F.strat = F.strat === q.data.key ? null : q.data.key; render(); });
  sjc.on('click', q => { if (q.data.key == null) return; F.subj = F.subj === q.data.key ? null : q.data.key; render(); });
  const ro = new ResizeObserver(() => [stc, sjc, qrc, offc].forEach(c => c.resize()));
  ['q-st', 'q-sj', 'q-qr', 'q-off'].forEach(id => ro.observe($(id).parentElement));
}
function renderQual(ok) {
  ensureQ();
  const A = Object.assign({}, all2.value());
  let base = A.n;
  if (F.strat != null) { stDim.filterAll(); base = all2.value().n; stDim.filterExact(F.strat); }
  const inSel = o => o.d >= F.w0 * 7 && o.d < (F.w1 + 1) * 7 && ok.has(o.c) && (F.cls == null || o.c === F.cls) && (F.tch == null || o.t === F.tch);
  const offRows = offs.filter(inSel), qRows = quran.filter(inSel);
  const oc = OFFR.map((_, i) => offRows.filter(o => o.r === i).length), top = oc.indexOf(Math.max(...oc));
  const avg = A.n ? A.st / A.n : null, iaR = A.n ? A.ia / A.n : null, toR = A.n ? A.to / A.n : null;
  const tradNames = [...TRAD].map(i => ST[i]).join('، ');
  $('kpis2').innerHTML = kpiHTML([
    { l: 'متوسط الاستراتيجيات في الدرس', v: avg == null ? '—' : avg.toFixed(2), u: '', s: 'في ' + fmt(A.n) + ' درس مسجّل', r: avg == null ? null : Math.min(1, avg / 3), st: lvlOf(avg, 2, 1.5), stt: ['متنوع', 'مقبول', 'محدود'] },
    { l: 'دروس تفاعلية', v: pct(iaR), u: '%', s: tradNames ? 'فيها استراتيجية غير ' + esc(tradNames) : 'فيها استراتيجية واحدة على الأقل', r: iaR, st: lvlOf(iaR, .7, .5), stt: ['جيد', 'متوسط', 'ضعيف'] },
    { l: 'دروس بوسيلة تعليمية', v: pct(toR), u: '%', s: 'وسيلة واحدة على الأقل', r: toR, st: lvlOf(toR, .6, .4), stt: ['جيد', 'متوسط', 'ضعيف'] },
    { l: 'أيام لم تُقدَّم فيها حصة', v: fmt(offRows.length), u: '', s: offRows.length ? 'أكثر الأسباب: ' + esc(OFFR[top]) : 'لا يوجد في هذا الاختيار', r: null }
  ]);

  const p = css('--p'), mu = css('--muted'), b = css('--bad');
  const st = bySt.all().filter(g => g.value > 0).map(g => ({ key: g.key, v: base ? g.value / base : 0, n: g.value })).sort((a, z) => z.v - a.v);
  setBars(stc, st.map(x => ({ value: x.v * 100, key: x.key, name: ST[x.key], lbl: (x.v * 100).toFixed(0) + '%',
    itemStyle: { color: TRAD.has(x.key) ? mu : p, opacity: F.strat != null && F.strat !== x.key ? .28 : 1 },
    tip: `<b>${esc(ST[x.key])}</b><br>${fmt(x.n)} درس من ${fmt(base)}` })), 100);
  $('st-empty').hidden = st.length > 0;

  const lvs = new Set([...ok].filter(c => F.cls == null || c === F.cls).map(c => classes[c].lv));
  const cnt = new Map(bySj.all().filter(g => g.value > 0).map(g => [g.key, g.value]));
  const subs = [...new Set([...lvs].flatMap(CUR).concat([...cnt.keys()]))];
  const tot = subs.reduce((a, k) => a + (cnt.get(k) || 0), 0);
  const sj = subs.map(k => ({ key: k, n: cnt.get(k) || 0 })).sort((a, z) => z.n - a.n);
  setBars(sjc, sj.map(x => ({ value: x.n, key: x.key, name: SJ[x.key], lbl: fmt(x.n) + ' درس',
    itemStyle: { color: tot && x.n / tot < .05 ? b : p, opacity: F.subj != null && F.subj !== x.key ? .28 : 1 },
    tip: `<b>${esc(SJ[x.key])}</b><br>${fmt(x.n)} درس · ${tot ? (x.n / tot * 100).toFixed(1) : 0}% من الدروس` })), Math.max(1, ...sj.map(x => x.n)) * 1.02);
  $('sj-empty').hidden = sj.length > 0;

  const rows = byT2.all().filter(g => g.value.n > 0).map(g => ({ t: teachers[g.key], p: Object.assign({}, g.value), s: score(g.value) })).sort((a, z) => z.s - a.s);
  $('q-tch').innerHTML = `<thead><tr><th>المعلم</th><th>الدروس</th><th>استراتيجيات/درس</th><th>تفاعلية</th><th>بوسيلة</th><th>مؤشر الجودة</th></tr></thead><tbody>` +
    (rows.length ? rows.map(r => { const lv = lvlOf(r.s / 100, .7, .55); return `<tr data-tch="${r.t.id}" aria-selected="${F.tch === r.t.id}" tabindex="0">
      <td class="nm">${esc(r.t.name)}<small>${r.t.role}</small></td><td>${fmt(r.p.n)}</td><td>${(r.p.st / r.p.n).toFixed(2)}</td><td>${pct(r.p.ia / r.p.n, 0)}%</td><td>${pct(r.p.to / r.p.n, 0)}%</td>
      <td><span class="score"><b>${r.s.toFixed(0)}</b><span class="meter"><i class="m-${lv}" style="width:${r.s.toFixed(0)}%"></i></span></span></td></tr>`; }).join('')
      : '<tr><td colspan="6" class="empty">لا توجد دروس في هذا الاختيار.</td></tr>') + '</tbody>';

  pie(qrc, QT, QT.map((_, i) => qRows.filter(q => q.q === i).length), [p, css('--p-3'), css('--ok'), css('--warn')], 'حصة');
  pie(offc, OFFR, oc, [css('--warn'), p, b, mu, css('--p-3'), css('--ok')], 'يوماً');
  return [A.n, lessons.length, 'درس'];
}

/* ───────── الرسم العام ───────── */
function render(reason) {
  if (!loaded) return;
  const t0 = performance.now();
  const ok = applyFilters();
  const [a, z, u] = tab === 'att' ? renderAtt(ok, reason) : renderQual(ok);
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
}
function syncSelects() {
  $('f-cls').value = F.cls ?? ''; $('f-tch').value = F.tch ?? ''; $('f-lvl').value = F.lvl ?? ''; $('f-typ').value = F.typ ?? '';
  for (const b of $('periods').children) { const p = PERIODS.find(x => x.k === b.dataset.p); b.setAttribute('aria-pressed', p.w[0] === F.w0 && p.w[1] === F.w1); }
}
function renderActive() {
  const ch = [];
  const per = PERIODS.find(p => p.w[0] === F.w0 && p.w[1] === F.w1);
  if (!per || per.k !== 'all') ch.push(['w', 'الفترة', per ? per.t : 'من ' + weeks[F.w0] + ' إلى ' + dLabel(Math.min(F.w1 * 7 + 6, NDAYS - 1))]);
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
function setRange(w0, w1) { F.w0 = w0; F.w1 = w1; tl.setOption({ dataZoom: [{ startValue: w0, endValue: w1 }] }); }

let bound = false;
function bind() {
  if (bound) return; bound = true;
  const onSel = (k, conv) => e => { const v = e.target.value; F[k] = v === '' ? null : conv(v); F.stu = null; render(); };
  $('f-cls').addEventListener('change', onSel('cls', Number));
  $('f-tch').addEventListener('change', onSel('tch', Number));
  $('f-lvl').addEventListener('change', onSel('lvl', Number));
  $('f-typ').addEventListener('change', onSel('typ', String));
  $('periods').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const p = PERIODS.find(x => x.k === b.dataset.p); setRange(p.w[0], p.w[1]); render(); });
  $('tabs').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.dataset.t === tab) return;
    tab = b.dataset.t; LS.set('tab', tab);
    for (const x of $('tabs').children) x.setAttribute('aria-pressed', x === b);
    $('v-att').hidden = tab !== 'att'; $('v-q').hidden = tab !== 'q';
    render(); if (tab === 'att') { tl.resize(); cl.resize(); }
  });
  $('metric').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; metric = b.dataset.m;
    for (const x of $('metric').children) x.setAttribute('aria-pressed', x === b); render(); });
  $('active').addEventListener('click', e => {
    const b = e.target.closest('[data-x]'); if (!b) return; const x = b.dataset.x;
    if (x === 'w' || x === 'all') setRange(0, NW - 1);
    if (x === 'all') Object.assign(F, { cls: null, tch: null, lvl: null, typ: null, stu: null, subj: null, strat: null }); else if (x !== 'w') F[x] = null;
    render();
  });
  $('warn').addEventListener('click', e => { const b = e.target.closest('[data-stu]'); if (!b) return; const id = +b.dataset.stu; F.stu = F.stu === id ? null : id; render(); });
  const pickT = e => { const r = e.target.closest('[data-tch]'); if (!r) return; const id = +r.dataset.tch; F.tch = F.tch === id ? null : id; F.stu = null; render(); };
  $('miss').addEventListener('click', pickT);
  $('q-tch').addEventListener('click', pickT);
  $('q-tch').addEventListener('keydown', e => { if (e.key === 'Enter') pickT(e); });
  cl.on('click', q => { const id = q.data && q.data.key; if (id == null) return; F.cls = F.cls === id ? null : id; F.stu = null; render(); });
  let raf = 0;
  tl.on('datazoom', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
    const z = tl.getOption().dataZoom[0], a = Math.max(0, Math.round(z.startValue)), b = Math.min(NW - 1, Math.round(z.endValue));
    if (a === F.w0 && b === F.w1) return; F.w0 = a; F.w1 = b; render('zoom'); }); });
  const ro = new ResizeObserver(() => { tl.resize(); cl.resize(); }); ro.observe($('tl')); ro.observe($('cls').parentElement);
  const rebuild = () => { if (!loaded) return; buildTimeline(); buildHbar(cl, 104); if (stc) { buildHbar(stc, 128); buildHbar(sjc, 118); } render(); };
  new MutationObserver(rebuild).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rebuild); } catch (e) {}
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(rebuild);
}

/* ───────── التشغيل ───────── */
function start(raw) {
  const prevNW = NW, wasAll = loaded && F.w0 === 0 && F.w1 === prevNW - 1;
  load(raw);
  // الحفاظ على الفلاتر بعد التحديث ما دامت صالحة
  if (!loaded || wasAll || F.w1 >= NW) { F.w0 = 0; F.w1 = NW - 1; }
  if (F.cls != null && !classes[F.cls]) F.cls = null;
  if (F.tch != null && !teachers[F.tch]) F.tch = null;
  if (F.stu != null && !students[F.stu]) F.stu = null;
  if (F.lvl != null && !LV[F.lvl]) F.lvl = null;
  if (F.subj != null && !SJ[F.subj]) F.subj = null;
  if (F.strat != null && !ST[F.strat]) F.strat = null;

  show('app');
  $('school').textContent = raw.school || 'مدرسة نور السلام القرآنية';
  $('year').textContent = (raw.year ? raw.year + ' · ' : '') + 'اليوم ' + dLabel(NDAYS - 1);
  if (!tl) { tl = echarts.init($('tl')); cl = echarts.init($('cls')); }
  const want = LS.get('tab');
  if (!loaded && want === 'q') { tab = 'q'; for (const x of $('tabs').children) x.setAttribute('aria-pressed', x.dataset.t === 'q'); $('v-att').hidden = true; $('v-q').hidden = false; }
  fillSelects();
  buildTimeline(); buildHbar(cl, 104);
  if (stc) { buildHbar(stc, 128); buildHbar(sjc, 118); }
  $('w-note').textContent = `مؤشر الجودة من 100: الدروس التفاعلية ${W[0]}، استعمال الوسائل ${W[1]}، تنويع الاستراتيجيات ${W[2]} (تُعدَّل الأوزان من صفحة الإعدادات). اضغط على معلم لتصفية اللوحة به.`;
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
