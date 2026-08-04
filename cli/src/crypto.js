'use strict';
// Stesso identico formato/algoritmo usato dal sito web (index.html):
// PBKDF2 250.000 iterazioni SHA-256 -> chiave AES-GCM 256 bit.
// Usiamo il WebCrypto integrato in Node (>=18) cosi' il codice e' identico
// concettualmente a quello del browser e i file .vault sono intercambiabili.
const { webcrypto } = require('node:crypto');
const { subtle } = webcrypto;

const FORMAT = 'secure-vault-web';
// Iterazioni di default (usate solo se non viene passato un livello di
// sicurezza esplicito). Ogni vault salva le proprie iterazioni nel campo
// "iterations", quindi cambiare questo default non rompe i vault esistenti.
const DEFAULT_ITERATIONS = 250000;

function toBase64(buf) {
  return Buffer.from(buf).toString('base64');
}
function fromBase64(b64) {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

async function deriveKey(password, salt, keyLength = 256, iterations = DEFAULT_ITERATIONS) {
  const encoder = new TextEncoder();
  const baseKey = await subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: keyLength },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Cifra un buffer e produce l'oggetto .vault (stesso schema del sito web).
 * @param {Buffer|Uint8Array} fileBytes
 * @param {string} fileName
 * @param {string} mimeType
 * @param {string} password
 * @param {{expiresAt?: string|null, maxOpens?: number, keyLength?: number}} [options]
 */
async function encryptVault(fileBytes, fileName, mimeType, password, options = {}) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const keyLength = options.keyLength || 256;
  const iterations = options.iterations || DEFAULT_ITERATIONS;
  const key = await deriveKey(password, salt, keyLength, iterations);
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, key, fileBytes);
  return {
    version: 1,
    format: FORMAT,
    algorithm: 'AES-GCM',
    keyLength,
    iterations,
    securityLevel: options.securityLevel || null,
    id: webcrypto.randomUUID(),
    fileName,
    mimeType: mimeType || 'application/octet-stream',
    size: fileBytes.length,
    createdAt: new Date().toISOString(),
    expiresAt: options.expiresAt || null,
    maxOpens: options.maxOpens || 0,
    openCount: 0,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  };
}

/**
 * Decifra un oggetto .vault (identico a quello prodotto dal sito web).
 * @returns {Promise<Buffer>} contenuto originale del file
 */
async function decryptVault(vault, password) {
  if (vault.format !== FORMAT) throw new Error('File .vault non valido o non riconosciuto');
  const now = new Date();
  if (vault.expiresAt && new Date(vault.expiresAt) <= now) throw new Error('Questo vault e\u0300 scaduto');
  const maxOpens = Number(vault.maxOpens || 0);
  const openCount = Number(vault.openCount || 0);
  if (maxOpens > 0 && openCount >= maxOpens) throw new Error('Numero massimo di aperture raggiunto');

  const salt = fromBase64(vault.salt);
  const iv = fromBase64(vault.iv);
  // I vault creati prima dell'introduzione dei livelli di sicurezza non hanno
  // il campo "iterations": in quel caso si usa il vecchio default fisso.
  const iterations = vault.iterations || DEFAULT_ITERATIONS;
  const key = await deriveKey(password, salt, vault.keyLength, iterations);
  let plaintext;
  try {
    plaintext = await subtle.decrypt({ name: 'AES-GCM', iv }, key, fromBase64(vault.ciphertext));
  } catch {
    throw new Error('Password errata o file corrotto');
  }
  return Buffer.from(plaintext);
}

module.exports = { encryptVault, decryptVault, FORMAT };
