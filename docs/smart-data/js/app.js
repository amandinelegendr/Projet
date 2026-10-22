/* Projet Smart Data — interface : filtres, KPI, carte, zoom et analyses statistiques. */
(function () {
  "use strict";

  // Sans D3 (pas de connexion au CDN), on l'explique au lieu d'afficher une page blanche
  if (!window.d3) {
    document.querySelector(".wrap").insertAdjacentHTML("afterbegin",
      `<div class="card erreur">Les graphiques ont besoin de la bibliothèque D3, chargée depuis internet (cdnjs).
       Vérifiez la connexion puis rechargez la page.</div>`);
    return;
  }

  const A = window.ANNONCES, M = window.META, S = window.STATS;

  /* ---------- Formats (français, sans LaTeX) ---------- */
  const nb = (x, d = 0) => Number.isFinite(x) ? x.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "–";
  const eur = x => nb(x) + " €";
  const pct = (x, d = 1) => nb(x * 100, d) + " %";
  const signe = (x, f) => (x > 0 ? "+" : x < 0 ? "−" : "") + f(Math.abs(x));
  const fmtP = p => !Number.isFinite(p) ? "–" : p < 0.001 ? "p < 0,001" : "p = " + nb(p, 3);
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const COUL_PLATEFORME = () => Object.fromEntries(M.plateformes.map((p, i) => [p, css(`--p${i}`)]));
  const COUL_ENERGIE = () => ({ Essence: css("--e-essence"), Diesel: css("--e-diesel"), Électrique: css("--e-elec"), Hybride: css("--e-hybride") });
  const ABREV = { "11": "IDF", "84": "ARA", "32": "HDF", "75": "NAQ", "76": "OCC", "93": "PACA", "44": "GES", "52": "PDL", "28": "NOR", "53": "BRE", "27": "BFC", "24": "CVL", "94": "COR" };
  const age = a => M.anneeRef - a.annee;

  /* ---------- État et filtres ---------- */
  const KM_MAX = Math.ceil(d3.max(A, a => a.kilometrage) / 10000) * 10000;
  const DEFAUT = { plateforme: "Toutes", vendeur: "Tous", energie: "Toutes", constructeur: "Tous", anneeMin: 2015, kmMax: KM_MAX };
  const state = { ...DEFAUT, region: null, mesure: "prix", anova: "plateforme", onglet: "corr", corrX: "kilometrage" };

  // Annonces retenues par les filtres (toutes régions) puis par la région choisie
  const filtrees = () => A.filter(a =>
    (state.plateforme === "Toutes" || a.plateforme === state.plateforme) &&
    (state.vendeur === "Tous" || a.type_vendeur === state.vendeur) &&
    (state.energie === "Toutes" || a.energie === state.energie) &&
    (state.constructeur === "Tous" || a.constructeur === state.constructeur) &&
    a.annee >= state.anneeMin && a.kilometrage <= state.kmMax);
  const selection = () => filtrees().filter(a => !state.region || a.region_code === state.region);

  function pilules(id, valeurs, cle) {
    const el = document.getElementById(id);
    el.innerHTML = valeurs.map(v => `<button data-v="${v}">${v}</button>`).join("");
    el.addEventListener("click", e => { const b = e.target.closest("button"); if (b) { state[cle] = b.dataset.v; rendre(); } });
  }
  function boutons(id, cle) {
    document.getElementById(id).addEventListener("click", e => { const b = e.target.closest("button"); if (b) { state[cle] = b.dataset.v; rendre(); } });
  }
  function initialiser() {
    pilules("f-plateforme", ["Toutes", ...M.plateformes], "plateforme");
    pilules("f-vendeur", ["Tous", "Particulier", "Professionnel"], "vendeur");
    pilules("f-energie", ["Toutes", ...M.energies], "energie");
    boutons("f-mesure", "mesure"); boutons("f-anova", "anova"); boutons("f-onglet", "onglet"); boutons("f-corrx", "corrX");
    const sel = document.getElementById("f-constructeur");
    sel.innerHTML = `<option value="Tous">Tous</option>` + M.constructeurs.map(c => `<option>${c}</option>`).join("");
    sel.onchange = () => { state.constructeur = sel.value; rendre(); };
    const fa = document.getElementById("f-annee"), fk = document.getElementById("f-km");
    fk.max = KM_MAX;
    fa.oninput = () => { state.anneeMin = +fa.value; rendre(); };
    fk.oninput = () => { state.kmMax = +fk.value; rendre(); };
    document.getElementById("reinit").onclick = () => { Object.assign(state, DEFAUT, { region: null }); rendre(); };
    let attente;
    addEventListener("resize", () => { clearTimeout(attente); attente = setTimeout(rendre, 150); });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", rendre);
  }
  function synchroniser() {
    const marquer = (id, v) => document.querySelectorAll(`#${id} button`).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
    marquer("f-plateforme", state.plateforme); marquer("f-vendeur", state.vendeur); marquer("f-energie", state.energie);
    marquer("f-mesure", state.mesure); marquer("f-anova", state.anova); marquer("f-onglet", state.onglet); marquer("f-corrx", state.corrX);
    document.getElementById("f-constructeur").value = state.constructeur;
    document.getElementById("f-annee").value = state.anneeMin;
    document.getElementById("f-km").value = state.kmMax;
    document.getElementById("o-annee").textContent = state.anneeMin;
    document.getElementById("o-km").textContent = nb(state.kmMax) + " km";
  }

  /* ---------- Infobulle ---------- */
  const tip = document.getElementById("tip");
  function montrer(e, html) {
    tip.innerHTML = html;
    tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + "px";
    tip.style.top = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8) + "px";
    tip.style.opacity = 1;
  }
  const cacher = () => tip.style.opacity = 0;

  /* ---------- KPI ---------- */
  function rendreKpis(liste) {
    const lieu = state.region ? M.regions[state.region] : "France entière";
    document.getElementById("perimetre").textContent = `Périmètre : ${lieu} · ${nb(liste.length)} annonce${liste.length > 1 ? "s" : ""} sur 600`;
    const el = document.getElementById("kpis");
    if (!liste.length) {
      el.innerHTML = `<div class="card kpi" style="grid-column:1/-1"><div class="vide">Aucune annonce ne correspond à ces filtres.</div></div>`;
      return;
    }
    const prix = liste.map(a => a.prix);
    const pro = liste.filter(a => a.type_vendeur === "Professionnel").map(a => a.prix);
    const part = liste.filter(a => a.type_vendeur === "Particulier").map(a => a.prix);
    const ecart = pro.length && part.length ? S.moyenne(pro) - S.moyenne(part) : NaN;
    const parPlat = d3.rollups(liste, v => v.length, a => a.plateforme).sort((a, b) => b[1] - a[1]);
    el.innerHTML = `
      <div class="card kpi"><div class="lbl">Prix moyen · médian</div>
        <div class="val">${eur(S.moyenne(prix))} <small>· ${eur(S.mediane(prix))}</small></div>
        <div class="sub">Écart-type : ${eur(S.ecartType(prix))}</div></div>
      <div class="card kpi"><div class="lbl">Kilométrage moyen</div>
        <div class="val">${nb(S.moyenne(liste.map(a => a.kilometrage)))} <small>km</small></div>
        <div class="sub">Âge moyen du parc : ${nb(S.moyenne(liste.map(age)), 1)} ans</div></div>
      <div class="card kpi"><div class="lbl">Écart de prix Pro vs Particulier</div>
        ${Number.isFinite(ecart)
          ? `<div class="val ${ecart >= 0 ? "pos" : "neg"}">${signe(ecart / S.moyenne(part), x => pct(x))}</div>
             <div class="sub">${signe(ecart, eur)} en moyenne (${nb(pro.length)} pro · ${nb(part.length)} part.)</div>`
          : `<div class="val"><small>Non calculable</small></div><div class="sub">Il faut des annonces des deux types.</div>`}</div>
      <div class="card kpi"><div class="lbl">Volume d'annonces</div>
        <div class="val">${nb(liste.length)}</div>
        <div class="sub">Plateforme dominante : ${parPlat[0][0]} (${pct(parPlat[0][1] / liste.length, 0)})</div></div>`;
  }

  /* ---------- Carte ---------- */
  function rendreCarte() {
    const liste = filtrees();
    const parRegion = d3.group(liste, a => a.region_code);
    const valeur = code => {
      const g = parRegion.get(code) || [];
      return state.mesure === "prix" ? (g.length ? S.moyenne(g.map(a => a.prix)) : NaN) : g.length;
    };
    const vals = Object.keys(M.regions).map(valeur).filter(Number.isFinite);
    const couleurs = ["--s0", "--s1", "--s2", "--s3", "--s4", "--s5"].map(css);
    const echelle = vals.length > 1 ? d3.scaleQuantize().domain(d3.extent(vals)).range(couleurs) : () => couleurs[3];
    const fmt = state.mesure === "prix" ? eur : v => nb(v);

    const svg = d3.select("#carte"), W = 560, H = 540;
    svg.attr("viewBox", `0 0 ${W} ${H}`).selectAll("*").remove();
    const proj = d3.geoConicConformal().parallels([44, 49]).rotate([-3, 0]).fitExtent([[8, 8], [W - 8, H - 8]], GEO_REGIONS);
    const chemin = d3.geoPath(proj);
    const g = svg.selectAll("g").data(GEO_REGIONS.features).join("g");
    g.append("path").attr("d", chemin)
      .attr("class", f => f.properties.code === state.region ? "sel" : null)
      .attr("fill", f => { const v = valeur(f.properties.code); return Number.isFinite(v) && (state.mesure === "prix" || v > 0) ? echelle(v) : css("--soft"); })
      .on("mousemove", (e, f) => {
        const grp = parRegion.get(f.properties.code) || [];
        montrer(e, `<b>${f.properties.nom}</b>${nb(grp.length)} annonce${grp.length > 1 ? "s" : ""}` +
          (grp.length ? `<br>Prix moyen : ${eur(S.moyenne(grp.map(a => a.prix)))}<br>Prix médian : ${eur(S.mediane(grp.map(a => a.prix)))}` : ""));
      })
      .on("mouseleave", cacher)
      .on("click", (e, f) => { state.region = state.region === f.properties.code ? null : f.properties.code; cacher(); rendre(); });
    g.append("text").attr("text-anchor", "middle").attr("dy", ".35em")
      .attr("transform", f => { const [x, y] = chemin.centroid(f); return `translate(${x},${y + (f.properties.code === "93" ? 8 : 0)})`; })
      .text(f => ABREV[f.properties.code]);
    svg.selectAll("path.sel").each(function () { this.parentNode.parentNode.appendChild(this.parentNode); });

    document.getElementById("titre-carte").textContent = state.mesure === "prix" ? "Prix moyen par région" : "Volume d'offres par région";
    document.getElementById("legende").innerHTML = vals.length
      ? `<span>${fmt(d3.min(vals))}</span><div class="bar">${couleurs.map(c => `<span style="background:${c}"></span>`).join("")}</div><span>${fmt(d3.max(vals))}</span>`
      : "";
  }

  /* ---------- Zoom sur la sélection ---------- */
  function rendreZoom(liste) {
    const el = document.getElementById("zoom");
    const titre = state.region ? M.regions[state.region] : "France entière";
    const retour = state.region ? `<button class="lien" id="z-retour">← France entière</button>` : "";
    if (!liste.length) {
      el.innerHTML = `<div class="entete"><h2>Zoom : ${titre}</h2>${retour}</div><div class="vide">Aucune annonce pour cette sélection.</div>`;
    } else {
      const n = liste.length, cp = COUL_PLATEFORME(), ce = COUL_ENERGIE();
      const plat = M.plateformes.map(p => [p, liste.filter(a => a.plateforme === p).length]);
      const maxPlat = d3.max(plat, d => d[1]) || 1;
      const ener = M.energies.map(e => [e, liste.filter(a => a.energie === e).length]).filter(d => d[1]);
      const top = d3.rollups(liste, v => ({
        n: v.length,
        fiabilite: v[0].fiabilite_constructeur,
        avis: S.moyenne(v.map(a => a.profil_utilisateur.note_avis)),
        cv: S.moyenne(v.map(a => a.chevaux_fiscaux)),
        entretien: S.moyenne(v.map(a => a.profil_utilisateur.cout_entretien)),
      }), a => a.constructeur).sort((a, b) => b[1].n - a[1].n).slice(0, 5);
      const pastille = (v, max) => {
        const r = v / max;
        const c = r >= 0.8 ? "var(--pos)" : r >= 0.7 ? "var(--warn)" : "var(--neg)";
        return `<span class="note" style="color:${c};background:color-mix(in srgb, ${c} 12%, transparent)">${nb(v, 1)}</span>`;
      };
      el.innerHTML = `
        <div class="entete"><h2>Zoom : ${titre}</h2>${retour}</div>
        <p class="hint">${nb(n)} annonces · prix moyen ${eur(S.moyenne(liste.map(a => a.prix)))}</p>
        <h3>Répartition par plateforme</h3>
        <div class="barres">${plat.map(([p, k]) => `
          <div class="barre"><span>${p}</span><div class="piste"><div class="rempli" style="width:${k / maxPlat * 100}%;background:${cp[p]}"></div></div>
          <span class="n">${nb(k)} · ${pct(k / n, 0)}</span></div>`).join("")}</div>
        <h3>Répartition par motorisation</h3>
        <div class="jauge">${ener.map(([e, k]) => `<span title="${e} : ${pct(k / n)}" style="width:${k / n * 100}%;background:${ce[e]}"></span>`).join("")}</div>
        <div class="cles">${ener.map(([e, k]) => `<span><i style="background:${ce[e]}"></i>${e} ${pct(k / n, 0)}</span>`).join("")}</div>
        <h3>Top 5 constructeurs · données constructeurs et utilisateurs</h3>
        <div class="defile"><table>
          <thead><tr><th>Constructeur</th><th>Annonces</th><th>Fiabilité /10</th><th>Avis acheteurs /5</th><th>CV moyens</th><th>Entretien</th></tr></thead>
          <tbody>${top.map(([c, d]) => `<tr><td>${c}</td><td>${nb(d.n)}</td><td>${pastille(d.fiabilite, 10)}</td><td>${pastille(d.avis, 5)}</td>
            <td>${nb(d.cv, 1)}</td><td>${eur(d.entretien)}/an</td></tr>`).join("")}</tbody>
        </table></div>`;
    }
    const b = document.getElementById("z-retour");
    if (b) b.onclick = () => { state.region = null; rendre(); };
  }

  /* ---------- Outils de graphique ---------- */
  function cadre(id, hauteur = 260) {
    const svg = d3.select("#" + id);
    const W = Math.max(280, svg.node().parentNode.clientWidth - 40), H = hauteur;
    svg.attr("viewBox", `0 0 ${W} ${H}`).selectAll("*").remove();
    return { svg, W, H, m: { t: 14, r: 14, b: 32, l: 58 } };
  }
  const kEur = v => nb(v / 1000, v % 1000 ? 1 : 0) + " k€";
  function axes(c, x, y, fx, fy, nx = 5, ny = 5) {
    c.svg.append("g").attr("class", "grille").attr("transform", `translate(${c.m.l},0)`)
      .call(d3.axisLeft(y).ticks(ny).tickSize(-(c.W - c.m.l - c.m.r)).tickFormat("")).call(g => g.select(".domain").remove());
    if (x) c.svg.append("g").attr("class", "axe").attr("transform", `translate(0,${c.H - c.m.b})`).call(d3.axisBottom(x).ticks(nx).tickFormat(fx));
    c.svg.append("g").attr("class", "axe").attr("transform", `translate(${c.m.l},0)`).call(d3.axisLeft(y).ticks(ny).tickFormat(fy));
  }
  const vide = (id, resId, msg) => {
    d3.select("#" + id).attr("viewBox", "0 0 400 40").selectAll("*").remove();
    document.getElementById(resId).innerHTML = `<div class="vide">${msg}</div>`;
  };

  /* ---------- A : distribution et loi normale ---------- */
  function rendreA(liste) {
    if (liste.length < 10) return vide("graph-a", "res-a", "Pas assez d'annonces (10 minimum) pour décrire la distribution.");
    const prix = liste.map(a => a.prix), m = S.moyenne(prix), med = S.mediane(prix), s = S.ecartType(prix), asym = S.asymetrie(prix);
    const c = cadre("graph-a");
    const x = d3.scaleLinear().domain(d3.extent(prix)).nice().range([c.m.l, c.W - c.m.r]);
    const bins = d3.bin().domain(x.domain()).thresholds(x.ticks(18))(prix);
    const largeur = bins[0].x1 - bins[0].x0;
    const courbe = d3.range(x.domain()[0], x.domain()[1], (x.domain()[1] - x.domain()[0]) / 120).map(v => [v, S.densiteNormale(v, m, s) * prix.length * largeur]);
    const y = d3.scaleLinear().domain([0, Math.max(d3.max(bins, b => b.length), d3.max(courbe, p => p[1]))]).nice().range([c.H - c.m.b, c.m.t]);
    axes(c, x, y, kEur, d => nb(d));
    c.svg.append("g").selectAll("rect").data(bins).join("rect")
      .attr("x", b => x(b.x0) + 1).attr("width", b => Math.max(0, x(b.x1) - x(b.x0) - 2))
      .attr("y", b => y(b.length)).attr("height", b => y(0) - y(b.length)).attr("rx", 2)
      .attr("fill", css("--accent")).attr("fill-opacity", .28)
      .on("mousemove", (e, b) => montrer(e, `<b>${eur(b.x0)} – ${eur(b.x1)}</b>${nb(b.length)} annonces`)).on("mouseleave", cacher);
    c.svg.append("path").datum(courbe).attr("fill", "none").attr("stroke", css("--text")).attr("stroke-width", 1.8)
      .attr("d", d3.line().x(p => x(p[0])).y(p => y(p[1])).curve(d3.curveBasis));
    for (const [v, lib, coul, tiret] of [[m, "Moyenne", css("--accent"), null], [med, "Médiane", css("--warn"), "5 4"]]) {
      c.svg.append("line").attr("x1", x(v)).attr("x2", x(v)).attr("y1", c.m.t).attr("y2", c.H - c.m.b)
        .attr("stroke", coul).attr("stroke-width", 2).attr("stroke-dasharray", tiret);
      c.svg.append("text").attr("x", x(v) + (v === med && med < m ? -4 : 4)).attr("y", c.m.t + 10)
        .attr("text-anchor", v === med && med < m ? "end" : "start").attr("fill", coul).attr("font-size", 11).attr("font-weight", 600).text(lib);
    }
    const lecture = Math.abs(asym) < 0.3
      ? "La distribution est à peu près symétrique : la loi normale la décrit correctement."
      : asym > 0
        ? "La médiane est inférieure à la moyenne : quelques voitures chères tirent la moyenne vers le haut (asymétrie à droite). La loi normale n'est qu'une approximation, et la médiane est plus représentative du « prix typique »."
        : "La médiane dépasse la moyenne : quelques voitures bon marché tirent la moyenne vers le bas (asymétrie à gauche).";
    document.getElementById("res-a").innerHTML = `
      <div class="chiffres"><span>Moyenne <b>${eur(m)}</b></span><span>Médiane <b>${eur(med)}</b></span>
        <span>Écart-type <b>${eur(s)}</b></span><span>Coefficient de variation <b>${pct(s / m, 0)}</b></span><span>Asymétrie <b>${nb(asym, 2)}</b></span></div>
      <p class="conclusion">${lecture} Environ 68 % des prix devraient se situer entre ${eur(m - s)} et ${eur(m + s)} si la loi était normale ;
        on en observe ${pct(prix.filter(p => p >= m - s && p <= m + s).length / prix.length, 0)}.</p>`;
  }

  /* ---------- B : test t Particulier / Professionnel ---------- */
  function rendreB(liste) {
    const part = liste.filter(a => a.type_vendeur === "Particulier"), pro = liste.filter(a => a.type_vendeur === "Professionnel");
    if (part.length < 2 || pro.length < 2)
      return vide("graph-b", "res-b", "Il faut au moins 2 annonces de particuliers et 2 de professionnels (filtre Vendeur sur « Tous »).");
    const mesures = [
      { cle: "prix", lib: "Prix moyen", f: a => a.prix, fmt: eur },
      { cle: "km", lib: "Prix par km parcouru", f: a => a.prix / a.kilometrage, fmt: v => nb(v, 2) + " €/km" },
    ];
    const c = cadre("graph-b", 240);
    const groupes = [["Particulier", part, css("--p1")], ["Professionnel", pro, css("--p0")]];
    const largeurBloc = (c.W - c.m.l - c.m.r) / 2;
    const res = mesures.map((me, i) => {
      const vals = groupes.map(([lib, g, coul]) => {
        const v = g.map(me.f), moy = S.moyenne(v), demi = S.tCritique(v.length - 1) * S.ecartType(v) / Math.sqrt(v.length);
        return { lib, moy, bas: moy - demi, haut: moy + demi, coul, n: v.length };
      });
      const y = d3.scaleLinear().domain([0, d3.max(vals, v => v.haut) * 1.12]).range([c.H - c.m.b, c.m.t + 14]);
      const x0 = c.m.l + i * largeurBloc;
      const g = c.svg.append("g");
      g.append("text").attr("x", x0 + largeurBloc / 2).attr("y", c.m.t).attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", 600).attr("fill", css("--text")).text(me.lib);
      const bw = Math.min(70, largeurBloc / 3.2);
      vals.forEach((v, j) => {
        const cx = x0 + largeurBloc * (j === 0 ? 0.32 : 0.68);
        g.append("rect").attr("x", cx - bw / 2).attr("width", bw).attr("y", y(v.moy)).attr("height", y(0) - y(v.moy)).attr("rx", 4).attr("fill", v.coul).attr("fill-opacity", .85)
          .on("mousemove", e => montrer(e, `<b>${v.lib}</b>${me.lib} : ${me.fmt(v.moy)}<br>IC 95 % : ${me.fmt(v.bas)} – ${me.fmt(v.haut)}<br>${nb(v.n)} annonces`)).on("mouseleave", cacher);
        g.append("line").attr("x1", cx).attr("x2", cx).attr("y1", y(v.bas)).attr("y2", y(v.haut)).attr("stroke", css("--text")).attr("stroke-width", 1.5);
        for (const b of [v.bas, v.haut]) g.append("line").attr("x1", cx - 6).attr("x2", cx + 6).attr("y1", y(b)).attr("y2", y(b)).attr("stroke", css("--text")).attr("stroke-width", 1.5);
        g.append("text").attr("x", cx).attr("y", y(v.haut) - 5).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", css("--muted")).text(me.fmt(v.moy));
        g.append("text").attr("x", cx).attr("y", c.H - c.m.b + 16).attr("text-anchor", "middle").attr("font-size", 11.5).attr("fill", css("--muted")).text(v.lib);
      });
      g.append("line").attr("x1", x0 + 8).attr("x2", x0 + largeurBloc - 8).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", css("--line"));
      return { me, t: S.testT(pro.map(me.f), part.map(me.f)) };
    });
    const lignes = res.map(({ me, t }) => {
      const sig = t.p < 0.05;
      return `<div class="chiffres"><span><b>${me.lib}</b></span><span>t = <b>${nb(t.t, 2)}</b></span><span>ddl = ${nb(t.ddl, 0)}</span><span><b>${fmtP(t.p)}</b></span>
          <span>écart Pro − Part. : <b>${signe(t.diff, me.fmt)}</b></span></div>
        <p class="conclusion ${sig ? "oui" : "non"}">${sig
          ? `Différence statistiquement significative (p < 0,05) : on rejette l'hypothèse d'égalité des moyennes.`
          : `Différence non significative au seuil de 5 % : l'écart observé peut s'expliquer par le hasard.`}</p>`;
    }).join('<div style="height:8px"></div>');
    document.getElementById("res-b").innerHTML = lignes +
      `<p class="avert">À lire avec prudence : les professionnels vendent en moyenne des voitures plus récentes
       (${nb(S.moyenne(pro.map(age)), 1)} ans contre ${nb(S.moyenne(part.map(age)), 1)} ans), ce qui explique une partie de l'écart de prix, en plus de la garantie.</p>`;
  }

  /* ---------- C : ANOVA (boîtes à moustaches) ---------- */
  function rendreC(liste) {
    const facteur = state.anova, cle = facteur === "plateforme" ? "plateforme" : "energie";
    const niveaux = (facteur === "plateforme" ? M.plateformes : M.energies);
    const couleurs = facteur === "plateforme" ? COUL_PLATEFORME() : COUL_ENERGIE();
    const groupes = niveaux.map(n => [n, liste.filter(a => a[cle] === n).map(a => a.prix)]).filter(g => g[1].length >= 2);
    const res = S.anova(groupes.map(g => g[1]));
    if (!res) return vide("graph-c", "res-c", `Il faut au moins deux ${facteur === "plateforme" ? "plateformes" : "énergies"} avec 2 annonces ou plus (le filtre correspondant doit être sur « Toutes »).`);
    const c = cadre("graph-c", 260);
    c.m.b = 34;
    const x = d3.scaleBand().domain(groupes.map(g => g[0])).range([c.m.l, c.W - c.m.r]).padding(0.38);
    const stats = groupes.map(([n, v]) => {
      const q1 = S.quantile(v, .25), q3 = S.quantile(v, .75), iqr = q3 - q1;
      const dedans = v.filter(p => p >= q1 - 1.5 * iqr && p <= q3 + 1.5 * iqr);
      return { n, v, q1, q3, med: S.mediane(v), moy: S.moyenne(v), bas: d3.min(dedans), haut: d3.max(dedans), isoles: v.filter(p => p < q1 - 1.5 * iqr || p > q3 + 1.5 * iqr) };
    });
    const y = d3.scaleLinear().domain([0, d3.max(liste.filter(a => groupes.some(g => g[0] === a[cle])), a => a.prix)]).nice().range([c.H - c.m.b, c.m.t]);
    axes(c, x, y, d => d, kEur);
    const g = c.svg.append("g").selectAll("g").data(stats).join("g").attr("transform", d => `translate(${x(d.n)},0)`);
    const bw = x.bandwidth();
    g.append("line").attr("x1", bw / 2).attr("x2", bw / 2).attr("y1", d => y(d.bas)).attr("y2", d => y(d.haut)).attr("stroke", css("--muted"));
    for (const k of ["bas", "haut"]) g.append("line").attr("x1", bw * .3).attr("x2", bw * .7).attr("y1", d => y(d[k])).attr("y2", d => y(d[k])).attr("stroke", css("--muted"));
    g.append("rect").attr("width", bw).attr("y", d => y(d.q3)).attr("height", d => Math.max(1, y(d.q1) - y(d.q3))).attr("rx", 4)
      .attr("fill", d => couleurs[d.n]).attr("fill-opacity", .3).attr("stroke", d => couleurs[d.n]).attr("stroke-width", 1.5)
      .on("mousemove", (e, d) => montrer(e, `<b>${d.n}</b>${nb(d.v.length)} annonces<br>Médiane : ${eur(d.med)}<br>Moyenne : ${eur(d.moy)}<br>Quartiles : ${eur(d.q1)} – ${eur(d.q3)}`))
      .on("mouseleave", cacher);
    g.append("line").attr("x1", 0).attr("x2", bw).attr("y1", d => y(d.med)).attr("y2", d => y(d.med)).attr("stroke", d => couleurs[d.n]).attr("stroke-width", 2.5);
    g.append("circle").attr("cx", bw / 2).attr("cy", d => y(d.moy)).attr("r", 3.5).attr("fill", css("--surface")).attr("stroke", css("--text")).attr("stroke-width", 1.5);
    g.selectAll(".iso").data(d => d.isoles).join("circle").attr("cx", bw / 2).attr("cy", v => y(v)).attr("r", 2).attr("fill", css("--muted")).attr("fill-opacity", .5);
    const sig = res.p < 0.05;
    const extremes = [...stats].sort((a, b) => b.moy - a.moy);
    document.getElementById("res-c").innerHTML = `
      <div class="chiffres"><span>F(${res.d1} ; ${res.d2}) = <b>${nb(res.F, 2)}</b></span><span><b>${fmtP(res.p)}</b></span><span>η² = <b>${nb(res.eta2, 3)}</b></span></div>
      <p class="conclusion ${sig ? "oui" : "non"}">${sig
        ? `Les prix moyens diffèrent significativement selon ${facteur === "plateforme" ? "la plateforme" : "l'énergie"} (p < 0,05).
           ${facteur === "plateforme" ? "La plateforme" : "L'énergie"} explique ${pct(res.eta2, 0)} de la variance des prix ;
           écart le plus marqué entre ${extremes[0].n} (${eur(extremes[0].moy)}) et ${extremes.at(-1).n} (${eur(extremes.at(-1).moy)}).`
        : `Pas de différence significative de prix moyen selon ${facteur === "plateforme" ? "la plateforme" : "l'énergie"} au seuil de 5 %.`}</p>
      <p class="avert" style="color:var(--muted)">Rond blanc : moyenne · trait épais : médiane · boîte : 50 % central des prix.</p>`;
  }

  /* ---------- D : corrélation ou Khi² ---------- */
  function rendreD(liste) {
    document.getElementById("opt-corr").style.display = state.onglet === "corr" ? "" : "none";
    if (state.onglet === "corr") return rendreCorrelation(liste);
    return rendreKhi2(liste);
  }
  function rendreCorrelation(liste) {
    const def = {
      kilometrage: { lib: "Kilométrage", art: "Le kilométrage", f: a => a.kilometrage, fmt: v => nb(v / 1000) + " 000 km", fmtAxe: v => nb(v / 1000) + "k" },
      chevaux_fiscaux: { lib: "Puissance fiscale", art: "La puissance fiscale", f: a => a.chevaux_fiscaux, fmt: v => nb(v) + " CV", fmtAxe: v => nb(v) + " CV" },
      age: { lib: "Âge", art: "L'âge", f: age, fmt: v => nb(v) + " ans", fmtAxe: v => nb(v) + " an" + (v > 1 ? "s" : "") },
    }[state.corrX];
    document.getElementById("hint-d").textContent = `Chaque point est une annonce : ${def.lib.toLowerCase()} en abscisse, prix en ordonnée, avec la droite de tendance (moindres carrés).`;
    const xs = liste.map(def.f), ys = liste.map(a => a.prix);
    const res = S.correlation(xs, ys);
    if (!res) return vide("graph-d", "res-d", "Pas assez d'annonces (ou de variation) pour calculer une corrélation.");
    const c = cadre("graph-d", 260);
    const x = d3.scaleLinear().domain(d3.extent(xs)).nice().range([c.m.l, c.W - c.m.r]);
    const y = d3.scaleLinear().domain([0, d3.max(ys)]).nice().range([c.H - c.m.b, c.m.t]);
    axes(c, x, y, def.fmtAxe, kEur);
    const ce = COUL_ENERGIE(), jitter = state.corrX === "kilometrage" ? 0 : 0.28;
    c.svg.append("g").selectAll("circle").data(liste).join("circle")
      .attr("cx", (a, i) => x(def.f(a) + (jitter ? ((a.id * 7919) % 100 / 100 - 0.5) * jitter * 2 : 0))).attr("cy", a => y(a.prix)).attr("r", 3)
      .attr("fill", a => ce[a.energie]).attr("fill-opacity", .55)
      .on("mousemove", (e, a) => montrer(e, `<b>${a.constructeur} ${a.modele}</b>${a.annee} · ${nb(a.kilometrage)} km · ${a.chevaux_fiscaux} CV · ${a.energie}<br>${eur(a.prix)} · ${a.plateforme}`))
      .on("mouseleave", cacher);
    const [x0, x1] = x.domain();
    c.svg.append("line").attr("x1", x(x0)).attr("x2", x(x1))
      .attr("y1", y(Math.max(0, res.origine + res.pente * x0))).attr("y2", y(Math.max(0, res.origine + res.pente * x1)))
      .attr("stroke", css("--text")).attr("stroke-width", 2).attr("stroke-dasharray", "6 4");
    const force = Math.abs(res.r) >= 0.7 ? "forte" : Math.abs(res.r) >= 0.4 ? "modérée" : Math.abs(res.r) >= 0.2 ? "faible" : "très faible";
    const sens = res.r < 0 ? "négative" : "positive";
    const parUnite = state.corrX === "kilometrage" ? `${signe(res.pente * 10000, eur)} pour 10 000 km de plus` : `${signe(res.pente, eur)} par ${state.corrX === "age" ? "année d'âge" : "CV"} supplémentaire`;
    document.getElementById("res-d").innerHTML = `
      <div class="chiffres"><span>r = <b>${nb(res.r, 2)}</b></span><span>r² = <b>${nb(res.r2, 2)}</b></span><span><b>${fmtP(res.p)}</b></span><span>n = ${nb(res.n)}</span></div>
      <p class="conclusion ${res.p < 0.05 ? "oui" : "non"}">Corrélation ${sens} ${force}${res.p < 0.05 ? ", significative" : ", non significative"} :
        en moyenne, ${parUnite}. ${def.art} explique à ${state.corrX === "chevaux_fiscaux" ? "elle" : "lui"} seul${state.corrX === "chevaux_fiscaux" ? "e" : ""} ${pct(res.r2, 0)} de la variation des prix.</p>
      <div class="cles">${M.energies.map(e => `<span><i style="background:${ce[e]}"></i>${e}</span>`).join("")}</div>`;
  }
  function rendreKhi2(liste) {
    document.getElementById("hint-d").textContent = "Part de chaque motorisation selon la plateforme. Le test du Khi² vérifie si le mix d'énergies dépend de la plateforme.";
    const plats = M.plateformes.filter(p => liste.some(a => a.plateforme === p));
    const table = plats.map(p => M.energies.map(e => liste.filter(a => a.plateforme === p && a.energie === e).length));
    const res = S.khi2(table);
    if (!res) return vide("graph-d", "res-d", "Il faut au moins deux plateformes et deux énergies (filtres Plateforme et Énergie sur « Toutes »).");
    const c = cadre("graph-d", 250);
    c.m.l = 130; c.m.b = 26;
    const ce = COUL_ENERGIE();
    const y = d3.scaleBand().domain(plats).range([c.m.t, c.H - c.m.b]).padding(0.3);
    const x = d3.scaleLinear().domain([0, 1]).range([c.m.l, c.W - c.m.r]);
    c.svg.append("g").attr("class", "axe").attr("transform", `translate(0,${c.H - c.m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat(v => pct(v, 0)));
    c.svg.append("g").attr("class", "axe").attr("transform", `translate(${c.m.l},0)`).call(d3.axisLeft(y).tickSize(0)).call(g => g.select(".domain").remove());
    plats.forEach((p, i) => {
      const tot = d3.sum(table[i]);
      let cumul = 0;
      M.energies.forEach((e, j) => {
        const part = table[i][j] / tot;
        if (!part) return;
        c.svg.append("rect").attr("x", x(cumul)).attr("width", Math.max(0, x(cumul + part) - x(cumul) - 1)).attr("y", y(p)).attr("height", y.bandwidth())
          .attr("fill", ce[e]).attr("fill-opacity", .85)
          .on("mousemove", ev => montrer(ev, `<b>${p} · ${e}</b>${nb(table[i][j])} annonces sur ${nb(tot)} (${pct(part)})`)).on("mouseleave", cacher);
        if (x(cumul + part) - x(cumul) > 34)
          c.svg.append("text").attr("x", x(cumul + part / 2)).attr("y", y(p) + y.bandwidth() / 2).attr("dy", ".35em").attr("text-anchor", "middle")
            .attr("font-size", 11).attr("fill", "#fff").attr("pointer-events", "none").text(pct(part, 0));
        cumul += part;
      });
    });
    const sig = res.p < 0.05;
    document.getElementById("res-d").innerHTML = `
      <div class="chiffres"><span>χ² = <b>${nb(res.x2, 2)}</b></span><span>ddl = ${res.ddl}</span><span><b>${fmtP(res.p)}</b></span><span>V de Cramér = <b>${nb(res.v, 2)}</b></span></div>
      <p class="conclusion ${sig ? "oui" : "non"}">${sig
        ? "Le mix de motorisations dépend de la plateforme (p < 0,05) : on rejette l'hypothèse d'indépendance."
        : "Pas de lien significatif entre plateforme et motorisation au seuil de 5 % : les mix d'énergies sont comparables."}
        ${sig ? `Intensité du lien : ${res.v < 0.1 ? "très faible" : res.v < 0.2 ? "faible" : res.v < 0.3 ? "modérée" : "forte"} (V de Cramér).` : ""}</p>
      ${res.partPetits > 0.2 ? `<p class="avert">Attention : plus de 20 % des effectifs attendus sont inférieurs à 5, le test du Khi² est peu fiable ici.</p>` : ""}
      <div class="cles">${M.energies.map(e => `<span><i style="background:${ce[e]}"></i>${e}</span>`).join("")}</div>`;
  }

  /* ---------- Rendu global ---------- */
  function rendre() {
    synchroniser();
    const liste = selection();
    rendreKpis(liste);
    rendreCarte();
    rendreZoom(liste);
    rendreA(liste); rendreB(liste); rendreC(liste); rendreD(liste);
  }

  try {
    initialiser();
    rendre();
  } catch (err) {
    document.querySelector(".wrap").insertAdjacentHTML("afterbegin", `<div class="card erreur">Erreur d'affichage : ${err.message}</div>`);
    throw err;
  }
})();
