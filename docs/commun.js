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

// Modèles détaillés (cote par année) et moyennes pondérées par le nombre d'annonces
const modeles = Object.entries(G).filter(([k, g]) => g.forme && k !== '*' && !k.endsWith('|*'));
const moyP = (f, filtre = () => true) => { let w = 0, s = 0; for (const [, g] of modeles) { if (!filtre(g)) continue; const v = f(g); if (v == null || !isFinite(v)) continue; w += g.n; s += g.n * v; } return w ? s / w : NaN; };
const perte10k = (lp, a, b) => 1 - Math.exp((lp(b) - lp(a)) / ((b - a) / 10000));
const C1 = (() => { const bA = moyP(g => g.b[1]), bK = moyP(g => g.b[2]); return {an: 1 - Math.exp(bA), km10: 1 - Math.exp(bK), kmEquiv: bA / bK * 10000, kmParAn: M.kmParAn}; })();

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

// Méthode et limites (communes aux deux pages ; chaque page peut ajouter ses propres lignes)
function afficherLimites(propres = []) {
  $('#limites').innerHTML = [
    `${NF.format(M.n)} annonces de voitures d'occasion publiées sur leboncoin, collectées ${esc(M.periode)}. Les prix symboliques et valeurs impossibles sont écartés.`,
    `Ce sont des <b>prix demandés</b> : le prix réellement payé est souvent un peu plus bas après négociation.`,
    M.plafondCollecte ? `La collecte n'est pas encore complète au-delà de ${NF.format(M.plafondCollecte)} € : les voitures plus chères, souvent récentes, sont sous-représentées.` : null,
    `Pour chaque modèle, le prix est relié à l'année, au kilométrage, au carburant, à la boîte et au type de vendeur. Testé sur ${NF.format(M.evaluation.test)} annonces non utilisées pour le calcul : l'estimation se trompe en moyenne (médiane) de ${pc(M.evaluation.cote.erreurMediane)} sur le prix.`,
    ...propres,
    `L'outil ne voit ni l'état, ni la finition, ni l'historique de la voiture : c'est un repère, pas une expertise.`,
  ].filter(Boolean).map(t => `<li>${t}</li>`).join('');
}
