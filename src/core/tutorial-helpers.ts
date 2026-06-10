/**
 * Tutoriels guidés (spec 51) — types + prédicats de validation PURS.
 *
 * Les prédicats consomment le `RepoSnapshot` (lecture seule) : aucune logique
 * Git mutante, déterministes, testables headless. Adaptés à la forme RÉELLE du
 * snapshot du projet (`branches`/`tags` = Record, `head` = {type,name|hash},
 * `files` = SnapshotFile[]).
 *
 * Les types vivent ici (et non dans model.ts) pour éviter un cycle d'import
 * model ↔ engine (RepoSnapshot est défini dans engine.ts).
 */

import type { RepoSnapshot } from './engine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Texte localisé (FR + EN). Spec 62 : le contenu pédagogique des tutoriels est
 * bilingue inline (et non via `messages.ts`) pour ne pas gonfler l'union MessageKey.
 * Résolu à l'affichage via `localize(text, locale)`.
 */
export interface LocalizedText {
  en: string;
  fr: string;
}

/** Niveau d'un tutoriel — SOURCE DE VÉRITÉ du regroupement et de la difficulté (spec 62, C1). */
export type TutorialLevel = 'basic' | 'medium' | 'advanced';

export interface StepObjective {
  /** Description courte du critère (ex. "1 commit créé"), bilingue. */
  description: LocalizedText;
  /** Prédicat pur sur le snapshot. */
  validate: (snapshot: RepoSnapshot) => boolean;
}

export interface TutorialStep {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  hint?: LocalizedText;
  /** POURQUOI/COMMENT (pédagogique, bilingue). Requis — cf. spec 62 (C2). */
  explanation: LocalizedText;
  /** Effet sur le graphe (bilingue). Requis — cf. spec 62 (C2). */
  graphEffect: LocalizedText;
  /**
   * Commande lancée par le bouton « Exécuter ». Peut être chaînée (`;`/`&&`) :
   * exécutée via `store.executeChain` (cf. spec 62, A1). Révisions relatives
   * préférées aux hashes littéraux (A2).
   */
  command?: string;
  objectives: StepObjective[];
  successMessage: LocalizedText;
}

export interface Tutorial {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  /** Niveau (source de vérité ; la difficulté numérique en dérive). */
  level: TutorialLevel;
  /** Durée estimée (minutes). */
  duration: number;
  steps: TutorialStep[];
  suggestedCommands?: string[];
}

/** Résout un `LocalizedText` selon la locale (fallback en → fr → ''). */
export function localize(text: LocalizedText, locale: 'en' | 'fr'): string {
  return text[locale] || text.en || text.fr || '';
}

/** Étiquette de difficulté numérique DÉRIVÉE du niveau (basic→1, medium→2, advanced→3). */
export function levelToDifficulty(level: TutorialLevel): 1 | 2 | 3 {
  return level === 'basic' ? 1 : level === 'medium' ? 2 : 3;
}

// ---------------------------------------------------------------------------
// Prédicats réutilisables (factories)
// ---------------------------------------------------------------------------

/** Au moins `n` commits accessibles depuis HEAD. */
export function hasCommits(n: number): (snap: RepoSnapshot) => boolean {
  return (snap) => snap.commits.length >= n;
}

/** Exactement `n` commits accessibles depuis HEAD. */
export function commitCountEquals(n: number): (snap: RepoSnapshot) => boolean {
  return (snap) => snap.commits.length === n;
}

/** Le dépôt est initialisé. */
export function isInitialized(): (snap: RepoSnapshot) => boolean {
  return (snap) => snap.initialized;
}

/** La branche `name` existe. */
export function hasBranch(name: string): (snap: RepoSnapshot) => boolean {
  return (snap) => name in snap.branches;
}

/** HEAD pointe (symbolique) sur la branche `name`. */
export function headPointsTo(name: string): (snap: RepoSnapshot) => boolean {
  return (snap) => snap.head.type === 'branch' && snap.head.name === name;
}

/** HEAD est détaché. */
export function isHeadDetached(): (snap: RepoSnapshot) => boolean {
  return (snap) => snap.head.type === 'detached';
}

/** Le tag `name` existe. */
export function hasTag(name: string): (snap: RepoSnapshot) => boolean {
  return (snap) => name in snap.tags;
}

/** Le fichier `path` est présent dans le working tree (suivi ou non). */
export function fileExists(path: string): (snap: RepoSnapshot) => boolean {
  return (snap) => snap.files.some((f) => f.path === path);
}

/** Le fichier `path` est stagé (présent dans l'index, statut 'staged'). */
export function isStaged(path: string): (snap: RepoSnapshot) => boolean {
  return (snap) => snap.files.some((f) => f.path === path && f.status === 'staged');
}

/** Rien n'est stagé (aucun fichier au statut 'staged') — index aligné sur HEAD. */
export function noStagedChanges(): (snap: RepoSnapshot) => boolean {
  return (snap) => !snap.files.some((f) => f.status === 'staged');
}

/** Aucune opération (merge/rebase/…) en cours. */
export function noOperationInProgress(): (snap: RepoSnapshot) => boolean {
  return (snap) => !snap.operationState;
}

/** Une opération est en cours (merge/rebase/… conflictuel) — utile pour les tutos conflit. */
export function operationInProgress(): (snap: RepoSnapshot) => boolean {
  return (snap) => !!snap.operationState;
}

/** Nombre de branches >= n. */
export function hasBranchCount(n: number): (snap: RepoSnapshot) => boolean {
  return (snap) => Object.keys(snap.branches).length >= n;
}

/** Au moins `n` entrées dans le stash (spec 62/63). */
export function hasStashCount(n: number): (snap: RepoSnapshot) => boolean {
  return (snap) => (snap.stashCount ?? 0) >= n;
}

/** La branche `name` a un upstream configuré (spec 62/63). */
export function branchHasUpstream(name: string): (snap: RepoSnapshot) => boolean {
  return (snap) => name in (snap.branchUpstream ?? {});
}

/** Le dépôt distant `name` existe (spec 62/63). */
export function hasRemote(name: string): (snap: RepoSnapshot) => boolean {
  return (snap) => name in (snap.remotes ?? {});
}

/** Combine plusieurs prédicats (ET logique). */
export function all(
  ...preds: Array<(snap: RepoSnapshot) => boolean>
): (snap: RepoSnapshot) => boolean {
  return (snap) => preds.every((p) => p(snap));
}
