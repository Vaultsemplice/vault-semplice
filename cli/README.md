# Vault CLI

CLI da terminale per Secure Vault, **compatibile al 100%** con i file `.vault`
creati dalla versione web/Tauri (stesso algoritmo: PBKDF2 + AES-GCM 256 bit,
con livello di sicurezza scelto dall'utente). Un file creato sul sito si apre
da terminale e viceversa.

## Novità di questa versione

- **Interfaccia interattiva** all'avvio (`vault` senza argomenti, o `vault start`):
  banner grande "Vault Semplice" + menu a scelta numerica.
- **Nessun login obbligatorio**: la CLI parte in modalità gratuita e non richiede
  autorizzazione tramite sito o browser nascosto.
- **Aperture massime configurabili**: illimitate, 1, 2, 3, 4 o un numero
  personalizzato.
- **Scadenza** del vault (nessuna, 1/7/30 giorni o data personalizzata).
- **Livelli di sicurezza** selezionabili: Standard, Alta, Massima (cambia le
  iterazioni PBKDF2). Ogni vault salva il proprio livello, quindi resta
  apribile anche se in futuro i default cambiano.
- **PDF di riepilogo** generabile alla fine della creazione di un vault (mai
  con la password dentro, per sicurezza).
- **Controllo automatico di Node.js**: gli script `start.sh` / `start.bat`
  verificano che Node.js sia installato prima di avviare il programma; se
  manca, aprono automaticamente la pagina di download.

## Installazione

```bash
cd vault-cli
npm install
npm link        # rende disponibile il comando "vault" ovunque nel terminale
```

Senza `npm link` puoi comunque usarlo con `node bin/vault.js ...`.

### Avvio "doppio-click" (con controllo Node.js incluso)

Per distribuire il programma a utenti che potrebbero non avere Node.js
installato, usa gli script di avvio inclusi invece del comando `vault`
diretto:

- **macOS/Linux**: `./start.sh`
- **Windows**: doppio-click su `start.bat`

Questi script controllano se Node.js è presente (e se la versione è >= 18):
se manca, aprono automaticamente il browser sulla pagina di download
ufficiale (`https://nodejs.org`) e si fermano, invece di andare in errore.

## Interfaccia interattiva

Lanciando `vault` senza argomenti (o `vault start`) parte il menu principale
con un banner grande e un menu a scelta numerica: Crea un nuovo vault, Apri
un vault, Info su un vault, Cloud R2, Diagnostica sistema, Account, Esci.

La creazione guidata (opzione 1) chiede in sequenza: file da cifrare,
password, numero massimo di aperture, scadenza, livello di sicurezza e se
generare il PDF di riepilogo.

## Modalità gratuita

La CLI è pensata per partire senza account o autenticazione. Se esegui `vault start`,
`vault login`, `vault whoami` o `vault logout`, vedrai che la modalità gratuita è
attiva e non viene aperta alcuna finestra di browser o pagina di accesso.

```bash
vault login     # mostra che la modalità gratuita è attiva
vault whoami    # mostra che la CLI è in modalità gratuita
vault logout    # conferma che non esiste un login da disconnettere
```

Per testare localmente non serve alcun sito di login o callback: la CLI lavora
semplicemente in modalità gratuita.

## Livelli di sicurezza

```bash
vault security-levels
```

| Livello  | Iterazioni PBKDF2 | Note                                   |
|----------|-------------------|-----------------------------------------|
| standard | 250.000           | Veloce, uso quotidiano                  |
| alta     | 600.000           | Consigliato per dati sensibili          |
| massima  | 1.200.000         | Massima resistenza a forza bruta, lento |

```bash
vault create documento.pdf --security alta
```

## Comandi vault (locali)

```bash
# Crea un .vault cifrato da un file qualsiasi
vault create documento.pdf
# -> chiede la password, produce documento.pdf.vault

vault create documento.pdf -o segreto.vault -p "MiaPassword123!"
vault create documento.pdf --expires 2026-12-31T23:59:00Z --max-opens 3
vault create documento.pdf --security massima --pdf   # + PDF di riepilogo

# Vedi i metadati di un .vault senza decifrarlo
vault info segreto.vault

# Decifra e ripristina il file originale
vault open segreto.vault
vault open segreto.vault -o /percorso/output.pdf -p "MiaPassword123!"
```

Se non passi `-p`, la password viene chiesta a terminale in modo nascosto
(mascherata con `*`), non finisce mai negli history/log della shell.

## Comandi per Cloudflare R2

Il comando scarica/carica file **direttamente dal tuo bucket R2** usando
l'API S3-compatibile di Cloudflare (nessun tool esterno necessario, tutto
integrato nel CLI).

### 1. Configura le credenziali

Crea le API key R2 dalla dashboard Cloudflare: **R2 → Manage R2 API Tokens →
Create API Token** (permessi Object Read & Write sul bucket che ti serve).

Poi esporta le variabili d'ambiente (o mettile in un file `.env` e caricale
con `export $(cat .env | xargs)`, oppure con `dotenv-cli`):

```bash
export R2_ACCOUNT_ID="il-tuo-account-id-cloudflare"
export R2_ACCESS_KEY_ID="xxxxxxxxxxxxxxxx"
export R2_SECRET_ACCESS_KEY="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export R2_BUCKET="nome-del-bucket"
```

`R2_ACCOUNT_ID` lo trovi nell'URL della dashboard Cloudflare o nella sezione
R2 (è lo stesso account ID usato per l'endpoint
`https://<account_id>.r2.cloudflarestorage.com`).

### 2. Comandi disponibili

```bash
# Carica un file (es. un .vault già cifrato) sul bucket
vault r2 push segreto.vault
vault r2 push segreto.vault cartella/segreto.vault   # con un percorso/chiave remota custom

# Scarica un file dal bucket
vault r2 pull cartella/segreto.vault
vault r2 pull cartella/segreto.vault -o /tmp/segreto.vault

# Elenca i file nel bucket (opzionalmente filtrati per prefisso)
vault r2 ls
vault r2 ls cartella/

# Elimina un file dal bucket
vault r2 rm cartella/segreto.vault
```

### Flusso tipico: cifra in locale → carica su R2 → scarica altrove

```bash
vault create report.pdf -p "Password123!"          # crea report.pdf.vault
vault r2 push report.pdf.vault backup/report.vault   # carica cifrato su R2

# --- su un'altra macchina ---
vault r2 pull backup/report.vault -o report.vault    # scarica
vault open report.vault -p "Password123!"             # decifra in locale
```

Il file viaggia e resta su R2 **sempre cifrato**: chi ha accesso al bucket
senza la password non può leggerne il contenuto.

## Alternative da riga di comando per R2 (senza questo CLI)

Se in futuro ti serve scaricare file da R2 senza questo tool, altre opzioni
compatibili S3 sono:

```bash
# Con AWS CLI configurato sull'endpoint R2
aws s3 cp s3://<bucket>/<chiave> ./locale --endpoint-url https://<account_id>.r2.cloudflarestorage.com

# Con rclone (dopo aver configurato un remote "r2" nel file rclone.conf)
rclone copy r2:<bucket>/<chiave> ./locale

# Con Wrangler (CLI ufficiale Cloudflare)
wrangler r2 object get <bucket>/<chiave> --file ./locale
```
