'use strict';
const $ = id => document.getElementById(id);
const DAY = 86400000;
const parseDate = value => Date.parse(value + 'T00:00:00Z');
const iso = value => new Date(value).toISOString().slice(0, 10);
const human = value => new Intl.DateTimeFormat('en-GB', {day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(parseDate(value));
const params = new URLSearchParams(location.search);
const state = {category: params.get('category') || '', query: params.get('q') || '',
  range: ['90','365'].includes(params.get('range')) ? params.get('range') : 'all',
  view: params.get('view') === 'journal' ? 'journal' : 'timeline', selected: params.get('entry') || ''};
let data;
let version = '';
function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
function color(node, value) { node.style.setProperty('--entity', value); return node; }
function updateURL() {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({category:state.category,q:state.query,range:state.range === 'all' ? '' : state.range,view:state.view === 'timeline' ? '' : state.view,entry:state.selected})) {
    if (value) query.set(key, value);
  }
  history.replaceState(null, '', location.pathname + (query.size ? '?' + query : ''));
}
function choose(entry) { state.selected = entry.id; updateURL(); renderDetails();
  document.querySelectorAll('.timeline-row').forEach(row => row.classList.toggle('selected', row.dataset.id === entry.id));
}
function entities(entry) {
  return [['model','models'],['harness','harnesses']].filter(([field]) => entry[field]).map(([kind,catalog]) => ({kind,id:entry[kind],...data[catalog][entry[kind]]}));
}
function active(entry) { return entry.start <= data.today && (!entry.end || entry.end >= data.today); }
function end(entry) { return parseDate(entry.end || (entry.start > data.today ? entry.start : data.today)) + DAY; }
function badges(entry) {
  const wrapper = el('div','badges');
  for (const entity of entities(entry)) {
    const badge = color(el('span','badge'), entity.color);
    badge.append(el('small','',entity.kind.toUpperCase()), document.createTextNode(entity.icon + ' ' + entity.name));
    wrapper.append(badge);
  }
  return wrapper;
}
function rangeText(entry) { return `${human(entry.start)} — ${entry.end ? human(entry.end) : entry.start > data.today ? 'planned · open end' : 'present'}`; }
function renderSidebar() {
  const current = $('current'); current.replaceChildren();
  const seen = new Set();
  for (const entry of data.entries.filter(active)) {
    for (const entity of entities(entry)) {
      const key = entity.kind + ':' + entity.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const item = el('div','current-item');
      item.append(color(el('span','entity-icon',entity.icon),entity.color));
      const label = el('div'); label.append(el('div','entity-name',entity.name),el('p','entity-kind',entity.kind)); item.append(label); current.append(item);
    }
  }
  if (!seen.size) current.append(el('p','caption','No tools active today.'));
  $('stats').replaceChildren();
  const count = field => new Set(data.entries.map(e=>e[field]).filter(Boolean)).size;
  for (const [label, value] of [['Models used',count('model')],['Harnesses used',count('harness')],['Periods recorded',data.entries.length]]) {
    const row = el('div','stat'); row.append(el('span','',label),el('strong','',String(value).padStart(2,'0'))); $('stats').append(row);
  }
}
function renderCategories() {
  $('categories').replaceChildren();
  for (const [id, label] of [['','All activity'], ...Object.entries(data.categories).map(([key,c])=>[key,c.icon + ' ' + c.name])]) {
    const button = el('button','',label); button.setAttribute('aria-pressed',String(state.category === id));
    button.addEventListener('click',()=>{state.category=id; updateURL(); renderCategories(); renderMain();}); $('categories').append(button);
  }
}
function filtered() {
  const query = state.query.toLocaleLowerCase();
  const cutoff = state.range === 'all' ? -Infinity : parseDate(data.today) - (Number(state.range)-1)*DAY;
  const stop = parseDate(data.today) + DAY;
  return data.entries.filter(e => (!state.category || e.category === state.category) &&
    (state.range === 'all' || (end(e)>cutoff && parseDate(e.start)<stop)) &&
    [e.title,e.notes,...e.tags,...entities(e).map(x=>x.name), data.categories[e.category]?.name || ''].join(' ').toLocaleLowerCase().includes(query))
    .sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));
}
function renderTimeline(entries) {
  const container = $('timeline'); const scrollLeft = container.scrollLeft, scrollTop = container.scrollTop;
  container.replaceChildren();
  if (!entries.length) { container.append(el('p','empty','No matching periods. Try another filter or add an entry to your YAML.')); return; }
  const today = parseDate(data.today);
  const first = Math.min(...entries.map(e=>parseDate(e.start)),today);
  const last = Math.max(...entries.map(end),today+DAY);
  const start = state.range === 'all' ? first - 5*DAY : today-(Number(state.range)-1)*DAY;
  const finish = state.range === 'all' ? last + Math.max(5*DAY,(last-first)*.03) : today+DAY;
  const span = Math.max(DAY, finish-start);
  const position = value => Math.max(0,Math.min(100,(value-start)/span*100));
  const chart = el('div','chart');
  const axisRow = el('div','axis-row'); axisRow.append(el('div','axis-title','PERIOD / ACTIVITY'));
  const axis = el('div','axis'); const ticks=[];
  for (let index=0;index<6;index++) {
    const value = start+span*index/6;
    ticks.push(position(value));
    const tick = el('span','tick-label',new Intl.DateTimeFormat('en-GB',{month:'short', ...(span>365*DAY?{year:'2-digit'}:{day:'numeric'}),timeZone:'UTC'}).format(new Date(value)));
    tick.style.left=position(value)+'%'; axis.append(tick);
  }
  axisRow.append(axis); chart.append(axisRow);
  for (const entry of entries) {
    const row = el('div','timeline-row'+(entry.id===state.selected?' selected':'')); row.dataset.id=entry.id;
    const label = el('div','row-label'); const button = el('button','row-title',entry.title); button.title=entry.title; button.addEventListener('click',()=>choose(entry));
    label.append(button,el('div','row-category',entry.category?data.categories[entry.category].name:'Uncategorized'));
    const track = el('div','track');
    for (const tick of ticks) { const grid = el('span','gridline'); grid.style.left=tick+'%'; track.append(grid); }
    if (today>=start && today<finish) { const now = el('span','gridline today-line'); now.style.left=position(today)+'%'; track.append(now); }
    const left = position(parseDate(entry.start)), right = position(end(entry));
    for (const entity of entities(entry)) {
      const bar = color(el('button','bar '+entity.kind+(!entry.end?' ongoing':''),entity.icon+' '+entity.name), entity.color);
      bar.style.left=left+'%'; bar.style.width=Math.max(0,right-left)+'%';
      const description = `${entry.title}: ${entity.kind} ${entity.name}. ${rangeText(entry)}`;
      bar.title=description; bar.setAttribute('aria-label',description); bar.addEventListener('click',()=>choose(entry)); track.append(bar);
    }
    row.append(label,track); chart.append(row);
  }
  container.append(chart); container.scrollLeft=scrollLeft; container.scrollTop=scrollTop;
}
function renderJournal(entries) {
  $('journal').replaceChildren();
  if (!entries.length) $('journal').append(el('p','empty','No matching periods.'));
  for (const entry of [...entries].reverse()) {
    const item = el('article','journal-item'); const button=el('button','',entry.title); button.addEventListener('click',()=>choose(entry));
    item.append(el('div','period-date',rangeText(entry)),button,badges(entry));
    if (entry.notes) item.append(el('p','notes',entry.notes));
    $('journal').append(item);
  }
}
function renderMain() {
  const entries = filtered();
  $('results-count').textContent = `${entries.length} of ${data.entries.length} periods · ${state.range==='all'?'complete history':'rolling window'}`;
  $('timeline').hidden=state.view!=='timeline'; $('journal').hidden=state.view!=='journal';
  $('timeline-view').setAttribute('aria-pressed',String(state.view==='timeline'));
  $('journal-view').setAttribute('aria-pressed',String(state.view==='journal'));
  if (state.view==='timeline') renderTimeline(entries); else renderJournal(entries);
}
function renderDetails() {
  const entry = data.entries.find(e=>e.id===state.selected);
  if (!entry) {
    if (state.selected) { state.selected=''; updateURL(); }
    $('details').replaceChildren();
    const empty=el('div','empty-detail'); empty.append(el('span','','↖'));
    const copy=el('div'); copy.append(el('h2','','Every switch has a story.'),el('p','caption','Select a period to see its models, harness, notes and links.')); empty.append(copy); $('details').append(empty); return;
  }
  const target=$('details'); target.replaceChildren();
  const top=el('div','detail-top'), heading=el('div');
  heading.append(el('p','eyebrow',entry.category?data.categories[entry.category].name:'Period of use'),el('h3','',entry.title),el('p','period-date',rangeText(entry)));
  const close=el('button','','×'); close.setAttribute('aria-label','Close period details'); close.addEventListener('click',()=>{state.selected='';updateURL();renderDetails();renderMain();});
  top.append(heading,close); target.append(top,badges(entry));
  if (entry.notes) target.append(el('p','notes',entry.notes));
  if (entry.url) { const link=el('a','','Related project ↗'); link.href=entry.url; link.target='_blank'; link.rel='noopener noreferrer'; target.append(link); }
  const tags=el('div'); for (const tag of entry.tags) tags.append(el('span','tag','#'+tag)); target.append(tags);
}
async function refresh() {
  try {
    const response=await fetch('/api/timeline',{cache:'no-store'});
    if (!response.ok) throw new Error('Configuration unavailable. Check the server logs.');
    const next=await response.json();
    notice(next.stale?'The YAML has an error. Showing the last valid timeline; check the server logs.':'');
    if (version===next.revision+next.today) return;
    data=next; version=data.revision+data.today;
    if (state.category && !data.categories[state.category]) {state.category='';updateURL();}
    document.title=data.site.title+' · Stacktrace'; $('title').textContent=data.site.title;
    $('description').textContent=data.site.description; $('author').textContent=data.site.author+' / AI JOURNAL';
    $('clock').textContent=human(data.today).toUpperCase(); $('today-label').textContent=human(data.today).toUpperCase();
    renderSidebar(); renderCategories(); renderMain(); renderDetails();
  } catch (error) { notice(data?'Unable to refresh. Showing the last loaded timeline.':error.message); }
}
$('search').value=state.query; $('range').value=state.range;
$('search').addEventListener('input',event=>{state.query=event.target.value;updateURL();if(data)renderMain();});
$('range').addEventListener('change',event=>{state.range=event.target.value;updateURL();if(data)renderMain();});
for (const view of ['timeline','journal']) $(view+'-view').addEventListener('click',()=>{state.view=view;updateURL();if(data)renderMain();});
$('share').addEventListener('click',async()=>{
  try { await navigator.clipboard.writeText(location.href); $('share').textContent='✓ Link copied'; setTimeout(()=>{$('share').textContent='↗ Share view';},2000); }
  catch { window.prompt('Copy this view’s link:',location.href); }
});
refresh(); setInterval(refresh,30000);
