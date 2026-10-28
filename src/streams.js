/* CinemaHall Streams 0.1.0 — standalone Lampa plugin. GPL-3.0-or-later. */
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
    var api = root.CinemaHallStreams = {version: '0.1.0', core: core}, L, $, session;
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
    function request(s, url, done, fail) {
        var net = new L.Reguest();
        s.cleanups.push(function () { net.clear(); });
        guard(s, function (ok, no) { net.timeout(s.timeout || 18000); net.native(url, ok, no); }, (s.timeout || 18000) + 1000, done, fail);
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
        var sources = [], type = setting('parser_torrent_type', 'jackett'), mode = setting('ch_sources', 'all');
        ['jackett', 'prowlarr'].forEach(function (kind) {
            if (mode === 'current' && type !== kind) return;
            ['', '_two'].forEach(function (suffix, index) {
                var use = setting('parser_use_link', 'one');
                if (mode === 'current' && ((use === 'one' && index) || (use === 'two' && !index))) return;
                var base = str(setting(kind + '_url' + suffix, '')).trim().replace(/\/+$/, '');
                if (/^https?:\/\//i.test(base)) sources.push({kind: kind, base: base, key: str(setting(kind + '_key' + suffix, ''))});
            });
        });
        return sources.filter(function (v, i, a) { return a.findIndex(function (n) { return n.kind === v.kind && n.base === v.base && n.key === v.key; }) === i; });
    }
    function sourceURL(spec, query, serial) {
        if (spec.kind === 'jackett') return spec.base + '/api/v2.0/indexers/all/results?apikey=' + encodeURIComponent(spec.key) + '&Query=' + encodeURIComponent(query) + '&Category[]=' + (serial ? '5000' : '2000');
        return spec.base + '/api/v1/search?apikey=' + encodeURIComponent(spec.key) + '&query=' + encodeURIComponent(query) + '&type=' + (serial ? 'tvsearch' : 'search') + '&categories=' + (serial ? '5000' : '2000');
    }
    function search(s) {
        loading(s, 'Поиск и объединение источников…');
        var sources = getSources(), rows = [], remaining = sources.length, successes = 0;
        function finish() {
            if (!active(s) || --remaining > 0) return;
            closeLoading();
            s.items = merge(rows); s.groups = groups(s.items);
            if (!s.items.length) {
                var original = s.movie.original_title || s.movie.original_name;
                if (successes && original && original !== s.query && !s.originalTried) { s.originalTried = true; s.query = original; search(s); return; }
                notify(successes ? 'Раздачи не найдены' : 'Парсеры не ответили. Проверь адреса, ключи и доступ с устройства.'); stop(); L.Controller.toggle(s.controller); return;
            }
            if (successes < sources.length) notify('Часть парсеров недоступна. Показаны результаты остальных.');
            if (s.automatic) automatic(s); else chooseQuality(s);
        }
        if (!sources.length) {
            // Retain support for Lampa's configured TorrServer parser.
            remaining = 1;
            guard(s, function (ok, no) { L.Parser.get({search: s.query, movie: s.movie, from_search: true}, ok, no); }, 20000,
                function (json) { successes++; rows = json.Results || []; finish(); }, finish);
            return;
        }
        sources.forEach(function (spec) {
            request(s, sourceURL(spec, s.query, s.serial), function (json) {
                var list = spec.kind === 'jackett' ? json.Results : json;
                if (Array.isArray(list)) { successes++; rows = rows.concat(list.filter(function (v) { return !v.protocol || v.protocol === 'torrent'; })); }
                finish();
            }, finish);
        });
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
            ['ch_sources','select','all',{all:'Все настроенные Jackett и Prowlarr',current:'Текущий парсер Lampa'},'Источники','Адреса и ключи берутся из настроек «Парсер»'],
            ['ch_player','select','lampa',{lampa:'Встроенный Lampa',android:'Системный Android'},'Плеер','Системный вариант доступен для несовместимых форматов'],
            ['ch_max_resolution','select','1080',{'720':'720p','1080':'1080p','2160':'2160p'},'Предел качества в режиме «Авто»','Ручной выбор показывает все качества']
        ].forEach(function (p) { L.SettingsApi.addParam({component:'ch_streams',param:{name:p[0],type:p[1],default:p[2],values:p[3]},field:{name:p[4],description:p[5]}}); });
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
