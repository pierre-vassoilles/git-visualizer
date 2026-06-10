/**
 * Clés de message i18n (spec 55).
 *
 * Union type-safe de toutes les clés de traduction utilisées par l'UI.
 * `t(key)` est ainsi vérifié à la compilation (TS strict) et l'IDE complète
 * les clés valides. Les deux dictionnaires (`locales/fr.json`, `locales/en.json`)
 * DOIVENT couvrir exactement cet ensemble — un test de parité le vérifie.
 *
 * Frontière stricte : SEULS les libellés d'interface sont traduits. Les messages
 * d'erreur du moteur Git (`CommandResult.fail`) restent en anglais (fidèles au
 * vrai git) et ne passent jamais par `t()`.
 */
export type MessageKey =
  // Topbar / app
  | 'app.subtitle'
  | 'ui.language'
  // ThemeSwitcher
  | 'theme.label'
  | 'theme.light'
  | 'theme.dark'
  | 'theme.auto'
  // GraphView
  | 'graph.local'
  | 'graph.split'
  | 'graph.remote'
  | 'graph.syncZoomPan'
  | 'graph.animations'
  | 'graph.animationsDisabledHint'
  | 'graph.placeholderTitle'
  | 'graph.initHint'
  | 'graph.noCommits'
  | 'graph.remoteTitle'
  | 'graph.noRemoteCommits'
  | 'graph.remoteSuffix'
  // GraphView context menu
  | 'ctx.checkout'
  | 'ctx.resetSoft'
  | 'ctx.resetMixed'
  | 'ctx.resetHard'
  | 'ctx.revert'
  | 'ctx.cherryPick'
  | 'ctx.tag'
  | 'ctx.copyHash'
  | 'ctx.confirmResetSoft'
  | 'ctx.confirmResetMixed'
  | 'ctx.confirmResetHard'
  | 'ctx.promptTagName'
  // RefsSidebar
  | 'sidebar.ariaLabel'
  | 'sidebar.branches'
  | 'sidebar.noBranches'
  | 'sidebar.currentBranch'
  | 'sidebar.checkoutTitle'
  | 'sidebar.head'
  | 'sidebar.headAriaLabel'
  | 'sidebar.detached'
  | 'sidebar.tags'
  | 'sidebar.checkoutTagTitle'
  | 'sidebar.operation'
  | 'sidebar.branchLabel'
  | 'sidebar.continue'
  | 'sidebar.abort'
  | 'sidebar.stash'
  | 'sidebar.stashEntries'
  | 'sidebar.recentCommands'
  | 'sidebar.noCommands'
  | 'sidebar.reset'
  | 'sidebar.confirmReset'
  | 'sidebar.remote'
  | 'sidebar.upToDate'
  | 'sidebar.gone'
  | 'sidebar.noUpstream'
  | 'sidebar.fetch'
  | 'sidebar.push'
  | 'sidebar.pull'
  | 'sidebar.detachedPushAlert'
  | 'sidebar.detachedPullAlert'
  | 'sidebar.scenarios'
  | 'sidebar.load'
  | 'sidebar.confirmScenario'
  | 'sidebar.tutorials'
  | 'sidebar.start'
  | 'sidebar.confirmTutorial'
  | 'sidebar.stepsAndDuration'
  | 'sidebar.export'
  | 'sidebar.import'
  | 'sidebar.exportDescriptionPrompt'
  | 'sidebar.importSuccess'
  | 'sidebar.importPartial'
  | 'sidebar.importReadError'
  | 'sidebar.exportDisabledTitle'
  // Difficulté (scénarios / tutoriels)
  | 'difficulty.easy'
  | 'difficulty.medium'
  | 'difficulty.hard'
  // Opérations en cours
  | 'op.merging'
  | 'op.rebasing'
  | 'op.cherryPicking'
  | 'op.reverting';

/** Liste figée des clés — sert au test de parité FR/EN. */
export const MESSAGE_KEYS: readonly MessageKey[] = [
  'app.subtitle',
  'ui.language',
  'theme.label',
  'theme.light',
  'theme.dark',
  'theme.auto',
  'graph.local',
  'graph.split',
  'graph.remote',
  'graph.syncZoomPan',
  'graph.animations',
  'graph.animationsDisabledHint',
  'graph.placeholderTitle',
  'graph.initHint',
  'graph.noCommits',
  'graph.remoteTitle',
  'graph.noRemoteCommits',
  'graph.remoteSuffix',
  'ctx.checkout',
  'ctx.resetSoft',
  'ctx.resetMixed',
  'ctx.resetHard',
  'ctx.revert',
  'ctx.cherryPick',
  'ctx.tag',
  'ctx.copyHash',
  'ctx.confirmResetSoft',
  'ctx.confirmResetMixed',
  'ctx.confirmResetHard',
  'ctx.promptTagName',
  'sidebar.ariaLabel',
  'sidebar.branches',
  'sidebar.noBranches',
  'sidebar.currentBranch',
  'sidebar.checkoutTitle',
  'sidebar.head',
  'sidebar.headAriaLabel',
  'sidebar.detached',
  'sidebar.tags',
  'sidebar.checkoutTagTitle',
  'sidebar.operation',
  'sidebar.branchLabel',
  'sidebar.continue',
  'sidebar.abort',
  'sidebar.stash',
  'sidebar.stashEntries',
  'sidebar.recentCommands',
  'sidebar.noCommands',
  'sidebar.reset',
  'sidebar.confirmReset',
  'sidebar.remote',
  'sidebar.upToDate',
  'sidebar.gone',
  'sidebar.noUpstream',
  'sidebar.fetch',
  'sidebar.push',
  'sidebar.pull',
  'sidebar.detachedPushAlert',
  'sidebar.detachedPullAlert',
  'sidebar.scenarios',
  'sidebar.load',
  'sidebar.confirmScenario',
  'sidebar.tutorials',
  'sidebar.start',
  'sidebar.confirmTutorial',
  'sidebar.stepsAndDuration',
  'sidebar.export',
  'sidebar.import',
  'sidebar.exportDescriptionPrompt',
  'sidebar.importSuccess',
  'sidebar.importPartial',
  'sidebar.importReadError',
  'sidebar.exportDisabledTitle',
  'difficulty.easy',
  'difficulty.medium',
  'difficulty.hard',
  'op.merging',
  'op.rebasing',
  'op.cherryPicking',
  'op.reverting',
];
