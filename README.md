# Carnet de vol HOP!

Carnet de vol pour les PN HOP!, à ouvrir sur iPhone ou Android et à installer sur l'écran d'accueil.

- **Relevés d'activité PDF** (MyPeopleDoc) lus directement sur le téléphone : heures bloc réelles, immatriculations, hôtels, jours OFF, congés, réserves.
- **Planning** importé par un raccourci iPhone ou un fichier calendrier .ics (Android) : vols pas encore sur un relevé, CDB, noms d'hôtels.
- Onglets Vols (par avion, par immatriculation), Simu, Escales, Jours, Hôtels, Transports, Bilan, Impôts (frais en courrier).
- Heures de nuit au sens EASA (crépuscule civil), calculées le long de la route.

**Confidentialité** : aucune donnée n'est envoyée. Tout est calculé et enregistré dans le téléphone de chacun. Ce dépôt ne contient que le code de l'application : ne jamais y déposer de relevé, de planning ou de sauvegarde.

Hébergement : GitHub Pages (fichiers statiques, aucun serveur). Fonctionne hors ligne une fois ouverte.

## Mettre à jour l'application
1. Remplacer les fichiers modifiés (« Add file » → « Upload files »).
2. Dans `sw.js`, changer `VERSION` (par ex. `carnet-1.0.1`) : les téléphones téléchargent alors la nouvelle version et affichent « Nouvelle version disponible ».

## Contenu
- `index.html`, `app.css`, `js/` : l'application (`core.js` calculs, `calendar.js` planning, `releve.js` relevés PDF, `store.js` données et fusion, `app.js` interface).
- `vendor/` : pdf.js (Mozilla, Apache 2.0) et fond de carte (Apache ECharts, Apache 2.0).
- `fonts/` : Barlow, Barlow Condensed, IBM Plex Mono (SIL Open Font License).
- `sw.js`, `manifest.webmanifest`, `icons/` : installation et fonctionnement hors ligne.
