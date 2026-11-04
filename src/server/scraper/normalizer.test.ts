import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAddressComponents,
  parseSearchLocationFallback,
  extractCoordinates,
  extractSourcePlaceId,
} from './normalizer.ts';

test('parses Brazilian street, neighborhood, city, state and CEP without using neighborhood as city', () => {
  assert.deepEqual(
    parseAddressComponents('Alameda Joaquim Eugênio de Lima, 1756 - Jardim Paulista, São Paulo - SP, 01403-002'),
    { postal_code: '01403-002', country: '', city: 'São Paulo', state: 'SP', neighborhood: 'Jardim Paulista' },
  );
});

test('extracts a neighborhood separated by commas when the address shows it explicitly', () => {
  assert.equal(
    parseAddressComponents('Rua A, 100, Centro, Porto Alegre - RS, 90010-150').neighborhood,
    'Centro',
  );
});

test('preserves leading zeroes in Brazilian postal codes', () => {
  assert.equal(
    parseAddressComponents('Rua A, 10 - Centro, Porto Alegre - RS, 90010-150').postal_code,
    '90010-150',
  );
});

test('extracts explicit country and city when country is displayed', () => {
  assert.deepEqual(
    parseAddressComponents('123 Main Street, Toronto, Canada'),
    { postal_code: '', country: 'Canada', city: 'Toronto', state: '', neighborhood: '' },
  );
});

test('does not invent city or state from an address without explicit components', () => {
  assert.deepEqual(
    parseAddressComponents('Pinheiros, São Paulo'),
    { postal_code: '', country: '', city: '', state: '', neighborhood: '' },
  );
});

test('search location with neighborhood, city and UF enriches only city and state', () => {
  assert.deepEqual(parseSearchLocationFallback('Pinheiros, São Paulo, SP'), {
    city: 'São Paulo',
    state: 'SP',
  });
});

test('search location with city and UF is accepted', () => {
  assert.deepEqual(parseSearchLocationFallback('Porto Alegre, RS'), {
    city: 'Porto Alegre',
    state: 'RS',
  });
});

test('search location with city, UF and country is accepted', () => {
  assert.deepEqual(parseSearchLocationFallback('São Paulo, SP, Brasil'), {
    city: 'São Paulo',
    state: 'SP',
  });
});

test('a single neighborhood or city token is not promoted to city', () => {
  assert.deepEqual(parseSearchLocationFallback('Pinheiros'), { city: '', state: '' });
  assert.deepEqual(parseSearchLocationFallback('Porto Alegre'), { city: '', state: '' });
});

test('ambiguous location phrases do not populate city or state', () => {
  assert.deepEqual(parseSearchLocationFallback('barbearia, Pinheiros, São Paulo'), {
    city: '',
    state: '',
  });
});

test('prefers the selected place CID over an earlier nearby-feature CID', () => {
  assert.equal(
    extractSourcePlaceId('https://www.google.com/maps/place/Teste/data=!3m1!5s0x111aaa:0x222bbb!4m7!3m6!1s0x333ccc:0x444ddd!8m2'),
    '0x333ccc:0x444ddd',
  );
});

test('extracts coordinates from Maps place URL format', () => {
  assert.deepEqual(
    extractCoordinates('https://www.google.com/maps/place/Teste/@-23.5744,-46.6592,17z/data=!3d-23.5744293!4d-46.6592389'),
    { latitude: '-23.5744293', longitude: '-46.6592389' },
  );
});

test('rejects coordinates outside valid latitude/longitude ranges', () => {
  assert.deepEqual(
    extractCoordinates('https://www.google.com/maps/place/Teste/data=!3d-123.4!4d-46.6'),
    { latitude: '', longitude: '' },
  );
});

test('extracts stable source place identifier only when present', () => {
  assert.equal(
    extractSourcePlaceId('https://www.google.com/maps/place/Teste/data=!3m1!4b1!4m2!3m1!1s0x123abc:0x456def'),
    '0x123abc:0x456def',
  );
  assert.equal(extractSourcePlaceId('https://www.google.com/maps/place/Teste/@-23,-46,17z'), '');
});
