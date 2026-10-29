// Lecture des relevés d'activité PN HOP! (PDF mensuel MyPeopleDoc), directement dans le téléphone.
// Méthode (docs/RELEVE_ACTIVITE.md) : le texte brut perd les colonnes vides, on travaille donc avec
// la position de chaque mot sur la page (pdf.js) et on range chaque nombre sous l'en-tête le plus proche.
import { addDays, blockMinutes, parisToMs, typeFromReg } from "./core.js";

// En-têtes des colonnes numériques : mot cherché dans l'en-tête → nom de colonne
const COLS = [["HBB","HBB"],["MEP","MEP"],["Instr","INSTR"],["Rém","REM"],["Simu","NUITSIMU"],["Cab.","FF"],["CP","CP"],["AM","AM"],
  ["Incitation","PRIME"],["Fr","REPFR"],["Etr","REPETR"],["Plateaux","PLAT"],["terrain","MONT"],["Hôtels","HOT"]];
const MOIS = {janvier:1,"février":2,fevrier:2,mars:3,avril:4,mai:5,juin:6,juillet:7,"août":8,aout:8,septembre:9,octobre:10,novembre:11,"décembre":12,decembre:12};
const NUM_X = 330, ROUTE_X0 = 175, ROUTE_X1 = 265;

// ---------- 1. PDF → pages de mots positionnés ----------
// Chaque élément de texte pdf.js peut contenir plusieurs mots : on les découpe et on estime leur position
// au prorata des caractères. top = distance depuis le haut de la page (en points).
export function itemsToWords(items, pageHeight){
  const words = [];
  items.forEach(it => {
    const s = it.str || ""; if (!s.trim()) return;
    const x = it.transform[4], top = pageHeight - it.transform[5], w = it.width || s.length * 4.5;
    const re = /\S+/g; let m;
    while ((m = re.exec(s))) {
      const x0 = x + w * m.index / s.length, x1 = x + w * (m.index + m[0].length) / s.length;
      words.push({text: m[0], x0, x1, top});
    }
  });
  return words;
}
export async function pdfToPages(pdfjs, data){
  const task = pdfjs.getDocument({data, isEvalSupported: false}), doc = await task.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i), vp = p.getViewport({scale: 1}), tc = await p.getTextContent();
    pages.push({words: itemsToWords(tc.items, vp.height), text: tc.items.map(t => t.str).join(" ")});
  }
  try { await task.destroy(); } catch (e) {}
  return pages;
}

// ---------- 2. Pages → lignes du relevé ----------
function headerCenters(ws){
  const hb = ws.filter(w => w.text === "HBB").sort((a, b) => a.top - b.top)[0];
  if (!hb || hb.top > 220) return null;
  const band = w => w.top > hb.top - 30 && w.top < hb.top + 30;
  const c = {};
  COLS.forEach(([key, name]) => { const w = ws.find(x => x.text === key && band(x)); if (w) c[name] = (w.x0 + w.x1) / 2; });
  const nu = ws.find(w => w.text === "Nuit" && Math.abs(w.top - hb.top) < 3 && w.x0 > NUM_X);
  if (nu) c.NUIT = (nu.x0 + nu.x1) / 2 - 4;
  return {c, top: hb.top};
}
function groupRows(ws){
  const rows = [];
  [...ws].sort((a, b) => a.top - b.top || a.x0 - b.x0).forEach(w => {
    const r = rows[rows.length - 1];
    if (r && Math.abs(r[0].top - w.top) < 3) r.push(w); else rows.push([w]);
  });
  return rows.map(r => r.sort((a, b) => a.x0 - b.x0));
}
const isNum = t => /^-?\d+([.,]\d+)?$/.test(t);
const toNum = t => parseFloat(t.replace(",", "."));

export function parsePages(pages){
  const all = pages.map(p => p.text).join(" ");
  // Période : « ##…##Relevé d'activité##2025-08-01##2025-08-31##… » ou « Période du 01 août 2025 au 31 août 2025 »
  let from = null, to = null;
  const m1 = all.match(/(\d{4}-\d\d-\d\d)\s*##\s*(\d{4}-\d\d-\d\d)/);
  if (m1) { from = m1[1]; to = m1[2]; }
  else { const m2 = all.match(/P[ée]riode du (\d\d?) (\S+) (\d{4}) au (\d\d?) (\S+) (\d{4})/i);
    if (m2) { const mo = s => String(MOIS[s.toLowerCase()] || 0).padStart(2, "0");
      from = `${m2[3]}-${mo(m2[2])}-${m2[1].padStart(2, "0")}`; to = `${m2[6]}-${mo(m2[5])}-${m2[4].padStart(2, "0")}`; } }
  // Identité : « ABC - NOM PRENOM - M000000 - CDG - OPL - EJ. Période … » (le matricule n'est pas gardé)
  let who = null;
  const mw = all.match(/\b([A-Z]{3}) - ([A-ZÀ-Ÿ' \-]+?) - [A-Z]?\d{4,} - ([A-Z]{3}) - ([A-Z]{2,4})\b/);
  if (mw) who = {tri: mw[1], name: mw[2].trim(), base: mw[3], fn: mw[4]};

  const rows = []; let total = null, C = null;
  pages.forEach(p => {
    const h = headerCenters(p.words); if (h) C = h.c;
    if (!C || !Object.keys(C).length) return;
    const names = Object.keys(C);
    groupRows(p.words).forEach(r => {
      const first = r[0].text;
      if (!/^\d\d\/\d\d$/.test(first)) {
        const txt = r.map(w => w.text).join(" ");
        if (/TOTAL\s+G[ÉE]N[ÉE]RAL/i.test(txt)) {
          total = {};
          r.forEach(w => { if (isNum(w.text) && w.x0 > NUM_X) { const xc = (w.x0 + w.x1) / 2; total[names.reduce((a, b) => Math.abs(C[a] - xc) <= Math.abs(C[b] - xc) ? a : b)] = toNum(w.text); } });
        }
        return;
      }
      const act = [], nums = {}, times = []; let route = "";
      r.slice(1).forEach(w => {
        const t = w.text, xc = (w.x0 + w.x1) / 2;
        if (/^\d\d:\d\d$/.test(t)) { times.push(t); return; }
        if (t === "/") return;
        if (isNum(t) && w.x0 > NUM_X) { nums[names.reduce((a, b) => Math.abs(C[a] - xc) <= Math.abs(C[b] - xc) ? a : b)] = toNum(t); return; }
        if (w.x0 > ROUTE_X0 && w.x0 < ROUTE_X1 && /^[A-Z]{3,6}$/.test(t)) { route += t; return; }
        act.push(t);
      });
      rows.push({dm: first, act: act.join(" "), route, h1: times[0] || "", h2: times[1] || "", nums});
    });
  });
  // Date complète de chaque ligne à partir du mois du relevé (mois de décembre / janvier : on suit l'ordre)
  if (from) {
    const y0 = +from.slice(0, 4), m0 = +from.slice(5, 7);
    rows.forEach(r => { const [dd, mm] = r.dm.split("/").map(Number); const y = (mm < m0 && m0 === 12) ? y0 + 1 : y0;
      r.d = `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`; });
  }
  return {from, to, who, rows, total};
}

// ---------- 3. Lignes → vols, hôtels, simulateur, jours + contrôles ----------
const SOL = /simu|briefing|debriefing|stage|cours|s[ée]curit[ée]|feu fum|manipulation porte|cempn|crew ressource|entretien|formation|e-?learning|visite/i;
export function dayCat(act){
  const a = act.toLowerCase();
  if (/^jour off|jour bonus|^repos/.test(a)) return "off";
  if (/cong[ée]s/.test(a)) return "cp";
  if (/arr[eê]t maladie|^arret|maladie/.test(a)) return "arret";
  if (/r[ée]serve|d[ée]clenchement dispo|^bloc re/.test(a)) return "res";
  if (SOL.test(a)) return "sol";
  return null;
}
const SIMKIND = label => /prorog/i.test(label) ? "Récurrent" : /qualifi|\bqt\b/i.test(label) ? "Qualification de type" : /solidair/i.test(label) ? "Autre"
  : /[ée]valuation|[ée]val\b|training|terrain|place droite|recurrent|r[ée]current|\becp\b|\bcct\b|\blpc\b|\bopc\b/i.test(label) ? "Récurrent" : "Autre";
// Minutes entre 21:00 et 08:00 heure de Paris (règle de paie HOP!), seulement pour contrôler la lecture de « H Nuit »
function payNight(d, h1, h2){
  const t0 = parisToMs(d, h1), m = blockMinutes(d, h1, h2); let n = 0;
  for (let i = 0; i < m; i++) { const h = new Date(t0 + (i + .5) * 6e4).toLocaleString("en-GB", {timeZone: "Europe/Paris", hour: "2-digit", hour12: false}); const hh = +h.slice(0, 2) % 24; if (hh >= 21 || hh < 8) n++; }
  return n;
}

export function releveRecords(p){
  if (!p.from) throw new Error("Période du relevé introuvable : ce PDF n'est pas un relevé d'activité HOP! ?");
  const ym = p.from.slice(0, 7), flights = [], sims = [], days = {}, hotelDays = {}, warn = [], meps = [];
  let sumHBB = 0, dayTotals = 0;
  const lastArr = {};
  p.rows.forEach(r => {
    if (!r.d) return;
    if (/^total de la journ/i.test(r.act)) { dayTotals++; sumHBB += r.nums.HBB || 0; if (r.nums.HOT) hotelDays[r.d] = r.nums.HOT; return; }
    const fm = (r.act + (r.route ? " " + r.route : "")).match(/^([A-Z]{2}\d{1,4}[A-Z]?)(?: - (F-[A-Z0-9]{4}))?(?: ([A-Z]{6}|[A-Z]{3}))?/);
    if (fm && r.h1 && r.h2 && !/^MEP/i.test(r.act)) {
      const route = r.route || fm[3] || "";
      if (!/^[A-Z]{3}([A-Z]{3})?$/.test(route)) { warn.push(`${r.d} ${fm[1]} : tronçon illisible (« ${route} »)`); return; }
      const o = route.slice(0, 3), a = route.length === 6 ? route.slice(3) : o, im = fm[2] || "";
      const f = {d: r.d, v: fm[1], o, a, h1: r.h1, h2: r.h2, im, ty: typeFromReg(im), hbb: r.nums.HBB ?? null, nuitPaie: r.nums.NUIT ?? null};
      const m = blockMinutes(f.d, f.h1, f.h2);
      if (f.hbb != null && Math.abs(f.hbb * 60 - m) > 1.5) warn.push(`${fdm(r.d)} ${f.v} : HBB ${f.hbb} h ≠ horaire ${f.h1}–${f.h2}`);
      if (f.nuitPaie != null && Math.abs(f.nuitPaie * 60 - payNight(f.d, f.h1, f.h2)) > 1.5) f.nuitDiff = true;
      flights.push(f); lastArr[r.d] = a;
      return;
    }
    // Mise en place : « MEP Avion », « MEP location voiture », « MEP Train »… avec un tronçon de 6 lettres
    if (/^MEP\b/i.test(r.act) && r.h1 && r.h2) {
      const route = r.route || ((r.act.match(/\b([A-Z]{6})\b/) || [])[1] || "");
      if (/^[A-Z]{6}$/.test(route)) {
        const mode = /voiture|taxi|car\b|bus/i.test(r.act) ? "Voiture" : /train/i.test(r.act) ? "Train" : "Avion";
        if (mode !== "Voiture") meps.push({d: r.d, v: (r.act.match(/\b([A-Z]{2}\d{1,4}[A-Z]?)\b/) || [])[1] || "", o: route.slice(0, 3), a: route.slice(3), h1: r.h1, h2: r.h2, mode, s: "Relevé"});
        lastArr[r.d] = route.slice(3);
        return;
      }
    }
    const k = dayCat(r.act);
    if (k) (days[r.d] ||= new Set()).add(k);
    if (/^simu/i.test(r.act) && r.h1 && r.h2) {
      const lab = r.act.replace(/^simu(lateur)?\s+/i, "") || r.act;
      sims.push({d: r.d, h1: r.h1, h2: r.h2, t: lab, l: r.route && r.route.length === 3 ? r.route : "—", k: SIMKIND(lab), m: 240, s: "Relevé"});
      if (r.route && r.route.length === 3) lastArr[r.d] ||= r.route;
    }
    if (r.route && r.route.length === 6 && !lastArr[r.d]) lastArr[r.d] = r.route.slice(3);
  });
  flights.forEach(f => { (days[f.d] ||= new Set()).add("vol"); });
  const dd = {}; Object.entries(days).forEach(([d, s]) => dd[d] = [...s]);
  // Hôtels : une nuit d'hôtel compagnie ce jour-là, à la dernière escale du jour
  // Escale de la nuit : dernière arrivée du jour, sinon la dernière arrivée connue avant (repos en escale sans vol ce jour-là)
  const arrDays = Object.keys(lastArr).sort();
  const apAt = d => lastArr[d] || (arrDays.filter(x => x < d).pop() ? lastArr[arrDays.filter(x => x < d).pop()] : "");
  const hotels = Object.entries(hotelDays).map(([d, n]) => ({d, s: "", e: "", de: addDays(d, 1), ap: apAt(d), h: "", n: 1, src: "Relevé"}));
  // Mois sans vol (stage, simulateur, congés) : la ligne TOTAL GENERAL existe mais n'a pas de colonne HBB → 0 h
  const tot = p.total ? (p.total.HBB ?? 0) : null;
  const check = {sum: Math.round(sumHBB * 100) / 100, total: tot, ok: tot != null && Math.abs(sumHBB - tot) <= 0.021, dayTotals,
    nuitDiff: flights.filter(f => f.nuitDiff).length};
  if (tot == null) warn.push("Ligne TOTAL GENERAL non trouvée : contrôle du total impossible");
  else if (!check.ok) warn.push(`Somme des journées ${check.sum} h ≠ total général ${tot} h : lecture à vérifier`);
  return {ym, from: p.from, to: p.to, who: p.who, flights, sims, hotels, days: dd, meps, warn, check};
}
const fdm = d => `${d.slice(8)}/${d.slice(5, 7)}`;

// ---------- Relevé d'hôtels (PDF annuel) ----------
// Une ligne par nuitée : « matricule nom prénom JJ/MM/AA <IATA> <NOM HÔTEL> <coût> € », total en bas.
const titleCase = s => s.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const euros = s => parseFloat(s.replace(/\s/g, "").replace(",", "."));
export function parseHotelPages(pages){
  const nights = []; let total = null;
  pages.forEach(p => groupRows(p.words).forEach(r => {
    const t = r.map(w => w.text).join(" ");
    const m = t.match(/(\d\d)\/(\d\d)\/(\d\d(?:\d\d)?)\s+([A-Z]{3})\s+(.+?)\s+(\d[\d\s]*(?:[.,]\d{1,2})?)\s*€/);
    if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3];
      nights.push({d: `${y}-${m[2]}-${m[1]}`, ap: m[4], h: titleCase(m[5].trim()), cost: euros(m[6])}); return; }
    const tm = t.match(/total[^\d€]*(\d[\d\s]*(?:[.,]\d{1,2})?)\s*€/i);
    if (tm) total = euros(tm[1]);
  }));
  return {nights, total};
}

// ---------- Carnet de vol HOP! (PDF mensuel) ----------
// Une ligne par étape : « JJ TYPE IMMAT VOL DEP HH:MM ARR HH:MM » puis 8 durées (instructeur, instruction,
// jour CDB, jour OPL, nuit CDB, nuit OPL, total, simu : « 0 » ou « 1h25 »). L'équipage est écrit à droite
// sur deux ou trois lignes autour de l'étape, le CDB en premier (« NOM Prénom - NOM Prénom - … »).
const durMin = t => { if (t === "0") return 0; const m = t.match(/^(\d+)h(\d\d)$/); return m ? +m[1] * 60 + +m[2] : null; };
const isDur = t => /^(0|\d+h\d\d)$/.test(t);
// Nom de famille : les mots en majuscules du début (« LE COUARHER Yann » → Le Couarher)
function surname(person){
  const t = person.trim().split(/\s+/), up = [];
  for (const w of t) { if (/\p{Ll}/u.test(w)) break; up.push(w); }
  return titleCase((up.length ? up : t.slice(0, 1)).join(" "));
}
export function isCarnetText(all){ return /##\s*Carnet Vol\s*##/i.test(all) || (/CARNET DE VOL/.test(all) && /Equipage/i.test(all) && /IMMAT/.test(all)); }
export function parseCarnetPages(pages){
  const all = pages.map(p => p.text).join(" ");
  let from = null, to = null;
  const m1 = all.match(/(\d{4}-\d\d-\d\d)\s*##\s*(\d{4}-\d\d-\d\d)/);
  if (m1) { from = m1[1]; to = m1[2]; }
  else { const m2 = all.match(/(\d\d)\/(\d\d)\/(\d{4})\s+au\s+(\d\d)\/(\d\d)\/(\d{4})/);
    if (m2) { from = `${m2[3]}-${m2[2]}-${m2[1]}`; to = `${m2[6]}-${m2[5]}-${m2[4]}`; } }
  const mn = all.match(/NOM\s*:\s*([A-ZÀ-Ÿ' \-]+?)\s+\p{Lu}\p{Ll}/u), mt = all.match(/TRIGRAMME\s*:\s*([A-Z]{3})\b/);
  const who = {name: mn ? mn[1].trim() : "", tri: mt ? mt[1] : ""};
  const flights = [], warn = []; let total = null;
  pages.forEach(p => {
    const rows = groupRows(p.words);
    // bas de l'en-tête (ligne « Lieu Heure … CDB OPL CDB OPL ») : l'équipage commence en dessous
    const hdr = p.words.filter(w => w.text === "OPL").reduce((m, w) => Math.max(m, w.top), -1);
    const legs = [], crewLines = [];
    rows.forEach(r => {
      const t = r.map(w => w.text);
      if (/^\d\d$/.test(t[0] || "") && /^E?\d{2,3}$/i.test(t[1] || "")) {
        const i = t.findIndex(x => /^\d\d:\d\d$/.test(x));
        if (i < 0) return;
        // après l'heure d'arrivée : les 8 durées, puis (sur la même ligne) une partie de l'équipage
        const rest = r.slice(i + 3), durs = [], crew = [];
        rest.forEach(w => { if (durs.length < 8 && !crew.length && isDur(w.text)) durs.push(durMin(w.text)); else crew.push(w); });
        legs.push({top: r[0].top, dd: t[0], ty: t[1], im: /^F-[A-Z0-9]{4}$/.test(t[2]) ? t[2] : "", v: t[/^F-/.test(t[2]) ? 3 : 2] || "",
          o: t[i - 1], h1: t[i], a: t[i + 1], h2: t[i + 2], durs, crew: []});
        if (crew.length) crewLines.push({top: r[0].top, txt: crew.map(w => w.text).join(" ")});
        return;
      }
      // Synthèse : « TOTAL 0 0 0 27h06 0 3h16 30h22 0 » (même ordre de colonnes, total en 7e)
      if (t[0] === "TOTAL") { const ds = t.slice(1).filter(isDur).map(durMin); if (ds.length >= 7) total = ds[6]; return; }
      // ligne d'équipage seule : sous l'en-tête, tout à droite du tableau, pas le pied de page
      if (hdr > 0 && r[0].top > hdr + 4 && r[0].x0 > 450 && !/Imprim[ée]/.test(t.join(" "))) crewLines.push({top: r[0].top, txt: t.join(" ")});
    });
    // chaque ligne d'équipage va à l'étape la plus proche verticalement
    crewLines.forEach(c => { if (!legs.length) return; const l = legs.reduce((a, b) => Math.abs(b.top - c.top) < Math.abs(a.top - c.top) ? b : a);
      if (Math.abs(l.top - c.top) < 25) l.crew.push(c); });
    legs.forEach(l => {
      const txt = l.crew.sort((a, b) => a.top - b.top).map(c => c.txt).reduce((s, x) => !s ? x : /\p{L}-$/u.test(s) ? s + x : s + " " + x, "");
      const people = txt.split(/\s+-\s+/).map(s => s.trim()).filter(Boolean);
      flights.push(Object.assign(l, {people, crewText: txt}));
    });
  });
  return {from, to, who, flights, total};
}
export function carnetRecords(p){
  if (!p.from) throw new Error("Période du carnet de vol introuvable");
  const ym = p.from.slice(0, 7), y0 = +p.from.slice(0, 4), m0 = +p.from.slice(5, 7), warn = [], flights = [];
  const me = (p.who.name || "").toUpperCase();
  let sum = 0;
  p.flights.forEach(l => {
    const d = `${y0}-${String(m0).padStart(2, "0")}-${l.dd}`;
    if (!/^[A-Z]{3}$/.test(l.o || "") || !/^[A-Z]{3}$/.test(l.a || "") || !l.h1 || !l.h2) { warn.push(`${l.dd}/${String(m0).padStart(2, "0")} ${l.v} : ligne illisible`); return; }
    if (l.durs.length < 7 || l.durs.some(x => x == null)) { warn.push(`${fdm(d)} ${l.v} : heures de vol illisibles`); return; }
    const [, , jc, jo, nc, no, tot] = l.durs;
    const m = blockMinutes(d, l.h1, l.h2);
    if (Math.abs(tot - m) > 1) warn.push(`${fdm(d)} ${l.v} : total ${tot} min ≠ horaire ${l.h1}–${l.h2}`);
    if (Math.abs(jc + jo + nc + no - tot) > 1) warn.push(`${fdm(d)} ${l.v} : jour + nuit ≠ total`);
    sum += tot;
    const role = jc + nc > 0 ? "CDB" : jo + no > 0 ? "OPL" : "";
    // CDB : premier nom de l'équipage, sauf si c'est moi (je suis alors CDB : pas de nom à enregistrer)
    const first = l.people[0] || "", firstIsMe = me && first.toUpperCase().startsWith(me);
    const cdb = role === "CDB" || firstIsMe ? "" : first ? surname(first) : "";
    flights.push({d, v: l.v, o: l.o, a: l.a, h1: l.h1, h2: l.h2, im: l.im, ty: typeFromReg(l.im) || l.ty, cdb, role, night: nc + no, tot, crew: l.crewText});
  });
  const check = {sum, total: p.total, ok: p.total == null ? !warn.length : Math.abs(sum - p.total) <= 1};
  if (p.total != null && !check.ok) warn.push(`Somme des étapes ${sum} min ≠ total de la synthèse ${p.total} min`);
  return {kind: "carnet", ym, from: p.from, to: p.to, who: p.who, flights, warn, check};
}

// Lecture d'un PDF : relevé d'activité mensuel, carnet de vol mensuel ou relevé d'hôtels annuel (reconnu tout seul)
export async function readPdfAny(pdfjs, arrayBuffer){
  const pages = await pdfToPages(pdfjs, new Uint8Array(arrayBuffer));
  const all = pages.map(p => p.text).join(" ");
  if (isCarnetText(all)) {
    const rec = carnetRecords(parseCarnetPages(pages));
    if (!rec.flights.length) throw new Error("carnet de vol reconnu, mais aucune étape lue");
    return {kind: "carnet", rec};
  }
  // Le relevé d'hôtels a lui aussi des dates de période en en-tête : on le reconnaît d'abord à son titre
  if (/relev[ée]s? d['’ ]?h[ôo]tels/i.test(all)) {
    const hr = parseHotelPages(pages);
    if (!hr.nights.length) throw new Error("relevé d'hôtels reconnu, mais aucune nuitée lue");
    const sum = Math.round(hr.nights.reduce((x, n) => x + (n.cost || 0), 0) * 100) / 100;
    return {kind: "hotels", ...hr, sum, ok: hr.total == null || Math.abs(sum - hr.total) < 0.02};
  }
  const parsed = parsePages(pages);
  if (parsed.from) return {kind: "activite", parsed, rec: releveRecords(parsed)};
  const hr = parseHotelPages(pages);
  if (hr.nights.length) return {kind: "hotels", ...hr, sum: hr.nights.reduce((x, n) => x + (n.cost || 0), 0), ok: true};
  throw new Error("ni relevé d'activité ni relevé d'hôtels reconnu");
}
export async function readRelevePdf(pdfjs, arrayBuffer){
  const pages = await pdfToPages(pdfjs, new Uint8Array(arrayBuffer));
  const parsed = parsePages(pages);
  return {parsed, rec: releveRecords(parsed)};
}
