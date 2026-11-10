# GéoSurvey

Application mobile **Android et iPhone** de collecte de données géographiques sur le terrain,
inspirée de **QField** (saisie cartographique de points, lignes et polygones) et
d'**ArcGIS Survey123** (formulaires guidés). Les données sont stockées hors-ligne sur
l'appareil puis exportées en **Shapefile**, **Excel**, **CSV**, GeoJSON ou KML.

Développée avec [Expo](https://expo.dev) (SDK 58) / React Native 0.88 et TypeScript.

## Fonctionnalités

| Domaine | Détails |
| --- | --- |
| **Projets** | Un projet = une couche avec un type de géométrie (Point, Ligne, Polygone) et un formulaire. Trois modèles prêts à l'emploi (points d'intérêt, parcelles agricoles, réseau de pistes). |
| **Concepteur de formulaires** | Champs texte, entier, décimal, date, liste de choix, oui/non et photo ; obligatoire/facultatif, texte d'aide, réordonnancement. Le nom de colonne est généré à partir du libellé. Les types et la géométrie sont verrouillés dès que des données existent. |
| **Saisie GPS** | Suivi GPS haute précision avec indicateur de précision (vert ≤ 5 m, orange ≤ 15 m, rouge), altitude, **moyenne de positions** pour les points, **enregistrement continu** des lignes/polygones (un sommet tous les 3 m, positions > 25 m de précision ignorées). |
| **Saisie sur carte** | Toucher la carte pour placer un point ou ajouter un sommet, déplacer un sommet par glisser-déposer, annuler le dernier sommet. Fonds Plan / Satellite / Hybride. |
| **Mesures** | Longueur, périmètre et surface (m, km, m², ha, km²) calculés en direct. |
| **Formulaire** | Validation (obligatoire, entier, décimal avec virgule ou point, date valide, choix connu), photos depuis l'appareil photo ou la galerie. Bouton « Enregistrer et nouvelle saisie » pour enchaîner les relevés. |
| **Consultation** | Vue carte et vue liste des entités, modification et suppression. |
| **Hors-ligne** | Tout est stocké dans une base SQLite locale ; aucun réseau nécessaire pour collecter. |
| **Export** | Shapefile (.zip), Excel (.xlsx), CSV, GeoJSON, KML, avec photos jointes en option, partagés via la feuille de partage du système (e-mail, Drive, WhatsApp, Fichiers…). |

### Formats d'export

- **Shapefile (.zip)** : `.shp`, `.shx`, `.dbf`, `.prj`, `.cpg`. Textes encodés en UTF-8 (accents
  et arabe conservés), noms de champs limités à 10 caractères et dédoublonnés, polygones fermés
  et orientés selon la norme ESRI. Ouvrable directement dans QGIS et ArcGIS.
- **Excel (.xlsx)** : une feuille de données (en-tête figé, filtres automatiques, dates et
  booléens typés, coordonnées et géométrie WKT) et une feuille « Formulaire » décrivant les colonnes.
- **CSV** : UTF-8 avec BOM (compatible Excel), séparateur au choix (`,` `;` tabulation).
  Avec `;`, les nombres utilisent la virgule décimale (Excel en français).
- **GeoJSON** et **KML** : toujours en WGS 84.

Colonnes ajoutées automatiquement : `fid`, `uuid`, `latitude`, `longitude`, `altitude` (points),
`x`/`y` (si système projeté), `length_m`, `area_m2` (lignes/polygones), `gps_acc` (précision GPS),
`created`, `updated` et `wkt` (CSV/Excel). Les photos sont référencées par `photos/<fichier>.jpg`
dans l'archive ZIP.

### Systèmes de coordonnées

Les données sont stockées en WGS 84 (GPS). À l'export Shapefile, Excel ou CSV, on peut choisir :

| Système | Code |
| --- | --- |
| WGS 84 (latitude/longitude) | EPSG:4326 |
| UTM WGS 84, zone déterminée automatiquement | EPSG:326xx / 327xx |
| Lambert Nord Maroc (Merchich) | EPSG:26191 |
| Lambert Sud Maroc (Merchich) | EPSG:26192 |
| Web Mercator | EPSG:3857 |

Les projections sont implémentées en TypeScript pur et testées contre PROJ (écart < 1 cm).
Pour les Lambert Maroc, le changement de datum WGS 84 → Merchich utilise la translation
géocentrique EPSG:1131 (31, 146, 47 m), la même que PROJ par défaut ; sa précision est de
l'ordre de quelques mètres.

## Démarrage rapide

Prérequis : Node.js 20 ou plus récent.

```bash
cd geosurvey
```

```bash
npm install
```

```bash
npx expo start
```

Scannez le QR code avec l'application **Expo Go** (Android ou iOS) pour tester immédiatement.
Toutes les dépendances natives utilisées (cartes, SQLite, localisation, appareil photo,
fichiers, partage) sont incluses dans Expo Go.

### Construire l'application (APK / IPA)

Les builds se font dans le cloud avec [EAS Build](https://docs.expo.dev/build/introduction/),
sans Android Studio ni Xcode :

```bash
npx eas-cli@latest build --profile preview --platform android
```

```bash
npx eas-cli@latest build --profile production --platform ios
```

Le profil `preview` produit un **APK** installable directement sur un téléphone Android.
Pour iOS, un compte Apple Developer est nécessaire.

**Clé Google Maps (Android)** : en dehors d'Expo Go, la carte Android nécessite une clé
« Maps SDK for Android ». Définissez-la dans la variable d'environnement `GOOGLE_MAPS_API_KEY`
(ou un secret EAS) ; `app.config.ts` l'injecte automatiquement. Sur iOS, Apple Plans est utilisé
et aucune clé n'est nécessaire.

## Développement

```bash
npm test           # tests unitaires (Jest)
```

```bash
npm run typecheck  # vérification TypeScript
```

```bash
npm run lint       # ESLint (config Expo)
```

Les tests couvrent la géométrie, les projections (valeurs de référence PROJ), la validation des
formulaires et tous les exports. Pour vérifier les fichiers produits avec un outil externe
(QGIS, pyshp, openpyxl…), générez des exemples :

```bash
GEOSURVEY_SAMPLE_DIR=/tmp/geosurvey-samples npx jest -t exemples
```

### Structure

```
src/
  app/                     Écrans (Expo Router)
    index.tsx              Liste des projets et modèles
    project/edit.tsx       Concepteur de projet / formulaire
    project/[id]/index.tsx Carte et liste des entités
    project/[id]/collect.tsx  Saisie : localisation (GPS / carte) puis attributs
    project/[id]/export.tsx   Choix du format et partage
  core/                    Logique métier pure (testée)
    types.ts               Modèle de données
    geometry.ts            Distances, surfaces, validation des géométries
    projections.ts         UTM, Lambert Maroc, Web Mercator, fichiers .prj
    form.ts                Conversion et validation des saisies
  export/                  Écritures Shapefile, DBF, CSV, XLSX, GeoJSON, KML
  storage/                 SQLite (db.ts) et fichiers/photos/partage (files.ts)
  hooks/useLocation.ts     Suivi GPS, moyenne de positions
  components/              Interface (champs de formulaire, carte, GPS, boutons)
```

## Limites actuelles et pistes d'évolution

- Fonds de carte hors-ligne (MBTiles / tuiles en cache) : la carte de fond nécessite le réseau,
  la collecte GPS et l'enregistrement fonctionnent sans.
- Une couche par projet ; polygones sans trous.
- Pas encore d'import de couches existantes (Shapefile/GeoPackage) ni de synchronisation serveur.
- Pas de logique conditionnelle dans les formulaires (questions dépendantes, calculs) ni
  d'import XLSForm.
