import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseFounderOfferClosed } from './founderSlots.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('parseFounderOfferClosed : seul le booléen clôture, jamais remaining', () => {
  assert.equal(parseFounderOfferClosed(null), false);
  assert.equal(parseFounderOfferClosed({}), false);
  assert.equal(
    parseFounderOfferClosed({
      founders_remaining: 0,
      founders_taken: 1000,
      founders_max: 1000,
    }),
    false
  );
  assert.equal(
    parseFounderOfferClosed({
      founders_remaining: 932,
      founder_offer_closed: false,
    }),
    false
  );
  assert.equal(
    parseFounderOfferClosed({
      founders_remaining: 932,
      founder_offer_closed: true,
    }),
    true
  );
});

test('FR/EN/ES : messages de clôture Fondateur présents, sans compteur remaining', () => {
  for (const file of ['fr.json', 'en.json', 'es.json']) {
    const json = JSON.parse(
      readFileSync(join(root, 'src/locales', file), 'utf8')
    ) as {
      landing: { founderOfferClosed: string; founderSlotsSubtitle: string };
      legal: { founderOfferClosed: string };
    };
    assert.equal(typeof json.landing.founderOfferClosed, 'string');
    assert.ok(json.landing.founderOfferClosed.length > 40);
    assert.equal(typeof json.legal.founderOfferClosed, 'string');
    assert.ok(json.legal.founderOfferClosed.length > 80);
    assert.equal(json.landing.founderOfferClosed.includes('{{'), false);
    assert.equal(json.legal.founderOfferClosed.includes('{{'), false);
  }
});

test('aucun écran visiteur n’interpole founders_remaining', () => {
  const files = [
    'src/components/LandingPage.tsx',
    'src/components/LegalTerms.tsx',
    'src/components/membership/MembershipPanel.tsx',
    'src/lib/useFounderSlots.ts',
  ];
  for (const rel of files) {
    const src = readFileSync(join(root, rel), 'utf8');
    assert.equal(
      src.includes('founders_remaining'),
      false,
      `${rel} ne doit pas lire founders_remaining`
    );
  }
});
