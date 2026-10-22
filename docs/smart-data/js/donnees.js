/* Projet Smart Data — jeu de 600 annonces de voitures d'occasion SIMULÉES.
 *
 * Les annonces sont générées par un modèle simple et déterministe (graine fixe) :
 * la page affiche toujours les mêmes 600 annonces. Les ordres de grandeur (prix neufs,
 * décote, kilométrage annuel, primes des professionnels) sont réalistes, mais aucune
 * annonce ne correspond à un véhicule réel.
 *
 * Expose window.ANNONCES (tableau de 600 objets) et window.META (listes de référence).
 */
(function () {
  "use strict";

  // Générateur pseudo-aléatoire à graine (mulberry32) : mêmes données à chaque ouverture
  let graine = 20261022;
  function alea() {
    graine |= 0; graine = (graine + 0x6d2b79f5) | 0;
    let t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const entre = (a, b) => a + (b - a) * alea();
  const entier = (a, b) => Math.floor(entre(a, b + 1));
  // Loi normale (Box-Muller)
  const normale = (m = 0, s = 1) => m + s * Math.sqrt(-2 * Math.log(1 - alea())) * Math.cos(2 * Math.PI * alea());
  function tirer(poids) {
    const total = poids.reduce((s, p) => s + p[1], 0);
    let r = alea() * total;
    for (const [v, p] of poids) { r -= p; if (r <= 0) return v; }
    return poids[poids.length - 1][0];
  }

  const ANNEE_REF = 2026;

  // Note de fiabilité constructeur (/10) et coefficient de coût d'entretien
  const CONSTRUCTEURS = {
    Toyota: { fiabilite: 8.7, entretien: 0.9 },
    Dacia: { fiabilite: 7.6, entretien: 0.8 },
    Peugeot: { fiabilite: 7.1, entretien: 1.0 },
    Renault: { fiabilite: 6.8, entretien: 1.0 },
    Citroën: { fiabilite: 6.9, entretien: 1.0 },
    Volkswagen: { fiabilite: 7.4, entretien: 1.15 },
    BMW: { fiabilite: 7.3, entretien: 1.45 },
    Tesla: { fiabilite: 6.6, entretien: 1.1 },
  };

  // Modèles : segment, prix neuf de référence (€), plage de CV, énergies possibles (avec année de début)
  const MODELES = [
    { c: "Peugeot", m: "208", seg: "Citadine", neuf: 21000, cv: [4, 6], en: { Essence: 2015, Diesel: 2015, Électrique: 2020 } },
    { c: "Peugeot", m: "308", seg: "Compacte", neuf: 28000, cv: [5, 8], en: { Essence: 2015, Diesel: 2015, Hybride: 2021 } },
    { c: "Peugeot", m: "3008", seg: "SUV", neuf: 34000, cv: [6, 9], en: { Essence: 2016, Diesel: 2016, Hybride: 2020 } },
    { c: "Renault", m: "Clio", seg: "Citadine", neuf: 19000, cv: [4, 6], en: { Essence: 2015, Diesel: 2015, Hybride: 2020 } },
    { c: "Renault", m: "Captur", seg: "SUV", neuf: 25000, cv: [5, 7], en: { Essence: 2015, Diesel: 2015, Hybride: 2020 } },
    { c: "Renault", m: "Mégane", seg: "Compacte", neuf: 27000, cv: [5, 9], en: { Essence: 2015, Diesel: 2015, Électrique: 2022 } },
    { c: "Volkswagen", m: "Polo", seg: "Citadine", neuf: 21000, cv: [4, 6], en: { Essence: 2015, Diesel: 2015 } },
    { c: "Volkswagen", m: "Golf", seg: "Compacte", neuf: 31000, cv: [5, 10], en: { Essence: 2015, Diesel: 2015, Hybride: 2020 } },
    { c: "Tesla", m: "Model 3", seg: "Berline", neuf: 47000, cv: [4, 6], en: { Électrique: 2019 } },
    { c: "BMW", m: "Série 1", seg: "Compacte", neuf: 34000, cv: [6, 11], en: { Essence: 2015, Diesel: 2015 } },
    { c: "BMW", m: "Série 3", seg: "Berline", neuf: 45000, cv: [8, 15], en: { Essence: 2015, Diesel: 2015, Hybride: 2019 } },
    { c: "Dacia", m: "Sandero", seg: "Citadine", neuf: 13000, cv: [4, 5], en: { Essence: 2015, Diesel: 2015 } },
    { c: "Dacia", m: "Duster", seg: "SUV", neuf: 18000, cv: [5, 7], en: { Essence: 2015, Diesel: 2015 } },
    { c: "Toyota", m: "Yaris", seg: "Citadine", neuf: 20000, cv: [4, 5], en: { Essence: 2015, Hybride: 2015 } },
    { c: "Toyota", m: "C-HR", seg: "SUV", neuf: 30000, cv: [5, 7], en: { Hybride: 2017 } },
    { c: "Citroën", m: "C3", seg: "Citadine", neuf: 17000, cv: [4, 5], en: { Essence: 2015, Diesel: 2015 } },
    { c: "Citroën", m: "C5 Aircross", seg: "SUV", neuf: 31000, cv: [6, 8], en: { Essence: 2019, Diesel: 2019, Hybride: 2020 } },
  ];

  // Surcoût à neuf selon l'énergie, kilométrage annuel moyen, coût d'entretien de base (€/an)
  // et décote annuelle (les électriques perdent de la valeur plus vite)
  const ENERGIES = {
    Essence: { prix: 1.0, kmAn: 10500, entretien: 720, decote: 0.90 },
    Diesel: { prix: 1.06, kmAn: 17500, entretien: 880, decote: 0.89 },
    Hybride: { prix: 1.12, kmAn: 13000, entretien: 640, decote: 0.905 },
    Électrique: { prix: 1.28, kmAn: 12500, entretien: 420, decote: 0.85 },
  };

  // Plateformes : part des annonces, part de particuliers, prime pro, profil d'âge (années)
  const PLATEFORMES = {
    LeBonCoin: { part: 0.40, particuliers: 0.62, ageMoy: 6.0 },
    "La Centrale": { part: 0.28, particuliers: 0.18, ageMoy: 4.8 },
    Autosphère: { part: 0.20, particuliers: 0, ageMoy: 3.6 },
    VendezVotreVoiture: { part: 0.12, particuliers: 0, ageMoy: 5.4 },
  };
  // Attirance de chaque plateforme pour les énergies (donne des mix différents, testés par le Khi²)
  const AFFINITE = {
    LeBonCoin: { Essence: 1.0, Diesel: 1.6, Hybride: 0.7, Électrique: 0.55 },
    "La Centrale": { Essence: 1.0, Diesel: 1.0, Hybride: 1.1, Électrique: 1.3 },
    Autosphère: { Essence: 1.0, Diesel: 0.6, Hybride: 1.7, Électrique: 1.5 },
    VendezVotreVoiture: { Essence: 1.0, Diesel: 1.25, Hybride: 0.85, Électrique: 0.8 },
  };

  // 13 régions métropolitaines : poids (population), effet prix, grandes villes
  const REGIONS = {
    "11": { nom: "Île-de-France", poids: 12.3, effet: 1.04, villes: ["Paris", "Boulogne-Billancourt", "Versailles", "Saint-Denis"] },
    "84": { nom: "Auvergne-Rhône-Alpes", poids: 8.2, effet: 1.02, villes: ["Lyon", "Grenoble", "Saint-Étienne", "Clermont-Ferrand"] },
    "32": { nom: "Hauts-de-France", poids: 6.0, effet: 0.97, villes: ["Lille", "Amiens", "Roubaix", "Calais"] },
    "75": { nom: "Nouvelle-Aquitaine", poids: 6.1, effet: 0.98, villes: ["Bordeaux", "Limoges", "Poitiers", "Pau"] },
    "76": { nom: "Occitanie", poids: 6.1, effet: 0.99, villes: ["Toulouse", "Montpellier", "Nîmes", "Perpignan"] },
    "93": { nom: "Provence-Alpes-Côte d'Azur", poids: 5.2, effet: 1.02, villes: ["Marseille", "Nice", "Toulon", "Avignon"] },
    "44": { nom: "Grand Est", poids: 5.6, effet: 0.98, villes: ["Strasbourg", "Reims", "Metz", "Mulhouse"] },
    "52": { nom: "Pays de la Loire", poids: 3.9, effet: 0.99, villes: ["Nantes", "Angers", "Le Mans", "Saint-Nazaire"] },
    "28": { nom: "Normandie", poids: 3.3, effet: 0.97, villes: ["Rouen", "Le Havre", "Caen", "Cherbourg-en-Cotentin"] },
    "53": { nom: "Bretagne", poids: 3.4, effet: 0.98, villes: ["Rennes", "Brest", "Quimper", "Lorient"] },
    "27": { nom: "Bourgogne-Franche-Comté", poids: 2.8, effet: 0.96, villes: ["Dijon", "Besançon", "Belfort", "Chalon-sur-Saône"] },
    "24": { nom: "Centre-Val de Loire", poids: 2.6, effet: 0.96, villes: ["Tours", "Orléans", "Bourges", "Blois"] },
    "94": { nom: "Corse", poids: 0.6, effet: 1.03, villes: ["Ajaccio", "Bastia"] },
  };

  const arrondir = (x, pas) => Math.round(x / pas) * pas;
  const borner = (x, a, b) => Math.min(b, Math.max(a, x));

  const annonces = [];
  for (let i = 0; i < 600; i++) {
    const plateforme = tirer(Object.entries(PLATEFORMES).map(([k, p]) => [k, p.part]));
    const P = PLATEFORMES[plateforme];
    const type_vendeur = alea() < P.particuliers ? "Particulier" : "Professionnel";

    // Année : âge tiré autour du profil de la plateforme
    const annee = borner(Math.round(ANNEE_REF - Math.max(1, normale(P.ageMoy, 2.4))), 2015, 2025);

    // Modèle et énergie compatibles avec l'année
    let modele, energie;
    do {
      modele = MODELES[entier(0, MODELES.length - 1)];
      const possibles = Object.entries(modele.en).filter(([, debut]) => annee >= debut);
      if (!possibles.length) { modele = null; continue; }
      energie = tirer(possibles.map(([e]) => [e, AFFINITE[plateforme][e] * (e === "Diesel" ? Math.max(0.3, 1.3 - (annee - 2015) * 0.09) : 1)]));
    } while (!modele);

    const C = CONSTRUCTEURS[modele.c], E = ENERGIES[energie];
    const age = ANNEE_REF - annee;

    // Kilométrage cohérent avec l'âge et l'énergie (variabilité de ±35 % environ)
    const kilometrage = borner(arrondir(E.kmAn * (age - 0.5) * Math.exp(normale(0, 0.28)), 100), 3000, 280000);

    // Puissance fiscale : dans la plage du modèle, bornée à 4–15 CV
    const chevaux_fiscaux = borner(entier(modele.cv[0], modele.cv[1]) + (energie === "Électrique" ? -1 : 0), 4, 15);

    // Prix : neuf × énergie × puissance × décote(âge) × effet km × région × bruit
    const kmAttendu = E.kmAn * age;
    const effetKm = borner(1 - 0.17 * (kilometrage - kmAttendu) / 50000, 0.72, 1.18);
    // Décote : environ -12 % à la première immatriculation, puis -9,5 à -15 % par an selon l'énergie
    const decote = 0.88 * Math.pow(E.decote, age);
    const puissance = 1 + 0.045 * (chevaux_fiscaux - modele.cv[0]);
    const regionCode = tirer(Object.entries(REGIONS).map(([k, r]) => [k, r.poids]));
    const R = REGIONS[regionCode];
    let prix = modele.neuf * E.prix * puissance * decote * effetKm * R.effet * Math.exp(normale(0, 0.07));
    // Prime des professionnels (garantie, remise en état) : +8 à +12 %
    const prime = type_vendeur === "Professionnel" ? entre(0.08, 0.12) : 0;
    prix *= 1 + prime;
    prix = Math.max(2500, type_vendeur === "Professionnel" ? arrondir(prix, 100) - 10 : arrondir(prix, 50));

    // Données utilisateurs couplées
    const note_avis = borner(Math.round((2.3 + C.fiabilite * 0.27 + normale(0, 0.35)) * 10) / 10, 1, 5);
    const usage = energie === "Diesel" ? tirer([["Routier", 0.55], ["Mixte", 0.35], ["Urbain", 0.10]])
      : modele.seg === "Citadine" || energie === "Électrique" ? tirer([["Urbain", 0.55], ["Mixte", 0.35], ["Routier", 0.10]])
      : tirer([["Mixte", 0.5], ["Routier", 0.3], ["Urbain", 0.2]]);
    const cout_entretien = arrondir((E.entretien + age * 28 + kilometrage / 1000 * 1.6) * C.entretien * Math.exp(normale(0, 0.12)), 10);

    annonces.push({
      id: i + 1,
      plateforme, type_vendeur,
      constructeur: modele.c, modele: modele.m, fiabilite_constructeur: C.fiabilite, segment: modele.seg,
      annee, kilometrage, chevaux_fiscaux, energie, prix,
      region: R.nom, region_code: regionCode, ville: R.villes[entier(0, R.villes.length - 1)],
      profil_utilisateur: { note_avis, usage, cout_entretien },
    });
  }

  window.ANNONCES = annonces;
  window.META = {
    plateformes: Object.keys(PLATEFORMES),
    energies: ["Essence", "Diesel", "Électrique", "Hybride"],
    constructeurs: Object.keys(CONSTRUCTEURS).sort((a, b) => a.localeCompare(b, "fr")),
    regions: Object.fromEntries(Object.entries(REGIONS).map(([k, r]) => [k, r.nom])),
    anneeRef: ANNEE_REF,
  };
})();
