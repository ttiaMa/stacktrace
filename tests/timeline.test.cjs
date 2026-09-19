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
    document:{getElementById:id=>nodes[id] ||= new Node(),createElement:()=>new Node(),createTextNode:text=>text,querySelectorAll:()=>{
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
