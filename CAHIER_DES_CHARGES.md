# CAHIER DES CHARGES — « Mon Suivi » (PWA hors ligne)

> Document de référence. À relire au début de chaque étape.

Web app mobile installable (PWA), en français, qui fonctionne entièrement HORS LIGNE.
Elle sert à suivre les dépenses, la voiture, la crèche de la fille de l'utilisateur, le calendrier
de travail, les missions et les soldes de congé, récupération et RC.

## CONTEXTE
- Utilisateur unique, en Algérie. Monnaie : DA (sans décimales). Dates JJ/MM/AAAA.
- Semaine de travail du dimanche au jeudi ; week-end vendredi et samedi.
- Aucune donnée envoyée à un serveur : tout reste sur le téléphone.

## STACK
React + Vite + TypeScript, Tailwind CSS, vite-plugin-pwa (service worker, tout en cache),
Dexie.js (IndexedDB), Recharts (graphiques), jsPDF (PDF). Déploiement gratuit en HTTPS
(GitHub Pages ou Netlify).

## DESIGN
Mobile d'abord (360 px minimum), gros boutons (44 px), lisible, mode clair et sombre.
Barre du bas : Accueil · Calendrier · + · Récap · Réglages.

## ÉCRAN D'ACCUEIL
1. Tableau de bord : dépenses du mois (+ écart avec le mois précédent), solde de congé,
   récupérations restantes, RC restants, prochaine échéance, statut du jour, rappels.
2. Grille de 6 icônes : Voiture, Dépenses, Crèche, Calendrier, Missions, Soldes.
3. Bouton « + » flottant : saisie unique. Je choisis le type, ou je tape une phrase courte
   (« 3000 plein », « 1500 courses », « crèche 8000 ») et l'app la range dans le bon module par
   mots-clés (liste modifiable dans les Réglages), avec confirmation avant enregistrement.
   Une dépense faite pendant une mission est aussi rattachée à cette mission.

## MODULES (ajouter, modifier, supprimer, rechercher, filtrer par mois et par année)

### 1. Voiture
- Carburant : date, litres, prix/L, montant, km, plein complet (oui/non), station, mission liée.
  Calculs : L/100 km entre deux pleins complets, coût/km, total du mois.
- Assurance : compagnie, formule, montant, début, fin. Alerte 15 jours avant la fin.
- Prix du véhicule : modèle, prix d'achat, date, apport. Coût total réel = achat + toutes les
  dépenses voiture.
- Crédit : montant emprunté, mensualité, date de début, durée en mois, paiements. Reste à payer,
  mensualités restantes, barre de progression, rappel mensuel.
- Pièces et entretien : date, type (vidange, filtres, pneus, plaquettes, batterie…), km, garage,
  prix. Prochaine vidange = km de la dernière vidange + intervalle (10 000 km par défaut).
- Accessoires : date, article, prix.
- Contrôle technique (alerte 30 jours avant), vignette (rappel annuel).
- Documents : photos de la carte grise, de l'assurance et du permis, consultables hors ligne.
- Divers : lavage, parking, amende, péage.

### 2. Dépenses quotidiennes
Date, montant, catégorie, note, photo du ticket. Catégories modifiables : alimentation, factures,
santé, transport, vêtements, maison, loisirs, divers. Budget mensuel par catégorie avec alerte à
80 % et à 100 %.

### 3. Crèche
Nom, mensualité, jour de paiement. Paiements : date, mois concerné, montant, type (mensualité,
inscription, repas, sortie, autre). Statut payé / à payer par mois, avec rappel.

### 4. Calendrier
Vue mensuelle, chaque jour en couleur selon son statut : travail, mission, RC, congé,
récupération, week-end, jour férié, absence. Je touche un jour pour changer son statut, et je
peux sélectionner plusieurs jours d'un coup. Vendredi et samedi sont marqués week-end
automatiquement. Jours fériés algériens pré-remplis ; les fêtes religieuses (dates lunaires) sont
proposées et je les confirme à la main. Poser un congé, une récupération ou un RC met le solde à
jour automatiquement.

### 5. Missions
Début, fin, wilaya (liste officielle des 69 wilayas, codes 01 à 69), lieu, motif, frais
(hébergement, repas, carburant, autre), montant remboursé. Créer une mission marque ses jours dans
le calendrier. Note de frais PDF par mission.

CARTE DE L'ALGÉRIE : carte SVG interactive des 69 wilayas, embarquée (hors ligne). Liste
déroulante des années (2025, 2026, 2027, puis les suivantes automatiquement). Couleurs pour
l'année choisie : gris = non visitée, vert clair = 1 mission, vert foncé = 2 missions ou plus.
Compteur « X / 69 wilayas visitées en [année] ». Toucher une wilaya affiche ses missions. Sous la
carte, la liste des wilayas visitées triée par nombre de jours. S'il n'existe pas de fond de carte
à 69 wilayas, utilise celui à 58 et affiche les 11 nouvelles (59 à 69) par un point sur leur
chef-lieu.

### 6. Soldes
Trois compteurs (congé, récupération, RC) : acquis, pris, restant, historique des mouvements.
Planificateur : je choisis des dates et l'app affiche le solde qui restera. Ajustement manuel
possible, avec un motif.

## RÈGLES DE CALCUL (très important)
- CONGÉ : solde de départ de 25 jours au 23/11/2026. +2,5 jours le dernier jour de chaque mois
  (premier ajout : 30/11/2026, soit 27,5 j). Période de référence du 1er juillet au 30 juin
  (30 j par an). Au démarrage, l'app ajoute les mois écoulés manquants, même si elle n'a pas été
  ouverte. Mode de décompte réglable : jours ouvrables ou calendaires.
- RÉCUPÉRATION : chaque jour de mission tombant un vendredi, un samedi ou un jour férié = +1 jour
  (ratio réglable). Chaque jour posé « récupération » = −1.
- RC (repos compensateur) : compteur séparé. Ajout manuel des jours gagnés (date + motif).
  Chaque jour posé « RC » = −1.
- Les soldes sont TOUJOURS recalculés à partir d'une table de mouvements (balanceMoves : type,
  date, jours +/−, origine auto/calendrier/manuel, motif). Aucun total n'est stocké en dur.
- Au premier lancement, un assistant demande les soldes de départ, les infos de la voiture et du
  crédit, et celles de la crèche.

### 7. États des lieux de la voiture (ajout du 25/11/2026)
Demande : photographier / scanner l'extérieur de la voiture au départ (relever les anciennes rayures), puis au
retour (photos ou caméra en direct) et signaler les nouvelles rayures et bosses, comme une application de
location. Choix validés : comparaison locale par défaut (hors ligne) + bouton facultatif « Analyse IA » (Claude) ;
constat PDF avec photos avant / après.
- 8 vues guidées (avant, 4 trois-quarts, 2 profils, arrière) sur un schéma de la voiture vue de dessus.
- Départ : photos + marquage à la main des dégâts existants (ou relevé par l'IA, à confirmer).
- Retour : la photo de départ s'affiche en transparence pour cadrer ; « Détection en direct » encadre les zones
  suspectes dans le flux de la caméra ; après la prise, la comparaison locale crée des zones « à vérifier »
  (les dégâts déjà relevés au départ sont écartés). L'utilisateur confirme ou écarte chaque zone.
- Analyse IA (facultative, clé API Anthropic de l'utilisateur, internet requis) : avis sur chaque zone et
  dégâts manqués, avec type, gravité et description ; toujours à confirmer.
- Constat PDF : synthèse + chaque nouveau dégât avec extraits avant / après + vues concernées.

## RÉCAPITULATIF DE FIN DE MOIS
Généré automatiquement le dernier jour du mois (ou à la première ouverture qui suit), et figé dans
l'historique. Il contient : les dépenses totales et par catégorie (graphique), la voiture
(carburant en DA et en litres, L/100 km, entretien, crédit restant), la crèche, le travail (jours
travaillés, jours de mission, wilayas visitées) et les soldes. Pour chaque bloc, comparaison avec
le mois précédent : flèche ↑/↓, écart en DA et en %. Export PDF.

## RAPPELS
Affichés sur le tableau de bord à chaque ouverture, et en notifications si autorisées : crèche,
crédit, assurance, contrôle technique, vignette, vidange, budget dépassé, récap prêt, sauvegarde
(tous les 30 jours).

## SAUVEGARDE
Export complet en JSON, import pour restaurer sur un autre téléphone, export CSV par module.

## MÉTHODE DE TRAVAIL
Avancer en 6 étapes. À la fin de chaque étape : lancer l'app, vérifier qu'elle compile sans
erreur, résumer ce qui est fait, puis ATTENDRE la validation avant de continuer.
1. Socle : projet, PWA hors ligne, base Dexie avec toutes les tables, navigation, accueil avec les
   6 icônes, assistant de premier lancement, export/import JSON.
2. Calendrier + Soldes, avec les règles de calcul et des tests unitaires (Vitest) pour
   l'acquisition du congé et les récupérations.
3. Missions + carte des 69 wilayas.
4. Voiture.
5. Dépenses + Crèche + bouton « + » avec tri automatique + budgets.
6. Tableau de bord, rappels, récapitulatif mensuel, exports PDF/CSV, déploiement.

À la fin : expliquer simplement comment installer l'app sur un téléphone Android.

---

## DÉCISIONS TECHNIQUES (tenues à jour au fil des étapes)
- Montants stockés en **entiers DA** ; dates stockées en chaîne ISO `AAAA-MM-JJ` (affichées JJ/MM/AAAA).
- Routage par `HashRouter` (compatible GitHub Pages sans configuration serveur).
- Photos (documents, tickets) stockées en `Blob` dans IndexedDB ; exportées en base64 dans le JSON.
- Table `balanceMoves` = source unique de vérité pour les soldes. Les mouvements automatiques
  (acquisition mensuelle de congé, récupérations de mission) portent une clé `autoKey` unique pour
  être idempotents (jamais ajoutés deux fois).
- Les réglages (mots-clés, ratio récup, mode de décompte, intervalle vidange…) sont dans la table
  `settings` (clé/valeur).

- Soldes (étape 2) — règles pures dans `src/lib/rules.ts` (testées), appliquées par `src/lib/engine.ts` :
  - Acquisition de congé : mouvement `conge-acq-AAAA-MM` daté du dernier jour du mois, ajouté pour chaque
    mois dont la fin est postérieure à la date du solde de départ et ≤ aujourd'hui. Vérifié à chaque
    ouverture, au retour au premier plan et toutes les heures.
  - Calendrier : au plus un mouvement par jour (`cal-AAAA-MM-JJ`), recalculé à partir des statuts, des
    fériés confirmés et des réglages (mode de décompte, ratio de récupération).
  - Mode « ouvrables » : congé non posé/décompté les vendredis, samedis et fériés confirmés.
    Récupération et RC ne se posent que sur un jour travaillé.
  - Fériés : 5 fêtes civiles fixes confirmées d'office ; fêtes religieuses calculées hors ligne
    (calendrier hégirien Umm al-Qura via `Intl`) et proposées à confirmer (décalage ±1 j possible).

- Missions (étape 3) :
  - Numérotation officielle 59 → 69 retenue (loi 26-06, JO n° 25 du 05/04/2026 ; décret présidentiel du
    JO n° 40) : 59 Aflou, 60 Barika, 61 El Kantara, 62 Bir El Ater, 63 El Aricha, 64 Ksar Chellala,
    65 Aïn Ouessara, 66 Messaad, 67 Ksar El Boukhari, 68 Bou Saâda, 69 El Abiodh Sidi Cheikh.
    (Elle diffère de l'ordre annoncé dans la presse en novembre 2025.)
  - Un fond de carte à 69 wilayas existe : limites © OpenStreetMap contributors (ODbL 1.0), via le jeu
    de données « geoalgeria ». Converti en tracés SVG par `scripts/build-map.mjs` → `src/data/`
    (≈ 65 Ko, embarqué). Le repli « 58 + points » n'est donc pas nécessaire. Attribution affichée sur la carte.
  - Créer/modifier une mission marque ses jours « mission » (avec `missionId`) ; ces jours ne se
    modifient que depuis la mission. Les jours posés à la main qui chevauchent sont remplacés (avertissement).
  - Années de la carte : 2025 → max(2027, année en cours + 1, dernière année de mission).
  - Note de frais PDF : jsPDF chargé à la demande ; identité (nom, fonction, organisme) dans les Réglages.

- Voiture (étape 4) — calculs purs dans `src/lib/car.ts` (testés) :
  - L/100 km : entre deux pleins complets, litres des pleins partiels intermédiaires inclus ; moyenne
    pondérée sur tous les intervalles. Coût/km carburant = montants après le 1er relevé / distance.
  - Saisie d'un plein : 2 valeurs sur 3 (litres, prix/L, montant) → la 3e est calculée. Rattachement
    automatique à la mission en cours à cette date (modifiable).
  - Crédit : reste à payer = mensualité × durée − payé ; mensualités restantes = durée − nb paiements ;
    prochaine échéance = début + nb paiements mois. Coût du crédit = total remboursé − montant emprunté.
  - Coût total réel = prix d'achat + intérêts du crédit + carburant, entretien, assurance, CT/vignette,
    accessoires, divers (les mensualités ne sont pas ajoutées : elles remboursent l'achat).
  - Assurance : contrat finissant le plus tard ; alerte ≤ 15 j. CT et vignette : échéance proposée
    à +1 an (modifiable) ; alerte ≤ 30 j.
  - Photos des documents : compressées (1600 px, JPEG) et stockées en Blob ; incluses dans la sauvegarde.
  - Composant générique `RecordList` (ajout, modification, suppression, recherche, filtres mois/année),
    réutilisé à l'étape 5.

- Dépenses, crèche, saisie rapide (étape 5) :
  - « + » : phrase analysée par `src/lib/quickparse.ts` (testé) : montant (« 3 000 », « 1,5k », « 3000 DA »),
    litres (« 40 L »), km (« 36500 km »), date (« hier », « avant-hier », « 12/11 »), mot-clé (accents et
    majuscules ignorés ; mot exact > début de mot ; le plus long gagne). Le formulaire du module s'ouvre
    pré-rempli : rien n'est enregistré sans confirmation. Mot inconnu → dépense, catégorie à choisir.
  - Mots-clés modifiables (Réglages → Mots-clés), avec zone d'essai et retour aux valeurs par défaut.
  - Rattachement automatique à la mission en cours pour dépenses, carburant et divers voiture.
  - Budgets : alerte à 80 % (orange) et 100 % (rouge) sur la page Dépenses et juste après la saisie.
  - Suppression d'une catégorie : ses dépenses et ses mots-clés sont transférés vers une autre catégorie.
  - Crèche : statut par mois = payé / partiel / à payer / en retard (après le jour de paiement) / à venir ;
    « mois de début » pour ne pas signaler les mois antérieurs. La prochaine échéance de l'accueil
    pointe sur le premier mois non payé.

- Tableau de bord, rappels, récap, exports (étape 6) :
  - Rappels calculés par `src/lib/reminders.ts` (testé) : crèche et crédit dès 5 j avant l'échéance,
    assurance ≤ 15 j, contrôle technique et vignette ≤ 30 j, vidange ≤ 1 000 km, budget ≥ 80 %,
    récap non consulté, sauvegarde ≥ 30 j. Bouton « Plus tard » (1 j ; 7 j pour la sauvegarde).
  - Notifications : sans serveur (données 100 % locales), elles partent quand l'app s'ouvre ou revient
    au premier plan (+ toutes les heures si elle reste ouverte), une fois par jour et par rappel ;
    toucher la notification ouvre l'écran concerné.
  - Récapitulatif : provisoire le dernier jour du mois (mis à jour à chaque ouverture ce jour-là), figé
    à la première ouverture du mois suivant ; mois manquants rattrapés depuis l'installation.
    Comparaison avec le mois précédent : flèche, écart, %. Graphiques Recharts chargés à la demande.
  - Graphiques : la palette des catégories ne passe pas le contrôle d'accessibilité des couleurs (orange
    et rouge trop proches) → les barres par catégorie sont d'une seule teinte, avec noms et montants
    écrits ; les couleurs de catégorie restent des pastilles à côté du nom.
  - CSV : séparateur « ; », virgule décimale, UTF-8 avec BOM (Excel en français).
  - Déploiement : `netlify.toml` et `.github/workflows/deploy.yml` (GitHub Pages) prêts.

- États des lieux (ajout) :
  - Comparaison locale `src/lib/damage/detect.ts` (testée) : images 320 × 240, réduction progressive (sinon les
    traits fins clignotent), alignement au ¼ de pixel, éclairage normalisé, écart au plus proche voisin minoré
    sur les contours déjà présents, nouveaux contours ; seuil adaptatif ; analyse limitée à la silhouette du
    guide (réglable). Zone couvrant > 25 % de la carrosserie ou > 18 % de pixels changés → « photo mal cadrée ».
  - Photos 4:3 (1 600 px) en Blob dans les tables `inspections`, `inspectionShots`, `damages` (base v2).
  - IA : SDK officiel `@anthropic-ai/sdk` appelé depuis le navigateur avec la clé de l'utilisateur
    (`dangerouslyAllowBrowser`), modèle `claude-opus-5-5`, effort `high`, sortie JSON validée (zod),
    repli automatique en cas de refus (`fallbacks: "default"`). La clé n'est jamais incluse dans les sauvegardes.
  - Limites connues : reflets, ombres, saleté ou eau peuvent créer des zones ; un angle très différent rend la
    comparaison inutilisable (signalé). Aucune détection n'est infaillible : la décision reste à l'utilisateur.

## SUIVI
- [x] Étape 1 — Socle
- [x] Étape 2 — Calendrier + Soldes
- [x] Étape 3 — Missions + carte
- [x] Étape 4 — Voiture
- [x] Étape 5 — Dépenses + Crèche + « + » + budgets
- [x] Étape 6 — Tableau de bord, rappels, récap, exports, déploiement (configuration prête ; mise en ligne à faire avec le compte de l'utilisateur)
