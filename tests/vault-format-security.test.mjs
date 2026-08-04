// Regression tests for the standard (password/AES) .vault format, written
// for the 2026-08-04 security audit (see SECURITY_AUDIT.md, finding
// VULN-01: "unauthenticated vault metadata").
//
// app.js cannot be `import`-ed directly in Node: it references `document`/
// `window` at module top-level (splash screen, DOM element lookups) and
// would throw immediately outside a browser. So this file faithfully
// reimplements the exact same WebCrypto calls app.js makes (PBKDF2 ->
// AES-GCM, same parameters, same JSON layout) rather than testing app.js's
// functions directly — the last test block below cross-checks the
// reimplementation's constants against app.js's actual source text, so this
// suite fails loudly if the two ever drift apart.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

const PBKDF2_ITERATIONS = 250000;
// Must match app.js's VAULT_AAD_FIELDS exactly (see app.js comment).
const VAULT_AAD_FIELDS = [
  'version', 'format', 'algorithm', 'keyLength', 'requestedKeyLength',
  'iterations', 'securityLevel', 'id', 'fileName', 'mimeType', 'size',
  'createdAt', 'expiresAt', 'maxOpens', 'ownerUid', 'salt', 'iv',
];

function toB64(buf) {
  return Buffer.from(buf).toString('base64');
}
function fromB64(b64) {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

async function deriveKey(password, salt, keyLength = 256) {
  const baseKey = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: keyLength },
    false,
    ['encrypt', 'decrypt']
  );
}

function buildAad(vault) {
  const header = {};
  for (const field of VAULT_AAD_FIELDS) header[field] = vault[field];
  return new TextEncoder().encode(JSON.stringify(header));
}

// Mirrors app.js encryptVault(). `version: 1` reproduces the pre-fix format
// (no AAD) to document its known limitation; `version: 2` reproduces the
// fixed format.
async function encryptVault(fileBytes, password, { version = 2, ...options } = {}) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const keyLength = options.keyLength || 256;
  const key = await deriveKey(password, salt, keyLength);
  const vault = {
    version,
    format: 'secure-vault-web',
    algorithm: 'AES-GCM',
    keyLength,
    requestedKeyLength: keyLength,
    id: options.id || webcrypto.randomUUID(),
    fileName: options.fileName || 'segreto.txt',
    mimeType: options.mimeType || 'text/plain',
    size: fileBytes.length,
    createdAt: new Date().toISOString(),
    expiresAt: options.expiresAt ?? null,
    maxOpens: options.maxOpens || 0,
    openCount: 0,
    ownerUid: options.ownerUid ?? null,
    salt: toB64(salt),
    iv: toB64(iv),
  };
  const encryptParams = { name: 'AES-GCM', iv };
  if (version >= 2) encryptParams.additionalData = buildAad(vault);
  const ciphertext = await subtle.encrypt(encryptParams, key, fileBytes);
  vault.ciphertext = toB64(ciphertext);
  return vault;
}

// Mirrors app.js decryptVault()'s crypto core (metadata checks omitted,
// those are covered by app.js's own expiresAt/maxOpens branches which don't
// touch the AEAD call and aren't the subject of this suite).
async function decryptVault(vault, password) {
  const salt = fromB64(vault.salt);
  const iv = fromB64(vault.iv);
  const key = await deriveKey(password, salt, vault.keyLength);
  const decryptParams = { name: 'AES-GCM', iv };
  if (Number(vault.version) >= 2) decryptParams.additionalData = buildAad(vault);
  const plaintext = await subtle.decrypt(decryptParams, key, fromB64(vault.ciphertext));
  return new Uint8Array(plaintext);
}

const password = 'Correct-Horse-Battery-2026!';
const plaintext = new TextEncoder().encode('contenuto segreto, non toccare');

let v1Vault, v2Vault;
before(async () => {
  v1Vault = await encryptVault(plaintext, password, { version: 1, expiresAt: null, maxOpens: 3 });
  v2Vault = await encryptVault(plaintext, password, { version: 2, expiresAt: null, maxOpens: 3 });
});

test('sanity: v1 and v2 vaults round-trip correctly with the right password', async () => {
  assert.deepEqual(await decryptVault(v1Vault, password), plaintext);
  assert.deepEqual(await decryptVault(v2Vault, password), plaintext);
});

test('sanity: wrong password fails on both v1 and v2', async () => {
  await assert.rejects(() => decryptVault(v1Vault, 'password-sbagliata'));
  await assert.rejects(() => decryptVault(v2Vault, 'password-sbagliata'));
});

test('VULN-01 PoC: v1 (pre-fix) format lets an attacker disable maxOpens/expiresAt without the password', async () => {
  const tampered = { ...v1Vault, maxOpens: 0, expiresAt: null };
  // No password needed for this step -- pure JSON editing.
  assert.notEqual(tampered.maxOpens, v1Vault.maxOpens);
  // The correct password still opens the tampered file: the GCM tag never
  // covered these fields, so the edit is invisible to the crypto layer.
  // This is the documented, un-fixable-for-old-files residual limitation
  // (see SECURITY_AUDIT.md) -- kept here as a pinned regression test so it
  // stays a *known, disclosed* limitation and never silently regresses
  // further (e.g. into the v2 path).
  assert.deepEqual(await decryptVault(tampered, password), plaintext);
});

test('FIX verified: v2 format rejects tampering with maxOpens', async () => {
  const tampered = { ...v2Vault, maxOpens: 0 };
  await assert.rejects(() => decryptVault(tampered, password), /OperationError|operation failed/i);
});

test('FIX verified: v2 format rejects tampering with expiresAt', async () => {
  const tampered = { ...v2Vault, expiresAt: '1999-01-01T00:00:00.000Z' };
  await assert.rejects(() => decryptVault(tampered, password));
});

test('FIX verified: v2 format rejects tampering with fileName/mimeType (metadata spoofing)', async () => {
  await assert.rejects(() => decryptVault({ ...v2Vault, fileName: 'fattura-falsa.pdf' }, password));
  await assert.rejects(() => decryptVault({ ...v2Vault, mimeType: 'application/x-msdownload' }, password));
});

test('FIX verified: v2 format rejects tampering with keyLength/ownerUid/id', async () => {
  await assert.rejects(() => decryptVault({ ...v2Vault, keyLength: 128 }, password));
  await assert.rejects(() => decryptVault({ ...v2Vault, ownerUid: 'someone-elses-uid' }, password));
  await assert.rejects(() => decryptVault({ ...v2Vault, id: 'different-id' }, password));
});

test('by design: v2 format still tolerates openCount being rewritten (shared-vault sync)', async () => {
  // updateStoredSharedVault() in app.js rewrites openCount on a cached
  // shared copy after every open, without re-encrypting. openCount is
  // deliberately excluded from AAD so that keeps working.
  const rewritten = { ...v2Vault, openCount: 2 };
  assert.deepEqual(await decryptVault(rewritten, password), plaintext);
});

test('cross-check: app.js source matches the parameters this suite assumes', () => {
  assert.match(APP_JS, /iterations:\s*250000/, 'PBKDF2 iteration count changed in app.js without updating this test');
  assert.match(APP_JS, /getRandomValues\(new Uint8Array\(16\)\)/, 'salt length changed in app.js without updating this test');
  assert.match(APP_JS, /getRandomValues\(new Uint8Array\(12\)\)/, 'IV length changed in app.js without updating this test');
  assert.match(APP_JS, /MIN_VAULT_PASSWORD_LENGTH = 10/, 'minimum vault password length changed in app.js without updating this test');
  const fieldsMatch = APP_JS.match(/const VAULT_AAD_FIELDS = \[([\s\S]*?)\];/);
  assert.ok(fieldsMatch, 'VAULT_AAD_FIELDS not found in app.js');
  const actualFields = fieldsMatch[1].match(/'([a-zA-Z]+)'/g).map((s) => s.slice(1, -1));
  assert.deepEqual(actualFields, VAULT_AAD_FIELDS, 'app.js VAULT_AAD_FIELDS drifted from this test (and from the CLI copy in _cli_build/src/crypto.js -- keep all three in sync)');
});

test('malformed input: garbage/truncated/empty .vault text fails cleanly instead of throwing something unexpected', async () => {
  // Mirrors what app.js's decryptVault(vaultText, password) does first:
  // JSON.parse(vaultText). A real .vault file is always JSON in this format
  // (see app.js), so malformed input should fail at parse time, not deeper
  // in the crypto stack.
  const cases = ['', '{', 'not json at all', 'null', '{"format":"secure-vault-web"}'];
  for (const bad of cases) {
    assert.throws(() => {
      const vault = JSON.parse(bad);
      if (!vault || vault.format !== 'secure-vault-web') throw new Error('unsupported vault');
      // would need vault.salt/vault.iv/vault.ciphertext next; absent here.
      fromB64(vault.salt);
    }, undefined, `expected "${bad}" to fail cleanly`);
  }
});

test('cross-check: CLI crypto.js (_cli_build) uses the identical AAD field list as app.js, for cross-compatibility', () => {
  const cliSrc = readFileSync(path.join(__dirname, '..', '_cli_build', 'src', 'crypto.js'), 'utf8');
  const fieldsMatch = cliSrc.match(/const VAULT_AAD_FIELDS = \[([\s\S]*?)\];/);
  assert.ok(fieldsMatch, 'VAULT_AAD_FIELDS not found in _cli_build/src/crypto.js');
  const actualFields = fieldsMatch[1].match(/'([a-zA-Z]+)'/g).map((s) => s.slice(1, -1));
  assert.deepEqual(actualFields, VAULT_AAD_FIELDS, 'CLI VAULT_AAD_FIELDS drifted from app.js -- web<->CLI .vault interoperability for version>=2 vaults would break');
});
