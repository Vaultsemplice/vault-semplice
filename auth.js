'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const arc = require('./archive');
const { promptPassword } = require('./prompt');

function table(entries) {
  if (!entries.length) return console.log('(nessun file)');
  entries.forEach((e, i) => console.log(`${String(i + 1).padStart(3)}  ${String(e.size).padStart(10)} B  ${e.name}`));
}
function fail(ui, e) { ui.error(e.message); process.exitCode = 1; }
function authOptions(cmd) { return cmd.option('-p, --password <password>').option('-k, --key-file <path>'); }
function strength(v) {
  return Math.min(100, Math.min(40, v.length * 3) + (/[a-z]/.test(v) ? 12 : 0) + (/[A-Z]/.test(v) ? 12 : 0) + (/\d/.test(v) ? 12 : 0) + (/[^\w]/.test(v) ? 16 : 0) + (v.length >= 16 ? 8 : 0));
}

function registerAdvancedCommands(program, ui) {
  authOptions(program.command('folder <folder>').description('Cifra una cartella intera in un vault v2 compresso').option('-o, --output <path>'))
    .action(async (folder, o) => { try { const r = await arc.createArchive([folder], o); ui.success(`Creato ${r.output}: ${r.entries.length} file`); } catch (e) { fail(ui, e); } });
  authOptions(program.command('pack <files...>').description('Crea un archivio cifrato da file e cartelle').option('-o, --output <path>'))
    .action(async (files, o) => { try { const r = await arc.createArchive(files, o); ui.success(`Creato ${r.output}: ${r.entries.length} file`); } catch (e) { fail(ui, e); } });

  const readCommand = (signature, description, fn) => authOptions(program.command(signature).description(description)).action(async (vaultFile, o) => {
    try { await fn(await arc.readArchive(vaultFile, o.password, o.keyFile), vaultFile, o); } catch (e) { fail(ui, e); }
  });
  readCommand('list <vaultFile>', 'Vault Explorer: visualizza i file senza estrarli', async (r) => table(r.archive.entries));
  readCommand('tree <vaultFile>', 'Mostra albero di cartelle e file', async (r) => r.archive.entries.map((e) => e.name).sort().forEach((n) => console.log(n.split('/').map((p, i, a) => `${'  '.repeat(i)}${i === a.length - 1 ? '└─' : '├─'} ${p}`).join('\n'))));
  readCommand('stats <vaultFile>', 'Statistiche dettagliate del vault', async (r, file) => console.log(JSON.stringify({ file, elements: r.archive.entries.length, originalBytes: r.archive.entries.reduce((n, e) => n + e.size, 0), vaultBytes: fs.statSync(file).size, tags: r.archive.metadata.tags || [], favorites: r.archive.metadata.favorites || [] }, null, 2)));
  readCommand('verify <vaultFile>', 'Verifica integrità SHA-256 del vault', async (r) => { const v = arc.verifyEntries(r.archive); v.forEach((x) => console.log(`${x.ok ? '✓' : '✗'} ${x.name}`)); if (v.some((x) => !x.ok)) throw new Error('Integrità non valida'); ui.success('Integrità verificata'); });

  authOptions(program.command('search <vaultFile> <query>').description('Ricerca istantanea dei file')).action(async (file, q, o) => { try { table((await arc.readArchive(file, o.password, o.keyFile)).archive.entries.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))); } catch (e) { fail(ui, e); } });
  authOptions(program.command('extract <vaultFile>').description('Estrae file e cartelle').option('-o, --output <dir>', 'output', '.').option('--filter <text>')).action(async (file, o) => { try { const r = await arc.readArchive(file, o.password, o.keyFile); const list = arc.extractEntries(r.archive, o.output, o.filter); ui.success(`Estratti ${list.length} file`); } catch (e) { fail(ui, e); } });
  authOptions(program.command('add <vaultFile> <files...>').description('Aggiunge file a un vault esistente')).action(async (file, files, o) => { try { const r = await arc.readArchive(file, o.password, o.keyFile); r.archive.entries.push(...arc.packEntries(files)); await arc.writeArchive(file, r.archive, r.secret, r.vault); ui.success('Vault aggiornato'); } catch (e) { fail(ui, e); } });

  async function mutate(file, o, fn) { const r = await arc.readArchive(file, o.password, o.keyFile); fn(r.archive); await arc.writeArchive(file, r.archive, r.secret, r.vault); }
  authOptions(program.command('remove <vaultFile> <name>').description('Elimina un file dal vault')).action(async (file, name, o) => { try { await mutate(file, o, (a) => { const n = a.entries.length; a.entries = a.entries.filter((e) => e.name !== name); if (a.entries.length === n) throw new Error('File non trovato'); }); ui.success('File eliminato'); } catch (e) { fail(ui, e); } });
  authOptions(program.command('rename <vaultFile> <oldName> <newName>').description('Rinomina un file nel vault')).action(async (file, oldName, newName, o) => { try { await mutate(file, o, (a) => { const x = a.entries.find((e) => e.name === oldName); if (!x) throw new Error('File non trovato'); x.name = newName.replace(/\\/g, '/'); }); ui.success('File rinominato'); } catch (e) { fail(ui, e); } });
  authOptions(program.command('rekey <vaultFile>').description('Cambia password senza ricreare il vault').option('--new-password <password>').option('--new-key-file <path>')).action(async (file, o) => { try { const r = await arc.readArchive(file, o.password, o.keyFile); const pw = o.newPassword || await promptPassword('Nuova password: '); await arc.writeArchive(file, r.archive, arc.keyMaterial(pw, o.newKeyFile), r.vault); ui.success('Credenziali aggiornate'); } catch (e) { fail(ui, e); } });

  program.command('hash <file>').description('Calcola SHA-256 e SHA-512').action((file) => { const d = fs.readFileSync(file); console.log(`SHA-256 ${crypto.createHash('sha256').update(d).digest('hex')}\nSHA-512 ${crypto.createHash('sha512').update(d).digest('hex')}`); });
  program.command('password').description('Genera password e misura la forza').option('-l, --length <n>', 'lunghezza', '24').option('--check <password>').action((o) => { const v = o.check || crypto.randomBytes(Math.max(12, +o.length)).toString('base64url').slice(0, +o.length); console.log(`${v}\nForza: ${strength(v)}/100`); });
  program.command('benchmark').description('Benchmark AES e compressione').action(() => { const d = crypto.randomBytes(8 * 1024 * 1024), key = crypto.randomBytes(32), iv = crypto.randomBytes(12); let t = performance.now(); const c = crypto.createCipheriv('aes-256-gcm', key, iv); Buffer.concat([c.update(d), c.final()]); const aes = performance.now() - t; t = performance.now(); require('node:zlib').gzipSync(d); const zip = performance.now() - t; console.log(`AES-256-GCM ${(8 / (aes / 1000)).toFixed(1)} MiB/s\nGZIP ${(8 / (zip / 1000)).toFixed(1)} MiB/s`); });
  program.command('vaults [folder]').description('Elenca tutti i vault').action((folder = '.') => fs.readdirSync(folder).filter((x) => x.endsWith('.vault')).forEach((x) => console.log(path.resolve(folder, x))));
  program.command('secure-delete <file>').description('Sovrascrive e rimuove il file originale').option('--yes').action((file, o) => { if (!o.yes) throw new Error('Aggiungi --yes per confermare'); const n = fs.statSync(file).size, fd = fs.openSync(file, 'r+'); fs.writeSync(fd, crypto.randomBytes(n)); fs.fsyncSync(fd); fs.closeSync(fd); fs.unlinkSync(file); ui.success('File eliminato in sicurezza'); });
}
module.exports = { registerAdvancedCommands, strength };
