'use strict';
const $ = id => document.getElementById(id);
const DAY = 86400000;
const parseDate = value => Date.parse(value + 'T00:00:00Z');
const iso = value => new Date(value).toISOString().slice(0, 10);
const human = value => new Intl.DateTimeFormat(LOCALES[language], {day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(parseDate(value));
const params = new URLSearchParams(location.search);
const state = {category: params.get('category') || '', query: params.get('q') || '',
  section: params.get('section') === 'stats' ? 'stats' : 'journal',
  zoom: ['fit','years'].includes(params.get('zoom')) ? params.get('zoom') : 'detail',
  view: params.get('view') === 'journal' ? 'journal' : 'timeline', selected: ''};
let data;
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
  for (const [key, value] of Object.entries({category:state.category,q:state.query,zoom:state.zoom === 'detail' ? '' : state.zoom,view:state.view === 'timeline' ? '' : state.view,section:state.section==='stats'?'stats':''})) {
    if (value) query.set(key, value);
  }
  history.replaceState(null, '', location.pathname + (query.size ? '?' + query : ''));
}
function choose(entry) { updateHistory({selected:entry?.id || ''}); }
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
    badge.append(el('small','',t(entity.kind).toLocaleUpperCase(LOCALES[language])), entityIcon(entity), el('span','badge-label',entity.name+(entity.role?' · '+entity.role:'')));
    wrapper.append(badge);
  }
  return wrapper;
}
function rangeText(entry) { return `${human(entry.start)} - ${entry.end ? human(entry.end) : entry.start > data.today ? t('planned') : t('present')}`; }
// Inclusive calendar intervals; merge overlaps so parallel periods count once.
function trackedDays(intervals) {
  let total=0, finish=-Infinity;
  for (const [start, end] of [...intervals].sort((a,b)=>a[0]-b[0])) {
    total += Math.max(0, end-Math.max(start,finish));
    finish = Math.max(finish,end);
  }
  return total/DAY;
}
// Walk backward from today through overlapping or directly adjacent intervals.
function currentStreakDays(intervals, today) {
  let start=today+DAY;
  for (const [begin, finish] of [...intervals].sort((a,b)=>b[0]-a[0])) {
    if (finish>=start) start=Math.min(start,begin);
  }
  return (today+DAY-start)/DAY;
}
function overviewStats() {
  const today=parseDate(data.today), intervals=[], tools={model:new Map(),harness:new Map()};
  let duration=0, periods=0, first=null, last=null;
  for (const entry of data.entries) {
    const start=parseDate(entry.start), finish=Math.min(parseDate(entry.end || data.today),today)+DAY;
    const started=start<=today;
    if (started) {
      intervals.push([start,finish]); duration+=(finish-start)/DAY; periods++;
      first=first===null?start:Math.min(first,start);
      last=last===null?start:Math.max(last,start);
      // A closed period leaves the rotation on the day after its inclusive end.
      if (entry.end && finish<=today) last=Math.max(last,finish);
    }
    for (const entity of entities(entry)) {
      const group=tools[entity.kind];
      if (!group.has(entity.id)) group.set(entity.id,{...entity,intervals:[],first:null,current:false});
      const tool=group.get(entity.id);
      if (started) {
        tool.intervals.push([start,finish]);
        tool.first=tool.first===null?start:Math.min(tool.first,start);
      }
      tool.current ||= active(entry);
    }
  }
  for (const group of Object.values(tools)) for (const tool of group.values()) {
    tool.days=trackedDays(tool.intervals);
    tool.currentDays=tool.current?currentStreakDays(tool.intervals,today):0;
  }
  return {tools,days:trackedDays(intervals),average:periods?duration/periods:null,first,last};
}
function renderOverview() {
  const summary=overviewStats();
  const number=value=>new Intl.NumberFormat(LOCALES[language],{maximumFractionDigits:1}).format(value);
  const days=value=>t('dayCount',{count:number(value)});
  const current=$('current'); current.replaceChildren();
  for (const kind of ['model','harness']) {
    const group=el('section','rotation-group'); group.append(el('h3','',t(kind==='model'?'models':'harnesses')));
    const list=el('div','rotation-list');
    const activeTools=[...summary.tools[kind].values()].filter(tool=>tool.current);
    for (const entity of activeTools) {
      const item=el('div','current-item');
      const icon=color(el('span','entity-icon'),entity.color); icon.append(entityIcon(entity));
      const label=el('div','current-label');
      label.append(el('div','entity-name',entity.name),el('p','current-duration',t(entity.currentDays===1?'currentDay':'currentDays',{count:number(entity.currentDays)})));
      item.append(icon,label); list.append(item);
    }
    if (!activeTools.length) list.append(el('p','caption',t('emptyCurrent')));
    group.append(list); current.append(group);
  }
  $('stats').replaceChildren();
  for (const [label,value,symbol] of [['modelsUsed',summary.tools.model.size,'◇'],['harnessesUsed',summary.tools.harness.size,'⚙'],['periodsRecorded',data.entries.length,'▤'],['daysTracked',summary.days,'▦']]) {
    const row=el('div','stat');
    row.append(el('span','',t(label)),el('strong','',String(value).padStart(2,'0')));
    const icon=el('span','stat-icon',symbol); icon.setAttribute('aria-hidden','true'); row.append(icon); $('stats').append(row);
  }
  const insights=$('insights'); insights.replaceChildren();
  const add=(label,value,detail)=>{
    const item=el('div','insight'); item.append(el('span','caption',t(label)),el('strong','',value ?? '—'));
    if (detail) item.append(el('p','caption',detail)); insights.append(item);
  };
  add('firstRecorded',summary.first===null?null:human(iso(summary.first)));
  add('lastChange',summary.last===null?null:human(iso(summary.last)),t('lastChangeHelp'));
  add('averagePeriod',summary.average===null?null:days(summary.average),t('averagePeriodHelp'));
  for (const kind of ['model','harness']) {
    const used=[...summary.tools[kind].values()].filter(tool=>tool.first!==null);
    const maximum=Math.max(0,...used.map(tool=>tool.days));
    const longest=used.filter(tool=>tool.days===maximum);
    add(kind==='model'?'stableModel':'longestHarness',longest.length?longest.map(tool=>tool.name).join(' · '):null,longest.length?days(maximum):null);
    const earliest=Math.min(...used.map(tool=>tool.first));
    const first=used.filter(tool=>tool.first===earliest);
    add(kind==='model'?'firstModel':'firstHarness',first.length?first.map(tool=>tool.name).join(' · '):null,first.length?human(iso(earliest)):null);
  }
}
function renderCategories() {
  $('categories').replaceChildren();
  for (const [id, label] of [['',t('allActivity')], ...Object.entries(data.categories).map(([key,c])=>[key,c.name])]) {
    const button = el('button','',label); button.setAttribute('aria-pressed',String(state.category === id));
    button.dataset.category=id;
    button.addEventListener('click',()=>updateHistory({category:id})); $('categories').append(button);
  }
}
function filtered() {
  const query = state.query.toLocaleLowerCase();
  return data.entries.filter(e => (!state.category || e.category === state.category) &&
    [e.title,e.notes,...e.tags,...entities(e).map(entityText), data.categories[e.category]?.name || ''].join(' ').toLocaleLowerCase().includes(query))
    .sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));
}
function renderTimeline(entries) {
  const container = $('timeline'); const scrollLeft = container.scrollLeft || 0, scrollTop = container.scrollTop || 0;
  const previous = viewport;
  $('timeline-nav').hidden = !entries.length;
  if (!entries.length) { viewport = undefined; container.replaceChildren(el('p','empty',t('noMatchesTimeline'))); return; }
  const today = parseDate(data.today);
  const first = Math.min(...entries.map(e=>parseDate(e.start)),today);
  const last = Math.max(...entries.map(end),today+DAY);
  const start = first - 5*DAY;
  const finish = last + 7*DAY;
  const span = Math.max(DAY, finish-start);
  const position = value => Math.max(0,Math.min(100,(value-start)/span*100));
  const chart = el('div','chart');
  const blocks = [];
  const chartWidth = Math.ceil(Math.max(740, container.clientWidth, state.zoom === 'fit' ? 0 : 150 + span / (365.25*DAY) * (state.zoom === 'detail' ? 2880 : 480)));
  chart.style.width = chartWidth + 'px';
  const axisRow = el('div','axis-row'); axisRow.append(el('div','axis-title',t('activity')));
  const axis = el('div','axis'); const ticks=[];
  const tickCount = Math.max(2, Math.floor((chartWidth-150)/110));
  for (let index=0;index<tickCount;index++) {
    const value = start+span*index/tickCount;
    ticks.push(position(value));
    const tick = el('span','tick-label',new Intl.DateTimeFormat(LOCALES[language],{month:'short',year:'numeric', ...(span/tickCount<28*DAY?{day:'numeric'}:{}),timeZone:'UTC'}).format(new Date(value)));
    tick.style.left=position(value)+'%'; axis.append(tick);
  }
  axisRow.append(axis); chart.append(axisRow);
  const groups = [...Object.entries(data.categories), ['', {name:t('uncategorized')}]];
  for (const [category, info] of groups) {
    const periods = entries.filter(entry => (entry.category || '') === category);
    if (!periods.length) continue;
    const row = el('div','timeline-row');
    const label = el('div','row-label');
    label.append(el('h3','activity-name',info.name),el('div','row-category',t(periods.length===1?'periodOne':'periodOther',{count:periods.length})));
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
      const height = 30 + entities(entry).length * 24;
      laneHeights[lane] = Math.max(laneHeights[lane] || 0,height);
      const block = el('button','period-block'+(!entry.end?' ongoing':''));
      (laneBlocks[lane] ||= []).push(block);
      block.dataset.id = entry.id;
      block.style.left = left+'%'; block.style.width = width+'%';
      blocks.push({node:block,left:left/100*(chartWidth-150),right:(left+width)/100*(chartWidth-150)});
      block.setAttribute('aria-pressed', String(entry.id === state.selected));
      const description = `${entry.title}. ${entities(entry).map(entity=>t(entity.kind)+' '+entityText(entity)).join('; ')}. ${rangeText(entry)}`;
      block.title = entry.title + "\n" + rangeText(entry); block.setAttribute('aria-label', description);
      block.append(el('span','period-title',entry.title));
      for (const entity of entities(entry)) {
        const strip = color(el('span','period-entity '+entity.kind),entity.color);
        const label=el('span','entity-label'), copy=el('span','entity-copy',entity.name);
        if (entity.role) copy.append(el('span','entity-role',' · '+entity.role));
        label.append(entityIcon(entity),copy);
        strip.append(label);
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
  // Build off-screen, then replace once; never measure an emptied live chart.
  container.replaceChildren(chart);
  viewport = {start,span,width:chartWidth,visible:container.clientWidth,blocks,key:[state.category,state.query].join('|')};
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
function maxTimelineScroll() {
  return viewport ? Math.max(0,viewport.width-$('timeline').clientWidth) : 0;
}
function setTimelinePosition(position) {
  if (!viewport) return;
  $('timeline').scrollLeft=Math.max(0,Math.min(maxTimelineScroll(),position));
  syncNavigation();
}
function goToToday() {
  if (!viewport) return;
  const todayPosition=(parseDate(data.today)-viewport.start)/viewport.span*(viewport.width-150);
  setTimelinePosition(todayPosition-($('timeline').clientWidth-150)/2);
}
function syncNavigation() {
  if (!viewport) return;
  const container = $('timeline'), max = maxTimelineScroll();
  $('earlier').disabled=container.scrollLeft<=0;
  $('later').disabled=container.scrollLeft>=max;
  const left = viewport.start+container.scrollLeft/(viewport.width-150)*viewport.span;
  const right = container.scrollLeft >= max ? viewport.start+viewport.span : Math.min(viewport.start+viewport.span,left+(container.clientWidth-150)/(viewport.width-150)*viewport.span);
  // The right boundary is exclusive, just like period end positions.
  const text = human(iso(left))+' - '+human(iso(right-1));
  $('visible-dates').textContent = text;
  for (const block of viewport.blocks) {
    const available = Math.min(block.right,container.scrollLeft+container.clientWidth-150)-Math.max(block.left,container.scrollLeft)-16;
    block.node.style.setProperty('--visible-label-width',Math.max(0,available)+'px');
  }
}
function renderJournal(entries) {
  const articles=[];
  if (!entries.length) articles.push(el('p','empty',t('noMatches')));
  for (const entry of [...entries].reverse()) {
    const item = el('article','journal-item');
    item.append(el('p','eyebrow',entry.category?data.categories[entry.category].name:t('usePeriod')),el('div','period-date',rangeText(entry)),el('h3','',entry.title),badges(entry));
    appendStory(item,entry);
    articles.push(item);
  }
  $('journal').replaceChildren(...articles);
}
function renderMain() {
  const statsPage=state.section==='stats';
  $('history-page').hidden=statsPage; $('stats-page').hidden=!statsPage;
  $('journal-section').setAttribute('aria-pressed',String(!statsPage));
  $('stats-section').setAttribute('aria-pressed',String(statsPage));
  if (statsPage) return;
  const entries = filtered();
  $('results-count').textContent = t('results',{visible:entries.length,total:data.entries.length});
  // Render the destination before hiding the previous view to avoid an empty layout.
  if (state.view==='timeline') { $('timeline').hidden=false; renderTimeline(entries); }
  else renderJournal(entries);
  $('timeline').hidden=state.view!=='timeline'; $('journal').hidden=state.view!=='journal';
  $('details').hidden=state.view==='journal';
  $('timeline-nav').hidden=state.view!=='timeline' || !entries.length;
  $('zoom-control').hidden=state.view!=='timeline';
  $('timeline-view').setAttribute('aria-pressed',String(state.view==='timeline'));
  $('journal-view').setAttribute('aria-pressed',String(state.view==='journal'));
  $('view-switch').dataset.view=state.view;
}
function updateHistory(changes) {
  if (Object.entries(changes).every(([key,value])=>state[key]===value)) return;
  const left=window.scrollX, top=window.scrollY;
  Object.assign(state,changes); updateURL();
  if (data) {
    // If the result becomes shorter than the visible page, retain only the space
    // needed below this viewport. Otherwise the browser must clamp scrollY.
    // This belongs to the history region, not a permanent minimum on the body.
    const page=$('history-page'), bounds=page.getBoundingClientRect();
    const below=Math.max(0,document.documentElement.scrollHeight-(top+bounds.bottom));
    page.style.minHeight=Math.ceil(Math.max(0,window.innerHeight-bounds.top-below))+'px';
    for (const button of $('categories').children) {
      button.setAttribute('aria-pressed',String(button.dataset.category===state.category));
    }
    if ('selected' in changes) {
      renderDetails();
      document.querySelectorAll('.period-block').forEach(block=>block.setAttribute('aria-pressed',String(block.dataset.id===state.selected)));
    } else renderMain();
    window.scrollTo({left,top,behavior:'instant'});
  }
}
function switchSection(section) {
  if (state.section===section) return;
  state.section=section; updateURL();
  $('history-page').style.minHeight='';
  if (data) renderMain();
}
function renderDetails() {
  const entry = data.entries.find(e=>e.id===state.selected);
  if (!entry) {
    if (state.selected) { state.selected=''; updateURL(); }
    $('details').replaceChildren();
    const empty=el('div','empty-detail'); empty.append(el('span','','↖'));
    const copy=el('div'); copy.append(el('h2','',t('emptyTitle')),el('p','caption',t('emptyDetails'))); empty.append(copy); $('details').append(empty); return;
  }
  const target=$('details'); target.replaceChildren();
  const top=el('div','detail-top'), heading=el('div');
  heading.append(el('p','eyebrow',entry.category?data.categories[entry.category].name:t('usePeriod')),el('h3','',entry.title),el('p','period-date',rangeText(entry)));
  const close=el('button','','×'); close.setAttribute('aria-label',t('closeDetails')); close.addEventListener('click',()=>choose(null));
  top.append(heading,close); target.append(top,badges(entry));
  appendStory(target,entry);
}
function appendStory(target,entry) {
  if (entry.notes) target.append(el('p','notes',entry.notes));
  if (entry.url) { const link=el('a','',t('relatedProject')); link.href=entry.url; link.target='_blank'; link.rel='noopener noreferrer'; target.append(link); }
  const tags=el('div'); for (const tag of entry.tags) tags.append(el('span','tag','#'+tag)); target.append(tags);
}
function renderAuthor() {
  const author=$('author'); author.replaceChildren();
  if (data.site.url) {
    const link=el('a','author-link',data.site.author);
    link.href=data.site.url; link.target='_blank'; link.rel='noopener noreferrer';
    author.append(link);
  } else author.append(document.createTextNode(data.site.author));
  author.append(document.createTextNode(' / '+t('authorJournal')));
}
let infoMode='';
function setInfo(open,mode='') {
  $('app-info').hidden=!open;
  $('info-toggle').setAttribute('aria-expanded',String(open));
  infoMode=open?mode:'';
}
function enhanceSelect(id) {
  const select=$(id), wrapper=$(id+'-control');
  const options=Array.from(select.options);
  const trigger=el('button','select-trigger'), list=el('div','select-options');
  const label=select.getAttribute('aria-label');
  trigger.id=id+'-trigger'; trigger.type='button';
  trigger.setAttribute('role','combobox'); trigger.setAttribute('aria-label',label);
  trigger.setAttribute('aria-haspopup','listbox'); trigger.setAttribute('aria-expanded','false');
  list.id=id+'-options'; list.hidden=true;
  list.setAttribute('role','listbox'); list.setAttribute('aria-label',label);
  trigger.setAttribute('aria-controls',list.id);
  // Keep focus on the combobox until the option's click has committed.
  list.addEventListener('pointerdown',event=>event.preventDefault());
  let highlighted=0;
  const items=options.map((option,index)=>{
    const item=el('div','select-option',option.textContent);
    item.id=id+'-option-'+index; item.setAttribute('role','option');
    item.addEventListener('click',()=>commit(index));
    list.append(item); return item;
  });
  function highlight(index) {
    highlighted=(index+items.length)%items.length;
    items.forEach((item,i)=>{item.dataset.highlighted=String(i===highlighted);});
    trigger.setAttribute('aria-activedescendant',items[highlighted].id);
  }
  function sync() {
    trigger.setAttribute('aria-label',select.getAttribute('aria-label'));
    list.setAttribute('aria-label',select.getAttribute('aria-label'));
    items.forEach((item,index)=>{item.textContent=options[index].textContent;});
    trigger.textContent=options.find(option=>option.value===select.value).textContent;
    items.forEach((item,index)=>item.setAttribute('aria-selected',String(options[index].value===select.value)));
  }
  function close() {
    list.hidden=true; trigger.setAttribute('aria-expanded','false');
    trigger.removeAttribute('aria-activedescendant');
  }
  function open() {
    list.hidden=false; trigger.setAttribute('aria-expanded','true');
    highlight(options.findIndex(option=>option.value===select.value));
  }
  function commit(index) {
    select.value=options[index].value; sync(); close();
    trigger.focus({preventScroll:true});
    select.dispatchEvent(new Event('change',{bubbles:true}));
  }
  trigger.addEventListener('click',()=>{if(list.hidden)open();else close();});
  trigger.addEventListener('keydown',event=>{
    const key=event.key;
    if (key==='Escape') { event.preventDefault(); close(); return; }
    if (key==='Tab') { if(!list.hidden)commit(highlighted); return; }
    if (['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(key)) {
      event.preventDefault();
      if (list.hidden) { open(); if(key==='Home')highlight(0); if(key==='End')highlight(items.length-1); }
      else if (key==='Enter'||key===' ') commit(highlighted);
      else highlight(key==='Home'?0:key==='End'?items.length-1:highlighted+(key==='ArrowDown'?1:-1));
    } else if (key.length===1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const next=options.findIndex(option=>option.textContent.toLowerCase().startsWith(key.toLowerCase()));
      if(next>=0) { event.preventDefault(); if(list.hidden)open(); highlight(next); }
    }
  });
  wrapper.addEventListener('focusout',event=>{if(!wrapper.contains(event.relatedTarget))close();});
  document.addEventListener('click',event=>{if(!wrapper.contains(event.target))close();});
  select.addEventListener('change',sync);
  sync(); select.hidden=true; wrapper.append(trigger,list);
  return sync;
}
async function loadTimeline() {
  try {
    const response=await fetch('/api/timeline',{cache:'no-store'});
    if (!response.ok) throw new Error(t('configUnavailable'));
    const next=await response.json();
    data=next;
    setLanguage(data.site.language); translatePage(); refreshZoomLabels();
    notice(next.stale?t('stale'):'');
    if (state.category && !data.categories[state.category]) {state.category='';updateURL();}
    document.title=data.site.title+' · Stacktrace'; $('title').textContent=data.site.title;
    $('description').textContent=data.site.description;
    renderAuthor();
    $('app-version').textContent=data.app_version || t('development');
    $('today-label').textContent=human(data.today).toUpperCase();
    renderOverview(); renderCategories(); renderMain(); renderDetails();
  } catch (error) { notice(error.message); }
}
$('search').value=state.query;
$('zoom').value=state.zoom;
const refreshZoomLabels=enhanceSelect('zoom');
$('info-toggle').addEventListener('click',()=>setInfo(infoMode!=='click','click'));
$('info-wrap').addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')setInfo(true,'hover');});
$('info-wrap').addEventListener('pointerleave',()=>setInfo(false));
$('info-wrap').addEventListener('focusin',()=>{if(!infoMode)setInfo(true,'focus');});
$('info-wrap').addEventListener('focusout',event=>{if(!$('info-wrap').contains(event.relatedTarget))setInfo(false);});
document.addEventListener('click',event=>{if(!$('info-wrap').contains(event.target))setInfo(false);});
document.addEventListener('keydown',event=>{if(event.key==='Escape')setInfo(false);});
$('timeline').addEventListener('click',event=>{
  if (data && state.selected && !event.target.closest('.period-block')) choose(null);
});
$('timeline').addEventListener('scroll',syncNavigation);
for (const [id, direction] of [['earlier',-1],['later',1]]) $(id).addEventListener('click',()=>{
  const container=$('timeline'); setTimelinePosition(container.scrollLeft+direction*Math.max(150,container.clientWidth-150)*.8);
});
$('go-today').addEventListener('click',goToToday);
$('zoom').addEventListener('change',event=>updateHistory({zoom:event.target.value}));
window.addEventListener('resize',()=>{if(data && state.section==='journal' && state.view === 'timeline') renderMain();});
$('search').addEventListener('input',event=>updateHistory({query:event.target.value}));
for (const view of ['timeline','journal']) $(view+'-view').addEventListener('click',()=>updateHistory({view}));
for (const section of ['journal','stats']) $(section+'-section').addEventListener('click',()=>switchSection(section));
$('share').addEventListener('click',async()=>{
  try { await navigator.clipboard.writeText(location.href); $('share').textContent=t('copied'); setTimeout(()=>{$('share').textContent=t('share');},2000); }
  catch { window.prompt(t('copyPrompt'),location.href); }
});
// Load once per page visit. New YAML data and today's date appear on reload.
updateURL(); // Drop legacy entry links: selection belongs only to this page visit.
loadTimeline();
