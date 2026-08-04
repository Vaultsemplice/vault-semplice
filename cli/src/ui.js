'use strict';
const readline = require('node:readline');
const figlet = require('figlet');

// Colori ANSI semplici, nessuna dipendenza esterna (funzionano su tutti i
// terminali moderni, Windows Terminal incluso da Win10 in poi).
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

function c(color, text) {
  if (process.env.NO_COLOR) return text;
  return `${colors[color] || ''}${text}${colors.reset}`;
}

function printBanner(subtitle) {
  console.log('');
  const big = figlet.textSync('VAULT', { font: 'ANSI Shadow' });
  const small = figlet.textSync('SEMPLICE', { font: 'Small' });
  big.split('\n').forEach((line) => console.log(c('cyan', line)));
  small.split('\n').forEach((line) => console.log(c('bold', c('green', line))));
  console.log(c('gray', `  ${subtitle || 'cifra, proteggi, condividi'}`));
  console.log('');
}

function printDivider() {
  console.log(c('gray', '\u2500'.repeat(50)));
}

/** Chiede una riga di testo normale (visibile) da terminale. */
function ask(question, defaultValue) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const suffix = defaultValue ? c('gray', ` (${defaultValue})`) : '';
    rl.question(`${question}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

/** Chiede conferma sì/no. Ritorna un booleano. */
async function confirm(question, defaultYes = true) {
  const hint = defaultYes ? 'S/n' : 's/N';
  const answer = (await ask(`${question} [${hint}]`)).toLowerCase();
  if (!answer) return defaultYes;
  return answer.startsWith('s') || answer.startsWith('y');
}

/**
 * Menu numerato semplice: mostra le opzioni, l'utente digita il numero.
 * options: [{ label, value, hint? }]
 */
async function selectMenu(title, options) {
  console.log('');
  if (title) console.log(c('bold', title));
  options.forEach((opt, i) => {
    const hint = opt.hint ? c('gray', `  \u2014 ${opt.hint}`) : '';
    console.log(`  ${c('cyan', String(i + 1))}. ${opt.label}${hint}`);
  });
  console.log('');

  while (true) {
    const raw = await ask('Scegli un\u2019opzione (numero)');
    const idx = Number(raw) - 1;
    if (Number.isInteger(idx) && idx >= 0 && idx < options.length) {
      return options[idx].value;
    }
    console.log(c('red', 'Scelta non valida, riprova.'));
  }
}

function success(msg) {
  console.log(c('green', `\u2713 ${msg}`));
}
function error(msg) {
  console.error(c('red', `\u2717 ${msg}`));
}
function info(msg) {
  console.log(c('blue', `\u2139 ${msg}`));
}
function warn(msg) {
  console.log(c('yellow', `\u26A0 ${msg}`));
}

module.exports = { c, colors, printBanner, printDivider, ask, confirm, selectMenu, success, error, info, warn };
