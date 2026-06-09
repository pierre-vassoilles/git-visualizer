# Phase 6+ – Animations de transition du graphe

## Résumé

Cette spec couvre les **animations de transition** lors des changements d'état du graphe Git : un commit est créé, une branche est fusionnée, une réécriture d'historique intervient (rebase, reset). L'objectif est de faire _voir_ au utilisateur comment le graphe évolue, renforçant sa compréhension mentale du DAG.

**Principe directeur** : Le layout reste **pur et déterministe** (`computeLayout` unchanged). Les animations **interpellent** entre deux snapshots de layout successifs côté UI. Aucune dépendance lourde (pas de lib animée ; utiliser CSS transitions + transforms Vue ou WebGL léger optionnel).

## 1. Architecture des animations

### 1.1 Flux de données

```
xterm → store.execute(cmd) → core/engine.execute() → snapshot v2
                                                            ↓
                                      calculateLayout(v2) → GraphLayout v2
                                            ↓
                                  (UI détecte changement)
                                            ↓
     (interpoler position/opacité entre layout v1 et v2)
                                            ↓
                                    SVG animé
```

### 1.2 États à animer

Les **changements de layout** qui nécessitent une animation :

1. **Création d'un commit** (append to HEAD) :
   - Nouveau nœud apparaît en bas du graphe.
   - Arête parent → enfant apparaît (fade-in).
   - Label de branche sur ancien HEAD disparaît, réapparaît sur nouveau HEAD.

2. **Changement de branche** (`git checkout` ou `git switch`) :
   - Badge "HEAD" se déplace d'un commit à un autre.
   - Aucun changement de layout (nœuds/arêtes restent aux mêmes positions).

3. **Fusion (merge)** :
   - Nouveau nœud de merge (2+ parents).
   - Deux arêtes convergeant.
   - Label de branche source disparaît du tip source, réapparaît sur merge.

4. **Reset (--hard/--mixed/--soft)** :
   - HEAD se repositionne.
   - Commits réachables depuis ancien HEAD disparaissent (fade-out, disparition progressive).
   - Commits réachables depuis nouveau HEAD réapparaissent (fade-in).

5. **Rebase (non-interactif & interactif)** :
   - **Réécriture d'historique** : anciens commits disparaissent, nouveaux nœuds apparaissent avec nouveaux hashes.
   - Cascade de créations/suppressions le long de la branche.
   - Lane peut changer.

6. **Revert** :
   - Nouveau commit apparaît (copie inversée).
   - Badge de branche se déplace.

7. **Cherry-pick** :
   - Nouveau commit apparaît (sur branche courante).
   - Badge se déplace.

### 1.3 Stratégie de clés stables

**Identité d'un nœud** : son `hash` (stable pendant la phase animée).

- **Création** : hash n'existait pas avant → clé n'existe pas dans layout v1 → animation "apparition" (opacité 0 → 1, position finale).
- **Suppression** : hash disparaît du layout v2 → animation "disparition" (opacité 1 → 0, maintenir position).
- **Déplacement** : hash existe en v1 et v2 → animer position (x, y) et couleur (si lane change).

Clé SVG stable pour chaque nœud : `<circle :key="`node-${node.hash}`" />` (déjà présent en spec 17).

## 2. Cas d'animation détaillés

### 2.1 Création d'un commit

**État avant** : commit C2 sur `main`, HEAD pointe C2.

```
  C1 -- C2 (main, HEAD)
```

**Commande** : `git commit -m "C3"`

**État après** : commit C3 créé, HEAD et main pointent C3.

```
  C1 -- C2 -- C3 (main, HEAD)
```

**Animation** :
- **Nœud C3** : opacity 0→1, position interpolée (part de y=C2.y, arrive à y=C3.y).
- **Arête C2→C3** : opacity 0→1, stroke-dasharray animé (effet "dessiner la ligne").
- **Badge "main"** : x/y interpo du C2.badge vers C3.badge (translation).
- **Badge "HEAD"** : idem.
- **Durée** : 300-500ms, easing `ease-out` (decelerate).

### 2.2 Changement de HEAD (checkout sans création)

**État avant** : HEAD pointe C2, branch `main` pointe C2.

**Commande** : `git checkout C1` (HEAD détaché)

**État après** : HEAD détaché, pointe C1. Layout identique (pas de nouveaux nœuds).

**Animation** :
- **Badge "HEAD"** : disparaît de C2, réapparaît sur C1 (fade-out + translate de C2 à C1, fade-in, duration 200ms).
- **Nœuds/arêtes** : aucun changement.
- **Snapshots** : `head.type` change en `detached`, le reste stable.

### 2.3 Fusion (fast-forward)

**État avant** :
```
C1 -- C2 (main) -- C3 (feature)
            ↑ HEAD
```

**Commande** : `git merge feature`

**État après** : merge en fast-forward, main et HEAD pointent C3.

```
C1 -- C2 -- C3 (main, HEAD, feature)
```

**Animation** :
- **Badge "main"** : translation de C2 vers C3.
- **Badge "HEAD"** : translation de C2 vers C3.
- **Durée** : 200ms (rapide, car pas de réécriture).

### 2.4 Fusion (true merge, 2 parents)

**État avant** :
```
C1 -- C2 (main) -- C4
 \                /
  -- C3 (feature)
```

**Commande** : `git merge feature` (true merge)

**État après** : C5 créé, enfant de C2 et C3, main et HEAD pointent C5.

```
C1 -- C2 (main)-- C4
 \     |  ↑ HEAD  /
  --C3(feature) /
      \        /
        --(C5)
```

**Animation** :
- **Nœud C5** : opacity 0→1, position interpolée (descend du bas du graphe).
- **Deux arêtes** (C2→C5, C3→C5) : opacity 0→1, curves animées.
- **Badges main/HEAD** : translation vers C5.
- **Durée** : 400ms.

### 2.5 Reset (--hard)

**État avant** :
```
C1 -- C2 -- C3 (main, HEAD)
```

**Commande** : `git reset --hard C1` (couper C2, C3)

**État après** : main et HEAD pointent C1. C2, C3 inaccessibles.

```
C1 (main, HEAD)
```

**Animation** :
- **Nœuds C2, C3** : opacity 1→0, position stable (disparition progressive).
- **Arêtes C1→C2, C2→C3** : opacity 1→0.
- **Badges main/HEAD** : translation vers C1.
- **Durée** : 300ms.

**Comportement après disparition** : Les nœuds/arêtes sont **retirés du DOM**, pas juste invisibles. Le layout v2 ne les contient pas.

### 2.6 Rebase (réécriture d'historique)

**État avant** :
```
C1 -- C2 (main) -- C3 -- C4 (feature)
```

**Commande** : `git rebase main` (sur feature)

**État après** : C3' et C4' (nouveaux hashes), rejeu des patchs.

```
C1 -- C2 (main) -- C3' -- C4' (feature, HEAD)
```

**Animation** :
- **Anciens nœuds C3, C4** : opacity 1→0 (disparition, mais lentement visible).
- **Nouveaux nœuds C3', C4'** : opacity 0→1 (apparition progressive).
- **Tous les badges** (feature, HEAD) : translation finale vers C4'.
- **Arêtes** : rerouting animé (l'arête C2→C3' remplace C2→C3 progressivement).
- **Durée** : 500ms (plus long, car changement sémantique important).

### 2.7 Rebase interactif (squash/reword)

**État avant** :
```
C1 -- C2 (main) -- C3 -- C4 -- C5 (feature)
```

**Commande** : `git rebase -i main` → squash C4 et C5 en C4'

**État après** :
```
C1 -- C2 (main) -- C3 -- C4' (feature)
```

**Animation** :
- **C3, C4'** : C3 bouge légèrement (profondeur change), C4' new (opacity 0→1).
- **C5** : disparaît (opacity 1→0).
- **Badges** : migration vers C4'.
- **Arêtes** : cascadées.

## 3. Implémentation côté UI (Vue 3 + CSS/Transforms)

### 3.1 Computed pour layout avec interpolation

```typescript
// GraphView.vue
import { computed, ref, watch } from 'vue';
import { calculateLayout } from '@/graph/layout';

const prevLayout = ref<GraphLayout | null>(null);
const animationProgress = ref(0);  // 0 à 1

const layout = computed(() => {
  // Layout actuel (depuis snapshot)
  return calculateLayout(/* ... */);
});

// Observer le changement de layout
watch(
  () => layout.value,
  (newLayout) => {
    if (prevLayout.value) {
      // Lancer l'animation
      animateLayoutChange(prevLayout.value, newLayout);
    }
    prevLayout.value = newLayout;
  },
);

function animateLayoutChange(fromLayout: GraphLayout, toLayout: GraphLayout) {
  animationProgress.value = 0;

  const startTime = performance.now();
  const duration = 350;  // ms

  function frame(currentTime: number) {
    const elapsed = currentTime - startTime;
    animationProgress.value = Math.min(elapsed / duration, 1);

    if (animationProgress.value < 1) {
      requestAnimationFrame(frame);
    } else {
      // Animation terminée
      prevLayout.value = toLayout;
    }
  }

  requestAnimationFrame(frame);
}
```

### 3.2 Nodes animés

```vue
<template>
  <g class="nodes">
    <!-- Nœuds de la layout v2 (finale) -->
    <circle
      v-for="node in layout.nodes"
      :key="`node-${node.hash}`"
      :cx="interpolateNodeX(node.hash)"
      :cy="interpolateNodeY(node.hash)"
      :r="nodeRadius"
      :fill="node.color"
      :style="{ opacity: interpolateNodeOpacity(node.hash) }"
      class="node"
      @mouseenter="hoveredHash = node.hash"
      @mouseleave="hoveredHash = null"
    />

    <!-- Nœuds de la layout v1 (anciennement visibles, maintenant disparus) -->
    <circle
      v-if="prevLayout"
      v-for="oldNode in prevLayout.nodes.filter(
        (n) => !layout.nodes.find((nn) => nn.hash === n.hash),
      )"
      :key="`old-node-${oldNode.hash}`"
      :cx="oldNode.x"
      :cy="oldNode.y"
      :r="nodeRadius"
      :fill="oldNode.color"
      :style="{ opacity: 1 - animationProgress }"  // Disparition progressive
      class="node node-disappearing"
    />
  </g>
</template>

<script setup lang="ts">
function interpolateNodeX(hash: string): number {
  const newNode = layout.value?.nodes.find((n) => n.hash === hash);
  const oldNode = prevLayout.value?.nodes.find((n) => n.hash === hash);

  if (!newNode) return 0;
  if (!oldNode) {
    // Nœud nouveau : le faire "descendre" depuis le parent (y transition)
    // mais x final d'emblée
    return newNode.x;
  }

  // Nœud existant : interpoler x (peut changer de lane)
  return oldNode.x + (newNode.x - oldNode.x) * animationProgress.value;
}

function interpolateNodeY(hash: string): number {
  const newNode = layout.value?.nodes.find((n) => n.hash === hash);
  const oldNode = prevLayout.value?.nodes.find((n) => n.hash === hash);

  if (!newNode) return 0;
  if (!oldNode) {
    // Nœud nouveau : partir d'une position "off-screen" (bas du graphe)
    const startY = layout.value!.height;
    return startY + (newNode.y - startY) * animationProgress.value;
  }

  // Nœud existant : interpoler y
  return oldNode.y + (newNode.y - oldNode.y) * animationProgress.value;
}

function interpolateNodeOpacity(hash: string): number {
  const newNode = layout.value?.nodes.find((n) => n.hash === hash);
  const oldNode = prevLayout.value?.nodes.find((n) => n.hash === hash);

  if (!newNode) return 0;  // Disparition
  if (!oldNode) {
    // Apparition : 0 → 1
    return animationProgress.value;
  }

  // Nœud stable : opacity constante
  return 0.8;  // ou faire varier selon le hover
}
```

### 3.3 Edges animés

```vue
<template>
  <g class="edges">
    <!-- Arêtes de la layout v2 (finale) -->
    <line
      v-for="edge in layout.edges.filter((e) => e.type === 'linear')"
      :key="`edge-${edge.fromHash}-${edge.toHash}`"
      :x1="interpolateEdgeFromX(edge)"
      :y1="interpolateEdgeFromY(edge)"
      :x2="interpolateEdgeToX(edge)"
      :y2="interpolateEdgeToY(edge)"
      :style="{ opacity: interpolateEdgeOpacity(edge) }"
      class="edge"
    />

    <!-- Merge edges (courbes) -->
    <path
      v-for="edge in layout.edges.filter((e) => e.type === 'merge')"
      :key="`merge-${edge.fromHash}-${edge.toHash}`"
      :d="interpolateMergePath(edge)"
      :style="{ opacity: interpolateEdgeOpacity(edge) }"
      class="edge edge-merge"
    />

    <!-- Arêtes disparaissantes (v1 uniquement) -->
    <line
      v-if="prevLayout"
      v-for="oldEdge in prevLayout.edges.filter(
        (e) =>
          !layout.edges.find(
            (ne) =>
              ne.fromHash === e.fromHash && ne.toHash === e.toHash,
          ),
      )"
      :key="`old-edge-${oldEdge.fromHash}-${oldEdge.toHash}`"
      :x1="oldEdge.fromX"
      :y1="oldEdge.fromY"
      :x2="oldEdge.toX"
      :y2="oldEdge.toY"
      :style="{ opacity: (1 - animationProgress) * 0.6 }"
      class="edge edge-disappearing"
    />
  </g>
</template>

<script setup lang="ts">
function interpolateEdgeOpacity(edge: GraphEdge): number {
  const oldEdge = prevLayout.value?.edges.find(
    (e) => e.fromHash === edge.fromHash && e.toHash === edge.toHash,
  );

  if (oldEdge) {
    // Arête existante : rester visible
    return 0.6;
  }

  // Arête nouvelle : fade in
  return 0.6 * animationProgress.value;
}

function interpolateEdgeFromX(edge: GraphEdge): number {
  const oldEdge = prevLayout.value?.edges.find(
    (e) => e.fromHash === edge.fromHash && e.toHash === edge.toHash,
  );

  if (!oldEdge) return edge.fromX;
  return oldEdge.fromX + (edge.fromX - oldEdge.fromX) * animationProgress.value;
}

// Idem pour fromY, toX, toY...

function interpolateMergePath(edge: GraphEdge): string {
  // Courbe de Bézier : interpoler les points de contrôle
  // Voir spec 17 pour le calcul exact
  const oldEdge = prevLayout.value?.edges.find(
    (e) =>
      e.fromHash === edge.fromHash &&
      e.toHash === edge.toHash &&
      e.type === 'merge',
  );

  if (!oldEdge) {
    // Arête merge nouvelle : partir d'une courbe dégénérée (points confondus)
    // Puis interpoler vers la courbe finale
    // Approx : commencer près du fromX/fromY
    const progress = animationProgress.value;
    const controlX1 = edge.fromX;
    const controlX2 = edge.toX + (edge.fromX - edge.toX) * (1 - progress);
    const midY =
      edge.fromY + (edge.toY - edge.fromY) * (0.1 + progress * 0.8);

    return `
      M ${edge.fromX} ${edge.fromY}
      C ${controlX1} ${midY},
        ${controlX2} ${midY},
        ${edge.toX} ${edge.toY}
    `;
  }

  // Arête merge existante : interpoler smooth
  // (idem pour x/y dans une courbe)
  return getBezierPath(edge);  // Voir spec 17
}
```

### 3.4 Badges animés

```vue
<template>
  <g class="badges">
    <g
      v-for="node in layout.nodes"
      :key="`badges-${node.hash}`"
      :transform="`translate(${interpolateNodeX(node.hash)}, ${
        interpolateNodeY(node.hash) - nodeRadius - 8
      })`"
      :style="{ opacity: interpolateNodeOpacity(node.hash) }"
    >
      <!-- HEAD badge -->
      <g v-if="isHeadCommit(node.hash)" class="badge-head">
        <rect x="0" y="0" width="50" height="16" fill="#fff" stroke="#333" rx="2" />
        <text x="4" y="12" font-size="10" fill="#333">HEAD</text>
      </g>

      <!-- Branch badges -->
      <g
        v-for="(branch, idx) in node.snapshot.branches"
        :key="`branch-${node.hash}-${idx}`"
        :transform="`translate(0, ${idx > 0 ? idx * 20 : 0})`"
        class="badge-branch"
      >
        <rect
          :x="idx > 0 ? 0 : 50"
          y="0"
          width="60"
          height="16"
          fill="#e0e7ff"
          stroke="#4f46e5"
          rx="2"
        />
        <text :x="idx > 0 ? 4 : 54" y="12" font-size="9" fill="#4f46e5">
          {{ branch }}
        </text>
      </g>
    </g>
  </g>
</template>
```

Le badge suit la position du nœud (car `:transform` l'interpole).

### 3.5 CSS pour l'animation

```css
.node {
  transition: opacity 0.35s ease-out, cx 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94),
    cy 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  /* Ou gérer en :style si plus fin contrôle nécessaire */
}

.node-disappearing {
  pointer-events: none;
}

.edge {
  transition: opacity 0.35s ease-out, x1 0.35s, y1 0.35s, x2 0.35s, y2 0.35s;
}

.edge-disappearing {
  stroke-dasharray: 5, 5;
  pointer-events: none;
}

.badge-head,
.badge-branch,
.badge-tag {
  transition: opacity 0.35s ease-out, transform 0.35s ease-out;
}
```

## 4. Respect de prefers-reduced-motion

Pour les utilisateurs ayant activé `prefers-reduced-motion`, **désactiver l'animation**.

```typescript
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)',
).matches;

const animationDuration = prefersReducedMotion ? 0 : 350;
```

**Comportement** : Si `prefersReducedMotion = true`, sauter directement au snapshot final (animationProgress = 1 sans animation).

```vue
<template>
  <circle
    v-for="node in layout.nodes"
    :key="`node-${node.hash}`"
    :cx="prefersReducedMotion ? node.x : interpolateNodeX(node.hash)"
    :cy="prefersReducedMotion ? node.y : interpolateNodeY(node.hash)"
    :style="{
      opacity: prefersReducedMotion ? 0.8 : interpolateNodeOpacity(node.hash),
    }"
  />
</template>
```

## 5. Options de contrôle utilisateur (optionnel Phase 6+)

Ajouter à la sidebar ou un panneau de settings :

- **Animation speed slider** : 0% (disabled), 50%, 100% (normal), 150% (fast).
- **Toggle animations on/off** : pour que l'utilisateur puisse désactiver même sans `prefers-reduced-motion`.

## 6. Cas limites

### 6.1 Plusieurs commits très rapides

Si l'utilisateur tape `git commit` rapidement 5 fois :

- Chaque commit lance sa propre animation.
- **Comportement** : Les animations se chainént (queue) ou se superposent (interruption) ?
- **Recommandation** : Animation chainée (wait for prev to finish before starting next). Utiliser un `queue` ou `isAnimating` flag pour éviter les chevauchements.

### 6.2 Graphe très grand (>500 commits)

Animer **tous** les nœuds peut être coûteux. **Optionnel** : virtualiser le SVG (voir spec 9 Phase 3 — performance).

### 6.3 Historique très long (rebase sur 50 commits)

Animation longue (peut durer 1s+). **Optionnel** : Afficher une progress bar ou un message « Rebasing... » pendant la durée.

## 7. Critères d'acceptation

### CA-anim-01 : Création de commit

- [ ] `git commit` crée un nœud.
- [ ] Nœud nouveau : opacity 0 → 1 (fade in).
- [ ] Position interpolée depuis y_parent vers y_new (descente).
- [ ] Arête parent → enfant : opacity 0 → 1.
- [ ] Badges se déplacent (translation smooth).
- [ ] Durée : 300-500ms.

### CA-anim-02 : Changement de HEAD

- [ ] `git checkout <commit>` → HEAD badge se déplace (fade-out d'un commit, fade-in sur l'autre).
- [ ] Nœuds/arêtes inchangés.
- [ ] Snapshot.head.type bascule vers `detached`.
- [ ] Durée : 200-300ms.

### CA-anim-03 : Fusion (merge)

- [ ] True merge (2+ parents) → nœud merge nouveau apparaît.
- [ ] Deux arêtes convergentes : opacity 0 → 1.
- [ ] Badges main/source se déplacent.
- [ ] Cas fast-forward : badges translation simple.

### CA-anim-04 : Reset (--hard)

- [ ] Commits coupés → opacity 1 → 0 (disparition).
- [ ] Arêtes coupées → opacity 1 → 0.
- [ ] HEAD se repositionne (badge translation).
- [ ] Layout v2 ne contient pas les nœuds supprimés.

### CA-anim-05 : Rebase

- [ ] Anciens commits : opacity 1 → 0.
- [ ] Nouveaux commits : opacity 0 → 1 (apparition).
- [ ] Hashes changent (clés stables par hash).
- [ ] Tous les badges se déplacent correctement.
- [ ] Durée : 400-600ms (plus long que commit simple).

### CA-anim-06 : prefers-reduced-motion

- [ ] User avec `prefers-reduced-motion: reduce` → pas d'animation.
- [ ] Snapshot final appliqué instantanément (animationProgress = 1).
- [ ] Pas d'erreur, comportement normal sinon.

### CA-anim-07 : Stabilité des clés

- [ ] Nœuds avec même hash pendant l'animation → interpolation smooth (pas de saut).
- [ ] Rerender ne crée pas de nouveau élément SVG pour un nœud stable (clé identique).

### CA-anim-08 : Pas de dépendance lourde

- [ ] Animations réalisées en CSS transitions / requestAnimationFrame.
- [ ] Pas de lib (anime.js, gsap, etc.).
- [ ] Bundle size unchanged.

### CA-anim-09 : Arêtes merge (courbes de Bézier)

- [ ] Merge edges (lanes différentes) : courbes interpolées smooth.
- [ ] Pas de saut ou de chevauchement.
- [ ] Points de contrôle animés.

### CA-anim-10 : Revue visuelle

- [ ] Animation visuellement fluide (pas de saccades).
- [ ] Timing cohérent (header & edges synchronisés).
- [ ] Badges ne chevauchent pas les nœuds.
- [ ] Opacité/couleur cohérentes.

---

## Notes pour implémentation

1. **Pas de changement à `computeLayout`** : la fonction reste pur et testable.
2. **Watch sur `layout` computed** : déclencher l'animation si changement détecté.
3. **prevLayout** : conserver la layout précédente pour les interpolations.
4. **animationProgress** : ref réactive, 0-1, gérée par `requestAnimationFrame`.
5. **Interpolateurs** : fonctions pures qui calculent les valeurs finales à partir de `animationProgress`.
6. **CSS transitions** : optionnel, mais peut simplifier si timing est standard.
7. **Test** : Revue visuelle (vidéo), pas de test unitaire (animations trop subjectives).

## Dépendances inter-specs

- **Spec 16 (layout)** : pas d'impact, layout reste pur.
- **Spec 17 (render)** : intégration dans `GraphView.vue`.
- **UI responsiveness** : animations non-blocking (requestAnimationFrame ne freeze le UI).
