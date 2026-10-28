const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../src/extensions');
test('extension catalog has unique IDs and URLs and no competing player/theme defaults',()=>{
 assert.equal(catalog.length,18);
 assert.equal(new Set(catalog.map(p=>p.id)).size,catalog.length);
 assert.equal(new Set(catalog.map(p=>p.url)).size,catalog.length);
 const defaults=catalog.filter(p=>p.default); assert.equal(defaults.length,4);
 defaults.forEach(p=>assert.match(p.url,/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[a-f0-9]{40}\/.+\.js$/));
 assert.ok(!defaults.some(p=>/filmix|jellyfin|skaz|profiles/.test(p.id)));
});
