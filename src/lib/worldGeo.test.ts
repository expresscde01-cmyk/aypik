import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distanceKmBetween } from './geoCommunes.ts';
import {
  formatDistanceKmBadge,
  isGeoFilterActive,
  isGeoPerimeterFilter,
  isInternationalPerimeter,
  matchesGeoPerimeter,
} from './geoProximity.ts';
import {
  countryToWorldZone,
  formatInternationalGeoFacts,
  isFrenchTerritoryIso,
  isWorldZoneFilter,
  parseFranceWorldChoice,
  parseWorldZones,
  toggleWorldZoneSelection,
  franceWorldClosedLabel,
  worldZoneLabel,
  worldZonesClosedLabel,
} from './worldGeo.ts';

const PARIS = { lat: 48.8566, lng: 2.3522 };
const LONDON = { lat: 51.5074, lng: -0.1278 };
const NEW_YORK = { lat: 40.7128, lng: -74.006 };

test('distance Paris–Londres ≈ 340 km', () => {
  const km = distanceKmBetween(PARIS, LONDON);
  assert.ok(km > 320 && km < 370, `got ${km}`);
});

test('distance Paris–New York ≈ 5800 km', () => {
  const km = distanceKmBetween(PARIS, NEW_YORK);
  assert.ok(km > 5600 && km < 6000, `got ${km}`);
});

test('même ville : formatDistanceKmBadge arrondit à 1 km mini', () => {
  const km = distanceKmBetween(PARIS, PARIS);
  assert.ok(km < 0.01);
  assert.equal(formatDistanceKmBadge(km), 'à 1 km');
});

test('pays → zone continent', () => {
  assert.equal(countryToWorldZone('FR'), 'europe');
  assert.equal(countryToWorldZone('US'), 'north_america');
  assert.equal(countryToWorldZone('CR'), 'central_america');
  assert.equal(countryToWorldZone('BR'), 'south_america');
  assert.equal(countryToWorldZone('JP'), 'asia');
  assert.equal(countryToWorldZone('NG'), 'africa');
  assert.equal(countryToWorldZone('AU'), 'oceania');
});

test('fiche International : 4 champs, continent toujours présent', () => {
  const facts = formatInternationalGeoFacts({
    worldZone: 'europe',
    countryCode: 'BE',
    cityName: 'Bruxelles',
    distanceKm: 264,
  });
  assert.equal(facts.continent, 'Europe');
  assert.equal(facts.country, 'Belgique');
  assert.equal(facts.city, 'Bruxelles');
  assert.equal(facts.distanceLabel, 'à 264 km');
  assert.notEqual(facts.continent, facts.country);
});

test('fiche International : continent dérivé du pays si zone absente', () => {
  const facts = formatInternationalGeoFacts({
    countryCode: 'JP',
    location: 'Tokyo',
    distanceKm: 9700,
  });
  assert.equal(facts.continent, worldZoneLabel('asia'));
  assert.equal(facts.country, 'Japon');
  assert.equal(facts.city, 'Tokyo');
});

test('prefs : Hexagone n’est pas un filtre actif ; France dans le monde et International si', () => {
  assert.equal(isGeoFilterActive('anywhere'), false);
  assert.equal(isGeoFilterActive('la_france_dans_le_monde'), true);
  assert.equal(isGeoFilterActive('international'), true);
  assert.equal(isGeoFilterActive('neighboring_region'), true);
  assert.equal(isGeoPerimeterFilter('international'), true);
  assert.equal(isGeoPerimeterFilter('anywhere'), true);
  assert.equal(isGeoPerimeterFilter('la_france_dans_le_monde'), true);
  assert.equal(isWorldZoneFilter('south_america'), true);
  assert.equal(isWorldZoneFilter('worldwide'), true);
  assert.equal(isInternationalPerimeter('international'), true);
  assert.equal(isInternationalPerimeter('anywhere'), false);
});

test('France : régions voisines inchangé ; International ne passe pas par le CP', () => {
  const neighborFlags = {
    same_city: false,
    same_department: false,
    same_region: false,
    neighboring_region: true,
  };
  assert.equal(
    matchesGeoPerimeter(neighborFlags, 'neighboring_region'),
    true
  );
  assert.equal(
    matchesGeoPerimeter(
      {
        same_city: false,
        same_department: false,
        same_region: false,
        neighboring_region: false,
      },
      'neighboring_region'
    ),
    false
  );
  assert.equal(
    matchesGeoPerimeter(
      {
        same_city: false,
        same_department: false,
        same_region: false,
        neighboring_region: false,
      },
      'international'
    ),
    true
  );
  assert.equal(
    matchesGeoPerimeter(
      {
        same_city: false,
        same_department: false,
        same_region: false,
        neighboring_region: false,
      },
      'la_france_dans_le_monde'
    ),
    true
  );
});

test('territoires français + continents International', () => {
  assert.equal(isFrenchTerritoryIso('FR'), true);
  assert.equal(isFrenchTerritoryIso('GP'), true);
  assert.equal(isFrenchTerritoryIso('NC'), true);
  assert.equal(isFrenchTerritoryIso('BE'), false);
  assert.equal(isFrenchTerritoryIso('US'), false);
  assert.deepEqual(parseWorldZones(undefined, 'europe'), ['europe']);
  assert.deepEqual(parseWorldZones(undefined, 'worldwide'), []);
  assert.deepEqual(parseWorldZones(['africa', 'asia']), ['africa', 'asia']);
  assert.deepEqual(
    toggleWorldZoneSelection([], 'europe'),
    ['europe']
  );
  assert.deepEqual(
    toggleWorldZoneSelection(['europe', 'africa'], 'europe'),
    ['africa']
  );
  assert.deepEqual(toggleWorldZoneSelection(['europe'], 'worldwide'), []);
  assert.equal(worldZonesClosedLabel([]), 'PARTOUT');
  assert.equal(worldZonesClosedLabel(['europe']), 'Europe');
  assert.equal(parseFranceWorldChoice(undefined), 'all');
  assert.equal(parseFranceWorldChoice('gp'), 'GP');
  assert.equal(parseFranceWorldChoice('overseas'), 'overseas');
  assert.equal(parseFranceWorldChoice(undefined, ['BE']), 'BE');
  assert.equal(franceWorldClosedLabel('all'), 'PARTOUT');
  assert.equal(
    franceWorldClosedLabel('overseas'),
    'TOUS LES TERRITOIRES FRANÇAIS D’OUTRE-MER'
  );
  assert.equal(franceWorldClosedLabel('BE'), 'Belgique');
});
