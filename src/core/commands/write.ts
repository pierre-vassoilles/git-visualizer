import { fail, ok, type CommandResult } from '../types';
import type { Repository } from '../model';

/**
 * write <filepath> [content]
 *
 * Utilitaire virtuel : crée ou écrase un fichier dans le working tree.
 * Sans contenu → fichier vide.
 */
export function cmdWrite(
  repo: Repository,
  filepath: string,
  content: string,
): CommandResult {
  if (!isValidPath(filepath)) {
    return fail([`error: invalid path '${filepath}'`]);
  }

  repo.workingTree[filepath] = { content, mode: '100644' };
  return ok();
}

/**
 * read <filepath>
 *
 * Affiche le contenu du fichier, ligne par ligne.
 */
export function cmdRead(repo: Repository, filepath: string): CommandResult {
  if (!isValidPath(filepath)) {
    return fail([`error: invalid path '${filepath}'`]);
  }

  const entry = repo.workingTree[filepath];
  if (!entry) {
    return fail([`error: file not found: '${filepath}'`]);
  }

  const lines = entry.content.split('\n');
  // Supprimer la dernière ligne vide si le contenu se termine par \n
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  return ok(lines);
}

/**
 * Valide un chemin de fichier virtuel.
 * Rejette : chemin absolu, segments ".." ou ".", doubles slashs.
 */
function isValidPath(filepath: string): boolean {
  if (!filepath) return false;
  if (filepath.startsWith('/')) return false;
  if (filepath.includes('..')) return false;
  if (filepath.includes('//')) return false;
  // Rejeter les segments "." (ex. "./foo")
  const parts = filepath.split('/');
  for (const part of parts) {
    if (part === '' || part === '.') return false;
  }
  return true;
}
