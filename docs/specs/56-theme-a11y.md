# Phase 7 : Thème sombre, Responsive & Accessibilité

## Résumé

Cette spec couvre trois dimensions d'amélioration UX/a11y :

1. **Thème sombre** : Mode clair/sombre, toggle persisté, respect de `prefers-color-scheme`
2. **Responsive** : Layout adaptatif pour petits écrans (mobiles/tablettes), zones redimensionnables
3. **Accessibilité** : Navigation clavier complète, attributs ARIA, contrastes WCAG, lecteur d'écran support

Toutes trois sont **préservantes du déterminisme** : pas d'impact sur les commandes, hashes ou snapshot du moteur.

## 1. Thème sombre

### 1.1 Concept

L'app offre deux thèmes :
- **Light** (actuel, par défaut) : fond blanc/gris clair, texte sombre
- **Dark** : fond sombre, texte clair

**Stockage** : localStorage `'theme'` = `'light'` | `'dark'` | `'auto'`

**Auto** : Respecte la préférence système via CSS media query `prefers-color-scheme`

### 1.2 Variables CSS

**Approche** : utiliser des CSS custom properties pour tous les couleurs/fonds.

**`src/assets/styles/theme.css`** :

```css
:root {
  /* Light theme (défaut) */
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --bg-tertiary: #ececec;
  --text-primary: #1a1a1a;
  --text-secondary: #666666;
  --text-tertiary: #999999;
  --border-color: #dddddd;
  --border-light: #eeeeee;
  
  /* Accents */
  --accent-blue: #0066cc;
  --accent-red: #ef4444;
  --accent-green: #10b981;
  --accent-orange: #f59e0b;
  --accent-purple: #8b5cf6;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
  
  /* Status */
  --status-error: #ef4444;
  --status-warning: #f59e0b;
  --status-success: #10b981;
  --status-info: #3b82f6;
}

/* Dark theme */
[data-theme="dark"] {
  --bg-primary: #1a1a1a;
  --bg-secondary: #2a2a2a;
  --bg-tertiary: #3a3a3a;
  --text-primary: #f0f0f0;
  --text-secondary: #b0b0b0;
  --text-tertiary: #808080;
  --border-color: #444444;
  --border-light: #333333;
  
  /* Accents (plus lumineux pour contrast) */
  --accent-blue: #66b3ff;
  --accent-red: #ff6b6b;
  --accent-green: #34d399;
  --accent-orange: #fbbf24;
  --accent-purple: #a78bfa;
  
  /* Shadows (ajustés) */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5);
}

/* Auto : respecter la préférence système */
@media (prefers-color-scheme: dark) {
  [data-theme="auto"] {
    --bg-primary: #1a1a1a;
    --bg-secondary: #2a2a2a;
    /* ... rest comme dark */
  }
}
```

### 1.3 Application des variables

Tous les styles existants réfactorisés pour consommer les CSS vars :

```css
/* Avant */
.refs-sidebar {
  background: #f5f5f5;
  color: #333;
  border-right: 1px solid #ddd;
}

/* Après */
.refs-sidebar {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-right: 1px solid var(--border-color);
}
```

**Fichiers touchés** :
- `src/assets/styles/main.css` (ou structure modularisée)
- `src/components/*.vue` (style scoped dans chaque composant)
- `src/graph/layout.css` ou styles SVG (couleurs de nœuds, arêtes)

### 1.4 Composable & stockage

**`src/composables/useTheme.ts`** :

```typescript
import { ref, computed, watch } from 'vue';

export type Theme = 'light' | 'dark' | 'auto';

const currentTheme = ref<Theme>('light');
const systemPrefersDark = ref(false);

export function useTheme() {
  // Effectif theme (resolved)
  const effectiveTheme = computed(() => {
    if (currentTheme.value === 'auto') {
      return systemPrefersDark.value ? 'dark' : 'light';
    }
    return currentTheme.value;
  });

  const setTheme = (theme: Theme) => {
    currentTheme.value = theme;
    localStorage.setItem('theme', theme);
    applyThemeToDOM();
  };

  const getTheme = () => currentTheme.value;

  const getEffectiveTheme = () => effectiveTheme.value;

  const applyThemeToDOM = () => {
    const html = document.documentElement;
    html.setAttribute('data-theme', effectiveTheme.value);
  };

  const initTheme = () => {
    // Lire localStorage
    const saved = localStorage.getItem('theme') as Theme | null;
    if (saved && ['light', 'dark', 'auto'].includes(saved)) {
      currentTheme.value = saved;
    } else {
      currentTheme.value = 'auto'; // Défaut : suivre système
    }

    // Écouter la préférence système
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    systemPrefersDark.value = mediaQuery.matches;
    mediaQuery.addEventListener('change', (e) => {
      systemPrefersDark.value = e.matches;
      applyThemeToDOM();
    });

    // Appliquer au démarrage
    applyThemeToDOM();
  };

  return {
    currentTheme: computed(() => currentTheme.value),
    effectiveTheme,
    setTheme,
    getTheme,
    getEffectiveTheme,
    initTheme,
  };
}
```

### 1.5 Sélecteur de thème (UI)

**Composant : `src/components/ThemeSwitcher.vue`**

```vue
<template>
  <div class="theme-switcher">
    <label for="theme-select" class="label">{{ t('ui.theme') }}</label>
    <select
      id="theme-select"
      :value="theme.getTheme()"
      @change="(e) => theme.setTheme((e.target as HTMLSelectElement).value as Theme)"
      class="select"
    >
      <option value="light">Light</option>
      <option value="dark">Dark</option>
      <option value="auto">Auto (System)</option>
    </select>
  </div>
</template>

<script setup lang="ts">
import { useTheme } from '@/composables/useTheme';
import { useI18n } from '@/i18n';
import type { Theme } from '@/composables/useTheme';

const theme = useTheme();
const { t } = useI18n();
</script>

<style scoped>
.theme-switcher {
  display: flex;
  align-items: center;
  gap: 8px;
}

.label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.select {
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid var(--border-color);
  border-radius: 2px;
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
}

.select:hover {
  border-color: var(--text-secondary);
}
</style>
```

## 2. Responsive & layout adaptatif

### 2.1 Breakpoints

**Norme mobile-first** :

```css
/* Mobile (par défaut) */
/* xs: 0 — 640px */

/* Tablette */
@media (min-width: 640px) {
  /* sm */
}

@media (min-width: 1024px) {
  /* md */
}

@media (min-width: 1280px) {
  /* lg */
}

@media (min-width: 1536px) {
  /* xl */
}
```

### 2.2 Layout adaptatif

**Actuel (desktop)** : 3 zones côte à côte :
```
┌────────────────────────────────────────┐
│ RefsSidebar│     GraphView     │Terminal │
│ (280px)    │    (flexible)     │(350px)  │
└────────────────────────────────────────┘
```

**Petit écran (<768px)** : Layout en **colonnes** (stacké) :
```
┌──────────────────┐
│   GraphView      │
│  (100%, réduit)  │
├──────────────────┤
│   TerminalPanel  │
│  (100%, réduit)  │
├──────────────────┤
│  RefsSidebar     │
│ (scrollable vert)│
└──────────────────┘
```

**Implémentation dans `App.vue`** :

```vue
<template>
  <div class="app" :class="{ 'responsive-mobile': isMobile }">
    <ThemeSwitcher />
    <LanguageSwitcher />
    
    <div class="layout">
      <RefsSidebar v-if="!isMobile || showSidebar" />
      <GraphView />
      <TerminalPanel />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useWindowSize } from '@vueuse/core'; // Ou implémentation custom

const { width } = useWindowSize();
const isMobile = computed(() => width.value < 768);
const showSidebar = ref(false); // Toggle sur mobile
</script>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 280px 1fr 350px;
  gap: 0;
  height: 100vh;
}

/* Mobile : colonnes empilées */
@media (max-width: 767px) {
  .layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr auto;
  }

  /* GraphView réduit en hauteur */
  :deep(.graph-view) {
    max-height: 200px;
    border-bottom: 1px solid var(--border-color);
  }

  /* TerminalPanel plus large */
  :deep(.terminal-panel) {
    flex: 1;
  }

  /* Sidebar optionnelle (toggle) */
  :deep(.refs-sidebar) {
    display: none;
    position: absolute;
    top: 50px;
    right: 0;
    z-index: 100;
    width: 100%;
    max-height: 300px;
    overflow-y: auto;
  }

  :deep(.refs-sidebar.visible) {
    display: block;
  }
}

/* Tablette : layout intermédiaire */
@media (max-width: 1200px) {
  .layout {
    grid-template-columns: 200px 1fr 250px;
  }
}
```

### 2.3 Redimensionnement des zones (optionnel Phase 7)

Ajouter des **poignées de redimensionnement** entre les zones (desktop uniquement) :

```vue
<template>
  <div class="layout">
    <RefsSidebar />
    <div class="resize-handle vertical"></div>
    <GraphView />
    <div class="resize-handle vertical"></div>
    <TerminalPanel />
  </div>
</template>

<script setup lang="ts">
function initResizeHandle() {
  // Logique drag : adjust grid-template-columns
  // Persister widths en localStorage
}
</script>

<style scoped>
.resize-handle {
  width: 4px;
  background: var(--border-color);
  cursor: col-resize;
  hover: background var(--text-secondary);
}
</style>
```

### 2.4 Fonts & spacing

**Mobile** : Réduire padding/margin, augmenter tap target (min 44px)

```css
@media (max-width: 767px) {
  .refs-sidebar {
    padding: 8px;
    font-size: 12px;
  }

  .terminal-panel {
    padding: 8px;
  }

  button {
    min-height: 44px;
    min-width: 44px;
  }
}
```

## 3. Accessibilité (a11y)

### 3.1 ARIA & Sémantique

**Attributs essentiels** :

**RefsSidebar** :
```html
<aside role="complementary" aria-label="Repository status">
  <section aria-labelledby="branches-heading">
    <h2 id="branches-heading">Branches</h2>
    <ul role="list">
      <li role="listitem">main</li>
    </ul>
  </section>
  
  <section aria-labelledby="head-heading">
    <h2 id="head-heading">HEAD</h2>
    <div aria-live="polite" aria-label="Current HEAD target">main</div>
  </section>

  <section aria-labelledby="operation-heading" v-if="hasOperation">
    <h2 id="operation-heading">⚠ Operation in progress</h2>
    <div role="alert" aria-live="assertive">
      {{ operationDescription }}
    </div>
    <button aria-label="Continue the current operation">Continue</button>
    <button aria-label="Abort the current operation">Abort</button>
  </section>
</aside>
```

**GraphView** :
```html
<div class="graph-view" role="img" aria-label="Git commit graph">
  <svg>
    <!-- Nœuds -->
    <circle
      role="button"
      tabindex="0"
      aria-label="Commit {{ shortHash }}: {{ message }}"
      @click="selectNode"
      @keydown.enter="selectNode"
      @keydown.space="selectNode"
    />
  </svg>
  
  <!-- Alternative textuelle : liste structurée -->
  <div class="graph-alternative" role="region" aria-label="Commits list">
    <ul>
      <li v-for="commit in commits" :key="commit.hash">
        {{ commit.shortHash }}: {{ commit.message }}
        <ul v-if="commit.parents.length">
          <li v-for="parent in commit.parents">Parent: {{ parent }}</li>
        </ul>
      </li>
    </ul>
  </div>
</div>
```

**TerminalPanel** :
```html
<div class="terminal-panel">
  <div class="xterm-screen" role="log" aria-label="Terminal output" aria-live="polite">
    <!-- xterm content -->
  </div>
  <div class="terminal-input" role="application" aria-label="Command input">
    <label for="terminal-input">Git command:</label>
    <input
      id="terminal-input"
      type="text"
      aria-describedby="terminal-help"
      placeholder="git init"
    />
    <span id="terminal-help" class="sr-only">
      Enter git commands. Press Tab for autocomplete, Enter to execute.
    </span>
  </div>
</div>
```

### 3.2 Navigation au clavier

**Ordre de tabulation logique** :
1. ThemeSwitcher / LanguageSwitcher (header)
2. RefsSidebar (branches, tags, boutons Continue/Abort)
3. GraphView (commits sélectionnables au clavier)
4. TerminalPanel (input, boutons)

**Implémentation** :

```css
/* Ordre explicite en CSS */
.app {
  display: grid;
  grid-template-areas:
    "header"
    "sidebar"
    "graph"
    "terminal";
}

/* Ou via tabindex (moins préféré) */
[tabindex] {
  outline: 2px solid var(--accent-blue);
  outline-offset: 2px;
}

[tabindex]:focus {
  outline-width: 3px;
}
```

**Commandes clavier** (accessibilité avancée) :
- **Arrow Up/Down** : naviguer dans l'historique du terminal
- **Escape** : fermer modale, quitter sélection
- **Enter** : exécuter commande, confirmer action
- **Space/Enter** : sélectionner un commit dans le graphe
- **Ctrl+K** : ouvrir palette de commandes (spec 57)

### 3.3 Contrastes WCAG AA

**Vérifier** avec DevTools ou `axe-core` :

- Texte normal : minimum **4.5:1**
- Texte gros (18px+/bold) : minimum **3:1**

**Palette proposée (dark theme, validée WCAG AA)** :

```
Light theme:
- #1a1a1a (black-ish) sur #ffffff (white) : 21:1 ✓
- #666666 (gray) sur #ffffff : 4.5:1 ✓
- #0066cc (blue) sur #ffffff : 8.6:1 ✓

Dark theme:
- #f0f0f0 (light-ish) sur #1a1a1a (black) : 17:1 ✓
- #b0b0b0 (gray) sur #1a1a1a : 9.2:1 ✓
- #66b3ff (light blue) sur #1a1a1a : 9.8:1 ✓
```

### 3.4 Texte alternatif

**SVG graph** : Ajouter `<title>` et `<desc>` :

```html
<svg class="graph-svg">
  <defs>
    <title>Git Commit Graph</title>
    <desc>Visual representation of commit history with branches and tags</desc>
  </defs>
  
  <circle id="commit-abc1234">
    <title>Commit abc1234: Initial commit</title>
    <desc>Parent: none. Branch: main</desc>
  </circle>
</svg>
```

### 3.5 Mode lecteur d'écran

**xterm** : Ajouter région `aria-live` pour annoncen les outputs :

```html
<div class="terminal-output" role="log" aria-live="polite" aria-label="Terminal output">
  <!-- Output du xterm -->
</div>
```

**Modale interactive rebase** : Assurer que la liste des actions et leur ordre sont annonçables.

## 4. Critères d'acceptation

### Thème sombre

#### CA-theme-01 : Toggle entre Light/Dark

**Given**
- `ThemeSwitcher.vue` montée
- Sélecteur visible avec options "Light", "Dark", "Auto"

**When**
- Utilisateur sélectionne "Dark"

**Then**
- Page bascule immédiatement au thème sombre
- localStorage contient `'theme': 'dark'`
- Toutes les zones appliquent les CSS vars sombre

### CA-theme-02 : Persistance du thème

**Given**
- Utilisateur a choisi "Dark"

**When**
- Recharge la page (F5)

**Then**
- Page affiche directement en Dark
- Pas de flash blanc
- localStorage toujours `'dark'`

### CA-theme-03 : Respect de `prefers-color-scheme`

**Given**
- Système configuré en Dark mode
- Sélecteur thème = "Auto"

**When**
- Page charge

**Then**
- Mode Dark appliqué automatiquement
- Si système change (ex. horaire auto), page répond en direct

### CA-theme-04 : Contrastes WCAG AA

**Given**
- Page en Dark et Light mode

**When**
- Scan avec `axe-core` ou DevTools audit

**Then**
- Tous les textes passent min 4.5:1 (normal) ou 3:1 (gros)
- Boutons min 3:1
- Pas de warnings WCAG AA

**Automatisation** : Test avec `axe-core` ou `pa11y`

### CA-theme-05 : Badges et arêtes visibles en Dark

**Given**
- GraphView en Dark mode
- Commits avec badges branches/tags

**When**
- Affichage

**Then**
- Couleurs des nœuds, badges, arêtes adaptées au thème
- Contraste suffisant
- Pas de fusion avec le fond

### Responsive & Mobile

#### CA-responsive-01 : Layout mobile empilé

**Given**
- Viewport < 768px (mobile)

**When**
- Page charge

**Then**
- Layout en colonnes : GraphView > TerminalPanel > RefsSidebar
- Pas de scroll horizontal (100% width)
- Tap targets min 44px

### CA-responsive-02 : Sidebar toggle sur mobile

**Given**
- Mobile, RefsSidebar cachée par défaut

**When**
- Utilisateur clique bouton "Show sidebar" (ou icon)

**Then**
- Sidebar overlay apparaît
- Clique en dehors → ferme

### CA-responsive-03 : Fonts lisibles sur petit écran

**Given**
- Mobile (4" écran)

**When**
- Page affiche

**Then**
- Texte minimum 12px ou plus grand
- Padding réduit mais lisible
- Pas de croisement texte/commandes

### CA-responsive-04 : Graphe adapté (petit écran)

**Given**
- Mobile
- Dépôt avec 50 commits

**When**
- GraphView affiche

**Then**
- Graphe redimensionné à ~200px hauteur
- Pan/zoom fonctionne
- Pas d'overflow caché sans scroll

### Accessibilité

#### CA-a11y-01 : Navigation clavier complète

**Given**
- Page chargée

**When**
- Utilisateur navigue à la touche Tab

**Then**
- Tous les contrôles atteignables (boutons, inputs, commits cliquables)
- Focus visible (outline 2px+)
- Ordre logique (haut → bas, gauche → droite)

### CA-a11y-02 : Enter sur un commit pour le sélectionner

**Given**
- Graphe chargé
- Commit `C1` focalisé (outline visible)

**When**
- Utilisateur tape Enter

**Then**
- Commit sélectionné (classe `node-selected`, tooltip affiché)
- Espace déclenche aussi (optionnel)

### CA-a11y-03 : Labels et descriptions sur inputs

**Given**
- TerminalPanel

**When**
- Lecteur d'écran lit la page

**Then**
- Input terminal a `<label>` associé ou `aria-label`
- Hint/help associé via `aria-describedby`
- Lecteur énonce correctement

### CA-a11y-04 : ARIA Live pour opérations

**Given**
- Merge en cours, conflit affiché dans RefsSidebar

**When**
- Opération change d'état (ex. `--continue` exécuté)

**Then**
- Lecteur d'écran annonce le changement ("Operation complete")
- `aria-live="polite"` ou `"assertive"` selon urgence

### CA-a11y-05 : Alternative textuelle au graphe SVG

**Given**
- Lecteur d'écran enabled
- GraphView montée

**When**
- Utilisateur accède à la région du graphe

**Then**
- `role="img"` avec `aria-label` pertinent
- Optionnel : région alternative `.graph-alternative` listant les commits en texte structuré

### CA-a11y-06 : Focus visible sur tous les états

**Given**
- Page

**When**
- Utilisateur tabule sur un bouton, input, link, commit

**Then**
- Focus visible sans ambiguïté (outline 2px+ couleur contrastée)
- Pas d'outline blanc sur fond blanc, etc.

### CA-a11y-07 : Escape pour fermer modale

**Given**
- Interactive rebase modale affichée

**When**
- Utilisateur tape Escape

**Then**
- Modale ferme
- Focus revient au trigger (ex. bouton de rebase)

### CA-a11y-08 : Annonces au lecteur d'écran

**Given**
- Terminal exécute `git commit`

**When**
- Commande réussit

**Then**
- Région avec `aria-live` annonce le succès
- Lecteur d'écran énonce automatiquement

**Automatisation** : Tester markup ARIA (ne pas tester le lecteur réel)

## 5. Implémentation : Points clés

1. **CSS Variables** : Tous les styles doivent consommer `var(--*)` pour thème

2. **useTheme()** : Composable réactif pour changement/persistance du thème

3. **Mobile-first** : CSS par défaut pour mobile, `@media` pour élargir

4. **Keyboard** : Tous les contrôles doivent répondre aux touches clés (Enter, Space, Arrow, Escape, Tab)

5. **ARIA** : Labeling complet (`aria-label`, `aria-describedby`, `aria-live`, `role`)

6. **Contrastes** : Valider à la compilation ou dans les tests

7. **Lecteur d'écran** : Sémantique HTML, ordre logique, pas de `display:none` sans substitut

## 6. Dépendances inter-phases

- **Phase 7** : Implémentation de base (variables CSS, composables, layouts responsive, ARIA basique).
- **Phase 8** : Perf responsive (virtualisation SVG sur mobile), animations accessibles (`prefers-reduced-motion`).
- **Phase 9** : Polish final (icônes accessibles, palettes personnalisées, thème par scenario).

## Notes pour Phase 7+

- **Testing** : `axe-core` dans les tests d'intégration Vitest (ou actions GitHub CI).
- **Maintenance** : Ajouter nouvelles couleurs → ajouter CSS vars pour light/dark.
- **Optionnel** : Système de thèmes utilisateur custom (sélection couleurs primaires/accents).
