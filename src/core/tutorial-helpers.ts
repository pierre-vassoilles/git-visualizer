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

export interface StepObjective {
  /** Description courte du critère (ex. "1 commit créé"). */
  description: string;
  /** Prédicat pur sur le snapshot. */
  validate: (snapshot: RepoSnapshot) => boolean;
}

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  hint?: string;
  objectives: StepObjective[];
  successMessage: string;
}

export interface Tutorial {
  id: string;
  title: string;
  description: string;
  /** Durée estimée (minutes). */
  duration: number;
  /** Difficulté : 1 (facile) à 3 (difficile). */
  difficulty: 1 | 2 | 3;
  steps: TutorialStep[];
  suggestedCommands?: string[];
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

/** Nombre de branches >= n. */
export function hasBranchCount(n: number): (snap: RepoSnapshot) => boolean {
  return (snap) => Object.keys(snap.branches).length >= n;
}

/** Combine plusieurs prédicats (ET logique). */
export function all(
  ...preds: Array<(snap: RepoSnapshot) => boolean>
): (snap: RepoSnapshot) => boolean {
  return (snap) => preds.every((p) => p(snap));
}
