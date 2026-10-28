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
