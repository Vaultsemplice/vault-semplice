'use strict';
// Livelli di sicurezza selezionabili per la cifratura di un vault.
// Piu' alte le iterazioni PBKDF2, piu' lento (e costoso) e' un attacco a forza
// bruta sulla password — ma anche piu' lenta la cifratura/decifratura stessa.
// Il livello scelto viene salvato DENTRO al file .vault (campo "iterations"),
// quindi ogni vault resta apribile anche se in futuro cambi il default:
// la decifratura legge sempre le iterazioni del file, non quelle correnti.

const SECURITY_LEVELS = {
  standard: {
    id: 'standard',
    label: 'Standard',
    description: 'Veloce, adatto all\u2019uso quotidiano',
    iterations: 250000,
    keyLength: 256,
  },
  alta: {
    id: 'alta',
    label: 'Alta',
    description: 'Piu\u0300 lento, consigliato per dati sensibili',
    iterations: 600000,
    keyLength: 256,
  },
  massima: {
    id: 'massima',
    label: 'Massima',
    description: 'Molto lento, massima resistenza a forza bruta',
    iterations: 1200000,
    keyLength: 256,
  },
};

const DEFAULT_LEVEL = 'standard';

function listLevels() {
  return Object.values(SECURITY_LEVELS);
}

function getLevel(idOrLabel) {
  if (!idOrLabel) return SECURITY_LEVELS[DEFAULT_LEVEL];
  const key = String(idOrLabel).trim().toLowerCase();
  const found = Object.values(SECURITY_LEVELS).find(
    (l) => l.id === key || l.label.toLowerCase() === key
  );
  if (!found) {
    throw new Error(
      `Livello di sicurezza sconosciuto: "${idOrLabel}". Valori validi: ${Object.keys(SECURITY_LEVELS).join(', ')}`
    );
  }
  return found;
}

// Dato un numero di iterazioni salvato in un vecchio .vault, prova a capire
// a quale livello corrisponde (solo per scopi informativi in "vault info").
function levelFromIterations(iterations) {
  const match = Object.values(SECURITY_LEVELS).find((l) => l.iterations === iterations);
  return match ? match.label : `Personalizzato (${iterations} iterazioni)`;
}

module.exports = { SECURITY_LEVELS, DEFAULT_LEVEL, listLevels, getLevel, levelFromIterations };
