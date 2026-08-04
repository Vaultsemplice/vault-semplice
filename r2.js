'use strict';
// Genera un PDF di riepilogo dopo la creazione di un vault.
// NOTA DI SICUREZZA: il PDF NON contiene mai la password. Un riepilogo con la
// password dentro vanificherebbe la cifratura (chiunque apra il PDF potrebbe
// aprire anche il vault). Il PDF serve solo come "ricevuta" con i metadati.
const PDFDocument = require('pdfkit');
const fs = require('node:fs');

function fmtDate(iso) {
  if (!iso) return 'Nessuna';
  try {
    return new Date(iso).toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/**
 * @param {object} vault - oggetto vault appena creato (da crypto.encryptVault)
 * @param {object} meta - { vaultPath, securityLevelLabel }
 * @param {string} outPath - dove salvare il PDF
 */
function generateRecapPdf(vault, meta, outPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 56 });
      const stream = fs.createWriteStream(outPath);
      doc.pipe(stream);

      doc.fontSize(22).fillColor('#0F6E56').text('Vault Semplice', { continued: false });
      doc.fontSize(12).fillColor('#5F5E5A').text('Riepilogo creazione vault cifrato');
      doc.moveDown(1.2);
      doc.strokeColor('#D3D1C7').lineWidth(1).moveTo(56, doc.y).lineTo(539, doc.y).stroke();
      doc.moveDown(1.2);

      const row = (label, value) => {
        doc.fontSize(10).fillColor('#888780').text(label);
        doc.fontSize(13).fillColor('#2C2C2A').text(String(value));
        doc.moveDown(0.7);
      };

      row('Nome file originale', vault.fileName);
      row('File vault generato', meta.vaultPath);
      row('ID vault', vault.id);
      row('Dimensione originale', `${vault.size} byte`);
      row('Data creazione', fmtDate(vault.createdAt));
      row('Scadenza', fmtDate(vault.expiresAt));
      row(
        'Aperture massime',
        vault.maxOpens && vault.maxOpens > 0 ? `${vault.maxOpens}` : 'Illimitate'
      );
      row('Livello di sicurezza', meta.securityLevelLabel || 'Standard');
      row('Algoritmo', `AES-GCM ${vault.keyLength || 256} bit, PBKDF2 ${vault.iterations} iterazioni`);

      doc.moveDown(0.5);
      doc.strokeColor('#D3D1C7').lineWidth(1).moveTo(56, doc.y).lineTo(539, doc.y).stroke();
      doc.moveDown(1);

      doc.fontSize(10).fillColor('#A32D2D').text(
        'La password NON e\u0300 salvata in questo documento per motivi di sicurezza. ' +
          'Conservala separatamente (es. un password manager): senza di essa il file .vault ' +
          'non puo\u0300 essere recuperato da nessuno, nemmeno da Vault Semplice.'
      );

      doc.end();
      stream.on('finish', () => resolve(outPath));
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateRecapPdf };
