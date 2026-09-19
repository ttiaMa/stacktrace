'use strict';
const $ = id => document.getElementById(id);
const DAY = 86400000;
const parseDate = value => Date.parse(value + 'T00:00:00Z');
const iso = value => new Date(value).toISOString().slice(0, 10);
const human = value => new Intl.DateTimeFormat('en-GB', {day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(parseDate(value));
const params = new URLSearchParams(location.search);
const state = {category: params.get('category') || '', query: params.get('q') || '',
  range: ['90','365'].includes(params.get('range')) ? params.get('range') : 'all',
  zoom: ['fit','years'].includes(params.get('zoom')) ? params.get('zoom') : 'detail',
  view: params.get('view') === 'journal' ? 'journal' : 'timeline', selected: ''};
let data;
let version = '';
let viewport;
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
  for (const [key, value] of Object.entries({category:state.category,q:state.query,range:state.range === 'all' ? '' : state.range,zoom:state.zoom === 'detail' ? '' : state.zoom,view:state.view === 'timeline' ? '' : state.view})) {
    if (value) query.set(key, value);
  }
  history.replaceState(null, '', location.pathname + (query.size ? '?' + query : ''));
}
function choose(entry) { state.selected = entry?.id || ''; renderDetails();
  document.querySelectorAll('.period-block').forEach(block => block.setAttribute('aria-pressed', String(block.dataset.id === state.selected)));
}
function entities(entry) {
  const models = entry.models?.length ? entry.models : entry.model ? [{model:entry.model}] : [];
  return [...models.map(ref=>({kind:'model',id:ref.model,...data.models[ref.model],role:ref.role || ''})),
    ...(entry.harness ? [{kind:'harness',id:entry.harness,...data.harnesses[entry.harness]}] : [])];
}
function entityText(entity) { return entity.icon+' '+entity.name+(entity.role ? ' · '+entity.role : ''); }
// Match names, not version IDs; keep specific harnesses before model families.
const ICON_NAMES = [
  [/\bclaude[\s-]*code\b/i,'claudecode'], [/\bcodex\b/i,'codex'],
  [/\bcursor\b/i,'cursor'], [/\bhermes(?:[\s-]*agent)?\b/i,'hermesagent'],
  [/\bpi(?:[\s-]*agent)?\b/i,'pi'], [/\bai[\s-]*studio\b/i,'aistudio'],
  [/\bollama\b/i,'ollama'], [/\b(?:claude|opus|sonnet|haiku)\b/i,'claude'],
  [/\b(?:gpt|chatgpt|openai|sol|o[134])\b/i,'openai'], [/\bgemini\b/i,'gemini'],
  [/\bdeepseek\b/i,'deepseek'], [/\bqwen\b/i,'qwen'], [/\b(?:llama|meta)\b/i,'meta'],
  [/\bgrok\b/i,'grok'], [/\b(?:mistral|codestral)\b/i,'mistral'],
  [/\bcopilot\b/i,'githubcopilot'], [/\bopenclaw\b/i,'openclaw']
];
function iconKey(name) { return ICON_NAMES.find(([pattern])=>pattern.test(name))?.[1]; }
function entityIcon(entity) {
  const wrapper=el('span','brand-symbol'); wrapper.setAttribute('aria-hidden','true');
  const fallback=el('span','',entity.kind==='model'?'◇':'▣'); wrapper.append(fallback);
  const key=iconKey(entity.name);
  if (key) {
    const img=el('img'); img.alt=''; img.hidden=true;
    img.addEventListener('load',()=>{img.hidden=false;fallback.hidden=true;});
    img.addEventListener('error',()=>{img.hidden=true;fallback.hidden=false;});
    img.src='/icons/'+key+'.svg'; wrapper.append(img);
  }
  return wrapper;
}
function active(entry) { return entry.start <= data.today && (!entry.end || entry.end >= data.today); }
function end(entry) { return parseDate(entry.end || (entry.start > data.today ? entry.start : data.today)) + DAY; }
function badges(entry) {
  const wrapper = el('div','badges');
  for (const entity of entities(entry)) {
    const badge = color(el('span','badge'), entity.color);
    badge.append(el('small','',entity.kind.toUpperCase()), entityIcon(entity), document.createTextNode(entity.name+(entity.role?' · '+entity.role:'')));
    wrapper.append(badge);
  }
  return wrapper;
}
function rangeText(entry) { return `${human(entry.start)} — ${entry.end ? human(entry.end) : entry.start > data.today ? 'planned · open end' : 'present'}`; }
function renderOverview() {
  const current = $('current'); current.replaceChildren();
  const seen = new Set();
  for (const entry of data.entries.filter(active)) {
    for (const entity of entities(entry)) {
      const key = entity.kind + ':' + entity.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const item = el('div','current-item');
      const icon=color(el('span','entity-icon'),entity.color); icon.append(entityIcon(entity)); item.append(icon);
      const label = el('div'); label.append(el('div','entity-name',entity.name),el('p','entity-kind',entity.kind)); item.append(label); current.append(item);
    }
  }
  if (!seen.size) current.append(el('p','caption','No tools active today.'));
  $('stats').replaceChildren();
  const count = field => new Set(data.entries.flatMap(entities).filter(e=>e.kind===field).map(e=>e.id)).size;
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
    [e.title,e.notes,...e.tags,...entities(e).map(entityText), data.categories[e.category]?.name || ''].join(' ').toLocaleLowerCase().includes(query))
    .sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));
}
function renderTimeline(entries) {
  const container = $('timeline'); const scrollLeft = container.scrollLeft || 0, scrollTop = container.scrollTop || 0;
  const previous = viewport;
  container.replaceChildren();
  $('timeline-nav').hidden = !entries.length;
  if (!entries.length) { viewport = undefined; container.append(el('p','empty','No matching periods. Try another filter or add an entry to your YAML.')); return; }
  const today = parseDate(data.today);
  const first = Math.min(...entries.map(e=>parseDate(e.start)),today);
  const last = Math.max(...entries.map(end),today+DAY);
  const start = state.range === 'all' ? first - 5*DAY : today-(Number(state.range)-1)*DAY;
  const finish = state.range === 'all' ? last + 7*DAY : today+DAY;
  const span = Math.max(DAY, finish-start);
  const position = value => Math.max(0,Math.min(100,(value-start)/span*100));
  const chart = el('div','chart');
  const blocks = [];
  const chartWidth = Math.max(740, container.clientWidth, state.zoom === 'fit' ? 0 : 150 + span / (365.25*DAY) * (state.zoom === 'detail' ? 2880 : 480));
  chart.style.width = chartWidth + 'px';
  const axisRow = el('div','axis-row'); axisRow.append(el('div','axis-title','ACTIVITY'));
  const axis = el('div','axis'); const ticks=[];
  const tickCount = Math.max(2, Math.floor((chartWidth-150)/110));
  for (let index=0;index<tickCount;index++) {
    const value = start+span*index/tickCount;
    ticks.push(position(value));
    const tick = el('span','tick-label',new Intl.DateTimeFormat('en-GB',{month:'short',year:'numeric', ...(span/tickCount<28*DAY?{day:'numeric'}:{}),timeZone:'UTC'}).format(new Date(value)));
    tick.style.left=position(value)+'%'; axis.append(tick);
  }
  axisRow.append(axis); chart.append(axisRow);
  const groups = [...Object.entries(data.categories), ['', {name:'Uncategorized', icon:'◇'}]];
  for (const [category, info] of groups) {
    const periods = entries.filter(entry => (entry.category || '') === category);
    if (!periods.length) continue;
    const row = el('div','timeline-row');
    const label = el('div','row-label');
    label.append(el('h3','activity-name',info.icon+' '+info.name),el('div','row-category',`${periods.length} ${periods.length === 1 ? 'period' : 'periods'}`));
    const track = el('div','track');
    for (const tick of ticks) { const grid = el('span','gridline'); grid.style.left=tick+'%'; track.append(grid); }
    if (today>=start && today<finish) { const now = el('span','gridline today-line'); now.style.left=position(today)+'%'; track.append(now); }
    // Reuse a lane as soon as its period ends. Minimum visible widths also
    // participate in packing so short periods remain individually selectable.
    const lanes = [];
    const laneBlocks = [];
    const laneHeights = [];
    for (const entry of periods) {
      const left = position(parseDate(entry.start)), right = position(end(entry));
      const width = Math.min(100-left, Math.max(right-left, 8/(chartWidth-150)*100));
      let lane = lanes.findIndex(until => until <= left);
      if (lane === -1) lane = lanes.length;
      lanes[lane] = left+width;
      const height = 30 + entities(entry).reduce((total,entity)=>total+(entity.role ? 34 : 24),0);
      laneHeights[lane] = Math.max(laneHeights[lane] || 0,height);
      const block = el('button','period-block'+(!entry.end?' ongoing':''));
      (laneBlocks[lane] ||= []).push(block);
      block.dataset.id = entry.id;
      block.style.left = left+'%'; block.style.width = width+'%';
      blocks.push({node:block,left:left/100*(chartWidth-150),right:(left+width)/100*(chartWidth-150)});
      block.setAttribute('aria-pressed', String(entry.id === state.selected));
      const description = `${entry.title}. ${entities(entry).map(entity=>entity.kind+' '+entityText(entity)).join('; ')}. ${rangeText(entry)}`;
      block.title = description; block.setAttribute('aria-label', description);
      block.append(el('span','period-title',entry.title));
      for (const entity of entities(entry)) {
        const strip = color(el('span','period-entity '+entity.kind+(entity.role?' has-role':'')),entity.color);
        const label=el('span','entity-label'); label.append(entityIcon(entity),document.createTextNode(entity.name)); strip.append(label);
        if (entity.role) strip.append(el('span','entity-role',entity.role));
        block.append(strip);
      }
      block.addEventListener('click',()=>choose(entry)); track.append(block);
    }
    let top = 8;
    for (let lane=0; lane<lanes.length; lane++) {
      for (const block of laneBlocks[lane]) {
        block.style.top = top+'px'; block.style.height = laneHeights[lane]+'px';
      }
      top += laneHeights[lane]+8;
    }
    track.style.height = top+'px';
    row.append(label,track); chart.append(row);
  }
  container.append(chart);
  viewport = {start,span,width:chartWidth,visible:container.clientWidth,blocks,key:[state.category,state.query,state.range].join('|')};
  const max = Math.max(0, chartWidth-container.clientWidth);
  if (!previous || previous.key !== viewport.key) {
    const selected = entries.find(e=>e.id===state.selected);
    container.scrollLeft = selected ? Math.max(0, Math.min(max, position(parseDate(selected.start))/100*(chartWidth-150)-(container.clientWidth-150)/2)) : max;
  } else if (previous.width-previous.visible-scrollLeft < 4) {
    container.scrollLeft = max;
  } else {
    const center = previous.start+(scrollLeft+(previous.visible-150)/2)/(previous.width-150)*previous.span;
    container.scrollLeft = Math.max(0,Math.min(max,(center-start)/span*(chartWidth-150)-(container.clientWidth-150)/2));
  }
  container.scrollTop=scrollTop;
  syncNavigation();
}
function syncNavigation() {
  if (!viewport) return;
  const container = $('timeline'), max = Math.max(0,viewport.width-container.clientWidth);
  const slider = $('timeline-position');
  slider.max = String(max); slider.value = String(container.scrollLeft); slider.disabled = max === 0;
  const left = viewport.start+container.scrollLeft/(viewport.width-150)*viewport.span;
  const right = Math.min(viewport.start+viewport.span,left+(container.clientWidth-150)/(viewport.width-150)*viewport.span);
  const text = human(iso(left))+' — '+human(iso(right));
  $('visible-dates').textContent = text; slider.setAttribute('aria-valuetext',text);
  for (const block of viewport.blocks) {
    const available = Math.min(block.right,container.scrollLeft+container.clientWidth-150)-Math.max(block.left,container.scrollLeft)-16;
    block.node.style.setProperty('--visible-label-width',Math.max(0,available)+'px');
  }
}
function renderJournal(entries) {
  $('journal').replaceChildren();
  if (!entries.length) $('journal').append(el('p','empty','No matching periods.'));
  for (const entry of [...entries].reverse()) {
    const item = el('article','journal-item');
    item.append(el('p','eyebrow',entry.category?data.categories[entry.category].name:'Period of use'),el('div','period-date',rangeText(entry)),el('h3','',entry.title),badges(entry));
    appendStory(item,entry);
    $('journal').append(item);
  }
}
function renderMain() {
  const entries = filtered();
  $('results-count').textContent = `${entries.length} of ${data.entries.length} periods · ${state.range==='all'?'complete history':'rolling window'}`;
  $('timeline').hidden=state.view!=='timeline'; $('journal').hidden=state.view!=='journal';
  $('details').hidden=state.view==='journal';
  $('timeline-nav').hidden=state.view!=='timeline' || !entries.length;
  $('zoom').hidden=state.view!=='timeline';
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
  const close=el('button','','×'); close.setAttribute('aria-label','Close period details'); close.addEventListener('click',()=>choose(null));
  top.append(heading,close); target.append(top,badges(entry));
  appendStory(target,entry);
}
function appendStory(target,entry) {
  if (entry.notes) target.append(el('p','notes',entry.notes));
  if (entry.url) { const link=el('a','','Related project ↗'); link.href=entry.url; link.target='_blank'; link.rel='noopener noreferrer'; target.append(link); }
  const tags=el('div'); for (const tag of entry.tags) tags.append(el('span','tag','#'+tag)); target.append(tags);
}
function renderProfile() {
  const link=$('profile-link');
  link.hidden=!data.site.github;
  link.href=data.site.github || '';
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
    renderProfile();
    $('today-label').textContent=human(data.today).toUpperCase();
    renderOverview(); renderCategories(); renderMain(); renderDetails();
  } catch (error) { notice(data?'Unable to refresh. Showing the last loaded timeline.':error.message); }
}
$('search').value=state.query; $('range').value=state.range;
$('zoom').value=state.zoom;
$('timeline').addEventListener('click',event=>{
  if (data && state.selected && !event.target.closest('.period-block')) choose(null);
});
$('timeline').addEventListener('scroll',syncNavigation);
$('timeline-position').addEventListener('input',event=>{ $('timeline').scrollLeft=Number(event.target.value); syncNavigation(); });
for (const [id, direction] of [['earlier',-1],['later',1]]) $(id).addEventListener('click',()=>{
  const container=$('timeline'); container.scrollLeft+=direction*Math.max(150,container.clientWidth-150)*.8; syncNavigation();
});
$('latest').addEventListener('click',()=>{if(viewport){$('timeline').scrollLeft=viewport.width;syncNavigation();}});
$('zoom').addEventListener('change',event=>{state.zoom=event.target.value;updateURL();if(data)renderMain();});
window.addEventListener('resize',()=>{if(data && state.view === 'timeline') renderMain();});
$('search').addEventListener('input',event=>{state.query=event.target.value;updateURL();if(data)renderMain();});
$('range').addEventListener('change',event=>{state.range=event.target.value;updateURL();if(data)renderMain();});
for (const view of ['timeline','journal']) $(view+'-view').addEventListener('click',()=>{state.view=view;updateURL();if(data)renderMain();});
$('share').addEventListener('click',async()=>{
  try { await navigator.clipboard.writeText(location.href); $('share').textContent='✓ Link copied'; setTimeout(()=>{$('share').textContent='Share';},2000); }
  catch { window.prompt('Copy this view’s link:',location.href); }
});
// Load once per page visit. New YAML data and today's date appear on reload.
updateURL(); // Drop legacy entry links: selection belongs only to this page visit.
refresh();
