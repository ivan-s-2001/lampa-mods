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
