import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('CAPTCHA : nouveau jeton après envoi et après expiration', () => {
  const auth = readFileSync(join(root, 'src/components/AuthScreen.tsx'), 'utf8');
  const widget = readFileSync(join(root, 'src/components/Turnstile.tsx'), 'utf8');

  assert.match(auth, /onExpire=\{resetCaptcha\}/);
  assert.match(auth, /setCaptchaToken\(null\)/);
  assert.match(auth, /turnstileRef\.current\?\.reset\(\)/);
  assert.equal(auth.match(/resetCaptcha\(\)/g)?.length, 2);
  assert.doesNotMatch(auth, /auth\.needCaptcha/);
  assert.match(auth, /auth\.captchaChecking/);
  assert.match(auth, /Boolean\(TURNSTILE_SITE_KEY\) && !captchaToken/);

  assert.match(widget, /window\.turnstile\.reset\(widgetIdRef\.current\)/);
  assert.match(widget, /expired-callback/);
  assert.match(widget, /onExpireRef\.current\?\.\(\)/);

  const fr = JSON.parse(readFileSync(join(root, 'src/locales/fr.json'), 'utf8')) as {
    auth: { captchaChecking: string };
  };
  const en = JSON.parse(readFileSync(join(root, 'src/locales/en.json'), 'utf8')) as {
    auth: { captchaChecking: string };
  };
  const es = JSON.parse(readFileSync(join(root, 'src/locales/es.json'), 'utf8')) as {
    auth: { captchaChecking: string };
  };
  assert.equal(
    fr.auth.captchaChecking,
    'Vérification de sécurité en cours, patiente quelques secondes…',
  );
  assert.match(en.auth.captchaChecking, /wait a few seconds/i);
  assert.match(es.auth.captchaChecking, /espera unos segundos/i);
});
