# Duel 2D

Jeu 2D de duel de cercles dans le navigateur avec **PixiJS v8** et **TypeScript** :
- Le joueur (rouge) suit la souris.
- **Espace** : tir de projectile (jaune) vers l’ennemi (bleu).
- L’ennemi bouge aléatoirement et tire toutes les **4 s**.
- **Entrée** : met en **pause** et ouvre un **atelier de dessin**. Dessinez à la souris ; ré-appuyez sur Entrée pour **placer l’objet** (redimensionné ~120px) à l’endroit du premier appui.
- **R** : rejouer. **C** (dans l’atelier) : effacer. **Ctrl+molette** : épaisseur du trait.

## Prérequis

- **Node.js** ≥ 18 (inclut npm).  
  Vérifiez :
  ```bash
  node -v
  npm -v
  ```

## Installation

```bash
npm i
```

## Lancer en développement

```bash
npm run dev
```
Ouvrez l’URL locale affichée par Vite (ex. `http://localhost:5173`).

## Build de production

```bash
npm run build
```

## Prévisualiser le build de production

```bash
npm run preview
```
