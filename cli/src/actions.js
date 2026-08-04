'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { encryptVault, decryptVault } = require('./crypto');
const { promptPassword } = require('./prompt');
const { getLevel, listLevels, levelFromIterations, DEFAULT_LEVEL } = require('./security');
const { generateRecapPdf } = require('./pdfRecap');
const ui = require('./ui');

function mimeFromExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.txt': 'text/plain', '.json': 'application/json', '.zip': 'application/zip',
    '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * Chiede in modo interattivo: numero massimo di aperture.
 * Ritorna 0 per "illimitato".
 */
async function askMaxOpens() {
  const value = await ui.selectMenu('Numero massimo di aperture del vault:', [
    { label: 'Illimitate', value: 0 },
    { label: '1 apertura', value: 1 },
    { label: '2 aperture', value: 2 },
    { label: '3 aperture', value: 3 },
    { label: '4 aperture', value: 4 },
    { label: 'Personalizzato...', value: 'custom' },
  ]);
  if (value !== 'custom') return value;
  const raw = await ui.ask('Quante aperture massime vuoi consentire?', '1');
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/** Chiede in modo interattivo la data di scadenza. Ritorna ISO string o null. */
async function askExpiry() {
  const choice = await ui.selectMenu('Scadenza del vault:', [
    { label: 'Nessuna scadenza', value: 'none' },
    { label: 'Tra 1 giorno', value: 1 },
    { label: 'Tra 7 giorni', value: 7 },
    { label: 'Tra 30 giorni', value: 30 },
    { label: 'Data personalizzata...', value: 'custom' },
  ]);
  if (choice === 'none') return null;
  if (choice === 'custom') {
    const raw = await ui.ask('Data/ora di scadenza (es. 2026-12-31T23:59:00Z)');
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) throw new Error('Data non valida');
    return d.toISOString();
  }
  const d = new Date(Date.now() + choice * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

/** Chiede in modo interattivo il livello di sicurezza. */
async function askSecurityLevel() {
  const levels = listLevels();
  const value = await ui.selectMenu('Livello di sicurezza:', levels.map((l) => ({
    label: l.label,
    value: l.id,
    hint: `${l.description} \u2014 ${l.iterations.toLocaleString('it-IT')} iterazioni`,
  })));
  return getLevel(value);
}

/**
 * Crea un vault. Opzioni condivise da comando CLI e menu interattivo.
 * @param {object} opts
 *  file, output, password, expiresAt, maxOpens, securityLevelId, generatePdf
 */
async function createVaultAction(opts) {
  const file = opts.file;
  if (!fs.existsSync(file)) throw new Error(`File non trovato: ${file}`);

  const password = opts.password || (await promptPassword('Imposta una password: '));
  if (!password) throw new Error('Password vuota non consentita');

  const level = getLevel(opts.securityLevelId || DEFAULT_LEVEL);
  const bytes = fs.readFileSync(file);
  const vault = await encryptVault(bytes, path.basename(file), mimeFromExt(file), password, {
    expiresAt: opts.expiresAt || null,
    maxOpens: Number(opts.maxOpens) || 0,
    iterations: level.iterations,
    keyLength: level.keyLength,
    securityLevel: level.id,
  });

  const outPath = opts.output || `${file}.vault`;
  fs.writeFileSync(outPath, JSON.stringify(vault));

  let pdfPath = null;
  if (opts.generatePdf) {
    pdfPath = `${outPath}.recap.pdf`;
    await generateRecapPdf(vault, { vaultPath: outPath, securityLevelLabel: level.label }, pdfPath);
  }

  return { vault, outPath, pdfPath, bytesLength: bytes.length };
}

/**
 * Apre (decifra) un vault.
 * @param {object} opts vaultFile, output, password
 */
async function openVaultAction(opts) {
  const vaultFile = opts.vaultFile;
  if (!fs.existsSync(vaultFile)) throw new Error(`File non trovato: ${vaultFile}`);
  const vault = JSON.parse(fs.readFileSync(vaultFile, 'utf8'));
  const password = opts.password || (await promptPassword('Password: '));

  const plaintext = await decryptVault(vault, password);
  const outPath = opts.output || vault.fileName || 'output.bin';
  fs.writeFileSync(outPath, plaintext);

  vault.openCount = (vault.openCount || 0) + 1;
  fs.writeFileSync(vaultFile, JSON.stringify(vault));

  return { vault, outPath };
}

function infoVaultAction(vaultFile) {
  const vault = JSON.parse(fs.readFileSync(vaultFile, 'utf8'));
  return {
    fileName: vault.fileName,
    mimeType: vault.mimeType,
    size: vault.size,
    createdAt: vault.createdAt,
    expiresAt: vault.expiresAt,
    maxOpens: vault.maxOpens,
    openCount: vault.openCount,
    securityLevel: vault.securityLevel ? getLevel(vault.securityLevel).label : levelFromIterations(vault.iterations),
    algorithm: `AES-GCM-${vault.keyLength || 256} (PBKDF2, ${vault.iterations || 250000} iterazioni)`,
  };
}

module.exports = {
  mimeFromExt,
  askMaxOpens,
  askExpiry,
  askSecurityLevel,
  createVaultAction,
  openVaultAction,
  infoVaultAction,
};
