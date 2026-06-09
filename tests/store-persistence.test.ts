/**
 * Tests Phase 6 : persistance au niveau du store Pinia.
 *
 * Couvre le chemin réel boot → loadFromStorage → rejeu → snapshot, la distinction
 * savedCommands (persistées) vs history (saisie ↑/↓), resetStorage, et la cohérence
 * de executeScenario avec le storage (CA-persist-01/05/06/07/08/12).
 *
 * jsdom fournit localStorage dans l'environnement Vitest.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useRepoStore } from '@/stores/repo';

const STORAGE_KEY = 'git-visualizer:history';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('Store — persistance localStorage', () => {
  it('CA-persist-08 : ne persiste que les commandes réussies', () => {
    const store = useRepoStore();
    store.execute('git init');
    store.execute('git commit'); // échoue : rien à committer / pas de message

    expect(store.savedCommands).toContain('git init');
    expect(store.savedCommands).not.toContain('git commit');
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.commands).toEqual(['git init']);
  });

  it('CA-persist-12 : une commande échouée avant init ne persiste rien', () => {
    const store = useRepoStore();
    store.execute('git status'); // pas de dépôt → échec
    expect(store.savedCommands).toHaveLength(0);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('savedCommands (persistance) et history (↑/↓) sont distincts', () => {
    const store = useRepoStore();
    store.execute('git init');
    store.execute('git bogus'); // sous-commande inconnue → history mais pas savedCommands

    expect(store.history).toContain('git bogus');
    expect(store.savedCommands).not.toContain('git bogus');
  });

  it('CA-persist-01/05 : loadFromStorage rejoue et restaure le snapshot', () => {
    // 1re session : on construit un état
    const s1 = useRepoStore();
    s1.execute('git init');
    s1.execute('write a.txt "contenu"');
    s1.execute('git add a.txt');
    s1.execute('git commit -m "C1"');
    s1.execute('git branch feature');
    const before = s1.snapshot;
    expect(before.commits.length).toBe(1);
    const beforeHash = before.commits[0]!.hash;

    // 2e session : nouveau store, rejeu depuis localStorage
    setActivePinia(createPinia());
    const s2 = useRepoStore();
    s2.loadFromStorage();

    expect(s2.snapshot.commits.length).toBe(1);
    // Déterminisme : même hash après rejeu
    expect(s2.snapshot.commits[0]!.hash).toBe(beforeHash);
    expect(Object.keys(s2.snapshot.branches).sort()).toEqual(['feature', 'main']);
  });

  it('CA-persist-06 : le rejeu s\'arrête au premier échec réel', () => {
    // On force un historique avec une commande invalide au milieu
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: '1.0', commands: ['git init', 'git bogus', 'write a.txt "x"'], lastSaved: 0 }),
    );
    const store = useRepoStore();
    store.loadFromStorage();

    // "git init" rejoué ; "git bogus" stoppe le rejeu ; "write" non atteint
    expect(store.snapshot.initialized).toBe(true);
    expect(store.savedCommands).toEqual(['git init']);
  });

  it('un état conflictuel (merge en cours) survit au rechargement', () => {
    const s1 = useRepoStore();
    [
      'git init',
      'write data.txt "base"',
      'git add data.txt',
      'git commit -m "C1"',
      'git branch feature',
      'git checkout feature',
      'write data.txt "feature"',
      'git add data.txt',
      'git commit -m "C2"',
      'git checkout main',
      'write data.txt "main"',
      'git add data.txt',
      'git commit -m "C3"',
      'git merge feature -m "merge"', // conflit → exitCode != 0 mais operationState merging
    ].forEach((c) => s1.execute(c));

    expect(s1.snapshot.operationState?.type).toBe('merging');
    // la commande de merge conflictuel doit avoir été persistée
    expect(s1.savedCommands).toContain('git merge feature -m "merge"');

    // rechargement
    setActivePinia(createPinia());
    const s2 = useRepoStore();
    s2.loadFromStorage();
    expect(s2.snapshot.operationState?.type).toBe('merging');
  });

  it('CA-persist-07 : resetStorage purge localStorage et le moteur', () => {
    const store = useRepoStore();
    store.execute('git init');
    store.execute('write a.txt "x"');
    store.execute('git add a.txt');
    store.execute('git commit -m "C1"');
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    store.resetStorage();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(store.savedCommands).toHaveLength(0);
    expect(store.snapshot.initialized).toBe(false);
  });

  it('executeScenario persiste sa séquence (reproduite au rechargement)', () => {
    const s1 = useRepoStore();
    // session précédente quelconque
    s1.execute('git init');
    s1.execute('write old.txt "x"');

    s1.executeScenario('branch-merge');
    const branchesAfter = Object.keys(s1.snapshot.branches).sort();
    expect(branchesAfter).toContain('feature');
    expect(branchesAfter).toContain('main');

    // le storage doit refléter le scénario, pas l'ancienne session
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.commands).not.toContain('write old.txt "x"');
    expect(stored.commands[0]).toBe('git init');

    // rechargement → même état que le scénario
    setActivePinia(createPinia());
    const s2 = useRepoStore();
    s2.loadFromStorage();
    expect(Object.keys(s2.snapshot.branches).sort()).toEqual(branchesAfter);
  });

  it('executeScenario sur un id inconnu ne jette pas', () => {
    const store = useRepoStore();
    expect(() => store.executeScenario('does-not-exist')).not.toThrow();
  });
});
