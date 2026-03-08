/* ======== Organiza Pro (Front-only) ======== */
/* 100% en localStorage — sin servidores ni Node */

/* Estructuras:
 - Task: { id, title, details, color, priority, createdAt, dates:[YMD], recurrence:{type, dom?, dow?, start?, until?}, doneOccurrences:{YMD:true}, deletedAt? }
 - Note: { id, title, details, color, priority, createdAt, done:boolean, deletedAt? }
*/

// ---- Utilidades de fecha ----
const MX_LOCALE = 'es-MX';
const WEEK_DAYS_MON_FIRST = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const pad2 = n => String(n).padStart(2, '0');
const toYMD = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const fromYMD = (s) => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); d.setHours(0,0,0,0); return d; };
const isSameYMD = (a,b) => toYMD(a) === toYMD(b);

function getCalendarMatrix(year, month /* 0-11 */) {
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekDayJS = firstOfMonth.getDay(); // 0=Dom..6=Sáb
  const mondayIndex = (firstWeekDayJS + 6) % 7; // Lunes=0
  const start = addDays(firstOfMonth, -mondayIndex);
  const cells = [];
  for (let i=0; i<42; i++) cells.push(addDays(start, i));
  return cells;
}

// ---- Storage ----
const STORAGE_KEYS = { tasks: 'om_tasks_v3', settings: 'om_settings_v2', notes: 'om_notes_v1' };
function loadTasks() { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.tasks)) || []; } catch { return []; } }
function saveTasks(tasks) { localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks)); }
function loadSettings() { const d = { autoClean: true, retentionDays: 30, theme: 'light' }; try { return { ...d, ...(JSON.parse(localStorage.getItem(STORAGE_KEYS.settings))||{}) }; } catch { return d; } }
function saveSettings(s) { localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(s)); }
function loadNotes() { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.notes)) || []; } catch { return []; } }
function saveNotes(notes) { localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(notes)); }

// ---- Estado ----
let state = {
  currentMonth: (() => { const d = today(); return new Date(d.getFullYear(), d.getMonth(), 1); })(),
  tasks: loadTasks(),
  notes: loadNotes(),
  settings: loadSettings(),
  filterDate: null,
  calendarPickMode: false,
  searchText: ''
};

// ---- Recurrencia ----
function appliesRecurrenceOnDate(rule, dateObj, sampleDateForYearly) {
  if (!rule || rule.type === 'none') return false;
  const ymd = toYMD(dateObj);
  if (rule.start && ymd < rule.start) return false;
  if (rule.until && ymd > rule.until) return false;
  if (rule.type === 'monthly') { const dom = Number(rule.dom || 1); return dateObj.getDate() === dom; }
  if (rule.type === 'weekly') { return dateObj.getDay() === Number(rule.dow ?? 1); }
  if (rule.type === 'yearly') { const base = sampleDateForYearly ? fromYMD(sampleDateForYearly) : dateObj; return (dateObj.getMonth() === base.getMonth()) && (dateObj.getDate() === base.getDate()); }
  return false;
}

function getOccurrencesForDate(tasks, dateObj) {
  const ymd = toYMD(dateObj);
  const res = [];
  for (const t of tasks) {
    if (t.deletedAt) continue;
    let hit = false;
    if (Array.isArray(t.dates) && t.dates.includes(ymd)) hit = true;
    if (!hit && t.recurrence && t.recurrence.type !== 'none') {
      const sample = (t.dates && t.dates.length>0) ? t.dates[0] : (t.recurrence.start || toYMD(new Date(t.createdAt)));
      if (appliesRecurrenceOnDate(t.recurrence, dateObj, sample)) hit = true;
    }
    if (hit) res.push({ task: t, date: ymd, done: !!(t.doneOccurrences && t.doneOccurrences[ymd]) });
  }
  return res.sort((a,b) => { const p=v=>v==='alta'?0:(v==='media'?1:2); return p(a.task.priority)-p(b.task.priority); });
}

// ---- Búsqueda ----
function matchesSearch(item, q) { if (!q) return true; const hay=((item.title||'')+' '+(item.details||'')).toLowerCase(); return hay.includes(q); }

// ---- Render Calendario ----
function renderCalendar() {
  const grid = document.getElementById('calendarGrid'); grid.innerHTML='';
  for (const wd of WEEK_DAYS_MON_FIRST) { const hd=document.createElement('div'); hd.className='calendar-weekday'; hd.textContent=wd; grid.appendChild(hd); }
  const year = state.currentMonth.getFullYear(); const month = state.currentMonth.getMonth(); const cells=getCalendarMatrix(year,month);
  const title = document.getElementById('calendarTitle'); const fmt=new Intl.DateTimeFormat(MX_LOCALE,{month:'long',year:'numeric'}); title.textContent=fmt.format(state.currentMonth).replace(/^\w/,c=>c.toUpperCase());
  const todayDate=today(); const currentMonthIndex=state.currentMonth.getMonth();
  for (const d of cells) {
    const isOutMonth=d.getMonth()!==currentMonthIndex; const isToday=isSameYMD(d,todayDate); const ymd=toYMD(d);
    const cell=document.createElement('div'); cell.className='calendar-cell'; if(isOutMonth)cell.classList.add('out-month'); if(isToday)cell.classList.add('today'); if(state.filterDate===ymd)cell.classList.add('selected');
    const badge=document.createElement('div'); badge.className='date-badge'; badge.textContent=d.getDate();
    const occWrap=document.createElement('div'); occWrap.className='mt-2';
    const occ=getOccurrencesForDate(state.tasks,d); occ.slice(0,3).forEach(o=>{ const dot=document.createElement('span'); dot.className='occurrence-dot'; dot.title=o.task.title; dot.style.background=o.task.color||'#0d6efd'; occWrap.appendChild(dot); });
    if(occ.length>3){ const extra=document.createElement('span'); extra.className='small text-muted'; extra.textContent=`+${occ.length-3}`; occWrap.appendChild(extra); }
    cell.appendChild(badge); cell.appendChild(occWrap);
    cell.addEventListener('click',()=>{ if(state.calendarPickMode){ addFechaToModal(ymd); } else { state.filterDate=(state.filterDate===ymd)?null:ymd; renderTasks(); renderCalendar(); } });
    grid.appendChild(cell);
  }
}

// ---- Render Lista de Tareas ----
function renderTasks() {
  const container=document.getElementById('taskLists');
  const empty=document.getElementById('emptyState');
  const clearFilterBtn=document.getElementById('clearFilterBtn');
  const tasks=state.tasks.filter(t=>!t.deletedAt); const tdy=today(); const s=state.searchText;
  const filterOcc=(arr)=>arr.filter(o=>matchesSearch(o.task,s));

  if (state.filterDate) {
    clearFilterBtn.style.display=''; clearFilterBtn.onclick=()=>{ state.filterDate=null; renderTasks(); renderCalendar(); };
    const dateObj=fromYMD(state.filterDate); const occ=filterOcc(getOccurrencesForDate(tasks,dateObj));
    container.innerHTML = sectionHTML(`Tareas para ${dateObj.toLocaleDateString(MX_LOCALE)}`, occ, s);
    renderNotes();
    empty.style.display = (occ.length || (state.notes||[]).length) ? 'none' : '';
    return;
  } else { clearFilterBtn.style.display='none'; }

  const range=(start,days)=>Array.from({length:days},(_,i)=>addDays(start,i));
  const secHoy=filterOcc(getOccurrencesForDate(tasks,tdy));
  const sec7 =filterOcc(range(addDays(tdy,1),7).flatMap(d=>getOccurrencesForDate(tasks,d)));
  const secFut=filterOcc(range(addDays(tdy,8),60).flatMap(d=>getOccurrencesForDate(tasks,d)));
  const secAtr=filterOcc(range(addDays(tdy,-30),30).flatMap(d=>getOccurrencesForDate(tasks,d)).filter(o=>fromYMD(o.date)<tdy && !o.done));

  container.innerHTML = sectionHTML('Hoy',secHoy,s)+sectionHTML('Próximos 7 días',sec7,s)+sectionHTML('Futuro',secFut,s)+sectionHTML('Atrasados',secAtr,s);
  renderNotes();
  const hasAny=(secHoy.length+sec7.length+secFut.length+secAtr.length)>0 || (state.notes||[]).length>0; empty.style.display = hasAny ? 'none' : '';
}

function sectionHTML(title, occList, s){ const count=occList.length; const badge=`<span class="badge text-bg-secondary ms-2">${count}</span>`; if(!count){ return `<div class="mb-4"><h6 class="text-muted">${title} ${badge}</h6><div class="text-muted small">Nada por aquí… ${s?'(sin coincidencias con la búsqueda)':''}</div></div>`; } const items=occList.map(o=>taskItemHTML(o)).join(''); return `<div class=\"mb-4\"><h6 class=\"text-muted\">${title} ${badge}</h6><div class=\"d-flex flex-column gap-2\">${items}</div></div>`; }

function taskItemHTML(o){ const t=o.task; const ymd=o.date; const done=o.done; const dateStr=fromYMD(ymd).toLocaleDateString(MX_LOCALE,{weekday:'short',day:'2-digit',month:'short'}); const prBadge=t.priority==='alta'?'danger':(t.priority==='media'?'warning':'secondary'); const details=t.details?`<div class=\"small text-muted\">${escapeHTML(t.details)}</div>`:''; const color=t.color||'#0d6efd'; return `
  <div class=\"task-item ${done?'done':''}\" style=\"--task-color:${color}\">
    <div class=\"d-flex justify-content-between align-items-start\">
      <div class=\"me-2\">
        <div class=\"d-flex align-items-center gap-2 flex-wrap\">
          <span class=\"badge text-bg-${prBadge} text-uppercase\">${t.priority}</span>
          <span class=\"task-date-badge\"><i class=\"bi bi-calendar-event\"></i> ${dateStr}</span>
        </div>
        <div class=\"fw-semibold mt-1\">${escapeHTML(t.title)}</div>
        ${details}
      </div>
      <div class=\"d-flex flex-column align-items-end gap-2\">
        <div class=\"form-check\">
          <input type=\"checkbox\" class=\"form-check-input\" data-action=\"toggle-done\" data-id=\"${t.id}\" data-date=\"${ymd}\" ${done?'checked':''}>
          <label class=\"form-check-label small\">Hecho</label>
        </div>
        <div class=\"btn-group btn-group-sm\">
          <button class=\"btn btn-outline-secondary\" data-action=\"edit-task\" data-id=\"${t.id}\"><i class=\"bi bi-pencil\"></i></button>
          <button class=\"btn btn-outline-danger\" data-action=\"delete-task\" data-id=\"${t.id}\"><i class=\"bi bi-trash\"></i></button>
        </div>
      </div>
    </div>
  </div>`; }

// ---- Notas (sin fecha) ----
function renderNotes(){ const list=document.getElementById('notesList'); const empty=document.getElementById('notesEmpty'); const badge=document.getElementById('notesCountBadge'); const notes=(state.notes||[]).filter(n=>!n.deletedAt).filter(n=>matchesSearch(n,state.searchText)).sort((a,b)=>{ const p=v=>v==='alta'?0:(v==='media'?1:2); const pr=p(a.priority)-p(b.priority); if(pr!==0)return pr; return (b.createdAt||'').localeCompare(a.createdAt||''); }); badge.textContent=String(notes.length); if(!notes.length){ list.innerHTML=''; empty.style.display=''; return; } empty.style.display='none'; list.innerHTML = notes.map(n=>noteItemHTML(n)).join(''); }

function noteItemHTML(n){ const prBadge=n.priority==='alta'?'danger':(n.priority==='media'?'warning':'secondary'); const details=n.details?`<div class=\"small text-muted\">${escapeHTML(n.details)}</div>`:''; const color=n.color||'#6f42c1'; return `
  <div class=\"note-item ${n.done?'done':''}\" style=\"--note-color:${color}\">
    <div class=\"d-flex justify-content-between align-items-start\">
      <div class=\"me-2\">
        <div class=\"d-flex align-items-center gap-2 flex-wrap\">
          <span class=\"badge text-bg-${prBadge} text-uppercase\">${n.priority}</span>
          <span class=\"note-meta small text-muted\"><i class=\"bi bi-sticky\"></i> Nota</span>
        </div>
        <div class=\"fw-semibold mt-1\">${escapeHTML(n.title)}</div>
        ${details}
      </div>
      <div class=\"d-flex flex-column align-items-end gap-2\">
        <div class=\"form-check\">
          <input type=\"checkbox\" class=\"form-check-input\" data-action=\"toggle-note-done\" data-id=\"${n.id}\" ${n.done?'checked':''}>
          <label class=\"form-check-label small\">Hecha</label>
        </div>
        <div class=\"btn-group btn-group-sm\">
          <button class=\"btn btn-outline-secondary\" data-action=\"edit-note\" data-id=\"${n.id}\"><i class=\"bi bi-pencil\"></i></button>
          <button class=\"btn btn-outline-primary\" data-action=\"promote-note\" data-id=\"${n.id}\" title=\"Convertir a tarea\"><i class=\"bi bi-arrow-up-right-circle\"></i></button>
          <button class=\"btn btn-outline-danger\" data-action=\"delete-note\" data-id=\"${n.id}\"><i class=\"bi bi-trash\"></i></button>
        </div>
      </div>
    </div>
  </div>`; }

// Delegación de eventos (tareas + notas)
document.addEventListener('click', (ev)=>{ const btn=ev.target.closest('[data-action]'); if(!btn) return; const action=btn.getAttribute('data-action'); if(action==='toggle-done'){ const id=btn.getAttribute('data-id'); const date=btn.getAttribute('data-date'); toggleDone(id,date,btn.checked); } if(action==='delete-task'){ const id=btn.getAttribute('data-id'); if(confirm('¿Eliminar esta tarea?')) softDeleteTask(id); } if(action==='edit-task'){ const id=btn.getAttribute('data-id'); openEditModal(id); } if(action==='toggle-note-done'){ const id=btn.getAttribute('data-id'); const n=state.notes.find(x=>x.id===id); if(!n) return; n.done=btn.checked; saveNotes(state.notes); renderNotes(); } if(action==='delete-note'){ const id=btn.getAttribute('data-id'); if(confirm('¿Eliminar esta nota?')){ const n=state.notes.find(x=>x.id===id); if(n) n.deletedAt=new Date().toISOString(); saveNotes(state.notes); renderNotes(); } } if(action==='edit-note'){ const id=btn.getAttribute('data-id'); openEditNoteModal(id); } if(action==='promote-note'){ const id=btn.getAttribute('data-id'); promoteNoteToTask(id); } });

function toggleDone(taskId, ymd, value){ const idx=state.tasks.findIndex(t=>t.id===taskId); if(idx===-1) return; const t=state.tasks[idx]; t.doneOccurrences=t.doneOccurrences||{}; if(value) t.doneOccurrences[ymd]=true; else delete t.doneOccurrences[ymd]; saveTasks(state.tasks); renderTasks(); }

// ---- Crear / Editar tareas ----
const tareaModal = document.getElementById('tareaModal');
const tareaModalBs = tareaModal ? new bootstrap.Modal(tareaModal) : null;

document.getElementById('tareaForm').addEventListener('submit',(e)=>{ e.preventDefault(); const id=document.getElementById('tareaId').value||null; const title=document.getElementById('titulo').value.trim(); if(!title) return; const details=document.getElementById('detalles').value.trim(); const priority=document.getElementById('prioridad').value; const color=document.getElementById('color').value; const dates=gatherSelectedDates(); const recurrence=gatherRecurrenceFromUI(dates); if(!dates.length && (!recurrence || recurrence.type==='none')){ alert('Agrega al menos una fecha o define una recurrencia.'); return; } if(id){ const idx=state.tasks.findIndex(t=>t.id===id); if(idx!==-1){ const prev=state.tasks[idx]; state.tasks[idx]={...prev,title,details,priority,color,dates,recurrence}; } } else { state.tasks.push({ id:crypto.randomUUID(), title, details, priority, color, createdAt:new Date().toISOString(), dates, recurrence, doneOccurrences:{} }); }
  saveTasks(state.tasks); clearTaskForm(); tareaModalBs.hide(); renderCalendar(); renderTasks(); });

function openEditModal(taskId){ const t=state.tasks.find(x=>x.id===taskId); if(!t) return; document.getElementById('tareaModalLabel').textContent='Editar tarea'; document.getElementById('tareaId').value=t.id; document.getElementById('titulo').value=t.title; document.getElementById('detalles').value=t.details||''; document.getElementById('prioridad').value=t.priority||'media'; document.getElementById('color').value=t.color||'#0d6efd'; selectedDatesSet=new Set(t.dates||[]); drawSelectedDateChips(); setRecurrenceUI(t.recurrence||{type:'none'}, t); tareaModalBs.show(); }

function softDeleteTask(taskId){ const idx=state.tasks.findIndex(t=>t.id===taskId); if(idx===-1) return; state.tasks[idx].deletedAt=new Date().toISOString(); saveTasks(state.tasks); renderCalendar(); renderTasks(); }

function clearTaskForm(){ document.getElementById('tareaModalLabel').textContent='Nueva tarea'; document.getElementById('tareaId').value=''; document.getElementById('titulo').value=''; document.getElementById('detalles').value=''; document.getElementById('prioridad').value='media'; document.getElementById('color').value='#0d6efd'; selectedDatesSet=new Set(); drawSelectedDateChips(); setRecurrenceUI({type:'none'}, null); if(state.calendarPickMode) toggleCalendarPickMode(false); }

// ---- Modo selección desde calendario (en modal) ----
document.getElementById('toggleCalendarPick').addEventListener('click',()=>{ toggleCalendarPickMode(!state.calendarPickMode); });
function toggleCalendarPickMode(on){ state.calendarPickMode=on; const btn=document.getElementById('toggleCalendarPick'); btn.classList.toggle('btn-primary',on); btn.classList.toggle('btn-outline-secondary',!on); btn.innerHTML = on ? '<i class="bi bi-check2-square"></i> Selección activada' : '<i class="bi bi-hand-index-thumb"></i> Seleccionar en calendario'; }

tareaModal.addEventListener('hidden.bs.modal',()=>toggleCalendarPickMode(false));

// ---- Manejo de fechas en modal ----
let selectedDatesSet = new Set();
function addFechaToModal(ymd){ selectedDatesSet.add(ymd); drawSelectedDateChips(); }
function removeFechaFromModal(ymd){ selectedDatesSet.delete(ymd); drawSelectedDateChips(); }

document.getElementById('addFechaBtn').addEventListener('click',()=>{ const inp=document.getElementById('fechaInput'); if(!inp.value) return; selectedDatesSet.add(inp.value); inp.value=''; drawSelectedDateChips(); });
function drawSelectedDateChips(){ const wrap=document.getElementById('fechasSeleccionadas'); wrap.innerHTML=''; const arr=Array.from(selectedDatesSet).sort(); for(const ymd of arr){ const chip=document.createElement('span'); chip.className='date-chip'; chip.innerHTML = `${formatYMDHuman(ymd)} <button type="button" title="Quitar">&times;</button>`; chip.querySelector('button').addEventListener('click',()=>removeFechaFromModal(ymd)); wrap.appendChild(chip);} }
function gatherSelectedDates(){ return Array.from(selectedDatesSet).sort(); }
function formatYMDHuman(ymd){ const d=fromYMD(ymd); return d.toLocaleDateString(MX_LOCALE,{day:'2-digit',month:'short',year:'numeric'}); }

// ---- Recurrencia UI ----
const recurrenciaTipo=document.getElementById('recurrenciaTipo');
const rc1Wrap=document.getElementById('recurrenciaCampo1Wrap');
const rc1Label=document.getElementById('recurrenciaCampo1Label');
const rc1=document.getElementById('recurrenciaCampo1');
const rc2Wrap=document.getElementById('recurrenciaCampo2Wrap');
const rc2Label=document.getElementById('recurrenciaCampo2Label');
const rc2=document.getElementById('recurrenciaCampo2');
const rcHasta=document.getElementById('recurrenciaHasta');

recurrenciaTipo.addEventListener('change', handleRecurrenceUIChange);
function handleRecurrenceUIChange(){ const type=recurrenciaTipo.value; rc1Wrap.style.display='none'; rc2Wrap.style.display='none'; if(type==='monthly'){ rc1Wrap.style.display=''; rc1Label.textContent='Día del mes'; rc1.min=1; rc1.max=31; rc1.value ||= 25; } else if (type==='weekly'){ rc2Wrap.style.display=''; rc2Label.textContent='Día de la semana'; rc2.innerHTML = `
  <option value="1">Lunes</option>
  <option value="2">Martes</option>
  <option value="3">Miércoles</option>
  <option value="4">Jueves</option>
  <option value="5">Viernes</option>
  <option value="6">Sábado</option>
  <option value="0">Domingo</option>`; rc2.value='1'; } }
handleRecurrenceUIChange();

function gatherRecurrenceFromUI(selectedDates){ const type=recurrenciaTipo.value; const until=rcHasta.value||null; if(type==='none') return {type:'none'}; const start=(selectedDates&&selectedDates.length)?selectedDates[0]:toYMD(today()); if(type==='monthly'){ const dom=Number(rc1.value||25); return {type,dom,start,until}; } if(type==='weekly'){ const dow=Number(rc2.value||1); return {type,dow,start,until}; } if(type==='yearly'){ return {type,start,until}; } return {type:'none'}; }
function setRecurrenceUI(rule){ const type=rule?.type||'none'; recurrenciaTipo.value=type; handleRecurrenceUIChange(); rcHasta.value=rule?.until||''; if(type==='monthly') rc1.value=rule.dom||25; if(type==='weekly') rc2.value=String(rule.dow??1); }

// ---- Notas: CRUD y convertir a tarea ----
const notaModal = document.getElementById('notaModal');
const notaModalBs = notaModal ? new bootstrap.Modal(notaModal) : null;

document.getElementById('notaForm').addEventListener('submit',(e)=>{ e.preventDefault(); const id=document.getElementById('notaId').value||null; const title=document.getElementById('notaTitulo').value.trim(); if(!title) return; const details=document.getElementById('notaDetalles').value.trim(); const priority=document.getElementById('notaPrioridad').value; const color=document.getElementById('notaColor').value; if(id){ const idx=state.notes.findIndex(n=>n.id===id); if(idx!==-1){ const prev=state.notes[idx]; state.notes[idx]={...prev,title,details,priority,color}; } } else { state.notes.push({ id:crypto.randomUUID(), title, details, priority, color, createdAt:new Date().toISOString(), done:false }); }
  saveNotes(state.notes); clearNoteForm(); notaModalBs.hide(); renderNotes(); });

function openEditNoteModal(noteId){ const n=state.notes.find(x=>x.id===noteId); if(!n) return; document.getElementById('notaModalLabel').textContent='Editar nota'; document.getElementById('notaId').value=n.id; document.getElementById('notaTitulo').value=n.title||''; document.getElementById('notaDetalles').value=n.details||''; document.getElementById('notaPrioridad').value=n.priority||'media'; document.getElementById('notaColor').value=n.color||'#6f42c1'; notaModalBs.show(); }

function clearNoteForm(){ document.getElementById('notaModalLabel').textContent='Nueva nota'; document.getElementById('notaId').value=''; document.getElementById('notaTitulo').value=''; document.getElementById('notaDetalles').value=''; document.getElementById('notaPrioridad').value='media'; document.getElementById('notaColor').value='#6f42c1'; }

function promoteNoteToTask(noteId){ const n=state.notes.find(x=>x.id===noteId); if(!n) return; document.getElementById('tareaModalLabel').textContent='Nueva tarea desde nota'; document.getElementById('tareaId').value=''; document.getElementById('titulo').value=n.title||''; document.getElementById('detalles').value=n.details||''; document.getElementById('prioridad').value=n.priority||'media'; document.getElementById('color').value=n.color||'#0d6efd'; selectedDatesSet=new Set(); drawSelectedDateChips(); setRecurrenceUI({type:'none'}, null); notaModalBs?.hide(); tareaModalBs?.show(); }

// ---- Ajustes / Autolimpieza / Tema ----
document.getElementById('ajustesForm').addEventListener('submit',(e)=>{ e.preventDefault(); const s={ autoClean: document.getElementById('autoCleanToggle').checked, retentionDays: Number(document.getElementById('retentionDays').value||30), theme: document.getElementById('themeSelect').value }; state.settings=s; saveSettings(s); applyTheme(); bootstrap.Modal.getInstance(document.getElementById('ajustesModal')).hide(); });

document.getElementById('runCleanNow').addEventListener('click',()=>{ const removed=runCleanupNow(); alert(`Limpieza completada. Se eliminaron ${removed} elementos.`); renderCalendar(); renderTasks(); });

function syncSettingsUI(){ document.getElementById('autoCleanToggle').checked=!!state.settings.autoClean; document.getElementById('retentionDays').value=state.settings.retentionDays??30; const themeSelect=document.getElementById('themeSelect'); if(themeSelect) themeSelect.value=state.settings.theme||'light'; }

// Tema
const themeCycleBtn = document.getElementById('themeCycleBtn');
function systemPrefersDark(){ return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; }
function applyTheme(){ let mode=state.settings.theme||'light'; if(mode==='system') mode=systemPrefersDark()? 'dark':'light'; document.documentElement.setAttribute('data-bs-theme', mode); if(themeCycleBtn){ const icon=(state.settings.theme==='system')?'bi-circle-half':(mode==='dark'?'bi-moon-stars':'bi-sun'); themeCycleBtn.innerHTML=`<i class="bi ${icon}"></i>`; } }
function cycleTheme(){ const order=['light','dark','system']; const cur=state.settings.theme||'light'; const idx=order.indexOf(cur); const next=order[(idx+1)%order.length]; state.settings.theme=next; saveSettings(state.settings); const themeSelect=document.getElementById('themeSelect'); if(themeSelect) themeSelect.value=next; applyTheme(); }
if(themeCycleBtn) themeCycleBtn.addEventListener('click', cycleTheme);
if(window.matchMedia){ const mql=window.matchMedia('(prefers-color-scheme: dark)'); mql.addEventListener?.('change',()=>{ if(state.settings.theme==='system') applyTheme(); }); }

// ---- Búsqueda (desktop + móvil) ----
const searchInput=document.getElementById('searchInput');
const clearSearchBtn=document.getElementById('clearSearchBtn');
const searchInputMobile=document.getElementById('searchInputMobile');
const clearSearchBtnMobile=document.getElementById('clearSearchBtnMobile');

function setSearchText(val){ state.searchText=(val||'').toLowerCase().trim(); if(clearSearchBtn) clearSearchBtn.style.display=state.searchText? '':'none'; if(clearSearchBtnMobile) clearSearchBtnMobile.style.display=state.searchText? '':'none'; renderTasks(); }
searchInput?.addEventListener('input',(e)=>{ setSearchText(e.target.value); if(searchInputMobile && document.activeElement!==searchInputMobile) searchInputMobile.value=e.target.value; });
searchInputMobile?.addEventListener('input',(e)=>{ setSearchText(e.target.value); if(searchInput && document.activeElement!==searchInput) searchInput.value=e.target.value; });
clearSearchBtn?.addEventListener('click',()=>{ if(searchInput) searchInput.value=''; if(searchInputMobile) searchInputMobile.value=''; setSearchText(''); });
clearSearchBtnMobile?.addEventListener('click',()=>{ if(searchInput) searchInput.value=''; if(searchInputMobile) searchInputMobile.value=''; setSearchText(''); });

// ---- Exportar / Importar ----
document.getElementById('btnExportar').addEventListener('click',()=>{ const payload={ exportedAt:new Date().toISOString(), settings: state.settings, tasks: state.tasks, notes: state.notes }; const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`organiza-pro-backup-${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); });

document.getElementById('inputImportar').addEventListener('change',(e)=>{ const file=e.target.files?.[0]; if(!file) return; const reader=new FileReader(); reader.onload=()=>{ try { const data=JSON.parse(reader.result); if(data.tasks && Array.isArray(data.tasks)) { state.tasks=data.tasks; saveTasks(state.tasks); } if(data.notes && Array.isArray(data.notes)) { state.notes=data.notes; saveNotes(state.notes); } if(data.settings) { state.settings={...loadSettings(), ...data.settings}; saveSettings(state.settings); } alert('Importación exitosa.'); syncSettingsUI(); applyTheme(); renderCalendar(); renderTasks(); } catch { alert('Archivo inválido.'); } }; reader.readAsText(file); });

// ---- Navegación calendario ----
document.getElementById('prevMonth').addEventListener('click',()=>{ const d=state.currentMonth; state.currentMonth=new Date(d.getFullYear(), d.getMonth()-1, 1); renderCalendar(); });
document.getElementById('nextMonth').addEventListener('click',()=>{ const d=state.currentMonth; state.currentMonth=new Date(d.getFullYear(), d.getMonth()+1, 1); renderCalendar(); });
document.getElementById('goToday').addEventListener('click',()=>{ const t=today(); state.currentMonth=new Date(t.getFullYear(), t.getMonth(), 1); renderCalendar(); });

// ---- Autolimpieza ----
function runCleanupIfEnabled(){ if(!state.settings.autoClean) return 0; return runCleanupNow(); }
function runCleanupNow(){ const keep=[]; const cutoff=addDays(today(), -(state.settings.retentionDays||30)); const cutoffYMD=toYMD(cutoff); let removed=0; for(const t of state.tasks){ if(t.deletedAt){ removed++; continue; } let hasFuture=false; let lastDate=null; if(Array.isArray(t.dates)){ for(const ymd of t.dates){ if(!lastDate || ymd>lastDate) lastDate=ymd; if(ymd>=toYMD(today())) hasFuture=true; } } if(t.recurrence && t.recurrence.type!=='none'){ if(!t.recurrence.until){ keep.push(t); continue; } if(!lastDate || t.recurrence.until>lastDate) lastDate=t.recurrence.until; if(t.recurrence.until>=toYMD(today())) hasFuture=true; } if(hasFuture){ keep.push(t); continue; } if(lastDate && lastDate>cutoffYMD){ keep.push(t); continue; } removed++; }
  state.tasks=keep; saveTasks(state.tasks);
  // Limpieza de notas hechas y antiguas
  const notesKeep=[]; for(const n of (state.notes||[])){ if(n.deletedAt) continue; if(!n.done){ notesKeep.push(n); continue; } const created = n.createdAt ? new Date(n.createdAt) : null; if(created && created>cutoff){ notesKeep.push(n); continue; } /* else drop */ }
  const removedNotes = (state.notes||[]).length - notesKeep.length; state.notes = notesKeep; saveNotes(state.notes);
  return removed + removedNotes; }

// ---- Helpers ----
function escapeHTML(str){ return (str||'').replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[s])); }

// ---- Init ----
(function init(){ syncSettingsUI(); applyTheme(); runCleanupIfEnabled(); renderCalendar(); renderTasks(); window.addEventListener('focus',()=>{ const imp=document.getElementById('inputImportar'); if(imp) imp.value=''; }); })();
