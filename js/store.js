// Données du carnet, enregistrées dans le téléphone (localStorage du navigateur ou de l'app écran d'accueil),
// et fusion des imports. Règle d'or (docs/REGLES.md) : un import n'efface jamais rien ; il ajoute, complète
// ou corrige. Le relevé d'activité l'emporte sur le calendrier. Les éléments écartés ne reviennent jamais.
import { computeFlight, typeFromReg, addDays, hhmmToMin } from "./core.js";

export const K_DATA = "carnetHop.data.v2", K_SET = "carnetHop.settings.v2";
export const lsGet = (k, dflt) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? dflt : v; } catch (e) { return dflt; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

export const emptyDb = () => ({flights: [], hotels: [], sims: [], trans: [], days: {}, dayCal: {}, excluded: {flights: [], hotels: []}, releves: {}, imported: null});
export const defaultSettings = () => ({name: "", bases: [["0000-01-01", "CDG"]], home: "", defaultType: "", seriesStart: "", simCountFrom: "", airports: {}, saved: false});

export function loadDb(){ const d = Object.assign(emptyDb(), lsGet(K_DATA, {})); d.excluded = Object.assign({flights: [], hotels: []}, d.excluded || {}); return d; }
export function saveDb(db){ db.imported = new Date().toISOString(); sortDb(db); return lsSet(K_DATA, db); }
export function loadSettings(){ return Object.assign(defaultSettings(), lsGet(K_SET, {})); }
export function saveSettings(s){ return lsSet(K_SET, s); }

const srt = (a, b) => (a.d + (a.h1 || a.s || "")).localeCompare(b.d + (b.h1 || b.s || ""));
function sortDb(db){ ["flights", "hotels", "sims", "trans"].forEach(k => db[k].sort(srt)); }
const addSrc = (s, x) => !s ? x : s.split(" + ").includes(x) ? s : s + " + " + x;
const isExcludedFlight = (db, f) => db.excluded.flights.some(([d, v]) => d === f.d && v === f.v);
const isExcludedHotel = (db, h) => db.excluded.hotels.some(([d, ap]) => d === h.d && ap === h.ap);
const relevéCovers = (db, d) => !!db.releves[d.slice(0, 7)];

// Retrouve dans le carnet le même vol : même jour, même trajet et départ à moins de 3 h ; à défaut même jour et même numéro.
function findFlight(list, f){
  const same = list.filter(x => x.d === f.d && x.o === f.o && x.a === f.a);
  if (same.length) { const best = same.sort((a, b) => Math.abs(hhmmToMin(a.h1) - hhmmToMin(f.h1)) - Math.abs(hhmmToMin(b.h1) - hhmmToMin(f.h1)))[0];
    if (Math.abs(hhmmToMin(best.h1) - hhmmToMin(f.h1)) <= 180) return best; }
  return f.v ? list.find(x => x.d === f.d && x.v && x.v.replace(/[A-Z]$/, "") === f.v.replace(/[A-Z]$/, "") && x.o === f.o) || null : null;
}

// ---------- import du calendrier (fichier .ics ou raccourci) ----------
export function mergeCalendar(db, recs, settings){
  const r = {added: 0, updated: 0, hotels: 0, sims: 0, days: 0, skipped: 0};
  recs.flights.forEach(f => {
    if (isExcludedFlight(db, f)) { r.skipped++; return; }
    const ex = findFlight(db.flights, f);
    if (ex) {
      const fromReleve = /Relevé/.test(ex.s || "");
      if (!fromReleve && (ex.h1 !== f.h1 || ex.h2 !== f.h2)) { ex.h1 = f.h1; ex.h2 = f.h2; ex.pg = 0; computeFlight(ex); r.updated++; }
      if (!ex.v && f.v) ex.v = f.v;
      if (!ex.c && f.c) ex.c = f.c;
      if (!ex.ty && f.ty) ex.ty = f.ty;
      ex.s = addSrc(ex.s, f.s);
      return;
    }
    // Mois déjà couvert par un relevé : le relevé fait foi, un vol qu'il ne contient pas n'est pas ajouté
    if (relevéCovers(db, f.d)) { r.skipped++; return; }
    const n = computeFlight({d: f.d, v: f.v, o: f.o, a: f.a, h1: f.h1, h2: f.h2, ty: f.ty || settings.defaultType || "", im: f.im || "", c: f.c || "", s: f.s, pg: f.recent ? 1 : 0});
    db.flights.push(n); r.added++;
  });
  recs.hotels.forEach(h => {
    if (isExcludedHotel(db, h)) return;
    // même nuit au même endroit ; à défaut, nuit du relevé d'activité dont l'escale n'était que déduite
    const ex = db.hotels.find(x => x.d === h.d && x.ap === h.ap) || db.hotels.find(x => x.d === h.d && x.src === "Relevé");
    const n = Math.max(0, Math.round((Date.parse(h.de) - Date.parse(h.d)) / 864e5));
    if (ex) { Object.assign(ex, {s: h.s, e: h.e, de: h.de, n, h: h.h || ex.h}); if (!/Relevé hôtels/.test(ex.src || "")) ex.ap = h.ap; ex.src = addSrc(ex.src, "Calendrier"); return; }
    if (relevéCovers(db, h.d)) return;               // pas d'hôtel au relevé ce jour-là : pas d'hôtel
    db.hotels.push(Object.assign({}, h, {n, src: "Calendrier"})); r.hotels++;
  });
  recs.sims.forEach(s => {
    if (db.sims.some(x => x.d === s.d && x.h1 === s.h1 && x.t === s.t)) return;
    const rel = db.sims.find(x => x.d === s.d && x.s === "Relevé");
    if (rel) { Object.assign(rel, s, {s: "Relevé + Calendrier"}); return; }
    db.sims.push(Object.assign({}, s, {s: "Calendrier"})); r.sims++;
  });
  // Jours (OFF, congés, réserve…) : seulement là où aucun relevé ne fait foi
  Object.entries(recs.days).forEach(([d, ks]) => { if (relevéCovers(db, d)) return; db.dayCal[d] = ks; r.days++; });
  return r;
}

// Dernière escale atteinte au plus tard ce jour-là (pour placer une nuit d'hôtel sans vol ce jour-là)
export function lastArrivalBefore(db, d){
  let best = null; db.flights.forEach(f => { if (f.d <= d && (!best || f.d + f.h1 > best.d + best.h1)) best = f; });
  return best ? best.a : "";
}

// ---------- import d'un relevé d'activité ----------
// Étape 1 : comparer le relevé au carnet, sans rien modifier. Renvoie ce qui sera mis à jour et les choix à faire.
export function planReleve(db, rec){
  const inMonth = x => x.d.slice(0, 7) === rec.ym;
  const pool = db.flights.filter(inMonth), matched = new Set(), upd = [], add = [], known = [];
  rec.flights.forEach(f => {
    const ex = findFlight(pool.filter(x => !matched.has(x)), f);
    if (ex) { matched.add(ex); upd.push([ex, f]); return; }
    if (isExcludedFlight(db, f)) { known.push(f); return; }
    add.push(f);
  });
  const orphans = pool.filter(x => !matched.has(x));                    // vols du carnet absents du relevé
  const relHot = new Set(rec.hotels.map(h => h.d));
  const hotelsGone = db.hotels.filter(h => inMonth(h) && !relHot.has(h.d) && !/Relevé/.test(h.src || ""));
  return {rec, upd, add, orphans, hotelsGone, known};
}
// Étape 2 : appliquer, avec les choix de l'utilisateur (vols à ajouter, vols à retirer, hôtels à retirer).
export function applyReleve(db, plan, choice, settings){
  const {rec} = plan, r = {updated: 0, added: 0, removed: 0, hotels: 0, hotelsRemoved: 0, sims: 0};
  plan.upd.forEach(([ex, f]) => {
    Object.assign(ex, {h1: f.h1, h2: f.h2, im: f.im || ex.im || "", v: ex.v || f.v, pg: 0});
    ex.ty = typeFromReg(ex.im) || ex.ty || settings.defaultType || "";
    ex.s = addSrc(ex.s, "Relevé"); computeFlight(ex); r.updated++;
  });
  plan.add.forEach((f, i) => {
    if (choice.add && choice.add[i] === false) { db.excluded.flights.push([f.d, f.v]); return; }
    db.flights.push(computeFlight({d: f.d, v: f.v, o: f.o, a: f.a, h1: f.h1, h2: f.h2, ty: f.ty || settings.defaultType || "", im: f.im, c: "", s: "Relevé", pg: 0})); r.added++;
  });
  plan.orphans.forEach((f, i) => {
    if (!(choice.remove && choice.remove[i])) return;
    db.excluded.flights.push([f.d, f.v]); db.flights.splice(db.flights.indexOf(f), 1); r.removed++;
  });
  plan.hotelsGone.forEach((h, i) => {
    if (choice.hotels && choice.hotels[i] === false) return;
    db.excluded.hotels.push([h.d, h.ap]); db.hotels.splice(db.hotels.indexOf(h), 1); r.hotelsRemoved++;
  });
  rec.hotels.forEach(h => {
    const ex = db.hotels.find(x => x.d === h.d);
    if (ex) { ex.src = addSrc(ex.src, "Relevé"); if (!ex.ap) ex.ap = h.ap; return; }
    const ap = h.ap || lastArrivalBefore(db, h.d);
    db.hotels.push(Object.assign({}, h, {ap})); r.hotels++;
  });
  rec.sims.forEach(s => { if (db.sims.some(x => x.d === s.d)) return; db.sims.push(Object.assign({}, s)); r.sims++; });
  // Jours du mois : le relevé fait foi
  for (let d = rec.from; d <= rec.to; d = addDays(d, 1)) { if (rec.days[d]) db.days[d] = rec.days[d]; else delete db.days[d]; delete db.dayCal[d]; }
  db.releves[rec.ym] = {from: rec.from, to: rec.to, ok: rec.check.ok, sum: rec.check.sum, total: rec.check.total, flights: rec.flights.length, at: new Date().toISOString().slice(0, 10)};
  return r;
}

// ---------- import du relevé d'hôtels annuel ----------
// Il fait foi pour l'escale, le nom de l'hôtel et le coût ; une nuit qu'il contient compte toujours, même à la base.
export function applyHotelReleve(db, hr){
  const r = {updated: 0, added: 0, byYear: {}};
  hr.nights.forEach(nt => {
    r.byYear[nt.d.slice(0, 4)] = (r.byYear[nt.d.slice(0, 4)] || 0) + (nt.cost || 0);
    db.excluded.hotels = db.excluded.hotels.filter(([d, ap]) => !(d === nt.d && ap === nt.ap));
    const ex = db.hotels.find(x => x.d === nt.d && x.ap === nt.ap) || db.hotels.find(x => x.d === nt.d && !/Relevé hôtels/.test(x.src || "") && (x.src === "Relevé" || !x.ap));
    if (ex) { Object.assign(ex, {ap: nt.ap, h: nt.h || ex.h, cost: nt.cost}); if (!ex.n && !ex.s) ex.n = 1; /* un repos de jour du planning (horaires connus) reste un repos de jour */ ex.src = addSrc(ex.src, "Relevé hôtels"); r.updated++; return; }
    db.hotels.push({d: nt.d, s: "", e: "", de: addDays(nt.d, 1), ap: nt.ap, h: nt.h, n: 1, cost: nt.cost, src: "Relevé hôtels"}); r.added++;
  });
  return r;
}

// ---------- sauvegarde ----------
export const backupObject = (db, settings) => ({carnetHop: 2, exported: new Date().toISOString(), settings, data: db});
export function restoreBackup(obj){
  if (!obj || !obj.carnetHop || !obj.data) throw new Error("Ce fichier n'est pas une sauvegarde du carnet.");
  const db = Object.assign(emptyDb(), obj.data);
  if (obj.carnetHop === 1) { db.flights = db.flights || []; db.hotels = db.hotels || []; db.sims = db.sims || []; }
  return {db, settings: Object.assign(defaultSettings(), obj.settings || {})};
}
