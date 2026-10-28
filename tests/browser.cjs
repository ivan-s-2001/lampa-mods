/* UI contract tests with real Chromium + jQuery and deterministic Lampa/provider doubles.
   These do not certify codecs, native Android playback or a live tracker. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(require.resolve('playwright', {paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES]})); }
let jquery = process.env.CH_JQUERY_PATH;
if (!jquery) jquery = require.resolve('jquery/dist/jquery.js');
const root = path.resolve(__dirname,'..');

(async () => {
  const browser = await playwright.chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.setContent('<html><head><style>body{font:18px sans-serif;margin:0;padding:24px}.modal{padding:28px;max-width:1050px;background:#171e2c;margin:20px auto}.menu{display:none}.player-panel{display:none}.full-start-new__buttons{display:flex;gap:12px}.selector{cursor:pointer}</style></head><body><ul class="menu"></ul><div class="full-start-new__buttons"></div><div class="player-panel"><div class="player-panel__right player-panel__tv-visible"></div></div></body></html>');
    await page.addScriptTag({path:jquery});
    await page.evaluate(() => {
      function bus() { const events={}; return {follow:(k,fn)=>(events[k]||=([])).push(fn),remove:(k,fn)=>events[k]=(events[k]||[]).filter(f=>f!==fn),send:(k,v)=>(events[k]||[]).slice().forEach(fn=>fn(v))}; }
      const values={jackett_url:'https://jackett.test',jackett_key:'key#1',prowlarr_url:'https://prowlarr.test',ch_max_resolution:'1080'};
      const h1='a'.repeat(40),h2='b'.repeat(40),h3='c'.repeat(40);
      const magnet=h=>'magnet:?xt=urn:btih:'+h;
      window.mock={values,h1,h2,h3,requests:[],added:[],played:[],delay:0,serial:false,modal:null,select:null,notice:[],nativeStarts:0};
      mock.rows=()=>[
        {Title:'Movie 1080p HEVC LostFilm',MagnetUri:magnet(h1),Seeders:50},
        {Title:'Movie 1080p HEVC LostFilm',MagnetUri:magnet(h2),Seeders:20},
        {Title:'Movie 2160p HEVC HDR10 LostFilm',MagnetUri:magnet(h3),Seeders:200}
      ];
      mock.film={id:10,title:'Movie <img src=x onerror="window.pwned=true">',original_title:'Movie',source:'tmdb'};
      mock.tv={id:11,name:'Show',original_name:'Show',source:'tmdb',number_of_seasons:2};
      const listener=bus(), playerListener=bus(), videoListener=bus();
      const source={
        get:(url,params,ok)=>setTimeout(()=>ok({results:[{id:1,title:'Film',genre_ids:[]},{id:1,title:'Film',genre_ids:[]},{id:2,name:'Anime',genre_ids:[16],original_language:'ja'}],total_pages:3}),0),
        discovery:()=>({search:(params,ok)=>ok([])}),search:(params,ok)=>ok([]),menu:(p,ok)=>ok([{id:18,title:'Драма'}]),
        category(){},full(){},list(){},seasons(){}
      };
      window.Lampa={
        Listener:listener,
        Storage:{get:(k,d)=>Object.hasOwn(values,k)?values[k]:d,field:k=>values[k],set:(k,v)=>{values[k]=v;storageEvents.send('change',{name:k,value:v});},listener:null},
        SettingsApi:{addComponent(){},addParam(p){if(!Object.hasOwn(values,p.param.name))values[p.param.name]=p.param.default;}},
        Params:{select(){}}, Settings:{create(){}},
        Api:{sources:{tmdb:source},seasons:(movie,list,ok)=>ok({[list[0]]:{episodes:[{episode_number:1,name:'Первая'},{episode_number:3,name:'Третья'}]}})},
        Activity:{active:()=>({component:'full',activity:{render:()=>jQuery('body')}}),push:p=>mock.added.push(p)},
        Menu:{addButton:(icon,title,fn)=>jQuery('<li>').text(title).on('hover:enter',fn).appendTo('.menu')},
        Controller:{enabled:()=>({name:'content'}),toggle:k=>mock.controller=k},
        Noty:{show:s=>mock.notice.push(s)},
        Select:{show(options){mock.select=options;},opened:()=>false},
        Modal:{open(options){mock.modal=options;jQuery('.modal').remove();jQuery('<div class="modal">').append(options.html).appendTo('body');},close(){jQuery('.modal').remove();mock.modal=null;},update(html){jQuery('.modal').empty().append(html);}},
        Reguest:function(){this.timeout=()=>{};this.clear=()=>{};this.native=(url,ok)=>{mock.requests.push(url);setTimeout(()=>{const rows=mock.rows();ok(url.includes('jackett')?{Results:rows}:rows);},mock.delay);};},
        Parser:{get:(params,ok)=>ok({Results:mock.rows()})},
        Torserver:{url:()=>values.torrserver_url||'http://127.0.0.1:8090',clear(){},connected:ok=>ok({CacheSize:64}),
          hash:(object,ok)=>ok({hash:object.link.match(/btih:([a-f0-9]+)/)[1]}),
          files:(hash,ok)=>{let files=mock.serial ? (hash===h1?[{id:2,path:'S02E01.mkv'}]:[{id:17,path:'S02E03.mkv'},{id:18,path:'sample.S02E03.mkv'},{id:19,path:'S02E01.mkv'}]):[{id:7,path:'Movie.mkv'},{id:8,path:'Movie.ru.srt'}];ok({file_stats:files,download_speed:1000,active_peers:3});},
          stream:(file,hash,id)=>'http://127.0.0.1:8090/stream/'+encodeURIComponent(file)+'?link='+hash+'&index='+id+'&play'},
        Timeline:{link:(card,season,episode)=>({card:card.id,season,episode}),view:(hash,meta)=>({hash,...meta,time:0,duration:0,percent:0})},
        Favorite:{get:()=>mock.added.filter(x=>x.movie).map(x=>x.movie),add:(type,movie)=>mock.added.push({type,movie})},
        Player:{listener:playerListener,play(data){mock.played.push(data);playerListener.send('start',data);playerListener.send('ready',data);},playlist:list=>mock.playlist=list,callback:fn=>mock.playerBack=fn},
        PlayerVideo:{listener:videoListener},PlayerPanel:{render:()=>jQuery('.player-panel')},Utils:{bytesToSize:v=>v+' B'}
      };
      const storageEvents=bus();Lampa.Storage.listener=storageEvents;
      window.appready=true;
    });
    await page.addScriptTag({path:path.join(root,'cinemahall.js')});
    await page.addScriptTag({path:path.join(root,'cinemahall-look.js')});
    await page.evaluate(()=>{Lampa.Listener.send('full',{type:'complite',body:jQuery('body'),data:{movie:mock.film}});});
    assert.equal(await page.locator('.ch-streams-button').count(),1);
    await page.addScriptTag({path:path.join(root,'cinemahall.js')});
    assert.equal(await page.locator('.ch-home-menu').count(),1,'duplicate load must not duplicate menus');
    await page.evaluate(()=>CinemaHallStreams.open(mock.film));
    await page.waitForSelector('.ch-watch__tab');
    assert.equal(await page.locator('.ch-watch__tab').count(),2,'same torrent from two parsers must merge');
    await page.evaluate(()=>jQuery('.ch-watch__tab').filter((i,e)=>e.textContent.startsWith('1080')).trigger('hover:enter'));
    await page.evaluate(()=>jQuery('.ch-watch__voice').filter((i,e)=>jQuery(e).find('.ch-watch__voice-title').text()==='LostFilm').trigger('hover:enter'));
    await page.waitForFunction(()=>mock.played.length===1);
    assert.equal(await page.evaluate(()=>mock.played[0].torrent_hash),await page.evaluate(()=>mock.h1));
    assert.equal(await page.evaluate(()=>mock.played[0].subtitles.length),1,'sidecar subtitle must survive video filtering');
    assert.equal(await page.evaluate(()=>window.pwned),undefined);
    assert.ok(await page.evaluate(()=>mock.requests.some(url=>url.includes('key%231'))),'keys must be URL encoded');
    await page.evaluate(()=>mock.played[0].error(mock.played[0],url=>mock.reserve=url));
    await page.waitForFunction(()=>!!mock.reserve);
    assert.ok(await page.evaluate(()=>mock.reserve.includes(mock.h2)),'runtime retry must stay in selected quality and voice');
    await page.evaluate(()=>{Lampa.PlayerVideo.listener.send('timeupdate',{current:120,duration:3600});Lampa.Player.listener.send('destroy',{});});
    assert.equal(await page.evaluate(()=>mock.values.ch_resume['tmdb:movie:10'].time),120);
    await page.evaluate(()=>{mock.serial=true;CinemaHallStreams.open(mock.tv,{season:2,episode:3},true);});
    await page.waitForFunction(()=>mock.played.length===2);
    assert.ok(await page.evaluate(()=>mock.played[1].url.includes('index=17')),'absent episode must fall through to another torrent');
    assert.equal(await page.evaluate(()=>mock.playlist.length),2,'samples and subtitles must not enter episode playlist');
    await page.evaluate(()=>{mock.serial=false;mock.delay=150;CinemaHallStreams.open(mock.film);mock.modal.onBack();});
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.ch-watch').count(),0,'late callbacks after Back must not reopen the screen');
    await page.evaluate(()=>{
      mock.delay=0;
      window.CinemaHallNative={startTorrentEngine:()=>mock.nativeStarts++,torrentState:()=>JSON.stringify({state:'ready',url:'http://127.0.0.1:45678'})};
      CinemaHallStreams.open(mock.film,null,true);
    });
    await page.waitForFunction(()=>mock.played.length===3);
    assert.equal(await page.evaluate(()=>mock.values.torrserver_url),'http://127.0.0.1:45678');
    assert.ok(await page.evaluate(()=>mock.nativeStarts>0));
    const rows=await page.evaluate(()=>new Promise((resolve,reject)=>Lampa.Api.sources.cinemahall.main({},resolve,reject)));
    assert.ok(rows.some(row=>row.title==='Продолжить просмотр'));
    assert.equal(rows.find(row=>row.title==='Новые фильмы').results.length,1,'catalog must exclude duplicate cards and anime');
    assert.ok(await page.evaluate(()=>mock.requests.every(url=>!url.includes('duckdns')&&!url.includes(':8091'))));
    await page.evaluate(()=>{CinemaHallLook.disable();});
    assert.equal(await page.locator('body.ch-look').count(),0);
    await page.evaluate(()=>{Lampa.Storage.set('ch_look_enabled',true);CinemaHallLook.apply();CinemaHallStreams.open(mock.film);});
    await page.waitForSelector('.ch-watch__tab');
    if(process.env.CH_SCREENSHOT) await page.screenshot({path:process.env.CH_SCREENSHOT,fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('Browser scenarios passed: init, duplicate load, dedup, manual quality/voice, retry, subtitles, resume, exact episode, cancellation, native discovery, catalog, theme and HTML escaping.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
