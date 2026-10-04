const test = require('node:test');
const assert = require('node:assert/strict');
const { vehicle, vehicles, assetPath } = require('./security-data.js');
const base = { id: 1, slug: 'ck-2026-513', brand: 'Hyundai', model: 'Santa Fe', year: 2020, price: 8340, image: 'assets/car-1.webp' };
test('rejects attribute injection, path traversal and nonlocal image URLs', () => {
  for (const slug of ['../admin', 'car" onmouseover="alert(1)', '//evil.example', '%2e%2e']) assert.equal(vehicle({ ...base, slug }), null);
  for (const path of ['https://evil.example/tracker.png', 'javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'assets/../private.png', '/assets/car.png']) assert.equal(assetPath(path), 'assets/car-1.webp');
});
test('whitelists fields and drops internal/private data', () => {
  const parsed = vehicle({ ...base, password: 'private', apiKey: 'private', internalNotes: 'private', location: 'private', source: 'private', imageSource: 'private' });
  for (const key of ['password','apiKey','internalNotes','location','source','imageSource']) assert.equal(key in parsed, false);
});
test('normalizes numeric values before HTML interpolation', () => {
  const parsed = vehicle({ ...base, year: '<img onerror=alert(1)>', price: Infinity, seats: '99" onfocus=alert(1)', mileage: -1 });
  assert.equal(parsed.year, 2020); assert.equal(parsed.price, 0); assert.equal(parsed.seats, 5); assert.equal(parsed.mileage, null);
});
test('does not allow injected statuses or object IDs', () => {
  assert.equal(vehicle({ ...base, status: 'available" onclick="alert(1)' }).status, 'available');
  assert.equal(vehicle({ ...base, id: { valueOf() { throw Error('execute'); } } }), null);
});
test('bounds array and string sizes', () => {
  assert.equal(vehicles(Array(600).fill(base)).length, 500);
  assert.equal(vehicle({ ...base, model: 'a'.repeat(10000) }).model.length, 120);
  assert.equal(vehicles(null).length, 0);
});
