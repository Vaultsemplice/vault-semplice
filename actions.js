#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { Command } = require('commander');
const r2 = require('../src/r2');
const ui = require('../src/ui');
const actions = require('../src/actions');
const { listLevels, getLevel } = require('../src/security');
const { runInteractiveMenu } = require('../src/interactive');
const { registerAdvancedCommands } = require('../src/advanced');
const i18n = require('../src/i18n');
const { t } = i18n;

const VERSION = '2.0.1';
const CONFIG_DIR = path.join(process.env.HOME || process.env.USERPROFILE, '.vault-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const MIN_NODE_MAJOR = 18;

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Carica la config una volta e propaga le credenziali R2 come env vars.
let config = loadConfig();
function applyR2Env() {
  if (config.r2) {
    process.env.R2_ACCOUNT_ID = config.r2.accountId;
    process.env.R2_ACCESS_KEY_ID = config.r2.accessKeyId;
    process.env.R2_SECRET_ACCESS_KEY = config.r2.secretAccessKey;
    process.env.R2_BUCKET = config.r2.bucket;
  }
}
applyR2Env();

/* ---------------- Node.js version check ---------------- */

function checkNodeVersion() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < MIN_NODE_MAJOR) {
    ui.warn(t('node.tooOld', { version: process.versions.node, min: MIN_NODE_MAJOR }));
    ui.info(t('node.openingDownload'));
    try {
      const { execFile } = require('node:child_process');
      const url = 'https://nodejs.org/en/download';
      const platform = process.platform;
      if (platform === 'darwin') execFile('open', [url]);
      else if (platform === 'win32') execFile('cmd', ['/c', 'start', '""', url]);
      else execFile('xdg-open', [url]);
    } catch {
      ui.info(t('node.manualDownload'));
    }
    return false;
  }
  return true;
}

// Blocca subito l'esecuzione se la versione di Node.js e' troppo vecchia,
// invece di lasciare che un comando fallisca piu' avanti con un errore
// tecnico poco chiaro (es. API mancanti in webcrypto).
if (!checkNodeVersion()) {
  process.exit(1);
}

const program = new Command();
program.name('vault').description(t('desc.program')).version(VERSION);

/* ---------------- Login / Account ---------------- */

async function doLogin() {
  ui.info(t('free.login'));
  return true;
}

function doLogout() {
  ui.info(t('free.logout'));
}

function currentUserEmail() {
  return config.auth && config.auth.email ? config.auth.email : null;
}

async function requireAuth() {
  return true;
}

async function accountMenu() {
  ui.info(t('free.account'));
  await ui.selectMenu(t('menu.accountTitle'), [{ label: t('menu.back'), value: 'back' }]);
}

/* ---------------- Doctor ---------------- */

function runDoctor() {
  console.log(t('doctor.title'));
  try {
    const nodeVer = process.versions.node;
    const nodeOk = checkNodeVersion();
    if (nodeOk) ui.success(t('doctor.node', { version: nodeVer }));

    const npmVer = execSync('npm --version').toString().trim();
    ui.success(t('doctor.npm', { version: npmVer }));
    ui.success(t('doctor.config', {
      path: CONFIG_FILE,
      state: fs.existsSync(CONFIG_FILE) ? t('doctor.configPresent') : t('doctor.configMissing'),
    }));

    if (config.r2) ui.success(t('doctor.r2Configured'));
    else ui.warn(t('doctor.r2NotConfigured'));

    ui.info(t('doctor.account'));

    ui.success(t('doctor.permissions'));
    ui.success(t('doctor.systemReady'));
  } catch (err) {
    ui.error(t('doctor.problem', { message: err.message }));
  }
}

/* ---------------- Comando di default: interfaccia interattiva ---------------- */

program
  .command('start', { isDefault: true })
  .description(t('desc.start'))
  .action(async () => {
    await runInteractiveMenu({
      currentUser: currentUserEmail(),
      doctor: async () => runDoctor(),
      accountMenu,
    });
  });

/* ---------------- Language ---------------- */

program
  .command('lang [language]')
  .description(t('desc.lang'))
  .action((language) => {
    if (!language) {
      console.log(t('lang.current', { language: i18n.loadLanguage() }));
      console.log(t('lang.usage'));
      return;
    }
    try {
      i18n.setLanguage(language);
      ui.success(t('lang.changed', { language }));
    } catch (err) {
      ui.error(err.message);
      process.exit(1);
    }
  });

/* ---------------- Login / Logout / Whoami ---------------- */

program
  .command('login')
  .description(t('desc.login'))
  .action(async () => {
    await doLogin();
  });

program
  .command('logout')
  .description(t('desc.logout'))
  .action(() => {
    doLogout();
  });

program
  .command('whoami')
  .description(t('desc.whoami'))
  .action(() => {
    console.log(t('free.whoami'));
  });

/* ---------------- Vault: create / open / info ---------------- */

program
  .command('create <file>')
  .description(t('desc.create'))
  .option('-o, --output <path>', t('opt.output'))
  .option('-p, --password <password>', t('opt.password'))
  .option('--expires <isoDate>', t('opt.expires'))
  .option('--max-opens <n>', t('opt.maxOpens'), '0')
  .option('--security <livello>', t('opt.security'), 'standard')
  .option('--pdf', t('opt.pdf'))
  .action(async (file, opts) => {
    try {
      const level = getLevel(opts.security);
      const { outPath, pdfPath, bytesLength } = await actions.createVaultAction({
        file,
        output: opts.output,
        password: opts.password,
        expiresAt: opts.expires || null,
        maxOpens: Number(opts.maxOpens) || 0,
        securityLevelId: level.id,
        generatePdf: Boolean(opts.pdf),
      });
      ui.success(t('action.vaultCreated', { path: outPath, bytes: bytesLength, level: level.label }));
      if (pdfPath) ui.success(t('action.pdfGenerated', { path: pdfPath }));
    } catch (err) {
      ui.error(err.message);
      process.exit(1);
    }
  });

program
  .command('open <vaultFile>')
  .description(t('desc.open'))
  .option('-o, --output <path>', t('opt.outputOpen'))
  .option('-p, --password <password>', t('opt.password'))
  .action(async (vaultFile, opts) => {
    try {
      const { outPath } = await actions.openVaultAction({
        vaultFile,
        output: opts.output,
        password: opts.password,
      });
      ui.success(t('action.fileRestored', { path: outPath }));
    } catch (err) {
      ui.error(err.message);
      process.exit(1);
    }
  });

program
  .command('info <vaultFile>')
  .description(t('desc.info'))
  .action((vaultFile) => {
    try {
      console.log(JSON.stringify(actions.infoVaultAction(vaultFile), null, 2));
    } catch (err) {
      ui.error(err.message);
      process.exit(1);
    }
  });

program
  .command('security-levels')
  .description(t('desc.securityLevels'))
  .action(() => {
    listLevels().forEach((l) => {
      console.log(`${l.id}\t${l.label}\t${l.iterations} iterazioni\t${l.description}`);
    });
  });

/* ---------------- Management ---------------- */

program
  .command('update')
  .description(t('desc.update'))
  .action(() => {
    console.log('Controllo aggiornamenti...');
    const isWindows = process.platform === 'win32';
    try {
      if (isWindows) {
        execSync('irm https://vaultsemplice.com/download/install.ps1 | iex', { stdio: 'inherit', shell: 'powershell.exe' });
      } else {
        execSync('curl -fsSL https://vaultsemplice.com/download/install.sh | bash', { stdio: 'inherit' });
      }
    } catch (err) {
      ui.error('Errore durante l\'aggiornamento.');
      process.exit(1);
    }
  });

program
  .command('uninstall')
  .description(t('desc.uninstall'))
  .action(() => {
    console.log('Rimozione Vault CLI...');
    try {
      execSync('npm unlink -g vault', { stdio: 'inherit' });
      if (fs.existsSync(CONFIG_DIR)) {
        fs.rmSync(CONFIG_DIR, { recursive: true, force: true });
      }
      ui.success('Vault CLI rimossa correttamente.');
    } catch (err) {
      ui.error('Errore durante la disinstallazione.');
      process.exit(1);
    }
  });

program
  .command('doctor')
  .description(t('desc.doctor'))
  .action(() => {
    runDoctor();
  });

program
  .command('config')
  .description(t('desc.config'))
  .action(() => {
    console.log(JSON.stringify(loadConfig(), null, 2));
  });

program
  .command('cloud')
  .description(t('desc.cloud'))
  .option('--account <id>', 'Cloudflare Account ID')
  .option('--key <id>', 'Access Key ID')
  .option('--secret <key>', 'Secret Access Key')
  .option('--bucket <n>', 'Bucket Name')
  .action((opts) => {
    config.r2 = config.r2 || {};
    if (opts.account) config.r2.accountId = opts.account;
    if (opts.key) config.r2.accessKeyId = opts.key;
    if (opts.secret) config.r2.secretAccessKey = opts.secret;
    if (opts.bucket) config.r2.bucket = opts.bucket;
    saveConfig(config);
    applyR2Env();
    ui.success('Configurazione cloud aggiornata.');
  });

program
  .command('status')
  .description(t('desc.status'))
  .action(() => {
    console.log(t('status.version', { version: program.version() }));
    console.log(t('status.platform', { platform: process.platform }));
    console.log(t('status.directory', { directory: CONFIG_DIR }));
    console.log(t('status.account'));
  });

/* ---------------- Cloudflare R2 ---------------- */
const r2Cmd = program.command('r2').description('Interagisci con il bucket Cloudflare R2');
registerAdvancedCommands(program, ui);

r2Cmd
  .command('push <localFile> [remoteKey]')
  .description('Carica un file sul bucket R2')
  .action(async (localFile, remoteKey) => {
    try {
      const key = remoteKey || path.basename(localFile);
      const res = await r2.pushFile(localFile, key);
      ui.success(`Caricato su R2: ${res.key} (${res.size} byte)`);
    } catch (err) {
      ui.error(err.message);
      process.exit(1);
    }
  });

r2Cmd
  .command('pull <remoteKey>')
  .description('Scarica un file dal bucket R2')
  .option('-o, --output <path>', 'percorso locale di output')
  .action(async (remoteKey, opts) => {
    try {
      const outPath = opts.output || path.basename(remoteKey);
      const res = await r2.pullFile(remoteKey, outPath);
      ui.success(`Scaricato da R2: ${res.path} (${res.size} byte)`);
    } catch (err) {
      ui.error(err.message);
      process.exit(1);
    }
  });

r2Cmd
  .command('ls [prefix]')
  .description('Elenca i file nel bucket R2')
  .action(async (prefix) => {
    try {
      const files = await r2.listFiles(prefix || '');
      if (!files.length) { console.log('(nessun file trovato)'); return; }
      files.forEach((f) => console.log(`${f.key}\t${f.size} byte\t${new Date(f.modified).toLocaleString('it-IT')}`));
    } catch (err) {
      ui.error(err.message);
      process.exit(1);
    }
  });

r2Cmd
  .command('rm <remoteKey>')
  .description('Elimina un file dal bucket R2')
  .action(async (remoteKey) => {
    try {
      await r2.deleteFile(remoteKey);
      ui.success(`Eliminato da R2: ${remoteKey}`);
    } catch (err) {
      ui.error(err.message);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
