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
  franceWorldAllowedIsos,
  franceWorldLabelMatches,
  matchesFranceWorldChoice,
  FRENCH_OVERSEAS_MENU,
  FRANCOPHONE_MENU,
  FRANCE_WORLD_COUNTRY_SECTIONS,
  INTERNATIONAL_COUNTRY_SECTIONS,
  FRENCH_TERRITORY_CODES,
  isInternationalMenuIso,
  parseInternationalCountry,
  parseInternationalCountries,
  parseFranceWorldCodes,
  toggleIsoSelection,
  countryListClosedLabel,
  internationalCountryLabel,
  compareFrenchCountryLabel,
  WORLD_ZONE_LABEL,
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

test('France dans le monde : unions PARTOUT / groupes / pays', () => {
  const overseas = FRENCH_OVERSEAS_MENU.map((row) => row.iso2);
  const francophone = FRANCOPHONE_MENU.map((row) => row.iso2);
  assert.deepEqual(franceWorldAllowedIsos('all'), [
    ...overseas,
    ...francophone,
  ]);
  assert.deepEqual(franceWorldAllowedIsos('overseas'), overseas);
  assert.deepEqual(franceWorldAllowedIsos('francophone'), francophone);
  assert.deepEqual(franceWorldAllowedIsos('BE'), ['BE']);
  assert.deepEqual(franceWorldAllowedIsos('gp'), ['GP']);
  assert.equal(franceWorldAllowedIsos('all').includes('FR'), false);
  assert.equal(matchesFranceWorldChoice('GP', 'all'), true);
  assert.equal(matchesFranceWorldChoice('BE', 'all'), true);
  assert.equal(matchesFranceWorldChoice('FR', 'all'), false);
  assert.equal(matchesFranceWorldChoice('BE', 'overseas'), false);
  assert.equal(matchesFranceWorldChoice('GP', 'overseas'), true);
  assert.equal(matchesFranceWorldChoice('BE', 'francophone'), true);
  assert.equal(matchesFranceWorldChoice('GP', 'francophone'), false);
  assert.equal(matchesFranceWorldChoice('BE', 'BE'), true);
  assert.equal(matchesFranceWorldChoice('CH', 'BE'), false);
});

test('France dans le monde : recherche insensible accents', () => {
  assert.equal(franceWorldLabelMatches('Côte d’Ivoire', 'cote divoire'), true);
  assert.equal(franceWorldLabelMatches('Côte d’Ivoire', 'CÔTE'), true);
  assert.equal(franceWorldLabelMatches('La Réunion', 'reunion'), true);
  assert.equal(franceWorldLabelMatches('Belgique', 'suisse'), false);
  assert.equal(franceWorldLabelMatches('Belgique', '  '), true);
});

test('International : pays groupés par continent, hors France et assimilés', () => {
  const titles = INTERNATIONAL_COUNTRY_SECTIONS.map((section) => section.title);
  assert.deepEqual(titles, [
    WORLD_ZONE_LABEL.europe,
    WORLD_ZONE_LABEL.north_america,
    WORLD_ZONE_LABEL.central_america,
    WORLD_ZONE_LABEL.south_america,
    WORLD_ZONE_LABEL.africa,
    WORLD_ZONE_LABEL.asia,
    WORLD_ZONE_LABEL.oceania,
  ]);
  const isos = INTERNATIONAL_COUNTRY_SECTIONS.flatMap((section) =>
    section.rows.map((row) => row.iso2)
  );
  for (const code of FRENCH_TERRITORY_CODES) {
    assert.equal(isos.includes(code), false, code);
  }
  assert.equal(isInternationalMenuIso('BE'), true);
  assert.equal(isInternationalMenuIso('FR'), false);
  assert.equal(isInternationalMenuIso('GP'), false);
  assert.equal(parseInternationalCountry('be'), 'BE');
  assert.equal(parseInternationalCountry('FR'), null);
  assert.equal(internationalCountryLabel('BE'), 'Belgique');
  const europe = INTERNATIONAL_COUNTRY_SECTIONS.find(
    (section) => section.title === WORLD_ZONE_LABEL.europe
  );
  assert.ok(europe?.rows.some((row) => row.iso2 === 'BE'));
  const europeLabels = europe?.rows.map((row) => row.label) ?? [];
  assert.deepEqual(
    europeLabels,
    [...europeLabels].sort(compareFrenchCountryLabel)
  );
  assert.ok(europeLabels.indexOf('Allemagne') < europeLabels.indexOf('Belgique'));
  assert.ok(europeLabels.indexOf('Belgique') < europeLabels.indexOf('Suisse'));
});

test('France dans le monde : pays classés en alphabet français', () => {
  for (const section of FRANCE_WORLD_COUNTRY_SECTIONS) {
    const labels = section.rows.map((row) => row.label);
    assert.deepEqual(labels, [...labels].sort(compareFrenchCountryLabel));
  }
  const overseas = FRANCE_WORLD_COUNTRY_SECTIONS[0].rows.map((row) => row.label);
  const francophone = FRANCE_WORLD_COUNTRY_SECTIONS[1].rows.map(
    (row) => row.label
  );
  assert.ok(overseas.indexOf('Guadeloupe') < overseas.indexOf('Guyane'));
  assert.ok(overseas.indexOf('Guyane') < overseas.indexOf('Martinique'));
  assert.ok(francophone.indexOf('Belgique') < francophone.indexOf('Bénin'));
  assert.ok(francophone.indexOf('Bénin') < francophone.indexOf('Suisse'));
});

test('pays précis : cumul multi-sélection', () => {
  assert.deepEqual(parseFranceWorldCodes(['be', 'CH']), ['BE', 'CH']);
  assert.deepEqual(parseFranceWorldCodes(undefined, 'gp'), ['GP']);
  assert.deepEqual(parseInternationalCountries(['de', 'BE']), ['DE', 'BE']);
  assert.deepEqual(parseInternationalCountries(undefined, 'IT'), ['IT']);
  assert.deepEqual(toggleIsoSelection(['DE'], 'BE'), ['DE', 'BE']);
  assert.deepEqual(toggleIsoSelection(['DE', 'BE'], 'DE'), ['BE']);
  assert.equal(
    countryListClosedLabel(['CH', 'DE'], internationalCountryLabel),
    'Allemagne, Suisse'
  );
  assert.deepEqual(franceWorldAllowedIsos('all', ['BE', 'CH']), ['BE', 'CH']);
  assert.equal(matchesFranceWorldChoice('BE', 'all', ['BE', 'CH']), true);
  assert.equal(matchesFranceWorldChoice('GP', 'all', ['BE', 'CH']), false);
});
