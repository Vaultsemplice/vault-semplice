'use strict';

const SITE_URL = process.env.VAULT_SITE_URL || 'https://vaultsemplice.com';

function loginViaBrowser() {
  return Promise.resolve({ token: 'guest-token', email: 'modalità-gratuita' });
}

module.exports = { loginViaBrowser, SITE_URL };
