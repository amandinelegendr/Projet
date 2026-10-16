"""Extraction des immatriculations de voitures particulières par région.

Source : SDES (ministère de la Transition écologique), répertoire statistique
des véhicules routiers, diffusé par l'API DiDo. Les communes sont rattachées
aux régions grâce au code officiel géographique de l'INSEE (code département).

Le script garde automatiquement les deux dernières années disponibles et écrit
docs/data/immatriculations_regions.json et docs/data/immatriculations_territoires.json
(départements et grandes villes choisies par extraction_insee.py), lus par le site.

Utilisation : python scripts/extraction_immatriculations.py
(aucune dépendance externe, aucune clé d'API nécessaire)
"""

import csv
import io
import json
import re
import urllib.request
from datetime import date
from pathlib import Path

API = "https://data.statistiques.developpement-durable.gouv.fr/dido/api/v1"
DATASET = "682c30aad455a8571c7d00fe"
DONNEES = Path(__file__).resolve().parent.parent / "docs" / "data"
SORTIE = DONNEES / "immatriculations_regions.json"
SORTIE_TERRITOIRES = DONNEES / "immatriculations_territoires.json"
TERRITOIRES_INSEE = DONNEES / "insee_territoires.json"

# Régions (code INSEE) et départements qui les composent
REGIONS = {
    "84": ("Auvergne-Rhône-Alpes", "01 03 07 15 26 38 42 43 63 69 73 74"),
    "27": ("Bourgogne-Franche-Comté", "21 25 39 58 70 71 89 90"),
    "53": ("Bretagne", "22 29 35 56"),
    "24": ("Centre-Val de Loire", "18 28 36 37 41 45"),
    "94": ("Corse", "2A 2B"),
    "44": ("Grand Est", "08 10 51 52 54 55 57 67 68 88"),
    "32": ("Hauts-de-France", "02 59 60 62 80"),
    "11": ("Île-de-France", "75 77 78 91 92 93 94 95"),
    "28": ("Normandie", "14 27 50 61 76"),
    "75": ("Nouvelle-Aquitaine", "16 17 19 23 24 33 40 47 64 79 86 87"),
    "76": ("Occitanie", "09 11 12 30 31 32 34 46 48 65 66 81 82"),
    "52": ("Pays de la Loire", "44 49 53 72 85"),
    "93": ("Provence-Alpes-Côte d'Azur", "04 05 06 13 83 84"),
    "01": ("Guadeloupe", "971"),
    "02": ("Martinique", "972"),
    "03": ("Guyane", "973"),
    "04": ("La Réunion", "974"),
    "06": ("Mayotte", "976"),
}
DEP_VERS_REGION = {dep: code for code, (_, deps) in REGIONS.items() for dep in deps.split()}

# Regroupement des carburants du SDES en quatre familles lisibles
FAMILLES = {
    "Electrique et hydrogène": "Électrique",
    "Hybride rechargeable": "Hybride rechargeable",
    "Essence - hybride NR": "Hybride non rechargeable",
    "Diesel - hybride NR": "Hybride non rechargeable",
    "Essence - thermique": "Essence",
    "Diesel - thermique": "Diesel",
}


def lire_json(url):
    with urllib.request.urlopen(url, timeout=120) as reponse:
        return json.load(reponse)


def departement_de(code_commune):
    return code_commune[:3] if code_commune.startswith("97") else code_commune[:2]


def region_de(code_commune):
    return DEP_VERS_REGION.get(departement_de(code_commune))


def ajouter(totaux, cle, annee, famille, n):
    par_annee = totaux.setdefault(cle, {}).setdefault(str(annee), {"total": 0, "carburants": {}})
    par_annee["total"] += n
    par_annee["carburants"][famille] = par_annee["carburants"].get(famille, 0) + n


def extraire(fichier, millesime, annees, villes):
    """Télécharge un fichier DiDo filtré sur les VP et l'agrège par région, département et grande ville."""
    colonnes = ["COMMUNE_CODE", "CARBURANT"] + [f"IMMAT_{a}" for a in annees]
    url = (
        f"{API}/datafiles/{fichier['rid']}/csv?millesime={millesime}"
        "&withColumnName=true&withColumnDescription=false&withColumnUnit=false"
        f"&columns={','.join(colonnes)}&GROUPE=eq:VP"
    )
    totaux, par_dep, par_ville = {}, {}, {}
    hors_region = {a: 0 for a in annees}
    with urllib.request.urlopen(url, timeout=600) as reponse:
        lecteur = csv.DictReader(io.TextIOWrapper(reponse, encoding="utf-8"), delimiter=";")
        for ligne in lecteur:
            commune = ligne["COMMUNE_CODE"]
            region = region_de(commune)
            famille = FAMILLES.get(ligne["CARBURANT"], "Autre")
            for a in annees:
                n = int(ligne[f"IMMAT_{a}"] or 0)
                if region is None:
                    hors_region[a] += n
                    continue
                ajouter(totaux, region, a, famille, n)
                ajouter(par_dep, departement_de(commune), a, famille, n)
                if commune in villes:
                    ajouter(par_ville, commune, a, famille, n)
    return totaux, par_dep, par_ville, hors_region


def main():
    jeu = lire_json(f"{API}/datasets/{DATASET}")
    fichiers = {}
    for f in jeu["datafiles"]:
        cle = "occasions" if "occasion" in f["title"].lower() else "neufs"
        fichiers[cle] = f
    millesime = max(m["millesime"] for m in fichiers["neufs"]["millesimes"])

    # Les années disponibles se lisent dans les noms de colonnes IMMAT_AAAA
    exemple = lire_json(
        f"{API}/datafiles/{fichiers['neufs']['rid']}/rows?millesime={millesime}&page=1&pageSize=10"
    )
    annees = sorted(int(m.group(1)) for c in exemple["data"][0] if (m := re.fullmatch(r"IMMAT_(\d{4})", c)))[-2:]

    # Grandes villes choisies par scripts/extraction_insee.py (à lancer avant ce script)
    villes = set()
    if TERRITOIRES_INSEE.exists():
        villes = set(json.loads(TERRITOIRES_INSEE.read_text(encoding="utf-8"))["villes"])

    regions = {code: {"code": code, "nom": nom} for code, (nom, _) in REGIONS.items()}
    departements, grandes_villes = {}, {}
    non_localises = {}
    for type_vente in ("neufs", "occasions"):
        totaux, par_dep, par_ville, hors_region = extraire(fichiers[type_vente], millesime, annees, villes)
        non_localises[type_vente] = {str(a): n for a, n in hors_region.items()}
        for code, valeurs in totaux.items():
            regions[code][type_vente] = valeurs
        for code, valeurs in par_dep.items():
            departements.setdefault(code, {"code": code, "region": DEP_VERS_REGION[code]})[type_vente] = valeurs
        for code, valeurs in par_ville.items():
            grandes_villes.setdefault(code, {"code": code})[type_vente] = valeurs

    resultat = {
        "titre": "Immatriculations de voitures particulières par région",
        "source": "SDES, répertoire statistique des véhicules routiers (API DiDo) ; découpage régional INSEE (COG)",
        "jeu_de_donnees": f"https://www.statistiques.developpement-durable.gouv.fr/catalogue?page=dataset&datasetId={DATASET}",
        "millesime": millesime,
        "mise_a_jour": date.today().isoformat(),
        "annees": annees,
        "non_localises": non_localises,
        "regions": list(regions.values()),
    }
    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    SORTIE.write_text(json.dumps(resultat, ensure_ascii=False, indent=1), encoding="utf-8")
    SORTIE_TERRITOIRES.write_text(json.dumps({
        "titre": "Immatriculations de voitures particulières par département et grande ville",
        "millesime": millesime,
        "mise_a_jour": resultat["mise_a_jour"],
        "annees": annees,
        "departements": departements,
        "villes": grandes_villes,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{SORTIE} écrit : années {annees}, millésime {millesime}")


if __name__ == "__main__":
    main()
