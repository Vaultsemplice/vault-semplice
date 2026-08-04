// Reproducible PoC harness for SECURITY_AUDIT.md finding VULN-01.
// Generates real .vault sample files with a KNOWN password/content, then
// attacks ONLY those local samples (no network, no production data) to
// demonstrate the unauthenticated-metadata issue on the pre-fix (v1) format
// and confirm it's closed on the fixed (v2) format. Logs command/result/
// timing for every step, per the audit's methodology requirement.
//
// Run: node tests/generate-poc-vault-samples.mjs
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'fixtures');
import { mkdirSync } from 'node:fs';
mkdirSync(OUT_DIR, { recursive: true });

const KNOWN_PASSWORD = 'Password-Nota-Per-Il-Test-2026!';
const KNOWN_CONTENT = 'Questo è il contenuto segreto del file di prova. Non contiene dati reali.';

const VAULT_AAD_FIELDS = [
  'version', 'format', 'algorithm', 'keyLength', 'requestedKeyLength',
  'iterations', 'securityLevel', 'id', 'fileName', 'mimeType', 'size',
  'createdAt', 'expiresAt', 'maxOpens', 'ownerUid', 'salt', 'iv',
];

function toB64(b) { return Buffer.from(b).toString('base64'); }
function fromB64(s) { return new Uint8Array(Buffer.from(s, 'base64')); }
function buildAad(v) { const h = {}; for (const f of VAULT_AAD_FIELDS) h[f] = v[f]; return new TextEncoder().encode(JSON.stringify(h)); }

async function deriveKey(password, salt, keyLength) {
  const baseKey = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: keyLength }, false, ['encrypt', 'decrypt']);
}

async function encryptVault(bytes, password, version) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, 256);
  const vault = {
    version, format: 'secure-vault-web', algorithm: 'AES-GCM', keyLength: 256, requestedKeyLength: 256,
    id: webcrypto.randomUUID(), fileName: 'documento-riservato.txt', mimeType: 'text/plain', size: bytes.length,
    createdAt: new Date().toISOString(), expiresAt: '2026-08-05T00:00:00.000Z', maxOpens: 1, openCount: 0,
    ownerUid: null, salt: toB64(salt), iv: toB64(iv),
  };
  const params = { name: 'AES-GCM', iv };
  if (version >= 2) params.additionalData = buildAad(vault);
  vault.ciphertext = toB64(await subtle.encrypt(params, key, bytes));
  return vault;
}

async function decryptVault(vault, password) {
  const salt = fromB64(vault.salt);
  const iv = fromB64(vault.iv);
  const key = await deriveKey(password, salt, vault.keyLength);
  const params = { name: 'AES-GCM', iv };
  if (Number(vault.version) >= 2) params.additionalData = buildAad(vault);
  return new TextDecoder().decode(await subtle.decrypt(params, key, fromB64(vault.ciphertext)));
}

function log(step, fn) {
  const t0 = performance.now();
  return Promise.resolve(fn()).then((result) => {
    const ms = (performance.now() - t0).toFixed(2);
    console.log(`[${ms}ms] ${step}: ${result}`);
    return result;
  }, (err) => {
    const ms = (performance.now() - t0).toFixed(2);
    console.log(`[${ms}ms] ${step}: THREW -> ${err.message}`);
    throw err;
  });
}

const bytes = new TextEncoder().encode(KNOWN_CONTENT);

console.log('--- Campione noto ---');
console.log(`password: "${KNOWN_PASSWORD}"`);
console.log(`contenuto: "${KNOWN_CONTENT}"`);
console.log('');

console.log('--- Vault v1 (formato pre-fix) ---');
const v1 = await log('encryptVault(v1)', () => encryptVault(bytes, KNOWN_PASSWORD, 1));
writeFileSync(path.join(OUT_DIR, 'sample-v1-legacy.vault'), JSON.stringify(v1, null, 2));
console.log('scritto: tests/fixtures/sample-v1-legacy.vault');

const v1Tampered = { ...v1, maxOpens: 0, expiresAt: null };
writeFileSync(path.join(OUT_DIR, 'sample-v1-legacy-TAMPERED.vault'), JSON.stringify(v1Tampered, null, 2));
console.log('scritto: tests/fixtures/sample-v1-legacy-TAMPERED.vault (maxOpens e expiresAt alterati con un editor di testo, NESSUNA password richiesta per questo passo)');
await log('decryptVault(v1Tampered, KNOWN_PASSWORD) -- deve riuscire (vulnerabile)', async () => {
  const out = await decryptVault(v1Tampered, KNOWN_PASSWORD);
  if (out !== KNOWN_CONTENT) throw new Error('contenuto inatteso');
  return 'decifrato correttamente NONOSTANTE la manomissione -> VULN-01 confermata sul formato v1';
});
console.log('');

console.log('--- Vault v2 (formato con fix) ---');
const v2 = await log('encryptVault(v2)', () => encryptVault(bytes, KNOWN_PASSWORD, 2));
writeFileSync(path.join(OUT_DIR, 'sample-v2-fixed.vault'), JSON.stringify(v2, null, 2));
console.log('scritto: tests/fixtures/sample-v2-fixed.vault');

const v2Tampered = { ...v2, maxOpens: 0, expiresAt: null };
writeFileSync(path.join(OUT_DIR, 'sample-v2-fixed-TAMPERED.vault'), JSON.stringify(v2Tampered, null, 2));
console.log('scritto: tests/fixtures/sample-v2-fixed-TAMPERED.vault (stessa manomissione)');
try {
  await log('decryptVault(v2Tampered, KNOWN_PASSWORD) -- deve fallire (fix attivo)', async () => {
    await decryptVault(v2Tampered, KNOWN_PASSWORD);
    return 'ERRORE: decifrato nonostante la manomissione -- il fix NON funziona';
  });
} catch {
  console.log('   -> rifiuto corretto: il tag AES-GCM non verifica più, il fix è attivo.');
}
console.log('');
console.log('Ambiente: Node.js', process.version, '| node:crypto webcrypto | nessuna rete, nessun dato reale.');
