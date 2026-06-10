/**
 * Palette de commandes (spec 57) — recherche PURE, testable headless.
 *
 * Compile des items depuis le catalogue, le snapshot (suggestions
 * contextuelles), l'historique, les scénarios, les tutoriels et des actions UI,
 * puis filtre par recherche floue (sous-séquence, insensible à la casse).
 * Aucune logique Git : la palette ne fait que proposer des `command`/actions
 * que le composant exécutera via le store.
 */

import type { CommandCatalog } from '@/core/catalog';
import type { RepoSnapshot } from '@/core/engine';

export type PaletteItem =
  | { kind: 'command'; label: string; description: string; section: string; command: string }
  | { kind: 'scenario'; label: string; description: string; section: string; scenarioId: string }
  | { kind: 'tutorial'; label: string; description: string; section: string; tutorialId: string }
  | { kind: 'ui'; label: string; description: string; section: string; uiAction: string };

export interface PaletteContext {
  catalog: CommandCatalog;
  snapshot: RepoSnapshot;
  history: readonly string[];
  scenarios: ReadonlyArray<{ id: string; title: string; description: string }>;
  tutorials: ReadonlyArray<{ id: string; title: string; description: string }>;
}

/**
 * Score de correspondance floue (sous-séquence). Retourne null si `query`
 * n'est pas une sous-séquence de `text` ; sinon un score (plus petit = mieux,
 * favorise un préfixe et peu d'écart).
 */
export function fuzzyScore(query: string, text: string): number | null {
  if (query === '') return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let ti = 0;
  let firstIdx = -1;
  let gaps = 0;
  let lastMatch = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]!;
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    if (firstIdx === -1) firstIdx = found;
    if (lastMatch !== -1 && found > lastMatch + 1) gaps += found - lastMatch - 1;
    lastMatch = found;
    ti = found + 1;
  }
  return firstIdx * 2 + gaps;
}

const UI_ACTIONS: Array<{ label: string; description: string; uiAction: string }> = [
  { label: 'Basculer le thème (clair/sombre)', description: 'Action UI', uiAction: 'toggle-theme' },
  { label: 'Réinitialiser le dépôt', description: 'Action UI', uiAction: 'reset' },
];

/** Items de suggestion contextuels selon l'état du dépôt. */
function suggestedItems(snap: RepoSnapshot): PaletteItem[] {
  const items: PaletteItem[] = [];
  const op = snap.operationState;
  if (op) {
    const map: Record<string, string> = {
      merging: 'merge',
      rebasing: 'rebase',
      cherryPicking: 'cherry-pick',
    };
    const verb = map[op.type];
    if (verb) {
      items.push(mkCmd(`git ${verb} --continue`, 'Poursuivre l’opération en cours', 'Suggéré'));
      items.push(mkCmd(`git ${verb} --abort`, 'Annuler l’opération en cours', 'Suggéré'));
    }
  }
  const hasStaged = snap.files.some((f) => f.status === 'staged' || f.status === 'modified');
  if (snap.files.some((f) => f.status === 'staged')) {
    items.push(mkCmd('git commit -m "message"', 'Committer les changements stagés', 'Suggéré'));
  }
  if (hasStaged || snap.files.some((f) => f.status !== 'clean')) {
    items.push(mkCmd('git status', 'Voir l’état du working tree', 'Suggéré'));
  }
  if (Object.keys(snap.branches).length > 1) {
    items.push(mkCmd('git merge ', 'Fusionner une branche', 'Suggéré'));
  }
  return items;
}

function mkCmd(command: string, description: string, section: string): PaletteItem {
  return { kind: 'command', label: command, description, section, command };
}

/** Tous les items disponibles (avant filtrage). */
function allCommandItems(catalog: CommandCatalog): PaletteItem[] {
  return Object.entries(catalog.lookup)
    .map(([name, meta]) =>
      mkCmd(`git ${name}`, (meta as { description?: string }).description ?? '', 'Commandes'),
    )
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Construit la liste ordonnée d'items pour une requête.
 * - Requête vide : Récentes + Suggéré + Commandes + Scénarios + Tutoriels + Actions.
 * - Requête non vide : tous les items filtrés/triés par score flou.
 */
export function searchPaletteItems(query: string, ctx: PaletteContext, limit = 50): PaletteItem[] {
  const q = query.trim();

  const scenarioItems: PaletteItem[] = ctx.scenarios.map((s) => ({
    kind: 'scenario',
    label: `Scénario : ${s.title}`,
    description: s.description,
    section: 'Scénarios',
    scenarioId: s.id,
  }));
  const tutorialItems: PaletteItem[] = ctx.tutorials.map((t) => ({
    kind: 'tutorial',
    label: `Tutoriel : ${t.title}`,
    description: t.description,
    section: 'Tutoriels',
    tutorialId: t.id,
  }));
  const uiItems: PaletteItem[] = UI_ACTIONS.map((a) => ({
    kind: 'ui',
    label: a.label,
    description: a.description,
    section: 'Actions',
    uiAction: a.uiAction,
  }));
  const commandItems = allCommandItems(ctx.catalog);

  if (q === '') {
    const recent: PaletteItem[] = [];
    const seen = new Set<string>();
    for (let i = ctx.history.length - 1; i >= 0 && recent.length < 5; i--) {
      const cmd = ctx.history[i]!;
      if (seen.has(cmd)) continue;
      seen.add(cmd);
      recent.push(mkCmd(cmd, 'Commande récente', 'Récentes'));
    }
    return [
      ...recent,
      ...suggestedItems(ctx.snapshot),
      ...commandItems,
      ...scenarioItems,
      ...tutorialItems,
      ...uiItems,
    ].slice(0, limit);
  }

  // Requête non vide : filtre flou sur tous les items (label + description).
  const pool = [...commandItems, ...scenarioItems, ...tutorialItems, ...uiItems];
  const scored = pool
    .map((item) => {
      const sLabel = fuzzyScore(q, item.label);
      const sDesc = fuzzyScore(q, item.description);
      const score = sLabel !== null && sDesc !== null ? Math.min(sLabel, sDesc) : (sLabel ?? sDesc);
      return score === null ? null : { item, score };
    })
    .filter((x): x is { item: PaletteItem; score: number } => x !== null)
    .sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label));

  return scored.slice(0, limit).map((x) => x.item);
}
