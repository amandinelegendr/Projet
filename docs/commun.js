// Code commun aux deux pages : données du modèle de prix, mise en forme, liens leboncoin.
const M = window.MODELE_PRIX, G = M.groupes, CARBUS = M.carburants, AREF = M.anneeRef, NOEUDS = [5, 10, 15, 20, 25];
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const NF = new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 0});
const arr = v => v >= 10000 ? Math.round(v / 100) * 100 : Math.round(v / 50) * 50;
const eur = v => NF.format(arr(v)) + ' €';
const pc = (x, d = 0) => (x * 100).toLocaleString('fr-FR', {minimumFractionDigits: d, maximumFractionDigits: d}) + ' %';
const arrondi = (v, p) => Math.round(v / p) * p;
const Z5 = 1.645, Z25 = 0.674;

// Modèles détaillés (cote par année)
const modeles = Object.entries(G).filter(([k, g]) => g.forme && k !== '*' && !k.endsWith('|*'));
// Prix moyen d'un modèle pour une année, un kilométrage et un carburant (null = mélange réel de l'année)
function prixModele(g, an, km, carb) {
  const c = g.annees?.[an]; if (!c || c.length < 20) return null;
  const k = km / 10000, f = c.slice(5, 11), x = c.slice(11, 20).slice();
  if (carb) for (let j = 1; j < CARBUS.length; j++) x[2 + j] = CARBUS[j] === carb ? 1 : 0;
  let lp = c[1] + f[0] * k + NOEUDS.reduce((s, n, j) => s + f[1 + j] * Math.max(0, k - n), 0);
  for (let j = 0; j < 9; j++) lp += g.forme[6 + j] * x[j];
  const u = carb ? g.carbuAnnee?.[an]?.[carb] : null; if (u) lp += u[1];
  return {moyen: Math.exp(lp), bon: Math.exp(lp - Z25 * c[2])};
}
// Perte de valeur par an (entre 4 et 15 ans, à 120 000 km), mise en cache
const cacheDepr = new Map();
function deprAn(g) {
  if (cacheDepr.has(g)) return cacheDepr.get(g);
  const pts = []; for (let a = 4; a <= 15; a++) { const c = g.annees?.[AREF - a]; if (c && c[0] >= 30) { const p = prixModele(g, AREF - a, 120000, null); if (p) pts.push([a, Math.log(p.moyen)]); } }
  let v = null;
  if (pts.length >= 5) { const ma = pts.reduce((s, p) => s + p[0], 0) / pts.length, ml = pts.reduce((s, p) => s + p[1], 0) / pts.length; v = 1 - Math.exp(pts.reduce((s, p) => s + (p[0] - ma) * (p[1] - ml), 0) / pts.reduce((s, p) => s + (p[0] - ma) ** 2, 0)); }
  cacheDepr.set(g, v); return v;
}

// Repères sur tout le marché (modèles courants) : perte de valeur médiane et 1er quartile (le quart qui perd le moins vite)
let reperes = null;
function repereDepr() {
  if (reperes) return reperes;
  const v = modeles.filter(([, g]) => g.n >= 300).map(([, g]) => deprAn(g)).filter(x => x != null).sort((a, b) => a - b);
  return reperes = {med: v[v.length >> 1], q1: v[Math.floor(v.length / 4)]};
}

// ---------- Liens vers les annonces leboncoin (recherche pré-remplie : toujours les annonces du moment) ----------
// Codes des filtres leboncoin : par défaut MARQUE en majuscules et MARQUE_Modèle ; exceptions relevées sur le site (lbc-modeles.js)
const LBC_CARBU = {'Essence': 1, 'Diesel': 2, 'GPL / GNV': 3, 'Électrique': 4, 'Autre': 5, 'Hybride': 6, 'Hybride rechargeable': 6};
function lienLeboncoin({marque, modele, annee, carb, prixMax, kmMax}) {
  const p = new URLSearchParams({category: '2'});
  if (marque) {
    const code = (window.LBC_MODELES || {})[marque + '|' + (modele || '')] || [marque.toUpperCase(), modele ? marque.toUpperCase() + '_' + modele : null];
    p.set('u_car_brand', code[0]); if (modele && code[1]) p.set('u_car_model', code[1]);
  }
  if (annee) p.set('regdate', annee + '-' + annee);
  if (carb && LBC_CARBU[carb]) p.set('fuel', LBC_CARBU[carb]);
  if (prixMax) p.set('price', 'min-' + Math.round(prixMax / 100) * 100);
  if (kmMax) p.set('mileage', 'min-' + Math.round(kmMax / 5000) * 5000);
  return 'https://www.leboncoin.fr/recherche?' + p.toString();
}
