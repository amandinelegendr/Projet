# Ventes de voitures par région

Site : répartition par région, département et grande ville des immatriculations de voitures particulières (neuves et d'occasion) sur les deux dernières années disponibles, avec une carte de France interactive (clic sur une région pour zoomer sur ses départements et grandes villes).

## Organisation

| Dossier | Contenu |
| --- | --- |
| `scripts/extraction_immatriculations.py` | Télécharge les données du SDES (API DiDo) et les agrège par région (code officiel géographique INSEE) |
| `docs/data/immatriculations_regions.json` | Données agrégées, lues par le site |
| `scripts/extraction_insee.py` | Récupère les données de référence Insee par région (API Melodi) |
| `docs/data/insee_regions.json` | Population, revenu médian et taux de ménages motorisés par région |
| `docs/data/insee_territoires.json` | Mêmes indicateurs par département et pour les grandes villes retenues |
| `docs/data/immatriculations_territoires.json` | Immatriculations par département et grande ville |
| `docs/data/departements.geojson` | Contours des départements métropolitains ([france-geojson](https://github.com/gregoiredavid/france-geojson)) |
| `scripts/verifier_donnees.py` | Contrôles de cohérence lancés par l'Action (somme des départements = région, etc.) |
| `docs/data/regions.geojson` | Contours des régions métropolitaines ([france-geojson](https://github.com/gregoiredavid/france-geojson), données IGN/INSEE) |
| `docs/index.html` | Site publié par GitHub Pages |
| `.github/workflows/mise-a-jour-donnees.yml` | Action hebdomadaire qui relance l'extraction et commit les nouvelles données |

## Sources

- **Immatriculations** : SDES, *Répertoire statistique des véhicules routiers*, jeu « Immatriculations de véhicules routiers » (mise à jour annuelle, données par commune).
- **Découpage régional** : INSEE, code officiel géographique.
- **Population** : Insee, populations de référence 2023 (population municipale). Mayotte n'ayant pas de population légale publiée, on utilise l'estimation de population Insee au 1er janvier 2023.
- **Revenu médian** : Insee, Filosofi 2023, niveau de vie médian (revenu disponible médian par unité de consommation). Non publié pour la Guadeloupe, la Martinique, la Guyane et Mayotte.
- **Ménages motorisés** : Insee, recensement de la population 2023, part des ménages ayant au moins une voiture. Non publié pour Mayotte.
- **Grandes villes** : API Découpage administratif ([geo.api.gouv.fr](https://geo.api.gouv.fr)). Dans chaque région de métropole, les 4 communes les plus peuplées, une par département au plus. Les chiffres portent sur la commune elle-même, pas sur toute l'agglomération.

L'INSEE ne publie les immatriculations qu'au niveau national (base BDM) ; le détail régional provient du SDES, service statistique ministériel.

## Lancer l'extraction à la main

```bash
python scripts/extraction_insee.py
python scripts/extraction_immatriculations.py
python scripts/verifier_donnees.py
```

Aucune dépendance ni clé d'API n'est nécessaire. Si une future source en demande une, elle sera stockée dans *Settings → Secrets and variables → Actions* et lue par le script via une variable d'environnement, jamais écrite dans le code.

## Publication

*Settings → Pages* : source « Deploy from a branch », branche `main`, dossier `/docs`.
