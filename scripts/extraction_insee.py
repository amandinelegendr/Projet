"""Données de référence Insee par région.

Source : API Melodi de l'Insee (https://api.insee.fr/melodi), sans clé.
- Population légale : population municipale (DS_POPULATIONS_REFERENCE)
- Revenu disponible médian par unité de consommation (niveau de vie médian, Filosofi, DS_FILOSOFI_CC)
- Taux de ménages ayant au moins une voiture (recensement, DS_RP_LOGEMENT_PRINC)

Écrit docs/data/insee_regions.json, lu par le site.
Utilisation : python scripts/extraction_insee.py
"""

import json
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

API = "https://api.insee.fr/melodi/data"
SORTIE = Path(__file__).resolve().parent.parent / "docs" / "data" / "insee_regions.json"

REGIONS = {
    "11": ("IDF", "Île-de-France"), "84": ("ARA", "Auvergne-Rhône-Alpes"), "32": ("HDF", "Hauts-de-France"),
    "75": ("NAQ", "Nouvelle-Aquitaine"), "76": ("OCC", "Occitanie"), "93": ("PACA", "Provence-Alpes-Côte d'Azur"),
    "44": ("GES", "Grand Est"), "52": ("PDL", "Pays de la Loire"), "28": ("NOR", "Normandie"),
    "53": ("BRE", "Bretagne"), "27": ("BFC", "Bourgogne-Franche-Comté"), "24": ("CVL", "Centre-Val de Loire"),
    "94": ("COR", "Corse"), "01": ("GUA", "Guadeloupe"), "02": ("MTQ", "Martinique"), "03": ("GUF", "Guyane"),
    "04": ("REU", "La Réunion"), "06": ("MAY", "Mayotte"),
}
# Dimensions laissées à « total » pour le tableau logement
LOGEMENT_TOTAUX = {d: "_T" for d in ("BUILD_END", "NRG_SRC", "TDW", "TSH", "CARPARK", "NOR", "L_STAY")}


def observations(jeu, **filtres):
    """Toutes les observations d'un jeu Melodi (pagination comprise)."""
    url = f"{API}/{jeu}?" + urllib.parse.urlencode({**filtres, "maxResult": 5000})
    resultat = []
    while url:
        with urllib.request.urlopen(url, timeout=120) as reponse:
            page = json.load(reponse)
        resultat += page.get("observations", [])
        url = page.get("paging", {}).get("next")
    return resultat


def code_region(geo):
    # "2025-REG-84" -> "84"
    return geo.rsplit("-", 1)[-1] if "-REG-" in geo else None


def dernier(obs):
    """Ne garde que la période la plus récente."""
    periode = max(o["dimensions"]["TIME_PERIOD"] for o in obs)
    return periode, [o for o in obs if o["dimensions"]["TIME_PERIOD"] == periode]


def valeur(o):
    return o["measures"]["OBS_VALUE_NIVEAU"]["value"]


def main():
    regions = {c: {"code": c, "abrev": a, "nom": n, "population": None, "revenu_median": None,
                   "menages_motorises": None} for c, (a, n) in REGIONS.items()}

    an_pop, pop = dernier(observations("DS_POPULATIONS_REFERENCE", GEO="REG", POPREF_MEASURE="PMUN"))
    for o in pop:
        c = code_region(o["dimensions"]["GEO"])
        if c in regions:
            regions[c]["population"] = int(valeur(o))
    # Mayotte n'a pas de population légale récente : on prend l'estimation Insee de la même année
    estimations = observations("DS_ESTIMATION_POPULATION", GEO="REG", SEX="_T", AGE="_T",
                               EP_MEASURE="POP_JAN_1ST", TIME_PERIOD=an_pop)
    for o in estimations:
        c = code_region(o["dimensions"]["GEO"])
        if c in regions and regions[c]["population"] is None:
            regions[c]["population"] = int(valeur(o))
            regions[c]["note_population"] = f"Estimation de population au 1er janvier {an_pop} (pas de population légale publiée)"

    an_rev, rev = dernier(observations("DS_FILOSOFI_CC", GEO="REG", FILOSOFI_MEASURE="MED_SL"))
    for o in rev:
        c = code_region(o["dimensions"]["GEO"])
        if c in regions:
            regions[c]["revenu_median"] = int(valeur(o))
    _, rev_fr = dernier(observations("DS_FILOSOFI_CC", GEO="FRANCE", FILOSOFI_MEASURE="MED_SL"))

    def taux_motorises(geo):
        an, obs = dernier(observations("DS_RP_LOGEMENT_PRINC", GEO=geo, OCS="DW_MAIN",
                                       RP_MEASURE="DWELLINGS", **LOGEMENT_TOTAUX))
        par_geo = {}
        for o in obs:
            par_geo.setdefault(o["dimensions"]["GEO"], {})[o["dimensions"]["CARS"]] = valeur(o)
        return an, {g: round(100 * v["C_GE1"] / v["_T"], 1) for g, v in par_geo.items() if v.get("_T")}

    an_equ, equ = taux_motorises("REG")
    for geo, taux in equ.items():
        c = code_region(geo)
        if c in regions:
            regions[c]["menages_motorises"] = taux
    _, equ_fr = taux_motorises("FRANCE-F")

    resultat = {
        "source": "Insee, API Melodi : populations de référence, Filosofi, recensement de la population",
        "millesimes": {"population": an_pop, "revenu_median": an_rev, "menages_motorises": an_equ},
        "definitions": {
            "population": "Population municipale (population légale)",
            "revenu_median": "Revenu disponible médian annuel par unité de consommation (niveau de vie médian), en euros",
            "menages_motorises": "Part des ménages disposant d'au moins une voiture, en %",
        },
        "mise_a_jour": date.today().isoformat(),
        "france": {
            "population": sum(r["population"] or 0 for r in regions.values()),
            "revenu_median": int(valeur(rev_fr[0])) if rev_fr else None,
            "revenu_median_champ": "France métropolitaine",
            "menages_motorises": next(iter(equ_fr.values()), None),
        },
        "regions": regions,
    }
    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    SORTIE.write_text(json.dumps(resultat, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{SORTIE} écrit")


if __name__ == "__main__":
    main()
