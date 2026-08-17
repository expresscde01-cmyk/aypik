/**
 * Met à jour le template Auth « Reset Password » du projet hébergé (français).
 * Token : SUPABASE_ACCESS_TOKEN, ou session CLI Supabase — jamais affiché.
 */
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECT_REF = 'dtsyeouinmpjvdgwkncu';
const SUBJECT = 'Réinitialisation de votre mot de passe';
const BODY = `<p>Bonjour,</p>
<p>Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le lien ci-dessous pour en définir un nouveau :</p>
<p><a href="{{ .ConfirmationURL }}">{{ .ConfirmationURL }}</a></p>
<p>Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail en toute sécurité.</p>`;

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function findAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  const candidates = [
    join(homedir(), '.supabase', 'access-token'),
    join(process.env.APPDATA || '', 'supabase', 'access-token'),
  ];
  for (const file of candidates) {
    if (file && existsSync(file)) {
      const raw = readFileSync(file, 'utf8').trim();
      if (raw) return raw;
    }
  }
  return '';
}

loadDotEnv(join(process.cwd(), '.env'));
const token = findAccessToken();
if (!token) {
  console.error('NO_TOKEN');
  process.exit(2);
}

const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

const patchRes = await fetch(url, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({
    mailer_subjects_recovery: SUBJECT,
    mailer_templates_recovery_content: BODY,
  }),
});

if (!patchRes.ok) {
  console.error('PATCH_FAILED', patchRes.status);
  process.exit(1);
}

const getRes = await fetch(url, { headers });
if (!getRes.ok) {
  console.error('GET_FAILED', getRes.status);
  process.exit(1);
}

const cfg = await getRes.json();
const subject = cfg.mailer_subjects_recovery || '';
const content = String(cfg.mailer_templates_recovery_content || '');
const french =
  subject.includes('Réinitialisation') &&
  content.includes('Bonjour,') &&
  content.includes('réinitialisation de votre mot de passe') &&
  content.includes('en toute sécurité') &&
  content.includes('{{ .ConfirmationURL }}');

console.log('SUBJECT', subject);
console.log('HAS_CONFIRMATION_URL', content.includes('{{ .ConfirmationURL }}'));
console.log('FRENCH_OK', french ? 'yes' : 'no');
