const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the real renderer without a browser dependency or frontend build.
function setup(entries, categories = {code:{name:'Code',icon:'C'},chat:{name:'Chat',icon:'T'}}, search = '') {
  class Node {
    constructor() { this.children=[]; this.events={}; this.style={setProperty(){}}; this.dataset={}; this.attrs={}; this.clientWidth=1000; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children=nodes; }
    setAttribute(key,value) { this.attrs[key]=value; }
    getAttribute(key) { return this.attrs[key]; }
    removeAttribute(key) { delete this.attrs[key]; }
    focus() { this.focused=true; }
    contains(node) { return node===this || this.children.some(child=>child?.contains?.(node)); }
    getBoundingClientRect() { return {top:272-context.window.scrollY,bottom:872-context.window.scrollY}; }
    dispatchEvent(event) { Object.defineProperty(event,'target',{value:this}); this.events[event.type]?.(event); }
    addEventListener(type, handler) { const previous=this.events[type]; this.events[type]=event=>{previous?.(event);handler(event);}; }
  }
  const nodes = {};
  const requests=[];
  const context = vm.createContext({URLSearchParams, Intl, Date, Math, Set, Event,
    location:{search,pathname:'/'}, history:{replaceState(){}}, window:{scrollX:0,scrollY:0,innerHeight:900,scrollTo({left,top}){this.scrollX=left;this.scrollY=top;},addEventListener(){}},
    document:{body:new Node(),documentElement:{scrollHeight:950},events:{},addEventListener(type,handler){const previous=this.events[type];this.events[type]=event=>{previous?.(event);handler(event);};},getElementById:id=>{
      if (!nodes[id]) {
        nodes[id]=new Node();
        if (id==='zoom') {
          const values=[['detail','Months'],['years','Years'],['fit','Fit history']];
          nodes[id].options=values.map(([value,textContent])=>({value,textContent}));
        }
      }
      return nodes[id];
    },createElement:()=>new Node(),createTextNode:text=>text,querySelectorAll:()=>{
      const visit=node=>[...(node.className?.startsWith('period-block')?[node]:[]),...(node.children || []).flatMap(visit)];
      return visit(nodes.timeline);
    }},
    fetch:url=>{requests.push(url);return new Promise(()=>{});},setInterval(){throw new Error('Background polling is not allowed');}});
  vm.runInContext(fs.readFileSync('app/static/i18n.js','utf8'),context);
  vm.runInContext(fs.readFileSync('app/static/app.js','utf8'),context);
  context.fixture={today:'2026-09-18', entries:entries.map(e=>({model:'m',tags:[],notes:'',...e})),
    categories,models:{m:{name:'Model',icon:'M',color:'#abcdef'}},harnesses:{}};
  vm.runInContext('data=fixture; renderCategories(); renderTimeline(filtered())',context);
  const rows=()=>nodes.timeline.children[0].children.slice(1);
  const blocks=row=>row.children[1].children.filter(n=>n.className?.startsWith('period-block'));
  return {context,nodes,rows,blocks,requests};
}
test('activity rows pack overlaps and reuse lanes after inclusive end dates',()=>{
  const app=setup([
    {id:'a',title:'First',category:'code',start:'2024-01-01',end:'2024-06-30'},
    {id:'b',title:'Overlap',category:'code',start:'2024-06-30',end:'2024-08-01'},
    {id:'c',title:'Successor',category:'code',start:'2024-07-01',end:'2025-01-01'},
    {id:'d',title:'Chat',category:'chat',start:'2024-01-01'}]);
  assert.equal(app.rows().length,2);
  const [a,b,c]=app.blocks(app.rows()[0]);
  assert.equal(a.style.top,c.style.top);
  assert.notEqual(a.style.top,b.style.top);
  assert.match(a.attrs['aria-label'],/First.*Model.*2024/);
  assert.match(a.title,/^First\n.*2024/);
});
test('multi-year history scrolls, fit changes scale, filters and selection survive',()=>{
  const app=setup([{id:'old',title:'Old',category:'code',start:'2020-01-01',end:'2022-01-01'},
    {id:'now',title:'Current',category:'chat',start:'2026-01-01'}]);
  assert.ok(parseFloat(app.nodes.timeline.children[0].style.width)>3000);
  vm.runInContext("state.zoom='fit'; state.category='chat'; state.selected='now'; renderTimeline(filtered())",app.context);
  assert.equal(app.rows().length,1);
  assert.equal(app.blocks(app.rows()[0])[0].attrs['aria-pressed'],'true');
  assert.equal(app.nodes.timeline.children[0].style.width,'1000px');
});
test('short periods, uncategorized and future open periods remain selectable',()=>{
  const app=setup([{id:'a',title:'One day',start:'2026-01-01',end:'2026-01-01'},
    {id:'b',title:'Next day',start:'2026-01-02',end:'2026-01-02'},
    {id:'future',title:'Plan',start:'2027-01-01'}]);
  assert.equal(app.rows().length,1);
  const blocks=app.blocks(app.rows()[0]);
  assert.equal(blocks.length,3);
  assert.notEqual(blocks[0].style.top,blocks[1].style.top);
  for (const block of blocks) assert.ok(parseFloat(block.style.width)>0);
  assert.match(blocks[2].attrs['aria-label'],/planned/);
});
test('default scale opens latest and preserves history across redraws and zoom',()=>{
  const app=setup([{id:'a',title:'Long history',start:'2020-01-01'}]);
  const width = parseFloat(app.nodes.timeline.children[0].style.width);
  assert.equal(app.nodes.timeline.scrollLeft,width-1000);
  app.nodes.timeline.scrollLeft=8000;
  vm.runInContext('renderTimeline(filtered())',app.context);
  assert.ok(Math.abs(app.nodes.timeline.scrollLeft-8000)<.001);
  const before=vm.runInContext('viewport.start+(8000+425)/(viewport.width-150)*viewport.span',app.context);
  vm.runInContext("state.zoom='years'; renderTimeline(filtered())",app.context);
  const after=vm.runInContext('viewport.start+($("timeline").scrollLeft+425)/(viewport.width-150)*viewport.span',app.context);
  assert.ok(Math.abs(before-after)<1);
});
test('explicit in-page selection and model roles render in a single block',()=>{
  const app=setup([{id:'a',title:'Two models',category:'code',start:'2024-01-01',end:'2024-02-28',model:null,
    models:[{model:'m',role:'Light coding'},{model:'m',role:'Heavy coding'}]},
    {id:'b',title:'Current',category:'code',start:'2026-01-01'}]);
  const block=app.blocks(app.rows()[0])[0];
  assert.match(block.attrs['aria-label'],/Light coding.*Heavy coding/);
  assert.equal(block.children.filter(n=>n.className.startsWith('period-entity model')).length,2);
  vm.runInContext("viewport=undefined; state.selected='a'; renderTimeline(filtered())",app.context);
  assert.equal(app.nodes.timeline.scrollLeft,0);
  vm.runInContext("state.query='heavy coding'; renderTimeline(filtered()); renderOverview()",app.context);
  assert.equal(app.blocks(app.rows()[0]).length,1);
  assert.equal(app.nodes.stats.children[0].children[1].textContent,'01');
});
test('each lane uses its own tallest period instead of the category maximum',()=>{
  const app=setup([
    {id:'a',title:'Tall period',category:'code',start:'2024-01-01',end:'2024-12-31',
      models:[{model:'m',role:'Light'},{model:'m',role:'Heavy'},{model:'m',role:'Review'}]},
    {id:'b',title:'Small period',category:'code',start:'2024-02-01',end:'2024-03-31'},
    {id:'c',title:'Next period',category:'code',start:'2024-04-01',end:'2024-05-31',
      models:[{model:'m'},{model:'m'}]}]);
  const [a,b,c]=app.blocks(app.rows()[0]);
  assert.ok(parseFloat(a.style.height)>parseFloat(b.style.height));
  assert.equal(b.style.height,c.style.height);
  assert.equal(b.style.top,c.style.top);
  assert.ok(parseFloat(b.style.top)>=parseFloat(a.style.top)+parseFloat(a.style.height));
  assert.equal(parseFloat(app.rows()[0].children[1].style.height),parseFloat(c.style.top)+parseFloat(c.style.height)+8);
});

test('opening an old entry URL starts unselected and empty timeline clicks clear selection',()=>{
  const app=setup([{id:'a',title:'Period',category:'code',start:'2024-01-01'}],undefined,'?entry=a');
  assert.equal(vm.runInContext('state.selected',app.context),'');
  assert.equal(app.blocks(app.rows()[0])[0].attrs['aria-pressed'],'false');
  vm.runInContext('choose(data.entries[0])',app.context);
  const block=app.blocks(app.rows()[0])[0];
  assert.equal(block.attrs['aria-pressed'],'true');
  app.nodes.timeline.events.click({target:{closest:()=>block}});
  assert.equal(block.attrs['aria-pressed'],'true');
  const left=app.nodes.timeline.scrollLeft;
  app.nodes.timeline.events.click({target:{closest:()=>null}});
  assert.equal(vm.runInContext('state.selected',app.context),'');
  assert.equal(block.attrs['aria-pressed'],'false');
  assert.equal(app.nodes.timeline.scrollLeft,left);
});

test('icon aliases distinguish harnesses and fall back on missing files or unknown names',()=>{
  const app=setup([]);
  for (const [name,key] of [['GPT Sol 5.6','openai'],['Opus 5','claude'],['Claude Code','claudecode'],['Pi','pi'],['Hermes Agent','hermesagent']]) {
    app.context.name=name;
    assert.equal(vm.runInContext('iconKey(name)',app.context),key);
  }
  const icon=vm.runInContext("entityIcon({name:'Pi',kind:'harness'})",app.context);
  icon.children[1].events.load();
  assert.equal(icon.children[0].hidden,true);
  icon.children[1].events.error();
  assert.equal(icon.children[0].hidden,false);
  assert.equal(vm.runInContext("entityIcon({name:'My unknown tool',kind:'harness'}).children.length",app.context),1);
});

test('Journal and selected details include the same story, project link and tags',()=>{
  const app=setup([{id:'a',title:'Story',category:'code',start:'2026-01-01',notes:'Why I chose this workflow.',url:'https://example.com/project',tags:['project','review']}]);
  vm.runInContext('renderJournal(filtered()); choose(data.entries[0])',app.context);
  for (const target of [app.nodes.journal.children[0],app.nodes.details]) {
    assert.equal(target.children.find(n=>n.className==='notes').textContent,'Why I chose this workflow.');
    const link=target.children.find(n=>n.href);
    assert.equal(link.href,'https://example.com/project');
    assert.equal(link.rel,'noopener noreferrer');
    assert.deepEqual(target.children.at(-1).children.map(n=>n.textContent),['#project','#review']);
  }
});

test('Journal is a complete reading view without clickable titles or a duplicate detail panel',()=>{
  const app=setup([{id:'a',title:'Story',category:'code',start:'2026-01-01'}]);
  vm.runInContext("state.view='journal'; renderMain()",app.context);
  assert.equal(app.nodes.details.hidden,true);
  assert.equal(app.nodes.journal.hidden,false);
  const heading=app.nodes.journal.children[0].children.find(n=>n.textContent==='Story');
  assert.equal(heading.events.click,undefined);
  vm.runInContext("state.view='timeline'; renderMain()",app.context);
  assert.equal(app.nodes.details.hidden,false);
});

test('instance info supports pointer dismissal and Escape',()=>{
  const app=setup([]);
  app.nodes['info-wrap'].events.pointerenter({pointerType:'mouse'});
  assert.equal(app.nodes['app-info'].hidden,false);
  assert.equal(app.nodes['info-toggle'].attrs['aria-expanded'],'true');
  app.nodes['info-wrap'].events.pointerleave();
  assert.equal(app.nodes['app-info'].hidden,true);
  app.nodes['info-toggle'].events.click();
  assert.equal(app.nodes['app-info'].hidden,false);
  app.context.document.events.keydown({key:'Escape'});
  assert.equal(app.nodes['app-info'].hidden,true);
});

test('today navigation and arrows respect exact bounds at every timeline scale',()=>{
  const app=setup([{id:'a',title:'History',start:'2024-01-01'}]);
  for (const zoom of ['detail','years','fit']) {
    vm.runInContext(`state.zoom='${zoom}'; renderTimeline(filtered())`,app.context);
    assert.equal(Number.isInteger(parseFloat(app.nodes.timeline.children[0].style.width)),true);
    vm.runInContext('setTimelinePosition(maxTimelineScroll())',app.context);
    const position=app.nodes.timeline.scrollLeft, dates=app.nodes['visible-dates'].textContent;
    assert.match(dates,/25 Sept 2026$/);
    app.nodes['go-today'].events.click();
    assert.equal(app.nodes.timeline.scrollLeft,position);
    assert.equal(app.nodes['visible-dates'].textContent,dates);
    app.nodes.later.events.click();
    assert.equal(app.nodes.timeline.scrollLeft,position);
    assert.equal(app.nodes['visible-dates'].textContent,dates);
    vm.runInContext('setTimelinePosition(0)',app.context);
    app.nodes.earlier.events.click();
    assert.equal(app.nodes.timeline.scrollLeft,0);
    app.nodes['go-today'].events.click();
    assert.equal(app.nodes.timeline.scrollLeft,position);
  }
});

test('filter menus support keyboard selection, cancellation and outside dismissal',()=>{
  const app=setup([{id:'a',title:'History',start:'2024-01-01'}]);
  const [trigger,list]=app.nodes['zoom-control'].children;
  const key=key=>trigger.events.keydown({key,preventDefault(){}});
  key('Enter'); key('End');
  assert.equal(list.hidden,false);
  assert.equal(app.nodes.zoom.value,'detail');
  key('Escape');
  assert.equal(list.hidden,true);
  assert.equal(app.nodes.zoom.value,'detail');
  key('Enter'); key('End'); key('Enter');
  assert.equal(list.hidden,true);
  assert.equal(app.nodes.zoom.value,'fit');
  assert.equal(vm.runInContext('state.zoom',app.context),'fit');
  assert.equal(trigger.textContent,'Fit history');
  assert.equal(list.children[2].attrs['aria-selected'],'true');
  trigger.events.click();
  app.context.document.events.click({target:{}});
  assert.equal(list.hidden,true);
  trigger.events.click(); list.children[0].events.click();
  assert.equal(vm.runInContext('state.zoom',app.context),'detail');
  vm.runInContext("state.view='journal';renderMain()",app.context);
  assert.equal(app.nodes['zoom-control'].hidden,true);
});

test('Go to today centers the current date even when later periods are planned',()=>{
  const app=setup([{id:'old',title:'History',start:'2020-01-01',end:'2025-01-01'},
    {id:'future',title:'Planned work',start:'2028-01-01',end:'2030-01-01'}]);
  for (const zoom of ['detail','years','fit']) {
    vm.runInContext(`state.zoom='${zoom}';renderTimeline(filtered())`,app.context);
    app.nodes['go-today'].events.click();
    const {today,left,right,max}=vm.runInContext(`({
      today:(parseDate(data.today)-viewport.start)/viewport.span*(viewport.width-150),
      left:$('timeline').scrollLeft,
      right:$('timeline').scrollLeft+$('timeline').clientWidth-150,
      max:maxTimelineScroll()
    })`,app.context);
    assert.ok(today>=left && today<=right);
    if (max>0) assert.ok(Math.abs(today-(left+right)/2)<.001);
    assert.equal(app.nodes.earlier.disabled,left===0);
    assert.equal(app.nodes.later.disabled,left===max);
  }
  const empty=setup([]);
  assert.doesNotThrow(()=>empty.nodes['go-today'].events.click());
});

test('switching views restores page position when timeline layout clamps scrolling',()=>{
  const app=setup([{id:'a',title:'History',start:'2024-01-01'}]);
  app.nodes['journal-view'].events.click();
  app.context.window.scrollY=191;
  vm.runInContext(`const originalTimeline=renderTimeline;
    renderTimeline=entries=>{originalTimeline(entries);window.scrollY=0;};`,app.context);
  app.nodes['timeline-view'].events.click();
  assert.equal(app.context.window.scrollY,191);
  assert.equal(app.context.document.body.style.minHeight,undefined);
  assert.equal(app.nodes['history-page'].style.minHeight,'741px');
  app.nodes['journal-view'].events.click();
  assert.equal(app.context.window.scrollY,191);
  assert.equal(app.nodes.details.hidden,true);
});

test('Stats has a direct route and preserves journal filters and view when returning',()=>{
  const app=setup([{id:'a',title:'Coding',category:'code',start:'2024-01-01'},
    {id:'b',title:'Writing',category:'chat',start:'2025-01-01'}],undefined,'?section=stats&view=journal&category=chat&q=Writing');
  vm.runInContext('renderOverview();renderMain()',app.context);
  assert.equal(app.nodes['stats-page'].hidden,false);
  assert.equal(app.nodes['history-page'].hidden,true);
  assert.equal(app.nodes.stats.children[2].children[1].textContent,'02');
  app.nodes['journal-section'].events.click();
  assert.equal(app.nodes['stats-page'].hidden,true);
  assert.equal(app.nodes['history-page'].hidden,false);
  assert.equal(app.nodes.journal.hidden,false);
  assert.equal(app.nodes.journal.children.length,1);
  assert.equal(vm.runInContext('state.category',app.context),'chat');
  assert.equal(vm.runInContext('state.query',app.context),'Writing');
  app.nodes['stats-section'].events.click();
  assert.equal(app.nodes['stats-page'].hidden,false);
  assert.equal(app.nodes['stats-section'].attrs['aria-pressed'],'true');
});

test('the author is linked only when a reference URL is configured',()=>{
  const app=setup([]);
  vm.runInContext("data.site={author:'Mattia',url:'https://example.com/about'};renderAuthor()",app.context);
  assert.equal(app.nodes.author.children[0].textContent,'Mattia');
  assert.equal(app.nodes.author.children[0].href,'https://example.com/about');
  assert.equal(app.nodes.author.children[0].rel,'noopener noreferrer');
  vm.runInContext("data.site.url='';renderAuthor()",app.context);
  assert.deepEqual(app.nodes.author.children,['Mattia',' / AI JOURNAL']);
});

test('history controls retain their nodes and reuse the single loaded snapshot',()=>{
  const app=setup([{id:'a',title:'Code',category:'code',start:'2024-01-01'},
    {id:'b',title:'Chat',category:'chat',start:'2025-01-01'}]);
  const buttons=[...app.nodes.categories.children];
  app.context.window.scrollY=150;
  buttons[2].events.click();
  assert.equal(app.context.window.scrollY,150);
  assert.equal(app.nodes.categories.children[2],buttons[2]);
  assert.equal(buttons[2].attrs['aria-pressed'],'true');
  app.nodes.zoom.value='years'; app.nodes.zoom.dispatchEvent(new Event('change'));
  assert.equal(app.context.window.scrollY,150);
  app.nodes.search.events.input({target:{value:'No matches'}});
  assert.match(app.nodes.timeline.children[0].textContent,/No matching/);
  assert.equal(app.context.window.scrollY,150);
  app.nodes['journal-view'].events.click();
  app.nodes.search.events.input({target:{value:''}});
  app.nodes['timeline-view'].events.click();
  assert.equal(app.context.window.scrollY,150);
  assert.deepEqual(app.requests,['/api/timeline']);
  for (let index=0;index<buttons.length;index++) assert.equal(app.nodes.categories.children[index],buttons[index]);
});

test('timeline layout is measured with the previous chart still attached',()=>{
  const app=setup([{id:'a',title:'History',start:'2024-01-01'}]);
  Object.defineProperty(app.nodes.timeline,'clientWidth',{get(){
    assert.equal(app.nodes.timeline.children.length,1,'must not measure an empty timeline');
    return 1000;
  }});
  vm.runInContext("updateHistory({zoom:'years'})",app.context);
  assert.equal(app.nodes.timeline.children.length,1);
});

test('all five dictionaries cover every UI key and preserve interpolation fields',()=>{
  const app=setup([]);
  const messages=vm.runInContext('MESSAGES',app.context);
  const keys=Object.keys(messages.en).sort();
  assert.deepEqual(Object.keys(messages).sort(),['de','en','es','fr','it']);
  const placeholders=text=>[...text.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
  for (const [language,entries] of Object.entries(messages)) {
    assert.deepEqual(Object.keys(entries).sort(),keys,language);
    for (const key of keys) {
      assert.ok(entries[key].trim(),language+': '+key);
      assert.deepEqual(placeholders(entries[key]),placeholders(messages.en[key]),language+': '+key);
    }
  }
  for (const match of fs.readFileSync('app/static/index.html','utf8').matchAll(/data-i18n(?:-label|-placeholder|-title)?="([^"]+)"/g)) {
    assert.ok(keys.includes(match[1]),'Missing static translation: '+match[1]);
  }
});

test('localized views translate UI and dates while preserving authored stories',()=>{
  const app=setup([{id:'a',title:'My project',category:'code',start:'2026-01-01',notes:'Original notes',url:'https://example.com',tags:['original']}]);
  for (const [language,action] of [['en','Go to today'],['it','Vai a oggi'],['es','Ir a hoy'],['fr','Aller à aujourd’hui'],['de','Zu heute']]) {
    vm.runInContext(`setLanguage('${language}');renderCategories();renderMain();renderJournal(filtered());renderOverview();choose(data.entries[0]);`,app.context);
    assert.equal(vm.runInContext("t('goToday')",app.context),action);
    assert.equal(app.nodes.journal.children[0].children.find(n=>n.className==='notes').textContent,'Original notes');
    assert.equal(app.nodes.journal.children[0].children.find(n=>n.className==='eyebrow').textContent,'Code');
    assert.equal(app.nodes.journal.children[0].children.find(n=>n.href).textContent,vm.runInContext("t('relatedProject')",app.context));
    assert.match(vm.runInContext("t('results',{visible:2,total:7})",app.context),/2.*7/);
  }
  assert.match(vm.runInContext("human('2026-01-01')",app.context),/2026/);
  vm.runInContext("setLanguage('unsupported')",app.context);
  assert.equal(vm.runInContext('language',app.context),'en');
});


test('stats merge overlapping days, cap ongoing periods and ignore future durations',()=>{
  const app=setup([
    {id:'a',start:'2026-09-01',end:'2026-09-10',harness:'h'},
    {id:'b',start:'2026-09-05',end:'2026-09-12',models:[{model:'m'},{model:'m'}]},
    {id:'c',start:'2026-09-15',end:'2026-10-01',harness:'h'},
    {id:'d',start:'2027-01-01',model:'future'}]);
  vm.runInContext("data.models.future={name:'Future'}; data.harnesses.h={name:'Harness'}; renderOverview()",app.context);
  const stats=vm.runInContext('overviewStats()',app.context);
  assert.equal(stats.days,16); // Sep 1–12 and Sep 15–18; no gap or overlap inflation.
  assert.equal(stats.average,22/3); // 10 + 8 + 4 elapsed days.
  assert.equal(stats.tools.model.get('m').days,16);
  assert.equal(stats.tools.harness.get('h').days,14);
  assert.equal(stats.tools.model.get('future').days,0);
  assert.equal(stats.last,Date.parse('2026-09-15T00:00:00Z'));
  assert.equal(app.nodes.stats.children[0].children[1].textContent,'02');
  assert.equal(app.nodes.stats.children[3].children[1].textContent,'16');
  assert.equal(app.nodes.current.children.length,2);
  assert.equal(app.nodes.current.children[0].children[1].children.length,1);
  assert.equal(app.nodes.current.children[1].children[1].children.length,1);
});

test('stats handle empty and future-only history without fabricated dates or averages',()=>{
  for (const entries of [[],[{id:'future',start:'2027-01-01'}]]) {
    const app=setup(entries);
    vm.runInContext('renderOverview()',app.context);
    const stats=vm.runInContext('overviewStats()',app.context);
    assert.equal(stats.days,0); assert.equal(stats.average,null);
    assert.equal(stats.first,null); assert.equal(stats.last,null);
    for (const insight of app.nodes.insights.children) assert.equal(insight.children[1].textContent,'—');
  }
});

test('stats preserve earliest tied tools and inclusive leap-day durations',()=>{
  const app=setup([{id:'b',start:'2024-02-28',end:'2024-03-01',model:null,harness:'h'},
    {id:'a',start:'2024-02-28',end:'2024-03-01',models:[{model:'m'},{model:'n'}]}]);
  vm.runInContext("data.models.n={name:'Another'}; data.harnesses.h={name:'Harness'}; renderOverview()",app.context);
  const stats=vm.runInContext('overviewStats()',app.context);
  assert.equal(stats.days,3); assert.equal(stats.average,3);
  assert.equal(stats.last,Date.parse('2024-03-02T00:00:00Z'));
  assert.equal(app.nodes.insights.children[3].children[1].textContent,'Model · Another');
  assert.equal(app.nodes.insights.children[4].children[1].textContent,'Model · Another');
  assert.equal(app.nodes.insights.children[6].children[1].textContent,'Harness');
});


test('current rotation counts continuous days across overlap and adjacency, resetting after gaps',()=>{
  const app=setup([
    {id:'old',start:'2026-08-01',end:'2026-08-31',harness:'h'},
    {id:'now',start:'2026-09-15',harness:'h'},
    {id:'previous',start:'2026-09-10',end:'2026-09-14',harness:'h'},
    {id:'overlap',start:'2026-09-12',end:'2026-09-16',harness:'h'},
    {id:'gap',start:'2026-09-01',end:'2026-09-08',harness:'h'},
    {id:'future',start:'2027-01-01',harness:'h'}]);
  vm.runInContext("data.harnesses.h={name:'Harness'}; renderOverview()",app.context);
  const stats=vm.runInContext('overviewStats()',app.context);
  assert.equal(stats.tools.model.get('m').currentDays,9);
  assert.equal(stats.tools.harness.get('h').currentDays,9);
  assert.equal(app.nodes.current.children[0].children[1].children[0].children[1].children[1].textContent,'For 9 days');
  vm.runInContext("setLanguage('it'); renderOverview()",app.context);
  assert.equal(app.nodes.current.children[1].children[1].children[0].children[1].children[1].textContent,'Da 9 giorni');
});

test('current duration handles nested intervals, today-only use and inactive tools',()=>{
  const app=setup([
    {id:'long',start:'2026-09-01'},
    {id:'nested',start:'2026-09-10',end:'2026-09-11'},
    {id:'today',start:'2026-09-18',end:'2026-09-18'},
    {id:'harness',start:'2026-09-18',model:null,harness:'h'},
    {id:'ended',start:'2026-09-01',end:'2026-09-17',model:'ended'}]);
  vm.runInContext("data.harnesses.h={name:'Harness'}; data.models.ended={name:'Ended'}; renderOverview()",app.context);
  const stats=vm.runInContext('overviewStats()',app.context);
  assert.equal(stats.tools.model.get('m').currentDays,18);
  assert.equal(stats.tools.model.get('ended').currentDays,0);
  assert.equal(stats.tools.harness.get('h').currentDays,1);
  assert.equal(app.nodes.current.children[1].children[1].children[0].children[1].children[1].textContent,'For 1 day');
});
