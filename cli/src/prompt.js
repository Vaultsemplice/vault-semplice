'use strict';
const readline = require('node:readline');

/**
 * Chiede una password da terminale senza mostrarla (mascherata con *).
 */
function promptPassword(question = 'Password: ') {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const stdin = process.stdin;
    let value = '';

    process.stdout.write(question);
    stdin.setRawMode && stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const onData = (char) => {
      char = char.toString();
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004': // Ctrl+D
          stdin.setRawMode && stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          rl.close();
          resolve(value);
          break;
        case '\u0003': // Ctrl+C
          stdin.setRawMode && stdin.setRawMode(false);
          rl.close();
          reject(new Error('Annullato'));
          process.exit(1);
          break;
        case '\u007f': // Backspace
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          break;
        default:
          value += char;
          process.stdout.write('*');
          break;
      }
    };
    stdin.on('data', onData);
  });
}

module.exports = { promptPassword };
