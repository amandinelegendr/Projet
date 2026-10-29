/* Calculs partagés par index.html et analyse.html : modèle de prix par modèle de voiture et verdict sur une annonce. */
(function () {
  const ANNEE = new Date().getFullYear();

  // Titres qui annoncent un véhicule à problème
  const PROBLEME = /accident|sinistr|dans l.?[ée]tat|pour pi[eè]ces|et pi[eè]ces|\blot de\b|[ée]change|[ée]pave|\bhs\b|en panne|panne moteur|ne d[ée]marre|non roulant|moteur (cass|mort|bloqu)|joint de culasse|bo[iî]te (cass|hs)|export|marchand|professionnel uniquement|grêl/i;

  const age = a => { const y = +a.annee; return y >= 1950 && y <= ANNEE + 1 ? Math.max(0, ANNEE - y) : null; };
  // Annonce exploitable pour le modèle de prix : écarte prix symboliques et valeurs aberrantes
  const exploitable = a => a.prix >= 300 && a.prix <= 400000 && a.km != null && a.km >= 0 && a.km <= 800000 && age(a) != null && a.modele && a.modele !== 'Autres';

  function moindresCarres(X, y) {
    const p = X[0].length, A = Array.from({length: p}, () => Array(p + 1).fill(0));
    for (let i = 0; i < X.length; i++) for (let r = 0; r < p; r++) { for (let c = 0; c < p; c++) A[r][c] += X[i][r] * X[i][c]; A[r][p] += X[i][r] * y[i]; }
    for (let c = 0; c < p; c++) { // Gauss avec pivot partiel
      let m = c; for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r;
      if (Math.abs(A[m][c]) < 1e-9) return null; [A[c], A[m]] = [A[m], A[c]];
      for (let r = 0; r < p; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= p; k++) A[r][k] -= f * A[c][k]; }
    }
    return A.map((row, i) => row[p] / row[i]);
  }

  // Régression log(prix) = b0 + b1·âge + b2·km/10 000, par modèle (≥ 30 annonces exploitables)
  function ajusterModeles(annonces) {
    const g = {};
    for (const a of annonces) if (exploitable(a)) (g[a.marque + '|' + a.modele] ||= []).push(a);
    const res = {};
    for (const [k, v] of Object.entries(g)) {
      if (v.length < 30) continue;
      const X = v.map(a => [1, age(a), a.km / 1e4]), y = v.map(a => Math.log(a.prix));
      const b = moindresCarres(X, y); if (!b) continue;
      const resid = v.map((a, i) => y[i] - (b[0] + b[1] * X[i][1] + b[2] * X[i][2]));
      const sigma = Math.sqrt(resid.reduce((s, e) => s + e * e, 0) / Math.max(1, v.length - 3));
      const ages = v.map(age), kms = v.map(a => a.km);
      res[k] = {b, sigma, n: v.length, ageMin: Math.min(...ages), ageMax: Math.max(...ages), kmMin: Math.min(...kms), kmMax: Math.max(...kms)};
    }
    return res;
  }
  const estimer = (m, ag, km) => Math.exp(m.b[0] + m.b[1] * ag + m.b[2] * km / 1e4);
  const arrondi = v => Math.round(v / 50) * 50;
  const pc = x => Math.round(Math.abs(x) * 100) + ' %';
  // Un seul formateur réutilisé : toLocaleString en recrée un à chaque appel (trop lent sur 100 000 annonces)
  const NF = new Intl.NumberFormat('fr-FR', {maximumFractionDigits: 0});
  const eur = n => NF.format(Math.round(n)) + ' €';

  /* Verdict sur une annonce {marque, modele, annee, km, prix, titre?}.
     Renvoie null si on ne peut pas juger, sinon {code, libelle, icone, phrase, conseil, estimation, bas, haut, ecart, fiable, n}. */
  function verdict(a, modeles) {
    const m = modeles[a.marque + '|' + a.modele], ag = age(a);
    if (!m) return {code: 'inconnu', libelle: 'Pas assez de données', icone: '?', phrase: `Moins de 30 annonces de ce modèle dans la base : impossible de situer le prix.`, conseil: ''};
    if (ag == null || a.km == null || !a.prix) return {code: 'inconnu', libelle: 'Infos manquantes', icone: '?', phrase: 'Année, kilométrage ou prix manquant : impossible de situer le prix.', conseil: ''};
    const e = estimer(m, ag, a.km), ecart = a.prix / e - 1, bas = e * Math.exp(-m.sigma), haut = e * Math.exp(m.sigma);
    const fiable = ag >= m.ageMin && ag <= m.ageMax && a.km >= m.kmMin && a.km <= m.kmMax;
    const r = {estimation: arrondi(e), bas: arrondi(bas), haut: arrondi(haut), ecart, fiable, n: m.n};
    const probleme = a.titre && PROBLEME.test(a.titre);
    // Seuils exprimés en écarts-types du modèle (z) : un modèle aux prix très dispersés est jugé moins sévèrement.
    // Un écart de moins de 300 € (ou de moins de 10 % sous / 8 % au-dessus) reste « correct ».
    const z = Math.log(a.prix / e) / m.sigma, petit = Math.abs(a.prix - e) < 300;
    if (!petit && z <= -1.6 && ecart <= -0.35) Object.assign(r, {code: 'suspect', libelle: 'Trop bas : méfiance', icone: '⚠',
      phrase: `${pc(ecart)} sous le prix habituel (${eur(r.estimation)}).` + (probleme ? ' Le titre signale un problème, ce qui explique sans doute le prix.' : ' Un tel écart cache souvent un défaut ou une arnaque.'),
      conseil: 'Ne rien payer à distance, demander la carte grise, le contrôle technique et l\'historique, voir et essayer le véhicule.'});
    else if (!petit && z <= -0.5 && ecart <= -0.1) Object.assign(r, {code: 'affaire', libelle: 'Bonne affaire', icone: '✓',
      phrase: `${pc(ecart)} sous le prix habituel (${eur(r.estimation)}) pour cet âge et ce kilométrage.` + (probleme ? ' Attention : le titre signale un problème.' : ''),
      conseil: 'À voir rapidement. Vérifier quand même l\'entretien et le contrôle technique.'});
    else if (petit || z <= 0.4 || ecart < 0.08) Object.assign(r, {code: 'correct', libelle: 'Prix correct', icone: '=',
      phrase: `Dans la moyenne du marché (${eur(r.estimation)} attendu, ${ecart >= 0 ? '+' : '−'}${pc(ecart)}).`,
      conseil: ecart > 0 ? `Une petite négociation vers ${eur(r.estimation)} est envisageable.` : 'Peu de marge de négociation.'});
    else if (z <= 1) Object.assign(r, {code: 'cher', libelle: 'Un peu cher', icone: '!',
      phrase: `${pc(ecart)} au-dessus du prix habituel (${eur(r.estimation)}).`,
      conseil: `Négocier : viser autour de ${eur(r.estimation)}, sauf équipements ou entretien qui justifient l'écart.`});
    else Object.assign(r, {code: 'tropcher', libelle: 'Trop cher', icone: '✕',
      phrase: `${pc(ecart)} au-dessus du prix habituel (${eur(r.estimation)}).`,
      conseil: `Prix à justifier (finition haut de gamme, très faible km, garantie…). Sinon proposer ${eur(r.estimation)} ou passer son chemin.`});
    if (!fiable) r.phrase += ' (Âge ou kilométrage peu courant pour ce modèle : estimation moins sûre.)';
    return r;
  }

  // Encadré du verdict (styles .verdict-* définis dans chaque page)
  function htmlVerdict(v) {
    if (!v) return '';
    const detail = v.estimation ? `<div class="verdict-detail">Prix habituel pour cet âge et ce kilométrage : <b>${eur(v.bas)} à ${eur(v.haut)}</b> (estimation ${eur(v.estimation)}, d'après ${NF.format(v.n)} annonces du modèle).</div>` : '';
    return `<div class="verdict verdict-${v.code}"><div class="verdict-tete"><span class="verdict-icone" aria-hidden="true">${v.icone}</span><span>${v.libelle}</span></div>
      <div>${v.phrase}</div>${v.conseil ? `<div class="verdict-conseil">${v.conseil}</div>` : ''}${detail}</div>`;
  }
  // Badge court pour les cartes de la liste
  const BADGES = {suspect: '⚠ Trop bas', affaire: '✓ Bon prix', correct: '= Prix correct', cher: '! Un peu cher', tropcher: '✕ Trop cher'};
  const htmlBadge = v => v && BADGES[v.code] ? `<span class="badge-verdict verdict-${v.code}">${BADGES[v.code]}</span>` : '';

  // ---------- chargement de la base ----------
  // Colonnes des fichiers data/leger-NNN.js (même ordre que dans ajouter-lot.ps1)
  const IMG = 'https://img.leboncoin.fr/api/v1/lbcpb1/images/';
  const script = src => new Promise(ok => { const s = document.createElement('script'); s.src = src; s.onload = s.onerror = () => { s.remove(); ok(); }; document.head.appendChild(s); });

  // Charge toutes les annonces allégées ; progression(fraction) est appelée au fil du chargement
  async function chargerBase(manifeste, progression = () => {}) {
    const fichiers = manifeste.legers || [], vus = new Set(), base = [];
    for (let i = 0; i < fichiers.length; i++) {
      window.LEGER = [];
      await script('data/' + fichiers[i]);
      for (const paquet of window.LEGER) for (const r of paquet.rows) {
        if (vus.has(r[0])) continue; vus.add(r[0]);
        base.push({id: r[0], titre: r[1], prix: r[2], annee: r[3], km: r[4], marque: r[5], modele: r[6], carburant: r[7], boite: r[8], type: r[9],
          cp: r[10], ville: r[11], dep: r[12], region: r[13], pro: !!r[14], date: r[15], images: r[16] ? [IMG + r[16] + '?rule=ad-large'] : [],
          aDescription: !!r[17], lot: paquet.lot, url: 'https://www.leboncoin.fr/ad/voitures/' + r[0]});
      }
      progression((i + 1) / fichiers.length);
    }
    window.LEGER = null;
    return base;
  }

  // Annonce complète (équipements, toutes les photos, description) : charge son lot à la demande, en gardant le dernier lot en mémoire
  let dernierLot = {num: -1, parId: null};
  async function chargerComplete(a) {
    if (dernierLot.num !== a.lot) {
      window.LOTS = [];
      await script('data/lot-' + String(a.lot).padStart(3, '0') + '.js');
      dernierLot = {num: a.lot, parId: new Map((window.LOTS || []).flat().map(x => [x.id, x]))};
      window.LOTS = null;
    }
    return dernierLot.parId.get(a.id) || null;
  }

  window.COMMUN = {ANNEE, PROBLEME, age, exploitable, ajusterModeles, estimer, verdict, htmlVerdict, htmlBadge, chargerBase, chargerComplete};
})();
