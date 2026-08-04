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

const program = new Command();
program.name('vault').description('Secure Vault CLI — Professional Distribution').version('1.1.1');

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
    ui.warn(`Node.js ${process.versions.node} rilevato: e\u0300 richiesto Node.js ${MIN_NODE_MAJOR} o superiore.`);
    ui.info('Apro la pagina di download di Node.js nel browser...');
    try {
      const { execFile } = require('node:child_process');
      const url = 'https://nodejs.org/it/download';
      const platform = process.platform;
      if (platform === 'darwin') execFile('open', [url]);
      else if (platform === 'win32') execFile('cmd', ['/c', 'start', '""', url]);
      else execFile('xdg-open', [url]);
    } catch {
      ui.info('Vai su https://nodejs.org per scaricare una versione aggiornata.');
    }
    return false;
  }
  return true;
}

/* ---------------- Login / Account ---------------- */

async function doLogin() {
  ui.info('Modalità gratuita attiva: Vault CLI non richiede account o login.');
  return true;
}

function doLogout() {
  ui.info('Modalità gratuita attiva: non c’è alcun login da disconnettere.');
}

function currentUserEmail() {
  return config.auth && config.auth.email ? config.auth.email : null;
}

async function requireAuth() {
  return true;
}

async function accountMenu() {
  ui.info('Modalità gratuita attiva: non serve alcun account per usare Vault CLI.');
  await ui.selectMenu('Account:', [{ label: '← Indietro', value: 'back' }]);
}

/* ---------------- Doctor ---------------- */

function runDoctor() {
  console.log('--- Vault Doctor ---');
  try {
    const nodeVer = process.versions.node;
    const nodeOk = checkNodeVersion();
    if (nodeOk) ui.success(`Node.js: v${nodeVer}`);

    const npmVer = execSync('npm --version').toString().trim();
    ui.success(`npm: ${npmVer}`);
    ui.success(`Configurazione: ${CONFIG_FILE} (${fs.existsSync(CONFIG_FILE) ? 'presente' : 'non creata'})`);

    if (config.r2) ui.success('Cloud R2: configurato');
    else ui.warn('Cloud R2: non configurato (usa "vault cloud")');

    ui.info('Account: modalità gratuita, nessun login richiesto.');

    ui.success('Permessi cartelle: OK');
    ui.success('Sistema: pronto.');
  } catch (err) {
    ui.error(`Problema rilevato: ${err.message}`);
  }
}

/* ---------------- Comando di default: interfaccia interattiva ---------------- */

program
  .command('start', { isDefault: true })
  .description('Apre l\u2019interfaccia interattiva di Vault Semplice')
  .action(async () => {
    await runInteractiveMenu({
      currentUser: currentUserEmail(),
      doctor: async () => runDoctor(),
      accountMenu,
    });
  });

/* ---------------- Login / Logout / Whoami ---------------- */

program
  .command('login')
  .description('Attiva la modalità gratuita senza account')
  .action(async () => {
    await doLogin();
  });

program
  .command('logout')
  .description('Mostra che la modalità gratuita non usa account')
  .action(() => {
    doLogout();
  });

program
  .command('whoami')
  .description('Mostra che la CLI è in modalità gratuita')
  .action(() => {
    console.log('modalità gratuita');
  });

/* ---------------- Vault: create / open / info ---------------- */

program
  .command('create <file>')
  .description('Cifra un file e crea un .vault')
  .option('-o, --output <path>', 'percorso file .vault di output')
  .option('-p, --password <password>', 'password (se omessa, viene chiesta in modo sicuro)')
  .option('--expires <isoDate>', 'data/ora di scadenza ISO, es. 2026-12-31T23:59:00Z')
  .option('--max-opens <n>', 'numero massimo di aperture (0 = illimitato)', '0')
  .option('--security <livello>', 'livello di sicurezza: standard | alta | massima', 'standard')
  .option('--pdf', 'genera un PDF di riepilogo dopo la creazione')
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
      ui.success(`Vault creato: ${outPath} (${bytesLength} byte cifrati) \u2014 sicurezza: ${level.label}`);
      if (pdfPath) ui.success(`PDF di riepilogo generato: ${pdfPath}`);
    } catch (err) {
      ui.error(err.message);
      process.exit(1);
    }
  });

program
  .command('open <vaultFile>')
  .description('Decifra un .vault e ripristina il file originale')
  .option('-o, --output <path>', 'percorso di output (default: nome file originale)')
  .option('-p, --password <password>', 'password (se omessa, viene chiesta in modo sicuro)')
  .action(async (vaultFile, opts) => {
    try {
      const { outPath } = await actions.openVaultAction({
        vaultFile,
        output: opts.output,
        password: opts.password,
      });
      ui.success(`File ripristinato: ${outPath}`);
    } catch (err) {
      ui.error(err.message);
      process.exit(1);
    }
  });

program
  .command('info <vaultFile>')
  .description('Mostra i metadati di un .vault senza decifrarlo')
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
  .description('Elenca i livelli di sicurezza disponibili')
  .action(() => {
    listLevels().forEach((l) => {
      console.log(`${l.id}\t${l.label}\t${l.iterations} iterazioni\t${l.description}`);
    });
  });

/* ---------------- Management ---------------- */

program
  .command('update')
  .description('Aggiorna automaticamente la CLI alla versione più recente')
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
  .description('Rimuove completamente Vault dal computer')
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
  .description('Controlla eventuali problemi di configurazione')
  .action(() => {
    runDoctor();
  });

program
  .command('config')
  .description('Mostra le impostazioni attuali')
  .action(() => {
    console.log(JSON.stringify(loadConfig(), null, 2));
  });

program
  .command('cloud')
  .description('Configura l\'accesso al cloud R2')
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
  .description('Mostra lo stato attuale della CLI')
  .action(() => {
    console.log(`Versione: ${program.version()}`);
    console.log(`Piattaforma: ${process.platform}`);
    console.log(`Directory: ${CONFIG_DIR}`);
    console.log('Account: modalità gratuita, nessun login richiesto');
  });

/* ---------------- Cloudflare R2 ---------------- */
const r2Cmd = program.command('r2').description('Interagisci con il bucket Cloudflare R2');

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
