// Petit générateur de classeur Excel (.xlsx), sans bibliothèque : un .xlsx est une archive zip de fichiers XML.
// Feuilles : {name, cols: [{h: "Titre", t: "str"|"num"|"int"|"year"|"date"|"time"|"dur"|"eur"|"pct", w: largeur}], rows: [[...]], total: [...] facultatif}
// Valeurs : texte, nombre, "AAAA-MM-JJ" pour une date, "HH:MM" pour une heure, minutes pour une durée.
export function makeXlsx(sheets, meta = {}){
  const enc = new TextEncoder();
  const x = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  const colName = i => { let s = ""; i++; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
  // styles : 0 normal, 1 en-tête, 2 date, 3 heure, 4 durée [h]:mm, 5 euros, 6 nombre, 7 total texte, 8 total durée, 9 total euros, 10 total nombre, 11 titre, 12 entier, 13 total entier, 14 %
  const ST = {str: 0, date: 2, time: 3, dur: 4, eur: 5, num: 6, int: 12, pct: 14, year: 0}, STT = {str: 7, date: 7, time: 7, dur: 8, eur: 9, num: 10, int: 13, pct: 7, year: 7};
  const serial = d => (Date.UTC(+d.slice(0,4), +d.slice(5,7) - 1, +d.slice(8,10)) - Date.UTC(1899, 11, 30)) / 864e5;
  function cell(ref, v, t, s){
    if (v === null || v === undefined || v === "") return "";
    if (t === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return `<c r="${ref}" s="${s}"><v>${serial(v)}</v></c>`;
    if (t === "time" && /^\d{1,2}:\d{2}$/.test(v)) { const [h, m] = v.split(":"); return `<c r="${ref}" s="${s}"><v>${(+h * 60 + +m) / 1440}</v></c>`; }
    if (t === "dur" && typeof v === "number") return `<c r="${ref}" s="${s}"><v>${v / 1440}</v></c>`;
    if (typeof v === "number" && isFinite(v) && t !== "str") return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr" s="${t === "str" ? s : (s === 1 || s === 7 || s === 11 ? s : 0)}"><is><t xml:space="preserve">${x(v)}</t></is></c>`;
  }
  function sheetXml(sh){
    const out = [], n = sh.cols.length, last = colName(n - 1);
    let r = 1;
    if (sh.title) { out.push(`<row r="1">${cell("A1", sh.title, "str", 11)}</row>`); r = 2; }
    if (sh.note) { out.push(`<row r="${r}">${cell("A" + r, sh.note, "str", 0)}</row>`); r++; }
    if (sh.title || sh.note) r++;
    const head = r;
    out.push(`<row r="${r}">${sh.cols.map((c, i) => cell(colName(i) + r, c.h, "str", 1)).join("")}</row>`);
    sh.rows.forEach(row => { r++; out.push(`<row r="${r}">${sh.cols.map((c, i) => cell(colName(i) + r, row[i], c.t || "str", ST[c.t || "str"])).join("")}</row>`); });
    if (sh.total) { r++; out.push(`<row r="${r}">${sh.cols.map((c, i) => cell(colName(i) + r, sh.total[i], c.t || "str", STT[c.t || "str"])).join("")}</row>`); }
    const cols = `<cols>${sh.cols.map((c, i) => `<col min="${i+1}" max="${i+1}" width="${c.w || 12}" customWidth="1"/>`).join("")}</cols>`;
    const pane = `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${head}" topLeftCell="A${head + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`;
    const filt = sh.rows.length && sh.filter !== false ? `<autoFilter ref="A${head}:${last}${head + sh.rows.length}"/>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pane}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${out.join("")}</sheetData>${filt}</worksheet>`;
  }
  const names = []; const sheetName = s => { let b = String(s).replace(/[\\\/?*\[\]:]/g, " ").slice(0, 31) || "Feuille", k = b, i = 2; while (names.includes(k)) k = b.slice(0, 28) + " " + i++; names.push(k); return k; };
  const nm = sheets.map(s => sheetName(s.name));
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="hh:mm"/><numFmt numFmtId="166" formatCode="[h]:mm"/><numFmt numFmtId="167" formatCode="#,##0.00\\ &quot;€&quot;"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDE6F2"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="15">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="166" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="167" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${nm.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
    ["docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(meta.title || "Carnet de vol")}</dc:title><dc:creator>${x(meta.author || "Carnet de vol")}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0,19)}Z</dcterms:created></cp:coreProperties>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${nm.map((n, i) => `<sheet name="${x(n)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("")}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${nm.map((_, i) => `<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("")}<Relationship Id="rId${nm.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", styles],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i+1}.xml`, sheetXml(s)]),
  ];
  return zipStore(files.map(([n, t]) => [enc.encode(n), enc.encode(t)]));
}

// Archive zip sans compression (méthode « stored »), lisible par Excel, Numbers, Google Sheets et LibreOffice.
function zipStore(entries){
  const T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  const crc = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const now = new Date(), dt = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate(), tm = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const parts = [], cen = []; let off = 0;
  entries.forEach(([name, data]) => {
    const c = crc(data), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, tm, true); h.setUint16(12, dt, true);
    h.setUint32(14, c, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const e = new DataView(new ArrayBuffer(46));
    e.setUint32(0, 0x02014b50, true); e.setUint16(4, 20, true); e.setUint16(6, 20, true); e.setUint16(8, 0x0800, true); e.setUint16(10, 0, true); e.setUint16(12, tm, true); e.setUint16(14, dt, true);
    e.setUint32(16, c, true); e.setUint32(20, data.length, true); e.setUint32(24, data.length, true); e.setUint16(28, name.length, true);
    e.setUint32(42, off, true);
    cen.push(new Uint8Array(e.buffer), name);
    off += 30 + name.length + data.length;
  });
  const cenSize = cen.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, cenSize, true); end.setUint32(16, off, true);
  const all = [...parts, ...cen, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0; all.forEach(b => { out.set(b, p); p += b.length; });
  return out;
}
