/**
 * Rendu ASCII de l'historique (`git log --graph`) — PUR, testable headless.
 *
 * Algorithme de suivi de colonnes (à la `git log --graph`) : chaque colonne
 * « attend » un hash de commit ; on dessine `*` sur la colonne du commit, `|`
 * pour les colonnes actives, et des connecteurs `\` (bifurcation de merge) /
 * `/` (convergence de branches). Caractères ASCII uniquement.
 *
 * L'ordre d'entrée DOIT être « enfants avant parents » (topologique descendant).
 */

export interface AsciiCommit {
  hash: string;
  shortHash: string;
  message: string;
  parents: string[];
  author: string;
  date: number;
}

export interface RenderGraphAsciiOptions {
  /** Commits triés enfants-avant-parents (plus récents en tête). */
  commits: AsciiCommit[];
  /** Décorations par hash (ex. ['HEAD -> main', 'tag: v1', 'feature']). */
  refsByHash: Map<string, string[]>;
  /** Format long (Author/Date/message indenté) si true, sinon --oneline. */
  verbose: boolean;
  /** Formatte une date Unix (injecté pour rester pur). */
  formatDate: (timestamp: number) => string;
}

/** Construit la décoration ` (HEAD -> main, tag: v1)` ou '' pour un hash. */
function decorate(refsByHash: Map<string, string[]>, hash: string): string {
  const labels = refsByHash.get(hash);
  if (!labels || labels.length === 0) return '';
  return ` (${labels.join(', ')})`;
}

/** Joint les cellules de colonnes par un espace (ex. ['*','|'] → "* |"). */
function joinCells(cells: string[]): string {
  return cells.join(' ');
}

export function renderGraphAscii(options: RenderGraphAsciiOptions): string[] {
  const { commits, refsByHash, verbose, formatDate } = options;
  const lines: string[] = [];

  // columns[i] = hash que la colonne i attend, ou null (colonne libre).
  const columns: Array<string | null> = [];

  const allocColumn = (hash: string): number => {
    const free = columns.indexOf(null);
    if (free !== -1) {
      columns[free] = hash;
      return free;
    }
    columns.push(hash);
    return columns.length - 1;
  };

  for (const c of commits) {
    // Convergence : plusieurs colonnes attendent ce commit → on les fusionne
    // dans la 1ʳᵉ, en émettant une ligne de connexion avec des '/'.
    const matching = columns.flatMap((h, i) => (h === c.hash ? [i] : []));
    let col: number;
    if (matching.length === 0) {
      col = allocColumn(c.hash); // nouveau tip
    } else {
      col = matching[0]!;
      if (matching.length > 1) {
        const extras = matching.slice(1);
        const mergeCells = columns.map((h, i) => {
          if (i === col) return '|';
          if (extras.includes(i)) return '/';
          return h !== null ? '|' : ' ';
        });
        lines.push(joinCells(mergeCells).replace(/\s+$/, ''));
        for (const e of extras) columns[e] = null;
      }
    }

    // Ligne du commit : '*' sur sa colonne, '|' sur les colonnes actives.
    const commitCells = columns.map((h, i) => {
      if (i === col) return '*';
      return h !== null ? '|' : ' ';
    });
    const graphPrefix = joinCells(commitCells);
    const deco = decorate(refsByHash, c.hash);
    const firstLine = c.message.split('\n')[0] ?? c.message;

    if (!verbose) {
      lines.push(`${graphPrefix} ${c.shortHash}${deco} ${firstLine}`.replace(/\s+$/, ''));
    } else {
      lines.push(`${graphPrefix} commit ${c.hash}${deco}`.replace(/\s+$/, ''));
      // Lignes de continuation : la colonne du commit redevient '|'.
      const contCells = columns.map((h, i) => (i === col ? '|' : h !== null ? '|' : ' '));
      const contPrefix = joinCells(contCells);
      lines.push(`${contPrefix} Author: ${c.author}`.replace(/\s+$/, ''));
      lines.push(`${contPrefix} Date:   ${formatDate(c.date)}`.replace(/\s+$/, ''));
      lines.push(contPrefix.replace(/\s+$/, ''));
      for (const m of c.message.split('\n')) {
        lines.push(`${contPrefix}     ${m}`.replace(/\s+$/, ''));
      }
    }

    // Mise à jour des colonnes pour les parents du commit.
    const parents = c.parents;
    if (parents.length === 0) {
      columns[col] = null; // racine
    } else {
      columns[col] = parents[0]!;
      // Parents supplémentaires (merge) → nouvelles colonnes + connecteur '\'.
      const extraCols: number[] = [];
      for (let p = 1; p < parents.length; p++) {
        const ph = parents[p]!;
        let pc = columns.indexOf(ph);
        if (pc === -1) pc = allocColumn(ph);
        extraCols.push(pc);
      }
      if (extraCols.length > 0) {
        const mergeCells = columns.map((h, i) => {
          if (i === col) return '|';
          if (extraCols.includes(i)) return '\\';
          return h !== null ? '|' : ' ';
        });
        lines.push(joinCells(mergeCells).replace(/\s+$/, ''));
      }
    }
  }

  return lines;
}
