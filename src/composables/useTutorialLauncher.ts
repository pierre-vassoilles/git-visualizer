/**
 * Composable singleton pour contrôler l'ouverture du TutorialLauncherModal (spec 62).
 *
 * État partagé au niveau module : RefsSidebar (ouverture) et TutorialLauncherModal
 * (visibilité) utilisent la même référence sans passer par le store.
 * Conventions identiques à useTheme.ts (ref module-level, fonctions pures).
 */
import { ref } from 'vue';

const isOpen = ref(false);

function openTutorialLauncher(): void {
  isOpen.value = true;
}

function closeTutorialLauncher(): void {
  isOpen.value = false;
}

export function useTutorialLauncher() {
  return {
    isOpen,
    openTutorialLauncher,
    closeTutorialLauncher,
  };
}
