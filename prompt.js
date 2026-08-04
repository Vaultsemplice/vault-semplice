'use strict';
const ui = require('./ui');
const actions = require('./actions');
const r2 = require('./r2');
const i18n = require('./i18n');
const { t } = i18n;

async function interactiveCreate() {
  const file = await ui.ask(t('interactive.askFileToEncrypt'));
  if (!file) return;
  const maxOpens = await actions.askMaxOpens();
  const expiresAt = await actions.askExpiry();
  const level = await actions.askSecurityLevel();
  const generatePdf = await ui.confirm(t('interactive.confirmPdf'), true);

  try {
    const { outPath, pdfPath, bytesLength } = await actions.createVaultAction({
      file,
      maxOpens,
      expiresAt,
      securityLevelId: level.id,
      generatePdf,
    });
    ui.success(t('action.vaultCreated', { path: outPath, bytes: bytesLength, level: level.label }));
    if (pdfPath) ui.success(t('action.pdfGenerated', { path: pdfPath }));
  } catch (err) {
    ui.error(err.message);
  }
}

async function interactiveOpen() {
  const vaultFile = await ui.ask(t('interactive.askVaultToOpen'));
  if (!vaultFile) return;
  try {
    const { outPath } = await actions.openVaultAction({ vaultFile });
    ui.success(t('action.fileRestored', { path: outPath }));
  } catch (err) {
    ui.error(err.message);
  }
}

async function interactiveInfo() {
  const vaultFile = await ui.ask(t('interactive.askVaultPath'));
  if (!vaultFile) return;
  try {
    const info = actions.infoVaultAction(vaultFile);
    console.log(JSON.stringify(info, null, 2));
  } catch (err) {
    ui.error(err.message);
  }
}

async function interactiveCloud() {
  const action = await ui.selectMenu(t('interactive.cloudTitle'), [
    { label: t('interactive.cloudPush'), value: 'push' },
    { label: t('interactive.cloudPull'), value: 'pull' },
    { label: t('interactive.cloudLs'), value: 'ls' },
    { label: t('interactive.cloudRm'), value: 'rm' },
    { label: t('menu.back'), value: 'back' },
  ]);
  try {
    if (action === 'push') {
      const localFile = await ui.ask(t('interactive.askLocalFileUpload'));
      const key = await ui.ask(t('interactive.askRemoteKeyOptional'));
      const res = await r2.pushFile(localFile, key || require('node:path').basename(localFile));
      ui.success(t('interactive.uploadedToR2', { key: res.key, bytes: res.size }));
    } else if (action === 'pull') {
      const remoteKey = await ui.ask(t('interactive.askRemoteKeyDownload'));
      const output = await ui.ask(t('interactive.askOutputPathOptional'));
      const res = await r2.pullFile(remoteKey, output || require('node:path').basename(remoteKey));
      ui.success(t('interactive.downloadedFromR2', { path: res.path, bytes: res.size }));
    } else if (action === 'ls') {
      const prefix = await ui.ask(t('interactive.askPrefixOptional'));
      const files = await r2.listFiles(prefix || '');
      if (!files.length) console.log(t('interactive.noFilesFound'));
      files.forEach((f) => console.log(`${f.key}\t${f.size} byte\t${new Date(f.modified).toLocaleString('it-IT')}`));
    } else if (action === 'rm') {
      const remoteKey = await ui.ask(t('interactive.askRemoteKeyDelete'));
      await r2.deleteFile(remoteKey);
      ui.success(t('interactive.deletedFromR2', { key: remoteKey }));
    }
  } catch (err) {
    ui.error(err.message);
  }
}

async function interactiveLanguage() {
  const choice = await ui.selectMenu(t('lang.current', { language: i18n.loadLanguage() }), [
    { label: 'English', value: 'en' },
    { label: 'Italiano', value: 'it' },
    { label: t('menu.back'), value: 'back' },
  ]);
  if (choice === 'back') return;
  i18n.setLanguage(choice);
  ui.success(t('lang.changed', { language: choice }));
}

/**
 * Ciclo del menu principale interattivo. `ctx` fornisce funzioni di
 * supporto passate dal CLI principale (whoami, logout, doctor).
 */
async function runInteractiveMenu(ctx) {
  ui.printBanner();
  console.log(ui.c('bold', `  ${t('interactive.dashboardTitle')}`));
  console.log(ui.c('gray', `  ${t('interactive.dashboardSubtitle')}`));
  if (ctx.currentUser) ui.info(t('interactive.loggedInAs', { email: ctx.currentUser }));

  while (true) {
    const choice = await ui.selectMenu(t('interactive.menuTitle'), [
      { label: t('interactive.menuCreate'), value: 'create', hint: t('interactive.menuCreateHint') },
      { label: t('interactive.menuOpen'), value: 'open', hint: t('interactive.menuOpenHint') },
      { label: t('interactive.menuInfo'), value: 'info' },
      { label: t('interactive.menuExplorer'), value: 'explorer', hint: t('interactive.menuExplorerHint') },
      { label: t('interactive.menuTools'), value: 'tools', hint: t('interactive.menuToolsHint') },
      { label: t('interactive.menuCloud'), value: 'cloud', hint: t('interactive.menuCloudHint') },
      { label: t('interactive.menuDoctor'), value: 'doctor' },
      { label: t('interactive.menuLang'), value: 'lang' },
      { label: t('interactive.menuExit'), value: 'exit' },
    ]);

    ui.printDivider();
    if (choice === 'create') await interactiveCreate();
    else if (choice === 'open') await interactiveOpen();
    else if (choice === 'info') await interactiveInfo();
    else if (choice === 'explorer') {
      ui.info(t('interactive.explorerInfo'));
    }
    else if (choice === 'tools') {
      ui.info(t('interactive.toolsInfo'));
    }
    else if (choice === 'cloud') await interactiveCloud();
    else if (choice === 'doctor') await ctx.doctor();
    else if (choice === 'lang') await interactiveLanguage();
    else if (choice === 'exit') {
      console.log(t('interactive.goodbye'));
      return;
    }
    ui.printDivider();
  }
}

module.exports = { runInteractiveMenu };
