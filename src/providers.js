/* Public search adapters. No server, credentials, SDKs or remote executable code. */
(function (root) {
    'use strict';
    var definitions = [
        {id:'jacred',name:'JacRed',kind:'jacred',base:'https://jac.red'},
        {id:'knaben',name:'Knaben',kind:'knaben',base:'https://api.knaben.org'},
        {id:'rutor',name:'RuTor',kind:'rutor',base:'https://rutor.info'},
        {id:'csv',name:'Torrents.csv',kind:'csv',base:'https://torrents-csv.com'},
        {id:'apibay',name:'APIBay',kind:'apibay',base:'https://apibay.org'},
        {id:'yts',name:'YTS',kind:'yts',base:'https://movies-api.accel.li',movie:true},
        {id:'eztv',name:'EZTV',kind:'eztv',base:'https://eztvx.to',tv:true}
    ];
    function imdb(movie) { var v = movie.imdb_id || (movie.external_ids || {}).imdb_id || ''; return /^tt\d+$/.test(v) ? v : ''; }
    function magnet(h) { return /^[a-f0-9]{40}$/i.test(h || '') && !/^0+$/.test(h) ? 'magnet:?xt=urn:btih:' + h : ''; }
    function url(spec, query, movie, serial) {
        var q = encodeURIComponent(query), original = movie.original_title || movie.original_name || query;
        switch (spec.kind) {
            case 'jacred': return spec.base + '/api/v2.0/indexers/all/results?query=' + q + '&title=' + encodeURIComponent(movie.title || movie.name || query) + '&title_original=' + encodeURIComponent(original) + '&year=' + encodeURIComponent((movie.release_date || movie.first_air_date || '').slice(0,4)) + '&is_serial=' + (serial ? 2 : 1);
            case 'jackett': return spec.base + '/api/v2.0/indexers/all/results?apikey=' + encodeURIComponent(spec.key) + '&Query=' + q + '&Category[]=' + (serial ? '5000' : '2000');
            case 'prowlarr': return spec.base + '/api/v1/search?apikey=' + encodeURIComponent(spec.key) + '&query=' + q + '&type=' + (serial ? 'tvsearch' : 'search') + '&categories=' + (serial ? '5000' : '2000');
            case 'knaben': return spec.base + '/v2/search?q=' + q + '&o=seeders&d=desc&s=100&c=' + (serial ? '2000000' : '3000000') + '&t=rutracker,1337x,thepiratebay,eztv,yts';
            case 'csv': return spec.base + '/service/search?q=' + q + '&size=100';
            case 'apibay': return spec.base + '/q.php?q=' + q + '&cat=200';
            case 'rutor': return spec.base + '/search/0/0/100/2/' + q + '/';
            case 'yts': return spec.base + '/api/v2/list_movies.json?query_term=' + encodeURIComponent(imdb(movie) || original) + '&limit=50&sort_by=seeds&order_by=desc';
            case 'eztv': return spec.base + '/api/get-torrents?imdb_id=' + imdb(movie).slice(2) + '&limit=100&page=1';
        }
        throw new Error('Unknown source');
    }
    function array(v) { if (!Array.isArray(v)) throw new Error('Unexpected response'); return v.slice(0,300); }
    function titleKey(s) { return String(s || '').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,' ').trim(); }
    function relevant(row, movie, serial) {
        var title = titleKey(row.Title || row.title), aliases = [movie.title,movie.name,movie.original_title,movie.original_name].map(titleKey).filter(Boolean);
        if (!aliases.some(function (alias) { return (' ' + title + ' ').indexOf(' ' + alias + ' ') >= 0; })) return false;
        var desc = String(row.CategoryDesc || row.categoryDescription || ''), tracker = String(row.Tracker || row.indexer || '');
        if (/anime|аниме|hentai|xxx/i.test(desc) || /nyaa|tokyotosho/i.test(tracker)) return false;
        var year = (movie.release_date || '').slice(0,4), years = String(row.Title || row.title).match(/\b(?:19|20)\d{2}\b/g);
        return serial || !year || !years || years.indexOf(year) >= 0;
    }
    function parse(spec, json, DOM) {
        var kind = spec.kind, list;
        if (kind === 'rutor') {
            if (typeof json !== 'string' || !/id=["']index["']/i.test(json)) throw new Error('Unexpected HTML');
            // Parse an inert allowlist of table/anchor markup; never insert a tracker page into Lampa.
            var html = json.replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi,'').replace(/<(?!\/?(?:table|tbody|tr|td|a|span)\b)[^>]*>/gi,'');
            var doc = new DOM().parseFromString(html,'text/html'); list = [];
            Array.prototype.forEach.call(doc.querySelectorAll('tr'),function (tr) {
                var a = tr.querySelector('a[href^="/torrent/"]'), m = tr.querySelector('a[href^="magnet:"]'), seeds = tr.querySelector('.green');
                if (a && m) list.push({Title:a.textContent,MagnetUri:m.getAttribute('href'),Seeders:Number((seeds ? seeds.textContent : '').replace(/\D/g,'')),Tracker:spec.name});
            });
            return list.slice(0,100);
        }
        if (!json || typeof json !== 'object') throw new Error('Unexpected response');
        if (kind === 'jackett' || kind === 'jacred') list = array(json.Results);
        else if (kind === 'prowlarr') list = array(json).filter(function (v) { return !v.protocol || v.protocol === 'torrent'; });
        else if (kind === 'knaben') list = array(json.hits).filter(function (v) {
            var cats = v.categoryId || []; if (!Array.isArray(cats)) cats = [cats];
            return !cats.some(function (n) { return Number(n) >= 5000000 && Number(n) < 7000000; });
        }).map(function (v) { return {Title:v.title,InfoHash:v.hash,MagnetUri:v.magnetUrl || magnet(v.hash),Link:v.link,Seeders:v.seeders,Tracker:v.tracker || v.trackerId || spec.name}; });
        else if (kind === 'csv') list = array(json.torrents).map(function (v) { return {Title:v.name,MagnetUri:magnet(v.infohash),Seeders:v.seeders}; });
        else if (kind === 'apibay') list = array(json).filter(function (v) { return v.id !== '0' && /^20[0-9]$/.test(String(v.category)); }).map(function (v) { return {Title:v.name,MagnetUri:magnet(v.info_hash),Seeders:v.seeders}; });
        else if (kind === 'eztv') list = array(json.torrents_count === 0 ? [] : json.torrents).map(function (v) { return {Title:v.title,MagnetUri:v.magnet_url || magnet(v.hash),Seeders:v.seeds}; });
        else if (kind === 'yts') {
            if (json.status !== 'ok' || !json.data || typeof json.data.movie_count !== 'number') throw new Error('Unexpected YTS response');
            list = [];
            array(json.data.movies || []).forEach(function (m) { array(m.torrents || []).forEach(function (t) {
                list.push({Title:(m.title_long || m.title + ' (' + m.year + ')') + ' ' + t.quality + ' ' + (t.type === 'web' ? 'WEBRip' : 'BluRay') + ' ' + (t.video_codec || '') + ' YTS',MagnetUri:magnet(t.hash),Seeders:t.seeds});
            }); });
        } else throw new Error('Unknown source');
        return list.filter(function (v) { return v && typeof v === 'object'; }).map(function (v) { return Object.assign({},v,{Tracker:v.Tracker || v.indexer || spec.name}); });
    }
    var api = {definitions:definitions,url:url,parse:parse,relevant:relevant,imdb:imdb};
    if (typeof module === 'object' && module.exports) module.exports = api;
    else if (root && !root.CinemaHallProviders) root.CinemaHallProviders = api;
}(typeof window !== 'undefined' ? window : null));
