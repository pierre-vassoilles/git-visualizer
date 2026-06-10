/**
 * Moteur de diff — PUR (zéro dépendance au Repository, testable headless).
 *
 * Calcule un diff ligne à ligne (LCS) entre deux « côtés » (ancien/nouveau),
 * regroupe les changements en hunks avec 3 lignes de contexte, et produit :
 *  - une structure `DiffResult` (contrat pour un futur visualiseur UI) ;
 *  - une sortie texte compatible avec le format `git diff` (`diff --git`, `@@`,
 *    `+`/`-`).
 *
 * Spec : docs/specs/42-diff-show.md.
 */

// ---------------------------------------------------------------------------
// Types (contrat UI)
// ---------------------------------------------------------------------------

export interface DiffLine {
  type: 'context' | 'added' | 'deleted';
  content: string;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  status: 'added' | 'deleted' | 'modified';
  oldMode?: string;
  newMode?: string;
  oldHash?: string;
  newHash?: string;
  /** true si l'un des deux contenus est binaire (octet nul). */
  binary: boolean;
  hunks: DiffHunk[];
}

export interface DiffResult {
  files: DiffFile[];
  /** Sortie texte git-compatible (une entrée par ligne). */
  rawOutput: string[];
}

/** Un « côté » d'un diff : chemin → contenu/hash/mode. */
export interface DiffSideEntry {
  content: string;
  hash: string;
  mode: string;
}
export type DiffSide = Record<string, DiffSideEntry>;

export interface DiffOptions {
  /** Lignes de contexte autour de chaque changement. Défaut : 3. */
  context?: number;
}

// ---------------------------------------------------------------------------
// Détection binaire
// ---------------------------------------------------------------------------

/** Un contenu est binaire s'il contient un octet nul (heuristique git). */
export function isBinary(content: string): boolean {
  return content.includes('\0');
}

// ---------------------------------------------------------------------------
// Diff ligne à ligne (LCS)
// ---------------------------------------------------------------------------

interface Op {
  type: 'context' | 'added' | 'deleted';
  content: string;
  oldNo: number | null;
  newNo: number | null;
}

function splitLines(content: string): string[] {
  // Contenu vide → aucune ligne. Sinon découpe sur \n (pas de ligne fantôme
  // pour un éventuel \n final : on garde le modèle simple du projet).
  if (content === '') return [];
  return content.split('\n');
}

/** Calcule la séquence d'opérations (context/added/deleted) via LCS. */
function computeOps(oldLines: string[], newLines: string[]): Op[] {
  const m = oldLines.length;
  const n = newLines.length;

  // dp[i][j] = longueur de la LCS de oldLines[i..] et newLines[j..]
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i]![j] = dp[i + 1]![j + 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
      }
    }
  }

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  let oldNo = 1;
  let newNo = 1;
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ type: 'context', content: oldLines[i]!, oldNo, newNo });
      i++;
      j++;
      oldNo++;
      newNo++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ type: 'deleted', content: oldLines[i]!, oldNo, newNo: null });
      i++;
      oldNo++;
    } else {
      ops.push({ type: 'added', content: newLines[j]!, oldNo: null, newNo });
      j++;
      newNo++;
    }
  }
  while (i < m) {
    ops.push({ type: 'deleted', content: oldLines[i]!, oldNo, newNo: null });
    i++;
    oldNo++;
  }
  while (j < n) {
    ops.push({ type: 'added', content: newLines[j]!, oldNo: null, newNo });
    j++;
    newNo++;
  }
  return ops;
}

/** Regroupe les ops en hunks avec `context` lignes de contexte. */
function buildHunks(ops: Op[], context: number): DiffHunk[] {
  const changeIdx: number[] = [];
  ops.forEach((op, k) => {
    if (op.type !== 'context') changeIdx.push(k);
  });
  if (changeIdx.length === 0) return [];

  // Plages [s, e] en indices d'ops, fusionnées si elles se touchent.
  const ranges: Array<{ s: number; e: number }> = [];
  for (const k of changeIdx) {
    const s = Math.max(0, k - context);
    const e = Math.min(ops.length - 1, k + context);
    const last = ranges[ranges.length - 1];
    if (last && s <= last.e + 1) {
      last.e = Math.max(last.e, e);
    } else {
      ranges.push({ s, e });
    }
  }

  const hunks: DiffHunk[] = [];
  for (const { s, e } of ranges) {
    const slice = ops.slice(s, e + 1);
    const lines: DiffLine[] = slice.map((op) => ({ type: op.type, content: op.content }));

    const oldNos = slice.filter((op) => op.oldNo !== null).map((op) => op.oldNo!);
    const newNos = slice.filter((op) => op.newNo !== null).map((op) => op.newNo!);

    const oldCount = oldNos.length;
    const newCount = newNos.length;
    // Si aucun côté ancien/nouveau, git utilise 0 comme position de départ.
    const oldStart = oldCount > 0 ? Math.min(...oldNos) : 0;
    const newStart = newCount > 0 ? Math.min(...newNos) : 0;

    hunks.push({ oldStart, oldCount, newStart, newCount, lines });
  }
  return hunks;
}

// ---------------------------------------------------------------------------
// Construction du DiffResult
// ---------------------------------------------------------------------------

const SHORT = (h: string): string => (h ? h.slice(0, 7) : '0000000');

function formatHunkHeader(h: DiffHunk): string {
  const oldPart = h.oldCount === 1 ? `${h.oldStart}` : `${h.oldStart},${h.oldCount}`;
  const newPart = h.newCount === 1 ? `${h.newStart}` : `${h.newStart},${h.newCount}`;
  return `@@ -${oldPart} +${newPart} @@`;
}

function formatFile(file: DiffFile): string[] {
  const out: string[] = [];
  out.push(`diff --git a/${file.path} b/${file.path}`);

  if (file.status === 'added') {
    out.push(`new file mode ${file.newMode ?? '100644'}`);
    out.push(`index 0000000..${SHORT(file.newHash ?? '')}`);
  } else if (file.status === 'deleted') {
    out.push(`deleted file mode ${file.oldMode ?? '100644'}`);
    out.push(`index ${SHORT(file.oldHash ?? '')}..0000000`);
  } else {
    out.push(
      `index ${SHORT(file.oldHash ?? '')}..${SHORT(file.newHash ?? '')} ${file.newMode ?? '100644'}`,
    );
  }

  if (file.binary) {
    out.push(`Binary files a/${file.path} and b/${file.path} differ`);
    return out;
  }

  out.push(file.status === 'added' ? '--- /dev/null' : `--- a/${file.path}`);
  out.push(file.status === 'deleted' ? '+++ /dev/null' : `+++ b/${file.path}`);

  for (const hunk of file.hunks) {
    out.push(formatHunkHeader(hunk));
    for (const line of hunk.lines) {
      const prefix = line.type === 'added' ? '+' : line.type === 'deleted' ? '-' : ' ';
      out.push(`${prefix}${line.content}`);
    }
  }
  return out;
}

/** Formate une liste de `DiffFile` en sortie texte git-compatible. */
export function formatFiles(files: DiffFile[]): string[] {
  const out: string[] = [];
  for (const file of files) {
    out.push(...formatFile(file));
  }
  return out;
}

/**
 * Calcule le diff complet entre deux côtés.
 * Les fichiers identiques (même hash) sont ignorés. Résultat trié par chemin.
 */
export function diffSides(
  oldSide: DiffSide,
  newSide: DiffSide,
  options: DiffOptions = {},
): DiffResult {
  const context = options.context ?? 3;
  const paths = Array.from(new Set([...Object.keys(oldSide), ...Object.keys(newSide)])).sort();

  const files: DiffFile[] = [];
  for (const path of paths) {
    const oldEntry = oldSide[path];
    const newEntry = newSide[path];

    // Inchangé → on saute.
    if (oldEntry && newEntry && oldEntry.hash === newEntry.hash) continue;

    let status: DiffFile['status'];
    if (!oldEntry) status = 'added';
    else if (!newEntry) status = 'deleted';
    else status = 'modified';

    const binary =
      (oldEntry && isBinary(oldEntry.content)) || (newEntry && isBinary(newEntry.content)) || false;

    let hunks: DiffHunk[] = [];
    if (!binary) {
      const oldLines = splitLines(oldEntry?.content ?? '');
      const newLines = splitLines(newEntry?.content ?? '');
      hunks = buildHunks(computeOps(oldLines, newLines), context);
    }

    files.push({
      path,
      status,
      oldMode: oldEntry?.mode,
      newMode: newEntry?.mode,
      oldHash: oldEntry?.hash,
      newHash: newEntry?.hash,
      binary,
      hunks,
    });
  }

  return { files, rawOutput: formatFiles(files) };
}
