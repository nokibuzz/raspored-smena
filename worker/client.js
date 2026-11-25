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
  let selectedReviewRow = 0;
  let selectedReviewDay = 0;
  let currentView = 'welcome';

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
    $('newScheduleBtn').hidden = view === 'import';
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
    $('imageFrame').hidden = true;
    $('gridControls').hidden = true;
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
    $('imageFrame').hidden = false;
    $('gridControls').hidden = false;
    $('sourcePreview').onload = () => window.RasporedOCR.renderGrid();
    $('imageMeta').textContent = file.name + ' · ' + Math.round(file.size / 1024) + ' KB';
    $('imageMeta').hidden = false;
    setNotice('recognitionMessage', 'Slika je spremna. Pokreni prepoznavanje ili unesi raspored ručno.');
  });

  $('recognizeBtn').addEventListener('click', async () => {
    if (!imageData) return setNotice('recognitionMessage', 'Prvo izaberi fotografiju rasporeda.', true);
    const month = Number($('monthInput').value), year = Number($('yearInput').value);
    if (!month || year < 2000 || year > 2100) return setNotice('recognitionMessage', 'Izaberi ispravan mesec i godinu.', true);
    const button = $('recognizeBtn');
    button.disabled = true;
    button.textContent = 'Čitam raspored…';
    setNotice('recognitionMessage', 'Pripremam prepoznavanje na tvom uređaju…');
    try {
      const result = await window.RasporedOCR.recognize($('sourcePreview'), month, year, (message) => setNotice('recognitionMessage', message));
      draft = normalize(result);
      draft.people.forEach((person, index) => { person.suggestions = result.people[index].suggestions; });
      selectedReviewRow = 0;
      $('monthInput').value = String(draft.month);
      $('yearInput').value = String(draft.year);
      $('confirmCheck').checked = false;
      renderReview();
      setNotice('recognitionMessage', 'Prepoznato je ' + (result.people.length * daysIn(month, year) - result.unknown) + ' polja; ' + result.unknown + ' treba ručno proveriti. Uporedi sva polja sa slikom.');
      $('reviewSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { setNotice('recognitionMessage', 'Prepoznavanje nije uspelo: ' + (error.message || 'proveri vezu i pokušaj ponovo.'), true); }
    finally { button.disabled = false; button.textContent = 'Prepoznaj raspored na uređaju'; }
  });

  ['rowCount','gridDayStart','gridRight','gridTop','gridBottom','gridTilt'].forEach((id) => {
    $(id).addEventListener('input', () => {
      ['gridDayStart','gridRight','gridTop','gridBottom','gridTilt'].forEach((key) => $(key + 'Value').textContent = $(key).value + '%');
      window.RasporedOCR.renderGrid();
    });
  });
  ['gridDayStart','gridRight','gridTop','gridBottom','gridTilt'].forEach((key) => $(key + 'Value').textContent = $(key).value + '%');

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
    }) : [];
    return { month, year, people };
  }
  $('manualBtn').addEventListener('click', () => {
    const month = Number($('monthInput').value), year = Number($('yearInput').value);
    if (!month || year < 2000 || year > 2100) return setNotice('recognitionMessage', 'Izaberi ispravan mesec i godinu.', true);
    draft = { month, year, people: [{ number: 1, name: '', shifts: Array(daysIn(month, year)).fill('-') }] };
    selectedReviewRow = 0;
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
    selectedReviewRow = draft.people.length - 1;
    $('confirmCheck').checked = false;
    renderReview();
    $('reviewTable').querySelector('tbody tr:last-child input[name="name"]')?.focus();
  });
  $('reviewSection').querySelector('.review-tools span').textContent += ' · —? uz ime: posle provere reda označi preostala nejasna polja kao slobodna';
  $('reviewPersonSelect').addEventListener('change', () => {
    selectedReviewRow = Number($('reviewPersonSelect').value);
    selectedReviewDay = 0;
    renderRowReview();
  });

  function renderRowReview(focus = true) {
    if (!draft?.people.length) return;
    selectedReviewRow = Math.max(0, Math.min(selectedReviewRow, draft.people.length - 1));
    const picker = $('reviewPersonSelect');
    picker.replaceChildren();
    draft.people.forEach((person, index) => picker.add(new Option(person.number + ' — ' + (person.name || 'bez imena'), String(index))));
    picker.value = String(selectedReviewRow);
    const person = draft.people[selectedReviewRow];
    $('reviewRowTitle').textContent = 'Red ' + person.number + ' na originalnoj slici';
    const image = $('sourcePreview');
    const hasImage = !$('imageFrame').hidden && image.complete && !!image.naturalWidth;
    $('rowImageHelp').hidden = hasImage;
    const photo = $('reviewRowImage'); photo.replaceChildren();
    if (hasImage) photo.append(window.RasporedOCR.previewRow(image, selectedReviewRow));
    const grid = $('reviewDayGrid'); grid.replaceChildren();
    person.shifts.forEach((code, dayIndex) => {
      const cell = document.createElement('div');
      cell.className = 'review-day' + (code === '?' ? ' unknown' : '') + (dayIndex === selectedReviewDay ? ' active' : '');
      const label = document.createElement('label'); label.textContent = String(dayIndex + 1); label.htmlFor = 'review-day-' + dayIndex;
      const select = document.createElement('select'); select.id = 'review-day-' + dayIndex;
      select.setAttribute('aria-label', (dayIndex + 1) + '. ' + MONTHS[draft.month - 1] + ', red ' + person.number);
      [['?','?'],['-','—'],['1','1'],['2','2'],['D','D'],['N','N']].forEach(([value, text]) => select.add(new Option(text, value)));
      select.value = code;
      const focusDay = () => {
        selectedReviewDay = dayIndex;
        grid.querySelectorAll('.review-day').forEach((item, index) => item.classList.toggle('active', index === dayIndex));
        const preview = $('reviewDayImage'); preview.replaceChildren();
        const title = document.createElement('span'); title.textContent = 'Dan ' + (dayIndex + 1) + ' · red ' + person.number;
        preview.append(title);
        if (hasImage) {
          preview.append(window.RasporedOCR.previewCell(image, selectedReviewRow, dayIndex));
          const g = window.RasporedOCR.readGrid();
          const x = (g.dayStart - 2.5 + (g.right - g.dayStart) * dayIndex / 31) / (g.right - 2.5) * 1900;
          photo.scrollLeft = Math.max(0, x - photo.clientWidth / 2);
        }
      };
      select.addEventListener('focus', focusDay);
      select.addEventListener('click', focusDay);
      select.addEventListener('change', () => {
        person.shifts[dayIndex] = select.value;
        if (person.suggestions) person.suggestions[dayIndex] = null;
        const tableSelect = $('reviewTable').rows[selectedReviewRow + 1]?.cells[dayIndex + 2]?.querySelector('select');
        if (tableSelect) { tableSelect.value = select.value; tableSelect.className = 'v-' + select.value; }
        cell.classList.toggle('unknown', select.value === '?');
        cell.querySelector('.suggestion')?.remove();
        updateReviewStatus();
      });
      select.addEventListener('keydown', (event) => {
        const code = ({'0':'-', '-':'-', '1':'1', '2':'2', 'd':'D', 'n':'N'})[event.key.toLowerCase()];
        if (!code) return;
        event.preventDefault();
        select.value = code;
        select.dispatchEvent(new Event('change'));
        grid.querySelectorAll('select')[dayIndex + 1]?.focus();
      });
      cell.append(label, select);
      if (code === '?' && person.suggestions?.[dayIndex]) {
        const suggestion = document.createElement('button'); suggestion.type = 'button'; suggestion.className = 'suggestion';
        suggestion.textContent = 'Predlog: ' + (person.suggestions[dayIndex] === '-' ? '—' : person.suggestions[dayIndex]);
        suggestion.title = 'Prihvati predlog tek po poređenju sa fotografijom';
        suggestion.addEventListener('click', () => { select.value = person.suggestions[dayIndex]; select.dispatchEvent(new Event('change')); focusDay(); });
        cell.append(suggestion);
      }
      grid.append(cell);
    });
    if (focus) grid.querySelectorAll('select')[selectedReviewDay]?.focus();
  }

  function renderReview() {
    if (!draft) return;
    $('reviewSection').hidden = false;
    const table = $('reviewTable');
    table.replaceChildren();
    $('cellInspector').hidden = true;
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
      numInput.addEventListener('change', () => { p.number = Number(numInput.value); updateReviewStatus(); renderRowReview(); });
      numCell.append(numInput); row.append(numCell);
      const nameCell = document.createElement('td'), nameInput = document.createElement('input');
      nameInput.name = 'name'; nameInput.value = p.name; nameInput.placeholder = 'Ime i prezime'; nameInput.setAttribute('aria-label', 'Ime i prezime osobe ' + (rowIndex + 1));
      nameInput.addEventListener('input', () => { p.name = nameInput.value.trim(); updateReviewStatus(); if (selectedReviewRow === rowIndex) $('reviewPersonSelect').selectedOptions[0].textContent = p.number + ' — ' + (p.name || 'bez imena'); });
      const nameWrap = document.createElement('div'); nameWrap.className = 'name-wrap';
      const fillOff = document.createElement('button'); fillOff.type = 'button'; fillOff.textContent = '—?';
      fillOff.title = 'Posle provere reda, označi preostala nejasna polja kao slobodna';
      fillOff.setAttribute('aria-label', 'Označi preostala nejasna polja za ' + (p.name || 'osobu ' + p.number) + ' kao slobodna');
      fillOff.addEventListener('click', () => {
        p.shifts = p.shifts.map((code) => code === '?' ? '-' : code);
        const scroll = table.parentElement, left = scroll.scrollLeft, top = scroll.scrollTop;
        renderReview(); scroll.scrollLeft = left; scroll.scrollTop = top;
      });
      nameWrap.append(nameInput, fillOff); nameCell.append(nameWrap); row.append(nameCell);
      p.shifts.forEach((code, dayIndex) => {
        const cell = document.createElement('td'), select = document.createElement('select');
        select.className = 'v-' + code;
        select.setAttribute('aria-label', p.name + ', ' + (dayIndex + 1) + '. ' + MONTHS[draft.month - 1]);
        [['?','?'],['-','—'],['1','1'],['2','2'],['D','D'],['N','N']].forEach(([value, label]) => select.add(new Option(label, value)));
        select.value = code;
        select.addEventListener('change', () => { p.shifts[dayIndex] = select.value; if (p.suggestions) p.suggestions[dayIndex] = null; select.className = 'v-' + select.value; updateReviewStatus(); if (selectedReviewRow === rowIndex) renderRowReview(false); });
        select.addEventListener('focus', () => {
          const image = $('sourcePreview');
          if ($('imageFrame').hidden || !image.complete || !image.naturalWidth) return;
          $('cellInspectorTitle').textContent = (p.name || 'Osoba ' + p.number) + ' · ' + (dayIndex + 1) + '. ' + MONTHS[draft.month - 1];
          $('cellInspectorImage').replaceChildren(window.RasporedOCR.previewCell(image, rowIndex, dayIndex));
          $('cellInspector').hidden = false;
        });
        select.addEventListener('keydown', (event) => {
          const code = ({'0':'-', '-':'-', '1':'1', '2':'2', 'd':'D', 'n':'N'})[event.key.toLowerCase()];
          if (!code) return;
          event.preventDefault();
          select.value = code;
          select.dispatchEvent(new Event('change'));
          const next = row.querySelectorAll('select')[dayIndex + 1] || row.nextElementSibling?.querySelector('select');
          next?.focus();
        });
        cell.append(select); row.append(cell);
      });
      tbody.append(row);
    });
    table.append(tbody);
    updateReviewStatus();
    renderRowReview();
  }
  $('confirmCheck').addEventListener('change', updateReviewStatus);
  function reviewProblems() {
    if (!draft) return ['Nema rasporeda.'];
    const problems = [];
    if (!draft.people.length) problems.push('Nema prepoznatih osoba.');
    if (draft.people.some((p) => !p.name.trim() || p.name.trim() === '?')) problems.push('Proveri sva imena.');
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
    saved.schedules[keyOf(clean)] = clean;
    saved.activeKey = keyOf(clean);
    if (!clean.people.some((p) => p.number === Number(saved.selectedNumber))) saved.selectedNumber = clean.people[0].number;
    try { save(); } catch { return setNotice('confirmMessage', 'Pregledač nije mogao da sačuva raspored. Proveri dozvolu za čuvanje podataka.', true); }
    imageData = '';
    $('confirmBtn').textContent = 'Potvrdi i usvoji raspored';
    const link = await shareLink(clean);
    history.replaceState(null, '', link);
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
  function validShared(schedule) {
    if (!schedule || !Number.isInteger(schedule.month) || schedule.month < 1 || schedule.month > 12 || !Number.isInteger(schedule.year) || schedule.year < 2000 || schedule.year > 2100 || !Array.isArray(schedule.people) || !schedule.people.length || schedule.people.length > 100) return false;
    const days = daysIn(schedule.month, schedule.year), numbers = new Set();
    return schedule.people.every((p) => {
      if (!Number.isInteger(p.number) || p.number < 1 || numbers.has(p.number) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 120 || !Array.isArray(p.shifts) || p.shifts.length !== days || p.shifts.some((s) => !['1','2','D','N','-'].includes(s))) return false;
      numbers.add(p.number); return true;
    });
  }
  function toBase64Url(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  function fromBase64Url(value) {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }
  async function shareLink(schedule) {
    const plain = new TextEncoder().encode(JSON.stringify(schedule));
    let bytes = plain, type = 'u';
    if (typeof CompressionStream !== 'undefined') {
      try {
        bytes = new Uint8Array(await new Response(new Blob([plain]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
        type = 'g';
      } catch { bytes = plain; }
    }
    return location.origin + location.pathname + '#r=' + type + toBase64Url(bytes);
  }
  async function loadShared() {
    const fragment = location.hash.match(/^#r=([ug])([A-Za-z0-9_-]+)$/);
    if (!fragment || fragment[2].length > 100000) return;
    try {
      let bytes = fromBase64Url(fragment[2]);
      if (fragment[1] === 'g') bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
      if (bytes.length > 100000) return;
      const schedule = JSON.parse(new TextDecoder().decode(bytes));
      if (!validShared(schedule)) return;
      saved.schedules[keyOf(schedule)] = schedule;
      saved.activeKey = keyOf(schedule);
      if (!schedule.people.some((p) => p.number === Number(saved.selectedNumber))) saved.selectedNumber = schedule.people[0].number;
      save();
      if (currentView !== 'import') show('dashboard');
    } catch { /* A damaged share link does not overwrite a confirmed local schedule. */ }
  }
  $('shareBtn').addEventListener('click', async () => {
    if (!active()) return;
    const link = await shareLink(active());
    history.replaceState(null, '', link);
    try { await navigator.clipboard.writeText(link); $('shareMessage').textContent = 'Link je kopiran. Pošalji ga osobama kojima je raspored namenjen.'; }
    catch { window.prompt('Kopiraj link rasporeda:', link); $('shareMessage').textContent = 'Link je prikazan za kopiranje.'; }
  });
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
  loadShared();
})();
