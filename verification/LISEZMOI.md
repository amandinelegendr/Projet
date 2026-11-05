# Vérification des annonces avant publication

`cellules.json` liste les groupes (modèle, année, carburant, fourchette de prix) dans lesquels le site propose
de « meilleures annonces ». Il ne contient aucun identifiant ni lien d'annonce.

Il sert à vérifier sur leboncoin, par une recherche par groupe, que les annonces retenues sont toujours en ligne :
seules les annonces retrouvées actives sont écrites dans `docs/affaires.js` (le fichier publié sur le site).
