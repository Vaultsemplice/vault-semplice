'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { encryptVault, decryptVault } = require('./crypto');
const { promptPassword } = require('./prompt');

function walk(root, base = root) {
  const stat = fs.statSync(root);
  if (stat.isFile()) return [{ source: root, name: path.relative(base, root) || path.basename(root), stat }];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name);
    return entry.isDirectory() ? walk(full, base) : [{ source: full, name: path.relative(base, full), stat: fs.statSync(full) }];
  });
}

function normalizeName(name) {
  const normalized = String(name).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').includes('..')) throw new Error(`Percorso non valido: ${name}`);
  return normalized;
}

function keyMaterial(password, keyFile) {
  if (!keyFile) return password;
  if (!fs.existsSync(keyFile)) throw new Error(`Key file non trovato: ${keyFile}`);
  const digest = crypto.createHash('sha512').update(fs.readFileSync(keyFile)).digest('hex');
  return `${password}\u0000keyfile:${digest}`;
}

function packEntries(inputs) {
  const seen = new Set();
  const entries = [];
  for (const input of inputs) {
    if (!fs.existsSync(input)) throw new Error(`File o cartella non trovato: ${input}`);
    const stat = fs.statSync(input);
    const base = stat.isDirectory() ? path.dirname(path.resolve(input)) : path.dirname(path.resolve(input));
    for (const item of walk(path.resolve(input), base)) {
      let name = normalizeName(item.name);
      if (seen.has(name)) name = normalizeName(`${path.basename(input)}-${Date.now()}-${path.basename(name)}`);
      seen.add(name);
      entries.push({
        name,
        size: item.stat.size,
        modifiedAt: item.stat.mtime.toISOString(),
        sha256: crypto.createHash('sha256').update(fs.readFileSync(item.source)).digest('hex'),
        data: fs.readFileSync(item.source).toString('base64'),
      });
    }
  }
  return entries;
}

function encodeArchive(entries, metadata = {}) {
  const raw = Buffer.from(JSON.stringify({ format: 'vault-semplice-archive', version: 2, entries, metadata }), 'utf8');
  return zlib.gzipSync(raw, { level: 9 });
}

function decodeArchive(buffer) {
  let data;
  try { data = JSON.parse(zlib.gunzipSync(buffer).toString('utf8')); } catch { throw new Error('Il vault non contiene un archivio v2 valido'); }
  if (data.format !== 'vault-semplice-archive' || !Array.isArray(data.entries)) throw new Error('Archivio v2 non riconosciuto');
  return data;
}

async function readArchive(vaultFile, password, keyFile) {
  if (!fs.existsSync(vaultFile)) throw new Error(`Vault non trovato: ${vaultFile}`);
  const vault = JSON.parse(fs.readFileSync(vaultFile, 'utf8'));
  const secret = keyMaterial(password || await promptPassword('Password: '), keyFile);
  return { vault, secret, archive: decodeArchive(await decryptVault(vault, secret)) };
}

async function writeArchive(vaultFile, archive, secret, originalVault = {}, options = {}) {
  const packed = encodeArchive(archive.entries, archive.metadata);
  const vault = await encryptVault(packed, path.basename(vaultFile, '.vault'), 'application/x-vault-archive', secret, {
    iterations: originalVault.iterations,
    keyLength: originalVault.keyLength,
    securityLevel: originalVault.securityLevel,
    expiresAt: originalVault.expiresAt,
    maxOpens: originalVault.maxOpens,
    ...options,
  });
  vault.archiveVersion = 2;
  vault.entryCount = archive.entries.length;
  fs.writeFileSync(vaultFile, JSON.stringify(vault));
  return vault;
}

async function createArchive(inputs, opts = {}) {
  const password = opts.password || await promptPassword('Imposta una password: ');
  if (!password) throw new Error('Password vuota non consentita');
  const secret = keyMaterial(password, opts.keyFile);
  const entries = packEntries(inputs);
  const output = opts.output || `${path.basename(inputs[0])}.vault`;
  const archive = { entries, metadata: { createdAt: new Date().toISOString(), tags: opts.tags || [], favorites: [] } };
  await writeArchive(output, archive, secret, {}, opts.crypto || {});
  return { output, entries, originalBytes: entries.reduce((n, e) => n + e.size, 0), vaultBytes: fs.statSync(output).size };
}

function safeOutput(root, name) {
  const base = path.resolve(root);
  const output = path.resolve(base, normalizeName(name));
  if (output !== base && !output.startsWith(`${base}${path.sep}`)) throw new Error('Percorso di estrazione non sicuro');
  return output;
}

function extractEntries(archive, outputDir, filter = '') {
  const query = filter.toLowerCase();
  const selected = archive.entries.filter((e) => !query || e.name.toLowerCase().includes(query));
  for (const entry of selected) {
    const output = safeOutput(outputDir, entry.name);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, Buffer.from(entry.data, 'base64'));
  }
  return selected;
}

function verifyEntries(archive) {
  return archive.entries.map((entry) => ({
    name: entry.name,
    ok: crypto.createHash('sha256').update(Buffer.from(entry.data, 'base64')).digest('hex') === entry.sha256,
  }));
}

module.exports = { createArchive, readArchive, writeArchive, packEntries, extractEntries, verifyEntries, keyMaterial };
