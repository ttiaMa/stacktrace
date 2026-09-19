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
    addEventListener(type, handler) { this.events[type]=handler; }
  }
  const nodes = {};
  const context = vm.createContext({URLSearchParams, Intl, Date, Math, Set,
    location:{search,pathname:'/'}, history:{replaceState(){}}, window:{addEventListener(){}},
    document:{events:{},addEventListener(type,handler){this.events[type]=handler;},getElementById:id=>nodes[id] ||= new Node(),createElement:()=>new Node(),createTextNode:text=>text,querySelectorAll:()=>{
      const visit=node=>[...(node.className?.startsWith('period-block')?[node]:[]),...(node.children || []).flatMap(visit)];
      return visit(nodes.timeline);
    }},
    fetch:()=>new Promise(()=>{}),setInterval(){throw new Error('Background polling is not allowed');}});
  vm.runInContext(fs.readFileSync('app/static/app.js','utf8'),context);
  context.fixture={today:'2026-09-18', entries:entries.map(e=>({model:'m',tags:[],notes:'',...e})),
    categories,models:{m:{name:'Model',icon:'M',color:'#abcdef'}},harnesses:{}};
  vm.runInContext('data=fixture; renderTimeline(filtered())',context);
  const rows=()=>nodes.timeline.children[0].children.slice(1);
  const blocks=row=>row.children[1].children.filter(n=>n.className?.startsWith('period-block'));
  return {context,nodes,rows,blocks};
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
  vm.runInContext("state.range='90'; renderTimeline(filtered())",app.context);
  assert.match(app.nodes.timeline.children[0].textContent,/No matching/);
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

test('slider, Latest and arrows share exact bounds at every timeline scale',()=>{
  const app=setup([{id:'a',title:'History',start:'2024-01-01'}]);
  for (const zoom of ['detail','years','fit']) {
    vm.runInContext(`state.zoom='${zoom}'; renderTimeline(filtered())`,app.context);
    assert.equal(Number.isInteger(parseFloat(app.nodes.timeline.children[0].style.width)),true);
    app.nodes['timeline-position'].events.input({target:{value:'1000'}});
    const position=app.nodes.timeline.scrollLeft, dates=app.nodes['visible-dates'].textContent;
    assert.match(dates,/25 Sept 2026$/);
    app.nodes.latest.events.click();
    assert.equal(app.nodes.timeline.scrollLeft,position);
    assert.equal(app.nodes['visible-dates'].textContent,dates);
    app.nodes.later.events.click();
    assert.equal(app.nodes.timeline.scrollLeft,position);
    assert.equal(app.nodes['visible-dates'].textContent,dates);
    app.nodes['timeline-position'].events.input({target:{value:'0'}});
    app.nodes.earlier.events.click();
    assert.equal(app.nodes.timeline.scrollLeft,0);
    app.nodes.latest.events.click();
    assert.equal(app.nodes.timeline.scrollLeft,position);
  }
});
