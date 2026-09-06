import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  placeNotifPanel,
  placePortaledActionTooltip,
} from './portaledActionTooltip.ts';

const viewport = { left: 0, top: 0, width: 390, height: 800 };
const tip = { width: 140, height: 22 };
const button = {
  top: 400,
  right: 200,
  bottom: 440,
  left: 160,
};

test('ancrage bas-droite du bouton au milieu de l’écran', () => {
  assert.deepEqual(placePortaledActionTooltip(button, tip, viewport), {
    top: 434,
    left: 196,
  });
});

test('dernière carte d’une rangée : ramène l’infobulle dans le viewport', () => {
  const rightCol = { top: 400, right: 388, bottom: 440, left: 348 };
  const pos = placePortaledActionTooltip(rightCol, tip, viewport);
  assert.equal(pos.left, 390 - 8 - 140);
  assert.ok(pos.left + tip.width <= 390 - 8);
});

test('carte en bas d’écran : bascule au-dessus du bouton (au-dessus de la nav)', () => {
  const low = { top: 760, right: 200, bottom: 800, left: 160 };
  const pos = placePortaledActionTooltip(low, tip, viewport);
  assert.equal(pos.top, 760 - 22 - 6);
  assert.ok(pos.top + tip.height <= 760);
});

test('cloche Accueil (pas tout à droite) : le panneau reste dans l’écran', () => {
  const mobile = { left: 0, top: 0, width: 360, height: 800 };
  const bell = { top: 8, right: 188, bottom: 44, left: 148 };
  const pos = placeNotifPanel(bell, mobile, 320);
  assert.equal(pos.left, 8);
  assert.equal(pos.width, 320);
  assert.ok(pos.left >= 8);
  assert.ok(pos.left + pos.width <= 360 - 8);
});

test('cloche à droite (Mes Matchs) : le panneau s’aligne sur la cloche', () => {
  const mobile = { left: 0, top: 0, width: 360, height: 800 };
  const bell = { top: 8, right: 352, bottom: 44, left: 312 };
  const pos = placeNotifPanel(bell, mobile, 320);
  assert.equal(pos.left, 352 - 320);
  assert.ok(pos.left + pos.width <= 360 - 8);
});
