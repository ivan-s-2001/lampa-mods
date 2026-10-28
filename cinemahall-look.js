/* CinemaHall Look 0.1.0 — independent Lampa appearance plugin. GPL-3.0-or-later. */
(function (root) {
    'use strict';
    if (!root || root.CinemaHallLook) return;
    var api = root.CinemaHallLook = {version:'0.1.0'}, L, $, style;
    // Every rule is scoped to the opt-in body class. No templates or player methods are replaced.
    var css = `
body.ch-look {background:#0c1018;color:#f0f2f8;--ch-accent:#a69aff;--ch-ink:#10121b;--ch-surface:#171e2c;--ch-edge:rgba(255,255,255,.12)}
body.ch-look.ch-look-blue {--ch-accent:#83caff}
body.ch-look.ch-look-gold {--ch-accent:#f4cb87}
.ch-look .background {opacity:.3}
.ch-look .background__one,.ch-look .background__two {filter:none}
.ch-look .head {background:linear-gradient(180deg,rgba(12,16,24,.96),rgba(12,16,24,0))}
.ch-look .menu {background:#101622;border-right:1px solid var(--ch-edge)}
.ch-look .menu__item {border-radius:.6em;margin-bottom:.2em}
.ch-look .menu__item.focus {background:var(--ch-accent);color:var(--ch-ink)}
.ch-look .card__view {border-radius:.65em;overflow:hidden;background:var(--ch-surface)}
.ch-look .card.focus .card__view {outline:.17em solid var(--ch-accent);outline-offset:.2em;box-shadow:none}
.ch-look .card__title {font-weight:600}
.ch-look .card__age,.ch-look .card__quality {border-radius:.3em;background:#151b29;color:#f0f2f8}
.ch-look .card__vote {border-radius:.3em;background:#182c25;color:#ade5c9}
.ch-look .full-start-new__body {padding-top:1.5em}
.ch-look .full-start-new__poster {border-radius:.8em;overflow:hidden;box-shadow:0 1em 3em rgba(0,0,0,.25)}
.ch-look .full-start-new__title,.ch-look .full-start__title {font-weight:700;letter-spacing:-.025em;line-height:1.1}
.ch-look .full-start-new__tagline {opacity:.65}
.ch-look .full-start-new__details {opacity:.85}
.ch-look .full-start__rate {border-radius:.45em}
.ch-look .full-start__button {border-radius:.6em;background:#20283a;color:#edf0f7;border:1px solid var(--ch-edge);box-shadow:none}
.ch-look .full-start__button.focus {background:var(--ch-accent);border-color:var(--ch-accent);color:var(--ch-ink)}
.ch-look .ch-streams-button {background:var(--ch-accent);border-color:var(--ch-accent);color:var(--ch-ink);font-weight:700}
.ch-look .ch-streams-button.focus {background:#fff;border-color:#fff;outline:.12em solid var(--ch-accent);outline-offset:.2em}
.ch-look .full-descr__text {line-height:1.55;max-width:66em}
.ch-look .full-person__photo {border-radius:.7em;overflow:hidden}
.ch-look .items-line__title,.ch-look .full-descr__title {font-weight:650;letter-spacing:-.02em}
.ch-look .selectbox__body,.ch-look .modal__content,.ch-look .settings {background:#131a27;border-radius:.9em}
.ch-look .selectbox-item,.ch-look .settings-param {border-radius:.5em}
.ch-look .selectbox-item.focus,.ch-look .settings-param.focus {background:var(--ch-accent);color:var(--ch-ink)}
.ch-look .selectbox-item__subtitle {opacity:.72;line-height:1.4}
.ch-look .torrent-item {background:#182031;border:1px solid var(--ch-edge);border-radius:.6em;padding:1em}
.ch-look .torrent-item.focus {background:#242d43;outline:.12em solid var(--ch-accent)}
.ch-look .torrent-serial {border-radius:.6em;background:#182031}
.ch-look .torrent-serial.focus {outline:.12em solid var(--ch-accent);background:#242d43}
.ch-look .player-panel {background:linear-gradient(0deg,rgba(8,11,17,.98),rgba(8,11,17,.75),transparent)}
.ch-look .player-panel .focus {color:var(--ch-accent)}
.ch-look .simple-button {border-radius:.5em}
.ch-look .simple-button.focus {background:var(--ch-accent);color:var(--ch-ink)}
.ch-look .ch-streams-wait {padding:1.5em;line-height:1.5;color:#e0e5f4}
.ch-look .ch-watch__tab {border-color:var(--ch-edge);background:#20283a}
.ch-look .ch-watch__tab--active {background:var(--ch-accent);color:var(--ch-ink);border-color:var(--ch-accent)}
.ch-look .ch-watch__voice {background:#20283a;border:1px solid var(--ch-edge)}
.ch-look .ch-watch .focus {outline-color:var(--ch-accent)}
.ch-look .ch-watch__voice.focus {background:#2b3450}
.ch-look .ch-player-options {background:var(--ch-accent);color:var(--ch-ink);border-radius:.5em}
.ch-look.ch-look-lite .menu__item[data-action="feed"],.ch-look.ch-look-lite .menu__item[data-action="anime"],.ch-look.ch-look-lite .menu__item[data-action="subscribes"],.ch-look.ch-look-lite .menu__item[data-action="myperson"],.ch-look.ch-look-lite .full-start-new__reactions,.ch-look.ch-look-lite .button--reaction {display:none!important}
.ch-look.ch-look-compact .full-start-new__title {font-size:2.4em}
.ch-look.ch-look-compact .full-start-new__poster {max-width:16em}
.ch-look.ch-look-compact .full-start-new__body {padding-top:.5em}
.ch-look.ch-look-motion .card,.ch-look.ch-look-motion .card__view,.ch-look.ch-look-motion .menu__item,.ch-look.ch-look-motion .full-start__button {transition:none!important;animation:none!important}
@media(max-width:600px) {
 .ch-look .full-start-new__title {font-size:1.8em}
 .ch-look .full-start-new__buttons {gap:.5em;flex-wrap:wrap}
 .ch-look .full-start__button {padding:.65em .9em}
 .ch-look .full-start-new__body {padding-top:.5em}
}
@media(prefers-reduced-motion:reduce) {
 .ch-look .card,.ch-look .card__view,.ch-look .menu__item,.ch-look .full-start__button {transition:none!important;animation:none!important}
}
`;
    function value(k, fallback) { var v = L.Storage.field(k); return v == null || v === '' ? fallback : v; }
    function apply() {
        var body = $('body'), on = String(value('ch_look_enabled', true)) !== 'false';
        body.toggleClass('ch-look', on);
        body.toggleClass('ch-look-blue', on && value('ch_look_accent','violet') === 'blue');
        body.toggleClass('ch-look-gold', on && value('ch_look_accent','violet') === 'gold');
        body.toggleClass('ch-look-compact', on && value('ch_look_density','normal') === 'compact');
        body.toggleClass('ch-look-motion', on && String(value('ch_look_motion',true)) !== 'false');
        body.toggleClass('ch-look-lite', on && String(value('ch_look_lite',true)) !== 'false');
    }
    function init() {
        if (api.ready || !root.Lampa || !root.Lampa.SettingsApi) return;
        L = root.Lampa; $ = root.jQuery || root.$; if (!$) return; api.ready = true;
        style = root.document.createElement('style'); style.id = 'ch-look-style'; style.textContent = css; root.document.head.appendChild(style);
        L.SettingsApi.addComponent({component:'ch_look',name:'CinemaHall · оформление',icon:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 3h18v18H3zM5 5v14h14V5z"/></svg>'});
        [
            ['ch_look_enabled','trigger',true,null,'Оформление CinemaHall','Тёмная тема с чётким фокусом для пульта'],
            ['ch_look_accent','select','violet',{violet:'Лавандовый',blue:'Голубой',gold:'Песочный'},'Акцент','Цвет кнопок и фокуса'],
            ['ch_look_density','select','normal',{normal:'Обычная',compact:'Компактная'},'Плотность карточки','Размер заголовка и постера'],
            ['ch_look_lite','trigger',true,null,'Лёгкий интерфейс','Скрыть ленту, аниме, подписки и реакции'],
            ['ch_look_motion','trigger',true,null,'Уменьшить анимацию','Отключить переходы карточек и кнопок']
        ].forEach(function (p) { L.SettingsApi.addParam({component:'ch_look',param:{name:p[0],type:p[1],default:p[2],values:p[3]},field:{name:p[4],description:p[5]},onChange:apply}); });
        L.Storage.listener.follow('change', function (e) { if (e.name.indexOf('ch_look_') === 0) apply(); });
        api.apply = apply; api.disable = function () { L.Storage.set('ch_look_enabled',false); apply(); };
        apply();
    }
    if (root.appready) init();
    else if (root.Lampa && root.Lampa.Listener) root.Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') init(); });
    if (root.document) root.document.addEventListener('lampa:ready', init);
}(typeof window !== 'undefined' ? window : null));
