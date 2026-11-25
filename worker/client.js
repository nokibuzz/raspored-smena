(() => {
  const $ = (id) => document.getElementById(id);
  const MONTHS = ['januar','februar','mart','april','maj','jun','jul','avgust','septembar','oktobar','novembar','decembar'];
  const LABELS = {'1':'Prva smena','2':'Druga smena',D:'Dnevna smena',N:'Noćna smena','-':'Slobodno','?':'Proveri smenu'};
  const REMINDERS = {'1':'Radiš sutra prvu smenu','2':'Radiš sutra drugu smenu',D:'Radiš sutra dnevnu smenu',N:'Radiš sutra noćnu smenu','-':'Sutra si slobodan/na'};
  const STORAGE = 'raspored-smena-v1';
  let saved = load();
  let draft = null;
  let imageData = '';
  let selectedDay = 1;
  let currentView = 'welcome';
  let canEdit = true;

  function load() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE) || '{}');
      return { schedules: value.schedules && typeof value.schedules === 'object' ? value.schedules : {}, activeKey: value.activeKey || '', selectedNumber: value.selectedNumber || null, hours: value.hours || {dayStart:'07:00',dayEnd:'19:00',nightStart:'19:00',nightEnd:'07:00'} };
    } catch { return { schedules: {}, activeKey: '', selectedNumber: null, hours: {dayStart:'07:00',dayEnd:'19:00',nightStart:'19:00',nightEnd:'07:00'} }; }
  }
  function save() { localStorage.setItem(STORAGE, JSON.stringify(saved)); }
  function active() { return saved.schedules[saved.activeKey] || null; }
  function keyOf(schedule) { return schedule.year + '-' + String(schedule.month).padStart(2, '0'); }
  function daysIn(month, year) { return new Date(year, month, 0).getDate(); }
  function person() { return active()?.people.find((p) => p.number === Number(saved.selectedNumber)) || active()?.people[0] || null; }
  function fullDate(day, schedule = active()) { return new Date(schedule.year, schedule.month - 1, day); }
  function dateLabel(date, options) { return new Intl.DateTimeFormat('sr-Latn-RS', options).format(date); }
  function show(view) {
    currentView = view;
    $('welcome').hidden = view !== 'welcome';
    $('dashboard').hidden = view !== 'dashboard';
    $('importView').hidden = view !== 'import';
    $('statusBadge').textContent = active() ? 'Potvrđen raspored' : 'Nema rasporeda';
    $('statusBadge').classList.toggle('ready', !!active());
    $('newScheduleBtn').hidden = view === 'import' || !canEdit;
    $('startBtn').hidden = !canEdit;
    if (view === 'dashboard') renderDashboard();
  }
  function setNotice(id, message, error = false) { $(id).textContent = message; $(id).classList.toggle('error', error); }
  function startImport() {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    $('monthInput').value = String(target.getMonth() + 1);
    $('yearInput').value = String(target.getFullYear());
    $('reviewSection').hidden = true;
    $('confirmCheck').checked = false;
    draft = null;
    imageData = '';
    $('imageInput').value = '';
    $('sourcePreview').hidden = true;
    $('imageMeta').hidden = true;
    setNotice('recognitionMessage', '');
    setNotice('confirmMessage', '');
    show('import');
  }
  for (let i = 1; i <= 12; i++) {
    const option = new Option(MONTHS[i - 1][0].toUpperCase() + MONTHS[i - 1].slice(1), String(i));
    $('monthInput').add(option);
  }
  $('startBtn').addEventListener('click', startImport);
  $('newScheduleBtn').addEventListener('click', startImport);
  $('backBtn').addEventListener('click', () => show(active() ? 'dashboard' : 'welcome'));

  $('imageInput').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10_000_000) {
      setNotice('recognitionMessage', 'Izaberi JPG, PNG ili WebP sliku do 10 MB.', true);
      return;
    }
    imageData = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    $('sourcePreview').src = imageData;
    $('sourcePreview').hidden = false;
    $('imageMeta').textContent = file.name + ' · ' + Math.round(file.size / 1024) + ' KB';
    $('imageMeta').hidden = false;
    setNotice('recognitionMessage', 'Slika je spremna. Pokreni prepoznavanje ili unesi raspored ručno.');
  });

  $('recognizeBtn').addEventListener('click', async () => {
    if (!imageData) return setNotice('recognitionMessage', 'Prvo izaberi fotografiju rasporeda.', true);
    const key = $('apiKey').value.trim();
    if (!key) return setNotice('recognitionMessage', 'Unesi OpenAI API ključ za prepoznavanje rukopisa.', true);
    const button = $('recognizeBtn');
    button.disabled = true;
    button.textContent = 'Čitam raspored…';
    setNotice('recognitionMessage', 'Obrada može potrajati oko minut.');
    try {
      const response = await fetch('/api/parse', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-openai-key': key }, body: JSON.stringify({ image: imageData }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Prepoznavanje nije uspelo.');
      draft = normalize(body.result);
      $('monthInput').value = String(draft.month);
      $('yearInput').value = String(draft.year);
      $('confirmCheck').checked = false;
      renderReview();
      setNotice('recognitionMessage', 'Raspored je pročitan. Proveri svaku ćeliju ispod pre potvrde.');
      $('reviewSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { setNotice('recognitionMessage', error.message || 'Prepoznavanje nije uspelo.', true); }
    finally { button.disabled = false; button.textContent = 'Prepoznaj raspored sa slike'; }
  });

  function normalize(input) {
    const fallbackMonth = Number($('monthInput').value);
    const fallbackYear = Number($('yearInput').value);
    const month = Number.isInteger(Number(input?.month)) && Number(input.month) >= 1 && Number(input.month) <= 12 ? Number(input.month) : fallbackMonth;
    const year = Number.isInteger(Number(input?.year)) && Number(input.year) >= 2000 && Number(input.year) <= 2100 ? Number(input.year) : fallbackYear;
    const days = daysIn(month, year);
    const people = Array.isArray(input?.people) ? input.people.map((p, index) => {
      const shifts = Array.from({length:days}, (_, day) => {
        const raw = String(p.shifts?.[day] ?? '?').trim().toUpperCase().replace(/\s/g, '');
        if (['1','7/15','7-15','07/15','07-15'].includes(raw)) return '1';
        if (['2','13/21','13-21'].includes(raw)) return '2';
        if (['D','N'].includes(raw)) return raw;
        if (['-','/','SL','SLOBODNO','OFF',''].includes(raw)) return '-';
        return '?';
      });
      return { number: Number.isInteger(Number(p.number)) && Number(p.number) > 0 ? Number(p.number) : index + 1, name: String(p.name || '').trim(), shifts };
    }).filter((p) => p.name) : [];
    return { month, year, people };
  }
  $('manualBtn').addEventListener('click', () => {
    const month = Number($('monthInput').value), year = Number($('yearInput').value);
    if (!month || year < 2000 || year > 2100) return setNotice('recognitionMessage', 'Izaberi ispravan mesec i godinu.', true);
    draft = { month, year, people: [{ number: 1, name: '', shifts: Array(daysIn(month, year)).fill('-') }] };
    $('confirmCheck').checked = false;
    renderReview();
    $('reviewSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('monthInput').addEventListener('change', syncDraftMonth);
  $('yearInput').addEventListener('change', syncDraftMonth);
  function syncDraftMonth() {
    if (!draft) return;
    const month = Number($('monthInput').value), year = Number($('yearInput').value);
    if (year < 2000 || year > 2100) return;
    const oldDays = daysIn(draft.month, draft.year);
    const newDays = daysIn(month, year);
    draft.month = month; draft.year = year;
    draft.people.forEach((p) => {
      p.shifts.length = newDays;
      for (let i = oldDays; i < newDays; i++) p.shifts[i] = '?';
    });
    $('confirmCheck').checked = false;
    renderReview();
  }
  $('addPersonBtn').addEventListener('click', () => {
    if (!draft) return;
    const number = Math.max(0, ...draft.people.map((p) => p.number)) + 1;
    draft.people.push({ number, name: '', shifts: Array(daysIn(draft.month, draft.year)).fill('-') });
    $('confirmCheck').checked = false;
    renderReview();
    $('reviewTable').querySelector('tbody tr:last-child input[name="name"]')?.focus();
  });

  function renderReview() {
    if (!draft) return;
    $('reviewSection').hidden = false;
    const table = $('reviewTable');
    table.replaceChildren();
    const head = document.createElement('thead'), hrow = document.createElement('tr');
    ['#','Ime i prezime', ...Array.from({length:daysIn(draft.month, draft.year)}, (_, i) => String(i + 1))].forEach((label) => {
      const th = document.createElement('th'); th.textContent = label; hrow.append(th);
    });
    head.append(hrow); table.append(head);
    const tbody = document.createElement('tbody');
    draft.people.forEach((p, rowIndex) => {
      const row = document.createElement('tr');
      const numCell = document.createElement('td'), numInput = document.createElement('input');
      numInput.className = 'number-input'; numInput.type = 'number'; numInput.min = '1'; numInput.value = String(p.number); numInput.setAttribute('aria-label', 'Redni broj osobe');
      numInput.addEventListener('change', () => { p.number = Number(numInput.value); updateReviewStatus(); });
      numCell.append(numInput); row.append(numCell);
      const nameCell = document.createElement('td'), nameInput = document.createElement('input');
      nameInput.name = 'name'; nameInput.value = p.name; nameInput.placeholder = 'Ime i prezime'; nameInput.setAttribute('aria-label', 'Ime i prezime osobe ' + (rowIndex + 1));
      nameInput.addEventListener('input', () => { p.name = nameInput.value.trim(); updateReviewStatus(); });
      nameCell.append(nameInput); row.append(nameCell);
      p.shifts.forEach((code, dayIndex) => {
        const cell = document.createElement('td'), select = document.createElement('select');
        select.className = 'v-' + code;
        select.setAttribute('aria-label', p.name + ', ' + (dayIndex + 1) + '. ' + MONTHS[draft.month - 1]);
        [['?','?'],['-','—'],['1','1'],['2','2'],['D','D'],['N','N']].forEach(([value, label]) => select.add(new Option(label, value)));
        select.value = code;
        select.addEventListener('change', () => { p.shifts[dayIndex] = select.value; select.className = 'v-' + select.value; updateReviewStatus(); });
        cell.append(select); row.append(cell);
      });
      tbody.append(row);
    });
    table.append(tbody);
    updateReviewStatus();
  }
  $('confirmCheck').addEventListener('change', updateReviewStatus);
  function reviewProblems() {
    if (!draft) return ['Nema rasporeda.'];
    const problems = [];
    if (!draft.people.length) problems.push('Nema prepoznatih osoba.');
    if (draft.people.some((p) => !p.name.trim())) problems.push('Unesi sva imena.');
    if (draft.people.some((p) => !Number.isInteger(p.number) || p.number < 1) || new Set(draft.people.map((p) => p.number)).size !== draft.people.length) problems.push('Redni brojevi moraju biti jedinstveni.');
    const unknown = draft.people.reduce((sum, p) => sum + p.shifts.filter((s) => s === '?').length, 0);
    if (unknown) problems.push(unknown + ' nejasnih polja treba proveriti.');
    return problems;
  }
  function updateReviewStatus() {
    const problems = reviewProblems();
    $('reviewCount').textContent = problems.length ? problems.join(' ') : 'Sva polja su spremna';
    $('reviewCount').classList.toggle('warning', !!problems.length);
    $('confirmBtn').disabled = !!problems.length || !$('confirmCheck').checked;
  }
  $('confirmBtn').addEventListener('click', async () => {
    if (reviewProblems().length || !$('confirmCheck').checked) return;
    const clean = normalize(draft);
    $('confirmBtn').disabled = true;
    $('confirmBtn').textContent = 'Čuvam raspored…';
    try {
      const response = await fetch('/api/schedules', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(clean) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Raspored nije mogao da se sačuva.');
    } catch (error) {
      $('confirmBtn').textContent = 'Potvrdi i usvoji raspored';
      updateReviewStatus();
      return setNotice('confirmMessage', error.message || 'Raspored nije mogao da se sačuva.', true);
    }
    saved.schedules[keyOf(clean)] = clean;
    saved.activeKey = keyOf(clean);
    if (!clean.people.some((p) => p.number === Number(saved.selectedNumber))) saved.selectedNumber = clean.people[0].number;
    try { save(); } catch { return setNotice('confirmMessage', 'Pregledač nije mogao da sačuva raspored. Proveri dozvolu za čuvanje podataka.', true); }
    imageData = '';
    $('apiKey').value = '';
    $('confirmBtn').textContent = 'Potvrdi i usvoji raspored';
    show('dashboard');
    window.scrollTo({top:0,behavior:'smooth'});
  });

  function renderDashboard() {
    const schedule = active();
    if (!schedule) return show('welcome');
    $('dashboardMonth').textContent = MONTHS[schedule.month - 1][0].toUpperCase() + MONTHS[schedule.month - 1].slice(1) + ' ' + schedule.year;
    const select = $('scheduleSelect'); select.replaceChildren();
    Object.keys(saved.schedules).sort().reverse().forEach((key) => {
      const s = saved.schedules[key]; select.add(new Option(MONTHS[s.month - 1] + ' ' + s.year, key));
    });
    select.value = saved.activeKey;
    const personSelect = $('personSelect'); personSelect.replaceChildren();
    schedule.people.forEach((p) => personSelect.add(new Option(p.number + ' — ' + p.name, String(p.number))));
    if (!schedule.people.some((p) => p.number === Number(saved.selectedNumber))) saved.selectedNumber = schedule.people[0].number;
    personSelect.value = String(saved.selectedNumber);
    const me = person();
    $('workdayCount').textContent = String(me.shifts.filter((s) => s !== '-').length);
    const tomorrow = new Date(); tomorrow.setHours(12,0,0,0); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = tomorrow.getFullYear() + '-' + String(tomorrow.getMonth() + 1).padStart(2, '0');
    const tomorrowSchedule = saved.schedules[tomorrowKey];
    const tomorrowPerson = tomorrowSchedule?.people.find((p) => p.name.toLocaleLowerCase('sr') === me.name.toLocaleLowerCase('sr'));
    $('tomorrowShift').textContent = tomorrowPerson ? LABELS[tomorrowPerson.shifts[tomorrow.getDate() - 1]] : 'Nema podatka';
    $('tomorrowDate').textContent = dateLabel(tomorrow, {day:'numeric',month:'long',weekday:'long'});
    const today = new Date();
    if (selectedDay > daysIn(schedule.month, schedule.year) || selectedDay < 1) selectedDay = 1;
    if (today.getMonth() + 1 === schedule.month && today.getFullYear() === schedule.year && selectedDay === 1) selectedDay = today.getDate();
    renderCalendar();
  }
  $('scheduleSelect').addEventListener('change', () => { const oldName = person()?.name.toLocaleLowerCase('sr'); saved.activeKey = $('scheduleSelect').value; const match = active()?.people.find((p) => p.name.toLocaleLowerCase('sr') === oldName); if (match) saved.selectedNumber = match.number; selectedDay = 1; save(); renderDashboard(); });
  $('personSelect').addEventListener('change', () => { saved.selectedNumber = Number($('personSelect').value); save(); renderDashboard(); });
  function renderCalendar() {
    const schedule = active(), me = person(), calendar = $('calendar');
    calendar.replaceChildren();
    $('calendarTitle').textContent = MONTHS[schedule.month - 1][0].toUpperCase() + MONTHS[schedule.month - 1].slice(1) + ' ' + schedule.year;
    const firstWeekday = (fullDate(1).getDay() + 6) % 7;
    for (let i = 0; i < firstWeekday; i++) { const blank = document.createElement('span'); blank.className = 'blank'; calendar.append(blank); }
    const now = new Date();
    me.shifts.forEach((code, index) => {
      const day = index + 1, button = document.createElement('button');
      button.type = 'button'; button.className = 'day-cell' + (code === '-' ? '' : ' shift-' + code) + (day === selectedDay ? ' selected' : '') + (now.getDate() === day && now.getMonth() + 1 === schedule.month && now.getFullYear() === schedule.year ? ' today' : '');
      button.setAttribute('aria-label', day + '. ' + MONTHS[schedule.month - 1] + ': ' + LABELS[code]);
      const date = document.createElement('span'); date.className = 'date'; date.textContent = String(day);
      const label = document.createElement('span'); label.className = 'code'; label.textContent = code === '-' ? '' : code;
      button.append(date,label); button.addEventListener('click', () => { selectedDay = day; renderCalendar(); }); calendar.append(button);
    });
    renderDetails();
  }
  function hour(value) { const parts = String(value).split(':').map(Number); return parts[0] + parts[1] / 60; }
  function ranges(code) {
    if (code === '1') return [7,15];
    if (code === '2') return [13,21];
    if (code === 'D') { const a = hour(saved.hours.dayStart), b = hour(saved.hours.dayEnd); return [a,b <= a ? b + 24 : b]; }
    if (code === 'N') { const a = hour(saved.hours.nightStart), b = hour(saved.hours.nightEnd); return [a,b <= a ? b + 24 : b]; }
    return null;
  }
  function overlap(a,b) {
    const ra = ranges(a), rb = ranges(b);
    return ra && rb && Math.min(ra[1],rb[1]) > Math.max(ra[0],rb[0]);
  }
  function renderDetails() {
    const schedule = active(), me = person(), code = me.shifts[selectedDay - 1];
    $('detailDate').textContent = dateLabel(fullDate(selectedDay), {weekday:'long',day:'numeric',month:'long'});
    $('detailShift').textContent = LABELS[code];
    $('detailShift').className = 'detail-shift' + (code === '-' ? '' : ' shift-' + code);
    const list = $('overlapList'); list.replaceChildren();
    if (code === '-') {
      const empty = document.createElement('p'); empty.className = 'overlap-empty'; empty.textContent = 'Tog dana si slobodan/na.'; list.append(empty); return;
    }
    const colleagues = schedule.people.filter((p) => p.number !== me.number && overlap(code, p.shifts[selectedDay - 1]));
    if (!colleagues.length) {
      const empty = document.createElement('p'); empty.className = 'overlap-empty'; empty.textContent = 'Nema evidentiranih kolega koji se preklapaju u ovoj smeni.'; list.append(empty); return;
    }
    colleagues.sort((a,b) => Number(b.shifts[selectedDay - 1] === code) - Number(a.shifts[selectedDay - 1] === code) || a.number - b.number);
    colleagues.forEach((p) => {
      const item = document.createElement('div'); item.className = 'overlap-item';
      const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = String(p.number);
      const name = document.createElement('span'); name.className = 'name'; name.textContent = p.name;
      const match = document.createElement('span'); match.className = 'match'; match.textContent = p.shifts[selectedDay - 1] + ' · ' + (p.shifts[selectedDay - 1] === code ? 'ista smena' : 'preklapanje');
      item.append(avatar,name,match); list.append(item);
    });
  }
  function icsText(value) { return String(value).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;'); }
  function icsDate(date) { return String(date.getFullYear()) + String(date.getMonth() + 1).padStart(2,'0') + String(date.getDate()).padStart(2,'0'); }
  function exportCalendar() {
    const schedule = active(), me = person();
    if (!schedule || !me) return;
    const stamp = new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
    const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Raspored smena//SR','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Raspored smena - ' + icsText(me.name)];
    me.shifts.forEach((code, index) => {
      const reminderDate = fullDate(index + 1, schedule); reminderDate.setDate(reminderDate.getDate() - 1);
      const date = icsDate(reminderDate), message = REMINDERS[code];
      lines.push('BEGIN:VEVENT','UID:' + keyOf(schedule) + '-' + (index + 1) + '-' + me.number + '@raspored-smena.local','DTSTAMP:' + stamp,'DTSTART:' + date + 'T180000','DTEND:' + date + 'T180500','SUMMARY:' + icsText(message),'DESCRIPTION:' + icsText('Podsetnik za ' + (index + 1) + '. ' + MONTHS[schedule.month - 1] + '. ' + schedule.year + '. Raspored: ' + me.name),'BEGIN:VALARM','TRIGGER:PT0M','ACTION:DISPLAY','DESCRIPTION:' + icsText(message),'END:VALARM','END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n') + '\r\n'], {type:'text/calendar;charset=utf-8'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'raspored-' + keyOf(schedule) + '-' + me.number + '.ics'; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  $('exportBtn').addEventListener('click', exportCalendar);
  $('exportAsideBtn').addEventListener('click', exportCalendar);
  ['dayStart','dayEnd','nightStart','nightEnd'].forEach((id) => {
    $(id).value = saved.hours[id] || $(id).value;
    $(id).addEventListener('change', () => { saved.hours[id] = $(id).value; save(); if (active()) renderDetails(); });
  });
  if (active()) show('dashboard'); else show('welcome');
  fetch('/api/schedules').then(async (response) => {
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '');
    canEdit = result.canEdit !== false;
    saved.schedules = { ...saved.schedules, ...result.schedules };
    if (!active()) saved.activeKey = Object.keys(saved.schedules).sort().at(-1) || '';
    save();
    if (currentView !== 'import') show(active() ? 'dashboard' : 'welcome');
  }).catch(() => { /* Previously confirmed local data remains available offline. */ });
})();
