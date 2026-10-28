const {test} = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/streams.js');
const hex = '0123456789abcdef0123456789abcdef01234567';
const magnet = 'magnet:?xt=urn:btih:' + hex;
test('same btih merges despite different trackers and query ordering', () => {
  const result = C.merge([
    {Title:'Film 1080p LostFilm', MagnetUri:magnet + '&tr=udp://one', Tracker:'one', Seeders:2},
    {Title:'Film 1080p LostFilm', MagnetUri:'magnet:?dn=Film&xt=urn%3Abtih%3A' + hex.toUpperCase(), Tracker:'two', Seeders:10}
  ]);
  assert.equal(result.length,1); assert.equal(result[0].seeds,10);
  assert.deepEqual(result[0].trackers,['one','two']); assert.equal(result[0].links.length,2);
});
test('base32 and hex denote the same btih', () => {
  assert.equal(C.hash('AERUKZ4JVPG66AJDIVTYTK6N54ASGRLH'), 'btih:' + hex);
});
test('missing hash never merges by title or Lampa synthetic hash', () => {
  assert.equal(C.merge([{Title:'same',hash:123,Link:'https://a/t'}, {Title:'same',hash:123,Link:'https://b/t'}]).length,2);
  assert.equal(C.hash('123'), '');
});
test('different hashes keep separate sources inside one quality and voice', () => {
  const rows = C.merge([{Title:'Movie 1080p HEVC LostFilm',MagnetUri:magnet}, {Title:'Movie 1080p HEVC LostFilm',MagnetUri:magnet.replace('01234567','11234567')}]);
  assert.equal(rows.length,2); const g=C.groups(rows); assert.equal(g.length,1); assert.equal(g[0].voices.LostFilm.length,2);
});
test('HDR, SDR, DV and codecs are not silently conflated', () => {
  const profiles=['Film 2160p HEVC HDR10','Film 2160p HEVC','Film 2160p HEVC DV','Film 2160p AVC'];
  const rows=C.merge(profiles.map((Title,i)=>({Title,Link:'https://example.test/'+i})));
  assert.equal(C.groups(rows).length,4); assert.equal(C.profile('Film UHD x265 HDR10+').resolution,2160);
});
test('season and episode matching respects exact episode and excludes packs', () => {
  assert.deepEqual(C.episode('Show/S02/Show.S02E03.1080p.mkv'),{season:2,episode:3});
  assert.deepEqual(C.episode('Show.2x03.mkv'),{season:2,episode:3});
  assert.equal(C.episode('Show.S02E03-E04.mkv'),null);
  assert.equal(C.episode('Show.S02E03E04.mkv'),null);
  assert.equal(C.episode('Show.S02E03-04.mkv'),null);
  assert.equal(C.episode('Show.S02E30.mkv').episode,30);
  assert.deepEqual(C.episode('Show Сезон 2 Серия 3.mkv'),{season:2,episode:3});
});
test('never plays arbitrary files when requested episode is absent', () => {
  const files=[{id:1,path:'S01E01.mkv'}, {id:2,path:'S02E01.mkv'}, {id:3,path:'sample.S02E01.mkv'}, {id:4,path:'S02E01.srt'}, {id:5,path:'Show.S02E02.mkv'}];
  assert.deepEqual(C.filesFor(files,{season:2,episode:1}).map(f=>f.id),[2]);
  assert.equal(C.filesFor(files,{season:2,episode:3}).length,0);
});
test('external title HTML is escaped', () => {
  assert.equal(C.esc('<img onerror="x"> &'), '&lt;img onerror=&quot;x&quot;&gt; &amp;');
});
test('auto obeys the quality ceiling and excludes camera releases', () => {
  const rows=C.merge(['1080p HEVC','2160p HEVC','720p AVC','1080p CAM'].map((quality,i)=>({Title:'Film '+quality,Link:'https://example.test/'+i})));
  assert.deepEqual(C.autoCandidates(C.groups(rows),1080).map(v=>v.profile.resolution),[1080,720]);
});
test('progress distinguishes movie and TV IDs and metadata sources', () => {
  assert.notEqual(C.cardKey({id:1,title:'Film'}),C.cardKey({id:1,name:'Show'}));
  assert.notEqual(C.cardKey({id:1,title:'Film',source:'tmdb'}),C.cardKey({id:1,title:'Film',source:'other'}));
});
test('tracker query values cannot inject a fake torrent hash', () => {
  assert.equal(C.hash('magnet:?tr='+encodeURIComponent('https://example.test/?xt=urn:btih:'+hex)), '');
  assert.equal(C.hash('magnet:?xt=urn:btmh:1220'+'a'.repeat(64)),'btmh:1220'+'a'.repeat(64));
});
test('season folders support standalone episode names without treating ranges as exact', () => {
  assert.deepEqual(C.episode('Show/S02/E03.mkv'),{season:2,episode:3});
  assert.deepEqual(C.episode('Show/Season 2/03 - Title.mkv'),{season:2,episode:3});
  assert.equal(C.episode('Show/S02/03-04.mkv'),null);
});
