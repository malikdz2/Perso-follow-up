# Mon Suivi

Application mobile (PWA) **100 % hors ligne**, en français : dépenses, voiture (avec **états des lieux photo
départ / retour** qui repèrent les nouvelles rayures), crèche, calendrier de travail, missions (carte des
69 wilayas) et soldes de congé, récupération et RC.
Aucune donnée n'est envoyée sur Internet : tout reste sur le téléphone (IndexedDB).

Cahier des charges et décisions : [CAHIER_DES_CHARGES.md](./CAHIER_DES_CHARGES.md)

---

## 📱 Installer l'application sur un téléphone Android

1. **Ouvrez l'adresse de l'application dans Chrome** : <https://malikdz2.github.io/Perso-follow-up/>
   Il faut une adresse en `https://` : c'est ce qui permet le fonctionnement hors ligne.
2. Chrome propose **« Installer l'application »** (bandeau en bas de l'écran).
   Sinon : menu **⋮** en haut à droite → **« Installer l'application »** ou **« Ajouter à l'écran d'accueil »**.
   Le bouton existe aussi dans l'app : **Réglages → Application → Installer l'application**.
3. L'icône verte **Mon Suivi** apparaît sur l'écran d'accueil. Ouvrez-la : l'app s'affiche en plein
   écran, comme une application normale.
4. Au premier lancement, l'assistant demande les soldes de départ, la voiture, le crédit et la crèche.
5. **Notifications** (facultatif) : Réglages → Application → Notifications → « Activées », puis
   acceptez. Les rappels arrivent quand vous ouvrez l'app (une fois par jour et par rappel).
6. Dès la première ouverture, **tout fonctionne sans connexion** (mode avion compris).

### Sauvegarder (important)
Les données vivent uniquement dans ce téléphone. Une fois par mois (l'app le rappelle tous les 30 jours) :
**Réglages → Sauvegarde → Exporter (JSON)**, puis gardez le fichier en lieu sûr (Google Drive, e-mail à
vous-même…). ⚠️ « Effacer les données » du site dans Chrome ou désinstaller l'app efface vos données.

### Changer de téléphone
Installez l'app sur le nouveau téléphone, puis dans l'assistant de démarrage : **« Restaurer une
sauvegarde »** et choisissez le fichier JSON. (Ou plus tard : Réglages → Importer une sauvegarde.)

### États des lieux de la voiture (location, prêt)
Voiture → **États des lieux** → **Départ** : photographiez les 8 positions autour du schéma et marquez les
rayures déjà présentes. Au **retour** : reprenez les mêmes photos (la photo de départ s'affiche en transparence
pour cadrer, la « Détection en direct » encadre les zones suspectes). Confirmez les nouveaux dégâts, puis
**Constat PDF**. Tenez le téléphone à l'horizontale, à la même distance, avec une lumière comparable.
Analyse IA facultative : Réglages → États des lieux → clé API Anthropic (payante, internet requis).

### Mises à jour
Quand une nouvelle version est publiée, elle s'installe toute seule à l'ouverture suivante (avec
connexion). Vos données ne sont pas touchées.

---

## 🌐 Mettre l'application en ligne (gratuit, HTTPS)

L'app est un site statique : le dossier `dist/` produit par `npm run build` suffit.

### Option A — Netlify Drop (le plus simple, sans compte GitHub)
1. Sur un ordinateur, décompressez `mon-suivi-site.zip` (contenu du dossier `dist/`).
2. Allez sur <https://app.netlify.com/drop>, créez un compte gratuit.
3. Glissez-déposez le dossier décompressé dans la page. Netlify donne une adresse `https://….netlify.app`
   (renommable dans *Site configuration → Change site name*).

### Option B — GitHub Pages (mises à jour automatiques)
1. Créez un dépôt GitHub (ex. `mon-suivi`) et envoyez-y ce projet (branche `main`).
2. Dans le dépôt : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Le fichier `.github/workflows/deploy.yml` lance tests + build + publication à chaque envoi.
   Adresse : `https://<votre-compte>.github.io/mon-suivi/`.

### Option C — Netlify relié à GitHub
Importez le dépôt dans Netlify : la configuration `netlify.toml` est déjà prête.

---

## 👩‍💻 Développement

```bash
npm install
npm run dev       # développement (http://localhost:5173)
npm test          # tests unitaires (Vitest)
npm run build     # vérification TypeScript + build de production (dist/)
npm run preview   # sert le build (service worker actif)
```

| Dossier | Contenu |
|---|---|
| `src/db` | Base Dexie (toutes les tables), réglages |
| `src/lib` | Règles et calculs (soldes, voiture, budgets, récap, rappels, saisie rapide), sauvegarde, PDF, CSV |
| `src/components` | Interface commune (listes, formulaires, carte, bouton +) |
| `src/pages` | Écrans |
| `src/data` | 69 wilayas et fond de carte (générés par `scripts/build-map.mjs`) |

Fond de carte : limites des wilayas © OpenStreetMap contributors (ODbL 1.0), via le jeu de données
*geoalgeria*.
