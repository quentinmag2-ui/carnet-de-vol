// Lecture du planning : fichier calendrier (.ics) ou texte copié par le raccourci iPhone (#EVT … #FIN),
// puis reconnaissance des vols, hôtels, séances simulateur et jours (OFF, congés, réserve…).
import { parisParts, parisToMs, normType } from "./core.js";

// ---------- lecture des formats ----------
function unfoldIcs(t){ return t.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, ""); }
function icsUnescape(v){ return v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\"); }
function icsDate(prop, val){
  const m = val.match(/^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?$/); if (!m) return null;
  const d = `${m[1]}-${m[2]}-${m[3]}`;
  if (!m[4]) return {allDay: true, ms: parisToMs(d, "00:00")};
  const h = `${m[4]}:${m[5]}`;
  if (m[7]) return {ms: Date.parse(`${d}T${h}:${m[6]||"00"}Z`)};
  return {ms: parisToMs(d, h)};            // heure locale (TZID ou flottante) : traitée comme heure de Paris
}
export function parseIcs(text){
  const out = []; const lines = unfoldIcs(text).split("\n"); let ev = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { ev = {}; continue; }
    if (line === "END:VEVENT") { if (ev && ev.start) out.push(ev); ev = null; continue; }
    if (!ev) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const head = line.slice(0, i), val = line.slice(i + 1), name = head.split(";")[0].toUpperCase();
    if (name === "SUMMARY") ev.title = icsUnescape(val).trim();
    else if (name === "DESCRIPTION") ev.notes = icsUnescape(val);
    else if (name === "LOCATION") ev.loc = icsUnescape(val);
    else if (name === "DTSTART") { const r = icsDate(head, val.trim()); if (r) { ev.start = r.ms; ev.allDay = !!r.allDay; } }
    else if (name === "DTEND") { const r = icsDate(head, val.trim()); if (r) ev.end = r.ms; }
    else if (name === "STATUS") ev.status = val.trim().toUpperCase();
  }
  return out.filter(e => e.status !== "CANCELLED");
}
// Texte produit par le raccourci iPhone : blocs #EVT / titre / début / fin / notes… / #FIN
function parseIsoLoose(s){
  s = (s || "").trim(); if (!s) return null;
  let ms = Date.parse(s); if (!isNaN(ms)) return ms;
  const m = s.match(/^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)/); if (m) return parisToMs(`${m[1]}-${m[2]}-${m[3]}`, `${m[4]}:${m[5]}`);
  const f = s.match(/^(\d\d?)\/(\d\d?)\/(\d{4})\D+(\d\d?)[:h](\d\d)/); if (f) return parisToMs(`${f[3]}-${f[2].padStart(2,"0")}-${f[1].padStart(2,"0")}`, `${f[4].padStart(2,"0")}:${f[5]}`);
  return null;
}
export function parseShortcut(text){
  const out = [], bad = [];
  text.replace(/\r\n/g, "\n").split(/^#EVT\s*$/m).slice(1).forEach(block => {
    const body = block.split(/^#FIN\s*$/m)[0].replace(/^\n+/, "");
    const L = body.split("\n");
    const ev = {title: (L[0] || "").trim(), start: parseIsoLoose(L[1]), end: parseIsoLoose(L[2]), notes: L.slice(3).join("\n")};
    if (ev.title && ev.start != null && ev.end != null) out.push(ev); else if (ev.title) bad.push(ev.title);
  });
  return {events: out, bad};
}

// ---------- reconnaissance des événements du planning ----------
const titleCase = s => s.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
function crewCdb(notes){
  for (const line of (notes || "").split(/\r?\n/)) {
    const m = line.match(/^\s*[A-Z0-9]{2,4}\s*:\s*([A-ZÀ-Ÿ' \-]+?)\s*(?:\([^)]*\))?\s*,?\s*((?:[A-Z]{1,3},\s*)*)(CDB)\s*$/);
    if (m) { const t = m[1].trim().split(/\s+/); return titleCase(t.length > 1 ? t.slice(0, -1).join(" ") : t[0]); }
  }
  return "";
}
function classifyBase(ev){
  const t = (ev.title || "").replace(/\s+/g, " ").trim(), notes = ev.notes || "";
  if (ev.allDay || ev.end == null || ev.end <= ev.start) return null;
  let m = t.match(/^([A-Z0-9]{2}\s?\d{1,4}[A-Z]?)\s+([A-Z]{3})\s*[-–→]\s*([A-Z]{3})\b/);
  if (m && !/^(MEP|DH|DHD|TAXI|TRAIN)\b/i.test(t)) {
    const ac = (notes.match(/^\s*AC\s*:\s*([A-Z0-9]{2,4})/m) || [])[1] || "";
    const im = (notes.match(/\b(F-[A-Z]{4})\b/) || [])[1] || "";
    return {kind:"flight", v: m[1].replace(/\s/g, ""), o: m[2], a: m[3], ty: normType(ac), im, c: crewCdb(notes), src:"Planning"};
  }
  m = t.match(/^(?:✈️\s*)?Flight:\s*([A-Z]{3})\s*[→\-–]\s*([A-Z]{3})/i);
  if (m) {
    const duty = (notes.match(/Duty Type:\s*([^\n]+)/i) || [])[1] || "Working";
    if (!/work/i.test(duty)) return null;
    return {kind:"flight", v: ((notes.match(/Flight Number:\s*([A-Z0-9]+)/i) || [])[1] || ""), o: m[1], a: m[2], ty:"", c:"", src:"Crew Access"};
  }
  m = t.match(/^H[ôo]tel\s+(.+?)\s*\(([A-Z]{3})\)\s*$/i);
  if (m) { let name = m[1].trim(); if (name.slice(0, 4) === m[2] + " ") name = name.slice(4); return {kind:"hotel", ap: m[2], h: titleCase(name)}; }
  if (/^simu(lateur)?\b/i.test(t)) {
    const lm = t.match(/\s([A-Z]{3})\s*$/); const loc = lm ? lm[1] : ((notes.match(/FROM\s*:\s*([A-Z]{3})/) || [])[1] || "—");
    const label = lm ? t.slice(0, -lm[0].length).trim() : t;
    const k = /qualifi|test|skill|qt\b/i.test(label) ? "Qualification de type" : /[ée]valuation|training|terrain|place droite|recurrent|r[ée]current|ecp|cct|lpc|opc/i.test(label) ? "Récurrent" : "Autre";
    return {kind:"sim", t: label.replace(/^simu(lateur)?\s+/i, "") || label, l: loc, k};
  }
  return null;
}


// Compléments : formation Crew Access (simulateur) et événements « journée entière » (OFF, congés, réserve…).
const simKind = label => /qualifi|\bqt\b|skill test/i.test(label) ? "Qualification de type"
  : /solidair/i.test(label) ? "Autre"
  : /[ée]valuation|[ée]val\b|training|terrain|place droite|recurrent|r[ée]current|\becp\b|\bcct\b|\blpc\b|\bopc\b|\bse\d/i.test(label) ? "Récurrent" : "Autre";
export function dayCategory(title){
  const t = (title || "").toUpperCase();
  if (/\bOFF\b|\bREPOS\b|\bRPC\b|\bJOUR BONUS/.test(t)) return "off";
  if (/CONG[ÉE]S?|\bCP\b|\bCA\b|VACANCES/.test(t)) return "cp";
  if (/MALADIE|\bARR[ÊE]T\b/.test(t)) return "arret";
  if (/R[ÉE]SERVE|\bRES\b|\bDISPO\b|ASTREINTE/.test(t)) return "res";
  if (/STAGE|\bCOURS\b|\bSOL\b|BRIEFING|CEMPN|S[ÉE]CURIT[ÉE]|FEU FUM|\bCRM\b|E-?LEARNING|VISITE M[ÉE]DICALE|ENTRETIEN/.test(t)) return "sol";
  return null;
}
export function classify(ev){
  const t = (ev.title || "").replace(/\s+/g, " ").trim(), notes = ev.notes || "";
  if (ev.allDay || ev.end == null || ev.end <= ev.start) { const k = dayCategory(t); return k ? {kind: "day", k} : null; }
  const m = t.match(/^(?:💺\s*)?Training\b/i);
  if (m) {
    const desc = ((notes.match(/Training Description:\s*([^\n]+)/i) || [])[1] || "").trim();
    if (/simu|sim\b|ffs|fbs/i.test(desc + " " + t)) return {kind: "sim", t: desc || "Simulateur", l: ((notes.match(/(?:Location|Lieu):\s*([A-Z]{3})/i) || [])[1] || "—"), k: simKind(desc)};
    return {kind: "day", k: "sol"};
  }
  const c = classifyBase(ev);
  if (c && c.kind === "sim") c.k = simKind(c.t);
  if (!c) { const k = dayCategory(t); return k ? {kind: "day", k} : null; }
  return c;
}

// Événements → enregistrements du carnet. Les vols futurs (pas encore terminés) ne sont jamais importés.
export function calendarRecords(events, now = Date.now()){
  const flights = [], hotels = [], sims = [], days = {}; let ignored = 0;
  events.forEach(ev => {
    const c = classify(ev); if (!c) { ignored++; return; }
    if (c.kind === "day") { const d = parisParts(ev.start).d; (days[d] ||= new Set()).add(c.k); return; }
    const s = parisParts(ev.start), e = parisParts(ev.end), m = Math.round((ev.end - ev.start) / 6e4);
    if (c.kind === "flight") { if (ev.end > now) return;
      flights.push({d: s.d, v: c.v, o: c.o, a: c.a, h1: s.h, h2: e.h, ty: c.ty, im: c.im || "", c: c.c, s: c.src, recent: now - ev.end < 24 * 3600e3}); }
    else if (c.kind === "hotel") hotels.push({d: s.d, s: s.h, e: e.h, de: e.d, ap: c.ap, h: c.h});
    else sims.push({d: s.d, h1: s.h, h2: e.h, t: c.t, l: c.l, k: c.k, m});
  });
  // doublons (planning + Crew Access, ou même vol deux fois) : même jour, même heure de départ, même trajet
  const fl = {}; flights.forEach(f => { const k = f.d + "|" + f.h1 + "|" + f.o + "|" + f.a; const p = fl[k];
    fl[k] = p ? Object.assign({}, p, {v: p.v || f.v, ty: p.ty || f.ty, im: p.im || f.im, c: p.c || f.c, s: p.s === f.s ? p.s : p.s + " + " + f.s}) : f; });
  const ho = {}; hotels.forEach(h => ho[h.d + "|" + h.ap] = h);
  const si = {}; sims.forEach(x => si[x.d + "|" + x.h1 + "|" + x.t] = x);
  const dd = {}; Object.entries(days).forEach(([d, set]) => dd[d] = [...set]);
  return {flights: Object.values(fl), hotels: Object.values(ho), sims: Object.values(si), days: dd, ignored};
}
