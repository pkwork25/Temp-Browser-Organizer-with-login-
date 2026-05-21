/* =============================================
   NEXMARK v3 — Full App Logic
   Bookmarks+Groups+Tags+Views | Cloud+GDrive |
   Apps | Whiteboard | Todos+Habits+Goals | Books
============================================= */

// ── STATE ───────────────────────────────────────
const STATE = {
  bookmarks:[], notes:[], cloudFiles:[], groups:[],
  todoLists:[], todoItems:[], todoGroups:[], habits:[], goals:[], books:[],
  wbSessions:[], activeWbSession:null,
  activeNote:null, activeTodoList:null,
  noteAutoSave:null,
  editIds:{ bookmark:null, group:null, habit:null, goal:null, book:null, todoList:null },
  bmView:'grid', activeBmTab:'groups',
  expandedGroups: new Set(), expandedTagSections: new Set(),
  importedLinks:[], activeCloudTab:'cloud-links',
};

const KEYS={
  bm:'nx_bm', notes:'nx_notes', cloud:'nx_cloud', groups:'nx_groups',
  todoLists:'nx_tlists', todoItems:'nx_titems', todoGroups:'nx_tgroups',
  habits:'nx_habits', goals:'nx_goals', books:'nx_books',
  wbSessions:'nx_wb', prefs:'nx_prefs',
};

const GROUP_COLORS=['#7c6af7','#2ec49e','#f06292','#f0b429','#38bdf8','#ff7043','#ab47bc','#26a69a'];

function ls_load(k){try{return JSON.parse(localStorage.getItem(k))||[];}catch{return[];}}
function ls_obj(k,d={}){try{return JSON.parse(localStorage.getItem(k))||d;}catch{return d;}}
function ls_save(k,v){
  try{localStorage.setItem(k,JSON.stringify(v));}
  catch(e){toast('Storage full!','error');}
  // Push to Supabase if user is signed in
  if(typeof SB!=='undefined'&&SB.user)sbPush(k,v);
}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}

// ── INIT ────────────────────────────────────────
function init(){
  // ── Load all state ──
  STATE.bookmarks  = ls_load(KEYS.bm);
  STATE.notes      = ls_load(KEYS.notes);
  STATE.cloudFiles = ls_load(KEYS.cloud);
  STATE.groups     = ls_load(KEYS.groups);
  STATE.todoLists  = ls_load(KEYS.todoLists);
  STATE.todoItems  = ls_load(KEYS.todoItems);
  STATE.todoGroups = ls_load(KEYS.todoGroups);
  STATE.habits     = ls_load(KEYS.habits);
  STATE.goals      = ls_load(KEYS.goals);
  STATE.books      = ls_load(KEYS.books);
  STATE.wbSessions = ls_load(KEYS.wbSessions);
  STATE.notifications=ls_load(KEYS.notifications);
  STATE.reminders  =ls_load(KEYS.reminders);
  STATE.musicTracks=ls_load(KEYS.music);
  STATE.products   =ls_load(KEYS.products);
  STATE.savedPrompts=ls_load(KEYS.savedPrompts);
  STATE.readerBookmarks=ls_load(KEYS.readerBM);
  STATE.readerNotes=ls_load(KEYS.readerNotes);

  const prefs = ls_obj(KEYS.prefs,{theme:'dark',accent:'purple',bmView:'grid'});
  STATE.bmView = prefs.bmView||'grid';
  applyPrefs(prefs);

  // ── Setup tabs & UI ──
  setupNav();
  setupBmTabs();
  setupCloudTabs();
  setupCloudTabsV4();
  setupTodoTabs();
  setupViewToggle();
  setupColorPickers();
  setupFileToolsTabs();
  setupNotifTabs();
  setupPriceTabs();
  setupPromptMakerSliders();

  // Default to 'all' tab if no groups exist
  if(STATE.groups.length===0) STATE.activeBmTab='all';

  // ── Render all panels ──
  renderBookmarks();
  renderGroups();
  renderTagsView();
  renderNotesList();
  renderCloud();
  renderTodoLists();
  renderTodoGroups();
  renderHabits();
  renderGoals();
  renderBooks();
  renderNotifications();
  renderMusicList();
  renderProducts();
  renderSavedPrompts();
  updateStats();

  // ── Modal backdrop close ──
  document.querySelectorAll('.modal-overlay').forEach(o=>
    o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open');}));
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape')document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));
  });

  // ── Search listeners ──
  document.getElementById('bm-search').addEventListener('input',debounce(()=>{
    if(STATE.activeBmTab==='all')renderBookmarks();
    else if(STATE.activeBmTab==='groups')renderGroups();
    else renderTagsView();
  },200));
  document.getElementById('bm-filter').addEventListener('change',renderBookmarks);
  document.getElementById('notes-search').addEventListener('input',debounce(renderNotesList,200));
  document.getElementById('books-search').addEventListener('input',debounce(renderBooks,200));
  document.getElementById('books-filter').addEventListener('change',renderBooks);

  // ── Button wiring (critical — must not fail) ──
  const wire = (id, fn) => { const el=document.getElementById(id); if(el) el.addEventListener('click', fn); };
  wire('btn-add-bm',       openAddBmModal);
  wire('btn-add-note',     createNote);
  wire('btn-add-cloud',    ()=>openModal('cloud-modal'));
  wire('btn-add-group',    openAddGroupModal);
  wire('btn-add-book',     openAddBookModal);
  wire('btn-add-todo-list',openAddTodoListModal);
  wire('btn-todo-template',openTemplateModal);

  // ── GDrive, notifications, misc ──
  checkGDriveToken();
  initWhiteboardLazy();

  const k=localStorage.getItem('nx_claude_key');
  const s=document.getElementById('claude-key-status');
  if(s)s.textContent=k?'Key saved ✓':'Not set';

  checkNotifPermission();
  setInterval(checkReminders,30000);
  checkReminders();
  updateNotifBadge();

  // PDF.js worker — retry until deferred CDN script loads
  (function tryPDF(){
    if(window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    else setTimeout(tryPDF,300);
  })();
}

function switchPanel(panel){
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  const btn=document.querySelector(`.nav-btn[data-panel="${panel}"]`);
  if(btn)btn.classList.add('active');
  const sec=document.getElementById(`panel-${panel}`);
  if(sec)sec.classList.add('active');
  if(panel==='whiteboard')initWhiteboard();
  if(panel==='calendar')initCalendar();
  if(panel==='articles'&&!NEWS.articles.length)initNews();
  if(panel==='presentations')initPresentations();
}

// ── NAVIGATION ──────────────────────────────────
function setupNav(){
  document.querySelectorAll('.nav-btn[data-panel]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      switchPanel(btn.dataset.panel);
      closeMobileNav(); // auto-close sidebar on mobile after picking a panel
    });
  });
}

// ── Mobile nav (hamburger) ──
function openMobileNav(){
  const sidebar=document.getElementById('sidebar');
  const overlay=document.getElementById('mobile-overlay');
  if(sidebar)sidebar.classList.add('mobile-open');
  if(overlay)overlay.classList.add('visible');
}
function closeMobileNav(){
  const sidebar=document.getElementById('sidebar');
  const overlay=document.getElementById('mobile-overlay');
  if(sidebar)sidebar.classList.remove('mobile-open');
  if(overlay)overlay.classList.remove('visible');
}

// ── BM TABS ─────────────────────────────────────
function setupBmTabs(){
  document.querySelectorAll('#panel-bookmarks .bm-tab').forEach(tab=>{
    tab.addEventListener('click',()=>switchBmTab(tab.dataset.tab));
  });
  // default: groups
  switchBmTab('groups');
}

function switchBmTab(tab){
  STATE.activeBmTab=tab;
  document.querySelectorAll('#panel-bookmarks .bm-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('#panel-bookmarks .bm-tab-content').forEach(c=>c.classList.remove('active'));
  const tabBtn=document.querySelector(`#panel-bookmarks .bm-tab[data-tab="${tab}"]`);
  if(tabBtn)tabBtn.classList.add('active');
  const content=document.getElementById(`bm-tab-${tab}`);
  if(content)content.classList.add('active');
  // Show/hide group actions
  const gActions=document.getElementById('bm-tab-actions-groups');
  if(gActions)gActions.style.display=tab==='groups'?'flex':'none';
  // Show/hide view toggle (only in all tab)
  document.getElementById('bm-view-toggle').style.visibility=tab==='all'?'visible':'hidden';
  if(tab==='groups')renderGroups();
  else if(tab==='tags')renderTagsView();
  else renderBookmarks();
}

// ── VIEW TOGGLE ─────────────────────────────────
function setupViewToggle(){
  document.querySelectorAll('.view-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      STATE.bmView=btn.dataset.view;
      document.querySelectorAll('.view-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const prefs=ls_obj(KEYS.prefs,{});prefs.bmView=STATE.bmView;ls_save(KEYS.prefs,prefs);
      renderBookmarks();
    });
  });
  // Restore saved view
  const saved=ls_obj(KEYS.prefs,{}).bmView||'grid';
  STATE.bmView=saved;
  document.querySelectorAll('.view-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===saved));
}

// ── BOOKMARKS — CRUD ────────────────────────────
function openAddBmModal(){
  STATE.editIds.bookmark=null;
  document.getElementById('bm-modal-title').textContent='Add Bookmark';
  ['bm-url','bm-title','bm-desc','bm-tags','bm-favicon'].forEach(id=>document.getElementById(id).value='');
  populateGroupSelect();
  openModal('bm-modal');
  setTimeout(()=>document.getElementById('bm-url').focus(),100);
}

function openEditBmModal(id){
  const bm=STATE.bookmarks.find(b=>b.id===id);if(!bm)return;
  STATE.editIds.bookmark=id;
  document.getElementById('bm-modal-title').textContent='Edit Bookmark';
  document.getElementById('bm-url').value=bm.url;
  document.getElementById('bm-title').value=bm.title;
  document.getElementById('bm-desc').value=bm.desc||'';
  document.getElementById('bm-tags').value=bm.tags.join(', ');
  document.getElementById('bm-favicon').value=bm.favicon||'';
  populateGroupSelect(bm.groupId||'');
  openModal('bm-modal');
}

function populateGroupSelect(selected=''){
  const sel=document.getElementById('bm-group');
  sel.innerHTML='<option value="">— No Group —</option>'+
    STATE.groups.map(g=>`<option value="${g.id}"${g.id===selected?' selected':''}>${esc(g.icon||'📁')} ${esc(g.name)}</option>`).join('');
}

function saveBookmark(){
  const url=document.getElementById('bm-url').value.trim();
  const title=document.getElementById('bm-title').value.trim();
  const desc=document.getElementById('bm-desc').value.trim();
  const tags=document.getElementById('bm-tags').value.split(',').map(t=>t.trim()).filter(Boolean);
  const favicon=document.getElementById('bm-favicon').value.trim();
  const groupId=document.getElementById('bm-group').value;
  if(!url){toast('URL is required','error');return;}
  let pu;try{pu=new URL(url);}catch{toast('Enter a valid URL','error');return;}
  const af=favicon||`https://www.google.com/s2/favicons?domain=${pu.hostname}&sz=64`;
  const at=title||pu.hostname.replace('www.','');
  if(STATE.editIds.bookmark){
    const i=STATE.bookmarks.findIndex(b=>b.id===STATE.editIds.bookmark);
    if(i>=0)STATE.bookmarks[i]={...STATE.bookmarks[i],url,title:at,desc,tags,favicon:af,groupId,updatedAt:Date.now()};
    toast('Bookmark updated ✓','success');
  }else{
    STATE.bookmarks.unshift({id:uid(),url,title:at,desc,tags,favicon:af,groupId,createdAt:Date.now()});
    toast('Bookmark saved ✓','success');
  }
  ls_save(KEYS.bm,STATE.bookmarks);
  refreshBookmarkViews(); updateStats(); closeModal('bm-modal');
}

function deleteBookmark(id){
  if(!confirm('Delete this bookmark?'))return;
  STATE.bookmarks=STATE.bookmarks.filter(b=>b.id!==id);
  ls_save(KEYS.bm,STATE.bookmarks);
  refreshBookmarkViews(); updateStats(); toast('Deleted','info');
}

function refreshBookmarkViews(){
  updateTagFilter();
  if(STATE.activeBmTab==='all')renderBookmarks();
  else if(STATE.activeBmTab==='groups')renderGroups();
  else renderTagsView();
}

// ── BOOKMARKS — RENDER ALL ───────────────────────
function renderBookmarks(){
  if(STATE.activeBmTab!=='all')return;
  const q=document.getElementById('bm-search').value.toLowerCase();
  const f=document.getElementById('bm-filter').value;
  const grid=document.getElementById('bm-grid');
  const empty=document.getElementById('bm-empty');
  let bms=STATE.bookmarks;
  if(q)bms=bms.filter(b=>b.title.toLowerCase().includes(q)||b.url.toLowerCase().includes(q)||(b.desc||'').toLowerCase().includes(q)||b.tags.some(t=>t.toLowerCase().includes(q)));
  if(f!=='all')bms=bms.filter(b=>b.tags.includes(f));
  if(bms.length===0){grid.innerHTML='';grid.style.display='none';empty.style.display='flex';return;}
  grid.style.display='grid';empty.style.display='none';
  grid.className='bookmarks-grid view-'+STATE.bmView;
  grid.innerHTML=bms.map(bm=>bmCardHTML(bm,true)).join('');
  updateTagFilter();
}

function bmCardHTML(bm,showGroupBadge=false){
  const domain=(()=>{try{return new URL(bm.url).hostname.replace('www.','');}catch{return bm.url;}})();
  const init2=(bm.title||domain).charAt(0).toUpperCase();
  const tags=bm.tags.slice(0,3).map(t=>`<span class="tag-pill" onclick="filterByTag('${esc(t)}')">#${esc(t)}</span>`).join('');
  const group=bm.groupId?STATE.groups.find(g=>g.id===bm.groupId):null;
  const isCompact=STATE.bmView==='compact';
  return `<div class="bm-card">
    <div class="bm-card-header">
      <img class="bm-favicon" src="${esc(bm.favicon)}" alt="" onerror="this.style.display='none';this.nextSibling.style.display='flex'" loading="lazy"/>
      <div class="bm-favicon-fallback" style="display:none">${init2}</div>
      <span class="bm-title" title="${esc(bm.title)}">${esc(bm.title)}</span>
      ${showGroupBadge&&group?`<span class="bm-group-badge" style="--gbg:${group.color||'var(--accent)'}22;--gcol:${group.color||'var(--accent)'}">${esc(group.icon||'📁')}</span>`:''}
    </div>
    ${!isCompact&&bm.desc?`<p class="bm-desc">${esc(bm.desc)}</p>`:''}
    ${!isCompact?`<div class="bm-url">${esc(domain)}</div>`:''}
    ${!isCompact&&tags?`<div class="bm-tags">${tags}</div>`:''}
    <div class="bm-card-actions">
      <button class="card-action-btn open-btn" onclick="window.open('${esc(bm.url)}','_blank')">Open ↗</button>
      <button class="card-action-btn" onclick="openEditBmModal('${bm.id}')">Edit</button>
      <button class="card-action-btn del-btn" onclick="deleteBookmark('${bm.id}')">Delete</button>
    </div>
  </div>`;
}

function updateTagFilter(){
  const sel=document.getElementById('bm-filter');const cur=sel.value;
  const tags=[...new Set(STATE.bookmarks.flatMap(b=>b.tags))].sort();
  sel.innerHTML='<option value="all">All Tags</option>'+tags.map(t=>`<option value="${esc(t)}"${t===cur?' selected':''}>#${esc(t)}</option>`).join('');
}

function filterByTag(tag){
  if(STATE.activeBmTab!=='all')switchBmTab('all');
  document.getElementById('bm-filter').value=tag;
  renderBookmarks();
}

// ── TAGS VIEW ────────────────────────────────────
function renderTagsView(){
  const container=document.getElementById('tags-view-container');
  const empty=document.getElementById('tags-empty');
  const allTags=[...new Set(STATE.bookmarks.flatMap(b=>b.tags))].sort();
  if(allTags.length===0){container.innerHTML='';container.style.display='none';empty.style.display='flex';return;}
  container.style.display='flex';empty.style.display='none';
  const q=document.getElementById('bm-search').value.toLowerCase();
  container.innerHTML=allTags.map(tag=>{
    let bms=STATE.bookmarks.filter(b=>b.tags.includes(tag));
    if(q)bms=bms.filter(b=>b.title.toLowerCase().includes(q)||b.url.toLowerCase().includes(q));
    const isOpen=STATE.expandedTagSections.has(tag);
    return `<div class="tag-section">
      <div class="tag-section-header" onclick="toggleTagSection('${esc(tag)}')">
        <div class="tag-section-name">
          <span style="transform:rotate(${isOpen?90:0}deg);display:inline-block;transition:.2s">›</span>
          #${esc(tag)}
        </div>
        <span class="tag-section-count">${bms.length}</span>
      </div>
      ${isOpen?`<div class="tag-section-body"><div class="tag-section-grid">${bms.map(bm=>bmCardHTML(bm,false)).join('')}</div></div>`:''}
    </div>`;
  }).join('');
}

function toggleTagSection(tag){
  STATE.expandedTagSections.has(tag)?STATE.expandedTagSections.delete(tag):STATE.expandedTagSections.add(tag);
  renderTagsView();
}

// ── GROUPS ────────────────────────────────────────
function openAddGroupModal(){
  STATE.editIds.group=null;
  document.getElementById('group-modal-title').textContent='New Group';
  ['group-name','group-icon','group-desc'].forEach(id=>document.getElementById(id).value='');
  setPickerColor('group-color-picker',GROUP_COLORS[0]);
  openModal('group-modal');
  setTimeout(()=>document.getElementById('group-name').focus(),100);
}

function openEditGroupModal(id){
  const g=STATE.groups.find(g=>g.id===id);if(!g)return;
  STATE.editIds.group=id;
  document.getElementById('group-modal-title').textContent='Edit Group';
  document.getElementById('group-name').value=g.name;
  document.getElementById('group-icon').value=g.icon||'';
  document.getElementById('group-desc').value=g.desc||'';
  setPickerColor('group-color-picker',g.color||GROUP_COLORS[0]);
  openModal('group-modal');
}

function saveGroup(){
  const name=document.getElementById('group-name').value.trim();
  const icon=document.getElementById('group-icon').value.trim()||'📁';
  const desc=document.getElementById('group-desc').value.trim();
  const color=getPickerColor('group-color-picker');
  if(!name){toast('Group name required','error');return;}
  if(STATE.editIds.group){
    const i=STATE.groups.findIndex(g=>g.id===STATE.editIds.group);
    if(i>=0)STATE.groups[i]={...STATE.groups[i],name,icon,desc,color,updatedAt:Date.now()};
    toast('Group updated ✓','success');
  }else{
    STATE.groups.push({id:uid(),name,icon,desc,color,createdAt:Date.now()});
    toast('Group created ✓','success');
  }
  ls_save(KEYS.groups,STATE.groups);renderGroups();closeModal('group-modal');
}

function deleteGroup(id){
  if(!confirm("Delete this group? Bookmarks won't be deleted."))return;
  STATE.groups=STATE.groups.filter(g=>g.id!==id);
  STATE.bookmarks=STATE.bookmarks.map(b=>b.groupId===id?{...b,groupId:''}:b);
  ls_save(KEYS.groups,STATE.groups);ls_save(KEYS.bm,STATE.bookmarks);
  renderGroups();toast('Group deleted','info');
}

function toggleGroupExpand(id){
  STATE.expandedGroups.has(id)?STATE.expandedGroups.delete(id):STATE.expandedGroups.add(id);
  renderGroups();
}

function renderGroups(){
  const container=document.getElementById('groups-container');
  const empty=document.getElementById('groups-empty');
  if(STATE.groups.length===0){container.innerHTML='';container.style.display='none';empty.style.display='flex';return;}
  container.style.display='flex';empty.style.display='none';
  const q=document.getElementById('bm-search').value.toLowerCase();
  container.innerHTML=STATE.groups.map(g=>{
    let members=STATE.bookmarks.filter(b=>b.groupId===g.id);
    if(q)members=members.filter(b=>b.title.toLowerCase().includes(q)||b.url.toLowerCase().includes(q));
    const isOpen=STATE.expandedGroups.has(g.id);
    const count=STATE.bookmarks.filter(b=>b.groupId===g.id).length;
    const bmGrid=members.length===0
      ?'<div class="group-empty-msg">No bookmarks yet — add bookmarks and assign them via Edit → Group.</div>'
      :`<div class="group-bm-grid">${members.map(bm=>bmCardHTML(bm,false)).join('')}</div>`;
    return `<div class="group-card">
      <div class="group-card-header" onclick="toggleGroupExpand('${g.id}')" style="--gcolor:${g.color||'var(--accent)'}">
        <div class="group-header-left">
          <span class="group-chevron${isOpen?' open':''}">›</span>
          <span class="group-icon-badge" style="background:${g.color||'var(--accent)'}22;color:${g.color||'var(--accent)'}">${esc(g.icon||'📁')}</span>
          <div><div class="group-name">${esc(g.name)}</div>${g.desc?`<div class="group-desc-small">${esc(g.desc)}</div>`:''}</div>
        </div>
        <div class="group-header-right" onclick="event.stopPropagation()">
          <span class="group-count" style="background:${g.color||'var(--accent)'}22;color:${g.color||'var(--accent)'}">${count}</span>
          <button class="card-action-btn" onclick="openEditGroupModal('${g.id}')">Edit</button>
          <button class="card-action-btn del-btn" onclick="deleteGroup('${g.id}')">Delete</button>
        </div>
      </div>
      ${isOpen?`<div class="group-body">${bmGrid}</div>`:''}
    </div>`;
  }).join('');
}

// ── IMPORT LINKS FROM FILE ────────────────────────
function importLinksFromFile(event){
  const file=event.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const text=e.target.result;
    // Extract URLs using regex
    const urlRegex=/https?:\/\/[^\s"'<>)\]]+/gi;
    const found=[...new Set(text.match(urlRegex)||[])];
    if(found.length===0){toast('No URLs found in file','error');event.target.value='';return;}
    STATE.importedLinks=found;
    // Show preview
    const preview=document.getElementById('import-preview');
    preview.innerHTML=found.slice(0,20).map(u=>`<div><span class="imp-url">${esc(u)}</span></div>`).join('')+
      (found.length>20?`<div style="color:var(--text3)">…and ${found.length-20} more</div>`:'');
    document.getElementById('import-group-name').value=file.name.replace(/\.[^.]+$/,'').replace(/[_-]/g,' ');
    document.getElementById('import-group-icon').value='🔗';
    setPickerColor('import-group-color-picker',GROUP_COLORS[Math.floor(Math.random()*GROUP_COLORS.length)]);
    openModal('import-links-modal');
    event.target.value='';
  };
  reader.readAsText(file);
}

function confirmImportLinks(){
  const name=document.getElementById('import-group-name').value.trim();
  const icon=document.getElementById('import-group-icon').value.trim()||'🔗';
  const desc=document.getElementById('import-group-desc').value.trim();
  const color=getPickerColor('import-group-color-picker');
  if(!name){toast('Group name required','error');return;}
  if(!STATE.importedLinks.length){toast('No links to import','error');return;}
  // Create group
  const gid=uid();
  STATE.groups.push({id:gid,name,icon,desc,color,createdAt:Date.now()});
  // Create bookmarks
  const newBms=STATE.importedLinks.map(url=>{
    let domain='';try{domain=new URL(url).hostname.replace('www.','');}catch{}
    return{id:uid(),url,title:domain||url,desc:'',tags:[],favicon:`https://www.google.com/s2/favicons?domain=${domain}&sz=64`,groupId:gid,createdAt:Date.now()};
  });
  STATE.bookmarks=newBms.concat(STATE.bookmarks);
  ls_save(KEYS.groups,STATE.groups);ls_save(KEYS.bm,STATE.bookmarks);
  // Expand new group
  STATE.expandedGroups.add(gid);
  renderGroups();updateStats();
  toast(`Imported ${newBms.length} links into "${name}" ✓`,'success');
  closeModal('import-links-modal');
  if(STATE.activeBmTab!=='groups')switchBmTab('groups');
}

// ── NOTES ────────────────────────────────────────
function createNote(){
  const note={id:uid(),title:'Untitled Note',content:'',createdAt:Date.now(),updatedAt:Date.now()};
  STATE.notes.unshift(note);ls_save(KEYS.notes,STATE.notes);
  renderNotesList();openNote(note.id);updateStats();
}

function openNote(id){
  const note=STATE.notes.find(n=>n.id===id);if(!note)return;
  STATE.activeNote=id;
  document.querySelectorAll('.note-item').forEach(el=>el.classList.remove('active'));
  const item=document.querySelector(`[data-note-id="${id}"]`);if(item)item.classList.add('active');
  document.getElementById('note-editor').innerHTML=`
    <div class="note-editor-active">
      <input class="note-title-input" id="nt-title" value="${esc(note.title)}" placeholder="Note title…"/>
      <div class="note-toolbar">
        <button class="note-tool-btn" onclick="wrapTxt('**','**')"><b>B</b></button>
        <button class="note-tool-btn" onclick="wrapTxt('*','*')"><i>I</i></button>
        <button class="note-tool-btn" onclick="insertLine('- ')">• List</button>
        <button class="note-tool-btn" onclick="insertLine('> ')">❝</button>
        <button class="note-tool-btn" onclick="insertLine('## ')">H2</button>
        <button class="note-tool-btn" onclick="insertLine('[ ] ')">☐</button>
        <button class="note-tool-btn" onclick="copyNote()">Copy</button>
        <button class="note-tool-btn" onclick="deleteNote('${id}')" style="margin-left:auto;color:var(--red)">Delete</button>
      </div>
      <textarea class="note-content-input" id="nt-body" placeholder="Start writing…">${esc(note.content)}</textarea>
      <div class="note-footer"><span class="note-wordcount" id="nt-wc">0 words</span><span class="note-wordcount">Auto-saved</span></div>
    </div>`;
  const ti=document.getElementById('nt-title'),ci=document.getElementById('nt-body');
  updateWC(note.content);
  ti.addEventListener('input',()=>scheduleNoteSave(id,ti.value,ci.value));
  ci.addEventListener('input',()=>{updateWC(ci.value);scheduleNoteSave(id,ti.value,ci.value);});
  ci.addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();const s=ci.selectionStart,v=ci.value;ci.value=v.slice(0,s)+'  '+v.slice(s);ci.selectionStart=ci.selectionEnd=s+2;}});
}

function scheduleNoteSave(id,title,content){
  clearTimeout(STATE.noteAutoSave);
  // Show saving indicator
  const saveInd=document.getElementById('note-save-ind');
  if(saveInd){saveInd.textContent='Saving…';saveInd.style.opacity='1';}
  STATE.noteAutoSave=setTimeout(()=>{
    const i=STATE.notes.findIndex(n=>n.id===id);
    if(i>=0){STATE.notes[i].title=title||'Untitled Note';STATE.notes[i].content=content;STATE.notes[i].updatedAt=Date.now();ls_save(KEYS.notes,STATE.notes);}
    const it=document.querySelector(`[data-note-id="${id}"] .note-item-title`);if(it)it.textContent=title||'Untitled Note';
    const ip=document.querySelector(`[data-note-id="${id}"] .note-item-preview`);if(ip)ip.textContent=content.slice(0,60).replace(/\n/g,' ');
    if(saveInd){saveInd.textContent='✓ Saved';setTimeout(()=>{saveInd.style.opacity='0';},2000);}
  },500);
}

function deleteNote(id){
  if(!confirm('Delete this note?'))return;
  STATE.notes=STATE.notes.filter(n=>n.id!==id);STATE.activeNote=null;
  ls_save(KEYS.notes,STATE.notes);renderNotesList();updateStats();
  document.getElementById('note-editor').innerHTML='<div class="note-editor-placeholder"><span>← Select or create a note</span></div>';
  toast('Note deleted','info');
}

function renderNotesList(){
  const list=document.getElementById('notes-list'),empty=document.getElementById('notes-empty');
  const q=document.getElementById('notes-search').value.toLowerCase();
  let notes=STATE.notes;
  if(q)notes=notes.filter(n=>n.title.toLowerCase().includes(q)||n.content.toLowerCase().includes(q));
  if(notes.length===0){list.innerHTML='';empty.style.display='flex';return;}
  empty.style.display='none';
  list.innerHTML=notes.map(n=>`<div class="note-item${n.id===STATE.activeNote?' active':''}" data-note-id="${n.id}" onclick="openNote('${n.id}')">
    <div class="note-item-title">${esc(n.title)}</div>
    <div class="note-item-preview">${esc(n.content.slice(0,60).replace(/\n/g,' '))}</div>
    <div class="note-item-date">${fmtDate(n.updatedAt)}</div>
  </div>`).join('');
}

function updateWC(text){const wc=document.getElementById('nt-wc');if(!wc)return;const w=text.trim()?text.trim().split(/\s+/).length:0;wc.textContent=`${w} word${w!==1?'s':''}`;}
function wrapTxt(b,a){const ta=document.getElementById('nt-body');if(!ta)return;const s=ta.selectionStart,e=ta.selectionEnd,sel=ta.value.slice(s,e);ta.value=ta.value.slice(0,s)+b+sel+a+ta.value.slice(e);ta.selectionStart=s+b.length;ta.selectionEnd=e+b.length;ta.focus();ta.dispatchEvent(new Event('input'));}
function insertLine(p){const ta=document.getElementById('nt-body');if(!ta)return;const s=ta.selectionStart,ls=ta.value.lastIndexOf('\n',s-1)+1;ta.value=ta.value.slice(0,ls)+p+ta.value.slice(ls);ta.selectionStart=ta.selectionEnd=s+p.length;ta.focus();ta.dispatchEvent(new Event('input'));}
function copyNote(){const ta=document.getElementById('nt-body');if(!ta)return;navigator.clipboard.writeText(ta.value).then(()=>toast('Copied','success'));}

// ── CLOUD ─────────────────────────────────────────
function setupCloudTabs(){
  document.querySelectorAll('#panel-cloud .bm-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      const t=tab.dataset.tab;
      STATE.activeCloudTab=t;
      document.querySelectorAll('#panel-cloud .bm-tab').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('#panel-cloud .bm-tab-content').forEach(c=>c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('bm-tab-'+t).classList.add('active');
      // show browse button only on gdrive tab when connected
      const browseBtn=document.getElementById('btn-cloud-browse');
      if(browseBtn)browseBtn.style.display=(t==='cloud-gdrive'&&localStorage.getItem('nx_gdrive_token'))?'block':'none';
    });
  });
}

function saveCloudFile(){
  const service=document.getElementById('cloud-service').value;
  const url=document.getElementById('cloud-url').value.trim();
  const name=document.getElementById('cloud-name').value.trim();
  const type=document.getElementById('cloud-type').value;
  const desc=document.getElementById('cloud-desc').value.trim();
  if(!url){toast('URL is required','error');return;}
  if(!name){toast('Name is required','error');return;}
  const icons={folder:'📁',doc:'📄',sheet:'📊',slide:'📑',image:'🖼',pdf:'📕',other:'📎'};
  STATE.cloudFiles.unshift({id:uid(),service,url,name,type,desc,icon:icons[type]||'📎',createdAt:Date.now()});
  ls_save(KEYS.cloud,STATE.cloudFiles);renderCloud();closeModal('cloud-modal');
  toast('Cloud file added ✓','success');
  ['cloud-url','cloud-name','cloud-desc'].forEach(id=>document.getElementById(id).value='');
}

function deleteCloudFile(id){
  if(!confirm('Remove this cloud file link?'))return;
  STATE.cloudFiles=STATE.cloudFiles.filter(f=>f.id!==id);
  ls_save(KEYS.cloud,STATE.cloudFiles);renderCloud();toast('Removed','info');
}

function renderCloud(){
  const grid=document.getElementById('cloud-grid'),empty=document.getElementById('cloud-empty');
  if(STATE.cloudFiles.length===0){grid.innerHTML='';grid.style.display='none';empty.style.display='flex';return;}
  grid.style.display='grid';empty.style.display='none';
  const sN={gdrive:'Google Drive',mega:'MEGA',dropbox:'Dropbox',onedrive:'OneDrive',other:'Cloud'};
  grid.innerHTML=STATE.cloudFiles.map(f=>`<div class="cloud-card">
    <div class="cloud-card-header"><span class="cloud-file-icon">${f.icon}</span>
      <div><div class="cloud-card-title">${esc(f.name)}</div><div class="cloud-card-service">${sN[f.service]||f.service}</div></div>
    </div>
    ${f.desc?`<p class="cloud-card-desc">${esc(f.desc)}</p>`:''}
    <div class="cloud-card-actions">
      <button class="card-action-btn open-btn" onclick="window.open('${esc(f.url)}','_blank')">Open ↗</button>
      <button class="card-action-btn del-btn" onclick="deleteCloudFile('${f.id}')">Remove</button>
    </div>
  </div>`).join('');
}

// ── GOOGLE DRIVE BROWSER ──────────────────────────
function connectGDrive(){
  let CLIENT_ID=localStorage.getItem('nx_gdrive_client_id')||'';
  if(!CLIENT_ID){
    const id=prompt('Enter your Google OAuth Client ID\n(Get one free at console.cloud.google.com → APIs & Services → Credentials → OAuth 2.0 Client ID)\n\nMake sure to add "'+window.location.origin+'" to Authorised JavaScript origins:');
    if(!id)return;
    CLIENT_ID=id.trim();
    localStorage.setItem('nx_gdrive_client_id',CLIENT_ID);
  }
  const scopes='https://www.googleapis.com/auth/drive';
  // Use current page as redirect so token hash comes back here
  const redirect=encodeURIComponent(window.location.origin+window.location.pathname);
  const url=`https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(CLIENT_ID)}&redirect_uri=${redirect}&response_type=token&scope=${encodeURIComponent(scopes)}`;
  // Open in same window so hash redirect works on GitHub Pages
  window.location.href=url;
}

function checkGDriveToken(){
  const hash=window.location.hash;
  if(hash.includes('access_token')){
    const params=new URLSearchParams(hash.slice(1));
    const token=params.get('access_token');
    if(token){
      localStorage.setItem('nx_gdrive_token',token);
      const s=document.getElementById('gdrive-status');if(s)s.textContent='✓ Connected';
      toast('Google Drive connected ✓','success');
      history.replaceState(null,'',window.location.pathname);
      showGDriveBrowser();
    }
  }
  if(localStorage.getItem('nx_gdrive_token')){
    const s=document.getElementById('gdrive-status');if(s)s.textContent='✓ Connected';
    showGDriveBrowser();
  }
}

function showGDriveBrowser(){
  document.getElementById('gdrive-connect-prompt').style.display='none';
  document.getElementById('gdrive-browser').style.display='flex';
  const browseBtn=document.getElementById('btn-cloud-browse');
  if(browseBtn)browseBtn.style.display='block';
  loadDriveFiles('root');
}

function openGDriveBrowser(){
  // Switch to GDrive tab
  const tab=document.querySelector('#panel-cloud .bm-tab[data-tab="cloud-gdrive"]');
  if(tab)tab.click();
}

function disconnectGDrive(){
  if(!confirm('Disconnect Google Drive?'))return;
  localStorage.removeItem('nx_gdrive_token');
  document.getElementById('gdrive-connect-prompt').style.display='flex';
  document.getElementById('gdrive-browser').style.display='none';
  const s=document.getElementById('gdrive-status');if(s)s.textContent='Not connected';
  toast('Disconnected','info');
}

async function loadDriveFiles(folderId='root',folderName='My Drive'){
  const token=localStorage.getItem('nx_gdrive_token');
  if(!token){toast('Not connected to Google Drive','error');return;}
  const grid=document.getElementById('drive-files-grid');
  grid.innerHTML='<div class="drive-loading">Loading files…</div>';
  updateBreadcrumb(folderId,folderName);
  try{
    const q=encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const fields=encodeURIComponent('files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink,thumbnailLink)');
    const res=await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=100&orderBy=folder,name`,{
      headers:{Authorization:`Bearer ${token}`}
    });
    if(res.status===401){toast('Session expired. Reconnect Google Drive.','error');disconnectGDrive();return;}
    const data=await res.json();
    if(!data.files||data.files.length===0){grid.innerHTML='<div class="drive-loading">This folder is empty.</div>';return;}
    STATE.driveCachedFiles=data.files; // cache for sort
    renderDriveFiles(data.files);
  }catch(err){
    grid.innerHTML=`<div class="drive-loading">Error loading files. Check your connection.</div>`;
  }
}

function renderDriveFiles(files){
  const grid=document.getElementById('drive-files-grid');
  grid.innerHTML=files.map(f=>{
    const isFolder=f.mimeType==='application/vnd.google-apps.folder';
    const icon=getDriveIcon(f.mimeType);
    const size=f.size?formatBytes(parseInt(f.size)):'—';
    const modified=f.modifiedTime?new Date(f.modifiedTime).toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'';
    return `<div class="drive-file-card" onclick="${isFolder?`loadDriveFiles('${f.id}','${esc(f.name)}')`:`openDriveFile('${esc(f.webViewLink||'')}','${esc(f.id)}')`}">
      <div class="drive-file-icon">${icon}</div>
      <div class="drive-file-name" title="${esc(f.name)}">${esc(f.name)}</div>
      <div class="drive-file-meta">${size}${modified?' · '+modified:''}</div>
      <div class="drive-file-actions" onclick="event.stopPropagation()">
        ${!isFolder?`<button class="card-action-btn open-btn" onclick="window.open('${esc(f.webViewLink||'')}','_blank')" style="flex:1">Open ↗</button>`:''}
        <button class="card-action-btn" onclick="saveDriveFileAsLink('${f.id}','${esc(f.name)}','${esc(f.mimeType)}','${esc(f.webViewLink||'')}')" style="flex:1">+ Save</button>
        <button class="card-action-btn del-btn" onclick="deleteDriveFile('${f.id}','${esc(f.name)}')" style="flex:1">🗑</button>
      </div>
    </div>`;
  }).join('');
}

function updateBreadcrumb(folderId,folderName){
  const bc=document.getElementById('drive-breadcrumb');
  if(folderId==='root'){bc.innerHTML='<span class="crumb active">My Drive</span>';return;}
  bc.innerHTML=`<span class="crumb" onclick="loadDriveFiles('root')">My Drive</span><span class="crumb-sep">›</span><span class="crumb active">${esc(folderName)}</span>`;
}

async function deleteDriveFile(fileId,fileName){
  if(!confirm(`Delete "${fileName}" from Google Drive? This cannot be undone.`))return;
  const token=localStorage.getItem('nx_gdrive_token');if(!token)return;
  try{
    const res=await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}});
    if(res.status===204){toast(`"${fileName}" deleted from Drive`,'success');refreshDrive();}
    else{toast('Could not delete file','error');}
  }catch{toast('Error deleting file','error');}
}

function saveDriveFileAsLink(fileId,name,mimeType,webViewLink){
  if(!webViewLink){toast('No link available for this file','error');return;}
  const type=getDriveFileType(mimeType);
  const icons={folder:'📁',doc:'📄',sheet:'📊',slide:'📑',image:'🖼',pdf:'📕',other:'📎'};
  STATE.cloudFiles.unshift({id:uid(),service:'gdrive',url:webViewLink,name,type,desc:'',icon:icons[type]||'📎',createdAt:Date.now()});
  ls_save(KEYS.cloud,STATE.cloudFiles);renderCloud();
  toast(`"${name}" saved to links ✓`,'success');
}

function refreshDrive(){
  const bc=document.getElementById('drive-breadcrumb');
  const activeCrumb=bc.querySelector('.crumb.active');
  const text=activeCrumb?activeCrumb.textContent:'My Drive';
  // re-use current folder if not root
  loadDriveFiles(text==='My Drive'?'root':'root',text);
}

function getDriveIcon(mimeType){
  if(mimeType==='application/vnd.google-apps.folder')return'📁';
  if(mimeType.includes('document'))return'📄';
  if(mimeType.includes('spreadsheet'))return'📊';
  if(mimeType.includes('presentation'))return'📑';
  if(mimeType.includes('pdf'))return'📕';
  if(mimeType.includes('image'))return'🖼';
  if(mimeType.includes('video'))return'🎬';
  if(mimeType.includes('audio'))return'🎵';
  if(mimeType.includes('zip')||mimeType.includes('compressed'))return'🗜';
  return'📎';
}

function getDriveFileType(mimeType){
  if(mimeType.includes('folder'))return'folder';
  if(mimeType.includes('document'))return'doc';
  if(mimeType.includes('spreadsheet'))return'sheet';
  if(mimeType.includes('presentation'))return'slide';
  if(mimeType.includes('pdf'))return'pdf';
  if(mimeType.includes('image'))return'image';
  return'other';
}

function formatBytes(b){
  if(b<1024)return b+'B';
  if(b<1048576)return(b/1024).toFixed(1)+'KB';
  return(b/1048576).toFixed(1)+'MB';
}

async function uploadFileToDrive(file){
  const token=localStorage.getItem('nx_gdrive_token');if(!token){toast('Connect Google Drive first','error');return;}
  const meta=JSON.stringify({name:file.name});
  const form=new FormData();
  form.append('metadata',new Blob([meta],{type:'application/json'}));
  form.append('file',file);
  toast(`Uploading "${file.name}"…`,'info');
  try{
    const res=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{
      method:'POST',headers:{Authorization:`Bearer ${token}`},body:form
    });
    if(res.ok){toast(`"${file.name}" uploaded ✓`,'success');refreshDrive();}
    else{toast('Upload failed','error');}
  }catch{toast('Upload error','error');}
}

// ── TODOS ──────────────────────────────────────────
function setupTodoTabs(){
  document.querySelectorAll('#panel-todos .bm-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      document.querySelectorAll('#panel-todos .bm-tab').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('#panel-todos .bm-tab-content').forEach(c=>c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('bm-tab-'+tab.dataset.tab).classList.add('active');
    });
  });
}

function openAddTodoListModal(){
  STATE.editIds.todoList=null;
  document.getElementById('todo-list-modal-title').textContent='New List';
  document.getElementById('todo-list-name').value='';
  document.getElementById('todo-list-icon').value='';
  setPickerColor('todo-list-color-picker',GROUP_COLORS[0]);
  openModal('todo-list-modal');
  setTimeout(()=>document.getElementById('todo-list-name').focus(),100);
}

function editTodoList(id){
  const list=STATE.todoLists.find(l=>l.id===id);if(!list)return;
  STATE.editIds.todoList=id;
  document.getElementById('todo-list-modal-title').textContent='Edit List';
  document.getElementById('todo-list-name').value=list.name;
  document.getElementById('todo-list-icon').value=list.icon||'';
  setPickerColor('todo-list-color-picker',list.color||GROUP_COLORS[0]);
  openModal('todo-list-modal');
  setTimeout(()=>document.getElementById('todo-list-name').focus(),100);
}

function saveTodoList(){
  const name=document.getElementById('todo-list-name').value.trim();
  const icon=document.getElementById('todo-list-icon').value.trim()||'📋';
  const color=getPickerColor('todo-list-color-picker');
  if(!name){toast('List name required','error');return;}
  if(STATE.editIds.todoList){
    const i=STATE.todoLists.findIndex(l=>l.id===STATE.editIds.todoList);
    if(i>=0){STATE.todoLists[i]={...STATE.todoLists[i],name,icon,color};}
    ls_save(KEYS.todoLists,STATE.todoLists);
    renderTodoLists();closeModal('todo-list-modal');
    toast('List updated ✓','success');
  } else {
    const list={id:uid(),name,icon,color,createdAt:Date.now()};
    STATE.todoLists.push(list);
    ls_save(KEYS.todoLists,STATE.todoLists);
    renderTodoLists();
    openTodoList(list.id);
    closeModal('todo-list-modal');
    toast('List created ✓','success');
  }
  updateStats();
}

function deleteTodoList(id){
  if(!confirm('Delete this list and all its items?'))return;
  STATE.todoLists=STATE.todoLists.filter(l=>l.id!==id);
  STATE.todoItems=STATE.todoItems.filter(i=>i.listId!==id);
  ls_save(KEYS.todoLists,STATE.todoLists);ls_save(KEYS.todoItems,STATE.todoItems);
  if(STATE.activeTodoList===id){
    STATE.activeTodoList=null;
    document.getElementById('todo-list-editor').innerHTML='<div class="note-editor-placeholder"><span>← Select or create a list</span></div>';
  }
  renderTodoLists();updateStats();toast('List deleted','info');
}

function renderTodoLists(){
  const sidebar=document.getElementById('todo-lists-sidebar');
  const empty=document.getElementById('todos-empty');
  if(!sidebar)return;
  if(STATE.todoLists.length===0){
    sidebar.innerHTML='';
    if(empty)empty.style.display='flex';
    document.getElementById('todo-list-editor').innerHTML='<div class="note-editor-placeholder"><span>← Select or create a list</span></div>';
    return;
  }
  if(empty)empty.style.display='none';
  sidebar.innerHTML=STATE.todoLists.map(l=>{
    const count=STATE.todoItems.filter(i=>i.listId===l.id).length;
    const done=STATE.todoItems.filter(i=>i.listId===l.id&&i.done).length;
    return `<div class="todo-list-item${l.id===STATE.activeTodoList?' active':''}" onclick="openTodoList('${l.id}')">
      <span class="todo-list-icon" style="color:${l.color||'var(--accent)'}">${l.icon||'📋'}</span>
      <div class="todo-list-meta">
        <div class="todo-list-name">${esc(l.name)}</div>
        <div class="todo-list-count">${done}/${count} done</div>
      </div>
      <div class="todo-list-actions">
        <button class="card-action-btn" onclick="event.stopPropagation();editTodoList('${l.id}')" style="padding:2px 6px;font-size:11px">✎</button>
        <button class="card-action-btn del-btn" onclick="event.stopPropagation();deleteTodoList('${l.id}')" style="opacity:0.5;padding:2px 6px;font-size:11px">✕</button>
      </div>
    </div>`;
  }).join('');
}

function openTodoList(id){
  const list=STATE.todoLists.find(l=>l.id===id);if(!list)return;
  STATE.activeTodoList=id;
  document.querySelectorAll('.todo-list-item').forEach(el=>el.classList.remove('active'));
  const item=document.querySelector(`.todo-list-item[onclick*="${id}"]`);if(item)item.classList.add('active');
  renderTodoEditor(id);
}

function renderTodoEditor(listId){
  const list=STATE.todoLists.find(l=>l.id===listId);if(!list)return;
  const items=STATE.todoItems.filter(i=>i.listId===listId);
  const editor=document.getElementById('todo-list-editor');
  editor.innerHTML=`
    <div class="todo-editor-header">
      <span style="font-size:22px;color:${list.color||'var(--accent)'}">${list.icon||'📋'}</span>
      <div class="todo-editor-title">${esc(list.name)}</div>
    </div>
    <div class="todo-add-row">
      <input type="text" class="todo-add-input" id="todo-new-item" placeholder="Add a task… (Enter to save)"/>
      <button class="btn-primary" onclick="addTodoItem('${listId}')">Add</button>
    </div>
    <div class="todo-items" id="todo-items-${listId}">
      ${renderTodoItems(items)}
    </div>`;
  const inp=document.getElementById('todo-new-item');
  if(inp)inp.addEventListener('keydown',e=>{if(e.key==='Enter')addTodoItem(listId);});
}

function renderTodoItems(items){
  if(items.length===0)return`<div style="color:var(--text3);font-size:13px;padding:16px 0;text-align:center">No tasks yet. Add one above!</div>`;
  const pending=items.filter(i=>!i.done);
  const done=items.filter(i=>i.done);
  const renderItem=i=>`<div class="todo-item" id="todo-item-${i.id}">
    <div class="todo-checkbox${i.done?' checked':''}" onclick="toggleTodoItem('${i.id}')">${i.done?'✓':''}</div>
    <span class="todo-text${i.done?' done':''}" ondblclick="startEditTodoItem('${i.id}')">${esc(i.text)}</span>
    <div class="todo-item-actions">
      <button class="todo-item-edit" onclick="startEditTodoItem('${i.id}')" title="Edit">✎</button>
      <button class="todo-item-del" onclick="deleteTodoItem('${i.id}')">✕</button>
    </div>
  </div>`;
  return pending.map(renderItem).join('')+
    (done.length?`<div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:10px 0 4px">Completed</div>`+done.map(renderItem).join(''):'');
}

function startEditTodoItem(id){
  const item=STATE.todoItems.find(i=>i.id===id);if(!item)return;
  const row=document.getElementById('todo-item-'+id);if(!row)return;
  const span=row.querySelector('.todo-text');if(!span)return;
  const oldText=item.text;
  span.outerHTML=`<input type="text" class="todo-edit-input" id="todo-edit-${id}" value="${esc(oldText)}" onblur="saveEditTodoItem('${id}')" onkeydown="if(event.key==='Enter')saveEditTodoItem('${id}');if(event.key==='Escape')cancelEditTodoItem('${id}','${esc(oldText)}')"/>`;
  const inp=document.getElementById('todo-edit-'+id);
  if(inp){inp.focus();inp.select();}
}

function saveEditTodoItem(id){
  const inp=document.getElementById('todo-edit-'+id);if(!inp)return;
  const text=inp.value.trim();
  if(!text){cancelEditTodoItem(id,'');return;}
  const i=STATE.todoItems.findIndex(t=>t.id===id);
  if(i>=0){STATE.todoItems[i].text=text;ls_save(KEYS.todoItems,STATE.todoItems);}
  if(STATE.activeTodoList)renderTodoEditor(STATE.activeTodoList);
  renderTodoLists();
}

function cancelEditTodoItem(id,oldText){
  if(STATE.activeTodoList)renderTodoEditor(STATE.activeTodoList);
}

function addTodoItem(listId){
  const inp=document.getElementById('todo-new-item');if(!inp)return;
  const text=inp.value.trim();if(!text)return;
  const item={id:uid(),listId,text,done:false,createdAt:Date.now()};
  STATE.todoItems.push(item);
  ls_save(KEYS.todoItems,STATE.todoItems);
  inp.value='';renderTodoEditor(listId);renderTodoLists();updateStats();
}

function toggleTodoItem(id){
  const i=STATE.todoItems.findIndex(t=>t.id===id);
  if(i>=0){STATE.todoItems[i].done=!STATE.todoItems[i].done;ls_save(KEYS.todoItems,STATE.todoItems);}
  if(STATE.activeTodoList)renderTodoEditor(STATE.activeTodoList);
  renderTodoLists();updateStats();
}

function deleteTodoItem(id){
  STATE.todoItems=STATE.todoItems.filter(t=>t.id!==id);
  ls_save(KEYS.todoItems,STATE.todoItems);
  if(STATE.activeTodoList)renderTodoEditor(STATE.activeTodoList);
  renderTodoLists();updateStats();
}

// ── TODO GROUPS ─────────────────────────────────
function openAddTodoGroupModal(){
  document.getElementById('todo-group-modal-title').textContent='New Group';
  document.getElementById('todo-group-name').value='';
  STATE.editIds.todoGroup=null;
  openModal('todo-group-modal');
  setTimeout(()=>document.getElementById('todo-group-name').focus(),100);
}

function saveTodoGroup(){
  const name=document.getElementById('todo-group-name').value.trim();
  if(!name){toast('Group name required','error');return;}
  if(STATE.editIds.todoGroup){
    const i=STATE.todoGroups.findIndex(g=>g.id===STATE.editIds.todoGroup);
    if(i>=0)STATE.todoGroups[i].name=name;
  } else {
    STATE.todoGroups.push({id:uid(),name,createdAt:Date.now()});
  }
  ls_save(KEYS.todoGroups,STATE.todoGroups);
  renderTodoGroups();
  closeModal('todo-group-modal');
  toast(STATE.editIds.todoGroup?'Group updated':'Group created ✓','success');
}

function deleteTodoGroup(id){
  if(!confirm('Delete this group? Lists in it will be ungrouped.'))return;
  STATE.todoGroups=STATE.todoGroups.filter(g=>g.id!==id);
  // Ungroup lists that belonged to this group
  STATE.todoLists.forEach(l=>{if(l.groupId===id)delete l.groupId;});
  ls_save(KEYS.todoGroups,STATE.todoGroups);
  ls_save(KEYS.todoLists,STATE.todoLists);
  renderTodoGroups();
}

function renderTodoGroups(){
  const grid=document.getElementById('todo-groups-grid');
  const empty=document.getElementById('todo-groups-empty');
  if(!grid)return;
  if(STATE.todoGroups.length===0){
    grid.innerHTML='';
    if(empty)empty.style.display='flex';
    return;
  }
  if(empty)empty.style.display='none';
  grid.innerHTML=STATE.todoGroups.map(g=>{
    const lists=STATE.todoLists.filter(l=>l.groupId===g.id);
    const totalItems=lists.reduce((sum,l)=>sum+STATE.todoItems.filter(i=>i.listId===l.id).length,0);
    const doneItems=lists.reduce((sum,l)=>sum+STATE.todoItems.filter(i=>i.listId===l.id&&i.done).length,0);
    return `<div class="group-card">
      <div class="group-card-header" style="background:${g.color||'var(--accent)'}22;border-color:${g.color||'var(--accent)'}44">
        <div class="group-card-title">${esc(g.name)}</div>
        <div class="group-card-meta">${lists.length} lists · ${doneItems}/${totalItems} tasks</div>
      </div>
      <div class="group-card-lists">
        ${lists.length?lists.slice(0,5).map(l=>`
          <div class="group-list-pill" onclick="switchBmTab('todo-lists');openTodoList('${l.id}')">
            <span style="color:${l.color||'var(--accent)'}">${l.icon||'📋'}</span>${esc(l.name)}
          </div>`).join('')+''+( lists.length>5?`<span style="font-size:11px;color:var(--text3)">+${lists.length-5} more</span>`:'' )
          :'<div style="font-size:12px;color:var(--text3);padding:6px 0">No lists in this group</div>'}
      </div>
      <div class="group-card-actions">
        <button class="card-action-btn" onclick="openAssignListsModal('${g.id}')">+ Assign Lists</button>
        <button class="card-action-btn" onclick="editTodoGroup('${g.id}')">✎ Edit</button>
        <button class="card-action-btn del-btn" onclick="deleteTodoGroup('${g.id}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function editTodoGroup(id){
  const g=STATE.todoGroups.find(x=>x.id===id);if(!g)return;
  STATE.editIds.todoGroup=id;
  document.getElementById('todo-group-modal-title').textContent='Edit Group';
  document.getElementById('todo-group-name').value=g.name;
  openModal('todo-group-modal');
}

function openAssignListsModal(groupId){
  const g=STATE.todoGroups.find(x=>x.id===groupId);if(!g)return;
  const container=document.getElementById('assign-lists-container');
  container.innerHTML=STATE.todoLists.map(l=>`
    <label class="assign-list-row">
      <input type="checkbox" ${l.groupId===groupId?'checked':''} onchange="toggleListGroup('${l.id}','${groupId}',this.checked)"/>
      <span style="color:${l.color||'var(--accent)'}">${l.icon||'📋'}</span>
      <span>${esc(l.name)}</span>
    </label>`).join('');
  document.getElementById('assign-lists-group-name').textContent=g.name;
  openModal('assign-lists-modal');
}

function toggleListGroup(listId,groupId,checked){
  const i=STATE.todoLists.findIndex(l=>l.id===listId);if(i<0)return;
  if(checked)STATE.todoLists[i].groupId=groupId;
  else delete STATE.todoLists[i].groupId;
  ls_save(KEYS.todoLists,STATE.todoLists);
  renderTodoGroups();
}

// ── TODO TEMPLATES (editable) ──────────────────
const DEFAULT_TEMPLATES=[
  {id:'t1',name:'Daily Routine',icon:'🌅',color:'#38bdf8',desc:'Morning & evening habits',items:['Wake up at 6am','Exercise 30 min','Read for 20 min','Plan the day','Review journal','10 min meditation']},
  {id:'t2',name:'Weekly Goals',icon:'🎯',color:'#7c6af7',desc:'Weekly focus areas',items:['Review last week','Set 3 main goals','Schedule workouts','Clear inbox','Call a friend','Learn something new']},
  {id:'t3',name:'Work Tasks',icon:'💼',color:'#2ec49e',desc:'Standard work checklist',items:['Check emails','Stand-up meeting','Deep work block','Review PRs / docs','Update task board','End-of-day wrap-up']},
  {id:'t4',name:'Shopping List',icon:'🛒',color:'#f0b429',desc:'Grocery & essentials',items:['Vegetables','Fruits','Dairy','Bread','Snacks','Household items']},
  {id:'t5',name:'Reading List',icon:'📚',color:'#f06292',desc:'Books to read',items:['Find next book','Order / download','Set reading goal','Make highlights','Write summary','Share recommendation']},
  {id:'t6',name:'Fitness Tracker',icon:'💪',color:'#ff7043',desc:'Weekly workout plan',items:['Monday – Chest & Triceps','Tuesday – Back & Biceps','Wednesday – Legs','Thursday – Shoulders','Friday – Cardio','Weekend – Rest or walk']},
];

function getTemplates(){
  return ls_load('nx_todo_templates').length ? ls_load('nx_todo_templates') : DEFAULT_TEMPLATES.map(t=>({...t,items:[...t.items]}));
}

function openTemplateModal(){
  renderTemplateGrid();
  openModal('todo-template-modal');
}

function renderTemplateGrid(){
  const templates=getTemplates();
  document.getElementById('template-grid').innerHTML=templates.map((t,i)=>`
    <div class="template-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div class="template-icon">${t.icon}</div>
        <div style="display:flex;gap:4px">
          <button class="card-action-btn" style="padding:2px 7px;font-size:11px" onclick="event.stopPropagation();openEditTemplateModal(${i})">✎</button>
          <button class="btn-primary btn-sm" style="padding:4px 10px;font-size:11px" onclick="applyTemplate(${i})">Use</button>
        </div>
      </div>
      <div class="template-name">${esc(t.name)}</div>
      <div class="template-desc">${esc(t.desc)}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">${t.items.length} tasks</div>
    </div>`).join('');
  window._tplData=templates;
}

function openEditTemplateModal(idx){
  const templates=getTemplates();
  const t=templates[idx];if(!t)return;
  window._editTplIdx=idx;
  document.getElementById('tpl-edit-name').value=t.name;
  document.getElementById('tpl-edit-icon').value=t.icon;
  document.getElementById('tpl-edit-desc').value=t.desc;
  document.getElementById('tpl-edit-items').value=t.items.join('\n');
  openModal('template-edit-modal');
}

function saveEditTemplate(){
  const templates=getTemplates();
  const idx=window._editTplIdx;
  if(idx===undefined||!templates[idx])return;
  templates[idx].name=document.getElementById('tpl-edit-name').value.trim()||templates[idx].name;
  templates[idx].icon=document.getElementById('tpl-edit-icon').value.trim()||templates[idx].icon;
  templates[idx].desc=document.getElementById('tpl-edit-desc').value.trim();
  templates[idx].items=document.getElementById('tpl-edit-items').value.split('\n').map(s=>s.trim()).filter(Boolean);
  ls_save('nx_todo_templates',templates);
  closeModal('template-edit-modal');
  renderTemplateGrid();
  toast('Template saved ✓','success');
}

function addNewTemplate(){
  const templates=getTemplates();
  templates.push({id:uid(),name:'My Template',icon:'📋',color:'#7c6af7',desc:'Custom template',items:['Task 1','Task 2']});
  ls_save('nx_todo_templates',templates);
  renderTemplateGrid();
  openEditTemplateModal(templates.length-1);
}

function deleteTemplate(idx){
  const templates=getTemplates();
  if(!confirm('Delete this template?'))return;
  templates.splice(idx,1);
  ls_save('nx_todo_templates',templates);
  renderTemplateGrid();
}

function resetTemplates(){
  if(!confirm('Reset all templates to defaults?'))return;
  localStorage.removeItem('nx_todo_templates');
  renderTemplateGrid();
  toast('Templates reset','success');
}

function applyTemplate(idx){
  const t=window._tplData?.[idx];
  if(!t){toast('Template not found','error');return;}
  const list={id:uid(),name:t.name,icon:t.icon,color:t.color||'var(--accent)',createdAt:Date.now()};
  STATE.todoLists.push(list);
  const items=t.items.map(text=>({id:uid(),listId:list.id,text,done:false,createdAt:Date.now()}));
  STATE.todoItems=STATE.todoItems.concat(items);
  ls_save(KEYS.todoLists,STATE.todoLists);
  ls_save(KEYS.todoItems,STATE.todoItems);
  renderTodoLists();
  openTodoList(list.id);
  updateStats();
  closeModal('todo-template-modal');
  toast(`"${t.name}" applied ✓`,'success');
  switchPanel('todos');
  const tabEl=document.querySelector('#panel-todos .bm-tab[data-tab="todo-lists"]');
  if(tabEl)tabEl.click();
}

// ── HABITS ────────────────────────────────────────
function openAddHabitModal(){
  STATE.editIds.habit=null;
  document.getElementById('habit-modal-title').textContent='New Habit';
  ['habit-name','habit-icon'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('habit-freq').value='daily';
  setPickerColor('habit-color-picker',GROUP_COLORS[0]);
  openModal('habit-modal');
  setTimeout(()=>document.getElementById('habit-name').focus(),100);
}

function saveHabit(){
  const name=document.getElementById('habit-name').value.trim();
  const icon=document.getElementById('habit-icon').value.trim()||'🔥';
  const freq=document.getElementById('habit-freq').value;
  const color=getPickerColor('habit-color-picker');
  if(!name){toast('Habit name required','error');return;}
  STATE.habits.push({id:uid(),name,icon,freq,color,completions:{},createdAt:Date.now()});
  ls_save(KEYS.habits,STATE.habits);renderHabits();closeModal('habit-modal');toast('Habit added ✓','success');
}

function deleteHabit(id){
  if(!confirm('Delete this habit?'))return;
  STATE.habits=STATE.habits.filter(h=>h.id!==id);
  ls_save(KEYS.habits,STATE.habits);renderHabits();toast('Habit deleted','info');
}

function toggleHabitDay(habitId,dateStr){
  const h=STATE.habits.find(h=>h.id===habitId);if(!h)return;
  if(!h.completions)h.completions={};
  h.completions[dateStr]=!h.completions[dateStr];
  ls_save(KEYS.habits,STATE.habits);renderHabits();
}

function renderHabits(){
  const grid=document.getElementById('habits-grid'),empty=document.getElementById('habits-empty');
  if(STATE.habits.length===0){grid.innerHTML='';grid.style.display='none';empty.style.display='flex';return;}
  grid.style.display='grid';empty.style.display='none';
  const today=new Date();
  grid.innerHTML=STATE.habits.map(h=>{
    // Build last 7 days
    const days=[];
    for(let i=6;i>=0;i--){
      const d=new Date(today);d.setDate(d.getDate()-i);
      const str=d.toISOString().slice(0,10);
      const label=['S','M','T','W','T','F','S'][d.getDay()];
      const isDone=!!(h.completions&&h.completions[str]);
      const isToday=i===0;
      days.push({str,label,isDone,isToday});
    }
    // Streak
    let streak=0;
    for(let i=0;i<365;i++){
      const d=new Date(today);d.setDate(d.getDate()-i);
      const str=d.toISOString().slice(0,10);
      if(h.completions&&h.completions[str])streak++;else break;
    }
    return `<div class="habit-card">
      <div class="habit-card-header">
        <div class="habit-icon-badge" style="background:${h.color||'var(--accent)'}22;color:${h.color||'var(--accent)'}">${h.icon||'🔥'}</div>
        <div class="habit-info">
          <div class="habit-name">${esc(h.name)}</div>
          <div class="habit-freq">${h.freq}</div>
        </div>
        <div class="habit-streak" style="color:${h.color||'var(--accent)'}">🔥${streak}</div>
      </div>
      <div class="habit-week">
        ${days.map(d=>`<div class="habit-day${d.isDone?' done':''}${d.isToday?' today':''}" style="--hcolor:${h.color||'var(--accent)'}" onclick="toggleHabitDay('${h.id}','${d.str}')" title="${d.str}">${d.label}</div>`).join('')}
      </div>
      <div class="habit-actions">
        <button class="card-action-btn del-btn" onclick="deleteHabit('${h.id}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}

// ── GOALS ─────────────────────────────────────────
function openAddGoalModal(){
  STATE.editIds.goal=null;
  document.getElementById('goal-modal-title').textContent='New Goal';
  ['goal-name','goal-target','goal-unit','goal-deadline'].forEach(id=>document.getElementById(id).value='');
  setPickerColor('goal-color-picker',GROUP_COLORS[2]);
  openModal('goal-modal');
  setTimeout(()=>document.getElementById('goal-name').focus(),100);
}

function saveGoal(){
  const name=document.getElementById('goal-name').value.trim();
  const target=parseFloat(document.getElementById('goal-target').value)||100;
  const unit=document.getElementById('goal-unit').value.trim()||'units';
  const deadline=document.getElementById('goal-deadline').value;
  const color=getPickerColor('goal-color-picker');
  if(!name){toast('Goal name required','error');return;}
  STATE.goals.push({id:uid(),name,target,unit,deadline,color,current:0,createdAt:Date.now()});
  ls_save(KEYS.goals,STATE.goals);renderGoals();closeModal('goal-modal');toast('Goal set ✓','success');
}

function updateGoalProgress(id){
  const inp=document.getElementById(`goal-inp-${id}`);if(!inp)return;
  const val=parseFloat(inp.value);if(isNaN(val))return;
  const i=STATE.goals.findIndex(g=>g.id===id);
  if(i>=0){STATE.goals[i].current=Math.min(STATE.goals[i].target,Math.max(0,val));ls_save(KEYS.goals,STATE.goals);renderGoals();toast('Progress updated ✓','success');}
}

function deleteGoal(id){
  if(!confirm('Delete this goal?'))return;
  STATE.goals=STATE.goals.filter(g=>g.id!==id);
  ls_save(KEYS.goals,STATE.goals);renderGoals();toast('Goal deleted','info');
}

function renderGoals(){
  const grid=document.getElementById('goals-grid'),empty=document.getElementById('goals-empty');
  if(STATE.goals.length===0){grid.innerHTML='';grid.style.display='none';empty.style.display='flex';return;}
  grid.style.display='grid';empty.style.display='none';
  grid.innerHTML=STATE.goals.map(g=>{
    const pct=Math.round((g.current/g.target)*100);
    const daysLeft=g.deadline?Math.ceil((new Date(g.deadline)-new Date())/(1000*60*60*24)):null;
    return `<div class="goal-card">
      <div class="goal-card-header">
        <span class="goal-icon">🎯</span>
        <div><div class="goal-name">${esc(g.name)}</div>
          <div class="goal-deadline">${g.deadline?`${daysLeft>0?daysLeft+' days left':'Deadline passed'} · ${g.deadline}`:''}</div>
        </div>
      </div>
      <div class="goal-progress-bar"><div class="goal-progress-fill" style="width:${pct}%;background:${g.color||'var(--accent)'}"></div></div>
      <div class="goal-progress-label"><span>${g.current} ${g.unit}</span><span>${pct}% · ${g.target} ${g.unit}</span></div>
      <div class="goal-update-row">
        <input type="number" class="goal-update-input" id="goal-inp-${g.id}" placeholder="Update progress" value="${g.current}"/>
        <button class="btn-primary btn-sm" onclick="updateGoalProgress('${g.id}')">Update</button>
      </div>
      <div class="goal-actions"><button class="card-action-btn del-btn" onclick="deleteGoal('${g.id}')">Delete</button></div>
    </div>`;
  }).join('');
}

// ── BOOKS ──────────────────────────────────────────
function openAddBookModal(){
  STATE.editIds.book=null;
  document.getElementById('book-modal-title').textContent='Add Book';
  ['book-title','book-author','book-pages','book-current','book-cover','book-notes','book-tags'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('book-status').value='toread';
  openModal('book-modal');
  setTimeout(()=>document.getElementById('book-title').focus(),100);
}

function openEditBookModal(id){
  const b=STATE.books.find(b=>b.id===id);if(!b)return;
  STATE.editIds.book=id;
  document.getElementById('book-modal-title').textContent='Edit Book';
  document.getElementById('book-title').value=b.title;
  document.getElementById('book-author').value=b.author||'';
  document.getElementById('book-pages').value=b.pages||'';
  document.getElementById('book-current').value=b.current||0;
  document.getElementById('book-cover').value=b.cover||'';
  document.getElementById('book-notes').value=b.notes||'';
  document.getElementById('book-tags').value=(b.tags||[]).join(', ');
  document.getElementById('book-status').value=b.status||'toread';
  openModal('book-modal');
}

function saveBook(){
  const title=document.getElementById('book-title').value.trim();
  if(!title){toast('Title is required','error');return;}
  const b={
    title,
    author:document.getElementById('book-author').value.trim(),
    pages:parseInt(document.getElementById('book-pages').value)||0,
    current:parseInt(document.getElementById('book-current').value)||0,
    cover:document.getElementById('book-cover').value.trim(),
    notes:document.getElementById('book-notes').value.trim(),
    tags:document.getElementById('book-tags').value.split(',').map(t=>t.trim()).filter(Boolean),
    status:document.getElementById('book-status').value,
  };
  if(STATE.editIds.book){
    const i=STATE.books.findIndex(x=>x.id===STATE.editIds.book);
    if(i>=0)STATE.books[i]={...STATE.books[i],...b,updatedAt:Date.now()};
    // attach uploaded file if any
    if(_bookFileData&&i>=0){STATE.books[i].fileData=_bookFileData;_bookFileData=null;}
    toast('Book updated ✓','success');
  }else{
    const newBook={id:uid(),...b,createdAt:Date.now()};
    if(_bookFileData){newBook.fileData=_bookFileData;_bookFileData=null;}
    STATE.books.unshift(newBook);
    toast('Book added ✓','success');
  }
  ls_save(KEYS.books,STATE.books);renderBooks();closeModal('book-modal');
}

function updateBookPage(id){
  const inp=document.getElementById(`bp-${id}`);if(!inp)return;
  const val=parseInt(inp.value);if(isNaN(val))return;
  const i=STATE.books.findIndex(b=>b.id===id);
  if(i>=0){
    STATE.books[i].current=Math.max(0,Math.min(STATE.books[i].pages||9999,val));
    if(STATE.books[i].current>=STATE.books[i].pages&&STATE.books[i].pages>0)STATE.books[i].status='done';
    else if(STATE.books[i].current>0)STATE.books[i].status='reading';
    ls_save(KEYS.books,STATE.books);renderBooks();toast('Progress saved ✓','success');
  }
}

function deleteBook(id){
  if(!confirm('Delete this book?'))return;
  STATE.books=STATE.books.filter(b=>b.id!==id);
  ls_save(KEYS.books,STATE.books);renderBooks();toast('Deleted','info');
}

function renderBooks(){
  const grid=document.getElementById('books-grid'),empty=document.getElementById('books-empty');
  const q=document.getElementById('books-search').value.toLowerCase();
  const f=document.getElementById('books-filter').value;
  let books=STATE.books;
  if(q)books=books.filter(b=>b.title.toLowerCase().includes(q)||(b.author||'').toLowerCase().includes(q)||(b.tags||[]).some(t=>t.toLowerCase().includes(q)));
  if(f!=='all')books=books.filter(b=>b.status===f);
  if(books.length===0){grid.innerHTML='';grid.style.display='none';empty.style.display='flex';return;}
  grid.style.display='grid';empty.style.display='none';
  const statusLabels={reading:'📖 Reading',toread:'📌 To Read',done:'✅ Finished',paused:'⏸ Paused'};
  const statusClass={reading:'book-status-reading',toread:'book-status-toread',done:'book-status-done',paused:'book-status-paused'};
  grid.innerHTML=books.map(b=>{
    const pct=b.pages>0?Math.round((b.current/b.pages)*100):0;
    const hasFile=b.fileData?true:false;
    return `<div class="book-card">
      ${b.cover?`<img class="book-cover" src="${esc(b.cover)}" alt="${esc(b.title)}" onerror="this.style.display='none';this.nextSibling.style.display='flex'"/><div class="book-cover-placeholder" style="display:none">📖</div>`
        :`<div class="book-cover-placeholder">📖</div>`}
      <div class="book-info">
        <div class="book-title">${esc(b.title)}</div>
        ${b.author?`<div class="book-author">${esc(b.author)}</div>`:''}
        <span class="book-status-badge ${statusClass[b.status]||''}">${statusLabels[b.status]||b.status}</span>
        ${b.pages>0?`<div class="book-progress-bar"><div class="book-progress-fill" style="width:${pct}%"></div></div>
        <div class="book-progress-label">${b.current} / ${b.pages} pages · ${pct}%</div>`:''}
        ${b.pages>0?`<div class="goal-update-row" style="margin-top:4px">
          <input type="number" class="goal-update-input" id="bp-${b.id}" value="${b.current}" min="0" max="${b.pages}" placeholder="Current page"/>
          <button class="btn-primary btn-sm" onclick="updateBookPage('${b.id}')">Save</button>
        </div>`:''}
      </div>
      <div class="book-card-actions">
        ${hasFile?`<button class="card-action-btn read-btn" style="background:var(--accent);color:#fff;border-color:var(--accent)" onclick="openReader('${b.id}')">📖 Read</button>`:''}
        <button class="card-action-btn" onclick="openEditBookModal('${b.id}')">Edit</button>
        <button class="card-action-btn del-btn" onclick="deleteBook('${b.id}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}

// ── WHITEBOARD ────────────────────────────────────
let WB={canvas:null,ctx:null,drawing:false,tool:'pen',color:'#7c6af7',size:4,history:[],snapshot:null,sessionId:null};

function initWhiteboardLazy(){}

function initWhiteboard(){
  if(WB.canvas)return; // already init
  const canvas=document.getElementById('wb-canvas');
  if(!canvas)return;
  WB.canvas=canvas;
  WB.ctx=canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize',resizeCanvas);

  // Tool buttons
  document.querySelectorAll('.wb-tool').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.wb-tool').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      WB.tool=btn.dataset.tool;
      canvas.style.cursor=WB.tool==='eraser'?'cell':'crosshair';
    });
  });

  document.getElementById('wb-color').addEventListener('input',e=>WB.color=e.target.value);
  document.getElementById('wb-size').addEventListener('change',e=>WB.size=parseInt(e.target.value));

  // Mouse events
  canvas.addEventListener('mousedown',wbStart);
  canvas.addEventListener('mousemove',wbMove);
  canvas.addEventListener('mouseup',wbEnd);
  canvas.addEventListener('mouseleave',wbEnd);

  // Touch events
  canvas.addEventListener('touchstart',e=>{e.preventDefault();wbStart(e.touches[0]);},{passive:false});
  canvas.addEventListener('touchmove',e=>{e.preventDefault();wbMove(e.touches[0]);},{passive:false});
  canvas.addEventListener('touchend',e=>{e.preventDefault();wbEnd();},{passive:false});

  // Load session or start fresh
  newWbSession(false);
}

function resizeCanvas(){
  if(!WB.canvas)return;
  const container=WB.canvas.parentElement;
  const img=WB.ctx.getImageData(0,0,WB.canvas.width,WB.canvas.height);
  WB.canvas.width=container.clientWidth;
  WB.canvas.height=container.clientHeight;
  // Restore content
  WB.ctx.putImageData(img,0,0);
  WB.ctx.lineCap='round';
  WB.ctx.lineJoin='round';
}

function getCanvasPos(e){
  const r=WB.canvas.getBoundingClientRect();
  return{x:(e.clientX||e.pageX)-r.left,y:(e.clientY||e.pageY)-r.top};
}

function wbStart(e){
  WB.drawing=true;
  const{x,y}=getCanvasPos(e);
  WB.startX=x;WB.startY=y;
  WB.snapshot=WB.ctx.getImageData(0,0,WB.canvas.width,WB.canvas.height);
  if(WB.tool==='pen'||WB.tool==='highlighter'||WB.tool==='eraser'){
    WB.ctx.beginPath();WB.ctx.moveTo(x,y);
  }
}

function wbMove(e){
  if(!WB.drawing)return;
  const{x,y}=getCanvasPos(e);
  const ctx=WB.ctx;
  ctx.lineWidth=WB.size;
  ctx.lineCap='round';ctx.lineJoin='round';
  if(WB.tool==='eraser'){
    ctx.globalCompositeOperation='destination-out';
    ctx.strokeStyle='rgba(0,0,0,1)';
    ctx.lineWidth=WB.size*3;
    ctx.lineTo(x,y);ctx.stroke();
  }else if(WB.tool==='pen'){
    ctx.globalCompositeOperation='source-over';
    ctx.strokeStyle=WB.color;
    ctx.globalAlpha=1;
    ctx.lineTo(x,y);ctx.stroke();
  }else if(WB.tool==='highlighter'){
    ctx.globalCompositeOperation='source-over';
    ctx.strokeStyle=WB.color;
    ctx.globalAlpha=0.35;
    ctx.lineWidth=WB.size*4;
    ctx.lineTo(x,y);ctx.stroke();
  }else{
    // Shape tools: restore snapshot then draw shape
    ctx.putImageData(WB.snapshot,0,0);
    ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=1;
    ctx.strokeStyle=WB.color;
    ctx.lineWidth=WB.size;
    ctx.beginPath();
    if(WB.tool==='line'){ctx.moveTo(WB.startX,WB.startY);ctx.lineTo(x,y);ctx.stroke();}
    else if(WB.tool==='rect'){ctx.strokeRect(WB.startX,WB.startY,x-WB.startX,y-WB.startY);}
    else if(WB.tool==='circle'){
      const rx=(x-WB.startX)/2,ry=(y-WB.startY)/2;
      ctx.ellipse(WB.startX+rx,WB.startY+ry,Math.abs(rx),Math.abs(ry),0,0,2*Math.PI);
      ctx.stroke();
    }
  }
}

function wbEnd(){
  if(!WB.drawing)return;
  WB.drawing=false;
  WB.ctx.globalAlpha=1;
  WB.ctx.globalCompositeOperation='source-over';
  WB.history.push(WB.ctx.getImageData(0,0,WB.canvas.width,WB.canvas.height));
  if(WB.history.length>40)WB.history.shift();
}

function undoCanvas(){
  if(!WB.canvas||WB.history.length===0)return;
  WB.history.pop();
  if(WB.history.length>0)WB.ctx.putImageData(WB.history[WB.history.length-1],0,0);
  else WB.ctx.clearRect(0,0,WB.canvas.width,WB.canvas.height);
}

function clearCanvas(){
  if(!WB.canvas||!confirm('Clear the canvas?'))return;
  WB.ctx.clearRect(0,0,WB.canvas.width,WB.canvas.height);
  WB.history=[];
}

function saveWbSession(){
  if(!WB.canvas)return;
  const dataUrl=WB.canvas.toDataURL('image/png');
  const name=document.getElementById('wb-session-name').textContent;
  if(WB.sessionId){
    const i=STATE.wbSessions.findIndex(s=>s.id===WB.sessionId);
    if(i>=0){STATE.wbSessions[i].data=dataUrl;STATE.wbSessions[i].updatedAt=Date.now();}
  }else{
    WB.sessionId=uid();
    STATE.wbSessions.push({id:WB.sessionId,name,data:dataUrl,createdAt:Date.now(),updatedAt:Date.now()});
  }
  ls_save(KEYS.wbSessions,STATE.wbSessions);
  toast('Session saved ✓','success');
}

function newWbSession(clear=true){
  if(clear&&WB.canvas)WB.ctx.clearRect(0,0,WB.canvas.width,WB.canvas.height);
  WB.sessionId=null;WB.history=[];
  const name='Session '+new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  document.getElementById('wb-session-name').textContent=name;
  closeModal('wb-sessions-modal');
}

function openWbSessions(){
  const list=document.getElementById('wb-sessions-list');
  if(STATE.wbSessions.length===0){list.innerHTML='<p style="color:var(--text3);text-align:center;padding:20px">No saved sessions yet.</p>';openModal('wb-sessions-modal');return;}
  list.innerHTML=STATE.wbSessions.slice().reverse().map(s=>`
    <div class="wb-session-item">
      <div>
        <div class="wb-session-name">${esc(s.name)}</div>
        <div class="wb-session-date">${fmtDate(s.updatedAt)}</div>
      </div>
      <button class="btn-outline btn-sm" onclick="loadWbSession('${s.id}')">Load</button>
      <button class="card-action-btn del-btn btn-sm" onclick="deleteWbSession('${s.id}')">Delete</button>
    </div>`).join('');
  openModal('wb-sessions-modal');
}

function loadWbSession(id){
  const s=STATE.wbSessions.find(s=>s.id===id);if(!s)return;
  if(!WB.canvas)initWhiteboard();
  WB.ctx.clearRect(0,0,WB.canvas.width,WB.canvas.height);
  const img=new Image();
  img.onload=()=>{WB.ctx.drawImage(img,0,0);WB.history=[WB.ctx.getImageData(0,0,WB.canvas.width,WB.canvas.height)];};
  img.src=s.data;
  WB.sessionId=id;
  document.getElementById('wb-session-name').textContent=s.name;
  closeModal('wb-sessions-modal');
  toast(`Loaded "${s.name}"`,'info');
}

function deleteWbSession(id){
  if(!confirm('Delete this session?'))return;
  STATE.wbSessions=STATE.wbSessions.filter(s=>s.id!==id);
  ls_save(KEYS.wbSessions,STATE.wbSessions);
  if(WB.sessionId===id)WB.sessionId=null;
  openWbSessions();toast('Session deleted','info');
}

function exportCanvas(){
  if(!WB.canvas)return;
  const a=document.createElement('a');
  a.download=`nexmark-whiteboard-${Date.now()}.png`;
  a.href=WB.canvas.toDataURL('image/png');
  a.click();
}

// ── SETTINGS / PREFS ─────────────────────────────
function applyPrefs(prefs){
  setTheme(prefs.theme||'dark',false);
  setAccent(prefs.accent||'purple',false);
}

function setTheme(theme,persist=true){
  document.documentElement.dataset.theme=theme;
  document.getElementById('theme-dark').classList.toggle('active',theme==='dark');
  document.getElementById('theme-light').classList.toggle('active',theme==='light');
  if(persist){const p=ls_obj(KEYS.prefs,{});p.theme=theme;ls_save(KEYS.prefs,p);}
}

function setAccent(accent,persist=true){
  document.documentElement.dataset.accent=accent==='purple'?'':accent;
  document.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('active',s.dataset.accent===accent));
  if(persist){const p=ls_obj(KEYS.prefs,{});p.accent=accent;ls_save(KEYS.prefs,p);}
}

function setupColorSwatches(){
  const prefs=ls_obj(KEYS.prefs,{accent:'purple'});
  const accents=[
    {name:'purple',color:'#7c6af7'},{name:'emerald',color:'#2ec49e'},
    {name:'rose',color:'#f06292'},{name:'amber',color:'#f0b429'},{name:'sky',color:'#38bdf8'},
  ];
  document.getElementById('accent-swatches').innerHTML=accents.map(a=>`
    <div class="swatch${a.name===(prefs.accent||'purple')?' active':''}" style="background:${a.color}" data-accent="${a.name}" title="${a.name}" onclick="setAccent('${a.name}')"></div>`).join('');
}

// ── COLOR PICKERS ─────────────────────────────────
function setupColorPickers(){
  setupColorSwatches();
  ['group-color-picker','import-group-color-picker','todo-list-color-picker','habit-color-picker','goal-color-picker'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    el.innerHTML=GROUP_COLORS.map(c=>`<div class="gcolor-swatch" data-color="${c}" style="background:${c}" data-picker="${id}" onclick="selectSwatch(this,'${id}')"></div>`).join('');
    setPickerColor(id,GROUP_COLORS[0],false);
  });
}

function selectSwatch(el,pickerId){
  const picker=document.getElementById(pickerId);if(!picker)return;
  picker.querySelectorAll('.gcolor-swatch').forEach(s=>s.classList.remove('active'));
  el.classList.add('active');
  picker.dataset.selected=el.dataset.color;
}

function setPickerColor(pickerId,color,trigger=true){
  const picker=document.getElementById(pickerId);if(!picker)return;
  picker.querySelectorAll('.gcolor-swatch').forEach(s=>s.classList.toggle('active',s.dataset.color===color));
  picker.dataset.selected=color;
}

function getPickerColor(pickerId){
  const picker=document.getElementById(pickerId);
  return picker?picker.dataset.selected||GROUP_COLORS[0]:GROUP_COLORS[0];
}

// ── EXPORT / IMPORT ──────────────────────────────
function exportData(){
  const data={version:3,exported:new Date().toISOString(),bookmarks:STATE.bookmarks,notes:STATE.notes,cloudFiles:STATE.cloudFiles,groups:STATE.groups,todoLists:STATE.todoLists,todoItems:STATE.todoItems,habits:STATE.habits,goals:STATE.goals,books:STATE.books};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`nexmark-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();
  URL.revokeObjectURL(url);toast('Export downloaded ✓','success');
}

function importData(event){
  const file=event.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const d=JSON.parse(e.target.result);
      if(d.bookmarks){STATE.bookmarks=d.bookmarks;ls_save(KEYS.bm,STATE.bookmarks);}
      if(d.notes){STATE.notes=d.notes;ls_save(KEYS.notes,STATE.notes);}
      if(d.cloudFiles){STATE.cloudFiles=d.cloudFiles;ls_save(KEYS.cloud,STATE.cloudFiles);}
      if(d.groups){STATE.groups=d.groups;ls_save(KEYS.groups,STATE.groups);}
      if(d.todoLists){STATE.todoLists=d.todoLists;ls_save(KEYS.todoLists,STATE.todoLists);}
      if(d.todoItems){STATE.todoItems=d.todoItems;ls_save(KEYS.todoItems,STATE.todoItems);}
      if(d.habits){STATE.habits=d.habits;ls_save(KEYS.habits,STATE.habits);}
      if(d.goals){STATE.goals=d.goals;ls_save(KEYS.goals,STATE.goals);}
      if(d.books){STATE.books=d.books;ls_save(KEYS.books,STATE.books);}
      renderBookmarks();renderGroups();renderTagsView();renderNotesList();renderCloud();
      renderTodoLists();renderHabits();renderGoals();renderBooks();updateStats();
      toast('Import successful ✓','success');
    }catch{toast('Invalid backup file','error');}
  };
  reader.readAsText(file);event.target.value='';
}

function clearAllData(){
  if(!confirm('Permanently delete ALL data?'))return;
  if(!confirm('Last chance — this cannot be undone.'))return;
  Object.values(KEYS).forEach(k=>localStorage.removeItem(k));
  ['bookmarks','notes','cloudFiles','groups','todoLists','todoItems','habits','goals','books','wbSessions'].forEach(k=>STATE[k]=[]);
  STATE.activeNote=null;STATE.activeTodoList=null;
  renderBookmarks();renderGroups();renderTagsView();renderNotesList();renderCloud();
  renderTodoLists();renderHabits();renderGoals();renderBooks();updateStats();
  document.getElementById('note-editor').innerHTML='<div class="note-editor-placeholder"><span>← Select or create a note</span></div>';
  document.getElementById('todo-list-editor').innerHTML='<div class="note-editor-placeholder"><span>← Select or create a list</span></div>';
  toast('All data cleared','info');
}

// ── COMING SOON ───────────────────────────────────
function showComingSoon(feature){
  document.getElementById('coming-soon-title').textContent=feature+' — Coming Soon';
  document.getElementById('coming-soon-desc').textContent=`${feature} is on the roadmap and will be available in a future release. Stay tuned!`;
  openModal('coming-soon-modal');
}

// ── UTILS ─────────────────────────────────────────
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
function esc(s=''){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function fmtDate(ts){if(!ts)return'';const d=new Date(ts),now=new Date(),diff=now-d;if(diff<60000)return'just now';if(diff<3600000)return`${Math.floor(diff/60000)}m ago`;if(diff<86400000)return`${Math.floor(diff/3600000)}h ago`;return d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});}
function debounce(fn,d){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),d);};}
let _toastT;
function toast(msg,type='info'){const t=document.getElementById('toast');t.textContent=msg;t.className=`toast ${type} show`;clearTimeout(_toastT);_toastT=setTimeout(()=>t.classList.remove('show'),2800);}
function updateStats(){
  document.getElementById('stat-bm').textContent=STATE.bookmarks.length;
  document.getElementById('stat-notes').textContent=STATE.notes.length;
  // Show total todo lists (not pending items - that was confusing)
  document.getElementById('stat-todos').textContent=STATE.todoLists.length;
}

// ── BOOT — single clean listener ──
document.addEventListener('DOMContentLoaded', init);

/* ════════════════════════════════════════════════
   NEXMARK v4 — NEW MODULES
   Music | File Tools (PDF+Images+OCR+Convert) |
   Book Reader (PDF+EPUB) | Notifications/Reminders |
   Prompt Maker | Price Tracker | Drive upload/sort
════════════════════════════════════════════════ */

// ══ extend STATE ══
Object.assign(STATE,{
  notifications:[], reminders:[],
  musicTracks:[], musicIdx:0, musicShuffle:false, musicRepeat:false,
  products:[],
  savedPrompts:[],
  pmOptions:{examples:true,role:true},
  pdfDoc:null, pdfPage:1, pdfZoom:1, pdfTool:'select', pdfAnnotations:{}, splitPdfBytes:null,
  readerBook:null, readerType:null, readerPage:1, readerFontSz:16, readerFont:'Syne', readerTheme:'dark',
  readerBookmarks:[], readerNotes:[],
  driveView:'grid', driveSort:'name', driveCachedFiles:[],
  imageTool:{canvas:null,original:null,result:null},
});
Object.assign(KEYS,{
  notifications:'nx_notifs', reminders:'nx_reminders',
  music:'nx_music', products:'nx_products', savedPrompts:'nx_prompts',
  readerBM:'nx_reader_bm', readerNotes:'nx_reader_notes',
});

function saveClaudeKey(){
  const v=document.getElementById('claude-api-key-input').value.trim();
  if(!v){toast('Enter your API key','error');return;}
  localStorage.setItem('nx_claude_key',v);
  const s=document.getElementById('claude-key-status');
  if(s)s.textContent='Key saved ✓';
  toast('Claude API key saved ✓','success');
}

// ══ CLOUD TABS v4 ══
function setupCloudTabsV4(){
  document.querySelectorAll('#panel-cloud .bm-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      const t=tab.dataset.tab;
      document.querySelectorAll('#panel-cloud .bm-tab').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('#panel-cloud .bm-tab-content').forEach(c=>c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('bm-tab-'+t).classList.add('active');
      const upBtn=document.getElementById('btn-drive-upload');
      if(upBtn)upBtn.style.display=(t==='cloud-gdrive'&&localStorage.getItem('nx_gdrive_token'))?'block':'none';
    });
  });
}
function setDriveView(v){
  STATE.driveView=v;
  document.getElementById('drive-view-grid').classList.toggle('active',v==='grid');
  document.getElementById('drive-view-list').classList.toggle('active',v==='list');
  const g=document.getElementById('drive-files-grid');
  if(g)g.className='drive-files-grid'+(v==='list'?' view-list':'');
}
function sortDriveFiles(by){
  STATE.driveSort=by;
  if(!STATE.driveCachedFiles.length)return;
  const sorted=[...STATE.driveCachedFiles];
  if(by==='name')sorted.sort((a,b)=>a.name.localeCompare(b.name));
  else if(by==='modified')sorted.sort((a,b)=>new Date(b.modifiedTime||0)-new Date(a.modifiedTime||0));
  else if(by==='size')sorted.sort((a,b)=>(parseInt(b.size)||0)-(parseInt(a.size)||0));
  else if(by==='type')sorted.sort((a,b)=>a.mimeType.localeCompare(b.mimeType));
  renderDriveFiles(sorted);
}
const debouncedDriveSearch=debounce(async(q)=>{
  if(!q){loadDriveFiles('root');return;}
  const token=localStorage.getItem('nx_gdrive_token');if(!token)return;
  const grid=document.getElementById('drive-files-grid');
  grid.innerHTML='<div class="drive-loading">Searching…</div>';
  try{
    const qs=encodeURIComponent(`name contains '${q}' and trashed=false`);
    const fields=encodeURIComponent('files(id,name,mimeType,size,modifiedTime,webViewLink)');
    const res=await fetch(`https://www.googleapis.com/drive/v3/files?q=${qs}&fields=${fields}&pageSize=50`,{headers:{Authorization:`Bearer ${token}`}});
    const data=await res.json();
    if(data.files)renderDriveFiles(data.files);
  }catch{grid.innerHTML='<div class="drive-loading">Search failed.</div>';}
},400);

async function createDriveFolder(){
  const name=prompt('Folder name:');if(!name)return;
  const token=localStorage.getItem('nx_gdrive_token');if(!token)return;
  try{
    const res=await fetch('https://www.googleapis.com/drive/v3/files',{
      method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder'})
    });
    if(res.ok){toast(`Folder "${name}" created ✓`,'success');loadDriveFiles('root');}
    else toast('Could not create folder','error');
  }catch{toast('Error creating folder','error');}
}

function triggerDriveUpload(){document.getElementById('drive-upload-input').click();}
async function uploadFilesToDrive(event){
  const files=[...event.target.files];if(!files.length)return;
  const token=localStorage.getItem('nx_gdrive_token');if(!token){toast('Connect Google Drive first','error');return;}
  for(const file of files){
    const meta=JSON.stringify({name:file.name});
    const form=new FormData();
    form.append('metadata',new Blob([meta],{type:'application/json'}));
    form.append('file',file);
    toast(`Uploading "${file.name}"…`,'info');
    try{
      const res=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{
        method:'POST',headers:{Authorization:`Bearer ${token}`},body:form
      });
      if(res.ok)toast(`"${file.name}" uploaded ✓`,'success');
      else toast(`Failed to upload "${file.name}"`, 'error');
    }catch{toast(`Error uploading "${file.name}"`,'error');}
  }
  event.target.value='';
  loadDriveFiles('root');
}

// ══ NOTIFICATIONS & REMINDERS ══
function setupNotifTabs(){
  document.querySelectorAll('#panel-notifications .bm-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      document.querySelectorAll('#panel-notifications .bm-tab').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('#panel-notifications .bm-tab-content').forEach(c=>c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('bm-tab-'+tab.dataset.tab).classList.add('active');
    });
  });
}
function openAddReminderModal(){
  document.getElementById('reminder-title').value='';
  document.getElementById('reminder-datetime').value='';
  document.getElementById('reminder-notes').value='';
  document.getElementById('reminder-type').value='reminder';
  // default to 1 hour from now
  const d=new Date(Date.now()+3600000);
  document.getElementById('reminder-datetime').value=d.toISOString().slice(0,16);
  openModal('reminder-modal');
  setTimeout(()=>document.getElementById('reminder-title').focus(),100);
}
function saveReminder(){
  const title=document.getElementById('reminder-title').value.trim();
  const dt=document.getElementById('reminder-datetime').value;
  if(!title){toast('Title required','error');return;}
  if(!dt){toast('Date/time required','error');return;}
  const r={id:uid(),title,datetime:dt,type:document.getElementById('reminder-type').value,notes:document.getElementById('reminder-notes').value.trim(),done:false,snoozed:false,createdAt:Date.now()};
  STATE.reminders.push(r);
  ls_save(KEYS.reminders,STATE.reminders);
  // Add to notifications
  addNotification({id:uid(),type:'reminder',title,desc:`Due: ${new Date(dt).toLocaleString('en-IN')}`,time:dt,reminderId:r.id,read:false});
  renderNotifications();closeModal('reminder-modal');toast('Reminder set ✓','success');
}
function addNotification(n){
  STATE.notifications.unshift({...n,createdAt:Date.now()});
  ls_save(KEYS.notifications,STATE.notifications);
  updateNotifBadge();
}
function checkReminders(){
  const now=new Date();
  STATE.reminders.forEach(r=>{
    if(r.done||r.snoozed)return;
    if(new Date(r.datetime)<=now){
      // Check if already in notifications as active
      const exists=STATE.notifications.find(n=>n.reminderId===r.id&&!n.dismissed);
      if(!exists){
        addNotification({id:uid(),type:r.type||'reminder',title:r.title,desc:r.notes||'Reminder due now',time:r.datetime,reminderId:r.id,read:false,overdue:true});
        // Browser notification
        if(Notification.permission==='granted'){
          new Notification('Nexmark Reminder',{body:r.title,icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text y="18" font-size="18">⬡</text></svg>'});
        }
      }
    }
  });
}
function snoozeReminder(id,mins=15){
  const r=STATE.reminders.find(r=>r.id===id);
  if(!r)return;
  r.snoozed=true;
  const newDt=new Date(Date.now()+mins*60000);
  r.datetime=newDt.toISOString().slice(0,16);
  r.snoozed=false;// will re-trigger
  ls_save(KEYS.reminders,STATE.reminders);
  // dismiss current notification
  dismissNotif(id);
  toast(`Snoozed ${mins} min`,'info');
}
function dismissNotif(reminderId){
  STATE.notifications=STATE.notifications.map(n=>n.reminderId===reminderId?{...n,dismissed:true,read:true}:n);
  ls_save(KEYS.notifications,STATE.notifications);
  renderNotifications();
}
function markNotifDone(reminderId){
  const r=STATE.reminders.find(r=>r.id===reminderId);
  if(r){r.done=true;ls_save(KEYS.reminders,STATE.reminders);}
  STATE.notifications=STATE.notifications.map(n=>n.reminderId===reminderId?{...n,read:true,done:true}:n);
  ls_save(KEYS.notifications,STATE.notifications);
  renderNotifications();toast('Marked done ✓','success');
}
function deleteNotif(id){
  STATE.notifications=STATE.notifications.filter(n=>n.id!==id);
  ls_save(KEYS.notifications,STATE.notifications);
  renderNotifications();
}
function clearAllNotifs(){
  if(!confirm('Clear all notifications?'))return;
  STATE.notifications=[];ls_save(KEYS.notifications,STATE.notifications);
  renderNotifications();
}
const NOTIF_ICONS={reminder:'⏰',todo:'✅',note:'📝',habit:'🔥',general:'🔔'};
function renderNotifications(){
  updateNotifBadge();
  const all=document.getElementById('notif-list-all');
  const remList=document.getElementById('notif-list-reminders');
  const empty=document.getElementById('notif-empty');
  const remEmpty=document.getElementById('notif-reminders-empty');
  const active=STATE.notifications.filter(n=>!n.dismissed&&!n.done);
  const remindersOnly=active.filter(n=>n.type==='reminder'||n.type==='todo'||n.type==='habit'||n.type==='note');
  function renderList(container,items,emptyEl){
    if(items.length===0){container.innerHTML='';emptyEl.style.display='flex';return;}
    emptyEl.style.display='none';
    container.innerHTML=items.map(n=>`
      <div class="notif-card ${n.read?'':'unread'} ${n.overdue?'overdue':''}">
        <div class="notif-card-icon">${NOTIF_ICONS[n.type]||'🔔'}</div>
        <div class="notif-card-body">
          <div class="notif-card-title">${esc(n.title)}</div>
          ${n.desc?`<div class="notif-card-desc">${esc(n.desc)}</div>`:''}
          <div class="notif-card-time">${fmtDate(n.createdAt)}${n.time?` · Due: ${new Date(n.time).toLocaleString('en-IN',{hour12:true,hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'})}`:''}</div>
        </div>
        <div class="notif-card-actions">
          ${n.reminderId?`<button class="card-action-btn" onclick="snoozeReminder('${n.reminderId}',15)">Snooze 15m</button>
          <button class="card-action-btn open-btn" onclick="markNotifDone('${n.reminderId}')">Done</button>`:''}
          <button class="card-action-btn del-btn" onclick="deleteNotif('${n.id}')">✕</button>
        </div>
      </div>`).join('');
  }
  renderList(all,active,empty);
  renderList(remList,remindersOnly,remEmpty);
}
function updateNotifBadge(){
  const unread=STATE.notifications.filter(n=>!n.read&&!n.dismissed&&!n.done).length;
  const badge=document.getElementById('notif-badge');
  if(badge){badge.style.display=unread>0?'flex':'none';badge.textContent=unread>9?'9+':unread;}
}
function requestNotifPermission(){
  if(!('Notification' in window)){toast('Browser does not support notifications','error');return;}
  Notification.requestPermission().then(p=>{
    const s=document.getElementById('notif-permission-status');
    if(s)s.textContent='Permission: '+p;
    if(p==='granted')toast('Browser notifications enabled ✓','success');
  });
}
function checkNotifPermission(){
  const s=document.getElementById('notif-permission-status');
  if(s&&'Notification' in window)s.textContent='Permission: '+Notification.permission;
}

// ══ BOOK READER — Full Featured ══
let _bookFileData = null;
let _readerPdfDoc = null;       // pdfjsLib document
let _readerEpubBook = null;
let _readerEpubRendition = null;
let _readerZoom = 1.0;
let _readerTool = 'cursor';     // cursor | highlight | note
let _readerHlColor = '#ffe06688';
let _readerAutoScrollTimer = null;
let _readerStickyPending = null; // {x,y,page}
let _readerSessionStart = null;
let _readerSessionPages = new Set();
let _readerSearchMatches = [];
let _readerSearchIdx = 0;
let _readerAnnotations = []; // [{id,bookId,page,color,text,rects,note}]
let _readerStickyNotes = []; // [{id,bookId,page,x,y,text}]
let _selectedText = '';

// ── File upload for book modal ──
function handleBookFileUpload(event) {
  const file = event.target.files[0]; if (!file) return;
  const label = document.getElementById('book-file-label');
  if (label) label.textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => { _bookFileData = { name: file.name, type: file.name.toLowerCase().endsWith('.epub') ? 'epub' : 'pdf', data: e.target.result }; };
  reader.readAsDataURL(file);
}
// ── Open Reader ──
function openReader(bookId) {
  const book = STATE.books.find(b => b.id === bookId); if (!book) return;
  if (!book.fileData) { toast('No file uploaded. Edit the book and upload a PDF or EPUB.', 'error'); return; }
  STATE.readerBook = bookId;
  STATE.readerType = book.fileData.type;
  _readerZoom = book.savedZoom || 1.0;
  STATE.readerFontSz = book.savedFontSz || 16;
  STATE.readerTheme = book.savedTheme || 'dark';
  // Load stored annotations/notes
  _readerAnnotations = ls_load('nx_reader_annot');
  _readerStickyNotes = ls_load('nx_reader_sticky');
  STATE.readerBookmarks = ls_load(KEYS.readerBM);
  STATE.readerNotes = ls_load(KEYS.readerNotes);
  _readerSessionStart = Date.now();
  _readerSessionPages = new Set();

  document.getElementById('reader-book-title').textContent = book.title;
  // Apply theme
  const rm = document.getElementById('reader-main');
  if (rm) rm.className = 'reader-main theme-' + STATE.readerTheme;
  document.getElementById('reader-theme').value = STATE.readerTheme;
  switchPanel('reader');

  // Keyboard listener
  document.addEventListener('keydown', _readerKeyHandler);
  // Context menu listener
  document.addEventListener('mouseup', _readerMouseUpHandler);
  // Click outside context menu
  document.addEventListener('click', _readerHideContextMenu);

  if (STATE.readerType === 'pdf') openPDFReader(book.fileData.data, bookId);
  else openEPUBReader(book.fileData.data, bookId);
}

function closeReader() {
  const book = STATE.books.find(b => b.id === STATE.readerBook);
  if (book) {
    if (STATE.readerType === 'pdf') {
      book.current = STATE.readerPage;
      book.pages = _readerPdfDoc ? _readerPdfDoc.numPages : (book.pages || 0);
      if (book.pages > 0 && STATE.readerPage >= book.pages) book.status = 'done';
      else if (STATE.readerPage > 1) book.status = 'reading';
    }
    book.savedZoom = _readerZoom;
    book.savedFontSz = STATE.readerFontSz;
    book.savedTheme = STATE.readerTheme;
    // Save reading time
    if (_readerSessionStart) {
      const mins = Math.round((Date.now() - _readerSessionStart) / 60000);
      book.totalMinutes = (book.totalMinutes || 0) + mins;
    }
    ls_save(KEYS.books, STATE.books);
  }
  // Cleanup
  document.removeEventListener('keydown', _readerKeyHandler);
  document.removeEventListener('mouseup', _readerMouseUpHandler);
  document.removeEventListener('click', _readerHideContextMenu);
  stopAutoScroll();
  if (_readerEpubRendition) { try { _readerEpubRendition.destroy(); } catch(e){} _readerEpubRendition = null; }
  if (_readerEpubBook) { try { _readerEpubBook.destroy(); } catch(e){} _readerEpubBook = null; }
  _readerPdfDoc = null;
  switchPanel('books');
}

// ── Keyboard handler ──
function _readerKeyHandler(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); readerNext(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); readerPrev(); }
  else if (e.key === 'f' || e.key === 'F') { toggleReaderFullscreen(); }
  else if (e.key === 'b' || e.key === 'B') { bookmarkCurrentPage(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); toggleReaderSearch(); }
  else if (e.key === 'Escape') {
    stopAutoScroll();
    _readerHideContextMenu();
    const si = document.getElementById('reader-search-bar');
    if (si && si.style.display !== 'none') toggleReaderSearch();
  }
  else if (e.key === '+' || e.key === '=') readerZoom(0.2);
  else if (e.key === '-') readerZoom(-0.2);
  else if (e.key === '0') { _readerZoom = 1.0; renderReaderPDFPage(STATE.readerPage); updateZoomLabel(); }
}

// ── Context menu ──
function _readerMouseUpHandler(e) {
  if (e.target.closest('#reader-context-menu') || e.target.closest('#reader-sticky-input')) return;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) { setTimeout(_readerHideContextMenu, 150); return; }
  const text = sel.toString().trim();
  if (!text || text.length < 2) { _readerHideContextMenu(); return; }
  _selectedText = text;
  const menu = document.getElementById('reader-context-menu');
  menu.style.display = 'block';
  const x = Math.min(e.clientX, window.innerWidth - 160);
  const y = Math.min(e.clientY + 8, window.innerHeight - 140);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
}
function _readerHideContextMenu(e) {
  if (e && e.target.closest('#reader-context-menu')) return;
  const menu = document.getElementById('reader-context-menu');
  if (menu) menu.style.display = 'none';
}
function contextHighlight() {
  _readerHideContextMenu();
  if (!_selectedText) return;
  const annot = { id: uid(), bookId: STATE.readerBook, page: STATE.readerPage, color: _readerHlColor, text: _selectedText, type: 'highlight', note: '', createdAt: Date.now() };
  _readerAnnotations.push(annot);
  ls_save('nx_reader_annot', _readerAnnotations);
  renderReaderAnnotationsList(STATE.readerBook);
  window.getSelection()?.removeAllRanges();
  toast('Highlighted ✓', 'success');
}
function contextNote() {
  _readerHideContextMenu();
  if (!_selectedText) return;
  const text = prompt('Add note for: "' + _selectedText.slice(0, 40) + ((_selectedText.length > 40) ? '…' : '') + '"');
  if (text === null) return;
  const note = { id: uid(), bookId: STATE.readerBook, page: STATE.readerPage, text: _selectedText, note: text, color: _readerHlColor, type: 'note', createdAt: Date.now() };
  _readerAnnotations.push(note);
  ls_save('nx_reader_annot', _readerAnnotations);
  // Also store in plain notes list
  STATE.readerNotes.push({ id: uid(), bookId: STATE.readerBook, page: STATE.readerPage, text: text, quote: _selectedText, createdAt: Date.now() });
  ls_save(KEYS.readerNotes, STATE.readerNotes);
  renderReaderAnnotationsList(STATE.readerBook);
  renderReaderNotesList(STATE.readerBook);
  toast('Note saved 📌', 'success');
}
function contextCopy() {
  _readerHideContextMenu();
  navigator.clipboard?.writeText(_selectedText).then(() => toast('Copied ✓', 'success')).catch(() => toast('Copy failed', 'error'));
}
function contextLookup() {
  _readerHideContextMenu();
  lookupWord(_selectedText.trim().split(/\s+/)[0]);
}

// ── Dictionary lookup ──
async function lookupWord(word) {
  if (!word) return;
  document.getElementById('dict-modal-word').textContent = word;
  document.getElementById('dict-modal-body').textContent = 'Looking up…';
  document.getElementById('reader-dict-modal').classList.add('open');
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();
    const entry = data[0];
    let html = '';
    if (entry.phonetics?.[0]?.text) html += `<div style="color:var(--text3);font-size:12px;margin-bottom:8px">${entry.phonetics[0].text}</div>`;
    entry.meanings?.slice(0, 3).forEach(m => {
      html += `<div style="font-weight:700;color:var(--accent);margin:8px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.07em">${m.partOfSpeech}</div>`;
      m.definitions?.slice(0, 2).forEach((d, i) => {
        html += `<div style="margin-bottom:4px">${i + 1}. ${d.definition}</div>`;
        if (d.example) html += `<div style="color:var(--text3);font-style:italic;font-size:12px;margin-bottom:6px">"${d.example}"</div>`;
      });
    });
    document.getElementById('dict-modal-body').innerHTML = html || 'No definition found.';
  } catch (e) {
    document.getElementById('dict-modal-body').textContent = `"${word}" not found in dictionary.`;
  }
}
function closeDict() { document.getElementById('reader-dict-modal')?.classList.remove('open'); }

// ── PDF Reader ──
async function openPDFReader(dataUrl, bookId) {
  if (!window.pdfjsLib) { toast('PDF.js not loaded', 'error'); return; }
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const wrap = document.getElementById('reader-content-wrap');
  wrap.innerHTML = '<div style="color:var(--text3);padding:40px;text-align:center">Loading PDF…<br><small>Large files may take a moment</small></div>';
  try {
    const resp = await fetch(dataUrl);
    const arr = await resp.arrayBuffer();
    _readerPdfDoc = await pdfjsLib.getDocument({ data: arr }).promise;
    const book = STATE.books.find(b => b.id === bookId);
    STATE.readerPage = book?.current || 1;
    const total = _readerPdfDoc.numPages;
    document.getElementById('reader-total-pages').textContent = '/ ' + total;
    document.getElementById('reader-page-input').max = total;

    // Get outline for TOC
    const outline = await _readerPdfDoc.getOutline();
    renderReaderTOC(outline);
    // Render canvas
    wrap.innerHTML = `<div style="position:relative;display:inline-block">
      <canvas id="reader-pdf-canvas" style="display:block;box-shadow:0 4px 24px rgba(0,0,0,.4)"></canvas>
      <canvas id="reader-annot-canvas" style="position:absolute;top:0;left:0;pointer-events:none"></canvas>
      <div id="reader-text-layer" class="pdf-text-layer" style="position:absolute;top:0;left:0;overflow:hidden;opacity:0.3;line-height:1;user-select:text;-webkit-user-select:text"></div>
    </div>`;
    // Click on content for sticky notes
    wrap.addEventListener('click', _readerWrapClick);
    await renderReaderPDFPage(STATE.readerPage);
    renderReaderBookmarks(bookId);
    renderReaderAnnotationsList(bookId);
    renderReaderNotesList(bookId);
    updateReaderStats(bookId);
  } catch (e) {
    wrap.innerHTML = `<div style="color:var(--red);padding:40px">Error loading PDF: ${e.message}</div>`;
  }
}

function _readerWrapClick(e) {
  if (e.target.closest('#reader-sticky-input') || e.target.closest('#reader-context-menu')) return;
  if (_readerTool !== 'note') return;
  const wrap = document.getElementById('reader-content-wrap');
  const rect = wrap.getBoundingClientRect();
  const x = e.clientX - rect.left + wrap.scrollLeft;
  const y = e.clientY - rect.top + wrap.scrollTop;
  _readerStickyPending = { x, y, page: STATE.readerPage };
  const si = document.getElementById('reader-sticky-input');
  si.style.display = 'block';
  si.style.left = Math.min(x + 10, wrap.clientWidth - 220) + 'px';
  si.style.top = Math.min(y + 10, wrap.clientHeight - 120) + 'px';
  document.getElementById('reader-sticky-text').value = '';
  document.getElementById('reader-sticky-text').focus();
}

function saveReaderStickyNote() {
  const text = document.getElementById('reader-sticky-text').value.trim();
  if (!text || !_readerStickyPending) { cancelStickyNote(); return; }
  const note = { id: uid(), bookId: STATE.readerBook, page: _readerStickyPending.page, x: _readerStickyPending.x, y: _readerStickyPending.y, text, createdAt: Date.now() };
  _readerStickyNotes.push(note);
  ls_save('nx_reader_sticky', _readerStickyNotes);
  STATE.readerNotes.push({ id: uid(), bookId: STATE.readerBook, page: note.page, text, createdAt: Date.now() });
  ls_save(KEYS.readerNotes, STATE.readerNotes);
  cancelStickyNote();
  renderStickyMarkers();
  renderReaderNotesList(STATE.readerBook);
  toast('Note pinned 📌', 'success');
}
function cancelStickyNote() {
  document.getElementById('reader-sticky-input').style.display = 'none';
  _readerStickyPending = null;
}

async function renderReaderPDFPage(n) {
  if (!_readerPdfDoc) return;
  n = Math.max(1, Math.min(n, _readerPdfDoc.numPages));
  STATE.readerPage = n;
  _readerSessionPages.add(n);

  const page = await _readerPdfDoc.getPage(n);
  const canvas = document.getElementById('reader-pdf-canvas'); if (!canvas) return;
  const wrap = document.getElementById('reader-content-wrap');
  const baseScale = Math.min(1.6, (wrap.clientWidth - 80) / page.getViewport({ scale: 1 }).width);
  const scale = baseScale * _readerZoom * (STATE.readerFontSz / 16);
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  // Also size annot canvas
  const annotCanvas = document.getElementById('reader-annot-canvas');
  if (annotCanvas) { annotCanvas.width = viewport.width; annotCanvas.height = viewport.height; }

  const ctx = canvas.getContext('2d');
  const themes = { sepia: '#f5ead5', night: '#050505', light: '#ffffff', dark: null };
  if (themes[STATE.readerTheme]) {
    ctx.fillStyle = themes[STATE.readerTheme];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  await page.render({ canvasContext: ctx, viewport }).promise;

  // ── Text layer (enables real text selection + highlight) ──
  const textLayerDiv = document.getElementById('reader-text-layer');
  if (textLayerDiv) {
    textLayerDiv.innerHTML = '';
    textLayerDiv.style.width = viewport.width + 'px';
    textLayerDiv.style.height = viewport.height + 'px';
    const textContent = await page.getTextContent();
    if (pdfjsLib.renderTextLayer) {
      pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport,
        textDivs: []
      });
    }
  }

  document.getElementById('reader-page-input').value = n;
  document.getElementById('reader-total-pages').textContent = '/ ' + _readerPdfDoc.numPages;
  document.getElementById('reader-progress-label').textContent = `Page ${n} / ${_readerPdfDoc.numPages}`;

  const pct = Math.round((n / _readerPdfDoc.numPages) * 100);
  const bar = document.getElementById('reader-progress-bar');
  if (bar) bar.style.width = pct + '%';

  _highlightActiveTOCItem(n);
  renderStickyMarkers();
}

function renderStickyMarkers() {
  // Remove old markers
  document.querySelectorAll('.reader-sticky-marker').forEach(m => m.remove());
  const wrap = document.getElementById('reader-content-wrap');
  if (!wrap) return;
  const notes = _readerStickyNotes.filter(n => n.bookId === STATE.readerBook && n.page === STATE.readerPage);
  notes.forEach(note => {
    const marker = document.createElement('div');
    marker.className = 'reader-sticky-marker';
    marker.style.left = note.x + 'px';
    marker.style.top = note.y + 'px';
    marker.textContent = '📌';
    marker.title = note.text;
    marker.onclick = e => { e.stopPropagation(); const edited = prompt('Edit note:', note.text); if (edited !== null) { note.text = edited; ls_save('nx_reader_sticky', _readerStickyNotes); renderStickyMarkers(); } };
    // Get the canvas container
    const container = wrap.querySelector('div[style*="relative"]');
    if (container) container.appendChild(marker);
  });
}

function _highlightActiveTOCItem(n) {
  // Simple highlight — mark item if page matches
  document.querySelectorAll('.reader-toc-item').forEach(item => {
    const pg = parseInt(item.dataset.page || 0);
    item.classList.toggle('active', pg === n);
  });
}

// ── EPUB Reader ──
async function openEPUBReader(dataUrl, bookId) {
  if (!window.ePub) { toast('epub.js not loaded', 'error'); return; }
  const wrap = document.getElementById('reader-content-wrap');
  wrap.innerHTML = '<div style="color:var(--text3);padding:40px;text-align:center">Loading EPUB…</div>';
  try {
    const resp = await fetch(dataUrl);
    const blob = await resp.blob();
    const arrBuf = await blob.arrayBuffer();
    _readerEpubBook = ePub(arrBuf);
    wrap.innerHTML = `<div id="reader-epub-frame" style="width:100%;max-width:740px;flex:1;min-height:0;height:600px"></div>`;
    _readerEpubRendition = _readerEpubBook.renderTo('reader-epub-frame', { width: '100%', height: '600', spread: 'none' });

    // Apply theme
    _applyEpubTheme(STATE.readerTheme);
    _readerEpubRendition.themes.fontSize(STATE.readerFontSz + 'px');

    // Restore CFI
    const book = STATE.books.find(b => b.id === bookId);
    await _readerEpubRendition.display(book?.epubCfi || undefined);

    // TOC
    _readerEpubBook.loaded.navigation.then(nav => renderReaderTOC(nav.toc?.map(c => ({ label: c.label, href: c.href })) || [], true));

    // Progress tracking
    _readerEpubRendition.on('relocated', location => {
      const pct = Math.round(location.start.percentage * 100);
      document.getElementById('reader-progress-label').textContent = `${pct}% read`;
      STATE.readerPage = location.start.cfi;
      const bar = document.getElementById('reader-progress-bar');
      if (bar) bar.style.width = pct + '%';
    });

    // Keyboard in EPUB iframe
    _readerEpubRendition.on('keydown', _readerKeyHandler);

    renderReaderBookmarks(bookId);
    renderReaderAnnotationsList(bookId);
    renderReaderNotesList(bookId);
    document.getElementById('reader-total-pages').textContent = '';
    document.getElementById('reader-page-input').style.display = 'none';
  } catch (e) {
    wrap.innerHTML = `<div style="color:var(--red);padding:40px">Error loading EPUB: ${e.message}</div>`;
  }
}

function _applyEpubTheme(t) {
  if (!_readerEpubRendition) return;
  const themes = {
    dark: { body: { background: '#0d0e11', color: '#e8eaf0' }, 'a': { color: '#7c6af7' } },
    light: { body: { background: '#ffffff', color: '#1a1b20' } },
    sepia: { body: { background: '#f5ead5', color: '#4e3b25' } },
    night: { body: { background: '#050505', color: '#999999' } }
  };
  if (themes[t]) _readerEpubRendition.themes.register('custom', { '::selection': { background: _readerHlColor }, ...themes[t] });
  _readerEpubRendition.themes.select('custom');
}

// ── TOC renderer ──
function renderReaderTOC(items, isEpub = false) {
  const toc = document.getElementById('reader-toc'); if (!toc) return;
  if (!items || !items.length) { toc.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:10px">No table of contents</div>'; return; }

  function renderItems(arr, level = 1) {
    return arr.map(item => {
      const subitems = item.items || item.subitems || [];
      const dest = isEpub ? `epubGoTo('${esc(item.href)}')` : (item.dest ? `readerGoToDest('${esc(JSON.stringify(item.dest))}')` : `renderReaderPDFPage(1)`);
      return `<div class="reader-toc-item level-${level}" data-page="${item.page || 0}" onclick="${dest}">${esc((item.label || item.title || '').trim())}${subitems.length ? renderItems(subitems, Math.min(level + 1, 3)) : ''}</div>`;
    }).join('');
  }
  toc.innerHTML = renderItems(items);
}
function epubGoTo(href) { if (_readerEpubRendition) _readerEpubRendition.display(href); }
async function readerGoToDest(destJson) {
  try {
    const dest = JSON.parse(destJson);
    if (_readerPdfDoc) {
      const ref = Array.isArray(dest) ? dest[0] : dest;
      const pageIdx = await _readerPdfDoc.getPageIndex(ref);
      renderReaderPDFPage(pageIdx + 1);
    }
  } catch(e) { /* ignore */ }
}

// ── Navigation ──
function readerPrev() {
  if (STATE.readerType === 'pdf' && STATE.readerPage > 1) renderReaderPDFPage(STATE.readerPage - 1);
  else if (STATE.readerType === 'epub' && _readerEpubRendition) _readerEpubRendition.prev();
}
function readerNext() {
  if (STATE.readerType === 'pdf' && _readerPdfDoc && STATE.readerPage < _readerPdfDoc.numPages) renderReaderPDFPage(STATE.readerPage + 1);
  else if (STATE.readerType === 'epub' && _readerEpubRendition) _readerEpubRendition.next();
}
function readerGoToPage(n) {
  if (STATE.readerType === 'pdf') renderReaderPDFPage(parseInt(n));
}

// ── Zoom ──
function readerZoom(delta) {
  _readerZoom = Math.max(0.4, Math.min(3.0, _readerZoom + delta));
  updateZoomLabel();
  if (STATE.readerType === 'pdf') renderReaderPDFPage(STATE.readerPage);
}
function updateZoomLabel() {
  const lbl = document.getElementById('reader-zoom-label');
  if (lbl) lbl.textContent = Math.round(_readerZoom * 100) + '%';
}

// ── Font size ──
function readerFontSize(d) {
  STATE.readerFontSz = Math.max(10, Math.min(28, STATE.readerFontSz + d));
  if (STATE.readerType === 'pdf') renderReaderPDFPage(STATE.readerPage);
  else if (_readerEpubRendition) _readerEpubRendition.themes.fontSize(STATE.readerFontSz + 'px');
}

// ── Font ──
function readerChangeFont(f) {
  STATE.readerFont = f;
  if (_readerEpubRendition) _readerEpubRendition.themes.override('*', { fontFamily: f + ' !important' });
}

// ── Theme ──
function readerChangeTheme(t) {
  STATE.readerTheme = t;
  const rm = document.getElementById('reader-main');
  if (rm) rm.className = 'reader-main theme-' + t;
  if (STATE.readerType === 'epub') _applyEpubTheme(t);
  else if (STATE.readerType === 'pdf') renderReaderPDFPage(STATE.readerPage);
}

// ── Tools ──
function setReaderTool(tool) {
  _readerTool = tool;
  document.querySelectorAll('.reader-controls .wb-tool').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('reader-tool-' + tool); if (btn) btn.classList.add('active');
  const wrap = document.getElementById('reader-content-wrap');
  if (wrap) wrap.className = 'reader-content-wrap' + (tool === 'note' ? ' tool-note' : '');
  // Show color picker when highlight tool active
  const hlColors = document.getElementById('reader-hl-colors');
  if (hlColors) hlColors.classList.toggle('visible', tool === 'highlight');
}
function setHlColor(color) {
  _readerHlColor = color;
  document.querySelectorAll('.hl-color').forEach(el => el.classList.toggle('active', el.dataset.color === color));
}

// ── Bookmarks ──
function bookmarkCurrentPage() {
  const bookId = STATE.readerBook; if (!bookId) return;
  const page = STATE.readerPage;
  const exists = STATE.readerBookmarks.find(b => b.bookId === bookId && b.page === page);
  if (exists) { toast('Already bookmarked', 'info'); return; }
  STATE.readerBookmarks.push({ id: uid(), bookId, page, type: STATE.readerType, createdAt: Date.now() });
  ls_save(KEYS.readerBM, STATE.readerBookmarks);
  renderReaderBookmarks(bookId);
  toast('Bookmarked 🔖', 'success');
}
function renderReaderBookmarks(bookId) {
  const list = document.getElementById('reader-bookmarks-list'); if (!list) return;
  const bms = STATE.readerBookmarks.filter(b => b.bookId === bookId);
  if (!bms.length) { list.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:10px">No bookmarks yet.<br>Press B or tap 🔖 to add.</div>'; return; }
  list.innerHTML = bms.map(b => `<div class="reader-bookmark-item" onclick="readerGoToPage(${typeof b.page === 'number' ? b.page : 1})">
    <span>${typeof b.page === 'number' ? '📄 Page ' + b.page : '📌 ' + esc(String(b.page).slice(0, 30))}</span>
    <button class="card-action-btn del-btn" style="opacity:1;padding:2px 6px;flex-shrink:0" onclick="event.stopPropagation();deleteReaderBookmark('${b.id}')">✕</button>
  </div>`).join('');
}
function deleteReaderBookmark(id) {
  STATE.readerBookmarks = STATE.readerBookmarks.filter(b => b.id !== id);
  ls_save(KEYS.readerBM, STATE.readerBookmarks);
  renderReaderBookmarks(STATE.readerBook);
}

// ── Annotations list ──
function renderReaderAnnotationsList(bookId) {
  const list = document.getElementById('reader-annotations-list'); if (!list) return;
  const annots = _readerAnnotations.filter(a => a.bookId === bookId);
  if (!annots.length) { list.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:10px">No highlights yet.<br>Select text and choose Highlight.</div>'; return; }
  list.innerHTML = annots.map(a => `<div class="reader-annot-item" onclick="${STATE.readerType === 'pdf' ? 'renderReaderPDFPage(' + a.page + ')' : ''}">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <span><span class="reader-annot-color-dot" style="background:${a.color.slice(0, 7)}"></span>${STATE.readerType === 'pdf' ? 'Page ' + a.page : ''}</span>
      <button class="card-action-btn del-btn" style="opacity:1;padding:1px 5px;font-size:10px" onclick="event.stopPropagation();deleteAnnotation('${a.id}')">✕</button>
    </div>
    <div style="font-size:12px;color:var(--text2);line-height:1.4;font-style:italic">"${esc(a.text.slice(0, 100))}${a.text.length > 100 ? '…' : ''}"</div>
    ${a.note ? `<div style="font-size:11px;color:var(--text3);margin-top:4px">📌 ${esc(a.note)}</div>` : ''}
  </div>`).join('');
}
function deleteAnnotation(id) {
  _readerAnnotations = _readerAnnotations.filter(a => a.id !== id);
  ls_save('nx_reader_annot', _readerAnnotations);
  renderReaderAnnotationsList(STATE.readerBook);
}

// ── Notes list ──
function renderReaderNotesList(bookId) {
  const list = document.getElementById('reader-notes-list'); if (!list) return;
  const notes = STATE.readerNotes.filter(n => n.bookId === bookId);
  if (!notes.length) { list.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:10px">No notes yet.<br>Select text → Add Note, or use 📌 tool.</div>'; return; }
  list.innerHTML = notes.map(n => `<div class="reader-note-item" onclick="${STATE.readerType === 'pdf' ? 'renderReaderPDFPage(' + n.page + ')' : ''}">
    <div style="font-size:11px;color:var(--text3);margin-bottom:4px">${typeof n.page === 'number' ? 'Page ' + n.page : ''}</div>
    ${n.quote ? `<div style="font-size:11px;color:var(--text2);font-style:italic;margin-bottom:4px">"${esc(n.quote.slice(0, 60))}${n.quote.length > 60 ? '…' : ''}"</div>` : ''}
    <div style="color:var(--text)">${esc(n.text)}</div>
    <button class="card-action-btn del-btn" style="opacity:1;padding:1px 5px;font-size:10px;margin-top:4px" onclick="event.stopPropagation();deleteReaderNote('${n.id}')">Delete</button>
  </div>`).join('');
}
function deleteReaderNote(id) {
  STATE.readerNotes = STATE.readerNotes.filter(n => n.id !== id);
  ls_save(KEYS.readerNotes, STATE.readerNotes);
  renderReaderNotesList(STATE.readerBook);
}

// ── Reading Stats ──
function updateReaderStats(bookId) {
  const panel = document.getElementById('reader-stats-panel'); if (!panel) return;
  const book = STATE.books.find(b => b.id === bookId);
  if (!book) return;
  const total = _readerPdfDoc ? _readerPdfDoc.numPages : 0;
  const current = book.current || 1;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const annotations = _readerAnnotations.filter(a => a.bookId === bookId).length;
  const notes = STATE.readerNotes.filter(n => n.bookId === bookId).length;
  const bookmarks = STATE.readerBookmarks.filter(b => b.bookId === bookId).length;
  const mins = book.totalMinutes || 0;
  panel.innerHTML = `
    <div style="padding:12px">
      <div style="font-weight:700;font-size:13px;margin-bottom:12px;color:var(--text)">📊 Reading Stats</div>
      <div class="reader-stats-row"><span>Progress</span><span class="reader-stats-val">${pct}%</span></div>
      <div class="reader-stats-row"><span>Current page</span><span class="reader-stats-val">${current}${total ? ' / ' + total : ''}</span></div>
      <div class="reader-stats-row"><span>Time read</span><span class="reader-stats-val">${mins < 60 ? mins + 'm' : Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm'}</span></div>
      <div class="reader-stats-row"><span>Highlights</span><span class="reader-stats-val">${annotations}</span></div>
      <div class="reader-stats-row"><span>Notes</span><span class="reader-stats-val">${notes}</span></div>
      <div class="reader-stats-row"><span>Bookmarks</span><span class="reader-stats-val">${bookmarks}</span></div>
      <div class="reader-stats-row"><span>Status</span><span class="reader-stats-val" style="text-transform:capitalize">${book.status || 'unread'}</span></div>
      <div style="margin-top:12px;background:var(--bg3);border-radius:6px;overflow:hidden;height:8px">
        <div style="height:100%;background:var(--accent);width:${pct}%;border-radius:6px;transition:width .4s"></div>
      </div>
    </div>`;
}

// ── Sidebar tab ──
function switchReaderTab(tab) {
  document.querySelectorAll('[data-rtab]').forEach(b => b.classList.toggle('active', b.dataset.rtab === tab));
  const map = { toc: 'reader-toc', bookmarks: 'reader-bookmarks-list', annotations: 'reader-annotations-list', notes: 'reader-notes-list', stats: 'reader-stats-panel' };
  Object.entries(map).forEach(([k, id]) => {
    const el = document.getElementById(id); if (el) el.classList.toggle('active', k === tab);
  });
  if (tab === 'stats') updateReaderStats(STATE.readerBook);
}

// ── Sidebar toggle ──
function toggleReaderSidebar() {
  const layout = document.getElementById('reader-layout');
  if (layout) layout.classList.toggle('sidebar-hidden');
}

// ── Search ──
function toggleReaderSearch() {
  const bar = document.getElementById('reader-search-bar');
  if (!bar) return;
  const visible = bar.style.display !== 'none';
  bar.style.display = visible ? 'none' : 'flex';
  if (!visible) document.getElementById('reader-search-input')?.focus();
  if (visible) { _readerSearchMatches = []; document.getElementById('reader-search-count').textContent = '0 results'; }
}
async function readerSearch(query) {
  _readerSearchMatches = [];
  _readerSearchIdx = 0;
  const countEl = document.getElementById('reader-search-count');
  if (!query || query.length < 2) { countEl.textContent = '0 results'; return; }
  if (STATE.readerType === 'pdf' && _readerPdfDoc) {
    const q = query.toLowerCase();
    let total = 0;
    for (let i = 1; i <= _readerPdfDoc.numPages; i++) {
      const page = await _readerPdfDoc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(it => it.str).join(' ').toLowerCase();
      if (text.includes(q)) {
        _readerSearchMatches.push(i);
        total++;
      }
    }
    countEl.textContent = total + ' pages match';
    if (total > 0) readerSearchNext();
  } else if (STATE.readerType === 'epub') {
    countEl.textContent = 'Use browser Ctrl+F in EPUB mode';
  }
}
function readerSearchNext() {
  if (!_readerSearchMatches.length) return;
  _readerSearchIdx = (_readerSearchIdx + 1) % _readerSearchMatches.length;
  renderReaderPDFPage(_readerSearchMatches[_readerSearchIdx]);
}
function readerSearchPrev() {
  if (!_readerSearchMatches.length) return;
  _readerSearchIdx = (_readerSearchIdx - 1 + _readerSearchMatches.length) % _readerSearchMatches.length;
  renderReaderPDFPage(_readerSearchMatches[_readerSearchIdx]);
}
function readerSearchNav(e) {
  if (e.key === 'Enter') { if (e.shiftKey) readerSearchPrev(); else readerSearchNext(); }
  if (e.key === 'Escape') toggleReaderSearch();
}

// ── Fullscreen ──
function toggleReaderFullscreen() {
  const panel = document.getElementById('panel-reader');
  const btn = document.getElementById('reader-fs-btn');
  if (!panel) return;
  panel.classList.toggle('reader-fullscreen');
  if (btn) btn.textContent = panel.classList.contains('reader-fullscreen') ? '⛶ Exit' : '⛶';
}

// ── Auto-scroll ──
function toggleAutoScroll() {
  const btn = document.getElementById('reader-autoscroll-btn');
  if (_readerAutoScrollTimer) {
    stopAutoScroll();
    if (btn) { btn.textContent = '⏩ Auto'; btn.style.color = ''; }
  } else {
    const wrap = document.getElementById('reader-content-wrap');
    if (!wrap) return;
    _readerAutoScrollTimer = setInterval(() => {
      wrap.scrollTop += 1;
      if (wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight) {
        wrap.scrollTop = 0;
        if (STATE.readerType === 'pdf') readerNext();
      }
    }, 40);
    if (btn) { btn.textContent = '⏸ Stop'; btn.style.color = 'var(--accent)'; }
  }
}
function stopAutoScroll() {
  if (_readerAutoScrollTimer) { clearInterval(_readerAutoScrollTimer); _readerAutoScrollTimer = null; }
}

// ── Export notes ──
function exportReaderNotes() {
  const bookId = STATE.readerBook;
  const book = STATE.books.find(b => b.id === bookId);
  const annots = _readerAnnotations.filter(a => a.bookId === bookId);
  const notes = STATE.readerNotes.filter(n => n.bookId === bookId);
  const bookmarks = STATE.readerBookmarks.filter(b => b.bookId === bookId);
  if (!annots.length && !notes.length && !bookmarks.length) { toast('No notes or highlights to export', 'info'); return; }

  let text = `# ${book?.title || 'Book'} — Reading Notes\nExported ${new Date().toLocaleDateString()}\n\n`;
  if (bookmarks.length) {
    text += `## Bookmarks\n`;
    bookmarks.forEach(b => { text += `- Page ${b.page}\n`; });
    text += '\n';
  }
  if (annots.length) {
    text += `## Highlights & Annotations\n`;
    annots.forEach(a => {
      text += `**Page ${a.page}:** "${a.text}"\n`;
      if (a.note) text += `  > Note: ${a.note}\n`;
      text += '\n';
    });
  }
  if (notes.length) {
    text += `## Notes\n`;
    notes.forEach(n => {
      text += `**Page ${n.page}:**\n`;
      if (n.quote) text += `> "${n.quote}"\n`;
      text += `${n.text}\n\n`;
    });
  }
  const blob = new Blob([text], { type: 'text/markdown' });
  downloadBlobFile(blob, (book?.title || 'notes').replace(/[^a-z0-9]/gi, '_') + '_notes.md');
  toast('Notes exported ✓', 'success');
}

// ══ MUSIC — Wavesurfer.js v7 ══
let _ws = null; // WaveSurfer instance
let _wsReady = false;

function _initWaveSurfer() {
  if (_ws) { try { _ws.destroy(); } catch(e){} _ws = null; }
  if (!window.WaveSurfer) { toast('WaveSurfer not loaded','error'); return; }
  _wsReady = false;
  _ws = WaveSurfer.create({
    container: '#waveform',
    waveColor: 'var(--accent)',
    progressColor: 'rgba(79,142,255,.35)',
    cursorColor: '#fff',
    cursorWidth: 2,
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    height: 60,
    normalize: true,
    interact: true,
    backend: 'WebAudio',
  });
  _ws.on('ready', () => {
    _wsReady = true;
    document.getElementById('music-duration').textContent = fmtDuration(_ws.getDuration());
    const track = STATE.musicTracks[STATE.musicIdx];
    if (track) { track.duration = _ws.getDuration(); ls_save(KEYS.music, STATE.musicTracks); renderMusicList(); }
  });
  _ws.on('audioprocess', () => {
    document.getElementById('music-current-time').textContent = fmtDuration(_ws.getCurrentTime());
  });
  _ws.on('finish', () => { musicEnded(); });
  _ws.on('play', () => { document.getElementById('btn-play-pause').textContent = '⏸'; });
  _ws.on('pause', () => { document.getElementById('btn-play-pause').textContent = '▶'; });
  _ws.on('error', e => { toast('Audio error: ' + e, 'error'); });
}

function addMusicFiles(event) {
  const files = [...event.target.files];
  let loaded = 0;
  files.forEach(f => {
    const reader = new FileReader();
    reader.onload = e => {
      const track = {
        id: uid(), name: f.name.replace(/\.[^.]+$/, ''), artist: 'Unknown',
        duration: 0, url: e.target.result, // base64 — persists across reload
        type: f.type, size: f.size, addedAt: Date.now()
      };
      STATE.musicTracks.push(track);
      loaded++;
      if (loaded === files.length) {
        ls_save(KEYS.music, STATE.musicTracks);
        renderMusicList();
        toast(`${files.length} track(s) added`, 'success');
        if (STATE.musicTracks.length === files.length) playTrack(0);
      }
    };
    reader.readAsDataURL(f);
  });
  event.target.value = '';
}

function renderMusicList() {
  const list = document.getElementById('music-list');
  const empty = document.getElementById('music-empty');
  if (!STATE.musicTracks.length) { list.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  list.innerHTML = STATE.musicTracks.map((t, i) => `
    <div class="music-track-row${i === STATE.musicIdx ? ' active' : ''}" onclick="playTrack(${i})">
      <div class="music-track-num">${i === STATE.musicIdx ? '▶' : i + 1}</div>
      <div class="music-track-info-cell">
        <div class="music-track-name">${esc(t.name)}</div>
        <div class="music-track-meta">${t.artist}${t.duration ? ' · ' + fmtDuration(t.duration) : ''}</div>
      </div>
      <button class="music-track-del" onclick="event.stopPropagation();removeTrack(${i})">✕</button>
    </div>`).join('');
}

function filterMusic(q) {
  document.querySelectorAll('.music-track-row').forEach((row, i) => {
    row.style.display = STATE.musicTracks[i]?.name.toLowerCase().includes(q.toLowerCase()) ? 'flex' : 'none';
  });
}

function playTrack(idx) {
  const track = STATE.musicTracks[idx]; if (!track) return;
  STATE.musicIdx = idx;
  document.getElementById('music-track-title').textContent = track.name;
  document.getElementById('music-track-artist').textContent = track.artist || 'Unknown';
  const sizeMB = track.size ? (track.size / 1048576).toFixed(1) + ' MB' : '';
  document.getElementById('music-track-meta').textContent = [track.type?.split('/')[1]?.toUpperCase(), sizeMB].filter(Boolean).join(' · ');
  document.getElementById('music-current-time').textContent = '0:00';
  document.getElementById('music-duration').textContent = track.duration ? fmtDuration(track.duration) : '…';
  document.getElementById('btn-play-pause').textContent = '⏸';
  renderMusicList();
  _initWaveSurfer();
  if (_ws) {
    _ws.load(track.url);
    _ws.once('ready', () => { _ws.play(); });
  }
}

function removeTrack(idx) {
  STATE.musicTracks.splice(idx, 1);
  if (STATE.musicIdx >= STATE.musicTracks.length) STATE.musicIdx = Math.max(0, STATE.musicTracks.length - 1);
  ls_save(KEYS.music, STATE.musicTracks);
  renderMusicList();
  if (!STATE.musicTracks.length && _ws) { try { _ws.stop(); } catch(e){} }
}

function togglePlay() {
  if (!_ws || !STATE.musicTracks.length) {
    if (STATE.musicTracks.length) playTrack(STATE.musicIdx);
    return;
  }
  if (!_wsReady) return;
  _ws.playPause();
}

function musicPrev() {
  let i = STATE.musicIdx - 1;
  if (i < 0) i = STATE.musicTracks.length - 1;
  playTrack(i);
}

function musicNext() {
  let i = STATE.musicShuffle
    ? Math.floor(Math.random() * STATE.musicTracks.length)
    : (STATE.musicIdx + 1) % STATE.musicTracks.length;
  playTrack(i);
}

function musicEnded() {
  if (STATE.musicRepeat) playTrack(STATE.musicIdx);
  else musicNext();
}

function toggleShuffle() {
  STATE.musicShuffle = !STATE.musicShuffle;
  document.getElementById('btn-shuffle').classList.toggle('active', STATE.musicShuffle);
  toast(STATE.musicShuffle ? 'Shuffle on' : 'Shuffle off');
}

function toggleRepeat() {
  STATE.musicRepeat = !STATE.musicRepeat;
  document.getElementById('btn-repeat').classList.toggle('active', STATE.musicRepeat);
  toast(STATE.musicRepeat ? 'Repeat on' : 'Repeat off');
}

function setVolume(v) {
  if (_ws) _ws.setVolume(parseFloat(v));
}

function setPlaybackSpeed(v) {
  if (_ws) _ws.setPlaybackRate(parseFloat(v));
}

function toggleSpectrogram() {
  // Simple toggle: show/hide spectrogram div (Wavesurfer plugin would go here)
  const sp = document.getElementById('spectrogram');
  const btn = document.getElementById('btn-spectrogram');
  if (!sp) return;
  const show = sp.style.display === 'none';
  sp.style.display = show ? 'block' : 'none';
  btn.classList.toggle('active', show);
  if (show) sp.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:8px;text-align:center">Spectrogram plugin available in full Wavesurfer build</div>';
}

// Keyboard shortcuts for music (only when music panel active)
function _musicKeyHandler(e) {
  if (!document.getElementById('panel-music').classList.contains('active')) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'ArrowLeft' && !e.altKey) { e.preventDefault(); musicPrev(); }
  else if (e.key === 'ArrowRight' && !e.altKey) { e.preventDefault(); musicNext(); }
  else if (e.key === 's' || e.key === 'S') toggleShuffle();
  else if (e.key === 'r' || e.key === 'R') toggleRepeat();
}
document.addEventListener('keydown', _musicKeyHandler);

// Legacy stubs (keep for compatibility)
function seekMusic() {}
function seekMusicClick() {}
function updateMusicProgress() {}
function updateMusicMeta() {}
function fmtDuration(s) { if (!s || isNaN(s)) return '0:00'; const m = Math.floor(s/60), sec = Math.floor(s%60); return `${m}:${sec.toString().padStart(2,'0')}`; }
// ══ FILE TOOLS ══
function setupFileToolsTabs(){
  document.querySelectorAll('#panel-filetools .bm-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      document.querySelectorAll('#panel-filetools .bm-tab').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('#panel-filetools .bm-tab-content').forEach(c=>c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('bm-tab-'+tab.dataset.tab).classList.add('active');
    });
  });
}
// ── PDF Tools ──
let _pdfBytes=null,_pdfAnnots={},_pdfCurrPage=1,_pdfTotalPages=1,_pdfZoom=1,_pdfTool='select',_pdfDrawing=false,_pdfColor='#ffeb3b';

function openPDFTool(event,mode){
  const file=event.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=async e=>{
    _pdfBytes=e.target.result;
    document.getElementById('pdf-modal-title').textContent=file.name+' — '+mode;
    openModal('pdf-modal');
    await renderPDFPage(1,1);
  };
  reader.readAsArrayBuffer(file);event.target.value='';
}
async function renderPDFPage(n,zoom){
  if(!_pdfBytes||!window.pdfjsLib)return;
  const pdfDoc=await pdfjsLib.getDocument({data:_pdfBytes}).promise;
  _pdfTotalPages=pdfDoc.numPages;
  _pdfCurrPage=Math.max(1,Math.min(n,_pdfTotalPages));
  _pdfZoom=zoom||_pdfZoom;
  document.getElementById('pdf-page-label').textContent=`Page ${_pdfCurrPage} / ${_pdfTotalPages}`;
  const page=await pdfDoc.getPage(_pdfCurrPage);
  const viewport=page.getViewport({scale:_pdfZoom});
  const canvas=document.getElementById('pdf-canvas');
  const ac=document.getElementById('pdf-annot-canvas');
  canvas.width=viewport.width;canvas.height=viewport.height;
  ac.width=viewport.width;ac.height=viewport.height;
  ac.style.width=viewport.width+'px';ac.style.height=viewport.height+'px';
  await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
  setupAnnotCanvas(ac);
  // Restore annotations for this page
  const annots=_pdfAnnots[_pdfCurrPage]||[];
  const ctx=ac.getContext('2d');
  annots.forEach(a=>{
    if(a.type==='draw'){ctx.strokeStyle=a.color;ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();a.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();}
    else if(a.type==='sticky'){ctx.fillStyle=a.color;ctx.font='20px serif';ctx.fillText('📌',a.x,a.y);}
  });
}
function setupAnnotCanvas(canvas){
  canvas.onmousedown=e=>{
    if(_pdfTool==='select')return;
    _pdfDrawing=true;
    const r=canvas.getBoundingClientRect();
    const x=e.clientX-r.left,y=e.clientY-r.top;
    if(_pdfTool==='sticky'){
      const text=prompt('Sticky note text:');if(!text)return;
      if(!_pdfAnnots[_pdfCurrPage])_pdfAnnots[_pdfCurrPage]=[];
      _pdfAnnots[_pdfCurrPage].push({type:'sticky',x,y,text,color:_pdfColor});
      const ctx=canvas.getContext('2d');ctx.fillStyle=_pdfColor;ctx.font='20px serif';ctx.fillText('📌',x,y);
      addAnnotToSidebar({type:'sticky',page:_pdfCurrPage,text});
      _pdfDrawing=false;
    }else if(_pdfTool==='draw'||_pdfTool==='highlight'){
      if(!_pdfAnnots[_pdfCurrPage])_pdfAnnots[_pdfCurrPage]=[];
      _pdfAnnots[_pdfCurrPage].push({type:'draw',color:_pdfTool==='highlight'?_pdfColor+'88':_pdfColor,points:[{x,y}]});
    }
  };
  canvas.onmousemove=e=>{
    if(!_pdfDrawing)return;
    if(_pdfTool==='draw'||_pdfTool==='highlight'){
      const r=canvas.getBoundingClientRect();
      const x=e.clientX-r.left,y=e.clientY-r.top;
      const annot=_pdfAnnots[_pdfCurrPage].slice(-1)[0];if(!annot)return;
      annot.points.push({x,y});
      const ctx=canvas.getContext('2d');
      ctx.strokeStyle=annot.color;ctx.lineWidth=_pdfTool==='highlight'?12:2;
      ctx.globalAlpha=_pdfTool==='highlight'?0.4:1;
      ctx.lineCap='round';
      const pts=annot.points;
      if(pts.length>1){ctx.beginPath();ctx.moveTo(pts[pts.length-2].x,pts[pts.length-2].y);ctx.lineTo(x,y);ctx.stroke();}
      ctx.globalAlpha=1;
    }
  };
  canvas.onmouseup=()=>{
    if(_pdfDrawing&&(_pdfTool==='draw'||_pdfTool==='highlight')){
      addAnnotToSidebar({type:_pdfTool,page:_pdfCurrPage,text:_pdfTool==='highlight'?'Highlight':'Drawing'});
    }
    _pdfDrawing=false;
  };
}
function addAnnotToSidebar(a){
  const list=document.getElementById('pdf-annotations-list');if(!list)return;
  const item=document.createElement('div');item.className='pdf-annot-item';
  item.textContent=`P${a.page}: ${a.type==='sticky'?a.text:a.type}`;
  list.appendChild(item);
}
function setPDFTool(t){
  _pdfTool=t;
  document.querySelectorAll('.pdf-tools-bar .wb-tool').forEach(b=>b.classList.remove('active'));
  const btn=document.getElementById('pt-'+t);if(btn)btn.classList.add('active');
}
document.addEventListener('change',e=>{if(e.target&&e.target.id==='pdf-color')_pdfColor=e.target.value;});
function pdfPrev(){if(_pdfCurrPage>1)renderPDFPage(_pdfCurrPage-1,_pdfZoom);}
function pdfNext(){if(_pdfCurrPage<_pdfTotalPages)renderPDFPage(_pdfCurrPage+1,_pdfZoom);}
function setPDFZoom(v){_pdfZoom=parseFloat(v);renderPDFPage(_pdfCurrPage,_pdfZoom);}
function rotatePDFPage(){toast('Page rotation saved (re-render)','info');renderPDFPage(_pdfCurrPage,_pdfZoom);}
async function downloadAnnotatedPDF(){toast('Downloading annotated PDF…','info');/* export canvas as PNG overlay + pdf-lib would go here */exportCanvas();}

async function mergePDFs(event){
  const files=[...event.target.files];if(files.length<2){toast('Select at least 2 PDFs','error');return;}
  if(!window.PDFLib){
    toast('Loading pdf-lib…','info');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js');
  }
  const {PDFDocument}=PDFLib;
  const merged=await PDFDocument.create();
  for(const f of files){
    const buf=await f.arrayBuffer();
    const src=await PDFDocument.load(buf);
    const pages=await merged.copyPages(src,src.getPageIndices());
    pages.forEach(p=>merged.addPage(p));
  }
  const bytes=await merged.save();
  downloadBlobFile(new Blob([bytes],{type:'application/pdf'}),'nexmark-merged.pdf');
  toast('PDFs merged ✓','success');
  event.target.value='';
}

function splitPDFTool(event){
  const f=event.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=e=>{_pdfBytes=e.target.result;document.getElementById('split-pdf-info').textContent='File: '+f.name;openModal('split-pdf-modal');};
  r.readAsArrayBuffer(f);event.target.value='';
}
async function confirmSplitPDF(){
  const rangeStr=document.getElementById('split-pdf-pages').value.trim();
  if(!rangeStr){toast('Enter page range','error');return;}
  if(!window.PDFLib){await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js');}
  const {PDFDocument}=PDFLib;
  const src=await PDFDocument.load(_pdfBytes);
  const total=src.getPageCount();
  const pages=parsePageRange(rangeStr,total);
  if(!pages.length){toast('Invalid page range','error');return;}
  const out=await PDFDocument.create();
  const copied=await out.copyPages(src,pages.map(p=>p-1));
  copied.forEach(p=>out.addPage(p));
  const bytes=await out.save();
  downloadBlobFile(new Blob([bytes],{type:'application/pdf'}),`nexmark-pages-${rangeStr.replace(/\s/g,'')}.pdf`);
  toast('Pages extracted ✓','success');
  closeModal('split-pdf-modal');
}
function parsePageRange(str,max){
  const pages=[];
  str.split(',').forEach(part=>{
    part=part.trim();
    if(part.includes('-')){const[a,b]=part.split('-').map(Number);for(let i=a;i<=Math.min(b,max);i++)pages.push(i);}
    else{const n=parseInt(part);if(n>=1&&n<=max)pages.push(n);}
  });
  return[...new Set(pages)].sort((a,b)=>a-b);
}

async function compressPDF(event){
  const f=event.target.files[0];if(!f)return;
  toast('Compressing… (reducing image quality)','info');
  if(!window.PDFLib){await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js');}
  const buf=await f.arrayBuffer();
  const {PDFDocument}=PDFLib;
  const pdf=await PDFDocument.load(buf,{ignoreEncryption:true});
  const bytes=await pdf.save({useObjectStreams:true});
  const orig=f.size,comp=bytes.byteLength;
  downloadBlobFile(new Blob([bytes],{type:'application/pdf'}),'nexmark-compressed.pdf');
  toast(`Compressed: ${formatBytes(orig)} → ${formatBytes(comp)}`,'success');
  event.target.value='';
}
function rotatePDFTool(event){
  const f=event.target.files[0];if(!f)return;
  toast('Open PDF in viewer to rotate pages','info');
  openPDFTool({target:{files:[f],value:''},'stopPropagation':()=>{}},'annotate');
  event.target.value='';
}

// ── Conversions ──
async function pdfToImages(event){
  const f=event.target.files[0];if(!f)return;
  if(!window.pdfjsLib)return;
  const buf=await f.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  const out=document.getElementById('convert-output');out.style.display='block';out.innerHTML='<p style="color:var(--text2);font-size:13px">Converting pages…</p>';
  for(let i=1;i<=Math.min(pdf.numPages,20);i++){
    const page=await pdf.getPage(i);
    const vp=page.getViewport({scale:1.5});
    const c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;
    await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
    c.toBlob(blob=>{
      downloadBlobFile(blob,`page-${i}.png`);
    },'image/png');
  }
  toast(`${Math.min(pdf.numPages,20)} pages exported as PNG`,'success');
  event.target.value='';
}

async function textToPDF(event){
  const f=event.target.files[0];if(!f)return;
  if(!window.PDFLib){await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js');}
  const text=await f.text();
  const {PDFDocument,rgb,StandardFonts}=PDFLib;
  const pdf=await PDFDocument.create();
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  const lines=text.split('\n');
  let page=pdf.addPage([595,842]);let y=800;const sz=11;
  lines.forEach(line=>{
    if(y<50){page=pdf.addPage([595,842]);y=800;}
    page.drawText(line.slice(0,90),{x:40,y,size:sz,font,color:rgb(0,0,0),maxWidth:515});
    y-=sz+4;
  });
  const bytes=await pdf.save();
  downloadBlobFile(new Blob([bytes],{type:'application/pdf'}),'nexmark-converted.pdf');
  toast('Converted to PDF ✓','success');event.target.value='';
}

async function imagesToPDF(event){
  const files=[...event.target.files];if(!files.length)return;
  if(!window.PDFLib){await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js');}
  const {PDFDocument}=PDFLib;
  const pdf=await PDFDocument.create();
  for(const f of files){
    const buf=await f.arrayBuffer();
    let img;
    if(f.type==='image/jpeg'||f.type==='image/jpg')img=await pdf.embedJpg(buf);
    else img=await pdf.embedPng(buf);
    const page=pdf.addPage([img.width,img.height]);
    page.drawImage(img,{x:0,y:0,width:img.width,height:img.height});
  }
  const bytes=await pdf.save();
  downloadBlobFile(new Blob([bytes],{type:'application/pdf'}),'nexmark-images.pdf');
  toast(`${files.length} images → PDF ✓`,'success');event.target.value='';
}

async function pdfToText(event){
  const f=event.target.files[0];if(!f)return;
  if(!window.pdfjsLib)return;
  const buf=await f.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  let text='';
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i);
    const tc=await page.getTextContent();
    text+=`\n--- Page ${i} ---\n`+tc.items.map(it=>it.str).join(' ');
  }
  const out=document.getElementById('convert-output');out.style.display='block';
  out.innerHTML=`<div class="convert-result-box"><div><div class="convert-result-name">Extracted Text</div><div class="convert-result-meta">${pdf.numPages} pages</div></div><button class="btn-outline btn-sm" onclick="navigator.clipboard.writeText(this.nextElementSibling.value).then(()=>toast('Copied','success'))">Copy</button><textarea style="display:none">${esc(text)}</textarea></div><textarea style="width:100%;height:300px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-sm);padding:12px;font-size:12px;color:var(--text);resize:vertical;outline:none;margin-top:8px">${esc(text)}</textarea>`;
  event.target.value='';
}

function mdToHTML(event){
  const f=event.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=e=>{
    let md=e.target.result;
    // basic md→html
    let html=md
      .replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^# (.+)$/gm,'<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>')
      .replace(/`(.+?)`/g,'<code>$1</code>').replace(/^- (.+)$/gm,'<li>$1</li>')
      .replace(/\n\n/g,'</p><p>').replace(/\[(.+?)\]\((.+?)\)/g,'<a href="$2">$1</a>');
    html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${f.name}</title><style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;line-height:1.8;padding:0 20px}code{background:#f4f4f4;padding:2px 6px;border-radius:3px}h1,h2,h3{border-bottom:1px solid #eee;padding-bottom:.3em}</style></head><body><p>${html}</p></body></html>`;
    downloadBlobFile(new Blob([html],{type:'text/html'}),f.name.replace(/\.md$/,'.html'));
    toast('Converted to HTML ✓','success');
  };
  r.readAsText(f);event.target.value='';
}

function htmlToText(event){
  const f=event.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=e=>{
    const tmp=document.createElement('div');tmp.innerHTML=e.target.result;
    const text=tmp.textContent||tmp.innerText||'';
    downloadBlobFile(new Blob([text],{type:'text/plain'}),f.name.replace(/\.html?$/,'.txt'));
    toast('HTML → text extracted ✓','success');
  };
  r.readAsText(f);event.target.value='';
}

// ── OCR ──
async function runOCR(event){
  const f=event.target.files[0];if(!f)return;
  document.getElementById('ocr-output').style.display='none';
  document.getElementById('ocr-progress').style.display='block';
  document.getElementById('ocr-pct').textContent='Loading…';
  if(!window.Tesseract){
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/4.1.1/tesseract.min.js');
  }
  try{
    const result=await Tesseract.recognize(f,'eng',{
      logger:m=>{if(m.status==='recognizing text')document.getElementById('ocr-pct').textContent=Math.round((m.progress||0)*100)+'%';}
    });
    document.getElementById('ocr-progress').style.display='none';
    document.getElementById('ocr-output').style.display='block';
    document.getElementById('ocr-text').value=result.data.text;
    toast('OCR complete ✓','success');
  }catch(err){
    document.getElementById('ocr-progress').style.display='none';
    toast('OCR failed: '+err.message,'error');
  }
  event.target.value='';
}
function copyOCRText(){navigator.clipboard.writeText(document.getElementById('ocr-text').value).then(()=>toast('Copied','success'));}

// ── Image Tools ──
function openImageTool(event,tool){
  const f=event.target.files[0];if(!f)return;
  const reader=new FileReader();
  reader.onload=e=>{
    STATE.imageTool.original=e.target.result;
    STATE.imageTool.result=e.target.result;
    STATE.imageTool.fileName=f.name;
    document.getElementById('img-tool-title').textContent={resize:'Resize',rotate:'Rotate / Flip',crop:'Crop',filter:'Filters',compress:'Compress',convert:'Convert Format'}[tool]||tool;
    renderImageTool(tool);
    openModal('image-tool-modal');
  };
  reader.readAsDataURL(f);event.target.value='';
}
function renderImageTool(tool){
  const body=document.getElementById('img-tool-body');
  const imgTag=`<img id="img-preview" src="${STATE.imageTool.original}" style="max-width:100%;max-height:300px;border-radius:8px;margin-bottom:12px"/>`;
  if(tool==='resize'){body.innerHTML=imgTag+`<div class="img-controls"><label style="font-size:12px;font-weight:700;color:var(--text2)">Width (px)</label><input type="number" id="img-w" class="todo-add-input" style="width:100px" value="800"/><label style="font-size:12px;font-weight:700;color:var(--text2)">Height (px)</label><input type="number" id="img-h" class="todo-add-input" style="width:100px" value="600"/><button class="btn-primary btn-sm" onclick="applyImageResize()">Apply</button></div><canvas id="img-result-canvas" style="max-width:100%;margin-top:10px"></canvas>`;}
  else if(tool==='rotate'){body.innerHTML=imgTag+`<div class="img-controls"><button class="btn-outline btn-sm" onclick="applyImageRotate(90)">↻ 90°</button><button class="btn-outline btn-sm" onclick="applyImageRotate(180)">↻ 180°</button><button class="btn-outline btn-sm" onclick="applyImageRotate(-90)">↺ -90°</button><button class="btn-outline btn-sm" onclick="applyImageFlip('h')">⇄ Flip H</button><button class="btn-outline btn-sm" onclick="applyImageFlip('v')">⇅ Flip V</button></div><canvas id="img-result-canvas" style="max-width:100%;margin-top:10px"></canvas>`;}
  else if(tool==='filter'){body.innerHTML=imgTag+`<div class="img-controls" style="flex-direction:column;gap:8px"><label style="font-size:12px;font-weight:700;color:var(--text2)">Brightness <span id="lbl-bright">100</span>%</label><input type="range" min="0" max="200" value="100" id="f-bright" class="music-slider" oninput="document.getElementById('lbl-bright').textContent=this.value;applyFilters()"/><label style="font-size:12px;font-weight:700;color:var(--text2)">Contrast <span id="lbl-contrast">100</span>%</label><input type="range" min="0" max="200" value="100" id="f-contrast" class="music-slider" oninput="document.getElementById('lbl-contrast').textContent=this.value;applyFilters()"/><label style="font-size:12px;font-weight:700;color:var(--text2)">Saturation <span id="lbl-sat">100</span>%</label><input type="range" min="0" max="200" value="100" id="f-sat" class="music-slider" oninput="document.getElementById('lbl-sat').textContent=this.value;applyFilters()"/><div class="img-controls"><button class="btn-outline btn-sm" onclick="applyFilterPreset('grayscale(100%)')">Grayscale</button><button class="btn-outline btn-sm" onclick="applyFilterPreset('sepia(100%)')">Sepia</button><button class="btn-outline btn-sm" onclick="applyFilterPreset('invert(100%)')">Invert</button><button class="btn-outline btn-sm" onclick="applyFilterPreset('')">Reset</button></div></div><canvas id="img-result-canvas" style="max-width:100%;margin-top:10px"></canvas>`;}
  else if(tool==='compress'){body.innerHTML=imgTag+`<div class="img-controls"><label style="font-size:12px;font-weight:700;color:var(--text2)">Quality <span id="lbl-quality">80</span>%</label><input type="range" min="10" max="100" value="80" id="img-quality" class="music-slider" oninput="document.getElementById('lbl-quality').textContent=this.value;applyCompression(this.value)"/></div><p id="compress-info" style="font-size:12px;color:var(--text3);margin-top:8px"></p><canvas id="img-result-canvas" style="max-width:100%;margin-top:10px"></canvas>`;}
  else if(tool==='convert'){body.innerHTML=imgTag+`<div class="img-controls"><label style="font-size:12px;font-weight:700;color:var(--text2)">Target Format</label><select id="img-format" class="filter-select"><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option><option value="image/webp">WebP</option></select><button class="btn-primary btn-sm" onclick="applyImageConvert()">Convert</button></div><canvas id="img-result-canvas" style="max-width:100%;margin-top:10px"></canvas>`;}
}
function getImageCanvas(src,cb){const img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);cb(c,img);};img.src=src;}
function applyImageResize(){
  const w=parseInt(document.getElementById('img-w').value)||800;
  const h=parseInt(document.getElementById('img-h').value)||600;
  getImageCanvas(STATE.imageTool.original,(c)=>{const out=document.createElement('canvas');out.width=w;out.height=h;out.getContext('2d').drawImage(c,0,0,w,h);STATE.imageTool.result=out.toDataURL();const rc=document.getElementById('img-result-canvas');rc.width=w;rc.height=h;rc.getContext('2d').drawImage(out,0,0);});
}
function applyImageRotate(deg){
  getImageCanvas(STATE.imageTool.result||STATE.imageTool.original,(c,img)=>{
    const out=document.createElement('canvas');
    const rad=deg*Math.PI/180;
    if(deg===90||deg===-90){out.width=img.height;out.height=img.width;}else{out.width=img.width;out.height=img.height;}
    const ctx=out.getContext('2d');ctx.translate(out.width/2,out.height/2);ctx.rotate(rad);ctx.drawImage(img,-img.width/2,-img.height/2);
    STATE.imageTool.result=out.toDataURL();
    document.getElementById('img-preview').src=STATE.imageTool.result;
    const rc=document.getElementById('img-result-canvas');rc.width=out.width;rc.height=out.height;rc.getContext('2d').drawImage(out,0,0);
  });
}
function applyImageFlip(dir){
  getImageCanvas(STATE.imageTool.result||STATE.imageTool.original,(c,img)=>{
    const out=document.createElement('canvas');out.width=img.width;out.height=img.height;
    const ctx=out.getContext('2d');
    if(dir==='h'){ctx.translate(img.width,0);ctx.scale(-1,1);}else{ctx.translate(0,img.height);ctx.scale(1,-1);}
    ctx.drawImage(img,0,0);
    STATE.imageTool.result=out.toDataURL();
    document.getElementById('img-preview').src=STATE.imageTool.result;
    const rc=document.getElementById('img-result-canvas');rc.width=out.width;rc.height=out.height;rc.getContext('2d').drawImage(out,0,0);
  });
}
function applyFilters(){
  const bright=document.getElementById('f-bright').value;
  const contrast=document.getElementById('f-contrast').value;
  const sat=document.getElementById('f-sat').value;
  getImageCanvas(STATE.imageTool.original,(c,img)=>{
    const out=document.createElement('canvas');out.width=img.width;out.height=img.height;
    const ctx=out.getContext('2d');ctx.filter=`brightness(${bright}%) contrast(${contrast}%) saturate(${sat}%)`;
    ctx.drawImage(img,0,0);
    STATE.imageTool.result=out.toDataURL();
    const rc=document.getElementById('img-result-canvas');rc.width=out.width;rc.height=out.height;rc.getContext('2d').drawImage(out,0,0);
  });
}
function applyFilterPreset(filter){
  getImageCanvas(STATE.imageTool.original,(c,img)=>{
    const out=document.createElement('canvas');out.width=img.width;out.height=img.height;
    const ctx=out.getContext('2d');ctx.filter=filter;ctx.drawImage(img,0,0);
    STATE.imageTool.result=out.toDataURL();
    const rc=document.getElementById('img-result-canvas');rc.width=out.width;rc.height=out.height;rc.getContext('2d').drawImage(out,0,0);
  });
}
function applyCompression(q){
  getImageCanvas(STATE.imageTool.original,(c)=>{
    const data=c.toDataURL('image/jpeg',parseFloat(q)/100);
    STATE.imageTool.result=data;
    const size=Math.round(data.length*0.75);
    const info=document.getElementById('compress-info');if(info)info.textContent=`~${formatBytes(size)} at ${q}% quality`;
    const rc=document.getElementById('img-result-canvas');rc.width=c.width;rc.height=c.height;rc.getContext('2d').drawImage(c,0,0);
  });
}
function applyImageConvert(){
  const fmt=document.getElementById('img-format').value;
  getImageCanvas(STATE.imageTool.original,(c)=>{
    const data=c.toDataURL(fmt,0.92);STATE.imageTool.result=data;
    const rc=document.getElementById('img-result-canvas');rc.width=c.width;rc.height=c.height;rc.getContext('2d').drawImage(c,0,0);
    toast(`Converted to ${fmt.split('/')[1].toUpperCase()} ✓`,'success');
  });
}
function downloadImageResult(){
  if(!STATE.imageTool.result){toast('No result yet','error');return;}
  const ext=STATE.imageTool.result.includes('image/png')?'.png':STATE.imageTool.result.includes('image/webp')?'.webp':'.jpg';
  const a=document.createElement('a');a.href=STATE.imageTool.result;a.download='nexmark-image'+ext;a.click();
}

// ══ PROMPT MAKER ══
const PM_OPT_LABELS=['Minimal','Light','Balanced','Enhanced','Maximum'];
const PM_TOKEN_LABELS=['Lean','Concise','Balanced','Detailed','Rich'];
function setupPromptMakerSliders(){
  const opt=document.getElementById('pm-opt-level');
  const tok=document.getElementById('pm-token-level');
  if(opt){opt.addEventListener('input',()=>{document.getElementById('pm-opt-label').textContent=PM_OPT_LABELS[opt.value-1];});document.getElementById('pm-opt-label').textContent=PM_OPT_LABELS[opt.value-1];}
  if(tok){tok.addEventListener('input',()=>{document.getElementById('pm-token-label').textContent=PM_TOKEN_LABELS[tok.value-1];});document.getElementById('pm-token-label').textContent=PM_TOKEN_LABELS[tok.value-1];}
}
function setPmToggle(key,val){
  STATE.pmOptions[key]=val;
  document.getElementById('pm-'+key+'-yes').classList.toggle('active',val);
  document.getElementById('pm-'+key+'-no').classList.toggle('active',!val);
}
async function generatePrompt(){
  const raw=document.getElementById('pm-raw-input').value.trim();
  if(!raw){toast('Enter your idea first','error');return;}
  const key=localStorage.getItem('nx_claude_key');
  if(!key){toast('Add your Claude API key in Settings first','error');return;}
  const optLevel=parseInt(document.getElementById('pm-opt-level').value);
  const tokenLevel=parseInt(document.getElementById('pm-token-level').value);
  const useCase=document.getElementById('pm-usecase').value;
  const format=document.getElementById('pm-format').value;
  const wantExamples=STATE.pmOptions.examples;
  const wantRole=STATE.pmOptions.role;
  const out=document.getElementById('pm-output');
  out.innerHTML='<div class="note-editor-placeholder" style="height:100%"><span>Generating…</span></div>';
  document.getElementById('pm-token-est').textContent='…';
  const systemPrompt=`You are an expert prompt engineer who creates highly optimised prompts for Claude and other LLMs. Your output must be ONLY the final refined prompt — no explanation, no preamble, no markdown code fences.

Optimization level: ${optLevel}/5 (${PM_OPT_LABELS[optLevel-1]})
Token budget: ${tokenLevel}/5 (${PM_TOKEN_LABELS[tokenLevel-1]})
Use case: ${useCase}
Output format requested: ${format}
Include examples: ${wantExamples}
Add role/persona prefix: ${wantRole}

Rules:
- Higher optimization = more structured, specific constraints, edge-case handling
- Lower token budget = shorter, tighter prompt; higher = richer context and examples
- If role=true, start with "You are a [relevant expert]…"
- If examples=true and token budget>=3, include 1-2 concise examples
- Match the use case: coding prompts use technical language; writing prompts specify tone/audience
- Remove all filler words; every token must earn its place
- End with a clear instruction or question`;
  try{
    const resp=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:800,system:systemPrompt,messages:[{role:'user',content:`Refine this raw idea into an optimised prompt:\n\n${raw}`}]})
    });
    if(!resp.ok){const err=await resp.json();toast('API error: '+(err.error?.message||resp.status),'error');out.innerHTML='<div style="color:var(--red);padding:20px">Error: '+esc(err.error?.message||'API call failed')+'</div>';return;}
    const data=await resp.json();
    const text=data.content[0].text;
    out.textContent=text;
    // Token estimate: ~4 chars per token
    const est=Math.ceil(text.length/4);
    document.getElementById('pm-token-est').textContent='~'+est+' tokens';
  }catch(e){toast('Network error','error');out.innerHTML='<div style="color:var(--red);padding:20px">Network error. Check your API key and connection.</div>';}
}
function copyPrompt(){
  const t=document.getElementById('pm-output').textContent;
  if(!t||t.includes('appear here'))return;
  navigator.clipboard.writeText(t).then(()=>toast('Prompt copied','success'));
}
function savePrompt(){
  const t=document.getElementById('pm-output').textContent;
  if(!t||t.includes('appear here')){toast('Generate a prompt first','error');return;}
  const raw=document.getElementById('pm-raw-input').value.trim().slice(0,60);
  STATE.savedPrompts.unshift({id:uid(),title:raw||'Prompt',text:t,createdAt:Date.now()});
  if(STATE.savedPrompts.length>50)STATE.savedPrompts.pop();
  ls_save(KEYS.savedPrompts,STATE.savedPrompts);
  renderSavedPrompts();toast('Prompt saved ✓','success');
}
function renderSavedPrompts(){
  const list=document.getElementById('pm-saved-list');if(!list)return;
  if(!STATE.savedPrompts.length){list.innerHTML='<div style="color:var(--text3);font-size:12px">No saved prompts yet.</div>';return;}
  list.innerHTML=STATE.savedPrompts.map(p=>`<div class="pm-saved-item" onclick="loadSavedPrompt('${p.id}')">
    <div class="pm-saved-item-title">${esc(p.title)}</div>
    <div class="pm-saved-item-date">${fmtDate(p.createdAt)}</div>
    <button class="card-action-btn del-btn" style="opacity:1;padding:2px 6px" onclick="event.stopPropagation();deleteSavedPrompt('${p.id}')">✕</button>
  </div>`).join('');
}
function loadSavedPrompt(id){
  const p=STATE.savedPrompts.find(p=>p.id===id);if(!p)return;
  document.getElementById('pm-output').textContent=p.text;
  document.getElementById('pm-token-est').textContent='~'+Math.ceil(p.text.length/4)+' tokens';
}
function deleteSavedPrompt(id){
  STATE.savedPrompts=STATE.savedPrompts.filter(p=>p.id!==id);
  ls_save(KEYS.savedPrompts,STATE.savedPrompts);renderSavedPrompts();
}

// ══ PRICE TRACKER ══
function setupPriceTabs(){
  document.querySelectorAll('#panel-pricetracker .bm-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      document.querySelectorAll('#panel-pricetracker .bm-tab').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('#panel-pricetracker .bm-tab-content').forEach(c=>c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('bm-tab-'+tab.dataset.tab).classList.add('active');
      if(tab.dataset.tab==='pt-compare')renderPriceCompare();
    });
  });
}
function openAddProductModal(){
  ['pt-name','pt-url','pt-price','pt-target','pt-category','pt-store','pt-notes'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('pt-currency').value='₹';
  openModal('product-modal');setTimeout(()=>document.getElementById('pt-name').focus(),100);
}
function saveProduct(){
  const name=document.getElementById('pt-name').value.trim();
  const price=parseFloat(document.getElementById('pt-price').value);
  if(!name){toast('Product name required','error');return;}
  if(isNaN(price)){toast('Enter current price','error');return;}
  const p={
    id:uid(),name,url:document.getElementById('pt-url').value.trim(),
    currency:document.getElementById('pt-currency').value,
    currentPrice:price,targetPrice:parseFloat(document.getElementById('pt-target').value)||null,
    category:document.getElementById('pt-category').value.trim(),
    store:document.getElementById('pt-store').value.trim(),
    notes:document.getElementById('pt-notes').value.trim(),
    priceHistory:[{price,date:new Date().toISOString().slice(0,10)}],
    createdAt:Date.now(),
  };
  STATE.products.unshift(p);
  ls_save(KEYS.products,STATE.products);
  renderProducts();closeModal('product-modal');toast('Product added ✓','success');
}
function updateProductPrice(id){
  const inp=document.getElementById('pp-'+id);if(!inp)return;
  const price=parseFloat(inp.value);if(isNaN(price))return;
  const i=STATE.products.findIndex(p=>p.id===id);if(i<0)return;
  STATE.products[i].currentPrice=price;
  STATE.products[i].priceHistory.push({price,date:new Date().toISOString().slice(0,10)});
  if(STATE.products[i].priceHistory.length>30)STATE.products[i].priceHistory.shift();
  // Check alert
  if(STATE.products[i].targetPrice&&price<=STATE.products[i].targetPrice){
    toast(`🎉 Price alert! "${STATE.products[i].name}" hit your target!`,'success');
    addNotification({id:uid(),type:'general',title:`Price drop: ${STATE.products[i].name}`,desc:`Now ${STATE.products[i].currency}${price} (target: ${STATE.products[i].currency}${STATE.products[i].targetPrice})`,time:new Date().toISOString(),read:false});
  }
  ls_save(KEYS.products,STATE.products);renderProducts();toast('Price updated ✓','success');
}
function deleteProduct(id){
  if(!confirm('Remove this product?'))return;
  STATE.products=STATE.products.filter(p=>p.id!==id);
  ls_save(KEYS.products,STATE.products);renderProducts();
}
function renderProducts(){
  const grid=document.getElementById('pt-grid'),empty=document.getElementById('pt-empty');
  if(!STATE.products.length){grid.innerHTML='';grid.style.display='none';empty.style.display='flex';return;}
  grid.style.display='grid';empty.style.display='none';
  grid.innerHTML=STATE.products.map(p=>{
    const alertFired=p.targetPrice&&p.currentPrice<=p.targetPrice;
    const hist=p.priceHistory||[];
    const allPrices=hist.map(h=>h.price);
    const pctChange=hist.length>1?((p.currentPrice-hist[0].price)/hist[0].price*100).toFixed(1):null;
    const chartData=encodeURIComponent(JSON.stringify(hist.slice(-20).map(h=>h.price)));
    const searchQ=encodeURIComponent(p.name);
    const platforms=[
      {name:'Amazon',icon:'🛒',url:'https://www.amazon.in/s?k='+searchQ},
      {name:'Flipkart',icon:'🏪',url:'https://www.flipkart.com/search?q='+searchQ},
      {name:'eBay',icon:'🔵',url:'https://www.ebay.com/sch/i.html?_nkw='+searchQ},
      {name:'Walmart',icon:'🟡',url:'https://www.walmart.com/search?q='+searchQ},
      {name:'AliExpress',icon:'🔴',url:'https://www.aliexpress.com/wholesale?SearchText='+searchQ},
    ];
    return '<div class="pt-card '+(alertFired?'alert-triggered':'')+'">'+
      '<div class="pt-card-header">'+
        '<div class="pt-product-icon">🏷️</div>'+
        '<div style="flex:1;min-width:0"><div class="pt-product-name">'+esc(p.name)+'</div><div class="pt-product-store">'+esc(p.store||p.category||'')+'</div></div>'+
        (p.url?'<a href="'+esc(p.url)+'" target="_blank" class="pt-source-link">↗</a>':'')+
      '</div>'+
      '<div class="pt-price-section">'+
        '<span class="pt-current-price">'+p.currency+p.currentPrice.toLocaleString()+'</span>'+
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">'+
          (p.targetPrice?'<span class="pt-target-price">target: '+p.currency+p.targetPrice.toLocaleString()+'</span>':'')+
          (alertFired?'<span class="pt-alert-badge">🎉 Target hit!</span>':'')+
          (pctChange!==null?'<span style="font-size:11px;color:'+(parseFloat(pctChange)<=0?'var(--green)':'var(--red)')+'">'+( parseFloat(pctChange)<=0?'↓':'↑')+' '+Math.abs(pctChange)+'% since tracking</span>':'')+
        '</div>'+
      '</div>'+
      (hist.length>1?'<div style="margin:8px 0;height:64px"><canvas class="pt-line-chart" id="chart-'+p.id+'" data-prices="'+chartData+'" data-currency="'+esc(p.currency)+'" style="width:100%;height:64px;display:block;border-radius:6px"></canvas></div>':'')+
      '<div class="pt-update-row">'+
        '<input type="number" class="goal-update-input" id="pp-'+p.id+'" value="'+p.currentPrice+'" placeholder="New price" step="any"/>'+
        '<button class="btn-primary btn-sm" onclick="updateProductPrice(\''+p.id+'\')">Update</button>'+
      '</div>'+
      '<div class="pt-platforms">'+
        platforms.map(function(pl){return'<a href="'+esc(pl.url)+'" target="_blank" class="pt-platform-btn">'+pl.icon+' '+esc(pl.name)+'</a>';}).join('')+
      '</div>'+
      '<div class="pt-card-actions">'+
        '<button class="card-action-btn" onclick="openReviewModal(\''+p.id+'\',\''+esc(p.name)+'\')">📊 Reviews</button>'+
        '<button class="card-action-btn del-btn" onclick="deleteProduct(\''+p.id+'\')">Remove</button>'+
      '</div>'+
    '</div>';
  }).join('');
  requestAnimationFrame(drawAllPriceCharts);
}

function drawAllPriceCharts(){
  document.querySelectorAll('.pt-line-chart').forEach(function(canvas){
    try{
      var prices=JSON.parse(decodeURIComponent(canvas.dataset.prices));
      var currency=canvas.dataset.currency||'';
      if(!prices||prices.length<2)return;
      var ctx=canvas.getContext('2d');
      var W=canvas.offsetWidth||280;var H=canvas.offsetHeight||64;
      canvas.width=W*2;canvas.height=H*2;ctx.scale(2,2);
      var maxP=Math.max.apply(null,prices);var minP=Math.min.apply(null,prices);
      var range=maxP===minP?maxP*0.1||1:maxP-minP;
      var pad={top:8,right:8,bottom:18,left:36};
      var cW=W-pad.left-pad.right;var cH=H-pad.top-pad.bottom;
      ctx.fillStyle='#161924';ctx.fillRect(0,0,W,H);
      ctx.strokeStyle='rgba(255,255,255,.06)';ctx.lineWidth=0.5;
      for(var i=0;i<=3;i++){var gy=pad.top+(cH/3)*i;ctx.beginPath();ctx.moveTo(pad.left,gy);ctx.lineTo(pad.left+cW,gy);ctx.stroke();}
      var pts=prices.map(function(price,idx){return{x:pad.left+(idx/(prices.length-1))*cW,y:pad.top+cH-(((price-minP)/range)*cH)};});
      var grad=ctx.createLinearGradient(0,pad.top,0,pad.top+cH);
      grad.addColorStop(0,'rgba(79,142,255,.35)');grad.addColorStop(1,'rgba(79,142,255,.02)');
      ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
      pts.forEach(function(p){ctx.lineTo(p.x,p.y);});
      ctx.lineTo(pts[pts.length-1].x,pad.top+cH);ctx.lineTo(pts[0].x,pad.top+cH);
      ctx.closePath();ctx.fillStyle=grad;ctx.fill();
      ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
      pts.forEach(function(p){ctx.lineTo(p.x,p.y);});
      ctx.strokeStyle='#4f8eff';ctx.lineWidth=2;ctx.lineJoin='round';ctx.stroke();
      ctx.beginPath();ctx.arc(pts[pts.length-1].x,pts[pts.length-1].y,3.5,0,Math.PI*2);ctx.fillStyle='#4f8eff';ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.5)';ctx.font='8px monospace';ctx.textAlign='left';
      ctx.fillText(currency+maxP.toLocaleString(),pad.left+2,pad.top+9);
      ctx.fillText(currency+minP.toLocaleString(),pad.left+2,pad.top+cH-3);
    }catch(e){}
  });
}

function renderPriceCompare(){
  var area=document.getElementById('pt-compare-area'),empty=document.getElementById('pt-compare-empty');
  if(STATE.products.length<2){area.innerHTML='';empty.style.display='flex';return;}
  empty.style.display='none';
  var minPrice=Math.min.apply(null,STATE.products.map(function(p){return p.currentPrice;}));
  area.innerHTML='<div style="overflow-x:auto;padding:16px"><table class="pt-compare-table"><thead><tr><th>Product</th><th>Store</th><th>Current</th><th>Lowest</th><th>Highest</th><th>Target</th><th>Chart</th><th>Compare on</th></tr></thead><tbody>'+
    STATE.products.map(function(p){
      var hist=p.priceHistory||[];
      var prices=hist.map(function(h){return h.price;});
      var lo=prices.length?Math.min.apply(null,prices):p.currentPrice;
      var hi=prices.length?Math.max.apply(null,prices):p.currentPrice;
      var searchQ=encodeURIComponent(p.name);
      return '<tr>'+
        '<td style="font-weight:700">'+esc(p.name)+(p.url?' <a href="'+esc(p.url)+'" target="_blank" style="color:var(--accent);font-size:11px">↗</a>':'' )+'</td>'+
        '<td>'+esc(p.store||'—')+'</td>'+
        '<td class="'+(p.currentPrice===minPrice?'best-price':'')+'" style="font-weight:700">'+p.currency+p.currentPrice.toLocaleString()+'</td>'+
        '<td style="color:var(--green)">'+p.currency+lo.toLocaleString()+'</td>'+
        '<td style="color:var(--red)">'+p.currency+hi.toLocaleString()+'</td>'+
        '<td>'+(p.targetPrice?p.currency+p.targetPrice.toLocaleString():'—')+'</td>'+
        '<td><canvas class="pt-line-chart" data-prices="'+encodeURIComponent(JSON.stringify(hist.slice(-12).map(function(h){return h.price;})))+'" data-currency="'+esc(p.currency)+'" style="width:120px;height:40px;display:block" width="120" height="40"></canvas></td>'+
        '<td><div style="display:flex;flex-direction:column;gap:3px">'+
          '<a href="https://www.amazon.in/s?k='+searchQ+'" target="_blank" class="pt-platform-btn" style="font-size:10px">🛒 Amazon</a>'+
          '<a href="https://www.flipkart.com/search?q='+searchQ+'" target="_blank" class="pt-platform-btn" style="font-size:10px">🏪 Flipkart</a>'+
          '<a href="https://www.ebay.com/sch/i.html?_nkw='+searchQ+'" target="_blank" class="pt-platform-btn" style="font-size:10px">🔵 eBay</a>'+
        '</div></td>'+
      '</tr>';
    }).join('')+'</tbody></table></div>';
  requestAnimationFrame(drawAllPriceCharts);
}

function openReviewModal(productId,productName){
  document.getElementById('review-product-name').textContent=productName;
  document.getElementById('review-input').value='';
  document.getElementById('review-result').innerHTML='';
  openModal('review-modal');
  window._reviewProductId=productId;
}

async function analyzeReviews(){
  var text=document.getElementById('review-input').value.trim();
  if(!text||text.length<20){toast('Paste some reviews to analyze','error');return;}
  var apiKey=localStorage.getItem('nx_claude_key')||'';
  var result=document.getElementById('review-result');
  if(!apiKey){result.innerHTML='<div style="color:var(--text3);font-size:13px;padding:10px 0">Set your Claude API key in Settings to enable AI analysis.</div>';return;}
  result.innerHTML='<div class="summary-loading"><span class="spin">⚙️</span> Analysing with Claude…</div>';
  try{
    var prompt='Analyse these product reviews and respond ONLY with valid JSON (no markdown):\n{"positive":85,"negative":10,"neutral":5,"summary":"2-sentence verdict","pros":["pro1","pro2","pro3"],"cons":["con1","con2"],"verdict":"Buy","keyThemes":["theme1","theme2"]}\nThe numbers must sum to 100.\nREVIEWS:\n'+text;
    var res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:500,messages:[{role:'user',content:prompt}]})});
    if(!res.ok)throw new Error('API '+res.status);
    var data=await res.json();
    var raw=data.content?.[0]?.text||'{}';
    var d=JSON.parse(raw.replace(/```json|```/g,'').trim());
    var verdictColor=d.verdict&&d.verdict.toLowerCase().includes('buy')?'var(--green)':d.verdict&&d.verdict.toLowerCase().includes('skip')?'var(--red)':'var(--yellow)';
    result.innerHTML=
      '<div class="review-verdict" style="color:'+verdictColor+'">Verdict: '+esc(d.verdict||'—')+'</div>'+
      '<div class="review-sentiment-bar">'+
        '<div class="rsb-pos" style="width:'+(d.positive||0)+'%" title="Positive">'+(d.positive||0)+'%</div>'+
        '<div class="rsb-neu" style="width:'+(d.neutral||0)+'%" title="Neutral">'+(d.neutral||0)+'%</div>'+
        '<div class="rsb-neg" style="width:'+(d.negative||0)+'%" title="Negative">'+(d.negative||0)+'%</div>'+
      '</div>'+
      '<div class="review-legend"><span class="rl-pos">● Positive '+(d.positive||0)+'%</span><span class="rl-neu">● Neutral '+(d.neutral||0)+'%</span><span class="rl-neg">● Negative '+(d.negative||0)+'%</span></div>'+
      '<p style="font-size:13px;color:var(--text2);line-height:1.6;margin:10px 0">'+esc(d.summary||'')+'</p>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">'+
        '<div><div style="font-size:11px;font-weight:700;color:var(--green);margin-bottom:6px">👍 PROS</div>'+((d.pros||[]).map(function(p){return'<div style="font-size:12px;color:var(--text2);margin-bottom:3px">• '+esc(p)+'</div>';}).join(''))+'</div>'+
        '<div><div style="font-size:11px;font-weight:700;color:var(--red);margin-bottom:6px">👎 CONS</div>'+((d.cons||[]).map(function(c){return'<div style="font-size:12px;color:var(--text2);margin-bottom:3px">• '+esc(c)+'</div>';}).join(''))+'</div>'+
      '</div>'+
      (d.keyThemes&&d.keyThemes.length?'<div style="margin-top:10px"><div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:6px">KEY THEMES</div><div style="display:flex;flex-wrap:wrap;gap:6px">'+d.keyThemes.map(function(t){return'<span style="background:var(--bg4);border:1px solid var(--border2);border-radius:12px;padding:3px 10px;font-size:11px">'+esc(t)+'</span>';}).join('')+'</div></div>':'');
  }catch(e){result.innerHTML='<div style="color:var(--red);font-size:13px">Analysis failed: '+esc(e.message)+'</div>';}
}

// ══ HELPERS ══
function downloadBlobFile(blob,name){const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);}
async function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);});}

// ══ openApp — unified ══
function openApp(name){
  if(name==='promptmaker')   { switchPanel('promptmaker'); return; }
  if(name==='pricetracker')  { switchPanel('pricetracker'); return; }
  if(name==='nexmeet')       { window.open('meet.html','_blank'); return; }
  if(name==='whiteboard')    { switchPanel('whiteboard'); return; }
  if(name==='todos')         { switchPanel('todos'); return; }
  if(name==='books')         { switchPanel('books'); return; }
  if(name==='filetools')     { switchPanel('filetools'); return; }
  if(name==='music')         { switchPanel('music'); return; }
  if(name==='articles')      { switchPanel('articles'); return; }
  if(name==='calendar')      { switchPanel('calendar'); return; }
  if(name==='presentations') { switchPanel('presentations'); return; }
  if(name==='emailgen')      { switchPanel('emailgen'); return; }
  switchPanel(name);
}

// ── Account nav ──
function handleAccountNav(){
  const user=localStorage.getItem('nx_session_user');
  if(user)switchPanel('settings');
  else window.location.href='login.html';
}

function appSignOut(){
  if(!confirm('Sign out?'))return;
  if(typeof SB!=='undefined'&&SB.client)SB.client.auth.signOut().catch(()=>{});
  localStorage.removeItem('nx_session_user');
  localStorage.removeItem('nx_offline_mode');
  window.location.href='login.html';
}

// Init Supabase + user pill on load
document.addEventListener('DOMContentLoaded', ()=>{
  const userJson=localStorage.getItem('nx_session_user');
  if(userJson){
    try{
      const u=JSON.parse(userJson);
      const pill=document.getElementById('sidebar-user-pill');
      const letter=document.getElementById('user-avatar-letter');
      const nameEl=document.getElementById('user-display-name');
      if(pill)pill.style.display='flex';
      if(letter)letter.textContent=(u.name||u.email||'?')[0].toUpperCase();
      if(nameEl)nameEl.textContent=u.name||u.email||'User';
    }catch(e){}
  }
  sbInit();
  const savedUrl=localStorage.getItem('nx_sb_url');
  const savedAnon=localStorage.getItem('nx_sb_anon');
  if(savedUrl){const el=document.getElementById('sb-url');if(el)el.value=savedUrl;}
  if(savedAnon){const el=document.getElementById('sb-anon');if(el)el.value=savedAnon;}
});

// ══════════════════════════════════════════════════
//  CALENDAR MODULE
// ══════════════════════════════════════════════════
const CAL = {
  today: new Date(),
  current: new Date(),   // month being viewed
  view: 'month',         // month | week | day | agenda
  events: [],            // {id,title,date,endDate,color,allDay,notes}
  holidays: {},          // {YYYY-MM-DD: [{name}]}
  region: 'IN',          // default India
  fetchingHolidays: false,
};

const CAL_COUNTRIES = [
  {code:'IN',name:'India'},{code:'US',name:'United States'},
  {code:'GB',name:'United Kingdom'},{code:'AU',name:'Australia'},
  {code:'CA',name:'Canada'},{code:'DE',name:'Germany'},
  {code:'FR',name:'France'},{code:'JP',name:'Japan'},
  {code:'SG',name:'Singapore'},{code:'AE',name:'UAE'},
  {code:'NZ',name:'New Zealand'},{code:'ZA',name:'South Africa'},
  {code:'BR',name:'Brazil'},{code:'MX',name:'Mexico'},
  {code:'NG',name:'Nigeria'},{code:'KE',name:'Kenya'},
  {code:'PK',name:'Pakistan'},{code:'BD',name:'Bangladesh'},
  {code:'LK',name:'Sri Lanka'},{code:'MY',name:'Malaysia'},
];

const CAL_COLORS = ['#7c6af7','#4f8eff','#22d3a0','#f0b429','#ff7043','#f06292','#38bdf8','#2ec49e'];

function initCalendar(){
  CAL.events = ls_load('nx_cal_events');
  CAL.region = localStorage.getItem('nx_cal_region')||'IN';
  CAL.current = new Date(CAL.today.getFullYear(), CAL.today.getMonth(), 1);
  fetchHolidays(CAL.today.getFullYear());
  renderCalendar();
}

async function fetchHolidays(year){
  const key = `${CAL.region}_${year}`;
  if(CAL.fetchingHolidays)return;
  const cached = localStorage.getItem('nx_holidays_'+key);
  if(cached){
    try{ const data=JSON.parse(cached); data.forEach(h=>{CAL.holidays[h.date]=CAL.holidays[h.date]||[];CAL.holidays[h.date].push(h);}); renderCalendar(); return; }
    catch(e){}
  }
  CAL.fetchingHolidays=true;
  try{
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${CAL.region}`);
    if(!res.ok)throw new Error('API error');
    const data = await res.json();
    data.forEach(h=>{CAL.holidays[h.date]=CAL.holidays[h.date]||[];CAL.holidays[h.date].push({name:h.name,localName:h.localName,type:'holiday'});});
    localStorage.setItem('nx_holidays_'+key, JSON.stringify(data));
    renderCalendar();
  }catch(e){ /* holidays unavailable - silently skip */ }
  finally{ CAL.fetchingHolidays=false; }
}

function renderCalendar(){
  const container = document.getElementById('cal-body');
  if(!container || !document.getElementById('panel-calendar')?.classList.contains('active'))return;
  const v = CAL.view;
  document.getElementById('cal-view-month').classList.toggle('active', v==='month');
  document.getElementById('cal-view-week').classList.toggle('active', v==='week');
  document.getElementById('cal-view-day').classList.toggle('active', v==='day');
  document.getElementById('cal-view-agenda').classList.toggle('active', v==='agenda');
  if(v==='month') renderCalMonth();
  else if(v==='week') renderCalWeek();
  else if(v==='day') renderCalDay();
  else renderCalAgenda();
}

function calFmt(d){ return d.toISOString().slice(0,10); }
function calTitle(){
  const d=CAL.current;
  if(CAL.view==='month') return d.toLocaleString('default',{month:'long',year:'numeric'});
  if(CAL.view==='week'){const w=calWeekStart(d);const e=new Date(w);e.setDate(e.getDate()+6);return w.toLocaleDateString('default',{month:'short',day:'numeric'})+' – '+e.toLocaleDateString('default',{month:'short',day:'numeric',year:'numeric'});}
  return d.toLocaleDateString('default',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
}

function calWeekStart(d){const dt=new Date(d);const day=dt.getDay();dt.setDate(dt.getDate()-day);return dt;}

function calNav(dir){
  const v=CAL.view;
  if(v==='month'){CAL.current.setMonth(CAL.current.getMonth()+dir);}
  else if(v==='week'){CAL.current.setDate(CAL.current.getDate()+dir*7);}
  else if(v==='day'){CAL.current.setDate(CAL.current.getDate()+dir);}
  else{CAL.current.setDate(CAL.current.getDate()+dir*30);}
  updateCalTitle();
  renderCalendar();
}

function calToday(){
  CAL.current=new Date(CAL.today.getFullYear(),CAL.today.getMonth(),1);
  if(CAL.view!=='month')CAL.current=new Date();
  updateCalTitle();
  renderCalendar();
}

function updateCalTitle(){
  const el=document.getElementById('cal-title');
  if(el)el.textContent=calTitle();
}

function setCalView(v){
  CAL.view=v;
  if(v==='week'||v==='day')CAL.current=new Date();
  updateCalTitle();
  renderCalendar();
}

function renderCalMonth(){
  updateCalTitle();
  const d=CAL.current;
  const y=d.getFullYear(),m=d.getMonth();
  const firstDay=new Date(y,m,1).getDay();
  const daysInMonth=new Date(y,m+1,0).getDate();
  const todayStr=calFmt(CAL.today);
  document.getElementById('cal-body').innerHTML=`
    <div class="cal-month-grid">
      <div class="cal-weekdays">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="cal-weekday">${d}</div>`).join('')}</div>
      <div class="cal-days" id="cal-days-grid"></div>
    </div>`;
  const grid=document.getElementById('cal-days-grid');
  let cells='';
  for(let i=0;i<firstDay;i++)cells+=`<div class="cal-day cal-day-empty"></div>`;
  for(let day=1;day<=daysInMonth;day++){
    const dateStr=`${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isToday=dateStr===todayStr;
    const events=CAL.events.filter(e=>e.date===dateStr||e.date===dateStr);
    const holidays=(CAL.holidays[dateStr]||[]);
    const isWeekend=((firstDay+day-1)%7===0||(firstDay+day-1)%7===6);
    cells+=`<div class="cal-day${isToday?' cal-today':''}${isWeekend?' cal-weekend':''}" onclick="calDayClick('${dateStr}')">
      <div class="cal-day-num${isToday?' today':''}">${day}</div>
      ${holidays.slice(0,2).map(h=>`<div class="cal-holiday-dot" title="${esc(h.name)}">🎉 ${esc(h.name.length>14?h.name.slice(0,14)+'…':h.name)}</div>`).join('')}
      ${events.slice(0,3).map(e=>`<div class="cal-event-pill" style="background:${e.color||'var(--accent)'}22;border-left:3px solid ${e.color||'var(--accent)'}" onclick="event.stopPropagation();openEditEventModal('${e.id}')">${esc(e.title.length>16?e.title.slice(0,16)+'…':e.title)}</div>`).join('')}
      ${events.length>3?`<div style="font-size:10px;color:var(--text3)">+${events.length-3} more</div>`:''}
    </div>`;
  }
  grid.innerHTML=cells;
}

function renderCalWeek(){
  updateCalTitle();
  const ws=calWeekStart(new Date(CAL.current));
  const days=[];
  for(let i=0;i<7;i++){const d=new Date(ws);d.setDate(d.getDate()+i);days.push(d);}
  const todayStr=calFmt(CAL.today);
  document.getElementById('cal-body').innerHTML=`
    <div class="cal-week-grid">
      <div class="cal-week-header">${days.map(d=>`<div class="cal-week-day-header${calFmt(d)===todayStr?' today':''}">
        <div class="cal-week-day-name">${d.toLocaleDateString('default',{weekday:'short'})}</div>
        <div class="cal-week-day-num${calFmt(d)===todayStr?' today':''}">${d.getDate()}</div>
      </div>`).join('')}</div>
      <div class="cal-week-body">${days.map(d=>{
        const ds=calFmt(d);
        const evs=CAL.events.filter(e=>e.date===ds);
        const hols=CAL.holidays[ds]||[];
        return `<div class="cal-week-col${calFmt(d)===todayStr?' today':''}" onclick="calDayClick('${ds}')">
          ${hols.map(h=>`<div class="cal-holiday-dot">🎉 ${esc(h.name)}</div>`).join('')}
          ${evs.map(e=>`<div class="cal-event-pill" style="background:${e.color||'var(--accent)'}22;border-left:3px solid ${e.color||'var(--accent)'}" onclick="event.stopPropagation();openEditEventModal('${e.id}')">${esc(e.title)}</div>`).join('')}
        </div>`;
      }).join('')}</div>
    </div>`;
}

function renderCalDay(){
  updateCalTitle();
  const ds=calFmt(CAL.current);
  const evs=CAL.events.filter(e=>e.date===ds);
  const hols=CAL.holidays[ds]||[];
  document.getElementById('cal-body').innerHTML=`
    <div class="cal-day-view">
      ${hols.map(h=>`<div class="cal-holiday-banner">🎉 ${esc(h.name)} ${h.localName&&h.localName!==h.name?'('+esc(h.localName)+')':''}</div>`).join('')}
      <div class="cal-day-events">
        ${evs.length?evs.map(e=>`
          <div class="cal-event-card" style="border-left:4px solid ${e.color||'var(--accent)'}">
            <div class="cal-event-card-title">${esc(e.title)}</div>
            ${e.notes?`<div class="cal-event-card-notes">${esc(e.notes)}</div>`:''}
            <div class="cal-event-card-actions">
              <button class="card-action-btn" onclick="openEditEventModal('${e.id}')">✎ Edit</button>
              <button class="card-action-btn del-btn" onclick="deleteCalEvent('${e.id}')">Delete</button>
            </div>
          </div>`).join('')
          :`<div class="cal-empty-day"><div style="font-size:40px">📅</div><p>No events today.</p><button class="btn-primary" style="margin-top:12px;width:auto;padding:8px 20px" onclick="openAddEventModal('${ds}')">+ Add Event</button></div>`}
      </div>
    </div>`;
}

function renderCalAgenda(){
  updateCalTitle();
  const today=new Date();
  const upcoming=CAL.events.filter(e=>e.date>=calFmt(today)).sort((a,b)=>a.date.localeCompare(b.date));
  document.getElementById('cal-body').innerHTML=`
    <div class="cal-agenda">
      ${upcoming.length?upcoming.map(e=>{
        const d=new Date(e.date+'T12:00:00');
        return `<div class="cal-agenda-row">
          <div class="cal-agenda-date">
            <div class="cal-agenda-day">${d.getDate()}</div>
            <div class="cal-agenda-mon">${d.toLocaleString('default',{month:'short'})}</div>
          </div>
          <div class="cal-event-card" style="border-left:4px solid ${e.color||'var(--accent)'};flex:1">
            <div class="cal-event-card-title">${esc(e.title)}</div>
            <div style="font-size:11px;color:var(--text3)">${d.toLocaleDateString('default',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
            ${e.notes?`<div class="cal-event-card-notes">${esc(e.notes)}</div>`:''}
            <div class="cal-event-card-actions">
              <button class="card-action-btn" onclick="openEditEventModal('${e.id}')">✎ Edit</button>
              <button class="card-action-btn del-btn" onclick="deleteCalEvent('${e.id}')">Delete</button>
            </div>
          </div>
        </div>`;
      }).join(''):`<div class="cal-empty-day"><div style="font-size:40px">🗓</div><p>No upcoming events.</p></div>`}
    </div>`;
}

function calDayClick(dateStr){
  CAL.current=new Date(dateStr+'T12:00:00');
  if(CAL.view==='month'){setCalView('day');}
  else openAddEventModal(dateStr);
}

// ── Event CRUD ──
function openAddEventModal(prefillDate){
  STATE.editIds.calEvent=null;
  const today=prefillDate||(()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`})();
  document.getElementById('cal-event-modal-title').textContent='New Event';
  document.getElementById('cal-event-title').value='';
  document.getElementById('cal-event-date').value=today;
  document.getElementById('cal-event-notes').value='';
  document.getElementById('cal-event-color').value=CAL_COLORS[0];
  openModal('cal-event-modal');
  setTimeout(()=>document.getElementById('cal-event-title').focus(),100);
}

function openEditEventModal(id){
  const ev=CAL.events.find(e=>e.id===id);if(!ev)return;
  STATE.editIds.calEvent=id;
  document.getElementById('cal-event-modal-title').textContent='Edit Event';
  document.getElementById('cal-event-title').value=ev.title;
  document.getElementById('cal-event-date').value=ev.date;
  document.getElementById('cal-event-notes').value=ev.notes||'';
  document.getElementById('cal-event-color').value=ev.color||CAL_COLORS[0];
  openModal('cal-event-modal');
}

function saveCalEvent(){
  const title=document.getElementById('cal-event-title').value.trim();
  const date=document.getElementById('cal-event-date').value;
  const notes=document.getElementById('cal-event-notes').value.trim();
  const color=document.getElementById('cal-event-color').value;
  if(!title){toast('Event title required','error');return;}
  if(!date){toast('Date required','error');return;}
  if(STATE.editIds.calEvent){
    const i=CAL.events.findIndex(e=>e.id===STATE.editIds.calEvent);
    if(i>=0)CAL.events[i]={...CAL.events[i],title,date,notes,color};
  } else {
    CAL.events.push({id:uid(),title,date,notes,color,createdAt:Date.now()});
  }
  ls_save('nx_cal_events',CAL.events);
  closeModal('cal-event-modal');
  renderCalendar();
  toast(STATE.editIds.calEvent?'Event updated ✓':'Event added ✓','success');
}

function deleteCalEvent(id){
  if(!confirm('Delete this event?'))return;
  CAL.events=CAL.events.filter(e=>e.id!==id);
  ls_save('nx_cal_events',CAL.events);
  renderCalendar();
  toast('Event deleted','info');
}

function setCalRegion(code){
  CAL.region=code;
  localStorage.setItem('nx_cal_region',code);
  CAL.holidays={};
  fetchHolidays(CAL.current.getFullYear());
  toast('Region updated — loading holidays…');
}

// ══════════════════════════════════════════════════
//  SUPABASE MULTI-DEVICE SYNC
// ══════════════════════════════════════════════════
const SB = {
  client: null,
  user: null,
  syncing: false,
  channel: null,
};

// All STATE keys to sync
const SYNC_KEYS = [
  'nx_bm','nx_notes','nx_cloud','nx_groups','nx_tlists','nx_titems','nx_tgroups',
  'nx_habits','nx_goals','nx_books','nx_wb','nx_prefs','nx_notifs','nx_reminders',
  'nx_music','nx_products','nx_prompts','nx_cal_events','nx_todo_templates',
  'nx_reader_bm','nx_reader_notes','nx_reader_annot','nx_reader_sticky',
];

async function sbInit(){
  const url=localStorage.getItem('nx_sb_url');
  const key=localStorage.getItem('nx_sb_anon');
  if(!url||!key)return;
  if(!window.supabase){await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js');}
  try{
    SB.client=supabase.createClient(url,key);
    const {data:{session}}=await SB.client.auth.getSession();
    if(session){
      SB.user=session.user;
      sbOnLogin();
    }
    SB.client.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_IN'){SB.user=session.user;sbOnLogin();}
      if(event==='SIGNED_OUT'){SB.user=null;sbOnLogout();}
    });
  }catch(e){console.warn('Supabase init failed:',e);}
}

async function sbOnLogin(){
  updateSyncUI();
  await sbPull();
  sbSubscribe();
  toast('Synced across devices ✓','success');
}

function sbOnLogout(){
  if(SB.channel){SB.client.removeChannel(SB.channel);SB.channel=null;}
  updateSyncUI();
}

async function sbPull(){
  if(!SB.client||!SB.user)return;
  try{
    const {data,error}=await SB.client.from('nx_sync').select('key,value,updated_at').eq('user_id',SB.user.id);
    if(error)throw error;
    if(!data||!data.length)return;
    // Last-write-wins: compare timestamps
    data.forEach(row=>{
      const localTs=parseInt(localStorage.getItem(row.key+'_ts')||'0');
      const remoteTs=new Date(row.updated_at).getTime();
      if(remoteTs>localTs){
        localStorage.setItem(row.key,row.value);
        localStorage.setItem(row.key+'_ts',remoteTs.toString());
      }
    });
    // Reload state from localStorage
    reloadAllState();
    reRenderAll();
  }catch(e){console.warn('Supabase pull failed:',e);}
}

async function sbPush(key,value){
  if(!SB.client||!SB.user)return;
  try{
    const ts=Date.now();
    localStorage.setItem(key+'_ts',ts.toString());
    await SB.client.from('nx_sync').upsert({
      user_id:SB.user.id,key,value:JSON.stringify(value),
      updated_at:new Date(ts).toISOString()
    },{onConflict:'user_id,key'});
  }catch(e){console.warn('Supabase push failed:',e);}
}

function sbSubscribe(){
  if(!SB.client||!SB.user)return;
  SB.channel=SB.client.channel('nx_sync_'+SB.user.id)
    .on('postgres_changes',{event:'*',schema:'public',table:'nx_sync',filter:`user_id=eq.${SB.user.id}`},
      payload=>{
        if(payload.new){
          const {key,value,updated_at}=payload.new;
          const localTs=parseInt(localStorage.getItem(key+'_ts')||'0');
          const remoteTs=new Date(updated_at).getTime();
          if(remoteTs>localTs){
            localStorage.setItem(key,value);
            localStorage.setItem(key+'_ts',remoteTs.toString());
            reloadKeyState(key);
          }
        }
      })
    .subscribe();
}

function reloadAllState(){
  STATE.bookmarks=ls_load(KEYS.bm);
  STATE.notes=ls_load(KEYS.notes);
  STATE.cloudFiles=ls_load(KEYS.cloud);
  STATE.groups=ls_load(KEYS.groups);
  STATE.todoLists=ls_load(KEYS.todoLists);
  STATE.todoItems=ls_load(KEYS.todoItems);
  STATE.todoGroups=ls_load(KEYS.todoGroups);
  STATE.habits=ls_load(KEYS.habits);
  STATE.goals=ls_load(KEYS.goals);
  STATE.books=ls_load(KEYS.books);
  STATE.notifications=ls_load(KEYS.notifications);
  STATE.reminders=ls_load(KEYS.reminders);
  STATE.musicTracks=ls_load(KEYS.music);
  STATE.products=ls_load(KEYS.products);
  STATE.savedPrompts=ls_load(KEYS.savedPrompts);
}

function reloadKeyState(key){
  const map={[KEYS.bm]:'bookmarks',[KEYS.notes]:'notes',[KEYS.cloud]:'cloudFiles',
    [KEYS.groups]:'groups',[KEYS.todoLists]:'todoLists',[KEYS.todoItems]:'todoItems',
    [KEYS.todoGroups]:'todoGroups',[KEYS.habits]:'habits',[KEYS.goals]:'goals',
    [KEYS.books]:'books',[KEYS.notifications]:'notifications',[KEYS.reminders]:'reminders',
    [KEYS.music]:'musicTracks',[KEYS.products]:'products',[KEYS.savedPrompts]:'savedPrompts'};
  const stateKey=map[key];
  if(stateKey)STATE[stateKey]=ls_load(key);
}

function reRenderAll(){
  renderBookmarks();renderGroups();renderTagsView();
  renderNotesList();renderCloud();renderTodoLists();renderTodoGroups();
  renderHabits();renderGoals();renderBooks();
  renderNotifications();renderMusicList();renderProducts();renderSavedPrompts();
  updateStats();
}

// ── Auth functions ──
async function sbSignUp(){
  const email=document.getElementById('sb-email').value.trim();
  const pass=document.getElementById('sb-password').value;
  if(!email||!pass){toast('Email and password required','error');return;}
  await ensureSBClient();
  if(!SB.client){return;}
  const {error}=await SB.client.auth.signUp({email,password:pass});
  if(error){toast('Sign-up failed: '+error.message,'error');return;}
  toast('Account created! Check email to confirm.','success');
}

async function sbSignIn(){
  const email=document.getElementById('sb-email').value.trim();
  const pass=document.getElementById('sb-password').value;
  if(!email||!pass){toast('Email and password required','error');return;}
  await ensureSBClient();
  if(!SB.client){return;}
  document.getElementById('sb-signin-btn').textContent='Signing in…';
  const {error}=await SB.client.auth.signInWithPassword({email,password:pass});
  document.getElementById('sb-signin-btn').textContent='Sign In';
  if(error){toast('Sign-in failed: '+error.message,'error');return;}
}

async function sbSignOut(){
  if(!SB.client)return;
  await SB.client.auth.signOut();
  toast('Signed out');
}

async function ensureSBClient(){
  if(SB.client)return;
  const url=document.getElementById('sb-url').value.trim();
  const key=document.getElementById('sb-anon').value.trim();
  if(!url||!key){toast('Enter your Supabase URL and Anon Key first','error');return;}
  localStorage.setItem('nx_sb_url',url);
  localStorage.setItem('nx_sb_anon',key);
  document.getElementById('sb-url').value=url;
  document.getElementById('sb-anon').value=key;
  if(!window.supabase){
    toast('Loading Supabase…');
    await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js');
  }
  SB.client=supabase.createClient(url,key);
}

function updateSyncUI(){
  const signedIn=!!SB.user;
  const authArea=document.getElementById('sb-auth-area');
  const userArea=document.getElementById('sb-user-area');
  const emailEl=document.getElementById('sb-user-email');
  if(authArea)authArea.style.display=signedIn?'none':'block';
  if(userArea)userArea.style.display=signedIn?'block':'none';
  if(emailEl&&SB.user)emailEl.textContent=SB.user.email;
}

// ── Push all local data on first sync ──
async function sbPushAll(){
  if(!SB.client||!SB.user)return;
  const promises=SYNC_KEYS.map(key=>{
    const val=localStorage.getItem(key);
    if(val)return sbPush(key,JSON.parse(val));
    return Promise.resolve();
  });
  await Promise.all(promises);
  toast('All data pushed to cloud ✓','success');
}

// ══════════════════════════════════════════════════
//  ARTICLES / NEWS MODULE
// ══════════════════════════════════════════════════
const NEWS = {
  feeds:{
    tech:[
      'https://feeds.feedburner.com/TechCrunch',
      'https://www.wired.com/feed/rss',
      'https://www.theverge.com/rss/index.xml',
    ],
    ai:[
      'https://feeds.feedburner.com/nvidiablog',
      'https://huggingface.co/blog/feed.xml',
      'https://openai.com/news/rss.xml',
    ],
    science:[
      'https://www.nasa.gov/rss/dyn/breaking_news.rss',
      'https://www.scientificamerican.com/feed/rss/',
      'https://feeds.nature.com/nature/rss/current',
    ],
    economy:[
      'https://feeds.bbci.co.uk/news/business/rss.xml',
      'https://www.economist.com/finance-and-economics/rss.xml',
      'https://feeds.reuters.com/reuters/businessNews',
    ],
    politics:[
      'https://feeds.bbci.co.uk/news/politics/rss.xml',
      'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml',
    ],
    world:[
      'https://feeds.bbci.co.uk/news/world/rss.xml',
      'https://feeds.reuters.com/Reuters/worldNews',
      'https://feeds.skynews.com/feeds/rss/world.xml',
    ],
  },
  activeCategory:'tech',
  articles:[],
  loading:false,
  savedArticles:[],
  searchQuery:'',
};

async function initNews(){
  NEWS.savedArticles=ls_load('nx_saved_articles');
  await fetchNews(NEWS.activeCategory);
}

async function fetchNews(category){
  if(NEWS.loading)return;
  NEWS.loading=true;
  NEWS.activeCategory=category;
  updateNewsCategoryUI();
  const grid=document.getElementById('news-grid');
  const empty=document.getElementById('news-empty');
  if(grid)grid.innerHTML=`<div class="news-loading"><div class="spin" style="font-size:28px">⚙️</div><p>Loading ${category} news…</p></div>`;
  if(empty)empty.style.display='none';

  const feeds=NEWS.feeds[category]||[];
  const RSS2JSON='https://api.rss2json.com/v1/api.json?count=10&rss_url=';
  let articles=[];

  // Fetch up to 2 feeds in parallel
  const results=await Promise.allSettled(
    feeds.slice(0,2).map(url=>fetch(RSS2JSON+encodeURIComponent(url)).then(r=>r.json()))
  );

  results.forEach(r=>{
    if(r.status==='fulfilled'&&r.value?.status==='ok'){
      (r.value.items||[]).forEach(item=>{
        articles.push({
          id:btoa(item.link||item.guid||Math.random()).slice(0,16),
          title:item.title||'',
          link:item.link||'#',
          pubDate:item.pubDate||'',
          thumbnail:item.thumbnail||item.enclosure?.link||'',
          description:item.description?.replace(/<[^>]+>/g,'').slice(0,160)||'',
          source:r.value.feed?.title||category,
          category,
        });
      });
    }
  });

  // Sort by date, dedup by link
  const seen=new Set();
  articles=articles.filter(a=>{if(seen.has(a.link))return false;seen.add(a.link);return true;});
  articles.sort((a,b)=>new Date(b.pubDate)-new Date(a.pubDate));
  NEWS.articles=articles;
  NEWS.loading=false;
  renderNewsGrid();
}

function renderNewsGrid(){
  const grid=document.getElementById('news-grid');
  if(!grid)return;
  const q=NEWS.searchQuery.toLowerCase();
  let arts=NEWS.articles;
  if(q)arts=arts.filter(a=>a.title.toLowerCase().includes(q)||a.description.toLowerCase().includes(q));
  if(!arts.length){
    grid.innerHTML='';
    const empty=document.getElementById('news-empty');
    if(empty){empty.style.display='flex';empty.querySelector('p').textContent=q?'No results for "'+q+'"':'No articles loaded.';}
    return;
  }
  const savedIds=new Set(NEWS.savedArticles.map(a=>a.id));
  grid.innerHTML=arts.map(a=>`
    <div class="news-card" onclick="window.open('${esc(a.link)}','_blank')">
      ${a.thumbnail?`<img class="news-img" src="${esc(a.thumbnail)}" alt="" onerror="this.style.display='none'" loading="lazy"/>`:'<div class="news-img-placeholder">📰</div>'}
      <div class="news-card-body">
        <div class="news-meta">
          <span class="news-source">${esc(a.source)}</span>
          <span class="news-date">${a.pubDate?new Date(a.pubDate).toLocaleDateString('default',{month:'short',day:'numeric'}):'—'}</span>
        </div>
        <div class="news-title">${esc(a.title)}</div>
        <div class="news-desc">${esc(a.description)}</div>
        <div class="news-card-actions" onclick="event.stopPropagation()">
          <button class="nb-action-btn" style="flex:none;padding:5px 12px;font-size:11px" onclick="toggleSaveArticle('${a.id}',${JSON.stringify(a).replace(/"/g,'&quot;')})">${savedIds.has(a.id)?'★ Saved':'☆ Save'}</button>
          <a class="nb-action-btn" style="flex:none;padding:5px 12px;font-size:11px;text-decoration:none;display:inline-block" href="${esc(a.link)}" target="_blank">Read →</a>
        </div>
      </div>
    </div>`).join('');
}

function toggleSaveArticle(id,article){
  const i=NEWS.savedArticles.findIndex(a=>a.id===id);
  if(i>=0)NEWS.savedArticles.splice(i,1);
  else NEWS.savedArticles.push(typeof article==='string'?JSON.parse(article):article);
  ls_save('nx_saved_articles',NEWS.savedArticles);
  renderNewsGrid();
}

function updateNewsCategoryUI(){
  document.querySelectorAll('.news-cat-btn').forEach(b=>{
    b.classList.toggle('active',b.dataset.cat===NEWS.activeCategory);
  });
}

function newsSearch(q){
  NEWS.searchQuery=q;
  renderNewsGrid();
}

function switchNewsTab(tab){
  document.querySelectorAll('[data-news-tab]').forEach(b=>b.classList.toggle('active',b.dataset.newsTab===tab));
  const grid=document.getElementById('news-grid');
  if(tab==='saved'){
    const savedIds=new Set(NEWS.savedArticles.map(a=>a.id));
    const old=NEWS.articles;
    NEWS.articles=NEWS.savedArticles;
    renderNewsGrid();
    NEWS.articles=old;
  } else {
    fetchNews(NEWS.activeCategory);
  }
}

// ══════════════════════════════════════════════════
//  PRESENTATION MAKER
// ══════════════════════════════════════════════════
const PPT = {
  slides: [],          // [{id,title,body,layout,bg,fg,accent}]
  activeIdx: -1,
  title: 'My Presentation',
};

const PPT_TEMPLATES = [
  {
    name:'Business Pitch',emoji:'💼',theme:{bg:'#0f172a',fg:'#f1f5f9',accent:'#3b82f6'},
    slides:[
      {title:'Company Name',body:'Tagline · Year Founded',layout:'title'},
      {title:'The Problem',body:'• Problem statement 1\n• Problem statement 2\n• Market pain point',layout:'bullets'},
      {title:'Our Solution',body:'Describe your product or service and how it solves the problem.',layout:'content'},
      {title:'Market Opportunity',body:'• Total Addressable Market: $X\n• Serviceable Market: $Y\n• Target Segment: Z',layout:'bullets'},
      {title:'Business Model',body:'How do you make money? Subscription, marketplace, SaaS, etc.',layout:'content'},
      {title:'Traction',body:'• Users: X\n• Revenue: $Y\n• Growth: Z% MoM',layout:'bullets'},
      {title:'The Team',body:'Founders and key team members with backgrounds',layout:'content'},
      {title:'Ask',body:'Raising $X for:\n• Use of funds 1\n• Use of funds 2\n• Timeline',layout:'bullets'},
    ]
  },
  {
    name:'Project Update',emoji:'📊',theme:{bg:'#1e293b',fg:'#e2e8f0',accent:'#10b981'},
    slides:[
      {title:'Project Status Update',body:'Team · Date · Version',layout:'title'},
      {title:'Executive Summary',body:'High-level overview of where the project stands.',layout:'content'},
      {title:'Progress This Week',body:'• Completed task 1\n• Completed task 2\n• In progress: task 3',layout:'bullets'},
      {title:'Key Metrics',body:'• Metric 1: value\n• Metric 2: value\n• Metric 3: value',layout:'bullets'},
      {title:'Risks & Blockers',body:'• Risk 1 and mitigation\n• Blocker and resolution path',layout:'bullets'},
      {title:'Next Steps',body:'• Action item 1 (Owner, Date)\n• Action item 2 (Owner, Date)',layout:'bullets'},
    ]
  },
  {
    name:'Academic / Research',emoji:'🔬',theme:{bg:'#ffffff',fg:'#1e293b',accent:'#7c3aed'},
    slides:[
      {title:'Research Title',body:'Author · Institution · Date',layout:'title'},
      {title:'Abstract',body:'Brief summary of the research question, methodology, and key findings.',layout:'content'},
      {title:'Background',body:'• Context and motivation\n• Prior work\n• Gap in knowledge',layout:'bullets'},
      {title:'Methodology',body:'Describe the research method, data collection, and analysis approach.',layout:'content'},
      {title:'Results',body:'Key findings and data summary.',layout:'content'},
      {title:'Discussion',body:'• Interpretation of results\n• Limitations\n• Implications',layout:'bullets'},
      {title:'Conclusion',body:'Summary of contributions and future directions.',layout:'content'},
      {title:'References',body:'List key citations here.',layout:'content'},
    ]
  },
  {
    name:'Product Launch',emoji:'🚀',theme:{bg:'#09090f',fg:'#e4e6f4',accent:'#f59e0b'},
    slides:[
      {title:'Introducing [Product]',body:'The future of [category]',layout:'title'},
      {title:'The Problem We Solve',body:'Pain point description that resonates with your audience.',layout:'content'},
      {title:'Key Features',body:'• Feature 1: benefit\n• Feature 2: benefit\n• Feature 3: benefit',layout:'bullets'},
      {title:'How It Works',body:'Step-by-step overview of the product experience.',layout:'content'},
      {title:'Pricing',body:'• Free tier: what\'s included\n• Pro: $X/mo\n• Enterprise: Custom',layout:'bullets'},
      {title:'Get Started',body:'Call to action, website, contact information.',layout:'content'},
    ]
  },
  {
    name:'Teaching / Lesson',emoji:'📚',theme:{bg:'#f8fafc',fg:'#0f172a',accent:'#0ea5e9'},
    slides:[
      {title:'Lesson Title',body:'Subject · Grade/Level · Date',layout:'title'},
      {title:'Learning Objectives',body:'• By end of lesson, students will be able to...\n• Objective 2\n• Objective 3',layout:'bullets'},
      {title:'Introduction',body:'Hook or warm-up to engage students.',layout:'content'},
      {title:'Core Concept',body:'Main teaching content goes here.',layout:'content'},
      {title:'Examples',body:'• Example 1\n• Example 2\n• Example 3',layout:'bullets'},
      {title:'Activity',body:'Description of the in-class activity or exercise.',layout:'content'},
      {title:'Summary & Homework',body:'• Key takeaways\n• Assignment due: [date]',layout:'bullets'},
    ]
  },
];

function initPresentations(){
  PPT.slides = ls_load('nx_ppt_slides');
  PPT.title = localStorage.getItem('nx_ppt_title')||'My Presentation';
  renderPPTTemplates();
  renderSlideList();
  if(PPT.slides.length) selectSlide(0);
}

function renderPPTTemplates(){
  const grid=document.getElementById('ppt-template-grid');if(!grid)return;
  grid.innerHTML=PPT_TEMPLATES.map((t,i)=>`
    <div class="ppt-template-card" onclick="applyPPTTemplate(${i})">
      <div class="ppt-tpl-emoji">${t.emoji}</div>
      <div class="ppt-tpl-name">${esc(t.name)}</div>
      <div class="ppt-tpl-count">${t.slides.length} slides</div>
      <div class="ppt-tpl-preview">
        ${t.slides.slice(0,3).map(s=>`<div class="ppt-tpl-slide" style="background:${t.theme.bg};border-color:${t.theme.accent}22"><div style="font-size:7px;font-weight:700;color:${t.theme.fg};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.title)}</div></div>`).join('')}
      </div>
    </div>`).join('');
}

function applyPPTTemplate(idx){
  const t=PPT_TEMPLATES[idx];if(!t)return;
  if(PPT.slides.length>0&&!confirm('Replace current slides with this template?'))return;
  PPT.slides=t.slides.map(s=>({
    id:uid(),
    title:s.title||'',body:s.body||'',layout:s.layout||'content',
    bg:t.theme.bg,fg:t.theme.fg,accent:t.theme.accent,
  }));
  PPT.title=t.name;
  ls_save('nx_ppt_slides',PPT.slides);
  localStorage.setItem('nx_ppt_title',PPT.title);
  renderSlideList();
  selectSlide(0);
  // Switch to editor tab
  document.querySelector('#panel-presentations .bm-tab[data-tab="ppt-editor"]')?.click();
  toast(`"${t.name}" template applied ✓`,'success');
}

function addNewSlide(){
  const slide={id:uid(),title:'New Slide',body:'',layout:'content',bg:'#0f1018',fg:'#e4e6f4',accent:'#4f8eff'};
  PPT.slides.push(slide);
  ls_save('nx_ppt_slides',PPT.slides);
  renderSlideList();
  selectSlide(PPT.slides.length-1);
}

function selectSlide(idx){
  PPT.activeIdx=idx;
  const slide=PPT.slides[idx];if(!slide)return;
  renderSlideList();
  // Populate form
  document.getElementById('ppt-slide-title').value=slide.title||'';
  document.getElementById('ppt-slide-body').value=slide.body||'';
  document.getElementById('ppt-slide-layout').value=slide.layout||'content';
  document.getElementById('ppt-slide-bg').value=slide.bg||'#0f1018';
  document.getElementById('ppt-slide-fg').value=slide.fg||'#e4e6f4';
  document.getElementById('ppt-slide-accent').value=slide.accent||'#4f8eff';
  document.getElementById('ppt-edit-form').style.display='block';
  renderCurrentSlidePreview();
}

function renderSlideList(){
  const list=document.getElementById('ppt-slide-list');if(!list)return;
  if(!PPT.slides.length){
    list.innerHTML='<div style="padding:16px;color:var(--text3);font-size:12px;text-align:center">No slides yet</div>';
    return;
  }
  list.innerHTML=PPT.slides.map((s,i)=>`
    <div class="ppt-slide-thumb${i===PPT.activeIdx?' active':''}" onclick="selectSlide(${i})" style="background:${s.bg||'#0f1018'}">
      <div class="ppt-thumb-num">${i+1}</div>
      <div style="font-size:8px;font-weight:700;color:${s.fg||'#e4e6f4'};overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(s.title||'Untitled')}</div>
      <div style="position:absolute;top:3px;right:3px;width:6px;height:6px;border-radius:50%;background:${s.accent||'#4f8eff'}"></div>
    </div>`).join('');
}

function renderCurrentSlidePreview(){
  const preview=document.getElementById('ppt-slide-preview');if(!preview)return;
  const s=PPT.slides[PPT.activeIdx];if(!s){preview.innerHTML='<div class="ppt-empty-state"><div style="font-size:48px">🎞️</div><p>No slide selected</p></div>';return;}
  preview.innerHTML=buildSlideHTML(s,true);
}

function updateSlidePreview(){
  const s=PPT.slides[PPT.activeIdx];if(!s)return;
  // Live update from form values without saving
  const tmp={...s,
    title:document.getElementById('ppt-slide-title').value,
    body:document.getElementById('ppt-slide-body').value,
    layout:document.getElementById('ppt-slide-layout').value,
    bg:document.getElementById('ppt-slide-bg').value,
    fg:document.getElementById('ppt-slide-fg').value,
    accent:document.getElementById('ppt-slide-accent').value,
  };
  const preview=document.getElementById('ppt-slide-preview');
  if(preview)preview.innerHTML=buildSlideHTML(tmp,true);
}

function buildSlideHTML(s,preview=false){
  const {title='',body='',layout='content',bg='#0f1018',fg='#e4e6f4',accent='#4f8eff'}=s;
  const isBullets=layout==='bullets'||body.trim().startsWith('•');
  const bodyLines=body.split('\n').filter(l=>l.trim());
  const bodyHTML=isBullets
    ?'<ul style="margin:0;padding-left:20px;list-style:none">'+(bodyLines.map(l=>`<li style="margin-bottom:6px;display:flex;align-items:flex-start;gap:8px"><span style="color:${accent};flex-shrink:0">▸</span><span>${esc(l.replace(/^[•\-\*]\s*/,''))}</span></li>`).join(''))+'</ul>'
    :`<p style="line-height:1.6">${esc(body).replace(/\n/g,'<br/>')}</p>`;

  if(layout==='title'){
    return `<div class="ppt-slide-render" style="background:${bg};color:${fg};justify-content:center;align-items:center;text-align:center">
      <div style="border-bottom:3px solid ${accent};padding-bottom:12px;margin-bottom:16px;width:60%"></div>
      <h1 style="font-size:${preview?'32px':'2.4em'};font-weight:800;letter-spacing:-.5px;margin-bottom:12px;line-height:1.2">${esc(title)}</h1>
      <p style="font-size:${preview?'14px':'1em'};color:${fg}99;line-height:1.5">${esc(body)}</p>
      <div style="border-top:3px solid ${accent};margin-top:16px;padding-top:12px;width:60%"></div>
    </div>`;
  }
  if(layout==='two-col'){
    const mid=Math.ceil(bodyLines.length/2);
    const col1=bodyLines.slice(0,mid);const col2=bodyLines.slice(mid);
    return `<div class="ppt-slide-render" style="background:${bg};color:${fg}">
      <h2 style="font-size:${preview?'20px':'1.6em'};font-weight:800;margin-bottom:16px;border-bottom:2px solid ${accent};padding-bottom:8px">${esc(title)}</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;flex:1">
        <div>${col1.map(l=>`<div style="margin-bottom:8px;display:flex;gap:8px"><span style="color:${accent}">▸</span><span>${esc(l.replace(/^[•\-\*]\s*/,''))}</span></div>`).join('')}</div>
        <div>${col2.map(l=>`<div style="margin-bottom:8px;display:flex;gap:8px"><span style="color:${accent}">▸</span><span>${esc(l.replace(/^[•\-\*]\s*/,''))}</span></div>`).join('')}</div>
      </div>
    </div>`;
  }
  return `<div class="ppt-slide-render" style="background:${bg};color:${fg}">
    <h2 style="font-size:${preview?'20px':'1.6em'};font-weight:800;margin-bottom:16px;border-bottom:2px solid ${accent};padding-bottom:8px">${esc(title)}</h2>
    <div style="font-size:${preview?'13px':'1em'};flex:1;overflow:hidden">${bodyHTML}</div>
  </div>`;
}

function saveCurrentSlide(){
  if(PPT.activeIdx<0)return;
  PPT.slides[PPT.activeIdx]={
    ...PPT.slides[PPT.activeIdx],
    title:document.getElementById('ppt-slide-title').value,
    body:document.getElementById('ppt-slide-body').value,
    layout:document.getElementById('ppt-slide-layout').value,
    bg:document.getElementById('ppt-slide-bg').value,
    fg:document.getElementById('ppt-slide-fg').value,
    accent:document.getElementById('ppt-slide-accent').value,
  };
  ls_save('nx_ppt_slides',PPT.slides);
  renderSlideList();
  toast('Slide saved ✓','success');
}

function duplicateCurrentSlide(){
  if(PPT.activeIdx<0)return;
  const copy={...PPT.slides[PPT.activeIdx],id:uid()};
  PPT.slides.splice(PPT.activeIdx+1,0,copy);
  ls_save('nx_ppt_slides',PPT.slides);
  selectSlide(PPT.activeIdx+1);
  toast('Slide duplicated','success');
}

function deleteCurrentSlide(){
  if(PPT.activeIdx<0)return;
  if(!confirm('Delete this slide?'))return;
  PPT.slides.splice(PPT.activeIdx,1);
  ls_save('nx_ppt_slides',PPT.slides);
  const newIdx=Math.min(PPT.activeIdx,PPT.slides.length-1);
  renderSlideList();
  if(PPT.slides.length)selectSlide(newIdx);
  else{document.getElementById('ppt-edit-form').style.display='none';renderCurrentSlidePreview();}
}

// ── AI Slide Generation ──
function openAISlideModal(){openModal('ai-slide-modal');}

async function generateAISlides(){
  const topic=document.getElementById('ai-slide-topic').value.trim();
  const count=parseInt(document.getElementById('ai-slide-count').value)||8;
  const audience=document.getElementById('ai-slide-audience').value.trim();
  const context=document.getElementById('ai-slide-context').value.trim();
  if(!topic){toast('Enter a presentation topic','error');return;}
  const apiKey=localStorage.getItem('nx_claude_key')||'';
  if(!apiKey){toast('Set your Claude API key in Settings','error');return;}
  const status=document.getElementById('ai-slide-status');
  status.innerHTML='<span class="spin">⚙️</span> Generating '+count+' slides…';
  document.querySelector('#ai-slide-modal .btn-primary').disabled=true;
  try{
    const prompt=`Create a ${count}-slide presentation on: "${topic}"
Audience: ${audience||'General'}
${context?'Additional context: '+context:''}

Respond ONLY with valid JSON array (no markdown):
[{"title":"Slide Title","body":"Content here. For bullets use • prefix per line","layout":"title|content|bullets|two-col"},...]

Rules:
- First slide layout must be "title" 
- Mix layouts for variety
- Keep body concise but informative
- Bullet items start with •
- Return exactly ${count} slides`;
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:2000,messages:[{role:'user',content:prompt}]})
    });
    if(!res.ok)throw new Error('API error '+res.status);
    const data=await res.json();
    const raw=data.content?.[0]?.text||'[]';
    const slides=JSON.parse(raw.replace(/```json|```/g,'').trim());
    // Apply with default theme
    PPT.slides=slides.map(s=>({id:uid(),title:s.title||'',body:s.body||'',layout:s.layout||'content',bg:'#09090f',fg:'#e4e6f4',accent:'#4f8eff'}));
    PPT.title=topic;
    ls_save('nx_ppt_slides',PPT.slides);
    localStorage.setItem('nx_ppt_title',topic);
    closeModal('ai-slide-modal');
    renderSlideList();
    selectSlide(0);
    document.querySelector('#panel-presentations .bm-tab[data-tab="ppt-editor"]')?.click();
    toast(`${PPT.slides.length} slides generated ✓`,'success');
  }catch(e){status.innerHTML='<span style="color:var(--red)">Error: '+esc(e.message)+'</span>';}
  finally{document.querySelector('#ai-slide-modal .btn-primary').disabled=false;}
}

// ── Export .pptx ──
async function exportPptx(){
  if(!PPT.slides.length){toast('Add at least one slide first','error');return;}
  if(!window.PptxGenJS){
    toast('Loading PptxGenJS…');
    await loadScript('https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js');
  }
  try{
    const pptx=new PptxGenJS();
    pptx.layout='LAYOUT_WIDE';
    pptx.title=PPT.title||'Presentation';
    PPT.slides.forEach(s=>{
      const slide=pptx.addSlide();
      const bg=(s.bg||'#0f1018').replace('#','');
      const fg=(s.fg||'e4e6f4').replace('#','');
      const acc=(s.accent||'4f8eff').replace('#','');
      slide.background={color:bg};
      if(s.layout==='title'){
        slide.addText(s.title||'',{x:1,y:2.5,w:8,h:1.5,fontSize:36,bold:true,color:fg,align:'center'});
        if(s.body)slide.addText(s.body,{x:1.5,y:4.2,w:7,h:1,fontSize:16,color:fg+'99',align:'center'});
        slide.addShape('rect',{x:2.5,y:2.3,w:5,h:0.05,fill:{color:acc}});
        slide.addShape('rect',{x:2.5,y:4.1,w:5,h:0.05,fill:{color:acc}});
      } else {
        slide.addText(s.title||'',{x:0.5,y:0.3,w:9,h:0.8,fontSize:24,bold:true,color:fg});
        slide.addShape('rect',{x:0.5,y:1.1,w:9,h:0.04,fill:{color:acc}});
        const bodyLines=(s.body||'').split('\n').filter(l=>l.trim());
        const isBullets=s.layout==='bullets'||bodyLines.some(l=>l.trim().startsWith('•'));
        if(isBullets){
          const bulletItems=bodyLines.map(l=>({text:l.replace(/^[•\-\*]\s*/,'').trim(),options:{bullet:{type:'bullet'},color:fg,fontSize:14}}));
          if(bulletItems.length)slide.addText(bulletItems,{x:0.6,y:1.3,w:8.8,h:4.5,valign:'top'});
        } else {
          if(s.body)slide.addText(s.body,{x:0.5,y:1.3,w:9,h:4.5,fontSize:14,color:fg,valign:'top',breakLine:true});
        }
      }
    });
    const name=(PPT.title||'presentation').replace(/[^a-z0-9]/gi,'_');
    await pptx.writeFile({fileName:name+'.pptx'});
    toast('Exported '+name+'.pptx ✓','success');
  }catch(e){toast('Export failed: '+e.message,'error');}
}

// ══════════════════════════════════════════════════
//  EMAIL GENERATOR
// ══════════════════════════════════════════════════
const EMAIL_SAVED = [];

async function generateEmail(){
  const type=document.getElementById('email-type').value;
  const tone=document.querySelector('input[name="email-tone"]:checked')?.value||'formal';
  const recipient=document.getElementById('email-recipient').value.trim();
  const sender=document.getElementById('email-sender').value.trim();
  const points=document.getElementById('email-points').value.trim();
  const length=document.getElementById('email-length').value;
  if(!points){toast('Enter the key points you want to convey','error');return;}
  const apiKey=localStorage.getItem('nx_claude_key')||'';
  if(!apiKey){toast('Set your Claude API key in Settings first','error');return;}
  const outputArea=document.getElementById('email-output-area');
  outputArea.innerHTML='<div class="summary-loading"><span class="spin">⚙️</span> Generating email…</div>';
  const typeLbls={request:'professional request',followup:'follow-up',complaint:'complaint',apology:'apology',introduction:'introduction',proposal:'business proposal',decline:'polite decline',appreciation:'appreciation/thanks',inquiry:'inquiry',resignation:'resignation letter',cover:'cover letter',custom:'email'};
  const lengthGuide={short:'2-3 short paragraphs',medium:'3-5 paragraphs',long:'5 or more detailed paragraphs'};
  try{
    const prompt=`Write a ${tone} ${typeLbls[type]||'email'}${recipient?' to a '+recipient:''}.
${sender?'From: '+sender:''}
Length: ${lengthGuide[length]||'medium length'}

Key points to convey:
${points}

Format your response EXACTLY as:
SUBJECT: [subject line]

[email body]

Rules:
- Match the exact tone: ${tone}
- Include a proper greeting and sign-off
- Be clear, concise, and professional
- Do NOT add any explanation or commentary outside the email
- The email should feel natural and human`;
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1200,messages:[{role:'user',content:prompt}]})
    });
    if(!res.ok)throw new Error('API '+res.status);
    const data=await res.json();
    const text=data.content?.[0]?.text||'';
    // Parse subject and body
    const subjectMatch=text.match(/^SUBJECT:\s*(.+)$/im);
    const subject=subjectMatch?subjectMatch[1].trim():'';
    const body=text.replace(/^SUBJECT:.*\n/im,'').trim();
    outputArea.innerHTML=`
      <div class="email-output">
        <div class="email-output-header">
          <div class="email-subject-row">
            <span class="email-subject-label">Subject:</span>
            <span id="email-subj-text" class="email-subject-value">${esc(subject)}</span>
          </div>
          <div class="email-output-actions">
            <button class="nb-action-btn" style="padding:6px 12px" onclick="copyEmail()">📋 Copy All</button>
            <button class="nb-action-btn" style="padding:6px 12px" onclick="copySubject()">Copy Subject</button>
            <button class="nb-action-btn" style="padding:6px 12px" onclick="copyBody()">Copy Body</button>
            <button class="nb-action-btn" style="padding:6px 12px" onclick="regenerateEmail()">↺ Regenerate</button>
            <button class="nb-action-btn" style="padding:6px 12px" onclick="saveEmailDraft()">★ Save Draft</button>
          </div>
        </div>
        <div class="email-body-display">
          <pre id="email-body-text" style="font-family:inherit;white-space:pre-wrap;margin:0;font-size:14px;line-height:1.7;color:var(--text2)">${esc(body)}</pre>
        </div>
        <div id="email-saved-drafts" style="margin-top:14px"></div>
      </div>`;
    window._lastEmailSubject=subject;
    window._lastEmailBody=body;
    renderEmailDrafts();
  }catch(e){
    outputArea.innerHTML=`<div style="color:var(--red);padding:20px;font-size:13px">Failed: ${esc(e.message)}</div>`;
  }
}

function copyEmail(){
  const s=window._lastEmailSubject||'';const b=window._lastEmailBody||'';
  navigator.clipboard?.writeText((s?'Subject: '+s+'\n\n':'')+b).then(()=>toast('Email copied ✓','success')).catch(()=>toast('Copy failed','error'));
}
function copySubject(){navigator.clipboard?.writeText(window._lastEmailSubject||'').then(()=>toast('Subject copied','success'));}
function copyBody(){navigator.clipboard?.writeText(window._lastEmailBody||'').then(()=>toast('Body copied','success'));}
function regenerateEmail(){generateEmail();}

function saveEmailDraft(){
  const s=window._lastEmailSubject||'(No subject)';const b=window._lastEmailBody||'';
  if(!b){toast('No email to save','error');return;}
  const drafts=ls_load('nx_email_drafts');
  drafts.unshift({id:uid(),subject:s,body:b,savedAt:new Date().toISOString()});
  ls_save('nx_email_drafts',drafts.slice(0,20));
  renderEmailDrafts();
  toast('Draft saved ✓','success');
}

function renderEmailDrafts(){
  const drafts=ls_load('nx_email_drafts');
  const cont=document.getElementById('email-saved-drafts');if(!cont)return;
  if(!drafts.length){cont.innerHTML='';return;}
  cont.innerHTML=`<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Saved Drafts</div>`+
    drafts.slice(0,5).map((d,i)=>`<div class="email-draft-row">
      <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.subject)}</div><div style="font-size:10px;color:var(--text3)">${new Date(d.savedAt).toLocaleDateString()}</div></div>
      <div style="display:flex;gap:4px">
        <button class="card-action-btn" style="padding:3px 8px;font-size:11px" onclick="loadEmailDraft(${i})">Load</button>
        <button class="card-action-btn del-btn" style="padding:3px 8px;font-size:11px" onclick="deleteEmailDraft(${i})">✕</button>
      </div>
    </div>`).join('');
}

function loadEmailDraft(i){
  const drafts=ls_load('nx_email_drafts');const d=drafts[i];if(!d)return;
  window._lastEmailSubject=d.subject;window._lastEmailBody=d.body;
  document.getElementById('email-output-area').innerHTML=`
    <div class="email-output">
      <div class="email-output-header">
        <div class="email-subject-row"><span class="email-subject-label">Subject:</span><span id="email-subj-text" class="email-subject-value">${esc(d.subject)}</span></div>
        <div class="email-output-actions">
          <button class="nb-action-btn" style="padding:6px 12px" onclick="copyEmail()">📋 Copy All</button>
        </div>
      </div>
      <div class="email-body-display"><pre style="font-family:inherit;white-space:pre-wrap;margin:0;font-size:14px;line-height:1.7;color:var(--text2)">${esc(d.body)}</pre></div>
    </div>`;
}

function deleteEmailDraft(i){
  const drafts=ls_load('nx_email_drafts');drafts.splice(i,1);
  ls_save('nx_email_drafts',drafts);renderEmailDrafts();
}
