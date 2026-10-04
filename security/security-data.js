/* Shared browser input checks. Server authorization is still required in production. */
(function (root) {
  'use strict';
  const statuses = new Set(['available', 'reserved', 'sold', 'draft', 'archived']);
  const text = (value, max = 120) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const number = (value, min, max, fallback) => {
    const n = typeof value === 'number' ? value : Number(value);
    return value !== null && value !== '' && Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  const assetPath = value => typeof value === 'string' && /^assets\/[a-z0-9][a-z0-9._-]*\.(?:webp|png|jpe?g)$/i.test(value) ? value : 'assets/car-1.webp';
  function vehicle(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const slug = text(value.slug, 100);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
    const id = typeof value.id === 'number' ? String(value.id) : text(value.id, 120);
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
    return {
      id, slug, brand: text(value.brand, 60), model: text(value.model),
      ref: text(value.ref, 60), body: text(value.body, 40), fuel: text(value.fuel, 40),
      transmission: text(value.transmission, 40),
      year: number(value.year, 1980, 2030, 2020),
      price: number(value.price, 0, 10000000, 0),
      mileage: number(value.mileage, 0, 3000000, null),
      seats: number(value.seats, 2, 15, 5),
      status: statuses.has(value.status) ? value.status : 'available',
      image: assetPath(value.image),
      gallery: Array.isArray(value.gallery) ? value.gallery.slice(0, 12).map(assetPath) : [],
      createdAt: number(value.createdAt, 0, Number.MAX_SAFE_INTEGER, 0)
    };
  }
  const vehicles = values => Array.isArray(values) ? values.slice(0, 500).map(vehicle).filter(Boolean) : [];
  const api = Object.freeze({ vehicle, vehicles, assetPath });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JHTSecurity = api;
})(typeof window === 'undefined' ? globalThis : window);
