/* Projet Smart Data — fonctions statistiques (sans bibliothèque externe).
 *
 * Lois de probabilité calculées numériquement :
 * - Student et Fisher via la fonction bêta incomplète régularisée,
 * - Khi² via la fonction gamma incomplète régularisée,
 * selon les algorithmes classiques (Numerical Recipes, chap. 6).
 * Expose window.STATS.
 */
(function () {
  "use strict";

  const somme = a => a.reduce((s, x) => s + x, 0);
  const moyenne = a => a.length ? somme(a) / a.length : NaN;
  function mediane(a) {
    if (!a.length) return NaN;
    const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function quantile(a, q) {
    const s = [...a].sort((x, y) => x - y);
    if (!s.length) return NaN;
    const pos = (s.length - 1) * q, b = Math.floor(pos);
    return s[b + 1] !== undefined ? s[b] + (pos - b) * (s[b + 1] - s[b]) : s[b];
  }
  // Variance et écart-type d'échantillon (dénominateur n - 1)
  function variance(a) {
    if (a.length < 2) return NaN;
    const m = moyenne(a);
    return somme(a.map(x => (x - m) ** 2)) / (a.length - 1);
  }
  const ecartType = a => Math.sqrt(variance(a));

  // ln Γ(x) (approximation de Lanczos)
  function lnGamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (const ci of c) ser += ci / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  // Fraction continue de la bêta incomplète
  function betacf(a, b, x) {
    const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  // Bêta incomplète régularisée I_x(a, b)
  function betaInc(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }

  // Gamma incomplète régularisée P(a, x)
  function gammaInc(a, x) {
    if (x <= 0) return 0;
    const gln = lnGamma(a);
    if (x < a + 1) {
      let ap = a, s = 1 / a, del = s;
      for (let n = 0; n < 500; n++) { ap += 1; del *= x / ap; s += del; if (Math.abs(del) < Math.abs(s) * 3e-14) break; }
      return s * Math.exp(-x + a * Math.log(x) - gln);
    }
    let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 3e-14) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - gln) * h;
  }

  // p-values
  const pStudentBilateral = (t, ddl) => betaInc(ddl / (ddl + t * t), ddl / 2, 0.5);
  const pFisher = (F, d1, d2) => F <= 0 ? 1 : betaInc(d2 / (d2 + d1 * F), d2 / 2, d1 / 2);
  const pKhi2 = (x2, ddl) => 1 - gammaInc(ddl / 2, x2 / 2);
  // Quantile bilatéral de Student (pour les intervalles de confiance), par dichotomie
  function tCritique(ddl, alpha = 0.05) {
    let bas = 0, haut = 50;
    for (let i = 0; i < 80; i++) { const m = (bas + haut) / 2; pStudentBilateral(m, ddl) > alpha ? bas = m : haut = m; }
    return (bas + haut) / 2;
  }

  // Densité de la loi normale
  const densiteNormale = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));

  // Coefficient d'asymétrie (skewness) d'échantillon
  function asymetrie(a) {
    const n = a.length, m = moyenne(a), s = ecartType(a);
    if (n < 3 || !s) return NaN;
    return n / ((n - 1) * (n - 2)) * somme(a.map(x => ((x - m) / s) ** 3));
  }

  // Test t de Welch (variances non supposées égales)
  function testT(a, b) {
    const n1 = a.length, n2 = b.length;
    if (n1 < 2 || n2 < 2) return null;
    const m1 = moyenne(a), m2 = moyenne(b), v1 = variance(a), v2 = variance(b);
    const se = Math.sqrt(v1 / n1 + v2 / n2);
    if (!se) return null;
    const t = (m1 - m2) / se;
    const ddl = (v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
    return { t, ddl, p: pStudentBilateral(t, ddl), m1, m2, n1, n2, diff: m1 - m2 };
  }

  // ANOVA à un facteur
  function anova(groupes) {
    const g = groupes.filter(x => x.length >= 2);
    const k = g.length, N = g.reduce((s, x) => s + x.length, 0);
    if (k < 2 || N - k < 1) return null;
    const mg = moyenne(g.flat());
    const sce = g.reduce((s, x) => s + x.length * (moyenne(x) - mg) ** 2, 0);
    const scr = g.reduce((s, x) => { const m = moyenne(x); return s + somme(x.map(v => (v - m) ** 2)); }, 0);
    const d1 = k - 1, d2 = N - k;
    const F = (sce / d1) / (scr / d2);
    return { F, d1, d2, p: pFisher(F, d1, d2), eta2: sce / (sce + scr) };
  }

  // Corrélation de Pearson, droite des moindres carrés et test de nullité de r
  function correlation(x, y) {
    const n = x.length;
    if (n < 3) return null;
    const mx = moyenne(x), my = moyenne(y);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    if (!sxx || !syy) return null;
    const r = sxy / Math.sqrt(sxx * syy), pente = sxy / sxx;
    const t = r * Math.sqrt((n - 2) / Math.max(1e-12, 1 - r * r));
    return { r, r2: r * r, pente, origine: my - pente * mx, n, p: pStudentBilateral(t, n - 2) };
  }

  // Test du Khi² d'indépendance sur un tableau de contingence (lignes × colonnes)
  function khi2(tableau) {
    const lignes = tableau.filter(l => somme(l) > 0);
    if (lignes.length < 2) return null;
    const colTot = lignes[0].map((_, j) => somme(lignes.map(l => l[j])));
    const cols = colTot.map((t, j) => t > 0 ? j : -1).filter(j => j >= 0);
    if (cols.length < 2) return null;
    const N = somme(colTot);
    let x2 = 0, petits = 0;
    for (const l of lignes) {
      const lt = somme(l);
      for (const j of cols) {
        const attendu = lt * colTot[j] / N;
        if (attendu < 5) petits++;
        x2 += (l[j] - attendu) ** 2 / attendu;
      }
    }
    const ddl = (lignes.length - 1) * (cols.length - 1);
    const v = Math.sqrt(x2 / (N * Math.min(lignes.length - 1, cols.length - 1)));
    return { x2, ddl, p: pKhi2(x2, ddl), v, N, partPetits: petits / (lignes.length * cols.length) };
  }

  window.STATS = {
    somme, moyenne, mediane, quantile, variance, ecartType, asymetrie, densiteNormale,
    testT, anova, correlation, khi2, tCritique, pStudentBilateral, pFisher, pKhi2,
  };
})();
