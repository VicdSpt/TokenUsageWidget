# Claude Tracker Widget — Design Spec

**Date:** 2026-07-04  
**Status:** Approved  

---

## Objectif

Widget bureau Windows 11 (Electron) affichant en temps réel :
- Les rate limits Claude Code Pro/Max (session 5h + weekly) sous forme de barres de progression
- Un heatmap 1 an style GitHub montrant l'activité quotidienne (nombre de sessions)

Inspiré visuellement de l'app TokenEater (dark theme, barres vertes).

---

## Architecture

```
┌─────────────────────────────────────┐
│          Renderer (React)           │
│   Widget flottant always-on-top     │
└────────────────┬────────────────────┘
                 │ IPC (contextBridge)
┌────────────────▼────────────────────┐
│          Main Process (Node)        │
│   Orchestrateur + scheduler         │
└────┬─────────────────┬──────────────┘
     │                 │
┌────▼────┐      ┌─────▼──────┐
│ Local   │      │ Anthropic  │
│ Parser  │      │ API Client │
│~/.claude│      │(optionnel) │
└─────────┘      └────────────┘
         │              │
         └──────┬───────┘
          ┌─────▼──────┐
          │  SQLite DB │
          └────────────┘
```

- Le **Local Parser** est la source primaire (toujours disponible)
- Le **API Client** est optionnel — enrichit les token counts si une clé API est configurée
- **SQLite** stocke l'historique agrégé pour éviter de re-parser à chaque refresh
- Le **scheduler** déclenche un refresh toutes les N minutes (configurable : 5 / 15 / 30)

---

## Interface utilisateur

### Zone haute — Rate Limits

Deux barres de progression :
- **Session (5h sliding window)** : % utilisé sur la fenêtre glissante des 5 dernières heures, avec temps avant reset
- **Weekly** : % utilisé sur les 7 derniers jours, avec date de reset

Chaque barre affiche : icône, label, pourcentage (vert si < 80%, orange si < 95%, rouge sinon), barre colorée, info reset.

Footer : "Upd. il y a X min · intervalle refresh"

### Zone basse — Heatmap 1 an

Grille 7 lignes (lun→dim) × 52 colonnes (semaines), soit 364 jours glissants.

4 niveaux d'intensité verte :
- Niveau 0 : `#161b22` (aucune session)
- Niveau 1 : `#0e4429` (1–2 sessions)
- Niveau 2 : `#006d32` (3–5 sessions)
- Niveau 3 : `#00cc6a` (6+ sessions)

Tooltip au survol : "3 sessions · 14 jan 2025"  
Labels mois en dessous de la grille. Légende (moins → plus) en bas à droite.

### Détails visuels

- Fond : `#0d1117`
- Accent : `#00cc6a` (vert Claude)
- Fenêtre frameless, sans bordure OS, coins arrondis (12px)
- Largeur fixe : 380px. Hauteur : ~480px.
- Draggable via la zone header
- Always-on-top activé par défaut (toggle via clic droit)

### Menu contextuel (clic droit)

- Actualiser maintenant
- Paramètres
- Always-on-top (toggle coché)
- Quitter

### Fenêtre Paramètres (séparée)

- Chemin `~/.claude/` (auto-détecté, modifiable)
- Clé API Anthropic (optionnelle, stockée chiffrée via `electron-store`)
- Intervalle de refresh : 5 / 15 / 30 min
- Plan Claude : Pro / Max (détermine les constantes de rate limit)
- Autostart Windows au login (toggle)

---

## Couche données

### Local Parser (`~/.claude/`)

Scan de `~/.claude/projects/<hash>/*.jsonl` (format JSONL de Claude Code).

Chaque ligne contient : timestamp, rôle (user/assistant), modèle, usage tokens.

Logique d'extraction :
1. Lire tous les fichiers JSONL, trier par timestamp
2. Détecter les limites de "session" : gap > 30 min = nouvelle session
3. Agréger par jour : `{ date, sessions_count, tokens_in, tokens_out }`
4. Insérer en incrémental via un curseur (timestamp du dernier message traité stocké dans `meta`)

### Rate Limits — calcul local

Les limites exactes ne sont pas exposées par Claude Code, on utilise des constantes par plan :

| Plan | Session (5h) | Weekly |
|------|-------------|--------|
| Pro  | ~40 000 tokens | ~200 000 tokens |
| Max  | ~100 000 tokens | ~500 000 tokens |

(Valeurs configurables dans les paramètres si Anthropic les modifie.)

**Session %** = tokens des 5 dernières heures / limite session  
**Weekly %** = tokens des 7 derniers jours / limite weekly  
**Reset session** = timestamp du message le plus ancien dans la fenêtre 5h + 5h

### Anthropic API Client (optionnel)

Si une clé API est présente, appel `GET https://api.anthropic.com/v1/usage` à chaque refresh.  
Si l'endpoint retourne des données, elles enrichissent les token counts dans SQLite.  
Si l'endpoint retourne 404 ou erreur, on ignore silencieusement et on continue avec le local.

### Schéma SQLite

```sql
CREATE TABLE sessions (
  id        INTEGER PRIMARY KEY,
  date      TEXT NOT NULL,        -- YYYY-MM-DD
  model     TEXT,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  messages_count INTEGER DEFAULT 0
);

CREATE TABLE daily_stats (
  date           TEXT PRIMARY KEY, -- YYYY-MM-DD
  sessions_count INTEGER DEFAULT 0,
  tokens_in      INTEGER DEFAULT 0,
  tokens_out     INTEGER DEFAULT 0
);

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
-- meta keys: last_parsed_timestamp, last_api_sync, claude_path
```

---

## Stack technique

| Outil | Usage |
|-------|-------|
| Electron 28+ | shell desktop, fenêtre frameless, tray |
| React 18 + Vite | renderer UI |
| Tailwind CSS | styling |
| better-sqlite3 | SQLite synchrone dans main process |
| node-cron | scheduler refresh |
| electron-store | persistance préférences (position, clé API) |
| electron-builder | packaging `.exe` Windows |

---

## Structure du projet

```
claude-tracker/
├── src/
│   ├── main/
│   │   ├── index.ts            -- entry Electron, création fenêtre
│   │   ├── parser.ts           -- lecture ~/.claude/ JSONL
│   │   ├── api-client.ts       -- Anthropic API optionnel
│   │   ├── db.ts               -- SQLite schema + queries
│   │   ├── scheduler.ts        -- cron refresh
│   │   └── ipc-handlers.ts     -- IPC main ↔ renderer
│   └── renderer/
│       ├── App.tsx
│       ├── components/
│       │   ├── RateLimitBar.tsx
│       │   ├── Heatmap.tsx
│       │   └── Settings.tsx
│       └── hooks/
│           └── useStats.ts     -- polling IPC vers main
├── electron.vite.config.ts
├── package.json
└── electron-builder.config.ts
```

---

## Comportement au démarrage

1. Electron démarre, crée la fenêtre frameless (position restaurée depuis `electron-store`)
2. Main process initialise SQLite, crée les tables si absentes
3. Parser lit `~/.claude/` et insère les données manquantes
4. Si clé API configurée, appel API pour enrichir
5. Main envoie les stats agrégées au renderer via IPC
6. Scheduler démarre pour les refreshs périodiques
7. Icône ajoutée dans la system tray avec menu contextuel

---

## Contraintes et limites

- Les constantes de rate limit sont approximatives et peuvent changer côté Anthropic — les rendre configurables
- Le format des fichiers JSONL de Claude Code peut évoluer — le parser doit être tolérant aux champs manquants
- La clé API Anthropic (si fournie) doit être stockée de façon sécurisée (electron-store avec encryption)
- L'app ne doit pas bloquer le main process lors du parsing — utiliser `worker_threads` si les fichiers sont volumineux
