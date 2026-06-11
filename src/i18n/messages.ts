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
  | 'sidebar.undo'
  | 'sidebar.redo'
  | 'sidebar.export'
  | 'sidebar.import'
  | 'sidebar.exportDescriptionPrompt'
  | 'sidebar.importSuccess'
  | 'sidebar.importPartial'
  | 'sidebar.importReadError'
  | 'sidebar.exportDisabledTitle'
  | 'sidebar.share'
  | 'sidebar.shareCopied'
  | 'sidebar.shareLongWarning'
  | 'sidebar.shareTooBig'
  // Lien partageable (spec 59)
  | 'share.modalTitle'
  | 'share.modalCommandCount'
  | 'share.modalDate'
  | 'share.modalWarning'
  | 'share.load'
  | 'share.cancel'
  // Difficulté (scénarios / tutoriels)
  | 'difficulty.easy'
  | 'difficulty.medium'
  | 'difficulty.hard'
  // Niveaux de tutoriels (launcher)
  | 'sidebar.tutorialLevel.basic'
  | 'sidebar.tutorialLevel.medium'
  | 'sidebar.tutorialLevel.advanced'
  | 'sidebar.openTutorials'
  // Sections pédagogiques dans GuidedTutorialModal
  | 'tutorial.why'
  | 'tutorial.graphEffect'
  | 'tutorial.executeButton'
  // GuidedTutorialModal — chrome
  | 'tutorial.modalAriaLabel'
  | 'tutorial.completedTitle'
  | 'tutorial.recapStats'
  | 'tutorial.restart'
  | 'tutorial.close'
  | 'tutorial.stepCounter'
  | 'tutorial.hint'
  | 'tutorial.quit'
  | 'tutorial.back'
  | 'tutorial.skip'
  | 'tutorial.next'
  | 'tutorial.finish'
  // TutorialLauncherModal
  | 'tutorial.launcherAriaLabel'
  // GraphView
  | 'graph.ariaLabel'
  // ConflictEditorModal
  | 'conflict.title'
  | 'conflict.fileCount'
  | 'conflict.fileLabel'
  | 'conflict.multiNote'
  | 'conflict.ours'
  | 'conflict.theirs'
  | 'conflict.result'
  | 'conflict.keepOurs'
  | 'conflict.keepTheirs'
  | 'conflict.keepBoth'
  | 'conflict.editManually'
  | 'conflict.noConflict'
  | 'conflict.markResolved'
  | 'conflict.allResolved'
  | 'conflict.continue'
  | 'conflict.abort'
  // InteractiveRebaseModal
  | 'rebase.ariaLabel'
  | 'rebase.title'
  | 'rebase.helpSummary'
  | 'rebase.helpNote'
  | 'rebase.action.pick'
  | 'rebase.action.reword'
  | 'rebase.action.squash'
  | 'rebase.action.fixup'
  | 'rebase.action.drop'
  | 'rebase.action.edit'
  | 'rebase.empty'
  | 'rebase.errorTitle'
  | 'rebase.start'
  | 'rebase.abort'
  | 'rebase.actionForCommit'
  | 'rebase.messageForCommit'
  | 'rebase.moveUp'
  | 'rebase.moveDown'
  // CommandPalette — chrome
  | 'palette.ariaLabel'
  | 'palette.placeholder'
  | 'palette.searchAriaLabel'
  | 'palette.empty'
  | 'palette.foot'
  // CommandPalette — sections et libellés générés par le util
  | 'palette.section.recent'
  | 'palette.section.suggested'
  | 'palette.section.commands'
  | 'palette.section.scenarios'
  | 'palette.section.tutorials'
  | 'palette.section.actions'
  | 'palette.recentDesc'
  | 'palette.suggestedContinue'
  | 'palette.suggestedAbort'
  | 'palette.suggestedCommit'
  | 'palette.suggestedStatus'
  | 'palette.suggestedMerge'
  | 'palette.uiActionDesc'
  | 'palette.toggleTheme'
  | 'palette.resetRepo'
  | 'palette.scenarioPrefix'
  | 'palette.tutorialPrefix'
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
  'sidebar.undo',
  'sidebar.redo',
  'sidebar.export',
  'sidebar.import',
  'sidebar.exportDescriptionPrompt',
  'sidebar.importSuccess',
  'sidebar.importPartial',
  'sidebar.importReadError',
  'sidebar.exportDisabledTitle',
  'sidebar.share',
  'sidebar.shareCopied',
  'sidebar.shareLongWarning',
  'sidebar.shareTooBig',
  'share.modalTitle',
  'share.modalCommandCount',
  'share.modalDate',
  'share.modalWarning',
  'share.load',
  'share.cancel',
  'difficulty.easy',
  'difficulty.medium',
  'difficulty.hard',
  'sidebar.tutorialLevel.basic',
  'sidebar.tutorialLevel.medium',
  'sidebar.tutorialLevel.advanced',
  'sidebar.openTutorials',
  'tutorial.why',
  'tutorial.graphEffect',
  'tutorial.executeButton',
  'tutorial.modalAriaLabel',
  'tutorial.completedTitle',
  'tutorial.recapStats',
  'tutorial.restart',
  'tutorial.close',
  'tutorial.stepCounter',
  'tutorial.hint',
  'tutorial.quit',
  'tutorial.back',
  'tutorial.skip',
  'tutorial.next',
  'tutorial.finish',
  'tutorial.launcherAriaLabel',
  'graph.ariaLabel',
  'conflict.title',
  'conflict.fileCount',
  'conflict.fileLabel',
  'conflict.multiNote',
  'conflict.ours',
  'conflict.theirs',
  'conflict.result',
  'conflict.keepOurs',
  'conflict.keepTheirs',
  'conflict.keepBoth',
  'conflict.editManually',
  'conflict.noConflict',
  'conflict.markResolved',
  'conflict.allResolved',
  'conflict.continue',
  'conflict.abort',
  'rebase.ariaLabel',
  'rebase.title',
  'rebase.helpSummary',
  'rebase.helpNote',
  'rebase.action.pick',
  'rebase.action.reword',
  'rebase.action.squash',
  'rebase.action.fixup',
  'rebase.action.drop',
  'rebase.action.edit',
  'rebase.empty',
  'rebase.errorTitle',
  'rebase.start',
  'rebase.abort',
  'rebase.actionForCommit',
  'rebase.messageForCommit',
  'rebase.moveUp',
  'rebase.moveDown',
  'palette.ariaLabel',
  'palette.placeholder',
  'palette.searchAriaLabel',
  'palette.empty',
  'palette.foot',
  'palette.section.recent',
  'palette.section.suggested',
  'palette.section.commands',
  'palette.section.scenarios',
  'palette.section.tutorials',
  'palette.section.actions',
  'palette.recentDesc',
  'palette.suggestedContinue',
  'palette.suggestedAbort',
  'palette.suggestedCommit',
  'palette.suggestedStatus',
  'palette.suggestedMerge',
  'palette.uiActionDesc',
  'palette.toggleTheme',
  'palette.resetRepo',
  'palette.scenarioPrefix',
  'palette.tutorialPrefix',
  'op.merging',
  'op.rebasing',
  'op.cherryPicking',
  'op.reverting',
];
