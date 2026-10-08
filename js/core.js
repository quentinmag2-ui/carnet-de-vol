// Carnet de vol HOP! — données de base et calculs (aéroports, heure de Paris, nuit EASA, distances).
// Module sans interface : utilisé par l'app et par les tests Node.

// Aéroports : ville, pays (ISO), latitude, longitude
export const AIRPORTS = {
AGF:["Agen","FR",44.174,0.591],NCY:["Annecy","FR",45.929,6.099],DOL:["Deauville","FR",49.365,0.154],LEH:["Le Havre","FR",49.534,0.088],DLE:["Dole","FR",47.039,5.427],
BZR:["Béziers","FR",43.324,3.354],CCF:["Carcassonne","FR",43.216,2.306],LPY:["Le Puy","FR",45.081,3.763],EBU:["Saint-Étienne","FR",45.541,4.296],VAF:["Valence-Chabeuil","FR",44.921,4.970],
XCR:["Châlons-Vatry","FR",48.776,4.206],SNR:["Saint-Nazaire","FR",47.312,-2.157],CER:["Cherbourg","FR",49.650,-1.470],BVE:["Brive","FR",45.040,1.486],DCM:["Castres","FR",43.556,2.289],
ANG:["Angoulême","FR",45.729,0.221],LUG:["Lugano","CH",46.004,8.911],SIR:["Sion","CH",46.220,7.327],FDH:["Friedrichshafen","DE",47.671,9.511],PAD:["Paderborn","DE",51.614,8.616],
DTM:["Dortmund","DE",51.518,7.612],FKB:["Karlsruhe","DE",48.779,8.080],SCN:["Sarrebruck","DE",49.215,7.110],ERF:["Erfurt","DE",50.980,10.958],RLG:["Rostock","DE",53.918,12.278],
POZ:["Poznań","PL",52.421,16.826],KTW:["Katowice","PL",50.474,19.080],BTS:["Bratislava","SK",48.170,17.213],SJJ:["Sarajevo","BA",43.825,18.331],TGD:["Podgorica","ME",42.359,19.252],
SKP:["Skopje","MK",41.962,21.621],SKG:["Thessalonique","GR",40.520,22.971],HER:["Héraklion","GR",35.340,25.180],CFU:["Corfou","GR",39.602,19.912],RHO:["Rhodes","GR",36.405,28.086],
BGY:["Bergame","IT",45.674,9.704],AOI:["Ancône","IT",43.616,13.362],SUF:["Lamezia Terme","IT",38.905,16.242],TSF:["Trévise","IT",45.648,12.194],RMI:["Rimini","IT",44.020,12.612],
PEG:["Pérouse","IT",43.096,12.513],PSR:["Pescara","IT",42.432,14.181],TPS:["Trapani","IT",37.912,12.488],GRX:["Grenade","ES",37.189,-3.777],RMU:["Murcie","ES",37.803,-1.125],
LEI:["Almería","ES",36.844,-2.370],ZAZ:["Saragosse","ES",41.666,-1.042],LCG:["La Corogne","ES",43.302,-8.377],EXT:["Exeter","GB",50.734,-3.414],CWL:["Cardiff","GB",51.397,-3.343],
JER:["Jersey","JE",49.208,-2.196],GCI:["Guernesey","GG",49.435,-2.602],INV:["Inverness","GB",57.542,-4.048],NWI:["Norwich","GB",52.676,1.283],AAR:["Aarhus","DK",56.300,10.619],
MMX:["Malmö","SE",55.536,13.376],NOC:["Knock","IE",53.910,-8.818],KIR:["Kerry","IE",52.181,-9.524],OST:["Ostende","BE",51.199,2.862],LGG:["Liège","BE",50.637,5.443],
CRL:["Charleroi","BE",50.459,4.453],MST:["Maastricht","NL",50.912,5.770],GRQ:["Groningue","NL",53.120,6.580],
AGP:["Malaga","ES",36.675,-4.499],BCN:["Barcelone","ES",41.297,2.078],BER:["Berlin","DE",52.367,13.503],BES:["Brest","FR",48.448,-4.418],BHX:["Birmingham","GB",52.454,-1.748],
BIO:["Bilbao","ES",43.301,-2.911],BIQ:["Biarritz","FR",43.468,-1.523],BLL:["Billund","DK",55.74,9.152],BOD:["Bordeaux","FR",44.828,-0.716],BRI:["Bari","IT",41.139,16.761],
BSL:["Bâle-Mulhouse","FR",47.59,7.529],CAG:["Cagliari","IT",39.251,9.054],CDG:["Paris CDG","FR",49.01,2.548],CFE:["Clermont-Ferrand","FR",45.786,3.169],CFR:["Caen","FR",49.173,-0.45],
DBV:["Dubrovnik","HR",42.561,18.268],DUB:["Dublin","IE",53.421,-6.27],DUS:["Düsseldorf","DE",51.289,6.767],EDI:["Édimbourg","GB",55.95,-3.373],FRA:["Francfort","DE",50.033,8.57],
GOT:["Göteborg","SE",57.663,12.28],HAJ:["Hanovre","DE",52.461,9.685],HAM:["Hambourg","DE",53.63,9.988],IBZ:["Ibiza","ES",38.873,1.373],LJU:["Ljubljana","SI",46.224,14.458],
LYS:["Lyon","FR",45.726,5.091],MAD:["Madrid","ES",40.472,-3.561],MAN:["Manchester","GB",53.354,-2.275],MPL:["Montpellier","FR",43.576,3.963],MUC:["Munich","DE",48.354,11.786],
MXP:["Milan Malpensa","IT",45.63,8.723],NAP:["Naples","IT",40.886,14.291],NCE:["Nice","FR",43.658,7.216],NCL:["Newcastle","GB",55.038,-1.692],NTE:["Nantes","FR",47.153,-1.611],
NUE:["Nuremberg","DE",49.499,11.067],OLB:["Olbia","IT",40.899,9.518],ORK:["Cork","IE",51.841,-8.491],PMI:["Palma","ES",39.552,2.739],PMO:["Palerme","IT",38.176,13.091],
PUF:["Pau","FR",43.38,-0.419],RNS:["Rennes","FR",48.072,-1.733],SPU:["Split","HR",43.539,16.298],STR:["Stuttgart","DE",48.69,9.222],SVQ:["Séville","ES",37.418,-5.893],
TLS:["Toulouse","FR",43.629,1.364],TRN:["Turin","IT",45.201,7.65],VCE:["Venise","IT",45.505,12.352],VIE:["Vienne","AT",48.11,16.57],VLC:["Valence","ES",39.489,-0.482],
VRN:["Vérone","IT",45.395,10.889],ZAG:["Zagreb","HR",45.743,16.069],
ORY:["Paris Orly","FR",48.723,2.379],LBG:["Le Bourget","FR",48.969,2.441],BVA:["Beauvais","FR",49.454,2.113],MRS:["Marseille","FR",43.439,5.221],LIL:["Lille","FR",50.57,3.106],
SXB:["Strasbourg","FR",48.538,7.628],AJA:["Ajaccio","FR",41.924,8.803],BIA:["Bastia","FR",42.553,9.484],CLY:["Calvi","FR",42.531,8.793],FSC:["Figari","FR",41.501,9.098],
LRH:["La Rochelle","FR",46.179,-1.195],EGC:["Bergerac","FR",44.825,0.519],RDZ:["Rodez","FR",44.408,2.483],AUR:["Aurillac","FR",44.891,2.422],LDE:["Lourdes","FR",43.179,-0.006],
PGF:["Perpignan","FR",42.741,2.87],TLN:["Toulon","FR",43.097,6.146],CMF:["Chambéry","FR",45.638,5.88],GNB:["Grenoble","FR",45.363,5.329],LIG:["Limoges","FR",45.863,1.18],
PIS:["Poitiers","FR",46.587,0.307],TUF:["Tours","FR",47.432,0.728],DNR:["Dinard","FR",48.588,-2.08],LAI:["Lannion","FR",48.754,-3.471],UIP:["Quimper","FR",47.975,-4.168],
LRT:["Lorient","FR",47.761,-3.44],ETZ:["Metz-Nancy","FR",48.982,6.251],CHR:["Châteauroux","FR",46.862,1.731],AVN:["Avignon","FR",43.907,4.902],FNI:["Nîmes","FR",43.757,4.416],
AMS:["Amsterdam","NL",52.31,4.768],RTM:["Rotterdam","NL",51.957,4.437],EIN:["Eindhoven","NL",51.45,5.375],BRU:["Bruxelles","BE",50.901,4.484],LUX:["Luxembourg","LU",49.627,6.211],
LHR:["Londres Heathrow","GB",51.47,-0.454],LGW:["Londres Gatwick","GB",51.148,-0.19],LCY:["London City","GB",51.505,0.055],BRS:["Bristol","GB",51.383,-2.719],SOU:["Southampton","GB",50.95,-1.357],
LBA:["Leeds","GB",53.866,-1.661],EMA:["East Midlands","GB",52.831,-1.328],GLA:["Glasgow","GB",55.872,-4.433],ABZ:["Aberdeen","GB",57.202,-2.198],BFS:["Belfast","GB",54.657,-6.216],
SNN:["Shannon","IE",52.702,-8.925],GVA:["Genève","CH",46.238,6.109],ZRH:["Zurich","CH",47.458,8.548],BRN:["Berne","CH",46.914,7.499],LIN:["Milan Linate","IT",45.445,9.277],
BLQ:["Bologne","IT",44.535,11.289],FLR:["Florence","IT",43.81,11.205],PSA:["Pise","IT",43.684,10.393],FCO:["Rome","IT",41.8,12.239],CTA:["Catane","IT",37.467,15.066],
BDS:["Brindisi","IT",40.658,17.947],TRS:["Trieste","IT",45.827,13.472],GOA:["Gênes","IT",44.413,8.838],AHO:["Alghero","IT",40.632,8.291],LIS:["Lisbonne","PT",38.774,-9.134],
OPO:["Porto","PT",41.248,-8.681],FAO:["Faro","PT",37.014,-7.966],ALC:["Alicante","ES",38.282,-0.558],SCQ:["Saint-Jacques","ES",42.896,-8.415],OVD:["Oviedo","ES",43.563,-6.035],
VGO:["Vigo","ES",42.232,-8.627],XRY:["Jerez","ES",36.744,-6.06],MAH:["Minorque","ES",39.863,4.219],SDR:["Santander","ES",43.427,-3.82],CPH:["Copenhague","DK",55.618,12.656],
AAL:["Aalborg","DK",57.093,9.85],ARN:["Stockholm","SE",59.652,17.919],OSL:["Oslo","NO",60.194,11.1],BGO:["Bergen","NO",60.293,5.218],SVG:["Stavanger","NO",58.877,5.638],
HEL:["Helsinki","FI",60.317,24.963],WAW:["Varsovie","PL",52.166,20.967],KRK:["Cracovie","PL",50.078,19.785],WRO:["Wroclaw","PL",51.103,16.886],GDN:["Gdansk","PL",54.378,18.466],
PRG:["Prague","CZ",50.101,14.26],BUD:["Budapest","HU",47.437,19.256],OTP:["Bucarest","RO",44.571,26.085],SOF:["Sofia","BG",42.695,23.406],BEG:["Belgrade","RS",44.818,20.309],
ATH:["Athènes","GR",37.936,23.947],LCA:["Larnaca","CY",34.875,33.625],MLA:["Malte","MT",35.857,14.477],TIA:["Tirana","AL",41.415,19.721],CGN:["Cologne","DE",50.866,7.143],
LEJ:["Leipzig","DE",51.424,12.236],DRS:["Dresde","DE",51.133,13.767],BRE:["Brême","DE",53.047,8.787],FMO:["Münster","DE",52.134,7.685],SZG:["Salzbourg","AT",47.793,13.004],
INN:["Innsbruck","AT",47.26,11.344],GRZ:["Graz","AT",46.991,15.44],LNZ:["Linz","AT",48.233,14.188],RAK:["Marrakech","MA",31.607,-8.036],CMN:["Casablanca","MA",33.367,-7.59],
AGA:["Agadir","MA",30.325,-9.413],TNG:["Tanger","MA",35.727,-5.917],OUD:["Oujda","MA",34.787,-1.924],FEZ:["Fès","MA",33.927,-4.978],ALG:["Alger","DZ",36.691,3.215],
ORN:["Oran","DZ",35.624,-0.621],TUN:["Tunis","TN",36.851,10.227],DJE:["Djerba","TN",33.875,10.775],TLV:["Tel Aviv","IL",32.011,34.887],IST:["Istanbul","TR",41.275,28.752],
RIX:["Riga","LV",56.924,23.971],VNO:["Vilnius","LT",54.634,25.286],TLL:["Tallinn","EE",59.413,24.833],KEF:["Reykjavik","IS",63.985,-22.606]
};
export const COUNTRY = {FR:"France",DE:"Allemagne",ES:"Espagne",IT:"Italie",GB:"Royaume-Uni",IE:"Irlande",HR:"Croatie",DK:"Danemark",SE:"Suède",SI:"Slovénie",AT:"Autriche",
 NL:"Pays-Bas",BE:"Belgique",LU:"Luxembourg",CH:"Suisse",PT:"Portugal",NO:"Norvège",FI:"Finlande",PL:"Pologne",CZ:"Tchéquie",HU:"Hongrie",RO:"Roumanie",BG:"Bulgarie",
 RS:"Serbie",GR:"Grèce",CY:"Chypre",MT:"Malte",AL:"Albanie",MA:"Maroc",DZ:"Algérie",TN:"Tunisie",IL:"Israël",TR:"Turquie",LV:"Lettonie",LT:"Lituanie",EE:"Estonie",IS:"Islande",
 BA:"Bosnie-Herzégovine",MK:"Macédoine du Nord",ME:"Monténégro",SK:"Slovaquie",JE:"Jersey",GG:"Guernesey","??":"Pays inconnu"};


const P_TZ = new Intl.DateTimeFormat("en-CA", {timeZone:"Europe/Paris", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false});
export function parisParts(ms){ const o = {}; P_TZ.formatToParts(new Date(ms)).forEach(p => o[p.type] = p.value); const hh = o.hour === "24" ? "00" : o.hour;
  return {d: `${o.year}-${o.month}-${o.day}`, h: `${hh}:${o.minute}`}; }
// Heure de Paris → instant (ms) : on teste les deux décalages possibles
export function parisToMs(d, h){ for (const off of [1, 2]) { const ms = Date.parse(`${d}T${h}:00Z`) - off * 3600e3; const p = parisParts(ms); if (p.d === d && p.h === h) return ms; }
  return Date.parse(`${d}T${h}:00Z`) - 3600e3; }


// ---------- calculs : nuit (EASA, crépuscule civil), décollage / arrivée de nuit, distance ----------
export const RADI = x => x * Math.PI / 180, DEGR = x => x * 180 / Math.PI;
export function sunElev(ms, lat, lon){
  const d = ms / 864e5 + 2440587.5 - 2451545.0;
  const g = RADI((357.529 + 0.98560028 * d) % 360), q = (280.459 + 0.98564736 * d) % 360;
  const L = RADI((q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) % 360), e = RADI(23.439 - 0.00000036 * d);
  const dec = Math.asin(Math.sin(e) * Math.sin(L)), ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24, lst = RADI(((gmst * 15 + lon) % 360 + 360) % 360);
  return DEGR(Math.asin(Math.sin(RADI(lat)) * Math.sin(dec) + Math.cos(RADI(lat)) * Math.cos(dec) * Math.cos(lst - ra)));
}
export function gcPoint(A, B, f){
  const p1 = RADI(A[2]), l1 = RADI(A[3]), p2 = RADI(B[2]), l2 = RADI(B[3]);
  const dl = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (dl === 0) return {la: A[2], lo: A[3], D: 0};
  const a = Math.sin((1 - f) * dl) / Math.sin(dl), b = Math.sin(f * dl) / Math.sin(dl);
  const x = a * Math.cos(p1) * Math.cos(l1) + b * Math.cos(p2) * Math.cos(l2), y = a * Math.cos(p1) * Math.sin(l1) + b * Math.cos(p2) * Math.sin(l2), z = a * Math.sin(p1) + b * Math.sin(p2);
  return {la: DEGR(Math.atan2(z, Math.sqrt(x * x + y * y))), lo: DEGR(Math.atan2(y, x)), D: dl};
}
export function flightCalc(o, a, t0, m){
  const A = AIRPORTS[o], B = AIRPORTS[a];
  if (!A || !B) return {n:0, ln:0, tn:0, nm:0, unknown:true};
  let n = 0; for (let i = 0; i < m; i++) { const p = gcPoint(A, B, (i + .5) / m); if (sunElev(t0 + (i + .5) * 6e4, p.la, p.lo) < -6) n++; }
  return {n, tn: sunElev(t0, A[2], A[3]) < -6 ? 1 : 0, ln: sunElev(t0 + m * 6e4, B[2], B[3]) < -6 ? 1 : 0, nm: Math.round(gcPoint(A, B, .5).D * 3440.065)};
}


// ---------- petites aides de dates ----------
export const addDays = (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const dayDiff = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 864e5);
export const hhmmToMin = h => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };
// Durée entre deux heures « HH:MM » de Paris le même jour de départ (arrivée le lendemain si l'heure est plus petite)
export function blockMinutes(d, h1, h2){
  const ad = h2 < h1 ? addDays(d, 1) : d;
  return Math.round((parisToMs(ad, h2) - parisToMs(d, h1)) / 6e4);
}

// Flotte HOP! : deux familles seulement, E70 (E170/E175) et E90 (E190/E195)
export function normType(ty){
  const t = String(ty || "").toUpperCase().replace(/\s/g, "");
  if (/^E?1?7[05]$|^E1?7[05]|^ERJ?17/.test(t)) return "E70";
  if (/^E?1?9[05]$|^E1?9[05]|^ERJ?19/.test(t)) return "E90";
  return t;
}

// Type avion déduit de l'immatriculation (flotte HOP!) : l'immatriculation l'emporte sur le planning.
export function typeFromReg(im){
  if (/^F-HBX/.test(im || "")) return "E70";
  if (/^F-HB[LQ]/.test(im || "")) return "E90";
  return "";
}

// Nuit EASA, arrivée / décollage de nuit et distance d'une étape, à partir de la date et des heures de Paris.
// Un vol local (départ = arrivée) a 0 NM ; ses minutes de nuit sont calculées à l'aéroport.
export function computeFlight(f){
  const m = blockMinutes(f.d, f.h1, f.h2);
  const x = flightCalc(f.o, f.a, parisToMs(f.d, f.h1), m);
  return Object.assign(f, {m, n: x.n, ln: x.ln, tn: x.tn, nm: x.nm});
}
