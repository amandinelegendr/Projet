"""Contrôles de cohérence des données publiées dans docs/data.

Échoue (code de sortie 1) si une incohérence est détectée, ce qui fait échouer l'Action
avant que des données douteuses ne soient enregistrées.
Utilisation : python scripts/verifier_donnees.py
"""

import json
import sys
from pathlib import Path

DONNEES = Path(__file__).resolve().parent.parent / "docs" / "data"
erreurs = []


def lire(nom):
    return json.loads((DONNEES / nom).read_text(encoding="utf-8"))


def verifier(condition, message):
    if not condition:
        erreurs.append(message)


reg = lire("immatriculations_regions.json")
ter = lire("immatriculations_territoires.json")
ins_reg = lire("insee_regions.json")
ins_ter = lire("insee_territoires.json")
annees = [str(a) for a in reg["annees"]]

verifier(len(reg["regions"]) == 18, f"18 régions attendues, {len(reg['regions'])} trouvées")
verifier(len(ins_ter["departements"]) == 101, f"101 départements attendus, {len(ins_ter['departements'])} trouvés")

for r in reg["regions"]:
    for t in ("neufs", "occasions"):
        for a in annees:
            bloc = r.get(t, {}).get(a)
            verifier(bloc is not None, f"{r['nom']} : {t} {a} manquant")
            if not bloc:
                continue
            verifier(sum(bloc["carburants"].values()) == bloc["total"],
                     f"{r['nom']} {t} {a} : la somme des motorisations ne fait pas le total")
            deps = [d for d in ter["departements"].values() if d["region"] == r["code"]]
            somme = sum(d.get(t, {}).get(a, {}).get("total", 0) for d in deps)
            verifier(somme == bloc["total"], f"{r['nom']} {t} {a} : départements {somme} ≠ région {bloc['total']}")

for code, r in ins_reg["regions"].items():
    verifier(r["population"], f"population manquante pour {r['nom']}")

for code, v in ins_ter["villes"].items():
    verifier(code in ter["villes"], f"immatriculations manquantes pour la ville {v['nom']}")
    verifier(v["population"], f"population manquante pour la ville {v['nom']}")
    verifier(-62 < v["lon"] < 10 and 41 < v["lat"] < 52, f"coordonnées hors métropole pour {v['nom']}")

if erreurs:
    print("Données incohérentes :\n- " + "\n- ".join(erreurs))
    sys.exit(1)
print(f"Données cohérentes : {len(reg['regions'])} régions, {len(ter['departements'])} départements, "
      f"{len(ter['villes'])} villes, années {', '.join(annees)}")
