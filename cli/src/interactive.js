'use strict';
const ui = require('./ui');
const actions = require('./actions');
const r2 = require('./r2');

async function interactiveCreate() {
  const file = await ui.ask('Percorso del file da cifrare');
  if (!file) return;
  const maxOpens = await actions.askMaxOpens();
  const expiresAt = await actions.askExpiry();
  const level = await actions.askSecurityLevel();
  const generatePdf = await ui.confirm('Generare un PDF di riepilogo alla fine?', true);

  try {
    const { outPath, pdfPath, bytesLength } = await actions.createVaultAction({
      file,
      maxOpens,
      expiresAt,
      securityLevelId: level.id,
      generatePdf,
    });
    ui.success(`Vault creato: ${outPath} (${bytesLength} byte cifrati)`);
    if (pdfPath) ui.success(`PDF di riepilogo generato: ${pdfPath}`);
  } catch (err) {
    ui.error(err.message);
  }
}

async function interactiveOpen() {
  const vaultFile = await ui.ask('Percorso del file .vault da aprire');
  if (!vaultFile) return;
  try {
    const { outPath } = await actions.openVaultAction({ vaultFile });
    ui.success(`File ripristinato: ${outPath}`);
  } catch (err) {
    ui.error(err.message);
  }
}

async function interactiveInfo() {
  const vaultFile = await ui.ask('Percorso del file .vault');
  if (!vaultFile) return;
  try {
    const info = actions.infoVaultAction(vaultFile);
    console.log(JSON.stringify(info, null, 2));
  } catch (err) {
    ui.error(err.message);
  }
}

async function interactiveCloud() {
  const action = await ui.selectMenu('Cloud R2:', [
    { label: 'Carica un file (push)', value: 'push' },
    { label: 'Scarica un file (pull)', value: 'pull' },
    { label: 'Elenca i file (ls)', value: 'ls' },
    { label: 'Elimina un file (rm)', value: 'rm' },
    { label: '\u2190 Indietro', value: 'back' },
  ]);
  try {
    if (action === 'push') {
      const localFile = await ui.ask('File locale da caricare');
      const key = await ui.ask('Chiave remota (invio = nome file)');
      const res = await r2.pushFile(localFile, key || require('node:path').basename(localFile));
      ui.success(`Caricato su R2: ${res.key} (${res.size} byte)`);
    } else if (action === 'pull') {
      const remoteKey = await ui.ask('Chiave remota da scaricare');
      const output = await ui.ask('Percorso locale di output (invio = nome file)');
      const res = await r2.pullFile(remoteKey, output || require('node:path').basename(remoteKey));
      ui.success(`Scaricato da R2: ${res.path} (${res.size} byte)`);
    } else if (action === 'ls') {
      const prefix = await ui.ask('Prefisso (invio = tutti)');
      const files = await r2.listFiles(prefix || '');
      if (!files.length) console.log('(nessun file trovato)');
      files.forEach((f) => console.log(`${f.key}\t${f.size} byte\t${new Date(f.modified).toLocaleString('it-IT')}`));
    } else if (action === 'rm') {
      const remoteKey = await ui.ask('Chiave remota da eliminare');
      await r2.deleteFile(remoteKey);
      ui.success(`Eliminato da R2: ${remoteKey}`);
    }
  } catch (err) {
    ui.error(err.message);
  }
}

/**
 * Ciclo del menu principale interattivo. `ctx` fornisce funzioni di
 * supporto passate dal CLI principale (whoami, logout, doctor).
 */
async function runInteractiveMenu(ctx) {
  ui.printBanner();
  if (ctx.currentUser) ui.info(`Accesso effettuato come ${ctx.currentUser}`);

  while (true) {
    const choice = await ui.selectMenu('Cosa vuoi fare?', [
      { label: 'Crea un nuovo vault', value: 'create', hint: 'cifra un file' },
      { label: 'Apri un vault', value: 'open', hint: 'decifra un file' },
      { label: 'Info su un vault', value: 'info' },
      { label: 'Cloud R2', value: 'cloud', hint: 'push / pull / ls / rm' },
      { label: 'Diagnostica sistema', value: 'doctor' },
      { label: 'Esci', value: 'exit' },
    ]);

    ui.printDivider();
    if (choice === 'create') await interactiveCreate();
    else if (choice === 'open') await interactiveOpen();
    else if (choice === 'info') await interactiveInfo();
    else if (choice === 'cloud') await interactiveCloud();
    else if (choice === 'doctor') await ctx.doctor();
    else if (choice === 'exit') {
      console.log('A presto!');
      return;
    }
    ui.printDivider();
  }
}

module.exports = { runInteractiveMenu };
