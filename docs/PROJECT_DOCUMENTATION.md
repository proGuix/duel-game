# Documentation fonctionnelle et technique

## 1. Vision Fonctionnelle

### 1.1 Concept du jeu
- Duel top‑down en 2D rendu avec **PixiJS v8** (voir `src/main.ts`).
- Joueur (rouge) suit la souris et tire avec `Espace`.
- Ennemi (bleu) utilise un **Behavior Tree (BT)** pour décider de ses actions : esquive, tir, repositionnement, patrouille.
- HUD rappelle les contrôles et expose un sélecteur de variantes IA (`src/ui/behavior-selector.ts`).
- `Entrée` ouvre un atelier de dessin (overlay décrite dans `README.md`).

### 1.2 Boucle de jeu
1. `src/main.ts` instancie Pixi, crée le joueur (`src/game/player.ts`), l’ennemi (`src/game/enemy.ts`) et les projectiles (`src/game/bullets.ts`).
2. `app.ticker` (ligne ~163) appelle chaque frame :
   - `player.update` (suit la souris + tirs).
   - `enemy.update` (perception, tick BT, application des intentions).
   - Gestion des collisions, spawn des balles selon les flags `wantShoot`.
3. Le debugger BT (`src/ui/bt-debug.ts`) reflète les statuts via `beginBTDebugFrame` / `endBTDebugFrame`.

### 1.3 Sélection et édition de comportements IA
- **Sélecteur in-game** : `refreshBehaviorSelector` affiche le libellé courant et permet de changer à la volée (`src/ui/behavior-selector.ts`).
- **Éditeur dédié** : accessible depuis un bouton “Éditer” qui ouvre `editor.html`. Cette page charge `src/editor/main.ts` :
  - Bandeau supérieur : variantes disponibles (issues de la registry), actions Nouveau/Dupliquer/Supprimer.
  - Colonne droite : palette des nœuds (Composites, Conditions, Actions) utilisable en drag & drop.
  - Zone centrale : représentation graphique de l’arbre courant avec ghost lors des déplacements.
  - Boutons “Appliquer/Enregistrer” sauvegardent dans la registry (`enemy-behaviors.json`).
- Chaque variante sauvegardée devient disponible dans le jeu grâce à la registry.

### 1.4 Fichier de données IA
- `enemy-behaviors.json` : source unique des BT sérialisés (liste d’objets `{ id, label, root }`).
- Au démarrage, `behavior-registry.ts` charge ce JSON (ou `/api/behaviors` si présent) et le sert à la fois au jeu et à l’éditeur.

## 2. Architecture Technique

### 2.1 Découpage principal
| Domaine            | Fichiers clés | Rôle |
|--------------------|--------------|------|
| **Runtime jeu**    | `src/main.ts`, `src/game/*` | Boucle Pixi, entités physiques, collisions. |
| **IA Behavior Tree** | `src/game/ai/bt.ts`, `src/game/ai/behavior-registry.ts`, `src/game/ai/nodes/*`, `src/game/ai/behavior-factory.ts`, `src/game/enemy.ts` | Exécution, definition et instanciation des BT. |
| **Blackboard & utilitaires** | `src/game/ai/blackboard.ts`, `src/game/enemy/blackboard.ts` | Stockage partagé entre nœuds (perceptions, intentions, timers). |
| **Debugger & UI HUD** | `src/ui/bt-debug.ts`, `src/ui/behavior-selector.ts`, `index.html` | Visualisation temps réel. |
| **Éditeur de BT** | `editor.html`, `src/editor/main.ts` | Interface Pixi full screen pour créer/éditer les arbres. |

### 2.2 Ennemi modulaire
1. `EnemyView` (`src/game/enemy/view.ts`) s’occupe exclusivement du rendu : corps, couronnes de portée, label BT.
2. `createEnemyBlackboard` / `syncEnemyBlackboard` (`src/game/enemy/blackboard.ts`) centralisent l’initialisation et la mise à jour des données partagées (positions, projectiles, paramètres gameplay).
3. `Enemy` (`src/game/enemy.ts`) orchestre :
   - Config physique (vitesse, accélération, distances de tir).
   - Contexte pour les actions (`BehaviorContext` avec `dashBoost`, `estimateLOS`, timers d’esquive).
   - Construction de l’arbre via `buildBehaviorTree(descriptor, context)` (voir §2.3).
   - Application des intentions (mouvement, dash, tir) dans `update`.

### 2.3 Behavior Trees
- **Descriptors JSON** : un `root` `Selector` ou `Sequence` avec des enfants `Condition` ou `Action`.
- **behavior-registry** (`src/game/ai/behavior-registry.ts`) :
  - charge/persiste les descripteurs (API `/api/behaviors` > fallback `enemy-behaviors.json`).
  - expose `listBehaviorOptions`, `getBehaviorDescriptor`, `upsertBehaviorDescriptor`, etc.
  - définit `conditionLibrary` et `actionLibrary` pour l’éditeur.
- **behavior-context** (`src/game/ai/behavior-context.ts`) :
  - `BehaviorContext`: { `bb`, `host` }.
  - `BehaviorHost`: `dashBoost`, `estimateLOS`, `state` (ex: `evadeTimeLeft`).
- **behavior-factory** (`src/game/ai/behavior-factory.ts`) :
  - instancie récursivement les composites Pixi (`Selector`, `Sequence`).
  - délègue les feuilles aux usines `createActionNode` / `createConditionNode`.
- **Bibliothèques de nœuds** :
  - `src/game/ai/nodes/conditions.ts`: `danger`, `inRange`, `needReposition`. Chaque condition met à jour des flags (`bb.danger`, `bb.inRange`, `bb.hasLOS`).
  - `src/game/ai/nodes/actions.ts`: `evade`, `rangedAttack`, `reposition`, `patrol`. Elles manipulent uniquement le `BehaviorContext` (intents, timers).
- Ajout d’un nœud = nouvelle entrée dans le dictionnaire correspondant + mise à jour des bibliothèques dans la registry pour l’UI.

### 2.4 Debugger BT
- `initBTDebugger` (dans `src/ui/bt-debug.ts`) crée un panneau listant les nœuds avec badges “SEL/SEQ/COND/ACT”.
- `beginBTDebugFrame` remet tous les nœuds en état Idle ; `endBTDebugFrame` fige la couleur (vert = Success, jaune = Running, rouge = Failure).
- L’ennemi appelle ces hooks juste avant/après `tree.tick(dt)` (`src/game/enemy.ts`), ce qui permet une visualisation frame‑accurate.

### 2.5 Éditeur Pixi (page `editor.html`)
1. `initPixi` (`src/editor/main.ts:66-134`) installe une scène `Application` avec `autoDensity` et `resolution` dynamique pour garder le texte net.
2. `renderUI` :
   - Bandeau supérieur (boutons, sélection de variante).
   - Palette (catégories + boutons dragables).
3. `redrawTree` + `layoutNode` :
   - dessinent la structure hiérarchique (indentation, badges, croix de suppression).
   - gèrent la sélection et la suppression via clic ou touche `Suppr`.
4. Drag & Drop :
   - Palette → ghost cloné (`buildPaletteGhost`).
   - Arbre → ghost fidèle au sous-arbre (`buildGhostTree`).
   - `toCanvasPoint` garantit que le ghost suit parfaitement le curseur.
5. Sauvegarde :
   - `applyBtn` et `saveBtn` appellent `upsertBehaviorDescriptor` après validation JSON (`behavior-registry`).
   - Le fichier `enemy-behaviors.json` est donc automatiquement mis à jour.

### 2.6 Tests / Build
- **Développement** : `npm run dev` lance Vite en mode HMR pour `/index.html` et `/editor.html`.
- **Production** : `npm run build` génère le bundle (`dist/`). Note : la configuration Vite actuelle doit pointer vers ce dossier (`vite.config.ts`).

## 3. Guide d’extension rapide

1. **Ajouter une action IA** :
   - Implémenter la logique dans `src/game/ai/nodes/actions.ts` (fonction `actXXX` + enregistrement dans `factories`).
   - Ajouter la définition dans `actionLibrary` (`behavior-registry.ts`) pour l’éditeur.
2. **Ajouter une condition IA** : même procédé dans `nodes/conditions.ts` + `conditionLibrary`.
3. **Créer une nouvelle variante BT** :
   - Ouvrir `/editor.html`, faire drag & drop depuis la palette.
   - Cliquer sur “Enregistrer” → persiste dans `enemy-behaviors.json`.
   - Tester via le sélecteur HUD in-game.
4. **Modifier le rendu ennemi** : intervenir dans `EnemyView` (couleur, anneaux, label).
5. **Ajouter des perceptions** : enrichir `syncEnemyBlackboard` (ex: raycast LOS) et exploiter ces données dans les nodes.

Cette documentation couvre les aspects UX (contrôles, outils), la mécanique IA (BT + blackboard), ainsi que les points d’entrée pour enrichir le projet (nouvelles feuilles, nouvelles variantes, UI). Ajustez librement ce fichier si des modules supplémentaires apparaissent.
