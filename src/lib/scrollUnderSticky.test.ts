import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  measureStickyHeaderHeight,
  scrollYUnderStickyHeader,
  STICKY_HEADER_FALLBACK_PX,
} from './scrollUnderSticky.ts';

test('scroll sous header sticky : ôte hauteur + marge', () => {
  assert.equal(scrollYUnderStickyHeader(200, 400, 56, 8), 536);
});

test('ne descend pas sous 0 (cible déjà en haut)', () => {
  assert.equal(scrollYUnderStickyHeader(10, 0, 56, 8), 0);
});

test('header Mes Matchs h-14 : carte à 120px du haut → offset 56', () => {
  const header = 56;
  const gap = 8;
  const y = scrollYUnderStickyHeader(120, 0, header, gap);
  assert.equal(y, 56);
});

test('measureStickyHeaderHeight : hauteur réelle, sinon h-14', () => {
  assert.equal(
    measureStickyHeaderHeight({ getBoundingClientRect: () => ({ height: 57 }) }),
    57
  );
  assert.equal(measureStickyHeaderHeight(null), STICKY_HEADER_FALLBACK_PX);
  assert.equal(
    measureStickyHeaderHeight({ getBoundingClientRect: () => ({ height: 0 }) }),
    STICKY_HEADER_FALLBACK_PX
  );
});
