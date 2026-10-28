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

/* CinemaHall Streams 0.2.0 — standalone Lampa plugin. GPL-3.0-or-later. */
(function (root) {
    'use strict';
    var VOICES = [
        ['LostFilm', /lost[ ._-]?film/i], ['Кубик в Кубе', /кубик\s*в\s*кубе|kubik/i],
        ['NewStudio', /new[ ._-]?studio/i], ['HDrezka', /hd[ ._-]?rezka/i],
        ['TVShows', /tv[ ._-]?shows/i], ['AlexFilm', /alex[ ._-]?film/i],
        ['Jaskier', /jaskier/i], ['BaibaKo', /baiba[ ._-]?ko/i],
        ['Дубляж', /дубляж|дублирован|\bDUB\b/i], ['Многоголосая', /многоголос|\bMVO\b/i],
        ['Двухголосая', /двухголос|\bDVO\b/i], ['Одноголосая', /одноголос|\bAVO\b|\bVO\b/i]
    ];
    function str(v) { return v == null ? '' : String(v); }
    function esc(v) { return str(v).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
    function unique(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
    function number(v) { var n = Number(v); return isFinite(n) && n >= 0 ? n : 0; }
    function base32(s) {
        var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', bits = 0, val = 0, out = '';
        for (var i = 0; i < s.length; i++) {
            var n = alphabet.indexOf(s.charAt(i).toUpperCase());
            if (n < 0) return '';
            val = (val << 5) | n; bits += 5;
            if (bits >= 8) { bits -= 8; out += ('0' + ((val >>> bits) & 255).toString(16)).slice(-2); }
        }
        return out;
    }
    function hash(value) {
        var s = str(value).trim(), match;
        if (/^magnet:/i.test(s)) {
            var xt = s.slice(s.indexOf('?') + 1).split('&').filter(function (part) { return /^xt=/i.test(part); }).map(function (part) {
                try { return decodeURIComponent(part.slice(3)); } catch (_) { return ''; }
            });
            var v1 = xt.filter(function (v) { return /^urn:btih:/i.test(v); })[0];
            var v2 = xt.filter(function (v) { return /^urn:btmh:1220[a-f0-9]{64}$/i.test(v); })[0];
            if (v1) s = v1.slice(9); else return v2 ? 'btmh:' + v2.slice(9).toLowerCase() : '';
        }
        if (/^[a-f0-9]{40}$/i.test(s)) return 'btih:' + s.toLowerCase();
        if (/^[a-z2-7]{32}$/i.test(s)) return 'btih:' + base32(s);
        return '';
    }
    function profile(title) {
        var s = str(title), r = s.match(/\b(2160|1440|1080|720|576|480|360)[pi]\b/i);
        var resolution = r ? Number(r[1]) : /\b(?:4k|uhd)\b/i.test(s) ? 2160 : 0;
        var codec = /\b(?:hevc|x265|h[ .]?265)\b/i.test(s) ? 'HEVC' : /\b(?:avc|x264|h[ .]?264)\b/i.test(s) ? 'AVC' : /\bAV1\b/i.test(s) ? 'AV1' : '';
        var dv = /\bDV\b|dolby[ ._-]?vision/i.test(s), hdr = /HDR10\+|HDR10Plus/i.test(s) ? 'HDR10+' : /\bHDR10\b/i.test(s) ? 'HDR10' : /\bHDR\b/i.test(s) ? 'HDR' : '';
        var media = /\b(?:HDCAM|CAMRip|CAM|TS|TELESYNC)\b/i.test(s) ? 'Камера' : /remux/i.test(s) ? 'Remux' : /blu[ ._-]?ray|bdrip/i.test(s) ? 'BluRay' : /web[ ._-]?(?:dl|rip)/i.test(s) ? 'WEB' : '';
        var label = [resolution ? resolution + 'p' : 'Качество не указано', codec, dv ? (hdr ? 'DV + ' + hdr : 'Dolby Vision') : hdr, media].filter(Boolean).join(' · ');
        return {resolution: resolution, codec: codec, dv: dv, hdr: hdr, media: media, label: label};
    }
    // Strict filename matching. A season/episode range is never an exact episode.
    function episode(path) {
        var s = str(path), m = s.match(/(?:^|[^a-z0-9])S(\d{1,2})[ ._-]*E(\d{1,3})(?!\d)/i) || s.match(/(?:^|[^a-z0-9])(\d{1,2})x(\d{1,3})(?!\d)/i);
        if (m) {
            var tail = s.slice(m.index + m[0].length);
            if (/^(?:[ ._-]*E\d|\s*[-–]\s*(?:E)?\d)/i.test(tail)) return null;
            return {season: Number(m[1]), episode: Number(m[2])};
        }
        var season = s.match(/(?:сезон|season)[ ._-]*(\d{1,2})|(\d{1,2})[ ._-]*(?:сезон|season)/i);
        var ep = s.match(/(?:серия|episode)[ ._-]*(\d{1,3})/i) || s.match(/(\d{1,3})[ ._-]*(?:серия|episode)/i);
        if (season && ep) return {season: Number(season[1] || season[2]), episode: Number(ep[1] || ep[2])};
        var normalized = s.replace(/\\/g, '/'), filename = normalized.split('/').pop().replace(/\.[^.]+$/, '');
        var folder = normalized.match(/(?:^|\/)(?:S|Season[ ._-]*|Сезон[ ._-]*)(\d{1,2})(?:\/|$)/i);
        var efile = filename.match(/(?:^|[^a-z0-9])E(\d{1,3})(?!\d)/i) || filename.match(/^(\d{1,3})(?:[ ._-]|$)/);
        var fileTail = efile ? filename.slice(efile.index + efile[0].length) : '';
        var range = /^(?:\s*[-–]\s*E?\d|[ ._-]*E\d)/i.test(fileTail) || /^(?:E)?\d{1,3}\s*[-–]\s*(?:E)?\d/i.test(filename);
        return folder && efile && !range ? {season:Number(folder[1]),episode:Number(efile[1])} : null;
    }
    function normalize(raw) {
        var title = str(raw.Title || raw.title), links = unique([raw.MagnetUri, raw.magnetUrl, raw.magnet, raw.Link, raw.downloadUrl].filter(function (x) { return /^(?:magnet:|https?:\/\/)/i.test(str(x)); }));
        var ih = hash(raw.InfoHash || raw.infoHash) || hash(raw.MagnetUri || raw.magnetUrl || raw.magnet) || hash(raw.Link) || hash(raw.downloadUrl);
        // Lampa's lowercase `hash` is a title hash, NEVER an info-hash.
        return {title: title, hash: ih, links: links, seeds: number(raw.Seeders == null ? raw.seeders : raw.Seeders),
            trackers: [str(raw.Tracker || raw.indexer || 'Источник')], profile: profile(title),
                voices: VOICES.filter(function (v) { return v[1].test(title); }).map(function (v) { return v[0]; }), raw: raw};
    }
    function merge(rows) {
        var known = Object.create(null), result = [];
        rows.forEach(function (raw) {
            var item = normalize(raw);
            if (!item.links.length) return;
            var prev = item.hash && known[item.hash];
            if (prev) {
                prev.links = unique(prev.links.concat(item.links)); prev.trackers = unique(prev.trackers.concat(item.trackers));
                prev.seeds = Math.max(prev.seeds, item.seeds); prev.voices = unique(prev.voices.concat(item.voices));
                // Keep the richer technical title when mirrors omit its metadata.
                if (item.profile.resolution && !prev.profile.resolution) { prev.profile = item.profile; prev.title = item.title; }
            } else { result.push(item); if (item.hash) known[item.hash] = item; }
        });
        return result;
    }
    function rank(a, b) { return b.seeds - a.seeds || a.title.localeCompare(b.title); }
    function groups(items) {
        var map = Object.create(null), result = [];
        items.forEach(function (item) {
            var key = item.profile.label, g = map[key];
            if (!g) { g = {title: key, resolution: item.profile.resolution, items: [], voices: Object.create(null)}; map[key] = g; result.push(g); }
            g.items.push(item);
            (item.voices.length ? item.voices : ['Озвучка не указана']).forEach(function (voice) {
                if (!g.voices[voice]) g.voices[voice] = [];
                g.voices[voice].push(item);
            });
        });
        return result.sort(function (a, b) { return b.resolution - a.resolution || a.title.localeCompare(b.title); });
    }
    function videos(files) {
        return (files || []).filter(function (f) {
            return /\.(?:mkv|mp4|m4v|avi|mov|ts|m2ts|webm|mpg|mpeg)$/i.test(f.path || '') &&
                !/(?:^|[\/\\ ._-])(?:sample|trailer|трейлер)(?:[\/\\ ._-]|$)/i.test(f.path);
        });
    }
    function filesFor(files, target) {
        return videos(files).filter(function (f) {
            if (!target) return true;
            var e = episode(f.path);
            return e && e.season === target.season && e.episode === target.episode;
        });
    }
    function cardKey(movie) { return (movie.source || 'tmdb') + ':' + (movie.name || movie.original_name ? 'tv:' : 'movie:') + movie.id; }
    function autoCandidates(list, cap) {
        var result = [];
        list.filter(function (g) { return g.resolution > 0 && g.resolution <= cap && g.items[0].profile.media !== 'Камера'; }).forEach(function (g) { result = result.concat(g.items.slice().sort(rank)); });
        return result;
    }
    var core = {hash: hash, profile: profile, episode: episode, merge: merge, groups: groups, filesFor: filesFor, esc: esc, cardKey:cardKey, autoCandidates:autoCandidates};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }
    if (!root || root.CinemaHallStreams) return;
    var providers = root.CinemaHallProviders;
    var api = root.CinemaHallStreams = {version: '0.2.0', core: core}, L, $, session;
    var searchCache = Object.create(null), sourceHealth = Object.create(null), sourceLast = Object.create(null);
    function setting(name, fallback) { var v = L.Storage.field(name); return v == null || v === '' ? fallback : v; }
    function enabled() { return str(setting('ch_streams_enabled', 'true')) !== 'false'; }
    function notify(s) { L.Noty.show(s); }
    function stop() {
        if (!session) return;
        session.cancelled = true;
        session.cleanups.splice(0).forEach(function (fn) { fn(); });
        session = null;
    }
    function active(s) { return !s.cancelled && (s.detached || session === s); }
    function guard(s, call, timeout, done, fail) {
        var ended = false, timer;
        function finish(fn, value) { if (ended) return; ended = true; clearTimeout(timer); if (active(s)) fn(value); }
        timer = setTimeout(function () { finish(fail, 'Время ожидания истекло'); }, timeout);
        s.cleanups.push(function () { ended = true; clearTimeout(timer); });
        try { call(function (v) { finish(done, v); }, function (e) { finish(fail, e); }); } catch (_) { finish(fail, 'Ошибка вызова API'); }
    }
    function request(s, url, done, fail, options) {
        var net = new L.Reguest();
        s.cleanups.push(function () { net.clear(); });
        guard(s, function (ok, no) { net.timeout(s.timeout || 18000); net.native(url, ok, no, false, options); }, (s.timeout || 18000) + 1000, done, fail);
    }
    function closeLoading() { L.Modal.close(); }
    function loading(s, text) {
        L.Modal.open({title: 'CinemaHall', html: $('<div class="ch-streams-wait"></div>').text(text), size: 'medium',
            onBack: function () { stop(); L.Torserver.clear(); closeLoading(); L.Controller.toggle(s.controller); }});
    }
    function select(s, title, entries, onSelect, onBack) {
        if (!active(s)) return;
        L.Select.show({title: title, items: entries.map(function (v) {
            // Select templates interpolate HTML. Escape all external strings.
            return {title: esc(v.title), subtitle: esc(v.subtitle || ''), value: v.value};
        }), onSelect: function (v) { if (active(s)) onSelect(v.value); }, onBack: function () {
            if (onBack) onBack(); else { stop(); L.Controller.toggle(s.controller); }
        }});
    }
    function getSources() {
        var mode = setting('ch_sources', 'all'), sources = mode === 'current' ? [] : providers.definitions.filter(function (p) { return String(setting('ch_source_' + p.id,true)) !== 'false'; }).map(function (p) { return Object.assign({},p); }), type = setting('parser_torrent_type', 'jackett');
        ['jackett', 'prowlarr'].forEach(function (kind) {
            if (mode === 'current' && type !== kind) return;
            ['', '_two'].forEach(function (suffix, index) {
                var use = setting('parser_use_link', 'one');
                if (mode === 'current' && ((use === 'one' && index) || (use === 'two' && !index))) return;
                var base = str(setting(kind + '_url' + suffix, '')).trim().replace(/\/+$/, '');
                if (/^https?:\/\//i.test(base)) sources.push({id:kind + suffix,name:kind + (index ? ' 2' : ''),kind: kind, base: base, key: str(setting(kind + '_key' + suffix, ''))});
            });
        });
        return sources.filter(function (v, i, a) { return a.findIndex(function (n) { return n.kind === v.kind && n.base === v.base && n.key === v.key; }) === i; });
    }
    function search(s) {
        if (s.serial && setting('ch_sources','all') !== 'current' && String(setting('ch_source_eztv',true)) !== 'false' && !providers.imdb(s.movie) && !s.imdbTried && s.movie.id && (!s.movie.source || /^(tmdb|cinemahall)$/.test(s.movie.source))) {
            s.imdbTried = true;
            var tmdb = L.Api.sources.tmdb;
            if (tmdb && tmdb.get) {
                loading(s,'Уточняем идентификатор сериала…');
                guard(s,function (ok,no) { tmdb.get('tv/' + s.movie.id + '/external_ids',{},ok,no); },3000,function (ids) {
                    s.movie = Object.assign({},s.movie,{external_ids:ids}); search(s);
                },function () { search(s); });
                return;
            }
        }
        loading(s, 'Поиск и объединение источников…');
        var sources = getSources().filter(function (p) { return !(p.movie && s.serial) && !(p.tv && (!s.serial || !providers.imdb(s.movie))); });
        var rows = [], pending = 0, index = 0, completed = 0, successes = 0, ended = false;
        var deadline = setTimeout(finish,12000);
        s.cleanups.push(function () { clearTimeout(deadline); });
        if (!sources.length && setting('ch_sources','all') === 'current') {
            s.timeout = null; clearTimeout(deadline);
            guard(s,function (ok,no) { L.Parser.get({search:s.query,movie:s.movie,from_search:true},ok,no); },12000,function (json) { rows = json.Results || []; successes = 1; finish(); },finish);
            return;
        }
        s.timeout = 6500;
        function finish() {
            if (!active(s) || ended) return;
            ended = true; clearTimeout(deadline);
            closeLoading(); s.timeout = null;
            s.items = merge(rows); s.groups = groups(s.items);
            if (!s.items.length) {
                notify(successes ? 'Раздачи не найдены. Доступность источников — в настройках CinemaHall.' : 'Источники недоступны. Открой «Состояние источников» в настройках CinemaHall.');
                stop(); L.Controller.toggle(s.controller); return;
            }
            if (successes < sources.length) notify('Часть источников недоступна. Найдено раздач: ' + s.items.length);
            if (s.automatic) automatic(s); else chooseQuality(s);
        }
        function pump() {
            if (!active(s) || ended) return;
            if (completed === sources.length) { finish(); return; }
            while (pending < 3 && index < sources.length) run(sources[index++]);
        }
        function run(spec) {
            pending++;
            var international = /^(knaben|csv|apibay)$/.test(spec.kind), original = s.movie.original_title || s.movie.original_name;
            var queries = international && original && original !== s.query ? [original,s.query] : !/^(jacred|yts|eztv)$/.test(spec.kind) && original && original !== s.query ? [s.query,original] : [s.query];
            var attempt = 0, url, cacheKey, started = Date.now(), id = spec.id;
            var health = sourceHealth[id];
            function end(list, error, cached) {
                if (!active(s) || ended) return;
                if (!error) { successes++; rows = rows.concat(list); }
                sourceHealth[id] = {name:spec.name,status:error ? 'error' : 'ok',count:list.length,ms:Date.now()-started,time:Date.now(),cached:!!cached,code:error && Number(error.status) || 0,schema:!!(error && error.schema)};
                pending--; completed++; pump();
            }
            if (health && health.status === 'error' && Date.now() - health.time < 60000) { pending--; completed++; pump(); return; }
            sourceHealth[id] = {name:spec.name,status:'pending',time:Date.now(),count:0};
            function next() {
                if (!active(s) || ended) return;
                url = providers.url(spec,queries[attempt++],s.movie,s.serial); cacheKey = url;
                var cached = searchCache[cacheKey];
                if (cached && Date.now()-cached.time < 300000) { received(cached.rows,true); return; }
                var wait = Math.max(0,(sourceLast[id] || 0) + 2200 - Date.now());
                function send() {
                    if (!active(s) || ended) return;
                    sourceLast[id] = Date.now();
                    request(s,url,function (json) {
                        if (ended) return;
                        var list;
                        try { list = providers.parse(spec,json,root.DOMParser); }
                        catch (_) { end([],{schema:true}); return; }
                        var keys = Object.keys(searchCache); if (keys.length >= 24) delete searchCache[keys[0]];
                        searchCache[cacheKey] = {time:Date.now(),rows:list}; received(list,false);
                    },function (e) { end([],e || {status:0}); },{dataType:spec.kind === 'rutor' ? 'text' : 'json'});
                }
                var timer = setTimeout(send,wait); s.cleanups.push(function () { clearTimeout(timer); });
            }
            function received(list,cached) {
                if (ended) return;
                list = list.filter(function (row) { return providers.relevant(row,s.movie,s.serial); });
                if (!list.length && attempt < queries.length) next();
                else end(list,null,cached);
            }
            next();
        }
        pump();
    }
    function diagnostics() {
        var entries = getSources().map(function (p) {
            var h = sourceHealth[p.id], text = !h ? 'Ещё не проверен' : h.status === 'pending' ? 'Не завершён за отведённое время' : h.status === 'ok' ? h.count + ' раздач · ' + (h.cached ? 'кэш' : h.ms + ' мс') : 'Недоступен' + (h.schema ? ' · неожиданный формат ответа' : h.code ? ' · HTTP ' + h.code : ' · сеть или таймаут');
            return {title:esc(p.name),subtitle:esc(text),value:p.id};
        });
        entries.push({title:'Сбросить кэш и паузы после ошибок',value:'reset'});
        L.Select.show({title:'Источники · последний поиск',items:entries,onSelect:function (v) {
            if (v.value === 'reset') { searchCache = Object.create(null); sourceHealth = Object.create(null); notify('Кэш и паузы сброшены'); }
            L.Controller.toggle('settings');
        },onBack:function () { L.Controller.toggle('settings'); }});
    }
    function automatic(s) {
        var candidates = autoCandidates(s.groups, Number(setting('ch_max_resolution', '1080')));
        if (!candidates.length) { notify('Нет вариантов в пределах качества «Авто». Выбери качество вручную.'); chooseQuality(s); return; }
        beginPlayback(s, candidates, function () { chooseQuality(s); });
    }
    function chooseQuality(s, selected) {
        if (!active(s)) return;
        var index = Math.max(0, s.groups.indexOf(selected)), panel, startX;
        function close() {
            closeLoading();
            if (s.inPlayer) { L.Controller.toggle('player'); return; }
            if (s.serial) chooseSeason(s); else { stop(); L.Controller.toggle(s.controller); }
        }
        function auto() {
            closeLoading(); automatic(s);
        }
        function render(update) {
            var group = s.groups[index];
            panel = $('<div class="ch-watch"></div>');
            var heading = $('<div class="ch-watch__heading"></div>').text(s.movie.title || s.movie.name || s.query);
            panel.append(heading);
            panel.append($('<div class="ch-watch__context"></div>').text(s.target ? 'Сезон ' + s.target.season + ' · Серия ' + s.target.episode : 'Фильм'));
            var tabs = $('<div class="ch-watch__tabs"></div>'); panel.append(tabs);
            s.groups.forEach(function (g, i) {
                var tab = $('<div class="selector ch-watch__tab"></div>').text(g.title).toggleClass('ch-watch__tab--active', index === i);
                tab.on('hover:enter', function () { index = i; render(true); }); tabs.append(tab);
            });
            function row(title, description, items, automatic) {
                var button = $('<div class="selector ch-watch__voice"><div class="ch-watch__voice-title"></div><div class="ch-watch__voice-note"></div></div>');
                button.find('.ch-watch__voice-title').text(title); button.find('.ch-watch__voice-note').text(description);
                button.on('hover:enter', function () {
                    if (automatic) { auto(); return; }
                    closeLoading(); beginPlayback(s, items.slice().sort(rank), function () { chooseQuality(s, group); });
                }); panel.append(button);
            }
            row('Смотреть автоматически', 'Подбор качества и источника · максимум 8 попыток', [], true);
            row('Авто · ' + group.title, 'Любая доступная озвучка в выбранном качестве', group.items);
            Object.keys(group.voices).forEach(function (voice) { row(voice, 'Вариантов: ' + group.voices[voice].length, group.voices[voice]); });
            panel.append($('<div class="ch-watch__note"></div>').text('Озвучка определена по названию раздачи. Аудиодорожки выбираются в плеере.'));
            panel.on('touchstart', function (e) { var t = e.originalEvent.touches; if (t && t[0]) startX = t[0].clientX; });
            panel.on('touchend', function (e) {
                var t = e.originalEvent.changedTouches;
                if (t && t[0] && startX != null && Math.abs(t[0].clientX - startX) > 70) {
                    index = (index + (t[0].clientX < startX ? 1 : -1) + s.groups.length) % s.groups.length; render(true);
                } startX = null;
            });
            if (update) L.Modal.update(panel);
            else L.Modal.open({title:'Качество и озвучка',html:panel,size:'large',onBack:close});
        }
        render(false);
    }
    function chooseSeason(s) {
        var seasons = (s.movie.seasons || []).filter(function (v) { return v.season_number != null; }).map(function (v) { return Number(v.season_number); });
        if (!seasons.length) for (var i = 1; i <= Math.min(Number(s.movie.number_of_seasons) || 1, 200); i++) seasons.push(i);
        select(s, 'Выбери сезон', unique(seasons).sort(function (a,b) { return a-b; }).map(function (n) {
            return {title: n ? 'Сезон ' + n : 'Спецвыпуски', value: n};
        }), function (n) {
            loading(s, 'Получение списка серий…');
            guard(s, function (ok) { L.Api.seasons(s.movie, [n], ok); }, 15000, function (data) {
                closeLoading(); var list = data && data[n] && data[n].episodes;
                if (!list || !list.length) { notify('Нет списка серий для этого сезона'); chooseSeason(s); return; }
                select(s, 'Сезон ' + n, list.map(function (e) { return {title: e.episode_number + '. ' + (e.name || 'Серия'), value: {season: n, episode: Number(e.episode_number)}}; }), function (e) {
                    s.target = e; if (s.items) chooseQuality(s); else search(s);
                }, function () { chooseSeason(s); });
            }, function () { closeLoading(); notify('Не удалось получить серии из каталога'); chooseSeason(s); });
        }, function () { if (s.inPlayer) L.Controller.toggle('player'); else { stop(); L.Controller.toggle(s.controller); } });
    }
    function nativeEngine(s, done, fail) {
        if (!root.CinemaHallNative) { done(); return; }
        var deadline = Date.now() + 25000;
        try { root.CinemaHallNative.startTorrentEngine(); } catch (_) { fail('Не удалось запустить встроенный движок'); return; }
        function check() {
            if (!active(s)) return;
            var state;
            try { state = JSON.parse(root.CinemaHallNative.torrentState()); } catch (_) { fail('Не удалось получить состояние движка'); return; }
            if (state.state === 'ready' && /^http:\/\/127\.0\.0\.1:\d+$/.test(state.url)) {
                L.Storage.set('torrserver_url',state.url); L.Storage.set('torrserver_use_link','one');
                L.Storage.set('internal_torrclient',true); done(); return;
            }
            if (state.state === 'error' || Date.now() > deadline) { fail(state.error || 'Встроенный движок не ответил вовремя'); return; }
            var timer = setTimeout(check,200); s.cleanups.push(function () { clearTimeout(timer); });
        }
        check();
    }
    function beginPlayback(s, candidates, back, resolved, nativeReady) {
        if (root.CinemaHallNative && !nativeReady) {
            if (!resolved) loading(s,'Запуск встроенного торрентного движка…');
            nativeEngine(s,function () { if (!resolved) closeLoading(); beginPlayback(s,candidates,back,resolved,true); },function (message) { if (!resolved) closeLoading(); notify(message); back(); }); return;
        }
        if (!L.Torserver || !L.Torserver.url()) { notify('Укажи адрес TorrServer в настройках Lampa'); back(); return; }
        var attempts = [], count = 0;
        if (!resolved) s.attemptBudget = 8;
        candidates.forEach(function (c) { c.links.forEach(function (link) { if (attempts.length < 8) attempts.push({item: c, link: link}); }); });
        if (!resolved) loading(s, 'Проверка источника и файлов…');
        function next() {
            if (!active(s)) return;
            if (count >= attempts.length || s.attemptBudget <= 0) { if (!resolved) closeLoading(); notify('Подходящий файл не найден или источники недоступны'); back(); return; }
            s.attemptBudget--;
            var attempt = attempts[count++];
            guard(s, function (ok, no) { L.Torserver.hash({link: attempt.link, title: attempt.item.title, data: {movie: s.movie}}, ok, no); }, 12000,
                function (data) { if (!data || !data.hash) { next(); return; } pollFiles(data.hash, Date.now() + 22000, attempt.item); }, next);
        }
        function pollFiles(ih, until, candidate) {
            if (!active(s)) return;
            var completed = false;
            function retry() {
                if (completed || !active(s)) return; completed = true;
                if (Date.now() >= until) { next(); return; }
                var timer = setTimeout(function () { pollFiles(ih, until, candidate); }, 900);
                s.cleanups.push(function () { clearTimeout(timer); });
            }
            guard(s, function (ok, no) { L.Torserver.files(ih, ok, no); }, 3000, function (data) {
                if (!data || !data.file_stats || !data.file_stats.length) { retry(); return; }
                completed = true;
                var all = data.file_stats, matches = filesFor(data.file_stats, s.target);
                if (!matches.length) { next(); return; }
                if (resolved) { if (matches.length === 1) resolved({hash:ih,file:matches[0],candidate:candidate,all:all}); else next(); return; }
                closeLoading();
                if (matches.length === 1) launch(s, candidate, ih, matches[0], all, candidates, back);
                else select(s, 'Выбери файл', matches.map(function (f) { return {title: f.path.split('/').pop(), value: f}; }), function (f) {
                    launch(s, candidate, ih, f, all, candidates, back);
                }, back);
            }, retry);
        }
        guard(s, function (ok, no) { L.Torserver.connected(ok, no); }, 7000, next, function () {
            if (!resolved) closeLoading(); notify('TorrServer недоступен. Проверь подключение в настройках Lampa.'); back();
        });
    }
    function launch(s, candidate, ih, file, all, candidates, back) {
        if (!active(s)) return;
        function media(f) {
            var ep = episode(f.path), title = s.movie.title || s.movie.name || s.query;
            var timelineKey = 'ch:' + (s.movie.source || 'tmdb') + ':' + s.movie.id + ':' + (s.serial ? 'tv:' + (ep ? ep.season + ':' + ep.episode : ih + ':' + f.id) : 'movie');
            var link = L.Timeline.link ? L.Timeline.link(s.movie, ep && ep.season, ep && ep.episode) : null;
            return {title: title + (ep ? ' · S' + ep.season + 'E' + ep.episode : ''),
                url: L.Torserver.stream(f.path, ih, f.id).replace('&preload', '&play'),
                torrent_hash: ih, card: s.movie, season: ep && ep.season, episode: ep && ep.episode,
                timeline: L.Timeline.view(timelineKey, link), subtitles: subtitles(f, ih, all),
                launch_player:setting('ch_player','lampa'),
                __ch:true, __chCandidate:candidate};
        }
        // Only known episodes from the selected season enter the playlist.
        var playlist = (s.target ? videos(all).filter(function (f) { var e = episode(f.path); return e && e.season === s.target.season; }) : [file])
            .sort(function (a,b) { var ea = episode(a.path), eb = episode(b.path); return ea && eb ? ea.episode - eb.episode : 0; })
            .filter(function (f, i, a) { var e = episode(f.path); return !e || a.findIndex(function (v) { var k = episode(v.path); return k && k.season === e.season && k.episode === e.episode; }) === i; }).map(media);
        var item = media(file);
        if (!playlist.some(function (p) { return p.url === item.url; })) playlist.push(item);
        s.currentMedia = item; s.currentHash = ih; s.currentCandidate = candidate;
        s.runtimeAttempts = 0; s.failedCandidates = [];
        function recover(work, reserve) {
            if (!active(s) || s.recovering) return;
            if (++s.runtimeAttempts >= 8) { notify('Источники исчерпаны. Выбери другое качество или озвучку.'); return; }
            s.recovering = true;
            var failed = work.__chCandidate || candidate;
            s.failedCandidates.push(failed.hash || failed.links[0]);
            var remaining = candidates.filter(function (c) { return s.failedCandidates.indexOf(c.hash || c.links[0]) < 0; });
            var target = s.target;
            if (work.episode != null) s.target = {season:work.season,episode:work.episode};
            notify('Источник не запустился. Проверяю следующий…');
            beginPlayback(s, remaining, function () { s.recovering = false; s.target = target; }, function (res) {
                s.recovering = false;
                work.url = L.Torserver.stream(res.file.path,res.hash,res.file.id).replace('&preload','&play');
                work.torrent_hash = res.hash; work.__chCandidate = res.candidate; s.currentHash = res.hash;
                work.subtitles = subtitles(res.file, res.hash, res.all);
                // The former torrent's playlist cannot be reused for another torrent.
                L.Player.playlist([work]); reserve(work.url);
            });
        }
        item.error = recover; playlist.forEach(function (p) { p.error = recover; });
        L.Favorite.add('history', s.movie, 100);
        item.playlist = playlist;
        L.Player.play(item); L.Player.playlist(playlist);
        L.Player.callback(function () { if (active(s)) back(); else L.Controller.toggle(s.controller); });
    }
    function subtitles(file, ih, all) {
        var name = file.path.replace(/\.[^.]+$/, '');
        return (all || []).filter(function (f) { return /\.(?:srt|vtt)$/i.test(f.path) && f.path.indexOf(name) === 0; }).map(function (f, i) {
            return {label:f.path.split('/').pop(),index:i,url:L.Torserver.stream(f.path,ih,f.id).replace('&preload','&play')};
        });
    }
    function playerControls(data) {
        var old = $('.ch-player-options'); old.remove();
        if (!data || !data.__ch || !session || !L.PlayerPanel) return;
        var s = session, button = $('<div class="button selector ch-player-options"><span>CinemaHall</span></div>');
        button.on('hover:enter', function () {
            if (!active(s)) return; s.inPlayer = true;
            if (data.episode != null) s.target = {season:data.season,episode:data.episode};
            s.currentMedia = data;
            select(s, 'Просмотр', [
                {title:'Качество и озвучка',value:'quality'},
                {title:s.serial ? 'Сезоны и серии' : 'Информация об источнике',value:s.serial ? 'episodes' : 'info'},
                {title:'Информация о TorrServer',value:'info'}
            ], function (action) {
                if (action === 'quality') chooseQuality(s);
                else if (action === 'episodes') chooseSeason(s);
                else {
                    loading(s, 'Статистика TorrServer…');
                    guard(s, function (ok,no) { L.Torserver.files(data.torrent_hash,ok,no); }, 3500, function (info) {
                        closeLoading();
                        select(s, 'TorrServer', [{title:'Скорость',subtitle:L.Utils.bytesToSize(info.download_speed || 0) + '/с',value:0},
                            {title:'Пиры',subtitle:String(info.active_peers || 0) + ' активных',value:0}], function () { L.Controller.toggle('player'); }, function () { L.Controller.toggle('player'); });
                    }, function () { closeLoading(); notify('Статистика недоступна'); L.Controller.toggle('player'); });
                }
            }, function () { L.Controller.toggle('player'); });
        });
        L.PlayerPanel.render().find('.player-panel__right.player-panel__tv-visible').first().prepend(button);
    }
    function open(movie, target, automaticMode) {
        stop(); var controller = L.Controller.enabled().name || 'content';
        var s = session = {movie: movie, query: movie.title || movie.name || movie.original_title || movie.original_name || '', serial: !!(movie.name || movie.original_name || movie.number_of_seasons), controller: controller, cleanups: [], cancelled: false, automatic:!!automaticMode};
        if (!s.query) { notify('У карточки нет названия'); stop(); return; }
        var resume = L.Storage.get('ch_resume',{})[cardKey(movie)];
        if (!target && automaticMode && resume && !resume.completed && resume.episode != null) target = {season:resume.season,episode:resume.episode};
        if (target) { s.target = target; search(s); }
        else if (s.serial) chooseSeason(s); else search(s);
    }
    function addButton(e) {
        if (!enabled() || e.type !== 'complite') return;
        var full = e.body || (e.object && e.object.activity && e.object.activity.render ? e.object.activity.render() : L.Activity.active().activity.render());
        var box = full.find('.full-start-new__buttons, .full-start__buttons').first();
        if (!box.length || box.find('.ch-streams-button').length) return;
        box.find('.button--play').toggleClass('hide',String(setting('ch_replace_watch',false)) === 'true');
        var saved = L.Storage.get('ch_resume',{})[cardKey(e.data.movie)];
        var button = $('<div class="full-start__button selector ch-streams-button"><svg><use xlink:href="#sprite-play"></use></svg><span></span></div>');
        button.find('span').text(saved && !saved.completed && saved.time > 15 ? 'Продолжить' : 'Смотреть');
        button.on('hover:enter', function () { open(e.data.movie,null,true); }); box.prepend(button);
        var variants = $('<div class="full-start__button selector ch-streams-variants"><span>Качество и озвучка</span></div>');
        variants.on('hover:enter',function () { open(e.data.movie); }); box.append(variants);
        if (e.data.movie.name || e.data.movie.original_name) {
            var series = $('<div class="full-start__button selector ch-series-button"><span>Сезоны и серии</span></div>');
            series.on('hover:enter', function () { open(e.data.movie); }); box.append(series);
        }
    }
    function init() {
        if (api.ready || !root.Lampa || !root.Lampa.SettingsApi) return;
        L = root.Lampa; $ = root.jQuery || root.$; if (!$) return; api.ready = true;
        var style = root.document.createElement('style'); style.id = 'ch-streams-layout';
        style.textContent = '.ch-watch{max-width:68em}.ch-watch__heading{font-size:1.5em;font-weight:700}.ch-watch__context,.ch-watch__note{opacity:.65;margin:.6em 0 1em}.ch-watch__tabs{display:flex;gap:.5em;overflow-x:auto;padding:.25em;margin:1em 0}.ch-watch__tab{padding:.65em .9em;border-radius:.5em;border:1px solid #555;white-space:nowrap}.ch-watch__tab--active{background:#eee;color:#111}.ch-watch__voice{padding:.85em 1em;border-radius:.5em;margin:.4em 0;background:rgba(255,255,255,.07)}.ch-watch__voice-title{font-weight:600}.ch-watch__voice-note{opacity:.6;font-size:.85em;margin-top:.3em}.ch-watch .focus{outline:2px solid #fff;outline-offset:2px}.ch-player-options{font-size:.7em!important;padding:0 .7em;white-space:nowrap}';
        root.document.head.appendChild(style);
        L.SettingsApi.addComponent({component:'ch_streams', name:'CinemaHall · просмотр', icon:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>'});
        [
            ['ch_streams_enabled','trigger',true,null,'Кнопка CinemaHall','После изменения открой карточку заново'],
            ['ch_replace_watch','trigger',false,null,'CinemaHall — основная кнопка просмотра','Скрыть стандартную кнопку «Смотреть»; изменение применяется при новом открытии карточки'],
            ['ch_sources','select','all',{all:'Встроенные + свои парсеры',current:'Только текущий парсер Lampa'},'Источники','По умолчанию поиск работает без ввода адресов и ключей'],
            ['ch_player','select','lampa',{lampa:'Встроенный Lampa',android:'Системный Android'},'Плеер','Системный вариант доступен для несовместимых форматов'],
            ['ch_max_resolution','select','1080',{'720':'720p','1080':'1080p','2160':'2160p'},'Предел качества в режиме «Авто»','Ручной выбор показывает все качества']
        ].forEach(function (p) { L.SettingsApi.addParam({component:'ch_streams',param:{name:p[0],type:p[1],default:p[2],values:p[3]},field:{name:p[4],description:p[5]}}); });
        providers.definitions.forEach(function (p) {
            L.SettingsApi.addParam({component:'ch_streams',param:{name:'ch_source_' + p.id,type:'trigger',default:true},field:{name:p.name,description:p.tv ? 'Сериалы · при наличии IMDb в карточке' : p.movie ? 'Фильмы · международные релизы' : 'Встроенный поиск · без ключа'}});
        });
        L.SettingsApi.addParam({component:'ch_streams',param:{name:'ch_source_status',type:'button'},field:{name:'Состояние источников',description:'Последний поиск, ошибки и очистка кэша'},onChange:diagnostics});
        api.diagnostics = function () { return JSON.parse(JSON.stringify(sourceHealth)); };
        L.Listener.follow('full', addButton);
        L.Player.listener.follow('ready', playerControls);
        L.Player.listener.follow('start',function (data) {
            if (!data || !data.__ch || !L.PlayerVideo || !L.PlayerVideo.listener) return;
            var last = 0, latest;
            function save() {
                if (!latest || latest.current < 1 || !latest.duration) return;
                var all = L.Storage.get('ch_resume',{}), keys = Object.keys(all);
                if (keys.length >= 100 && !all[cardKey(data.card)]) delete all[keys.sort(function (a,b) { return (all[a].updated || 0) - (all[b].updated || 0); })[0]];
                all[cardKey(data.card)] = {season:data.season,episode:data.episode,time:latest.current,duration:latest.duration,completed:latest.current / latest.duration >= .95,updated:Date.now()};
                L.Storage.set('ch_resume',all);
            }
            function time(e) { latest = e; if (Date.now()-last >= 15000) { last = Date.now(); save(); } }
            function destroy() { save(); L.PlayerVideo.listener.remove('timeupdate',time); L.Player.listener.remove('destroy',destroy); }
            L.PlayerVideo.listener.follow('timeupdate',time); L.Player.listener.follow('destroy',destroy);
        });
        L.Player.listener.follow('close', function () { $('.ch-player-options').remove(); if (session) session.inPlayer = false; });
        if (root.CinemaHallNative) {
            $('body').addClass('ch-native');
            L.Storage.set('internal_torrclient',true);
            if (L.Storage.get('ch_native_setup',false) !== true) {
                L.Storage.set('ch_start_home',true); L.Storage.set('ch_replace_watch',true); L.Storage.set('ch_native_setup',true);
            }
        }
        api.open = open; api.stop = stop;

    }
    if (root.appready) init();
    else if (root.Lampa && root.Lampa.Listener) root.Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') init(); });
    if (root.document) root.document.addEventListener('lampa:ready', init);
}(typeof window !== 'undefined' ? window : null));

/* CinemaHall lightweight catalog. Bundled into cinemahall.js. */
(function (root) {
    'use strict';
    if (!root || root.CinemaHallCatalog) return;
    var api = root.CinemaHallCatalog = {version:'0.1.0'}, L, $, base, pending = 0;
    function clone(o) { var out = {}; Object.keys(o || {}).forEach(function (k) { out[k] = o[k]; }); return out; }
    function anime(card) { return /^(ja|zh)$/.test(card.original_language || '') && (card.genre_ids || (card.genres || []).map(function (g) { return g.id; })).indexOf(16) >= 0; }
    function clean(items) {
        var seen = Object.create(null);
        return (items || []).filter(function (v) {
            var key = (v.original_name || v.first_air_date ? 'tv:' : 'movie:') + v.id;
            if (anime(v) || seen[key]) return false; seen[key] = true; return true;
        });
    }
    function local(type, title) {
        var rows = clean(L.Favorite.get({type:type}));
        return rows.length ? {title:title, source:'tmdb', url:'', results:rows.slice(0,20)} : null;
    }
    function main(params, done, fail) {
        var generation = ++pending, rows = [], count = 3, successes = 0;
        var history = local('history', 'Недавно смотрели'), favorite = local('like', 'Избранное');
        var resumes = L.Storage.get('ch_resume',{}), core = root.CinemaHallStreams && root.CinemaHallStreams.core;
        var continued = core ? clean(L.Favorite.get({type:'history'})).filter(function (movie) { var resume = resumes[core.cardKey(movie)]; return resume && !resume.completed && resume.time > 15; }) : [];
        if (continued.length) rows.push({title:'Продолжить просмотр',source:'tmdb',results:continued.slice(0,16),url:''});
        if (history) rows.push(history); if (favorite) rows.push(favorite);
        var slots = [], specs = [
            {path:'movie/now_playing', title:'Новые фильмы'},
            {path:'trending/tv/week', title:'Сериалы недели'},
            {path:'movie/top_rated', title:'Фильмы с высоким рейтингом'}
        ];
        function finish() {
            if (--count || generation !== pending) return;
            var all = rows.concat(slots.filter(Boolean));
            if (all.length || successes) done(all);
            else if (fail) fail();
        }
        specs.forEach(function (spec, i) {
            var ended = false, timer = setTimeout(function () { complete(); }, 12000);
            function complete(json) {
                if (ended) return; ended = true; clearTimeout(timer);
                if (json && Array.isArray(json.results)) {
                    successes++;
                    var data = clean(json.results);
                    if (data.length) slots[i] = {title:spec.title, url:spec.path, source:'tmdb', results:data.slice(0,16), total_pages:json.total_pages || 1};
                }
                finish();
            }
            base.get(spec.path, {page:1}, complete, function () { complete(); }, {life:20});
        });
    }
    function menu() {
        var options = [
            ['Главная', 'home'], ['Поиск', 'search'], ['Фильмы', 'movie'], ['Сериалы', 'tv'],
            ['Каталог по жанрам', 'genres'], ['Избранное', 'favorite'], ['История', 'history'], ['Настройки просмотра', 'settings']
        ];
        L.Select.show({title:'CinemaHall',items:options.map(function (o) { return {title:o[0],action:o[1]}; }),onSelect:function (item) {
            if (item.action === 'home') api.home();
            else if (item.action === 'search') L.Controller.toggle('search');
            else if (item.action === 'settings') L.Settings.create('ch_streams');
            else if (item.action === 'movie' || item.action === 'tv') L.Activity.push({component:'category',url:item.action,source:'cinemahall',title:item.action === 'movie' ? 'Фильмы' : 'Сериалы',page:1});
            else if (item.action === 'favorite') L.Activity.push({component:'favorite',type:'like',title:'Избранное',page:1});
            else if (item.action === 'history') L.Activity.push(Object.assign({page:1}, L.Favorite.historyActivity ? L.Favorite.historyActivity() : {component:'favorite',type:'history',title:'История'}));
            else if (item.action === 'genres') genres();
        },onBack:function () { L.Controller.toggle('menu'); }});
    }
    function genres() {
        base.menu({source:'tmdb'}, function (list) {
            L.Select.show({title:'Жанры',items:list,onSelect:function (g) {
                L.Activity.push({component:'category',url:'movie',genres:g.id,source:'cinemahall',title:g.title,page:1});
            },onBack:menu});
        });
    }
    function init() {
        if (api.ready || !root.Lampa || !root.Lampa.Api || !root.Lampa.Api.sources) return;
        L = root.Lampa; $ = root.jQuery || root.$; base = L.Api.sources.tmdb;
        if (!base || !$) return; api.ready = true;
        var source = clone(base);
        source.main = main;
        source.clear = function () { pending++; /* Lampa owns requests shared by its native sources. */ };
        source.discovery = function () {
            var discovery = base.discovery(); discovery.title = 'CinemaHall';
            discovery.search = function (params, done) { base.search(params, function (rows) {
                rows.forEach(function (row) { if (row.type !== 'person') row.results = clean(row.results); });
                done(rows.filter(function (row) { return row.results.length; }));
            }); }; return discovery;
        };
        L.Api.sources.cinemahall = source;
        api.home = function () { L.Activity.push({component:'main',source:'cinemahall',title:'CinemaHall',page:1}); };
        api.menu = menu;
        L.Menu.addButton('<svg><use xlink:href="#sprite-home"></use></svg>', 'CinemaHall', api.home).addClass('ch-home-menu');
        L.Menu.addButton('<svg><use xlink:href="#sprite-catalog"></use></svg>', 'CinemaHall · разделы', menu).addClass('ch-catalog-menu');
        var choices = {};
        Object.keys(L.Api.sources).forEach(function (key) { choices[key] = key === 'cinemahall' ? 'CinemaHall' : key.toUpperCase(); });
        L.Params.select('source', choices, 'tmdb');
        L.SettingsApi.addParam({component:'ch_streams',param:{name:'ch_start_home',type:'trigger',default:false},field:{name:'CinemaHall как источник по умолчанию',description:'Главная и каталог Lampa будут использовать CinemaHall'},onChange:function (v) {
            if (String(v) === 'true') L.Storage.set('source','cinemahall');
            else if (L.Storage.field('source') === 'cinemahall') L.Storage.set('source','tmdb');
        }});
        if (String(L.Storage.field('ch_start_home')) === 'true') L.Storage.set('source','cinemahall');
    }
    if (root.appready) init();
    else if (root.Lampa && root.Lampa.Listener) root.Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') init(); });
    if (root.document) root.document.addEventListener('lampa:ready', init);
}(typeof window !== 'undefined' ? window : null));

/* Curated Lampa extensions. Uses Lampa's installation, cache and disable mechanisms. */
(function (root) {
    'use strict';
    var LEVENDE = 'ce19d4a34b9152ff1adbc404be21add2d6aa3a7a', STORE = '316f1aa20774041db76475ee5f9c2160ce2fd994', NB = 'cde2cf057e6634df43553fe8deeaef5030f95945';
    function gh(repo,sha,file) { return 'https://raw.githubusercontent.com/' + repo + '/' + sha + '/' + file; }
    var catalog = [
        {id:'online_mod',title:'Онлайн Мод',category:'Онлайн',url:gh('nb557/plugins',NB,'online_mod.js'),alias:'https://nb557.github.io/plugins/online_mod.js',default:true,description:'Популярный онлайн-плагин: источники, качество и озвучки. Доступность зависит от провайдера.'},
        {id:'tv_status',title:'Цветные статусы сериалов',category:'Карточка',url:gh('levende/lampa-plugins',LEVENDE,'tv-status-color.js'),alias:'https://levende.github.io/lampa-plugins/tv-status-color.js',default:true,description:'Окрашивает статус сериала в карточке. Без отдельного сервера и фонового опроса.'},
        {id:'networks',title:'Платформы TMDB',category:'Карточка',url:gh('levende/lampa-plugins',LEVENDE,'tmdb-networks.js'),alias:'https://levende.github.io/lampa-plugins/tmdb-networks.js',default:true,description:'Платформы и студии в карточке, переход к их фильмам и сериалам.'},
        {id:'random',title:'Случайное из «На потом»',category:'Каталог',url:gh('levende/lampa-plugins',LEVENDE,'random-scheduled.js'),alias:'https://levende.github.io/lampa-plugins/random-scheduled.js',default:true,description:'Выбирает фильм из сохранённого списка. Без сетевых запросов.'},
        {id:'custom_favs',title:'Свои списки закладок',category:'Библиотека',url:gh('levende/lampa-plugins',LEVENDE,'custom-favs.js'),alias:'https://levende.github.io/lampa-plugins/custom-favs.js',description:'Пользовательские списки избранного. Загрузчик автора выбирает вариант под версию Lampa.'},
        {id:'profiles',title:'Профили',category:'Библиотека',url:gh('levende/lampa-plugins',LEVENDE,'profiles.js'),alias:'https://levende.github.io/lampa-plugins/profiles.js',description:'Раздельные профили и списки. Синхронизация настраивается в плагине автора.'},
        {id:'bookmark_sync',title:'Синхронизация закладок',category:'Библиотека',url:gh('levende/lampa-plugins',LEVENDE,'bookmarks-sync.js'),alias:'https://levende.github.io/lampa-plugins/bookmarks-sync.js',description:'Для пользователей с настроенным аккаунтом или сервером синхронизации. Требует настройки.'},
        {id:'collections',title:'Подборки',category:'Каталог',url:gh('lampaplugins/store',STORE,'p.js'),alias:'https://lampaplugins.github.io/store/p.js',description:'Дополнительные подборки. Может добавить собственный источник каталога.'},
        {id:'logos',title:'Логотипы фильмов',category:'Карточка',url:gh('lampaplugins/store',STORE,'logo.js'),alias:'https://lampaplugins.github.io/store/logo.js',description:'Логотипы TMDB вместо текстового заголовка. Добавляет запрос при открытии карточки.'},
        {id:'torrent_style',title:'Torrent Styles',category:'Просмотр',url:gh('lampaplugins/store',STORE,'torrent_styles_v2.js'),alias:'https://lampaplugins.github.io/store/torrent_styles_v2.js',description:'Оформление стандартного списка торрентов Lampa. Наш выбор качества остаётся отдельным.'},
        {id:'jellyfin',title:'Jellyfin',category:'Медиатека',url:gh('lampaplugins/store',STORE,'pavelpikta/jellyfin.js'),alias:'https://lampaplugins.github.io/store/pavelpikta/jellyfin.js',description:'Фильмы и сериалы со своего Jellyfin. Требуются адрес сервера и вход.'},
        {id:'filmix',title:'Filmix',category:'Онлайн',url:gh('lampaplugins/store',STORE,'fx.js'),alias:'https://lampaplugins.github.io/store/fx.js',description:'Отдельный онлайн-провайдер. Для части возможностей требуется аккаунт или подписка.'},
        {id:'bwa',title:'BwaRC',category:'Онлайн',url:'https://bwa.ad/rc',description:'Онлайн-провайдер из публичного каталога Lampa. Внешний сервис, доступность проверяется при загрузке.'},
        {id:'modss',title:'MODS’s',category:'Онлайн',url:'http://lampa.stream/modss',description:'Внешний онлайн-провайдер. Нужна поддержка HTTP либо рабочего HTTPS-зеркала на устройстве.'},
        {id:'showy',title:'Showy',category:'Онлайн',url:'http://showy.online/m.js',description:'Внешний онлайн-провайдер. Нужна поддержка HTTP либо рабочего HTTPS-зеркала на устройстве.'},
        {id:'skaz',title:'TV Skaz & Online',category:'Телевидение',url:'http://skaz.tv/tv.js',description:'IPTV и онлайн. Часть каналов требует подписки; доступ зависит от сервиса и региона.'},
        {id:'rutube_trailers',title:'Трейлеры RuTube',category:'Карточка',url:'https://plugin.rootu.top/rutube.js',description:'Дополнительная кнопка трейлеров. Видео и поиск предоставляет внешний сервис.'},
        {id:'itunes_trailers',title:'Трейлеры iTunes',category:'Карточка',url:'https://plugin.rootu.top/trailers.js',description:'Альтернативный источник трейлеров.'}
    ];
    if (typeof module === 'object' && module.exports) { module.exports = catalog; return; }
    if (!root || root.CinemaHallExtensions) return;
    var api = root.CinemaHallExtensions = {catalog:catalog}, L, initialized = false;
    function esc(v) { return String(v).replace(/[&<>"']/g,function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
    function installed(item) {
        return L.Plugins.get().filter(function (p) { return p.url === item.url || (item.alias && p.url === item.alias); })[0];
    }
    function state(item) {
        var plug = installed(item);
        if (!plug) return 'Не установлен';
        if (Number(plug.status) !== 1) return 'Выключен · перезапуск завершит отключение';
        if (L.Plugins.errors && L.Plugins.errors().indexOf(plug.url) >= 0) return 'Ошибка загрузки · попробуй позже';
        if (L.Plugins.loaded && L.Plugins.loaded().indexOf(plug.url) >= 0) return 'Включён в Lampa · доступность сервиса не проверена';
        return 'Включён · ожидается загрузка';
    }
    function enable(item) {
        var plug = installed(item);
        if (plug) {
            if (Number(plug.status) === 1) return;
            plug.status = 1; L.Plugins.save(); L.Plugins.push(plug);
        } else L.Plugins.add({url:item.url,status:1,name:item.title});
    }
    function show(category) {
        var list = catalog.filter(function (p) { return !category || p.category === category; });
        L.Select.show({title:category || 'CinemaHall · расширения',items:list.map(function (p) {
            return {title:esc(p.title),subtitle:esc(state(p) + ' · ' + p.category),value:p.id};
        }),onSelect:function (v) { details(catalog.filter(function (p) { return p.id === v.value; })[0],category); },onBack:function () { L.Controller.toggle('settings'); }});
    }
    function details(item,category) {
        if (!item) return;
        var plug = installed(item), on = plug && Number(plug.status) === 1;
        L.Select.show({title:item.title,items:[
            {title:on ? 'Выключить' : 'Включить',subtitle:esc(item.description),value:'toggle'},
            {title:'Источник расширения',subtitle:esc(item.url),value:'source'},
            {title:'Назад к списку',value:'back'}
        ],onSelect:function (v) {
            if (v.value === 'toggle') {
                if (on) { plug.status = 0; L.Plugins.save(); L.Noty.show('Выключено. Перезапусти Lampa для завершения отключения.'); }
                else { enable(item); L.Noty.show('Расширение включено. Для появления всех кнопок может понадобиться перезапуск.'); }
            }
            if (v.value === 'source') details(item,category); else show(category);
        },onBack:function () { show(category); }});
    }
    function defaults() {
        catalog.filter(function (p) { return p.default; }).forEach(function (p) {
            // Honour disabled or previously installed versions; never duplicate an author URL.
            if (!installed(p)) enable(p);
        });
    }
    function init() {
        if (initialized || !root.Lampa || !root.Lampa.SettingsApi || !root.Lampa.Plugins) return;
        initialized = true; L = root.Lampa;
        L.SettingsApi.addComponent({component:'ch_extensions',name:'CinemaHall · расширения',icon:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z"/></svg>'});
        function button(name,description,fn) { L.SettingsApi.addParam({component:'ch_extensions',param:{name:'ch_ext_' + name,type:'button'},field:{name:name,description:description},onChange:fn}); }
        button('Все расширения','18 расширений: установка, состояние и отключение',function () { show(); });
        ['Онлайн','Карточка','Каталог','Библиотека','Медиатека','Просмотр','Телевидение'].forEach(function (c) { button(c,'Расширения: ' + c,function () { show(c); }); });
        button('Отключить комплект','Выключить четыре предустановленных расширения; остальные сохранятся',function () {
            catalog.filter(function (p) { return p.default; }).forEach(function (p) { var plug = installed(p); if (plug) plug.status = 0; });
            L.Plugins.save(); L.Noty.show('Комплект выключен. Перезапусти Lampa.');
        });
        L.Listener.follow('full',function (e) {
            if (e.type !== 'complite') return;
            var plug = installed(catalog[0]); if (!plug || Number(plug.status) !== 1) return;
            var full = e.body || (e.object && e.object.activity && e.object.activity.render());
            if (!full || full.find('.view--torrent').length) return;
            // Online Mod inserts its button after this stock anchor, absent in some lite builds.
            full.find('.full-start-new__buttons, .full-start__buttons').first().append((root.jQuery || root.$)('<span class="view--torrent hide ch-online-anchor"></span>'));
        });
        if (!L.Storage.get('ch_extensions_setup_v1',false)) {
            defaults(); L.Storage.set('ch_extensions_setup_v1',true);
        }
        api.show = show; api.state = state;
    }
    if (root.appready) init();
    else if (root.Lampa && root.Lampa.Listener) root.Lampa.Listener.follow('app',function (e) { if (e.type === 'ready') init(); });
    if (root.document) root.document.addEventListener('lampa:ready',init);
}(typeof window !== 'undefined' ? window : null));
