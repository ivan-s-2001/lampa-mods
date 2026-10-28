const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('../src/providers');
const core = require('../src/streams');
const h = 'a'.repeat(40), movie = {title:'Кролик',original_title:'Big Buck Bunny',release_date:'2008-04-10'};
const spec = kind=>p.definitions.find(d=>d.kind===kind);
test('seven independent public services; movie/TV applicability is explicit',()=>{
 assert.equal(new Set(p.definitions.map(x=>x.base)).size,7);
 assert.equal(spec('yts').movie,true); assert.equal(spec('eztv').tv,true);
});
test('search parameters are encoded; JacRed preserves card metadata and serial convention',()=>{
 const url = new URL(p.url(spec('jacred'),'A&B #one',movie,false));
 assert.equal(url.searchParams.get('query'),'A&B #one');
 assert.equal(url.searchParams.get('title_original'),'Big Buck Bunny');
 assert.equal(url.searchParams.get('is_serial'),'1');
 assert.equal(new URL(p.url(spec('jacred'),'q',movie,true)).searchParams.get('is_serial'),'2');
 assert.equal(new URL(p.url(spec('knaben'),'q',movie,false)).searchParams.get('c'),'3000000');
 assert.equal(new URL(p.url(spec('knaben'),'q',movie,true)).searchParams.get('c'),'2000000');
});
test('Knaben hash is mapped explicitly; Lampa synthetic hash is never used as a magnet',()=>{
 const rows=p.parse(spec('knaben'),{hits:[{title:'Big Buck Bunny 1080p',hash:h,seeders:12,tracker:'RuTracker',categoryId:[3001000]}]});
 const merged=core.merge(rows);assert.equal(merged[0].hash,'btih:'+h);assert.equal(merged[0].trackers[0],'RuTracker');
 assert.equal(core.merge([{Title:'Title',hash:h}]).length,0);
});
test('CSV, APIBay, EZTV and YTS map hashes, seeds and quality and deduplicate',()=>{
 const csv=p.parse(spec('csv'),{torrents:[{name:'Big Buck Bunny 1080p',infohash:h,seeders:3}]});
 const bay=p.parse(spec('apibay'),[{id:'7',category:'201',name:'Big Buck Bunny 1080p',info_hash:h,seeders:'5'}]);
 const tv=p.parse(spec('eztv'),{torrents:[{title:'Show S01E01 1080p',hash:h,seeds:4}]});
 const yts=p.parse(spec('yts'),{status:'ok',data:{movie_count:1,movies:[{title:'Big Buck Bunny',year:2008,torrents:[{quality:'1080p',type:'web',hash:h,seeds:10,video_codec:'x265'}]}]}});
 assert.equal(core.merge(csv.concat(bay,tv,yts)).length,1);
 assert.equal(core.merge(yts)[0].profile.codec,'HEVC');assert.equal(core.merge(yts)[0].seeds,10);
 assert.equal(core.merge(csv.concat(bay))[0].trackers.length,2);
});
test('no-result sentinels, malformed schemas and unsafe categories cannot become playable',()=>{
 assert.deepEqual(p.parse(spec('apibay'),[{id:'0',name:'No results',info_hash:'0'.repeat(40)}]),[]);
 assert.equal(core.merge(p.parse(spec('csv'),{torrents:[{name:'Fake',infohash:'0'.repeat(40)}]})).length,0);
 assert.equal(p.parse(spec('knaben'),{hits:[{categoryId:[6001000]}]}).length,0);
 assert.throws(()=>p.parse(spec('knaben'),{error:'rate limited'}));
 assert.throws(()=>p.parse(spec('yts'),{status:'error'}));
 assert.throws(()=>p.parse(spec('csv'),'<html>blocked</html>'));
});
test('title relevance uses original/local names, word boundaries and movie year',()=>{
 assert.ok(p.relevant({Title:'Big.Buck.Bunny.2008.1080p'},movie,false));
 assert.ok(p.relevant({Title:'Кролик (2008) 720p'},movie,false));
 assert.ok(!p.relevant({Title:'Big Buck Bunny Returns (2009)'},movie,false));
 assert.ok(!p.relevant({Title:'Big Buck Bunnyman'},movie,false));
 assert.ok(!p.relevant({Title:'Big Buck Bunny',Tracker:'Nyaa.si'},movie,false));
 assert.ok(!p.relevant({Title:'Big Buck Bunny',CategoryDesc:'Anime'},movie,false));
 assert.ok(p.relevant({Title:'Show S04E01 (2026)'},{name:'Show',release_date:'2019-01-01'},true));
});
