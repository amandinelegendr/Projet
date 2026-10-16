"""Données de référence Insee par territoire (régions, départements, grandes villes).

Sources, sans clé d'API :
- API Melodi de l'Insee (https://api.insee.fr/melodi)
  * Population légale : population municipale (DS_POPULATIONS_REFERENCE) ;
    à défaut (Mayotte), estimation de population de la même année (DS_ESTIMATION_POPULATION)
  * Revenu disponible médian par unité de consommation (niveau de vie médian, Filosofi, DS_FILOSOFI_CC)
  * Taux de ménages ayant au moins une voiture (recensement, DS_RP_LOGEMENT_PRINC)
- API Découpage administratif (https://geo.api.gouv.fr) : noms des départements,
  population et coordonnées des communes, pour choisir les grandes villes.

Grandes villes retenues : dans chaque région de métropole, les 4 communes les plus
peuplées, à raison d'une par département au plus (pour ne pas retenir deux communes
d'une même agglomération, comme Lyon et Villeurbanne).

Écrit docs/data/insee_regions.json et docs/data/insee_territoires.json, lus par le site.
Utilisation : python scripts/extraction_insee.py
"""

import json
import re
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

API = "https://api.insee.fr/melodi/data"
GEO_API = "https://geo.api.gouv.fr"
DOSSIER = Path(__file__).resolve().parent.parent / "docs" / "data"
VILLES_PAR_REGION = 4

REGIONS = {
    "11": ("IDF", "Île-de-France"), "84": ("ARA", "Auvergne-Rhône-Alpes"), "32": ("HDF", "Hauts-de-France"),
    "75": ("NAQ", "Nouvelle-Aquitaine"), "76": ("OCC", "Occitanie"), "93": ("PACA", "Provence-Alpes-Côte d'Azur"),
    "44": ("GES", "Grand Est"), "52": ("PDL", "Pays de la Loire"), "28": ("NOR", "Normandie"),
    "53": ("BRE", "Bretagne"), "27": ("BFC", "Bourgogne-Franche-Comté"), "24": ("CVL", "Centre-Val de Loire"),
    "94": ("COR", "Corse"), "01": ("GUA", "Guadeloupe"), "02": ("MTQ", "Martinique"), "03": ("GUF", "Guyane"),
    "04": ("REU", "La Réunion"), "06": ("MAY", "Mayotte"),
}
OUTRE_MER = {"01", "02", "03", "04", "06"}
# Dimensions laissées à « total » pour le tableau logement
LOGEMENT_TOTAUX = {d: "_T" for d in ("BUILD_END", "NRG_SRC", "TDW", "TSH", "CARPARK", "NOR", "L_STAY")}


def lire_json(url):
    with urllib.request.urlopen(url, timeout=120) as reponse:
        return json.load(reponse)


def observations(jeu, geo, **filtres):
    """Toutes les observations d'un jeu Melodi. `geo` est un niveau ("REG") ou une liste de codes."""
    geos = [geo] if isinstance(geo, str) else list(geo)
    resultat = []
    # Les listes de communes sont envoyées par paquets (paramètre GEO répété)
    for i in range(0, len(geos), 20):
        params = [("GEO", g) for g in geos[i:i + 20]] + list(filtres.items()) + [("maxResult", 5000)]
        url = f"{API}/{jeu}?" + urllib.parse.urlencode(params)
        while url:
            page = lire_json(url)
            resultat += page.get("observations", [])
            url = page.get("paging", {}).get("next")
    return resultat


def code_geo(geo):
    # "2025-REG-84" -> ("REG", "84") ; "2026-COM-69123" -> ("COM", "69123")
    m = re.fullmatch(r"(?:\d{4}-)?([A-Z]+)-(\w+)", geo)
    return (m.group(1), m.group(2)) if m else (None, None)


def dernier(obs):
    """Ne garde que la période la plus récente."""
    if not obs:
        return None, []
    periode = max(o["dimensions"]["TIME_PERIOD"] for o in obs)
    return periode, [o for o in obs if o["dimensions"]["TIME_PERIOD"] == periode]


def valeur(o):
    return o["measures"]["OBS_VALUE_NIVEAU"]["value"]


def completer(territoires, niveau, geo):
    """Ajoute population, revenu médian et taux de ménages motorisés aux territoires d'un niveau."""
    millesimes = {}

    an, pop = dernier(observations("DS_POPULATIONS_REFERENCE", geo, POPREF_MEASURE="PMUN"))
    millesimes["population"] = an
    for o in pop:
        n, c = code_geo(o["dimensions"]["GEO"])
        if n == niveau and c in territoires:
            territoires[c]["population"] = int(valeur(o))
    manquants = [c for c, t in territoires.items() if t["population"] is None]
    if manquants and niveau != "COM":
        estimations = observations("DS_ESTIMATION_POPULATION", geo, SEX="_T", AGE="_T",
                                   EP_MEASURE="POP_JAN_1ST", TIME_PERIOD=an)
        for o in estimations:
            n, c = code_geo(o["dimensions"]["GEO"])
            if n == niveau and c in manquants:
                territoires[c]["population"] = int(valeur(o))
                territoires[c]["note_population"] = (
                    f"Estimation de population au 1er janvier {an} (pas de population légale publiée)")

    an, rev = dernier(observations("DS_FILOSOFI_CC", geo, FILOSOFI_MEASURE="MED_SL"))
    millesimes["revenu_median"] = an
    for o in rev:
        n, c = code_geo(o["dimensions"]["GEO"])
        if n == niveau and c in territoires:
            territoires[c]["revenu_median"] = int(valeur(o))

    an, equ = dernier(observations("DS_RP_LOGEMENT_PRINC", geo, OCS="DW_MAIN", RP_MEASURE="DWELLINGS",
                                   **LOGEMENT_TOTAUX))
    millesimes["menages_motorises"] = an
    par_geo = {}
    for o in equ:
        par_geo.setdefault(o["dimensions"]["GEO"], {})[o["dimensions"]["CARS"]] = valeur(o)
    for g, v in par_geo.items():
        n, c = code_geo(g)
        if n == niveau and c in territoires and v.get("_T") and "C_GE1" in v:
            territoires[c]["menages_motorises"] = round(100 * v["C_GE1"] / v["_T"], 1)
    return millesimes


def vide(**champs):
    return {**champs, "population": None, "revenu_median": None, "menages_motorises": None}


def grandes_villes(code_region):
    communes = lire_json(f"{GEO_API}/communes?codeRegion={code_region}"
                         "&fields=nom,code,population,centre,codeDepartement&format=json")
    villes, deps = [], set()
    for c in sorted(communes, key=lambda c: c.get("population") or 0, reverse=True):
        if c["codeDepartement"] in deps or not c.get("centre"):
            continue
        deps.add(c["codeDepartement"])
        villes.append(c)
        if len(villes) == VILLES_PAR_REGION:
            break
    return villes


def main():
    # Régions
    regions = {c: vide(code=c, abrev=a, nom=n) for c, (a, n) in REGIONS.items()}
    millesimes = completer(regions, "REG", "REG")
    _, rev_fr = dernier(observations("DS_FILOSOFI_CC", "FRANCE", FILOSOFI_MEASURE="MED_SL"))
    _, equ_fr = dernier(observations("DS_RP_LOGEMENT_PRINC", "FRANCE-F", OCS="DW_MAIN", RP_MEASURE="DWELLINGS",
                                     **LOGEMENT_TOTAUX))
    cars_fr = {o["dimensions"]["CARS"]: valeur(o) for o in equ_fr}
    france = {
        "population": sum(r["population"] or 0 for r in regions.values()),
        "revenu_median": int(valeur(rev_fr[0])) if rev_fr else None,
        "revenu_median_champ": "France métropolitaine",
        "menages_motorises": round(100 * cars_fr["C_GE1"] / cars_fr["_T"], 1) if cars_fr.get("_T") else None,
    }

    # Départements
    departements = {d["code"]: vide(code=d["code"], nom=d["nom"], region=d["codeRegion"])
                    for d in lire_json(f"{GEO_API}/departements?fields=nom,code,codeRegion")
                    if d["codeRegion"] in REGIONS}
    completer(departements, "DEP", "DEP")

    # Grandes villes (régions de métropole)
    villes = {}
    for code_region in REGIONS:
        if code_region in OUTRE_MER:
            continue
        for c in grandes_villes(code_region):
            lon, lat = c["centre"]["coordinates"]
            villes[c["code"]] = vide(code=c["code"], nom=c["nom"], dep=c["codeDepartement"],
                                     region=code_region, lon=round(lon, 4), lat=round(lat, 4))
    completer(villes, "COM", [f"COM-{c}" for c in villes])

    commun = {
        "source": "Insee, API Melodi : populations de référence, Filosofi, recensement de la population",
        "millesimes": millesimes,
        "definitions": {
            "population": "Population municipale (population légale)",
            "revenu_median": "Revenu disponible médian annuel par unité de consommation (niveau de vie médian), en euros",
            "menages_motorises": "Part des ménages disposant d'au moins une voiture, en %",
        },
        "mise_a_jour": date.today().isoformat(),
    }
    DOSSIER.mkdir(parents=True, exist_ok=True)
    (DOSSIER / "insee_regions.json").write_text(
        json.dumps({**commun, "france": france, "regions": regions}, ensure_ascii=False, indent=1), encoding="utf-8")
    (DOSSIER / "insee_territoires.json").write_text(json.dumps({
        **commun,
        "source_villes": "API Découpage administratif (geo.api.gouv.fr) ; 4 communes les plus peuplées par région, une par département au plus",
        "departements": departements,
        "villes": villes,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Insee : {len(regions)} régions, {len(departements)} départements, {len(villes)} villes")


if __name__ == "__main__":
    main()
