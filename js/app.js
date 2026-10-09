// Carnet de vol HOP! — application web. Tout est calculé et enregistré sur le téléphone : rien n'est envoyé.
import "./polyfills.js";   // en premier : compléments pour les anciennes versions de Safari
import { AIRPORTS, COUNTRY, parisParts, parisToMs, addDays, computeFlight, normType } from "./core.js";
import { parseIcs, parseShortcut, calendarRecords } from "./calendar.js";
import { readPdfAny } from "./releve.js";
import { loadDb, saveDb, loadSettings, saveSettings, emptyDb, mergeCalendar, planReleve, applyReleve, backupObject, restoreBackup, lsGet, lsSet, K_DATA, lastArrivalBefore, applyHotelReleve, isTrainingTransit } from "./store.js";

export const VERSION = "1.5.0";
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const MO = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
const MOL = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const fdate = d => { const [y,m,j] = d.split("-"); return `${+j} ${MO[+m-1]} ${y.slice(2)}`; };
const fmonth = ym => `${MOL[+ym.slice(5)-1]} ${ym.slice(0,4)}`;

// ---------- données et réglages ----------
const SET = loadSettings();
Object.entries(SET.airports || {}).forEach(([k, v]) => { if (!AIRPORTS[k]) AIRPORTS[k] = v; });   // aéroports ajoutés par l'utilisateur
const DB = loadDb();
const nowParts = parisParts(Date.now());
const apMap = () => { const o = {}; Object.entries(AIRPORTS).forEach(([k, v]) => o[k] = {c:v[0], p:v[1], la:v[2], lo:v[3]});
  [...DB.flights.flatMap(f => [f.o, f.a]), ...DB.hotels.map(h => h.ap)].forEach(k => { if (k && !o[k]) o[k] = {c:k, p:"??", la:null, lo:null}; }); return o; };
// Simulateur : une seule séance par jour (événements du même jour regroupés), comptée 4 h.
function normSims(arr){ const by = {}, out = [];
  [...arr].sort((a, b) => (a.d + a.h1).localeCompare(b.d + b.h1)).forEach(x => { const o = by[x.d];
    if (!o) { const n = Object.assign({}, x, {m: 240}); by[x.d] = n; out.push(n); return; }
    if (x.h1 < o.h1) o.h1 = x.h1; if (x.h2 > o.h2) o.h2 = x.h2; o.t += " + " + x.t.charAt(0).toLowerCase() + x.t.slice(1);
    if (o.k !== "Récurrent" && x.k === "Récurrent") o.k = x.k; });
  return out; }
// Comptées : séances récurrentes (évaluations, trainings…) à partir de la date réglée (fin de la qualification de type).
// La QT et les simulateurs non certifiés (ex. Solidair) sont listés sans être comptés.
const simCounted = s => s.k === "Récurrent" && (!SET.simCountFrom || s.d >= SET.simCountFrom);
// Vols pour aller à Châteauroux ou en revenir : pas comptés (écartés pour de bon) ; prorogations de QT : comptées
{ let ch = 0;
  DB.flights.filter(isTrainingTransit).forEach(f => { DB.excluded.flights.push([f.d, f.v]); DB.flights.splice(DB.flights.indexOf(f), 1); ch++; });
  DB.sims.forEach(s => { if (/prorog/i.test(s.t || "") && s.k !== "Récurrent") { s.k = "Récurrent"; ch++; } });
  if (ch) saveDb(DB); }
// Types avion : seulement E70 et E90 (les E75 / E95 venus du planning sont regroupés)
{ let ch = 0; DB.flights.forEach(f => { const t = normType(f.ty); if (t !== (f.ty || "")) { f.ty = t; ch++; } }); if (!["", "E70", "E90"].includes(SET.defaultType)) SET.defaultType = normType(SET.defaultType); if (ch) saveDb(DB); }
// Hôtels des relevés importés avant la v1.2 sans escale : on la retrouve d'après les vols
if (DB.hotels.some(h => !h.ap)) { let fixed = 0; DB.hotels.forEach(h => { if (!h.ap) { const a = lastArrivalBefore(DB, h.d); if (a) { h.ap = a; fixed++; } } }); if (fixed) saveDb(DB); }
// Nuits d'hôtel comptées : escale connue, jamais à l'aéroport du domicile ; à la base, seulement si une nuit d'hôtel
// y est confirmée par le relevé d'hôtels ou par le planning (le relevé d'activité seul ne dit pas où était l'hôtel).
const baseOn = d => { let b = SET.bases[0][1]; SET.bases.forEach(([from, v]) => { if (d >= from) b = v; }); return b; };
const atBase = h => h.ap === baseOn(h.d);
const hotelConfirmed = h => /Calendrier|Relevé hôtels/.test(h.src || "") || (!h.src && !!h.h);
const countedHotel = h => !!h.ap && !(SET.home && h.ap === SET.home) && (!atBase(h) || hotelConfirmed(h));
const isDecoucher = h => countedHotel(h) && !atBase(h) && h.n > 0;
// MEP = avion ou train uniquement (les trajets en voiture ou taxi de la compagnie ne sont pas gardés)
if ((DB.meps || []).some(x => x.mode === "Voiture")) { DB.meps = DB.meps.filter(x => x.mode !== "Voiture"); saveDb(DB); }
const D = {gen: `${nowParts.d} ${nowParts.h}`, flights: DB.flights, meps: DB.meps || [], sims: normSims(DB.sims), hotels: DB.hotels.filter(countedHotel), hotelsAll: DB.hotels, trans: DB.trans,
  days: Object.assign({}, DB.dayCal, DB.days), ap: apMap()};
const HAS_DATA = D.flights.length > 0;
const HUB = (() => { let b = SET.bases[0][1]; SET.bases.forEach(([from, v]) => { if (nowParts.d >= from) b = v; }); return AIRPORTS[b] ? b : "CDG"; })();   // base du moment : centre de la carte
// Étapes enregistrées quand un de leurs aéroports était inconnu : recalculées dès qu'il figure dans la table
{ let ch = 0; DB.flights.forEach(f => { if (f.o !== f.a && !f.nm && AIRPORTS[f.o] && AIRPORTS[f.a]) { computeFlight(f); ch++; } }); if (ch) saveDb(DB); }

// ---------- messages après rechargement ----------
const flash = t => { try { sessionStorage.setItem("carnetHop.flash", t); } catch (e) {} };
function reloadPage(msg){ if (msg) flash(msg); try { location.reload(); } catch (e) {} }
function showFlash(){ let t = null; try { t = sessionStorage.getItem("carnetHop.flash"); sessionStorage.removeItem("carnetHop.flash"); } catch (e) {}
  if (!t) return; const n = $("#toast"); n.textContent = t; n.hidden = false; setTimeout(() => { n.hidden = true; }, 7000); }

// ---------- téléphone : iPhone ou Android ----------
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const ANDROID = /Android/i.test(navigator.userAgent);
const HOWTO_ANDROID = `<details class="howto"><summary>Android : exporter son planning en fichier .ics</summary>
  <ol>
    <li>Si ton planning arrive dans <b>Google Agenda</b> : sur un ordinateur, ouvre <b>calendar.google.com</b> → roue dentée → <b>Paramètres</b> → <b>Importer et exporter</b> → <b>Exporter</b>. Tu obtiens un fichier .zip.</li>
    <li>Ouvre ce .zip (app Fichiers de Google ou ordinateur) : il contient un fichier .ics par agenda. Garde celui du planning HOP! et mets-le sur ton téléphone (Drive, Téléchargements…).</li>
    <li>Si ton planning est dans un autre agenda du téléphone, une app d'export de calendrier en .ics (Play Store) fait la même chose.</li>
    <li>Dans le carnet : « Importer » → <b>Fichier .ics</b> → choisis le fichier. Refais-le de temps en temps : les nouveaux vols s'ajoutent, rien n'est effacé.</li>
  </ol></details>`;

// ---------- panneau « Importer et réglages » ----------
const pending = {plans: []};   // relevés lus, en attente de validation
const firstMonth = p => !p.upd.length && !p.orphans.length;   // rien dans le carnet ce mois-là : tout s'ajoute, sans question
const nChoices = p => (firstMonth(p) ? 0 : p.add.length) + p.orphans.length + p.hotelsGone.length;
function releveCard(p, i){
  const r = p.rec, c = r.check, done = DB.releves[r.ym];
  const nChoix = nChoices(p);
  // Fiche repliée : un coup d'œil suffit ; elle s'ouvre d'elle-même si la lecture est à vérifier
  let h = `<details class="rcard"${!c.ok || r.warn.length ? " open" : ""}><summary class="rhead"><b>Relevé ${fmonth(r.ym)}</b>${c.ok ? '<span class="pill ok">total vérifié ✓</span>' : '<span class="pill warn">total à vérifier</span>'}<span class="pill">${r.flights.length} vols${(r.meps||[]).length ? ` · ${r.meps.length} MEP` : ""}</span>${nChoix ? `<span class="pill acc">${nChoix} choix</span>` : ""}${done ? '<span class="pill">mise à jour</span>' : ""}</summary>`;
  h += `<div class="summary small"><span><b>${r.flights.length}</b> vols au relevé</span><span><b>${p.upd.length}</b> déjà dans le carnet, heures réelles et immatriculations reprises</span><span><b>${r.hotels.length}</b> nuits d'hôtel</span><span><b>${r.sims.length}</b> simu</span>${(r.meps||[]).length ? `<span><b>${r.meps.length}</b> MEP</span>` : ""}${(p.mepDup||[]).length ? `<span><b>${p.mepDup.length}</b> vol${p.mepDup.length>1?"s":""} du planning en fait en MEP</span>` : ""}<span>HBB <b>${c.sum}</b> h${c.total != null ? ` / total ${c.total} h` : ""}</span></div>`;
  if (p.add.length && firstMonth(p)) h += `<div class="hint">${p.add.length} vols ajoutés au carnet (premier import de ce mois).</div>`;
  else if (p.add.length) h += `<div class="rsec"><div class="rt">Vols du relevé absents du carnet : à ajouter ?</div>${p.add.map((f, j) => `<label class="opt"><input type="checkbox" data-pa="${i}:${j}" checked> <span class="mono">${fdate(f.d)} ${esc(f.v)} ${f.o}→${f.a} ${f.h1}–${f.h2}${f.im ? " · " + esc(f.im) : ""}</span></label>`).join("")}<div class="hint">Décoche ceux que tu ne veux pas (vol en double commande, observation…) : ils ne seront plus jamais proposés.</div></div>`;
  if (p.orphans.length) h += `<div class="rsec"><div class="rt">Vols du carnet absents du relevé : à retirer ?</div>${p.orphans.map((f, j) => `<label class="opt"><input type="checkbox" data-po="${i}:${j}"> <span class="mono">${fdate(f.d)} ${esc(f.v)} ${f.o}→${f.a} ${f.h1}–${f.h2}</span></label>`).join("")}<div class="hint">Souvent un vol en place passager (MEP) ou annulé. Coche pour le retirer.</div></div>`;
  if (p.hotelsGone.length) h += `<div class="rsec"><div class="rt">Hôtels du planning sans hôtel au relevé : retirés</div>${p.hotelsGone.map((x, j) => `<label class="opt"><input type="checkbox" data-ph="${i}:${j}"${c.ok ? " checked" : ""}> <span class="mono">${fdate(x.d)} ${esc(x.ap)} ${esc(x.h || "")}</span></label>`).join("")}<div class="hint">Un séjour sans hôtel compagnie au relevé n'était pas une nuit d'hôtel (nuit à la maison).${c.ok ? " Décoche pour le garder." : " Le total du relevé n'est pas vérifié : rien n'est coché par prudence."}</div></div>`;
  if (r.warn.length) h += `<div class="rsec"><div class="rt">Points de lecture à vérifier</div><ul class="checks">${r.warn.map(w => `<li>${esc(w)}</li>`).join("")}</ul></div>`;
  return h + `</details>`;
}
function setupHtml(){
  const rows = SET.bases.map(([from, b], i) => `<div class="setrow"><label>${i === 0 ? "Base" : "À partir du"} ${i === 0 ? "" : `<input type="date" data-bf="${i}" value="${from}">`}</label><input class="fin ap" maxlength="3" data-bb="${i}" value="${esc(b)}" aria-label="Code de la base">${i ? `<button class="chip" type="button" data-bdel="${i}">Retirer</button>` : ""}</div>`).join("");
  const rel = Object.keys(DB.releves).sort();
  const info = DB.flights.length ? `<div class="summary small"><span><b>${DB.flights.length}</b> étapes</span><span><b>${DB.hotels.length}</b> hôtels</span><span><b>${DB.sims.length}</b> séances simu</span><span><b>${DB.trans.length}</b> trajets</span></div>` : "";
  const apText = Object.entries(SET.airports || {}).map(([k, v]) => `${k};${v[0]};${v[1]};${v[2]};${v[3]}`).join("\n");
  return `<div class="setup-grid">
  <div class="panel"><h3>1. Relevés d'activité (PDF)</h3>
    <p class="muted small">Les relevés d'activité mensuels de MyPeopleDoc (heures bloc réelles, immatriculations, hôtels, jours OFF, congés, réserves) et le relevé d'hôtels annuel (escale, nom et coût de chaque nuitée). Enregistre les PDF sur ton téléphone (app Fichiers sur iPhone, Téléchargements ou Drive sur Android), puis choisis-les ici, plusieurs à la fois si tu veux : le type de relevé est reconnu tout seul. La lecture se fait sur le téléphone.</p>
    <div class="actions"><label class="chip on filebtn">Choisir des relevés PDF<input type="file" id="relFile" accept="application/pdf,.pdf" multiple hidden></label></div>
    <div id="relMsg" class="impmsg" role="status"></div>
    ${pending.plans.length ? `<div class="actions relbar"><button class="chip on" type="button" data-rel="apply">Tout valider (${pending.plans.length} relevé${pending.plans.length > 1 ? "s" : ""})</button><button class="chip" type="button" data-rel="cancel">Annuler</button></div><div class="hint">Les choix conseillés sont déjà cochés. Touche un relevé pour voir son détail et ses choix${pending.plans.some(nChoices) ? ` (${pending.plans.reduce((a, p) => a + nChoices(p), 0)} au total)` : ""}.</div>` : ""}
    <div id="relPlans">${pending.plans.map(releveCard).join("")}</div>
    ${pending.plans.length > 3 ? `<div class="actions"><button class="chip on" type="button" data-rel="apply">Tout valider</button><button class="chip" type="button" data-rel="cancel">Annuler</button></div>` : ""}
    ${rel.length ? `<div class="hint">Relevés importés : ${rel.map(k => `${MO[+k.slice(5)-1]} ${k.slice(2,4)}${DB.releves[k].ok ? "" : " ⚠"}`).join(", ")}</div>` : ""}
  </div>
  <div class="panel"><h3>2. Planning (calendrier)</h3>
    <p class="muted small">Pour les vols pas encore sur un relevé, le CDB et les hôtels. Sur iPhone, lance ton raccourci « Export carnet » puis touche « Coller le planning copié ». Sur Android, choisis un fichier calendrier (.ics) exporté de ton agenda. Un nouvel import complète et corrige, sans jamais effacer l'historique.</p>
    <div class="actions"><button class="chip on" type="button" id="impPaste">Coller le planning copié</button><label class="chip filebtn">Fichier .ics<input type="file" id="impFile" accept=".ics,text/calendar,text/plain" hidden></label></div>
    <textarea id="impText" class="ftext" rows="3" placeholder="Si le bouton « Coller » ne marche pas : appui long ici → Coller, puis « Importer le texte »"></textarea>
    <div class="actions"><button class="chip" type="button" id="impGo">Importer le texte</button></div>
    <div id="impMsg" class="impmsg" role="status"></div>${info}
    ${ANDROID ? HOWTO_ANDROID : ""}<details class="howto"><summary>iPhone : créer le raccourci (5 minutes, une fois pour toutes)</summary>
      <ol>
        <li>Ouvre l'app <b>Raccourcis</b> → <b>+</b>, nomme le raccourci « Export carnet ».</li>
        <li>Ajoute l'action <b>Rechercher des événements du calendrier</b>. Touche « Ajouter un filtre » : <b>Calendrier</b> est celui où arrive ton planning HOP!, puis ajoute <b>Date de début</b> « est dans les derniers » <b>12 mois</b>. Désactive la limite de nombre.</li>
        <li>Ajoute <b>Répéter avec chaque élément</b>. À l'intérieur, ajoute l'action <b>Texte</b> et écris exactement, une valeur par ligne :<br>
          <code>#EVT</code><br><code>[Titre]</code><br><code>[Date de début]</code><br><code>[Date de fin]</code><br><code>[Notes]</code><br><code>#FIN</code><br>
          Pour chaque valeur entre crochets, insère la variable « Élément répété » puis touche-la pour choisir Titre, Date de début, Date de fin ou Notes. Pour les deux dates, choisis le format <b>ISO 8601</b> et active l'heure.</li>
        <li>Après « Fin de la répétition », ajoute <b>Copier dans le presse-papiers</b> (entrée : Résultats répétés).</li>
        <li>Lance le raccourci, ouvre le carnet, « Importer », puis « Coller le planning copié ».</li>
      </ol>
    </details>${ANDROID ? "" : HOWTO_ANDROID}
  </div>
  <div class="panel"><h3>3. Réglages</h3>
    <div class="setrow"><label for="setName">Nom (récap impôts)</label><input id="setName" class="fin wide" value="${esc(SET.name)}" placeholder="Prénom Nom"></div>
    ${rows}
    <div class="actions"><button class="chip" type="button" id="bAdd">+ Changement de base</button></div>
    <div class="setrow"><label for="setHome">Aéroport proche du domicile</label><input id="setHome" class="fin ap" maxlength="3" value="${esc(SET.home)}" placeholder="LYS"></div>
    <div class="setrow"><label for="setType">Type avion par défaut (Crew Access)</label><select id="setType" class="fin">${["", "E70", "E90"].map(t => `<option value="${t}"${SET.defaultType === t ? " selected" : ""}>${t || "—"}</option>`).join("")}</select></div>
    <div class="setrow"><label for="setStart">Date de prise en compte</label><input type="date" id="setStart" value="${esc(SET.simCountFrom || SET.seriesStart)}"></div>
    <p class="muted small">La base découpe les rotations et sert au calcul des frais en courrier ; une nuit à la base ou à l'aéroport du domicile n'est pas un découcher. « Date de prise en compte » : en général la fin de ta qualification de type. Les séances simulateur et la plus longue série de travail sont comptées à partir de cette date.</p>
    <div class="actions"><button class="chip on" type="button" id="setSave">Enregistrer les réglages</button></div>
    <div id="setMsg" class="impmsg" role="status"></div>
  </div>
  <div class="panel"><h3>4. Sauvegarde</h3>
    <p class="muted small">Tout est sur ce téléphone, et nulle part ailleurs. Fais une sauvegarde de temps en temps (par exemple dans iCloud Drive) : elle sert aussi à passer sur un nouveau téléphone.</p>
    <div class="actions"><button class="chip on" type="button" id="bkSave">Enregistrer une sauvegarde</button><label class="chip filebtn">Restaurer une sauvegarde<input type="file" id="bkFile" accept=".json,application/json" hidden></label><button class="chip danger" type="button" id="wipe">Tout effacer</button></div>
    <div id="bkMsg" class="impmsg" role="status"></div>
    <div class="hint">Version ${VERSION}</div>
  </div></div>`;
}
const msgTo = id => (t, ok) => { const m = $(id); if (!m) return; m.textContent = t; m.className = "impmsg " + (ok ? "ok" : "warn"); };

// Planning : texte du raccourci ou fichier .ics
function runCalendar(text){
  const msg = msgTo("#impMsg"); text = text || "";
  let events = [], bad = [];
  if (/BEGIN:VCALENDAR/.test(text)) events = parseIcs(text);
  else if (/^#EVT/m.test(text)) { const r = parseShortcut(text); events = r.events; bad = r.bad; }
  else { msg("Format non reconnu : lance d'abord le raccourci (le texte commence par #EVT) ou choisis un fichier .ics.", false); return; }
  const recs = calendarRecords(events, Date.now(), SET.tri || "");
  if (!recs.flights.length && !recs.hotels.length && !recs.sims.length && !recs.meps.length && !Object.keys(recs.days).length) {
    msg(`Aucun vol, hôtel ou simulateur reconnu dans ${events.length} événement(s).${bad.length ? ` ${bad.length} avaient des dates illisibles : vérifie le format ISO 8601 dans le raccourci.` : ""}`, false); return; }
  const r = mergeCalendar(DB, recs, SET);
  if (!saveDb(DB)) { msg("Impossible d'enregistrer sur ce téléphone (navigation privée ?).", false); return; }
  reloadPage(`Planning importé : ${r.added} étapes ajoutées, ${r.updated} mises à jour, ${r.hotels} hôtels, ${r.sims} séances simu${r.meps ? `, ${r.meps} MEP` : ""}.${r.skipped ? ` ${r.skipped} vol(s) ignorés (écartés ou absents d'un relevé).` : ""}`);
}

// Relevés PDF : lecture avec pdf.js embarqué (chargé seulement quand on en a besoin)
let pdfjs = null;
async function getPdfjs(){
  if (pdfjs) return pdfjs;
  pdfjs = await import("../vendor/pdf.min.js");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdf.worker.min.js", import.meta.url).href;
  return pdfjs;
}
async function readReleves(files){
  const msg = msgTo("#relMsg"); msg(`Lecture de ${files.length} fichier(s)…`, true);
  const errs = [], hotelDone = [];
  try { await getPdfjs(); } catch (e) { msg("Le lecteur PDF n'a pas pu se charger : " + e.message, false); return; }
  for (const f of files) {
    try {
      const res = await readPdfAny(pdfjs, await f.arrayBuffer());
      if (res.kind === "hotels") { hotelDone.push(Object.assign(applyHotelReleve(DB, res), {ok: res.ok})); continue; }
      const rec = res.rec;
      if (!rec.flights.length && !Object.keys(rec.days).length) throw new Error("aucune ligne d'activité lue");
      pending.plans = pending.plans.filter(p => p.rec.ym !== rec.ym);
      pending.plans.push(planReleve(DB, rec));
    } catch (e) { errs.push(`${f.name} : ${e.message}`); }
  }
  pending.plans.sort((a, b) => a.rec.ym.localeCompare(b.rec.ym));
  if (hotelDone.length) {
    // relevé d'hôtels : appliqué tout de suite (il ne retire rien), et coût des nuitées repris dans l'onglet Impôts s'il est vide
    const byYear = {}; hotelDone.forEach(r => Object.entries(r.byYear).forEach(([y, v]) => byYear[y] = (byYear[y] || 0) + v));
    const fisc = lsGet("carnet-fisc2", {y: {}, opt: {lys: true}}); fisc.y ||= {};
    Object.entries(byYear).forEach(([y, v]) => { const o = fisc.y[y] ||= {tar: {}, km: "", kmRate: "", other: "", net: "", hotel: "", indem: ""}; if (!String(o.hotel || "").trim() && v) o.hotel = String(Math.round(v * 100) / 100).replace(".", ","); });
    lsSet("carnet-fisc2", fisc); saveDb(DB);
    const n = hotelDone.reduce((a, r) => a + r.updated + r.added, 0), add = hotelDone.reduce((a, r) => a + r.added, 0);
    const bad = hotelDone.filter(r => !r.ok);
    const txt = `Relevé d'hôtels : ${n} nuitée${n > 1 ? "s" : ""} (${n - add} confirmée${n - add > 1 ? "s" : ""}${add ? `, ${add} ajoutée${add > 1 ? "s" : ""}` : ""}), ${Object.entries(byYear).map(([y, v]) => `${v.toLocaleString("fr-FR", {maximumFractionDigits: 2})} € en ${y}`).join(", ")}${bad.length ? " — total du relevé différent de la somme des lignes : à vérifier" : " — total vérifié ✓"}.`;
    if (!pending.plans.length && !errs.length) { reloadPage(txt); return; }
    errs.unshift(txt);
  }
  renderSetup();
  msgTo("#relMsg")(errs.length ? `Non lu : ${errs.join(" · ")}` : `${pending.plans.length} relevé(s) lu(s). Vérifie ci-dessous, puis valide.`, !errs.length);
}
function applyPlans(){
  const tot = {updated: 0, added: 0, removed: 0, hotels: 0, hotelsRemoved: 0, sims: 0, meps: 0}, months = [];
  const who = pending.plans.map(p => p.rec.who).find(Boolean);
  pending.plans.forEach((p, i) => {
    const pick = sel => { const o = {}; document.querySelectorAll(`[${sel}^="${i}:"]`).forEach(c => o[+c.getAttribute(sel).split(":")[1]] = c.checked); return o; };
    const r = applyReleve(DB, p, {add: pick("data-pa"), remove: pick("data-po"), hotels: pick("data-ph")}, SET);
    Object.keys(tot).forEach(k => tot[k] += r[k]); months.push(MO[+p.rec.ym.slice(5)-1] + " " + p.rec.ym.slice(2,4));
  });
  // Trigramme (pour reconnaître les vols en place passager dans le planning)
  if (who && who.tri && SET.tri !== who.tri) { SET.tri = who.tri; saveSettings(SET); }
  // Premier relevé : nom et base repris du relevé si les réglages n'ont jamais été enregistrés
  if (who && !SET.saved) {
    if (!SET.name) SET.name = who.name.split(" ").reverse().map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
    if (/^[A-Z]{3}$/.test(who.base) && SET.bases.length === 1) SET.bases[0][1] = who.base;
    saveSettings(SET);
  }
  pending.plans = [];
  if (!saveDb(DB)) { msgTo("#relMsg")("Impossible d'enregistrer sur ce téléphone (navigation privée ?).", false); return; }
  reloadPage(`Relevés ${months.join(", ")} importés : ${tot.updated} étapes passées en heures réelles, ${tot.added} ajoutées${tot.removed ? `, ${tot.removed} retirées` : ""}, ${tot.hotels} nuits d'hôtel${tot.hotelsRemoved ? ` (${tot.hotelsRemoved} séjours sans hôtel retirés)` : ""}${tot.meps ? `, ${tot.meps} MEP` : ""}.`);
}

async function saveBackup(){
  const msg = msgTo("#bkMsg"), json = JSON.stringify(backupObject(DB, SET)), name = `carnet-de-vol-${nowParts.d}.json`;
  try {
    const file = new File([json], name, {type: "application/json"});
    if (navigator.canShare && navigator.canShare({files: [file]})) { await navigator.share({files: [file], title: "Sauvegarde du carnet de vol"}); msg("Sauvegarde prête : choisis où l'enregistrer (Fichiers, Drive…).", true); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([json], {type: "application/json"})); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  msg("Sauvegarde téléchargée.", true);
}

function bindSetup(){
  $("#relFile").addEventListener("change", e => { const fs = [...(e.target.files || [])]; if (fs.length) readReleves(fs); });
  document.querySelectorAll('[data-rel="apply"]').forEach(b => b.addEventListener("click", applyPlans));
  document.querySelectorAll('[data-rel="cancel"]').forEach(b => b.addEventListener("click", () => { pending.plans = []; renderSetup(); }));
  $("#impPaste").addEventListener("click", async () => { let t = "";
    try { t = await navigator.clipboard.readText(); } catch (e) { msgTo("#impMsg")("Le téléphone a refusé l'accès au presse-papiers : colle le texte dans la zone ci-dessous (appui long → Coller).", false); return; }
    runCalendar(t); });
  $("#impGo").addEventListener("click", () => runCalendar($("#impText").value));
  $("#impFile").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; if (!f) return; f.text().then(runCalendar); });
  $("#bAdd").addEventListener("click", () => { SET.bases.push([nowParts.d, ""]); renderSetup(); });
  $("#setSave").addEventListener("click", () => {
    const msg = msgTo("#setMsg");
    const bs = []; document.querySelectorAll("[data-bb]").forEach(inp => { const i = +inp.dataset.bb; const code = inp.value.trim().toUpperCase();
      const from = i === 0 ? "0000-01-01" : (document.querySelector(`[data-bf="${i}"]`) || {}).value; if (/^[A-Z]{3}$/.test(code) && from) bs.push([from, code]); });
    if (!bs.length || bs[0][0] !== "0000-01-01") { msg("Indique au moins la base (code à 3 lettres, ex. CDG).", false); return; }
    const aps = SET.airports || {};
    Object.assign(SET, {name: $("#setName").value.trim(), home: $("#setHome").value.trim().toUpperCase(), defaultType: $("#setType").value,
      simCountFrom: $("#setStart").value, seriesStart: $("#setStart").value, airports: aps, saved: true,
      bases: bs.sort((a, b) => a[0].localeCompare(b[0]))});
    saveSettings(SET);
    DB.flights.forEach(f => { if (!f.ty && SET.defaultType) f.ty = SET.defaultType; });
    saveDb(DB);
    reloadPage("Réglages enregistrés.");
  });
  $("#bkSave").addEventListener("click", saveBackup);
  $("#bkFile").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; if (!f) return;
    f.text().then(t => { try { const r = restoreBackup(JSON.parse(t)); lsSet(K_DATA, r.db); saveSettings(r.settings); reloadPage("Sauvegarde restaurée."); }
      catch (err) { msgTo("#bkMsg")(err.message || "Fichier illisible.", false); } }); });
  $("#wipe").addEventListener("click", () => { const b = $("#wipe");
    if (b.dataset.armed) { lsSet(K_DATA, emptyDb()); reloadPage("Données effacées. Les réglages sont conservés."); }
    else { b.dataset.armed = "1"; b.textContent = "Confirmer : tout effacer"; } });
}
function renderSetup(){ $("#setupBody").innerHTML = setupHtml(); bindSetup(); }
function showSetup(open){ const s = $("#setup"); s.hidden = !open; if (open) renderSetup(); }

function main(){
const TODAY = D.gen.slice(0,10);
const MOIS = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
const MOIS_L = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const hm = m => { m = Math.round(m); return Math.floor(m/60) + "h" + String(m%60).padStart(2,"0"); };
const fr = n => n.toLocaleString("fr-FR");
const eur = n => n.toLocaleString("fr-FR",{minimumFractionDigits:0,maximumFractionDigits:2}) + " €";
const fdate = d => { const [y,m,j] = d.split("-"); return `${+j} ${MOIS[+m-1]} ${y.slice(2)}`; };
const AP = D.ap;

let st = { y: "all", m: null, tab: "vols", q: "" };
try { const s = JSON.parse(localStorage.getItem("carnet-state")||"null"); if (s) st = Object.assign(st, s); } catch(e){}
const save = () => { try { localStorage.setItem("carnet-state", JSON.stringify({y:st.y,m:st.m,tab:st.tab,mep:!!st.mep})); } catch(e){} };

const inP = d => st.y === "all" ? true : (d.slice(0,4) === st.y && (!st.m || d.slice(5,7) === st.m));
const past = d => d <= TODAY;

// months with data
const monthKeys = (() => {
  const s = new Set(D.flights.map(f => f.d.slice(0,7)).concat(D.sims.map(x => x.d.slice(0,7)), Object.keys(D.days).map(d => d.slice(0,7))));
  const ks = [...s].sort(); const out = [];
  let [y,m] = ks[0].split("-").map(Number); const [ye,me] = ks[ks.length-1].split("-").map(Number);
  while (y < ye || (y === ye && m <= me)) { out.push(`${y}-${String(m).padStart(2,"0")}`); m++; if (m>12){m=1;y++;} }
  return out;
})();
const years = [...new Set(monthKeys.map(k => k.slice(0,4)))];

function periodName(){
  if (st.y === "all") return `Depuis ${MOIS_L[+monthKeys[0].slice(5)-1]} ${monthKeys[0].slice(0,4)}`;
  if (!st.m) return `Année ${st.y}`;
  const n = MOIS_L[+st.m-1]; return n.charAt(0).toUpperCase() + n.slice(1) + " " + st.y;
}

function renderPeriod(){
  const yb = $("#years");
  yb.innerHTML = [["all","Tout"], ...years.map(y => [y,y])].map(([v,l]) =>
    `<button class="chip" data-y="${v}" aria-pressed="${st.y===v}">${l}</button>`).join("");
  const mb = $("#months");
  const ks = st.y === "all" ? monthKeys : monthKeys.filter(k => k.startsWith(st.y));
  const cnt = {}; D.flights.forEach(f => { const k = f.d.slice(0,7); cnt[k] = (cnt[k]||0)+1; });
  mb.innerHTML = ks.map(k => { const [y,m] = k.split("-"); const on = st.y===y && st.m===m;
    const lab = MOIS[+m-1] + (st.y==="all" ? " " + y.slice(2) : "");
    return `<button class="chip mo" data-k="${k}" aria-pressed="${on}" ${cnt[k]?"":"disabled"}>${lab}</button>`; }).join("");
  $("#plabel").textContent = periodName();
  const sel = mb.querySelector('[aria-pressed="true"]'); if (sel) sel.scrollIntoView({block:"nearest",inline:"center"});
}
$("#years").addEventListener("click", e => { const b = e.target.closest("[data-y]"); if (!b) return; st.y = b.dataset.y; st.m = null; update(); });
$("#months").addEventListener("click", e => { const b = e.target.closest("[data-k]"); if (!b || b.disabled) return;
  const [y,m] = b.dataset.k.split("-"); if (st.y===y && st.m===m) { st.m = null; } else { st.y = y; st.m = m; } update(); });

function sel(){
  const F = D.flights.filter(f => inP(f.d));
  const S = D.sims.filter(s => inP(s.d));
  const H = D.hotels.filter(h => inP(h.d));
  const T = D.trans.filter(t => inP(t.d));
  const M = D.meps.filter(x => inP(x.d));
  return {F,S,H,T,M};
}

function renderHero({F,S,H,T,M}){
  const tm = F.reduce((a,f)=>a+f.m,0), tn = F.reduce((a,f)=>a+f.n,0);
  const [h,mm] = hm(tm).split("h");
  $("#kBlock").innerHTML = `${h}<small>h${mm}</small>`;
  const pg = F.filter(f=>f.pg); const kp = $("#kProg");
  kp.hidden = !pg.length; kp.textContent = pg.length ? `dont ${hm(pg.reduce((a,f)=>a+f.m,0))} programmées sur ${pg.length} étapes, en attente des heures réelles` : "";
  const pn = tm ? tn/tm : 0;
  $("#dnTrack").innerHTML = tm ? `<i style="flex:${tm-tn};background:var(--day)"></i><i style="flex:${tn || 0.0001};background:var(--night)"></i>` : `<i style="flex:1;background:color-mix(in srgb,var(--bg) 25%,transparent)"></i>`;
  $("#dnDay").textContent = `Jour ${hm(tm-tn)}`;
  $("#dnNight").textContent = `Nuit ${hm(tn)} · ${Math.round(pn*100)} %`;
  const days = new Set(F.map(f=>f.d)).size;
  const ln = F.reduce((a,f)=>a+f.ln,0);
  const Sp = S.filter(s=>past(s.d) && simCounted(s)); const sm = Sp.reduce((a,s)=>a+s.m,0);
  const nights = H.reduce((a,h)=>a+h.n,0);
  const nTr = T.filter(t => t.k === "Train").length, nAv = T.filter(t => /^Avion|GP/.test(t.k || "")).length, nAu = T.length - nTr - nAv;
  const nm = F.reduce((a,f)=>a+f.nm,0);
  const tiles = [
    [fr(F.length), "étapes", `${days} jours de vol${M.length ? ` · + ${M.length} MEP` : ""}`],
    [hm(tn), "de nuit", `${ln} arrivées de nuit`],
    [hm(sm), "simulateur", `${Sp.length} séance${Sp.length>1?"s":""}`],
    [fr(nm), "NM", `≈ ${fr(Math.round(nm*1.852))} km`],
    [String(nights), "nuits d'hôtel", [`${H.filter(isDecoucher).length} découchers`, H.filter(atBase).length && `${H.filter(atBase).length} à la base`, H.filter(h=>h.n===0).length && `${H.filter(h=>h.n===0).length} repos de jour`].filter(Boolean).join(" · ")],
    [String(T.length), "trajets perso", T.length ? [nTr && `${nTr} train${nTr>1?"s":""}`, nAv && `${nAv} avion${nAv>1?"s":""}`, nAu && `${nAu} autre${nAu>1?"s":""}`].filter(Boolean).join(" · ") : "aucun sur la période"],
    [eur(T.filter(t=>t.p!=null).reduce((x,t)=>x+t.p,0)), "billets payés", (n => n ? `${n} prix à compléter` : T.length ? "tous les prix renseignés" : "aucun trajet")(T.filter(t=>t.p==null&&(t.k==="Train"||t.k==="Avion")).length)],
    [String(new Set(F.flatMap(f=>[f.o,f.a])).size), "aéroports", `${new Set(F.flatMap(f=>[AP[f.o].p,AP[f.a].p]).filter(p => p !== "??")).size} pays`],
  ];
  $("#tiles").innerHTML = tiles.map(([v,l,s]) => `<div class="tile"><span class="eyebrow">${l}</span><b>${v}</b><span class="sub">${s}</span></div>`).join("");
}

// ---------- tooltip ----------
const tip = $("#tip");
function showTip(html, x, y){ tip.innerHTML = html; tip.hidden = false;
  const r = tip.getBoundingClientRect(); let L = x + 12, Tp = y - r.height - 10;
  if (L + r.width > innerWidth - 8) L = x - r.width - 12; if (L < 8) L = 8; if (Tp < 8) Tp = y + 14;
  tip.style.left = L + "px"; tip.style.top = Tp + "px"; }
const hideTip = () => tip.hidden = true;
document.addEventListener("scroll", hideTip, {passive:true});

// ---------- monthly chart ----------
function renderChart(){
  const box = $("#chart"); const W = Math.max(300, box.clientWidth); const Hh = W < 500 ? 210 : 240;
  const pad = {l:34, r:6, t:12, b:26};
  const agg = monthKeys.map(k => { const fs = D.flights.filter(f => f.d.startsWith(k));
    return {k, m: fs.reduce((a,f)=>a+f.m,0), n: fs.reduce((a,f)=>a+f.n,0), c: fs.length}; });
  const maxH = Math.max(...agg.map(a=>a.m))/60;
  const step = maxH > 60 ? 20 : 10; const top = Math.ceil(maxH/step)*step;
  const iw = W - pad.l - pad.r, ih = Hh - pad.t - pad.b;
  const bw = iw / agg.length; const barW = Math.min(34, bw*0.62);
  const y = v => pad.t + ih - (v/top)*ih;
  let s = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Heures de vol par mois, jour et nuit">`;
  for (let v=0; v<=top; v+=step){ s += `<line x1="${pad.l}" x2="${W-pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule${v?"-2":""})" stroke-width="1"/>`;
    s += `<text x="${pad.l-6}" y="${y(v)+3.5}" text-anchor="end">${v}h</text>`; }
  const rr = (x,y0,w,h,r) => { if (h<=0) return ""; r = Math.min(r,h,w/2);
    return `M${x},${y0+h}V${y0+r}Q${x},${y0} ${x+r},${y0}H${x+w-r}Q${x+w},${y0} ${x+w},${y0+r}V${y0+h}Z`; };
  agg.forEach((a,i) => {
    const cx = pad.l + bw*i + bw/2, x = cx - barW/2;
    const [yy,mm] = a.k.split("-");
    const active = st.y==="all" ? true : (yy===st.y && (!st.m || st.m===mm));
    const op = active ? 1 : .28;
    const hD = (a.m - a.n)/60/top*ih, hN = a.n/60/top*ih;
    const yD = pad.t + ih - hD;
    const gap = hN > 0 && hD > 0 ? 2 : 0;
    s += `<g opacity="${op}">`;
    if (hD>0) s += `<path d="${hN>0 ? `M${x},${pad.t+ih}V${yD}H${x+barW}V${pad.t+ih}Z` : rr(x,yD,barW,hD,4)}" fill="var(--day)"/>`;
    if (hN>0) s += `<path d="${rr(x,yD-hN-gap+ (hD>0?0:0),barW,hN,4)}" fill="var(--night)"/>`;
    s += `</g>`;
    if (st.m && yy===st.y && mm===st.m) s += `<path d="M${cx-5},${pad.t+ih+4}l5,-5l5,5" fill="none" stroke="var(--accent)" stroke-width="2"/>`;
    const showLab = W >= 560 || i % 2 === 0 || (st.m && yy===st.y && mm===st.m);
    if (showLab) s += `<text x="${cx}" y="${Hh-8}" text-anchor="middle" ${active&&st.y!=="all"?'style="fill:var(--ink)"':""}>${MOIS[+mm-1].replace(".","")}${mm==="01"||i===0?" "+yy.slice(2):""}</text>`;
    s += `<rect x="${pad.l+bw*i}" y="${pad.t}" width="${bw}" height="${ih}" fill="transparent" data-i="${i}" style="cursor:pointer"/>`;
  });
  s += `</svg>`;
  box.innerHTML = s;
  box.querySelectorAll("rect[data-i]").forEach(r => {
    const a = agg[+r.dataset.i]; const [yy,mm] = a.k.split("-");
    const html = `<b>${MOIS_L[+mm-1]} ${yy}</b><span class="num">${hm(a.m)} bloc · ${a.c} étapes<br>jour ${hm(a.m-a.n)} · nuit ${hm(a.n)}</span>`;
    r.addEventListener("pointerenter", e => showTip(html, e.clientX, e.clientY));
    r.addEventListener("pointermove", e => showTip(html, e.clientX, e.clientY));
    r.addEventListener("pointerleave", hideTip);
    r.addEventListener("click", () => { hideTip(); if (st.y===yy && st.m===mm) st.m = null; else { st.y = yy; st.m = mm; } update(); });
  });
}

// ---------- route map (azimuthal equidistant centred on the base) ----------
const R = 3440.065, rad = d => d*Math.PI/180;
const C0 = AP[HUB];
$("#mapLegend").textContent = `Cercles de distance depuis ${HUB}, en NM`;
function proj(lat, lon){
  const p = rad(lat), l = rad(lon), p0 = rad(C0.la), l0 = rad(C0.lo);
  const cc = Math.max(-1, Math.min(1, Math.sin(p0)*Math.sin(p) + Math.cos(p0)*Math.cos(p)*Math.cos(l-l0)));
  const c = Math.acos(cc), k = c === 0 ? 1 : c/Math.sin(c);
  return [R*k*Math.cos(p)*Math.sin(l-l0), -R*k*(Math.cos(p0)*Math.sin(p) - Math.sin(p0)*Math.cos(p)*Math.cos(l-l0))];
}
function gc(a, b, n){
  const [la1,lo1,la2,lo2] = [a.la,a.lo,b.la,b.lo].map(rad);
  const d = 2*Math.asin(Math.sqrt(Math.sin((la2-la1)/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin((lo2-lo1)/2)**2));
  const out = [];
  if (!(d > 1e-9)) return Array.from({length:n+1}, () => [a.la, a.lo]);
  for (let i=0;i<=n;i++){ const f = i/n, A = Math.sin((1-f)*d)/Math.sin(d), B = Math.sin(f*d)/Math.sin(d);
    const x = A*Math.cos(la1)*Math.cos(lo1)+B*Math.cos(la2)*Math.cos(lo2), y = A*Math.cos(la1)*Math.sin(lo1)+B*Math.cos(la2)*Math.sin(lo2), z = A*Math.sin(la1)+B*Math.sin(la2);
    out.push([Math.atan2(z,Math.hypot(x,y))*180/Math.PI, Math.atan2(y,x)*180/Math.PI]); }
  return out;
}
const ALLP = {}; Object.entries(AP).forEach(([k,v]) => { if (v.la != null) ALLP[k] = proj(v.la, v.lo); });
const usedAll = new Set(D.flights.flatMap(f=>[f.o,f.a]).concat([HUB]).filter(k => ALLP[k]));
const BX = (() => { const xs=[], ys=[]; usedAll.forEach(k => { xs.push(ALLP[k][0]); ys.push(ALLP[k][1]); });
  return {x0:Math.min(...xs)-90, x1:Math.max(...xs)+90, y0:Math.min(...ys)-70, y1:Math.max(...ys)+60}; })();

// Fond de carte embarqué (vendor/land.json : contours en longitude/latitude), disponible hors ligne
const LAND = { rings: null };
function loadLand(){
  fetch("vendor/land.json").then(r => r.json()).then(rings => { LAND.rings = rings.map(r => r.map(([lo, la]) => proj(la, lo))); renderMap(sel().F); }).catch(e => console.warn("fond de carte", e));
}

function renderMap(F){
  const box = $("#map"); const W = Math.max(300, box.clientWidth);
  const sc = W / (BX.x1 - BX.x0); const Hh = Math.round((BX.y1 - BX.y0) * sc);
  const P = ([x,y]) => [(x - BX.x0)*sc, (y - BX.y0)*sc];
  const cdg = P([0,0]);
  let s = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Carte des routes volées">`;
  s += `<defs><clipPath id="clipm"><rect width="${W}" height="${Hh}"/></clipPath></defs><g clip-path="url(#clipm)">`;
  // fond de carte
  if (LAND.rings) { let d = "";
    LAND.rings.forEach(r => { d += "M" + r.map(p => ((p[0]-BX.x0)*sc).toFixed(1) + "," + ((p[1]-BX.y0)*sc).toFixed(1)).join("L") + "Z"; });
    s += `<path d="${d}" fill="var(--land)" stroke="var(--surface)" stroke-width=".8" stroke-linejoin="round"/>`; }
  // graticule
  const line = pts => "M" + pts.map(p => P(proj(p[0],p[1])).map(v=>v.toFixed(1)).join(",")).join("L");
  for (let lat=30; lat<=65; lat+=5){ const pts=[]; for(let lo=-20; lo<=30; lo+=1) pts.push([lat,lo]); s += `<path d="${line(pts)}" fill="none" stroke="var(--rule-2)" stroke-width="1"/>`; }
  for (let lo=-20; lo<=30; lo+=5){ const pts=[]; for(let la=30; la<=66; la+=1) pts.push([la,lo]); s += `<path d="${line(pts)}" fill="none" stroke="var(--rule-2)" stroke-width="1"/>`; }
  // range rings
  const ringLabels = [];   // dessinés à la fin, seulement là où ils ne gênent aucun trigramme
  [250,500,750,1000].forEach(r => { s += `<circle cx="${cdg[0]}" cy="${cdg[1]}" r="${r*sc}" fill="none" stroke="var(--rule)" stroke-width="1" stroke-dasharray="3 4"/>`;
    const a = rad(135), lx = cdg[0] + Math.cos(a)*r*sc, ly = cdg[1] + Math.sin(a)*r*sc;
    if (lx > 20 && ly < Hh - 6) ringLabels.push({x: lx + 4, y: ly - 3, t: `${r} NM`}); });
  // routes
  const pairs = {}; F.forEach(f => { const k = [f.o,f.a].sort().join("-"); pairs[k] = (pairs[k]||0)+1; });
  const pmax = Math.max(1, ...Object.values(pairs));
  Object.entries(pairs).sort((a,b)=>a[1]-b[1]).forEach(([k,c]) => { const [a,b] = k.split("-"); if (!ALLP[a] || !ALLP[b]) return;
    const pts = gc(AP[a], AP[b], 24).map(p => P(proj(p[0],p[1])).map(v=>v.toFixed(1)).join(","));
    const w = 1 + 2.4*Math.sqrt(c/pmax);
    s += `<path d="M${pts.join("L")}" fill="none" stroke="var(--route)" stroke-opacity="${.35 + .5*Math.sqrt(c/pmax)}" stroke-width="${w.toFixed(2)}" stroke-linecap="round"/>`; });
  // airports
  const vis = {}; F.forEach(f => { vis[f.a] = (vis[f.a]||0)+1; vis[f.o] = vis[f.o]||0; });
  const vmax = Math.max(1, ...Object.entries(vis).filter(([k])=>k!==HUB).map(([,v])=>v));
  const order = [...usedAll].sort((a,b)=>(vis[a]||0)-(vis[b]||0));
  // Escales : d'abord tous les points, puis le trigramme de CHAQUE escale volée sur la période,
  // placé là où il ne chevauche ni un autre trigramme ni un point (sinon un peu plus loin, relié par un trait fin).
  const pts = {}, dots = [];
  order.forEach(k => { const [x,y] = P(ALLP[k]); const v = vis[k];
    if (v === undefined) { s += `<circle cx="${x}" cy="${y}" r="2" fill="var(--rule)"/>`; return; }
    const r = k===HUB ? 6 : 2.6 + 4*Math.sqrt(v/vmax);
    pts[k] = {x, y, r}; dots.push([x - r, y - r, x + r, y + r]);
    if (k === selAp) s += `<circle cx="${x}" cy="${y}" r="${(r+5).toFixed(1)}" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2"/>`;
    s += `<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="${k===HUB?"var(--ink)":"var(--surface)"}" stroke="${k===selAp?"var(--accent)":"var(--ink)"}" stroke-width="1.5"/>`;
  });
  const LW = 19.5, LA = 8, LD = 2;          // largeur d'un trigramme, hauteur au-dessus / au-dessous de la ligne de base
  const overlap = (A, B) => Math.max(0, Math.min(A[2], B[2]) - Math.max(A[0], B[0])) * Math.max(0, Math.min(A[3], B[3]) - Math.max(A[1], B[1]));
  const placed = [], lines = [], texts = [];
  const prio = Object.keys(pts).sort((a,b) => (b===HUB) - (a===HUB) || (vis[b]||0) - (vis[a]||0) || a.localeCompare(b));
  prio.forEach(k => { const {x, y, r} = pts[k];
    const cands = [];
    [[1,0],[-1,0],[0,-1],[0,1],[1,-1],[1,1],[-1,-1],[-1,1]].forEach(([dx,dy]) => [0, 9, 18].forEach(far => {
      const g = r + 2 + far, bx = dx > 0 ? x + g : dx < 0 ? x - g - LW : x - LW/2;
      const by = dy < 0 ? y - g - LD : dy > 0 ? y + g + LA : y + 3.5;
      cands.push({bx, by, far, box: [bx - 1, by - LA - 1, bx + LW + 1, by + LD + 1]}); }));
    cands.sort((a,b) => a.far - b.far);
    let best = null, bestScore = Infinity;
    for (const c of cands) {
      let sc = c.far * 0.6;
      if (c.box[0] < 1 || c.box[2] > W - 1 || c.box[1] < 1 || c.box[3] > Hh - 1) sc += 400;
      placed.forEach(B => sc += overlap(c.box, B) * 6);
      dots.forEach(B => sc += overlap(c.box, B) * 3);
      if (sc < bestScore) { bestScore = sc; best = c; }
      if (sc === c.far * 0.6 && c.far === 0) break;      // place idéale libre : on la garde
    }
    placed.push(best.box);
    if (best.far) { const cx = Math.max(best.box[0], Math.min(x, best.box[2])), cy = Math.max(best.box[1], Math.min(y, best.box[3]));
      const d = Math.hypot(cx - x, cy - y) || 1; lines.push(`<line x1="${(x + (cx-x)/d*r).toFixed(1)}" y1="${(y + (cy-y)/d*r).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${cy.toFixed(1)}" stroke="var(--ink-3)" stroke-width=".8"/>`); }
    texts.push(`<text x="${best.bx.toFixed(1)}" y="${best.by.toFixed(1)}" data-ap="${k}" style="fill:var(--ink);font-weight:500;paint-order:stroke;stroke:var(--surface);stroke-width:3px;cursor:pointer">${k}</text>`);
  });
  ringLabels.forEach(l => { const bx = [l.x - 1, l.y - 8, l.x + l.t.length * 5.8 + 1, l.y + 2];
    if (!placed.some(B => overlap(bx, B)) && !dots.some(B => overlap(bx, B))) s += `<text x="${l.x}" y="${l.y}" style="font-size:9.5px">${l.t}</text>`; });
  s += lines.join("") + texts.join("");
  Object.entries(pts).forEach(([k, {x, y}]) => { s += `<circle cx="${x}" cy="${y}" r="12" fill="transparent" data-ap="${k}" style="cursor:pointer"/>`; });
  s += `</g></svg>`;
  box.innerHTML = s;
  box.querySelectorAll("[data-ap]").forEach(c => { const k = c.dataset.ap; const a = AP[k];
    const legs = F.filter(f => f.a===k || f.o===k);
    const nights = D.hotels.filter(h => inP(h.d) && h.ap===k).reduce((x,h)=>x+h.n,0);
    const html = `<b>${k} · ${esc(a.c)}</b><span class="num">${vis[k]||0} arrivée${(vis[k]||0)>1?"s":""} · ${legs.length} étapes<br>${nights} nuit${nights>1?"s":""} d'hôtel</span>`;
    const sh = e => showTip(html, e.clientX, e.clientY);
    c.addEventListener("pointerenter", sh); c.addEventListener("pointermove", sh); c.addEventListener("pointerleave", hideTip);
    c.addEventListener("click", () => { hideTip(); openAp(k); });
  });
  // top destinations
  const top = Object.entries(vis).filter(([k,v])=>k!==HUB && v>0).sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0]));
  const tmax = top.length ? top[0][1] : 1;
  $("#sideTitle").textContent = top.length ? `Escales (${top.length})` : "Escales";
  $("#topDest").innerHTML = top.length ? `<div class="hbars dest-scroll" tabindex="0" aria-label="Toutes les escales, par nombre d'arrivées">` + top.map(([k,v]) => `<div class="hb" data-ap="${k}" role="button" tabindex="0"><span class="lab"><span class="mono">${k}</span> <span class="muted">${esc(AP[k].c)}</span></span><span class="tr"><i style="width:${v/tmax*100}%"></i></span><span class="v">${v}</span></div>`).join("") + `</div>`
    + `<div class="hint">Nombre d'arrivées sur la période, hors ${HUB}.${top.length > 8 ? " Faites défiler pour voir toutes les escales." : ""} Touchez une escale pour voir tous ses vols.</div>` : `<div class="empty">Aucun vol sur cette période.</div>`;
  renderApDetail();
}

// ---------- détail d'une escale (clic sur la carte) ----------
let selAp = null;
function openAp(k){
  selAp = k; renderMap(sel().F);
  const side = $("#apDetail"); if (side && !side.hidden) side.scrollIntoView({behavior:"smooth", block:"nearest"});
}
function closeAp(){ selAp = null; renderMap(sel().F); }
function renderApDetail(){
  const box = $("#apDetail"), title = $("#sideTitle"), top = $("#topDest");
  if (!selAp || !AP[selAp]) { selAp = null; box.hidden = true; box.innerHTML = ""; title.hidden = false; top.hidden = false; return; }
  const a = AP[selAp];
  const L = D.flights.filter(f => f.a === selAp).sort((x,y) => (y.d + y.h1).localeCompare(x.d + x.h1));
  const done = L.filter(f => past(f.d)), next = L.length - done.length;
  const last = done[0];
  let h = `<div class="ap-head"><div><h3>${selAp} · ${esc(a.c)}</h3><div class="ap-sub">${done.length} vol${done.length>1?"s":""} vers cette escale${next?` · ${next} à venir`:""}${last?` · dernier le ${fdate(last.d)}`:""}</div></div><button class="ap-back" type="button" id="apBack">Fermer</button></div>`;
  h += L.length ? `<div class="ap-list">` + L.map(f => `<div class="ap-row"><span class="d mono">${fdate(f.d)}</span><span class="route">${f.o}<i>→</i>${f.a}</span><span class="t mono muted">${f.v} · ${f.h1}–${f.h2}${!past(f.d) ? ' <span class="pill acc">à venir</span>' : (f.pg ? ' <span class="pill warn" title="Heures programmées">prog.</span>' : "")}</span></div>`).join("") + `</div>`
    : `<div class="empty">Aucun vol vers cette escale.</div>`;
  h += `<div class="hint">Toutes périodes confondues, du plus récent au plus ancien.</div>`;
  box.innerHTML = h; box.hidden = false; title.hidden = true; top.hidden = true;
}
$("#apDetail").addEventListener("click", e => { if (e.target.closest("#apBack")) closeAp(); });
$("#topDest").addEventListener("click", e => { const r = e.target.closest("[data-ap]"); if (r) openAp(r.dataset.ap); });
$("#topDest").addEventListener("keydown", e => { if (e.key !== "Enter" && e.key !== " ") return; const r = e.target.closest("[data-ap]"); if (r) { e.preventDefault(); openAp(r.dataset.ap); } });

// ---------- tabs ----------
const TABS = [["vols","Vols"],["simu","Simu"],["dest","Escales"],["jours","Jours"],["hotel","Hôtels"],["trans","Transports"],["bilan","Bilan"],["fisc","Impôts"]];
function renderTabs(c){
  const ct = {vols:c.F.length, dest:new Set(c.F.map(f=>f.a)).size, simu:c.S.length, hotel:c.H.length, trans:c.T.length, jours:"", bilan:"", fisc:curFiscY()};
  $("#tabs").innerHTML = TABS.map(([k,l]) => `<button class="tab" role="tab" data-t="${k}" aria-selected="${st.tab===k}">${l}<span class="ct">${ct[k]}</span></button>`).join("");
}
$("#pane").addEventListener("click", e => { if (e.target.closest("[data-mep]")) { st.mep = !st.mep; save(); renderPane(sel()); } });
$("#tabs").addEventListener("click", e => { const b = e.target.closest("[data-t]"); if (!b) return; st.tab = b.dataset.t; save(); renderPane(sel()); renderTabs(sel()); });

const hbars = (rows, fmt=v=>v) => { const mx = Math.max(1, ...rows.map(r=>r[1]));
  return `<div class="hbars">${rows.map(([l,v]) => `<div class="hb"><span class="lab">${l}</span><span class="tr"><i style="width:${v/mx*100}%"></i></span><span class="v">${fmt(v)}</span></div>`).join("")}</div>`; };
const group = (arr, key, val) => { const o = {}; arr.forEach(x => { const k = key(x); o[k] = (o[k]||0) + val(x); }); return Object.entries(o).sort((a,b)=>b[1]-a[1]); };

const openStats = {cdb:false, reg:false};
function paneVols({F, M}){
  const q = st.q.trim().toLowerCase();
  const match = f => !q || [f.v,f.o,f.a,f.c,f.ty,f.im||"",AP[f.o]?.c,AP[f.a]?.c, f.mep ? "mep mise en place " + (f.mode||"") : ""].join(" ").toLowerCase().includes(q);
  const meps = st.mep ? M.map(x => Object.assign({}, x, {mep: 1})) : [];
  const rows = F.concat(meps).filter(match).sort((a,b) => (a.d + a.h1).localeCompare(b.d + b.h1));
  const byType = group(F, f => f.ty || "Non précisé", f => f.m);
  const byCdb = group(F.filter(f=>f.c), f => f.c, f => f.m).slice(0,6);
  const regs = {}; F.filter(f => f.im).forEach(f => { const r = regs[f.im] ||= {n:0, m:0, ty:f.ty, last:""}; r.n++; r.m += f.m; if (f.d > r.last) { r.last = f.d; r.ty = f.ty || r.ty; } });
  const byReg = Object.entries(regs).sort((a,b) => b[1].n - a[1].n || b[1].m - a[1].m);
  const regMax = byReg.length ? byReg[0][1].n : 1, noReg = F.filter(f => !f.im).length;
  const regHtml = byReg.length ? `<div class="dest-scroll"><div class="hbars">${byReg.map(([k,r],i) => `<div class="hb reg"><span class="lab"><span class="muted">${i+1}.</span> <span class="mono">${esc(k)}</span> <span class="muted">${esc(r.ty||"")}</span></span><span class="tr"><i style="width:${r.n/regMax*100}%"></i></span><span class="v">${r.n} · ${hm(r.m)}</span></div>`).join("")}</div></div><div class="hint">${byReg.length} avions différents · étapes et heures bloc${noReg ? ` · ${noReg} étape${noReg>1?"s":""} sans immatriculation (pas encore de relevé)` : ""}</div>` : '<div class="muted">Pas d\'immatriculation sur cette période (elles viennent des relevés d\'activité).</div>';
  const fold = (k, title, body) => `<details class="panel fold" data-k="${k}"${openStats[k]?" open":""}><summary><h3>${title}</h3></summary>${body}</details>`;
  let h = `<div class="grid3 top-stats">
    <div class="panel"><h3>Par avion</h3>${hbars(byType.map(([k,v])=>[`<span class="mono">${esc(k)}</span>`,v]), hm)}</div>
    ${fold("reg", "Par immatriculation", regHtml)}
    ${fold("cdb", "CDB les plus fréquents", byCdb.length?hbars(byCdb.map(([k,v])=>[esc(k),v]), hm):'<div class="muted">—</div>')}</div>`;
  h += `<div class="vtools"><input class="search" id="q" type="search" placeholder="Filtrer : vol, escale, CDB, E90, F-HBLA…" value="${esc(st.q)}" aria-label="Filtrer les vols">${M.length ? `<button class="chip" type="button" data-mep="1" aria-pressed="${!!st.mep}">${st.mep ? "Masquer" : "Afficher"} les MEP (${M.length})</button>` : ""}</div>`;
  if (st.mep && M.length) h += `<div class="hint" style="margin-top:-8px">Les mises en place (MEP) sont en gris : elles ne comptent ni dans les étapes ni dans les heures, mais situent le début et la fin des rotations pour les impôts.</div>`;
  if (!rows.length) return h + `<div class="empty">Aucun vol ne correspond.</div>`;
  h += `<div class="tw"><table><thead><tr><th>Date</th><th>Vol</th><th>Route</th><th>Bloc</th><th class="r">Durée</th><th class="r">Nuit</th><th>Avion</th><th>Immat.</th><th>CDB</th></tr></thead><tbody>`;
  let cur = "";
  rows.forEach(f => { const k = f.d.slice(0,7);
    if (k !== cur){ cur = k; const all = rows.filter(x=>x.d.startsWith(k)), ms = all.filter(x => !x.mep), nm = all.length - ms.length; const t = ms.reduce((a,x)=>a+x.m,0), n = ms.reduce((a,x)=>a+x.n,0);
      h += `<tr class="mhead"><td colspan="9">${MOIS_L[+k.slice(5)-1]} ${k.slice(0,4)}<span class="num">${ms.length} étapes · ${hm(t)} · nuit ${hm(n)}${nm ? ` · ${nm} MEP` : ""}</span></td></tr>`; }
    if (f.mep) { h += `<tr class="mep"><td class="mono">${fdate(f.d)}</td><td class="mono"><span class="pill">MEP</span> ${esc(f.v) || ""}</td><td><span class="route">${f.o}<i>→</i>${f.a}</span></td>
      <td class="mono">${f.h1}–${f.h2}</td><td class="r mono">(${hm(f.m || 0)})</td><td class="r mono">—</td>
      <td class="mono">${f.mode && f.mode !== "Avion" ? esc(f.mode.toLowerCase()) : "—"}</td><td class="mono">—</td><td>—</td></tr>`; return; }
    h += `<tr><td class="mono">${fdate(f.d)}</td><td class="mono">${f.v}</td><td><span class="route">${f.o}<i>→</i>${f.a}</span></td>
      <td class="mono muted">${f.h1}–${f.h2}</td><td class="r mono">${f.pg?'<span class="pill warn" title="Heures programmées, en attente des heures réelles">prog.</span> ':""}${hm(f.m)}</td>
      <td class="r mono">${f.n ? hm(f.n) : '<span class="muted">—</span>'}${f.ln ? ' <span class="pill n" title="Arrivée de nuit">ATT N</span>' : ''}</td>
      <td class="mono">${f.ty || '<span class="muted">—</span>'}</td><td class="mono">${f.im ? esc(f.im) : '<span class="muted">—</span>'}</td><td>${esc(f.c) || '<span class="muted">—</span>'}</td></tr>`; });
  return h + `</tbody></table></div>`;
}

function paneDest({F,H}){
  if (!F.length) return `<div class="empty">Aucun vol sur cette période.</div>`;
  const st2 = {};
  F.forEach(f => { const s = st2[f.a] ||= {arr:0,m:0,last:"",n:0}; s.arr++; s.m += f.m; if (f.d > s.last) s.last = f.d; });
  H.forEach(h => { if (st2[h.ap]) st2[h.ap].n += h.n; });
  const rows = Object.entries(st2).sort((a,b)=>b[1].arr-a[1].arr || b[1].m-a[1].m);
  const countries = group(F.filter(f=>f.a!==HUB), f => AP[f.a].p, () => 1);
  const CN = COUNTRY;
  const routes = group(F, f => [f.o,f.a].sort().join(" ⇄ "), () => 1).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
  const longest = [...F].sort((a,b)=>b.m-a.m)[0];
  let h = `<div class="summary"><span><b>${rows.length}</b> escales</span><span><b>${countries.length}</b> pays</span><span>Plus long : <b>${longest.o}→${longest.a}</b> ${hm(longest.m)}</span></div>`;
  h += `<div class="grid3"><div class="panel"><h3>Par pays (arrivées hors ${HUB})</h3>${hbars(countries.map(([k,v])=>[esc(CN[k]||k),v]))}</div>
    <div class="panel"><h3>Lignes les plus volées (${routes.length})</h3><div class="dest-scroll routes-scroll" tabindex="0" aria-label="Toutes les lignes, par nombre d'étapes">${hbars(routes.map(([k,v])=>[`<span class="mono">${k}</span>`,v]))}</div><div class="hint">Étapes dans les deux sens.${routes.length > 8 ? " Faites défiler pour tout voir." : ""}</div></div>
    <div class="panel"><h3>Découchers par escale</h3>${hbars(group(H.filter(isDecoucher), x=>x.ap, x=>x.n).slice(0,8).map(([k,v])=>[`<span class="mono">${k}</span> <span class="muted">${esc(AP[k]?.c||"")}</span>`,v]))}</div></div>`;
  h += `<div class="tw"><table><thead><tr><th>Escale</th><th>Ville</th><th>Pays</th><th class="r">Arrivées</th><th class="r">Heures (vols vers)</th><th class="r">Nuits hôtel</th><th>Dernière</th></tr></thead><tbody>`;
  rows.forEach(([k,s]) => { h += `<tr><td class="mono"><b>${k}</b></td><td>${esc(AP[k].c)}</td><td class="mono">${AP[k].p}</td><td class="r mono">${s.arr}</td><td class="r mono">${hm(s.m)}</td><td class="r mono">${s.n||'<span class="muted">—</span>'}</td><td class="mono">${fdate(s.last)}</td></tr>`; });
  return h + `</tbody></table></div>`;
}

function paneSimu({S}){
  const done = S.filter(s=>past(s.d) && simCounted(s)), next = S.filter(s=>!past(s.d) && simCounted(s)), other = S.filter(s=>!simCounted(s));
  const tot = done.reduce((a,s)=>a+s.m,0);
  let h = `<div class="summary"><span><b>${done.length}</b> séances</span><span><b>${hm(tot)}</b> au simulateur</span>${next.length?`<span><b>${next.length}</b> à venir</span>`:""}${other.length?`<span><b>${other.length}</b> non comptée${other.length>1?"s":""} (QT, autres)</span>`:""}</div>`;
  if (done.length) h += `<div class="panel"><h3>Par catégorie</h3>${hbars(group(done, s=>s.k, s=>s.m).map(([k,v])=>[esc(k),v]), hm)}</div>`;
  if (!S.length) return h + `<div class="empty">Aucune séance simulateur sur cette période.</div>`;
  h += `<div class="tw"><table><thead><tr><th>Date</th><th>Séance</th><th>Horaires</th><th class="r">Durée</th><th>Lieu</th><th>Catégorie</th></tr></thead><tbody>`;
  S.forEach(s => { h += `<tr><td class="mono">${fdate(s.d)}</td><td class="wrap">${esc(s.t)} ${!past(s.d)?'<span class="pill acc">à venir</span>':""}${!simCounted(s)?' <span class="pill">non compté</span>':""}</td><td class="mono muted">${s.h1}–${s.h2}</td><td class="r mono">${hm(s.m)}</td><td class="mono">${esc(s.l)}</td><td><span class="pill">${esc(s.k)}</span></td></tr>`; });
  return h + `</tbody></table></div><div class="hint">Une séance par jour de simulateur, comptée 4 h. Seules les séances récurrentes (évaluations, trainings, prorogations de QT) entrent dans le total : la qualification de type et les simulateurs non reconnus sont listés sans être comptés.</div>`;
}

function paneHotel({H}){
  const skipped = D.hotelsAll.filter(x => inP(x.d) && !countedHotel(x));
  const skipNote = skipped.length ? `<div class="hint">${skipped.length} nuit${skipped.length>1?"s":""} non comptée${skipped.length>1?"s":""} : à la base sans hôtel confirmé par le relevé d'hôtels ou le planning, à l'aéroport du domicile, ou sans escale connue.</div>` : "";
  if (!H.length) return `<div class="empty">Aucun découcher sur cette période.</div>` + skipNote;
  const nights = H.reduce((a,h)=>a+h.n,0), day = H.filter(h=>h.n===0).length;
  const named = H.filter(x => x.h), hotels = group(named, h => h.h, () => 1).slice(0,6);
  const nBase = H.filter(atBase).length;
  let h = `<div class="summary"><span><b>${nights}</b> nuits</span><span><b>${H.filter(isDecoucher).length}</b> découchers</span>${nBase?`<span><b>${nBase}</b> à la base</span>`:""}${day?`<span><b>${day}</b> repos de jour</span>`:""}${named.length?`<span><b>${new Set(named.map(x=>x.h)).size}</b> hôtels différents</span>`:""}</div>`;
  const byAp = group(H.filter(isDecoucher), x => x.ap, x => x.n).slice(0,8);
  h += `<div class="grid2"><div class="panel"><h3>Découchers par escale</h3>${hbars(byAp.map(([k,v])=>[`<span class="mono">${k}</span> <span class="muted">${esc(AP[k]?.c||"")}</span>`,v]))}</div>`
    + (hotels.length ? `<div class="panel"><h3>Hôtels les plus fréquents</h3>${hbars(hotels.map(([k,v])=>[esc(k),v]))}</div>` : `<div class="panel"><h3>Noms des hôtels</h3><div class="muted small">Les relevés d'activité ne donnent pas le nom de l'hôtel. Importe ton planning pour les retrouver.</div></div>`) + `</div>`;
  h += `<div class="tw"><table><thead><tr><th>Arrivée</th><th>Départ</th><th>Escale</th><th>Hôtel</th><th class="r">Nuits</th></tr></thead><tbody>`;
  H.forEach(x => { h += `<tr><td class="mono">${fdate(x.d)} <span class="muted">${x.s}</span></td><td class="mono">${x.de!==x.d?fdate(x.de)+" ":""}<span class="muted">${x.e}</span></td><td class="mono"><b>${x.ap}</b></td><td>${x.h ? esc(x.h) : '<span class="muted">—</span>'}</td><td class="r mono">${x.n || '<span class="pill">repos de jour</span>'}</td></tr>`; });
  return h + `</tbody></table></div>` + skipNote;
}

// ---------- onglet Transports : billets de train et d'avion perso, saisis à la main ----------
const TMODES = [["Train","Train"],["Avion GP","Avion en GP"],["Avion","Avion (billet payé)"],["Voiture","Voiture"],["Autre","Autre"]];
const isGP = t => /GP/.test(t.k || ""), isAvion = t => /^Avion/.test(t.k || "") || isGP(t);
const needsPrice = t => t.p == null && (t.k === "Train" || t.k === "Avion");
let tEdit = null;   // null : formulaire fermé ; -1 : nouveau billet ; sinon index dans DB.trans
function transForm(){
  const t = tEdit >= 0 ? DB.trans[tEdit] : {d: TODAY, k: "Train", o: "", a: "", h1: "", h2: "", num: "", ref: "", p: null, note: ""};
  const known = t.k && !TMODES.some(([v]) => v === t.k) ? [[t.k, t.k]] : [];
  return `<div class="panel" id="tPanel"><h3>${tEdit >= 0 ? "Modifier le billet" : "Nouveau billet"}</h3>
    <form id="tForm" class="tform">
      <label>Date<input type="date" name="d" required value="${esc(t.d)}"></label>
      <label>Mode<select name="k">${[...TMODES, ...known].map(([v,l]) => `<option value="${esc(v)}"${v === t.k ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
      <label>De<input name="o" required value="${esc(t.o)}" placeholder="Lyon Part-Dieu"></label>
      <label>À<input name="a" required value="${esc(t.a)}" placeholder="Aéroport CDG 2"></label>
      <label>Départ<input type="time" name="h1" value="${esc(t.h1)}"></label>
      <label>Arrivée<input type="time" name="h2" value="${esc(t.h2)}"></label>
      <label>N° de train ou de vol<input name="num" value="${esc(t.num)}" placeholder="OUIGO 7802"></label>
      <label>Référence du billet<input name="ref" value="${esc(t.ref)}" placeholder="ABC123" autocapitalize="characters"></label>
      <label>Prix payé (€)<input name="p" inputmode="decimal" value="${t.p != null ? String(t.p).replace(".", ",") : ""}" placeholder="vide si inconnu"></label>
      <label>Note<input name="note" value="${esc(t.note)}" placeholder="facultatif"></label>
      <div class="actions"><button class="chip on" type="submit">${tEdit >= 0 ? "Enregistrer" : "Ajouter"}</button>${tEdit < 0 ? `<button class="chip" type="submit" data-again="1">Ajouter + le retour</button>` : ""}<button class="chip" type="button" data-tcancel="1">Annuler</button>${tEdit >= 0 ? `<button class="chip danger" type="button" data-tdel="${tEdit}">Supprimer</button>` : ""}</div>
    </form></div>`;
}
function paneTrans({T}){
  const tr = T.filter(t=>t.k==="Train"), av = T.filter(isAvion), gp = T.filter(isGP), au = T.length - tr.length - av.length;
  const paid = T.filter(t=>t.p!=null), sum = paid.reduce((a,t)=>a+t.p,0), todo = T.filter(needsPrice).length;
  let h = tEdit !== null ? transForm() : `<div class="actions" style="margin-top:0"><button class="chip on" type="button" data-tnew="1">+ Ajouter un billet</button></div>`;
  if (!T.length) return h + `<div class="empty">Aucun trajet sur cette période. Ajoute tes billets de train et d'avion pour suivre ce que tu paies (utile pour les frais réels).</div>`;
  h += `<div class="summary"><span><b>${tr.length}</b> train${tr.length>1?"s":""}</span><span><b>${av.length}</b> avion${av.length>1?"s":""}${gp.length?` (dont ${gp.length} GP)`:""}</span>${au?`<span><b>${au}</b> autre${au>1?"s":""}</span>`:""}<span><b>${eur(sum)}</b> payés</span>${paid.length?`<span>moyenne <b>${eur(Math.round(sum/paid.length*100)/100)}</b></span>`:""}${todo?`<span><b>${todo}</b> prix à compléter</span>`:""}</div>`;
  let cur = "";
  h += `<div class="tlist">`;
  T.forEach(t => { const i = DB.trans.indexOf(t), k = t.d.slice(0,7);
    if (k !== cur) { cur = k; const ms = T.filter(x => x.d.startsWith(k)); h += `<div class="tmonth">${MOIS_L[+k.slice(5)-1]} ${k.slice(0,4)}<span class="num">${ms.length} · ${eur(ms.reduce((a,x)=>a+(x.p||0),0))}</span></div>`; }
    h += `<button type="button" class="trow" data-tedit="${i}">
      <span class="td mono">${fdate(t.d)}</span>
      <span class="tm">${isGP(t) ? '<span class="pill">GP</span>' : `<span class="pill">${esc(t.k === "Avion" ? "Avion" : t.k)}</span>`}</span>
      <span class="tt"><b>${esc(t.o)} <span class="muted">→</span> ${esc(t.a)}</b><span class="muted mono">${[t.h1 ? t.h1 + (t.h2 ? "–" + t.h2 : "") : "", t.num, t.ref].filter(Boolean).map(esc).join(" · ")}${t.note ? ` · ${esc(t.note)}` : ""}</span></span>
      <span class="tp mono">${t.p != null ? eur(t.p) : needsPrice(t) ? '<span class="pill warn">prix ?</span>' : '<span class="muted">—</span>'}${!past(t.d) ? '<br><span class="pill acc">à venir</span>' : ""}</span></button>`; });
  return h + `</div><div class="hint">Touche un billet pour le modifier, compléter son prix ou le supprimer. Les billets restent sur ce téléphone, comme le reste du carnet.</div>`;
}
const openTForm = i => { tEdit = i; renderPane(sel()); const p = $("#tPanel"); if (p) { p.scrollIntoView({behavior: "smooth", block: "start"}); } };
$("#pane").addEventListener("submit", e => {
  if (e.target.id !== "tForm") return; e.preventDefault();
  const f = new FormData(e.target), g = k => String(f.get(k) || "").trim();
  const pr = g("p") ? parseFloat(g("p").replace(",", ".").replace(/[^\d.]/g, "")) : null;
  const rec = {d: g("d"), k: g("k"), o: g("o"), a: g("a"), h1: g("h1"), h2: g("h2"), num: g("num"), ref: g("ref").toUpperCase(), p: isFinite(pr) ? pr : null, note: g("note")};
  if (tEdit >= 0) Object.assign(DB.trans[tEdit], rec); else DB.trans.push(Object.assign(rec, {src: "Saisie"}));
  const again = e.submitter && e.submitter.dataset.again;
  saveDb(DB);
  if (again) { tEdit = -1; update(); const fm = $("#tForm"); if (fm) { fm.o.value = rec.a; fm.a.value = rec.o; fm.k.value = rec.k; fm.d.value = rec.d; fm.querySelector("[name=d]").focus(); } return; }
  tEdit = null; update();
});
$("#pane").addEventListener("click", e => {
  if (e.target.closest("[data-tnew]")) { openTForm(-1); return; }
  if (e.target.closest("[data-tcancel]")) { tEdit = null; renderPane(sel()); return; }
  const r = e.target.closest("[data-tedit]"); if (r) { openTForm(+r.dataset.tedit); return; }
  const b = e.target.closest("[data-tdel]"); if (!b) return;
  if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Confirmer la suppression"; return; }
  DB.trans.splice(+b.dataset.tdel, 1); tEdit = null; saveDb(DB); update();
});

// ---------- onglet Impôts ----------
// Méthode : lettre DLF du 15/02/1999 et son annexe, mémento fiscal (version avril 2024, p. 12-17 et 50-53).
// Barème : « Barème des indemnités journalières du Groupe 1 - Année 2025 ».
const CNAME = COUNTRY;
const HOTEL_CTRY = {CHR:"FR", LBG:"FR"};
const ctryOf = ap => (AP[ap] && AP[ap].p) || HOTEL_CTRY[ap] || "??";
const cityOf = ap => (AP[ap] && AP[ap].c) || ap;
const toNum = v => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(n) ? n : 0; };
const fq = q => q.toLocaleString("fr-FR", {maximumFractionDigits: 2});
// Base d'affectation et changements de base : réglages de l'utilisateur.
const BASES = SET.bases;
const baseAt = d => { let b = BASES[0][1]; BASES.forEach(([from, v]) => { if (d >= from) b = v; }); return b; };
// « Chez soi » pour découper les rotations : la base du moment et l'aéroport du domicile.
const isHome = (ap, d) => ap === baseAt(d) || (!!SET.home && ap === SET.home);
const BASE_CHANGES = BASES.slice(1);
const EURO = new Set(["FR","DE","ES","IT","IE","HR","SI","AT","BE","LU","NL","PT","GR","MT","CY","FI","EE","LV","LT","SK"]);
// Pays de la liste 1) a) de l'annexe (règle « jours d'engagement - 0,5 »)
const LIST1A = new Set(["ME","AL","DZ","DE","AD","AT","BE","BA","BG","CY","HR","DK","ES","FI","FR","GR","HU","IE","IS","IT","LU","MK","MT","MA","NO","NL","PL","PT","RO","GB","SK","SI","SE","CH","CZ","TN","RS"]);
// Barème des indemnités journalières du Groupe 1 (pilotes), année 2025. Zone euro : tarif unique.
// Danemark : 222 € jusqu'au 26/11/2025, 289 € à partir du 27/11/2025.
const BAREME = {"2025": {EUR:177, DK:[["2006-11-01",222],["2025-11-27",289]], GB:246, SE:177, CH:247, NO:230, PL:175, CZ:180, HU:175, RO:160, BG:145,
  MA:175, TN:125, DZ:141, AL:130, RS:150, BA:169, MK:117, ME:150, IS:235, TR:135, IL:230}};
const tariffKey = c => EURO.has(c) ? "EUR" : c;
const tName = k => k === "EUR" ? "Zone euro" : k === "??" ? "Pays inconnu (aéroport hors liste)" : (CNAME[k] || k);

let fiscY = null;
let FISC = {y:{}, opt:{lys:true}};
try { const s = JSON.parse(localStorage.getItem("carnet-fisc2")||"null"); if (s && s.y) FISC = Object.assign({y:{}, opt:{lys:true}}, s); } catch(e){}
const saveFisc = () => { try { localStorage.setItem("carnet-fisc2", JSON.stringify(FISC)); } catch(e){} };
const fy = y => (FISC.y[y] ||= {tar:{}, km:"", kmRate:"", other:"", net:"", hotel:"", indem:""});
const fiscYears = () => [...new Set([...D.flights, ...D.hotelsAll, ...D.trans].map(r => r.d.slice(0,4)))].sort();
function curFiscY(){
  const ys = fiscYears();
  if (!fiscY || !ys.includes(fiscY)) { const prev = String(+TODAY.slice(0,4) - 1); fiscY = ys.includes(prev) ? prev : ys[ys.length-1]; }
  return fiscY;
}

const addDays = (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0,10); };
const dayDiff = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 864e5);
// Les heures du carnet sont en heure de Paris (vérifié : les minutes de nuit du carnet s'accordent avec ces heures sur tous les vols testés).
const legDates = f => ({dd: f.d, ad: f.h2 < f.h1 ? addDays(f.d, 1) : f.d});

// Rotations : une rotation se termine à l'arrivée à la base ou au domicile quand le vol suivant part un autre jour.
function buildRotations(withMep = false){
  const src = withMep ? D.flights.concat(D.meps.map(x => Object.assign({}, x, {mep: 1}))) : D.flights;
  const legs = [...src].sort((a,b) => (a.d + a.h1).localeCompare(b.d + b.h1)).map(f => ({...f, ...legDates(f)}));
  const hot = new Set(D.hotelsAll.filter(h => h.n > 0).map(h => h.d + "|" + h.ap));
  const rots = []; let cur = null;
  legs.forEach(l => {
    if (!cur) { cur = {legs:[l], warn:[]}; return; }
    const p = cur.legs[cur.legs.length-1];
    if (isHome(p.a, p.ad) && (l.dd > p.ad || (l.mep && !p.mep))) {   // revenu à la base : une MEP qui suit ouvre la rotation suivante
      if (!isHome(l.o, l.dd) && l.dd === addDays(p.ad, 1) && hot.has(p.ad + "|" + l.o)) {
        cur.warn.push(`Repositionnement vers ${l.o} le ${p.ad} absent des vols : nuit à ${l.o} reconstituée d'après l'hôtel`);
        cur.legs.push(l);
      } else { rots.push(cur); cur = {legs:[l], warn:[]}; }
    } else {
      if (p.a !== l.o && dayDiff(p.ad, l.dd) >= 1) {
        cur.warn.push(`Rotation interrompue à ${p.a} le ${fdate(p.ad)} (vol suivant au départ de ${l.o} le ${fdate(l.dd)}) : une étape manque peut-être dans le planning importé`);
        rots.push(cur); cur = {legs:[l], warn:[]};
      } else {
        if (p.a !== l.o) cur.warn.push(`Rupture de chaîne ${p.a} → ${l.o} le ${l.dd}`);
        cur.legs.push(l);
      }
    }
  });
  if (cur) rots.push(cur);
  // une « rotation » faite uniquement de MEP (aller au simulateur, retour d'une escale…) n'en est pas une
  for (let i = rots.length - 1; i >= 0; i--) if (rots[i].legs.every(l => l.mep)) rots.splice(i, 1);
  const nightAp = (p, l, d) => p.a === l.o ? p.a : (hot.has(d + "|" + l.o) ? l.o : p.a);
  rots.forEach(r => {
    const a = r.legs[0], z = r.legs[r.legs.length-1];
    r.start = a.dd; r.end = z.ad; r.X = dayDiff(r.start, r.end) + 1; r.nights = [];
    for (let i = 1; i < r.legs.length; i++) { const p = r.legs[i-1], l = r.legs[i], g = dayDiff(p.ad, l.dd);
      for (let k = 0; k < g; k++) { const d = addDays(p.ad, k); r.nights.push({d, ap: nightAp(p, l, d)}); } }
    r.origin = a.o; r.base = baseAt(a.dd); r.horsBase = a.o !== r.base;
    if (BASE_CHANGES.some(([d]) => r.start < d && r.end >= d)) r.warn.push("Rotation à cheval sur le changement de base : vérifier le décompte");
    if (!isHome(a.o, a.dd)) r.warn.push(`La rotation commence à ${a.o} : aucune MEP enregistrée depuis la base (importe le relevé d'activité ou le planning du mois)`);
    if (r.X !== r.nights.length + 1) r.warn.push(`${r.X} jours d'engagement pour ${r.nights.length} nuit(s) : à vérifier`);
    if (r.start.slice(0,4) !== r.end.slice(0,4)) r.warn.push("Rotation à cheval sur deux années");
    const parts = [a.o]; r.legs.forEach(l => { if (l.o !== parts[parts.length-1].replace(/ \(MEP\)$/, "")) parts.push("…" + l.o); parts.push(l.a + (l.mep ? " (MEP)" : "")); });
    r.route = parts.join("→");
  });
  return rots;
}
// Indemnités par rotation : (X - 0,5) au total ; 1 par nuit, la fraction restante sur la dernière nuit ; journée sans découcher : 0,5 au tarif zone euro.
// Escale d'au moins 7 h dans un pays hors liste 1) a) : X indemnités au lieu de X - 0,5 (annexe, 1) b)).
function longStop(r){
  const ms = (d, h) => parisToMs(d, h);
  for (let i = 1; i < r.legs.length; i++) { const p = r.legs[i-1], l = r.legs[i]; const c = ctryOf(p.a);
    if (LIST1A.has(c) || c === "??") continue;
    if (ms(l.dd, l.h1) - ms(p.ad, p.h2) >= 7 * 3600e3) return c; }
  return null;
}
function rotItems(r){
  const k = r.nights.length, ls = longStop(r), T = ls ? r.X : r.X - .5;
  if (!k) return ls ? [{d:r.start, ap:r.origin, c:ls, key:tariffKey(ls), q:1, last:true}] : [{d:r.start, ap:r.origin, c:"FR", key:"EUR", q:.5, last:true}];
  return r.nights.map((n, i) => { const c = ctryOf(n.ap), last = i === k - 1;
    return {d:n.d, ap:n.ap, c, key:tariffKey(c), q: last ? T - (k - 1) : 1, last}; });
}
// Barème d'une année : celui de l'année s'il est fourni, sinon le plus récent disponible (calcul provisoire).
// Pour une nouvelle année, ajouter simplement BAREME["2026"] = {...} : il sera utilisé pour 2026 automatiquement.
const barYear = y => BAREME[y] ? y : (Object.keys(BAREME).filter(k => k <= y).sort().pop() || Object.keys(BAREME).sort().pop());
const barProv = y => !BAREME[y];
const barLabel = y => barProv(y) ? `${barYear(y)}, provisoire : barème ${y} pas encore fourni` : y;
function barRate(y, key, date){
  const by = barYear(y), b = BAREME[by] && BAREME[by][key];
  if (b !== undefined) {
    if (Array.isArray(b)) { let v = null; b.forEach(([from, val]) => { if (date >= from) v = val; }); return {v, src:"barème"}; }
    return {v:b, src:"barème"};
  }
  const t = fy(y).tar[key];
  return t && String(t).trim() !== "" ? {v:toNum(t), src:"saisi"} : {v:null, src:"?"};
}
function fiscCourrier(y){
  const o = FISC.opt, all = buildRotations(true);
  const rows = [];
  all.filter(r => (o.lys || r.origin === r.base) && r.start.startsWith(y)).forEach(r => {
    const its = rotItems(r).map(it => { const rt = barRate(y, it.key, it.d); return {...it, rate: rt.v, amt: rt.v == null ? null : it.q * rt.v}; });
    rows.push({r, its, q: its.reduce((a,x) => a + x.q, 0), amt: its.some(x => x.amt == null) ? null : its.reduce((a,x) => a + x.amt, 0)});
  });
  const by = {};
  rows.forEach(w => w.its.forEach(it => { const k = it.key + "|" + it.rate; const b = by[k] ||= {key:it.key, rate:it.rate, q:0, amt:0}; b.q += it.q; b.amt += it.amt || 0; }));
  const hors = rows.filter(w => w.r.horsBase);
  const tot = {rots: rows.length, days: rows.reduce((a,w) => a + w.r.X, 0), q: rows.reduce((a,w) => a + w.q, 0), amt: rows.reduce((a,w) => a + (w.amt || 0), 0),
    missing: rows.some(w => w.amt == null), nights: rows.reduce((a,w) => a + w.r.nights.length, 0), jour: rows.filter(w => !w.r.nights.length).length,
    horsN: hors.length, horsAmt: hors.reduce((a,w) => a + (w.amt || 0), 0)};
  const awayNights = new Set(); all.forEach(r => r.nights.forEach(n => { if (!isHome(n.ap, n.d)) awayNights.add(n.d + "|" + n.ap); }));
  const bys = Object.values(by).sort((a,b) => (a.key === "EUR" ? -1 : b.key === "EUR" ? 1 : a.key.localeCompare(b.key)) || (a.rate||0) - (b.rate||0));
  return {rows, by: bys, tot, awayNights};
}
function fiscData(y){
  const F = D.flights.filter(f => f.d.startsWith(y)), H = D.hotelsAll.filter(h => h.d.startsWith(y)), T = D.trans.filter(t => t.d.startsWith(y)), S = D.sims.filter(s => s.d.startsWith(y) && past(s.d));
  const Tc = T, Tx = [];
  const tr = Tc.filter(t => t.k === "Train"), gp = Tc.filter(t => t.k !== "Train"), paid = Tc.filter(t => t.p != null);
  return {y, F, H, T, Tc, Tx, S, tr, gp, paid, paidSum: paid.reduce((a,t) => a + t.p, 0), missing: tr.filter(t => t.p == null).length,
    days: new Set(F.map(f => f.d)).size, block: F.reduce((a,f) => a + f.m, 0)};
}
function fiscSum(y, c){
  const o = fy(y), km = toNum(o.km) * toNum(o.kmRate), other = toNum(o.other), courrier = c.tot.amt;
  const ak = courrier + km + other, hotel = toNum(o.hotel), indem = toNum(o.indem), net = toNum(o.net), reint = hotel + indem;
  return {courrier, km, other, ak, hotel, indem, reint, net, aj: net ? net + reint : null};
}
// Contrôles de cohérence entre vols, hôtels et simulateur
function fiscChecks(x, c){
  const L = [];
  c.rows.forEach(w => w.r.warn.forEach(m => L.push(`${fdate(w.r.start)} : ${m}`)));
  const hotAway = x.H.filter(h => h.n > 0 && !isHome(h.ap, h.d));
  const unmatched = hotAway.filter(h => !c.awayNights.has(h.d + "|" + h.ap));
  unmatched.forEach(h => L.push(`Hôtel sans rotation correspondante : ${fdate(h.d)}, ${h.ap} (${h.h}). Nuit non comptée dans les indemnités (simulateur, stage ou vol manquant ?).`));
  const awayNoHotel = [...c.awayNights].filter(k => k.startsWith(x.y)).filter(k => !x.H.some(h => h.n > 0 && h.d + "|" + h.ap === k));
  awayNoHotel.forEach(k => { const [d, ap] = k.split("|"); L.push(`Découcher sans hôtel enregistré : ${fdate(d)}, ${ap}. Nuit comptée dans les indemnités, à vérifier avec le relevé hôtels.`); });
  const base = x.H.filter(h => h.n > 0 && isHome(h.ap, h.d));
  if (base.length) L.push(`${base.length} nuit(s) d'hôtel à la base ou au domicile (${[...new Set(base.map(h => h.ap))].join(", ")}) : aucune indemnité de courrier, mais à rapprocher du relevé hôtels.`);
  const sims = x.S.filter(s => s.l && s.l !== "—");
  if (sims.length) L.push(`${sims.length} séance(s) de simulateur (${[...new Set(sims.map(s => s.l))].join(", ")}) non comptées : le simulateur hors base est une interprétation non validée par l'administration (mémento, note n°2).`);
  c.by.filter(b => b.rate == null).forEach(b => L.push(`Barème ${barYear(x.y)} sans tarif pour : ${tName(b.key)}. Indemnités non chiffrées (saisis le tarif).`));
  if (barProv(x.y)) L.push(`Barème ${x.y} pas encore fourni : montants calculés avec le barème ${barYear(x.y)}, à confirmer.`);
  return L;
}
function baseLabel(y){
  const nm = c => `${cityOf(c)}${cityOf(c) !== c ? ` (${c})` : ""}`;
  const changes = BASES.filter(([d]) => d.startsWith(y));
  if (!changes.length) return nm(baseAt(y + "-12-31"));
  return `${nm(baseAt(y + "-01-01"))} jusqu'au ${fdate(addDays(changes[0][0], -1))}, puis ${nm(changes[0][1])} à partir du ${fdate(changes[0][0])}`;
}
function fiscText(x, c){
  const o = fy(x.y), s = fiscSum(x.y, c), L = [];
  L.push(`Détail des frais réels, revenus ${x.y} : ${SET.name || "[Nom Prénom]"}, pilote, base d'affectation ${baseLabel(x.y)}`);
  L.push(`Source : carnet de vol (planning HOP! / Crew Access, calendrier, mails), état au ${fdate(TODAY)}`, "");
  L.push("1) Frais en escale (frais en courrier)");
  L.push("Méthode : lettre de la DLF du 15/02/1999 et annexe (indemnités journalières du Groupe 1, barème " + barLabel(x.y) + ").");
  L.push(`${c.tot.rots} rotations, ${c.tot.days} jours d'engagement, ${c.tot.nights} découchers, ${c.tot.jour} journées sans découcher.`);
  c.by.forEach(b => L.push(`- ${tName(b.key)} : ${fq(b.q)} indemnité${b.q > 1 ? "s" : ""}${b.rate != null ? ` × ${eur(b.rate)} = ${eur(b.amt)}` : " (tarif non renseigné)"}`));
  L.push(`Total frais en courrier : ${c.tot.missing ? "incomplet, " : ""}${eur(c.tot.amt)}`, "");
  L.push("2) Frais de transport domicile-travail");
  if (toNum(o.km)) L.push(`- Voiture : ${o.km} km × ${o.kmRate || "?"} €/km = ${eur(s.km)}`);
  if (s.other) L.push(`3) Autres frais justifiés : ${eur(s.other)}`);
  L.push("", `Total des frais réels (case 1AK) : ${eur(s.ak)}`, "");
  L.push("Réintégrations dans le revenu (case 1AJ) :");
  L.push(`- Coût réel des nuitées payées par l'employeur (Relevé Hôtels ${x.y}) : ${s.hotel ? eur(s.hotel) : "à compléter"}`);
  L.push(`- Autres sommes versées au titre des frais d'emploi (bas des bulletins) : ${s.indem ? eur(s.indem) : "à compléter"}`, "");
  L.push("Justificatifs disponibles : carnet de vol, relevé récapitulatif des déplacements, Relevés Hôtels, billets de transport.", "");
  L.push("Annexe : détail des rotations");
  c.rows.forEach(w => L.push(`${fdate(w.r.start)}${w.r.end !== w.r.start ? " → " + fdate(w.r.end) : ""} | ${w.r.route} | ${w.r.X} j | ${w.r.nights.length ? w.r.nights.map(n => n.ap).join(", ") : "sans découcher"} | ${fq(w.q)} ind. | ${w.amt != null ? eur(w.amt) : "—"}`));
  return L.join("\n");
}
const foldBox = (k, title, body) => `<details class="panel fold" data-k="${k}"${openStats[k]?" open":""}><summary><h3>${title}</h3></summary>${body}</details>`;
const finput = (attr, v, ph = "—", label = "") => `<input class="fin" inputmode="decimal" ${attr} value="${esc(v)}" placeholder="${ph}" aria-label="${esc(label)}">`;

function paneFisc(){
  if (!fiscYears().length) return `<div class="empty">Pas encore de vols.</div>`;
  const ys = fiscYears(), y = curFiscY(), x = fiscData(y), o = fy(y), c = fiscCourrier(y), s = fiscSum(y, c);
  const dates = [...D.flights, ...D.hotelsAll, ...D.trans].map(r => r.d).sort();
  let h = `<div class="chips" role="group" aria-label="Année fiscale">${ys.map(v => `<button class="chip" data-fy="${v}" aria-pressed="${v===y}">${v}</button>`).join("")}</div>`;
  if (y === dates[0].slice(0,4)) h += `<div class="note">Le carnet commence le ${fdate(dates[0])} : ce qui précède n'y figure pas, le récap ${y} est donc incomplet.</div>`;
  if (y === TODAY.slice(0,4)) h += `<div class="note">Année en cours, arrêtée au ${fdate(TODAY)}.</div>`;
  h += `<div class="summary"><span>Base d'affectation : <b>${baseLabel(y)}</b></span></div>`;
  if (barProv(y)) h += `<div class="note">Barème ${y} des indemnités journalières pas encore fourni : calcul <b>provisoire</b> avec le barème ${barYear(y)}, qui n'est pas la version à jour. Il sera recalculé dès que le barème ${y} sera ajouté.</div>`;
  h += foldBox("fmeth", "Méthode appliquée et sources", `<div class="meth">
    <p>Option des navigants (lettre DLF du 15/02/1999) : au lieu de justifier chaque dépense en escale, on déduit des indemnités forfaitaires au barème de l'État, <b>Groupe 1</b> pour les pilotes. Cette option est <b>indivisible</b> pour l'année : aucun autre frais en escale ne peut s'y ajouter (mémento p. 15).</p>
    <p><b>Nombre d'indemnités par rotation</b> (pays de la liste 1 a) : France et pays européens dont Allemagne, Espagne, Italie, Irlande, Croatie, Slovénie, Autriche, Danemark, Suède, Royaume-Uni) : jours d'engagement − 0,5. Un jour d'engagement est un jour civil (heure de Paris) touché par tout ou partie de la rotation. Une journée sans découcher compte 0,5 indemnité au tarif zone euro.</p>
    <p><b>Tarif</b> : celui du pays où l'on découche ; en zone euro, un tarif unique. Par convention, la fraction restante est affectée à la dernière nuit de la rotation (mémento, exemples p. 16).</p>
    <p><b>Réintégration obligatoire</b> dans le revenu (case 1AJ) : le coût réel des chambres d'hôtel payées par l'employeur et toutes les indemnités perçues (annexe de la lettre, mémento p. 15). La déduction totale va en case 1AK.</p>
    <p><b>Base</b> : réglée dans « Mon planning ». Une rotation part de la base ; une nuit à la base ou à l'aéroport du domicile n'est pas un découcher. En cas de changement de base (base d'hiver par exemple), ajoute la date dans les réglages.</p>
    <p>Sont exclus : réserves et astreintes, visites médicales, activités au sol et simulateur à la base. Le simulateur hors base n'est pas validé par l'administration (note n°2). Ce mémento est la version d'avril 2024 (revenus 2023) : vérifie qu'aucune règle n'a changé pour 2025.</p></div>`);
  h += `<div class="panel"><h3>Frais en courrier ${y}${barProv(y) ? ` <span class="pill warn">provisoire · barème ${barYear(y)}</span>` : ""}</h3>
    <div class="summary"><span><b>${c.tot.rots}</b> rotations</span><span><b>${c.tot.days}</b> jours d'engagement</span><span><b>${c.tot.nights}</b> découchers</span><span><b>${c.tot.jour}</b> journées sans découcher</span><span><b>${fq(c.tot.q)}</b> indemnités</span></div>`;
  if (!c.rows.length) h += `<div class="muted" style="margin-top:10px">Aucune rotation en ${y}.</div>`;
  else {
    h += `<div class="tw" style="margin-top:10px"><table><thead><tr><th>Tarif</th><th class="r">Indemnités</th><th class="r">€ / jour</th><th class="r">Montant</th></tr></thead><tbody>`
      + c.by.map(b => `<tr><td>${esc(tName(b.key))}</td><td class="r mono">${fq(b.q)}</td><td class="r mono">${b.rate != null ? eur(b.rate) : finput(`data-tar="${b.key}"`, o.tar[b.key] || "", "€ / jour", "Tarif " + tName(b.key))}</td><td class="r mono">${b.rate != null ? eur(b.amt) : "—"}</td></tr>`).join("")
      + `<tr><td><b>Total</b></td><td class="r mono"><b>${fq(c.tot.q)}</b></td><td></td><td class="r mono"><b>${eur(c.tot.amt)}</b>${c.tot.missing ? " (incomplet)" : ""}</td></tr></tbody></table></div>`;
    if (c.tot.horsN) h += `<div class="hint">Dont ${c.tot.horsN} rotation${c.tot.horsN > 1 ? "s" : ""} au départ d'un aéroport autre que la base (${eur(c.tot.horsAmt)}).</div>`;
  }
  h += `<div class="opts noprint">
    <label class="opt"><input type="checkbox" data-opt="lys"${FISC.opt.lys ? " checked" : ""}> <span>Compter les rotations qui ne partent pas de la base (départ du domicile ou mise en place, à confirmer)</span></label></div></div>`;
  const checks = fiscChecks(x, c);
  h += `<div class="panel"><h3>Contrôles (${checks.length})</h3>${checks.length ? `<ul class="checks">${checks.map(m => `<li>${esc(m)}</li>`).join("")}</ul>` : `<div class="muted">Aucune anomalie détectée.</div>`}</div>`;
  h += `<div class="panel"><h3>Réintégrations dans le revenu (case 1AJ)</h3><div class="tw"><table><tbody>
    <tr><td>Net imposable annuel (bulletin de décembre), facultatif</td><td class="r">${finput(`data-f="net"`, o.net, "—", "Net imposable annuel")}</td></tr>
    <tr><td>Coût réel des nuitées (document Relevés Hôtels ${y})</td><td class="r">${finput(`data-f="hotel"`, o.hotel, "—", "Coût réel des nuitées")}</td></tr>
    <tr><td>Autres frais d'emploi des bulletins (forfait transport PN, repas en France, repas à l'étranger…)</td><td class="r">${finput(`data-f="indem"`, o.indem, "—", "Frais d'emploi des bulletins")}</td></tr>
    <tr><td><b>Total à réintégrer</b></td><td class="r mono" id="s-reint">${s.reint ? eur(s.reint) : "—"}</td></tr>
    <tr><td><b>Case 1AJ</b> (net imposable + réintégrations)</td><td class="r mono" id="s-aj">${s.aj != null ? eur(s.aj) : "—"}</td></tr></tbody></table></div>
    <div class="hint">Les montants viennent de tes documents RH (bulletins de paie, Relevés Hôtels). Ils sont gardés sur cet appareil.</div></div>`;
  h += `<div class="panel"><h3>Trajets domicile ↔ base</h3><div class="hint" style="margin:0 0 8px">Billets de train ou de GP payés : ajoute-les dans « Autres frais justifiés » si tu les déduis.</div>
    <div class="tw" style="margin-top:10px"><table><tbody>
    <tr><td>Kilomètres en voiture</td><td class="r">${finput(`data-f="km"`, o.km, "—", "Kilomètres en voiture")}</td></tr>
    <tr><td>Barème kilométrique (€ / km)</td><td class="r">${finput(`data-f="kmRate"`, o.kmRate, "—", "Barème kilométrique")}</td></tr>
    </tbody></table></div>
    <div class="hint">Au-delà de 40 km entre le domicile et le lieu de travail, la déduction est limitée aux 40 premiers km sauf circonstances particulières justifiées (mémento p. 18-19). Le barème kilométrique n'est pas dans les documents fournis.</div></div>`;
  h += `<div class="panel"><h3>Récapitulatif ${y}</h3><div class="tw"><table><tbody>
    <tr><td>Frais en courrier</td><td class="r mono" id="s-courrier">${c.tot.amt ? eur(c.tot.amt) : "—"}</td></tr>
    <tr><td>Indemnités kilométriques</td><td class="r mono" id="s-km">${s.km ? eur(s.km) : "—"}</td></tr>
    <tr><td>Autres frais justifiés (€)</td><td class="r">${finput(`data-f="other"`, o.other, "—", "Autres frais justifiés")}</td></tr>
    <tr><td><b>Case 1AK</b> (total des frais réels)</td><td class="r mono" id="s-ak">${s.ak ? eur(s.ak) : "—"}</td></tr>
    <tr><td>10 % de la case 1AJ, pour comparer</td><td class="r mono" id="s-cmp">${s.aj != null ? "≈ " + eur(Math.round(s.aj * 10) / 100) : "—"}</td></tr>
    </tbody></table></div>
    <div class="hint">Les frais réels ne valent que si la case 1AK dépasse la déduction forfaitaire de 10 %, qui a un minimum et un plafond annuels que je n'ai pas : le chiffre est approximatif. Récap indicatif, à valider avec tes justificatifs.</div>
    <div class="actions noprint"><button class="chip" data-act="copy" type="button">Copier le détail</button></div></div>`;
  h += foldBox("ftxt", "Texte du détail (à copier dans la déclaration)", `<textarea class="ftext" id="fText" readonly rows="14">${esc(fiscText(x, c))}</textarea>`);
  h += foldBox("frot", `Détail des rotations (${c.rows.length})`, c.rows.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Route</th><th class="r">Jours</th><th>Nuits</th><th class="r">Indem.</th><th class="r">Montant</th></tr></thead><tbody>`
    + c.rows.map(w => `<tr><td class="mono">${fdate(w.r.start)}${w.r.end !== w.r.start ? " → " + fdate(w.r.end) : ""}</td><td class="mono wrap">${esc(w.r.route)}</td><td class="r mono">${w.r.X}</td><td class="mono">${w.r.nights.length ? w.r.nights.map(n => n.ap).join(", ") : '<span class="muted">sans</span>'}</td><td class="r mono">${fq(w.q)}</td><td class="r mono">${w.amt != null ? eur(w.amt) : "—"}</td></tr>`).join("") + `</tbody></table></div>` : `<div class="muted">—</div>`);
  h += foldBox("fhot", `Détail des nuits d'hôtel (${x.H.length})`, x.H.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Escale</th><th>Hôtel</th><th>Type</th><th class="r">Nuits</th></tr></thead><tbody>`
    + x.H.map(hh => { const typ = hh.n === 0 ? "repos de jour" : isHome(hh.ap, hh.d) ? "base / domicile" : c.awayNights.has(hh.d + "|" + hh.ap) ? "découcher" : "hors rotation";
      return `<tr><td class="mono">${fdate(hh.d)}</td><td class="mono"><b>${hh.ap}</b> <span class="muted">${esc(cityOf(hh.ap))}</span></td><td>${esc(hh.h)}</td><td><span class="pill${typ === "découcher" ? " ok" : ""}">${typ}</span></td><td class="r mono">${hh.n || "—"}</td></tr>`; }).join("") + `</tbody></table></div>` : `<div class="muted">—</div>`);
  h += foldBox("ftra", `Détail des trajets (${x.T.length})`, x.T.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Mode</th><th>Trajet</th><th>Réf.</th><th class="r">Prix</th></tr></thead><tbody>`
    + x.T.map(t => `<tr><td class="mono">${fdate(t.d)}</td><td>${t.k === "Train" ? "Train" : '<span class="pill">GP</span>'}</td><td class="wrap">${esc(t.o)} <span class="muted">→</span> ${esc(t.a)}</td><td class="mono">${esc(t.ref) || '<span class="muted">—</span>'}</td><td class="r mono">${t.p != null ? eur(t.p) : '<span class="muted">—</span>'}</td></tr>`).join("") + `</tbody></table></div>` : `<div class="muted">—</div>`);
  return h;
}
function refreshFisc(){
  const y = curFiscY(), x = fiscData(y), c = fiscCourrier(y), s = fiscSum(y, c);
  const set = (id, v, pre = "") => { const e = document.getElementById(id); if (e) e.textContent = v ? pre + eur(v) : "—"; };
  set("s-reint", s.reint); set("s-courrier", c.tot.amt); set("s-km", s.km); set("s-ak", s.ak);
  const aj = document.getElementById("s-aj"); if (aj) aj.textContent = s.aj != null ? eur(s.aj) : "—";
  const cmp = document.getElementById("s-cmp"); if (cmp) cmp.textContent = s.aj != null ? "≈ " + eur(Math.round(s.aj * 10) / 100) : "—";
  const t = document.getElementById("fText"); if (t) t.value = fiscText(x, c);
}
async function copyText(t, btn){
  let ok = false;
  try { await navigator.clipboard.writeText(t); ok = true; } catch(e){}
  if (!ok) { try { const ta = document.createElement("textarea"); ta.value = t; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); ok = document.execCommand("copy"); ta.remove(); } catch(e){} }
  const old = btn.textContent; btn.textContent = ok ? "Copié ✓" : "Copie impossible : ouvre « Texte du détail »"; setTimeout(() => { btn.textContent = old; }, 2200);
}
$("#pane").addEventListener("input", e => {
  const t = e.target; if (!(t instanceof HTMLInputElement) || st.tab !== "fisc" || !t.dataset.f) return;
  fy(curFiscY())[t.dataset.f] = t.value; saveFisc(); refreshFisc();
});
$("#pane").addEventListener("change", e => {
  const t = e.target; if (!(t instanceof HTMLInputElement) || st.tab !== "fisc") return;
  if (t.dataset.tar) { fy(curFiscY()).tar[t.dataset.tar] = t.value; saveFisc(); renderPane(sel()); }
  else if (t.dataset.opt) { FISC.opt[t.dataset.opt] = t.checked; saveFisc(); renderPane(sel()); }
});
$("#pane").addEventListener("click", e => {
  const b = e.target.closest("[data-fy]"); if (b) { fiscY = b.dataset.fy; renderPane(sel()); return; }
  const a = e.target.closest("[data-act]"); if (!a) return;
  if (a.dataset.act === "print") { try { window.print(); } catch(_) {} }
  if (a.dataset.act === "copy") { const y = curFiscY(); copyText(fiscText(fiscData(y), fiscCourrier(y)), a); }
});
addEventListener("beforeprint", () => { if (st.tab === "fisc") document.querySelectorAll("#pane details").forEach(d => { d.open = true; }); });


// ---------- onglet Jours : vol, sol, réserve, congés, OFF ----------
const DAYS_START = (() => { const ds = [...D.flights.map(f => f.d), ...D.sims.map(s => s.d), ...Object.keys(D.days)].sort(); return ds[0] ? ds[0].slice(0,8) + "01" : TODAY; })();
const DCAT = [
  ["vol",  "Vol",            "var(--night)"],
  ["sol",  "Sol / simu",     "var(--accent)"],
  ["res",  "Réserve",        "var(--warn)"],
  ["arret","Arrêt",          "var(--ink-3)"],
  ["cp",   "Congés",         "var(--ok)"],
  ["off",  "OFF",            "var(--day)"],
];
const DLAB = Object.fromEntries(DCAT.map(([k,l]) => [k,l])), DCOL = Object.fromEntries(DCAT.map(([k,,c]) => [k,c]));
const WORK = new Set(["vol","sol","res"]);
const JOURS_SEM = ["dim.","lun.","mar.","mer.","jeu.","ven.","sam."];
function easter(y){ const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1; return `${y}-${String(mo).padStart(2,"0")}-${String(da).padStart(2,"0")}`; }
const FERIES = {};
function feries(y){ if (FERIES[y]) return FERIES[y]; const e = easter(y), o = {};
  [["01-01","Jour de l'an"],["05-01","Fête du travail"],["05-08","Victoire 1945"],["07-14","Fête nationale"],["08-15","Assomption"],["11-01","Toussaint"],["11-11","Armistice"],["12-25","Noël"]].forEach(([md,n]) => o[`${y}-${md}`] = n);
  o[addDays(e,1)] = "Lundi de Pâques"; o[addDays(e,39)] = "Ascension"; o[addDays(e,50)] = "Lundi de Pentecôte";
  return FERIES[y] = o; }
// Dernier jour suivi : fin du dernier relevé d'activité ou dernière donnée importée (vol, simu, jour du planning),
// jamais au-delà d'aujourd'hui. Après, le planning n'est pas encore connu : ces jours ne comptent pas en OFF.
const DAYS_END = (() => { const ds = [...Object.values(DB.releves || {}).map(r => r.to || ""), ...D.flights.map(f => legDates(f).ad), ...D.sims.map(s => s.d), ...Object.keys(D.days)].filter(Boolean).sort();
  const last = ds.length ? ds[ds.length - 1] : TODAY; return last < TODAY ? last : TODAY; })();
let _dayMap = null;
function dayMap(){
  if (_dayMap) return _dayMap;
  const m = {}, rot = new Set(), sims = new Set(D.sims.filter(s => past(s.d)).map(s => s.d));
  buildRotations().forEach(r => { for (let d = r.start; d <= r.end; d = addDays(d, 1)) rot.add(d); });
  const ex = D.days || {};
  for (let d = DAYS_START; d <= DAYS_END; d = addDays(d, 1)) {
    const ks = ex[d] || [];
    m[d] = rot.has(d) ? "vol" : (sims.has(d) || ks.includes("sol")) ? "sol" : ks.includes("res") ? "res"
      : ks.includes("arret") ? "arret" : ks.includes("cp") ? "cp" : "off";
  }
  return _dayMap = m;
}
const legendHtml = cats => `<div class="legend">${DCAT.filter(([k]) => cats.has(k)).map(([k,l,c]) => `<span><i style="background:${c}"></i>${l}</span>`).join("")}</div>`;
function paneJours(){
  const M = dayMap(); const ds = Object.keys(M).filter(d => inP(d));
  if (!ds.length) return `<div class="empty">Aucun jour suivi sur cette période (le suivi va du ${fdate(DAYS_START)} au ${fdate(DAYS_END)}).</div>`;
  const cnt = {}; ds.forEach(d => cnt[M[d]] = (cnt[M[d]] || 0) + 1);
  const work = ds.filter(d => WORK.has(M[d])), rest = ds.filter(d => ["off","cp"].includes(M[d]));
  const we = work.filter(d => { const w = new Date(d + "T12:00:00Z").getUTCDay(); return w === 0 || w === 6; });
  const fe = work.filter(d => feries(+d.slice(0,4))[d]);
  // séries
  let bestW = [0,""], bestR = [0,""], cw = 0, cr = 0;
  const SERIES_START = SET.seriesStart || DAYS_START;
  ds.filter(d => d >= SERIES_START).forEach(d => { if (WORK.has(M[d])) { cw++; cr = 0; if (cw > bestW[0]) bestW = [cw, d]; } else { cr = ["off","cp"].includes(M[d]) ? cr + 1 : 0; cw = 0; if (cr > bestR[0]) bestR = [cr, d]; } });
  const cats = new Set(Object.keys(cnt));
  let h = `<div class="summary">${DCAT.filter(([k]) => cnt[k]).map(([k,l]) => `<span><b>${cnt[k]}</b> ${l.toLowerCase()}</span>`).join("")}</div>`;
  h += `<div class="grid2">
    <div class="panel"><h3>Travail</h3><div class="kv"><span>Jours travaillés</span><b>${work.length}</b></div><div class="kv"><span>dont week-ends</span><b>${we.length}</b></div><div class="kv"><span>Plus longue série</span><b>${bestW[0]} j</b></div></div>
    <div class="panel"><h3>Repos</h3><div class="kv"><span>OFF</span><b>${cnt.off||0}</b></div><div class="kv"><span>Congés</span><b>${cnt.cp||0}</b></div><div class="kv"><span>Plus long repos</span><b>${bestR[0]} j</b></div>${bestR[0] ? `<div class="hint">Jusqu'au ${fdate(bestR[1])}</div>` : ""}</div></div>`;
  // mois
  const months = [...new Set(ds.map(d => d.slice(0,7)))];
  h += `<div class="panel"><div class="block-head"><h3>Par mois</h3>${legendHtml(cats)}</div><div class="mrows">${months.map(mk => {
    const md = ds.filter(d => d.startsWith(mk)), c = {}; md.forEach(d => c[M[d]] = (c[M[d]]||0) + 1);
    return `<div class="mrow"><span class="ml mono">${MOIS[+mk.slice(5)-1]} ${mk.slice(2,4)}</span><span class="mbar">${DCAT.filter(([k]) => c[k]).map(([k,l,col]) => `<i style="flex:${c[k]};background:${col}" title="${l} : ${c[k]} j"></i>`).join("")}</span><span class="mv mono">${md.filter(d => WORK.has(M[d])).length} trav. · ${(c.off||0)+(c.cp||0)} repos</span></div>`; }).join("")}</div></div>`;
  // calendrier du mois sélectionné
  if (st.m) {
    const mk = `${st.y}-${st.m}`, first = new Date(mk + "-01T12:00:00Z"), pad = (first.getUTCDay() + 6) % 7, n = new Date(Date.UTC(+st.y, +st.m, 0)).getUTCDate();
    let cal = `<div class="cal">${["L","M","M","J","V","S","D"].map(x => `<b>${x}</b>`).join("")}${"<span></span>".repeat(pad)}`;
    for (let i = 1; i <= n; i++) { const d = `${mk}-${String(i).padStart(2,"0")}`, k = M[d], f = feries(+st.y)[d];
      cal += `<span class="cd${k ? "" : " out"}" style="${k ? `--c:${DCOL[k]};color:${["vol","sol","res","arret","cp"].includes(k) ? "var(--bg)" : "var(--ink)"}` : ""}" title="${fdate(d)}${k ? " · " + DLAB[k] : ""}${f ? " · " + f : ""}">${i}${f ? "<em>•</em>" : ""}</span>`; }
    h += `<div class="panel"><h3>${MOIS_L[+st.m-1]} ${st.y}</h3>${cal}</div></div>`;
  } else h += `<div class="hint">Choisis un mois en haut pour voir le calendrier jour par jour.</div>`;
  h += `<div class="hint">Jours suivis jusqu'au ${fdate(DAYS_END)}${DAYS_END < TODAY ? " (dernière donnée importée) : les jours suivants seront comptés quand ton planning ou ton relevé les couvrira" : ""}.</div>`;
  h += `<div class="hint">Jours de vol : chaque jour d'une rotation, escales comprises. OFF, congés, réserves, arrêts et activités sol viennent des relevés d'activité (et, pour les mois sans relevé, des événements « journée entière » du planning). Tout jour sans vol, sol, réserve, arrêt ni congés est compté en OFF (y compris les jours de mise en place seuls et les jours sans événement). Week-ends travaillés : samedis et dimanches de vol, sol ou réserve.</div>`;
  return h;
}

// ---------- onglet Bilan ----------
let bilanY = null;
function bilanYears(){ return [...new Set(D.flights.map(f => f.d.slice(0,4)))].sort(); }
function bilanData(y){
  const F = D.flights.filter(f => f.d.startsWith(y)); if (!F.length) return null;
  const H = D.hotels.filter(h => h.d.startsWith(y) && h.n > 0 && h.ap !== baseAt(h.d));
  const S = D.sims.filter(s => s.d.startsWith(y) && past(s.d));
  const block = F.reduce((a,f) => a + f.m, 0), night = F.reduce((a,f) => a + f.n, 0), nm = F.reduce((a,f) => a + f.nm, 0), km = nm * 1.852;
  const arr = {}; F.forEach(f => { if (!isHome(f.a, f.d)) arr[f.a] = (arr[f.a]||0) + 1; });
  const firstSeen = {}; D.flights.forEach(f => { if (!isHome(f.a, f.d) && !(f.a in firstSeen)) firstSeen[f.a] = f.d; });
  const nouv = Object.entries(firstSeen).filter(([,d]) => d.startsWith(y)).sort((a,b) => a[1].localeCompare(b[1]));
  const pays = new Set(F.flatMap(f => [AP[f.o].p, AP[f.a].p]).filter(p => p && p !== "??"));
  const paysAvant = new Set(D.flights.filter(f => f.d < y).flatMap(f => [AP[f.o].p, AP[f.a].p]));
  const byDay = {}; F.forEach(f => { const b = byDay[f.d] ||= {m:0, n:0, legs:[]}; b.m += f.m; b.n++; b.legs.push(f); });
  const dayMax = Object.entries(byDay).sort((a,b) => b[1].m - a[1].m)[0], legsMax = Object.entries(byDay).sort((a,b) => b[1].n - a[1].n || b[1].m - a[1].m)[0];
  const byMonth = {}; F.forEach(f => byMonth[f.d.slice(0,7)] = (byMonth[f.d.slice(0,7)]||0) + f.m);
  const monthMax = Object.entries(byMonth).sort((a,b) => b[1] - a[1])[0];
  const longest = [...F].sort((a,b) => b.m - a.m)[0], farthest = [...F].sort((a,b) => b.nm - a.nm)[0];
  const rots = buildRotations().filter(r => r.start.startsWith(y)), rotMax = [...rots].sort((a,b) => b.X - a.X || b.legs.length - a.legs.length)[0];
  const routes = group(F, f => [f.o,f.a].sort().join(" ⇄ "), () => 1);
  const hotels = group(H.filter(x => x.h && !/^inconnu/i.test(x.h)), h => h.h, h => h.n), cdb = group(F.filter(f => f.c), f => f.c, () => 1);
  const M = dayMap(), ds = Object.keys(M).filter(d => d.startsWith(y)), dc = {}; ds.forEach(d => dc[M[d]] = (dc[M[d]]||0) + 1);
  const we = ds.filter(d => WORK.has(M[d]) && [0,6].includes(new Date(d + "T12:00:00Z").getUTCDay())).length;
  return {y, F, H, S, block, night, nm, km, tours: km / 40075, arr, nouv, pays, paysNew: [...pays].filter(p => !paysAvant.has(p)), dayMax, legsMax, monthMax, longest, farthest, rotMax,
    routes, hotels, cdb, dc, we, days: new Set(F.map(f => f.d)).size, sim: S.reduce((a,s) => a + s.m, 0), first: F[0], partial: y === TODAY.slice(0,4), startsLate: D.flights[0].d.startsWith(y) && D.flights[0].d > y + "-01-07"};
}
const cname = c => CNAME[c] || c;
function bilanText(b){
  const L = [`Mon année ${b.y} de pilote${b.partial ? ` (au ${fdate(TODAY)})` : ""}`];
  L.push(`✈️ ${hm(b.block)} de vol, ${b.F.length} étapes, ${b.days} jours de vol`);
  L.push(`🌍 ${fr(Math.round(b.km))} km, soit ${b.tours.toLocaleString("fr-FR",{maximumFractionDigits:1})} fois le tour de la Terre`);
  L.push(`📍 ${Object.keys(b.arr).length} escales dans ${b.pays.size} pays${b.nouv.length ? `, dont ${b.nouv.length} nouvelles` : ""}`);
  L.push(`🌙 ${hm(b.night)} de nuit, ${b.H.reduce((a,h)=>a+h.n,0)} nuits d'hôtel`);
  if (b.longest) L.push(`⏱️ Plus longue étape : ${b.longest.o}→${b.longest.a}, ${hm(b.longest.m)}`);
  if (b.dayMax) L.push(`🔥 Plus grosse journée : ${hm(b.dayMax[1].m)} de vol le ${fdate(b.dayMax[0])}`);
  return L.join("\n");
}
function paneBilan(){
  const ys = bilanYears(); if (!ys.length) return `<div class="empty">Pas encore de vols.</div>`;
  if (!bilanY || !ys.includes(bilanY)) bilanY = ys.includes(TODAY.slice(0,4)) ? TODAY.slice(0,4) : ys[ys.length-1];
  const b = bilanData(bilanY);
  let h = `<div class="chips" role="group" aria-label="Année du bilan">${ys.map(v => `<button class="chip" data-by="${v}" aria-pressed="${v===bilanY}">${v}</button>`).join("")}</div>`;
  if (b.partial) h += `<div class="note">Année en cours : bilan au ${fdate(TODAY)}.</div>`;
  if (b.startsLate) h += `<div class="note">Le carnet commence le ${fdate(D.flights[0].d)} : l'année ${b.y} n'est pas complète.</div>`;
  const tiles = [
    [hm(b.block), "heures de vol", `${b.F.length} étapes · ${b.days} jours de vol`],
    [fr(Math.round(b.km)), "kilomètres", `${b.tours.toLocaleString("fr-FR",{maximumFractionDigits:1})} tours de la Terre`],
    [String(Object.keys(b.arr).length), "escales", `${b.pays.size} pays${b.nouv.length ? ` · ${b.nouv.length} nouvelles` : ""}`],
    [hm(b.night), "de nuit", `${Math.round(b.night / Math.max(1,b.block) * 100)} % du temps de vol`],
    [String(b.H.reduce((a,h)=>a+h.n,0)), "nuits d'hôtel", `${new Set(b.H.map(x=>x.h)).size} hôtels`],
    [String((b.dc.off||0) + (b.dc.rep||0)), "jours OFF", `${b.dc.cp||0} jours de congés`],
    [String(b.we), "week-ends", "jours travaillés le samedi ou le dimanche"],
    [hm(b.sim), "simulateur", `${b.S.length} séance${b.S.length > 1 ? "s" : ""}`],
  ];
  h += `<div class="tiles">${tiles.map(([v,l,s]) => `<div class="tile"><span class="eyebrow">${l}</span><b>${v}</b><span class="sub">${s}</span></div>`).join("")}</div>`;
  const rec = [
    ["Plus longue étape", b.longest && `${b.longest.o} → ${b.longest.a} · ${hm(b.longest.m)}`, b.longest && fdate(b.longest.d)],
    ["Plus loin", b.farthest && `${b.farthest.o} → ${b.farthest.a} · ${fr(b.farthest.nm)} NM`, b.farthest && fdate(b.farthest.d)],
    ["Plus grosse journée", b.dayMax && `${hm(b.dayMax[1].m)} en ${b.dayMax[1].n} étapes`, b.dayMax && fdate(b.dayMax[0])],
    ["Mois le plus chargé", b.monthMax && `${MOIS_L[+b.monthMax[0].slice(5)-1]} · ${hm(b.monthMax[1])}`, ""],
  ].filter(r => r[1]);
  const fav = [
    ["Ligne la plus volée", b.routes[0] && b.routes[0][0], b.routes[0] && `${b.routes[0][1]} étapes`],
    ["Hôtel le plus fréquent", b.hotels[0] && b.hotels[0][0], b.hotels[0] && `${b.hotels[0][1]} nuits`],
  ].filter(r => r[1]);
  const rows = arr => arr.map(([k,v,s]) => `<div class="rec"><span class="muted">${k}</span><b>${esc(v)}</b>${s ? `<span class="mono muted">${esc(s)}</span>` : ""}</div>`).join("");
  h += `<div class="grid3"><div class="panel"><h3>Records</h3>${rows(rec)}</div><div class="panel"><h3>Favoris</h3>${rows(fav)}</div>
    <div class="panel"><h3>Nouveautés ${b.y}</h3>${b.nouv.length ? `<div class="newap">${b.nouv.map(([k,d]) => `<span class="pill" title="Première arrivée le ${fdate(d)}">${k} <span class="muted">${esc(cityOf(k))}</span></span>`).join("")}</div>` : '<div class="muted">Aucune nouvelle escale.</div>'}
    ${b.paysNew.length ? `<div class="hint">Nouveaux pays : ${b.paysNew.map(cname).join(", ")}</div>` : ""}${b.startsLate ? `<div class="hint">Le carnet commençant en ${MOIS_L[+D.flights[0].d.slice(5,7)-1]} ${b.y}, toutes les escales de cette année comptent comme nouvelles.</div>` : ""}</div></div>`;
  h += `<div class="panel"><h3>À partager</h3><textarea class="ftext" id="bText" readonly rows="8">${esc(bilanText(b))}</textarea><div class="actions"><button class="chip" type="button" data-act="bcopy">Copier le bilan</button></div></div>`;
  return h;
}
$("#pane").addEventListener("click", e => {
  const b = e.target.closest("[data-by]"); if (b) { bilanY = b.dataset.by; renderPane(sel()); return; }
  const a = e.target.closest('[data-act="bcopy"]'); if (a) copyText(bilanText(bilanData(bilanY)), a);
});

function renderPane(c){
  const fn = {vols:paneVols,dest:paneDest,jours:paneJours,simu:paneSimu,hotel:paneHotel,trans:paneTrans,bilan:paneBilan,fisc:paneFisc}[st.tab] || paneVols;
  document.body.dataset.tab = st.tab;
  $("#pane").innerHTML = fn(c);
  document.querySelectorAll("#pane details.fold").forEach(d => d.addEventListener("toggle", () => { openStats[d.dataset.k] = d.open; }));
  const q = $("#q"); if (q) q.addEventListener("input", e => { st.q = e.target.value; const pos = e.target.selectionStart; renderPane(sel()); const n = $("#q"); n.focus(); n.setSelectionRange(pos,pos); });
}

function update(){
  save(); const c = sel();
  renderPeriod(); renderHero(c); renderChart(); renderMap(c.F); renderTabs(c); renderPane(c);
}
$("#foot").innerHTML = `<div>Dernière mise à jour : ${DB.imported ? fdate(DB.imported.slice(0,10)) : "—"}${Object.keys(DB.releves).length ? ` · relevés d'activité : ${Object.keys(DB.releves).sort().map(k => MOIS[+k.slice(5)-1] + " " + k.slice(2,4)).join(", ")}` : ""}. Pour actualiser, importe ton planning ou un nouveau relevé depuis « Importer » : les nouvelles données s'ajoutent, l'historique est conservé.</div>
<div>Heures bloc : relevés d'activité HOP! (heures réelles) quand ils sont importés, sinon planning. « prog. » signale une étape encore en heures programmées. Nuit au sens EASA : de la fin du crépuscule civil du soir au début de l'aube civile, calculée minute par minute le long de la route orthodromique. « ATT N » = arrivée de nuit.</div>
<div>Tout est calculé et enregistré sur ce téléphone : aucune donnée n'est envoyée. Le récap impôts est indicatif, à valider avec tes justificatifs.</div>`;
let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { renderChart(); renderMap(sel().F); }, 120); });
update();
loadLand();
}

// ---------- démarrage ----------
$("#openSetup").addEventListener("click", () => { const s = $("#setup"); showSetup(s.hidden); $("#closeSetup").hidden = false; if (!s.hidden) s.scrollIntoView({behavior: "smooth", block: "start"}); });
$("#closeSetup").addEventListener("click", () => showSetup(false));
$("#setupBody").addEventListener("click", e => { const b = e.target.closest("[data-bdel]"); if (!b) return; SET.bases.splice(+b.dataset.bdel, 1); renderSetup(); });
if (HAS_DATA) { $("#who").innerHTML = SET.name ? ` <span>·</span> ${esc(SET.name)}` : ""; main(); }
else { document.body.classList.add("nodata"); showSetup(true);
  $("#setup .block-head").insertAdjacentHTML("afterend", `<p class="welcome">Ton carnet de vol, construit à partir de tes <b>relevés d'activité</b> HOP! et de ton <b>planning</b> : heures bloc réelles, heures de nuit EASA, immatriculations, escales, hôtels, simulateur, jours OFF, bilan de l'année et calcul des frais en courrier pour les impôts. Rien n'est envoyé nulle part : tout reste sur ce téléphone. Commence par importer un relevé d'activité ou ton planning.</p>`); }
showFlash();

// Installation sur l'écran d'accueil : conseillée sur iPhone comme sur Android
const standalone = window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
let installPrompt = null;
function showInstall(){
  if (standalone || lsGet("carnetHop.installHint", false)) return;
  const b = $("#install"), txt = $("#installText"), go = $("#installGo");
  if (IOS) txt.innerHTML = `<b>Installe le carnet sur ton iPhone</b> : touche <b>Partager</b> puis « <b>Sur l'écran d'accueil</b> », et ouvre-le depuis l'icône. Importe tes données <b>depuis l'icône</b> : Safari et l'app installée ne partagent pas leurs données.`;
  else if (installPrompt) { txt.innerHTML = `<b>Installe le carnet sur ton téléphone</b> : il s'ouvrira comme une app, même sans réseau.`; go.hidden = false; }
  else if (ANDROID) txt.innerHTML = `<b>Installe le carnet sur ton téléphone</b> : menu <b>⋮</b> de Chrome puis « <b>Installer l'application</b> » (ou « Ajouter à l'écran d'accueil »).`;
  else return;
  b.hidden = false;
}
addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; showInstall(); });
$("#installGo").addEventListener("click", async () => { if (!installPrompt) return; installPrompt.prompt(); try { await installPrompt.userChoice; } catch (e) {} installPrompt = null; $("#install").hidden = true; });
$("#installOk").addEventListener("click", () => { $("#install").hidden = true; lsSet("carnetHop.installHint", true); });
showInstall();
// Demande au navigateur de ne pas effacer les données
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
// Hors ligne et mises à jour : service worker
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").then(reg => {
    reg.addEventListener("updatefound", () => { const w = reg.installing; if (!w) return;
      w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) {
        const u = $("#update"); u.hidden = false; u.addEventListener("click", () => location.reload()); } }); });
  }).catch(e => console.warn("service worker", e));
}
