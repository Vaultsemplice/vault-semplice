#!/usr/bin/env bash
# Avvio "doppio-click" di Vault Semplice.
# Controlla che Node.js sia installato PRIMA di provare a lanciare il
# programma: se manca, non si puo' usare node stesso per avvisare l'utente,
# quindi qui uso solo bash puro e apro la pagina di download nel browser.
set -e

DOWNLOAD_URL="https://nodejs.org/it/download"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

open_url() {
  local url="$1"
  if command -v open >/dev/null 2>&1; then open "$url"       # macOS
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$url"  # Linux
  else echo "Apri manualmente: $url"
  fi
}

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js non risulta installato su questo computer."
  echo "Apro la pagina di download ufficiale..."
  open_url "$DOWNLOAD_URL"
  echo "Dopo aver installato Node.js, riavvia questo script (start.sh)."
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Versione di Node.js troppo vecchia ($(node -v)). Serve la 18 o superiore."
  open_url "$DOWNLOAD_URL"
  exit 1
fi

if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  echo "Prima installazione: installo le dipendenze..."
  (cd "$SCRIPT_DIR" && npm install)
fi

exec node "$SCRIPT_DIR/bin/vault.js" "$@"
