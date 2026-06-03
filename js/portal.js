// ---------- Utilities ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let currentUser = null;
let employees = [];
let currentEmployeeId = null;

function nowLt() {
  const d = new Date();
  return d.toLocaleString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function euro(x) {
  return Number(x).toLocaleString('lt-LT', { style: 'currency', currency: 'EUR' });
}

function getVacationDaysValue(emp) {
  if (!emp) return 0;
  if (emp.vacationDays !== undefined && emp.vacationDays !== null && emp.vacationDays !== '') {
    return Number(emp.vacationDays) || 0;
  }
  if (emp.vacationHours !== undefined && emp.vacationHours !== null && emp.vacationHours !== '') {
    return Math.round(((Number(emp.vacationHours) || 0) / 8) * 100) / 100;
  }
  return 0;
}

function formatVacationDays(value) {
  return `${Math.round((Number(value) || 0) * 100) / 100} d.`;
}

function normalizeText(value) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

function normalizeTimeValue(value) {
  const raw = normalizeText(value).replace('.', ':');
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function normalizeDateValue(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  m = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return raw;
}

function getLtWeekday(dateIso) {
  if (!dateIso) return '';
  const d = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('lt-LT', { weekday: 'short' });
}

function calculateHours(start, end) {
  const startVal = normalizeTimeValue(start);
  const endVal = normalizeTimeValue(end);
  if (!startVal || !endVal) return 0;
  const [sh, sm] = startVal.split(':').map(Number);
  const [eh, em] = endVal.split(':').map(Number);
  let startMinutes = sh * 60 + sm;
  let endMinutes = eh * 60 + em;
  if (endMinutes < startMinutes) endMinutes += 24 * 60;
  const hours = (endMinutes - startMinutes) / 60;
  return Math.round(hours * 100) / 100;
}

// ---------- API Helpers ----------
async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'API klaida');
  }
  return data;
}

// ---------- Auth Check ----------
async function checkAuth() {
  try {
    currentUser = await api('/api/me');
    if (currentUser.role !== 'admin') {
      window.location.href = '/darbuotojo.html';
      return false;
    }
    return true;
  } catch (err) {
    window.location.href = '/index.html';
    return false;
  }
}

// ---------- Logout ----------
async function logout() {
  await api('/api/logout', { method: 'POST' });
  window.location.href = '/index.html';
}

// ---------- Navigation ----------
function initNavigation() {
  const nav = $("#nav");
  if (!nav) return;

  nav.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-target]");
    if (!btn) return;
    $$("#nav button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.target;

    $$(".section").forEach(s => s.classList.remove("active"));
    $("#" + target).classList.add("active");
  });
}

// ---------- Clock ----------
function initClock() {
  function tick() {
    const clockEl = $("#clock");
    const todayEl = $("#todayLine");
    if (clockEl) clockEl.textContent = nowLt();
    if (todayEl) todayEl.textContent = new Date().toLocaleDateString('lt-LT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  tick();
  setInterval(tick, 30_000);
}

// ============ EMPLOYEES CRUD ============

async function loadEmployees() {
  try {
    employees = await api('/api/employees');
    renderEmployeesList();
    renderEmployeeSelect();
  } catch (err) {
    console.error('Klaida kraunant darbuotojus:', err);
  }
}

function renderEmployeesList() {
  const list = $("#employeesList");
  if (!list) return;

  if (employees.length === 0) {
    list.innerHTML = '<div class="muted">Nėra darbuotojų.</div>';
    return;
  }

  list.innerHTML = employees.map(emp => `
    <div class="employee-item" data-id="${emp.id}">
      <div class="employee-info">
        <div class="employee-name">${escapeHtml(emp.firstName)} ${escapeHtml(emp.lastName)}</div>
        <div class="employee-meta">${escapeHtml(emp.role)} • ${escapeHtml(emp.department)} • Tabelis: ${escapeHtml(emp.badge)}</div>
      </div>
      <div class="employee-actions">
        <button class="btn-small btn-edit" onclick="editEmployee(${emp.id})">Redaguoti</button>
        <button class="btn-small btn-danger" onclick="deleteEmployee(${emp.id})">Ištrinti</button>
      </div>
    </div>
  `).join('');
}

function renderEmployeeSelect() {
  const selects = $$('.employee-select');
  selects.forEach(select => {
    const currentValue = select.value;
    // Use different default text for user linking vs other selects
    const isUserSelect = select.id === 'u_employeeId';
    const defaultText = isUserSelect ? '-- Nesusieta --' : '-- Pasirinkite darbuotoją --';
    select.innerHTML = `<option value="">${defaultText}</option>` +
      employees.map(emp => `<option value="${emp.id}">${emp.firstName} ${emp.lastName} (${emp.badge})</option>`).join('');
    if (currentValue) select.value = currentValue;
  });
}

function clearEmployeeForm() {
  currentEmployeeId = null;
  $("#p_vardas").value = '';
  $("#p_pavarde").value = '';
  $("#p_tabelis").value = '';
  $("#p_pareigos").value = '';
  $("#p_padalinys").value = '';
  $("#p_atostogos").value = '';
  $("#p_tel").value = '';
  $("#p_email").value = '';
  $("#p_sutartis").value = 'Neterminuota';
  $("#p_pradzia").value = '';
  $("#p_pastabos").value = '';
  $("#p_statusas").value = 'Aktyvus';
  $("#p_vadovas").value = '';
  $("#p_vieta").value = '';
  $("#p_grafikas").value = '5/2';
  $("#saveProfile").textContent = 'Sukurti darbuotoją';
  syncProfileSummary();
}

function loadEmployeeToForm(emp) {
  currentEmployeeId = emp.id;
  $("#p_vardas").value = emp.firstName || '';
  $("#p_pavarde").value = emp.lastName || '';
  $("#p_tabelis").value = emp.badge || '';
  $("#p_pareigos").value = emp.role || '';
  $("#p_padalinys").value = emp.department || '';
  $("#p_atostogos").value = getVacationDaysValue(emp) || "";
  $("#p_tel").value = emp.phone || '';
  $("#p_email").value = emp.email || '';
  $("#p_sutartis").value = emp.contractType || 'Neterminuota';
  $("#p_pradzia").value = emp.startDate || '';
  $("#p_pastabos").value = emp.notes || '';
  $("#p_statusas").value = emp.status || 'Aktyvus';
  $("#p_vadovas").value = emp.manager || '';
  $("#p_vieta").value = emp.location || '';
  $("#p_grafikas").value = emp.scheduleType || '5/2';
  $("#saveProfile").textContent = 'Atnaujinti darbuotoją';
  syncProfileSummary();
}

window.editEmployee = function(id) {
  const emp = employees.find(e => e.id === id);
  if (emp) {
    loadEmployeeToForm(emp);
    // Switch to info tab
    $$("#nav button").forEach(b => b.classList.remove("active"));
    $("[data-target='info']").classList.add("active");
    $$(".section").forEach(s => s.classList.remove("active"));
    $("#info").classList.add("active");
  }
};

window.deleteEmployee = async function(id) {
  if (!confirm('Ar tikrai norite ištrinti šį darbuotoją?')) return;

  try {
    await api(`/api/employees/${id}`, { method: 'DELETE' });
    await loadEmployees();
  fillVacationBalanceEditor();
  await loadVacationRequests();
    if (currentEmployeeId === id) {
      clearEmployeeForm();
    }
    alert('Darbuotojas ištrintas');
  } catch (err) {
    alert('Klaida: ' + err.message);
  }
};

async function saveEmployee() {
  const data = {
    firstName: $("#p_vardas").value.trim(),
    lastName: $("#p_pavarde").value.trim(),
    badge: $("#p_tabelis").value.trim(),
    role: $("#p_pareigos").value.trim(),
    department: $("#p_padalinys").value.trim(),
    vacationDays: parseFloat($("#p_atostogos").value) || 0,
    vacationHours: parseFloat($("#p_atostogos").value) || 0,
    phone: $("#p_tel").value.trim(),
    email: $("#p_email").value.trim(),
    contractType: $("#p_sutartis").value,
    startDate: $("#p_pradzia").value,
    notes: $("#p_pastabos").value.trim(),
    status: $("#p_statusas").value,
    manager: $("#p_vadovas").value.trim(),
    location: $("#p_vieta").value.trim(),
    scheduleType: $("#p_grafikas").value
  };

  if (!data.firstName || !data.lastName) {
    alert('Įveskite vardą ir pavardę');
    return;
  }

  try {
    if (currentEmployeeId) {
      await api(`/api/employees/${currentEmployeeId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      alert('Darbuotojas atnaujintas');
    } else {
      await api('/api/employees', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      alert('Darbuotojas sukurtas');
      clearEmployeeForm();
    }
    await loadEmployees();
  fillVacationBalanceEditor();
  await loadVacationRequests();
  } catch (err) {
    alert('Klaida: ' + err.message);
  }
}

function profileSummaryText() {
  const vardas = $("#p_vardas")?.value.trim() || "";
  const pavarde = $("#p_pavarde")?.value.trim() || "";
  const tabelis = $("#p_tabelis")?.value.trim() || "";
  const pareigos = $("#p_pareigos")?.value.trim() || "";

  const name = [vardas, pavarde].filter(Boolean).join(" ");
  const bits = [];
  if (name) bits.push(name);
  if (tabelis) bits.push("Tabelis: " + tabelis);
  if (pareigos) bits.push("Pareigos: " + pareigos);
  return bits.length ? bits.join(" • ") : "—";
}

function syncProfileSummary() {
  const summaryEl = $("#profileSummary");
  if (summaryEl) summaryEl.textContent = profileSummaryText();
}

function initProfile() {
  $$("#info input, #info select, #info textarea").forEach(el => {
    el.addEventListener("input", syncProfileSummary);
    el.addEventListener("change", syncProfileSummary);
  });

  const saveBtn = $("#saveProfile");
  if (saveBtn) {
    saveBtn.addEventListener("click", saveEmployee);
  }

  const newBtn = $("#newEmployee");
  if (newBtn) {
    newBtn.addEventListener("click", clearEmployeeForm);
  }
}

// ============ SCHEDULE ============

let currentSchedule = null;

let selectedScheduleDays = new Set();
let activeScheduleMonth = '';
let lastAutoPayrollCalc = null;

function getCurrentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getPayrollMonthValue(manual = false) {
  return (manual ? $('#payrollMonthManual')?.value : $('#payrollMonth')?.value) || getCurrentMonthValue();
}

function getDefaultShiftForDate(dateIso) {
  const d = new Date(`${dateIso}T00:00:00`);
  const weekday = d.getDay(); // 0 Sunday, 6 Saturday
  if (weekday === 0) return { start: '10:00', end: '19:00', hours: 9 };
  if (weekday === 6) return { start: '09:00', end: '19:00', hours: 10 };
  return { start: '08:00', end: '19:00', hours: 11 };
}

function getMonthDays(monthValue) {
  if (!monthValue) return [];
  const [year, month] = monthValue.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const days = [];
  for (let day = 1; day <= lastDay; day++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days.push(date);
  }
  return days;
}

function entriesToSelectedDays(entries = []) {
  const monthValue = $('#scheduleMonth')?.value || activeScheduleMonth;
  selectedScheduleDays = new Set(
    entries
      .map(e => ({ ...e, date: normalizeDateValue(e.date) }))
      .filter(e => Number(e.hours) > 0 && e.date && (!monthValue || e.date.startsWith(monthValue)))
      .map(e => e.date)
  );
}

function buildEntriesFromSelectedDays() {
  const monthValue = $('#scheduleMonth')?.value || activeScheduleMonth;
  const dates = Array.from(selectedScheduleDays).filter(d => !monthValue || d.startsWith(monthValue)).sort();
  let total = 0;
  const limit = parseFloat($('#monthlyLimit')?.value) || 160;

  return dates.map(date => {
    const shift = getDefaultShiftForDate(date);
    const before = total;
    total += shift.hours;
    const isOvertime = before >= limit || total > limit;
    return {
      date,
      day: getLtWeekday(date),
      start: shift.start,
      end: shift.end,
      hours: shift.hours,
      shift: isOvertime ? 'V' : 'D',
      note: isOvertime ? 'Viršvalandžiai' : ''
    };
  });
}

function renderMonthCalendar() {
  const calendar = $('#monthCalendar');
  const summary = $('#monthSummary');
  if (!calendar) return;

  const monthValue = $('#scheduleMonth')?.value || activeScheduleMonth;
  if (!monthValue) {
    calendar.innerHTML = '';
    if (summary) summary.textContent = 'Pasirinkite mėnesį.';
    return;
  }

  activeScheduleMonth = monthValue;
  const days = getMonthDays(monthValue);
  const first = new Date(`${days[0]}T00:00:00`);
  const firstOffset = (first.getDay() + 6) % 7; // Monday-first calendar
  const entries = buildEntriesFromSelectedDays();
  const entriesByDate = new Map(entries.map(e => [e.date, e]));
  const totalHours = entries.reduce((sum, e) => sum + Number(e.hours || 0), 0);
  const limit = parseFloat($('#monthlyLimit')?.value) || 160;
  const overtimeHours = Math.max(0, totalHours - limit);

  let html = ['Pir', 'Ant', 'Tre', 'Ket', 'Pen', 'Šeš', 'Sek']
    .map(d => `<div class="calendar-weekday">${d}</div>`).join('');
  for (let i = 0; i < firstOffset; i++) html += '<div class="calendar-day empty"></div>';

  html += days.map(date => {
    const dayNum = Number(date.slice(-2));
    const entry = entriesByDate.get(date);
    const cls = entry ? (entry.shift === 'V' ? 'overtime' : 'work') : '';
    const time = entry ? `<div class="work-time">${entry.start}–${entry.end}<br>${entry.hours} val.${entry.shift === 'V' ? '<br>viršval.' : ''}</div>` : '<div class="work-time">laisva</div>';
    return `<button type="button" class="calendar-day ${cls}" data-date="${date}"><span class="date-num">${dayNum}</span>${time}</button>`;
  }).join('');

  calendar.innerHTML = html;
  if (summary) {
    summary.innerHTML = `<strong>Iš viso:</strong> ${Math.round(totalHours * 100) / 100} val. / ${limit} val. ${overtimeHours > 0 ? `• <span style="color:#dc2626;font-weight:700;">Viršvalandžiai: ${Math.round(overtimeHours * 100) / 100} val.</span>` : ''}`;
  }

  calendar.querySelectorAll('.calendar-day[data-date]').forEach(btn => {
    btn.addEventListener('click', () => {
      const date = btn.dataset.date;
      if (selectedScheduleDays.has(date)) selectedScheduleDays.delete(date);
      else selectedScheduleDays.add(date);
      renderMonthCalendar();
    });
  });
}

async function saveBuiltSchedule() {
  const employeeId = parseInt($('#scheduleEmployee')?.value);
  const monthValue = $('#scheduleMonth')?.value;
  if (!employeeId) { alert('Pirma pasirinkite darbuotoją'); return; }
  if (!monthValue) { alert('Pasirinkite mėnesį'); return; }

  const entries = buildEntriesFromSelectedDays();
  const total = entries.reduce((sum, e) => sum + Number(e.hours || 0), 0);
  const overtime = Math.max(0, total - ((parseFloat($('#monthlyLimit')?.value) || 160)));

  try {
    await api('/api/schedules', {
      method: 'POST',
      body: JSON.stringify({
        employeeId,
        period: monthValue,
        entries,
        updateType: 'csv'
      })
    });
    alert(`Grafikas išsaugotas. Iš viso: ${Math.round(total * 100) / 100} val.${overtime > 0 ? ` Viršvalandžiai: ${Math.round(overtime * 100) / 100} val.` : ''}`);
    await loadScheduleForEmployee(employeeId);
  } catch (err) {
    alert('Klaida: ' + err.message);
  }
}

function setMonthFromSchedule(schedule) {
  const monthInput = $('#scheduleMonth');
  if (!monthInput) return;
  if (!monthInput.value) monthInput.value = getCurrentMonthValue();
  activeScheduleMonth = monthInput.value;
}

async function loadScheduleForEmployee(employeeId) {
  const deleteBtn = $("#deleteSchedule");

  if (!employeeId) {
    $("#schedulePreview").innerHTML = '<div class="muted">Pasirinkite darbuotoją.</div>';
    if (deleteBtn) deleteBtn.style.display = 'none';
    currentSchedule = null;
    return;
  }

  try {
    const period = $('#scheduleMonth')?.value || activeScheduleMonth || getCurrentMonthValue();
    const schedule = await api(`/api/schedules/employee/${employeeId}?period=${encodeURIComponent(period)}`);
    currentSchedule = schedule;
    if (schedule) {
      setMonthFromSchedule(schedule);
      entriesToSelectedDays(schedule.entries || []);
      renderMonthCalendar();
      renderScheduleTable(schedule);
      if (deleteBtn) deleteBtn.style.display = 'block';
    } else {
      selectedScheduleDays = new Set();
      setMonthFromSchedule(null);
      renderMonthCalendar();
      $("#schedulePreview").innerHTML = `<div class="muted">Nėra grafiko pasirinktam mėnesiui (${escapeHtml($('#scheduleMonth')?.value || activeScheduleMonth || '')}).</div>`;
      if (deleteBtn) deleteBtn.style.display = 'none';
    }
  } catch (err) {
    $("#schedulePreview").innerHTML = '<div class="muted">Klaida kraunant grafiką.</div>';
    if (deleteBtn) deleteBtn.style.display = 'none';
    currentSchedule = null;
    selectedScheduleDays = new Set();
    renderMonthCalendar();
  }
}

function renderScheduleTable(schedule) {
  if (!schedule) return;

  // Prioritize CSV/table data whenever entries exist.
  // Show image only as a fallback when there is no usable table data.
  const hasEntries = Array.isArray(schedule.entries) && schedule.entries.length > 0;
  const showImage = !hasEntries && !!schedule.imageUrl;

  let content = '';

  if (showImage && schedule.imageUrl) {
    // Show image only
    content = `
      <div style="margin-bottom:10px;"><strong>Grafikas (nuotrauka)</strong></div>
      <div style="text-align:center;"><img src="${escapeHtml(schedule.imageUrl)}" style="max-width:100%; border-radius:8px;" alt="Grafiko nuotrauka" /></div>
      ${schedule.imageUpdatedAt ? `<div class="hint" style="margin-top:10px;">Atnaujinta: ${formatDate(schedule.imageUpdatedAt)}</div>` : ''}
    `;
  } else if (schedule.entries && schedule.entries.length > 0) {
    // Show table only
    const headers = ['Data', 'Diena', 'Pradžia', 'Pabaiga', 'Val.', 'Pamaina', 'Pastabos'];
    const th = headers.map(h => `<th>${h}</th>`).join('');
    const body = schedule.entries.map(e => `
      <tr>
        <td>${escapeHtml(e.date)}</td>
        <td>${escapeHtml(e.day)}</td>
        <td>${escapeHtml(e.start)}</td>
        <td>${escapeHtml(e.end)}</td>
        <td>${e.hours}</td>
        <td><span class="shift">${e.shift === 'L' ? 'Laisva' : 'Darbas'} • ${e.shift}</span></td>
        <td class="cell-muted">${escapeHtml(e.note || '')}</td>
      </tr>
    `).join('');

    content = `
      <div style="margin-bottom:10px;"><strong>Periodas:</strong> ${escapeHtml(schedule.period)}</div>
      <table>
        <thead><tr>${th}</tr></thead>
        <tbody>${body}</tbody>
      </table>
      ${schedule.csvUpdatedAt ? `<div class="hint" style="margin-top:10px;">Atnaujinta: ${formatDate(schedule.csvUpdatedAt)}</div>` : ''}
    `;
  } else {
    content = '<div class="muted">Nėra grafiko duomenų.</div>';
  }

  $("#schedulePreview").innerHTML = content;
}

async function deleteSchedule() {
  if (!currentSchedule) return;

  if (!confirm('Ar tikrai norite ištrinti šį grafiką?')) return;

  try {
    await api(`/api/schedules/${currentSchedule.id}`, { method: 'DELETE' });
    alert('Grafikas ištrintas');
    const employeeId = parseInt($("#scheduleEmployee")?.value);
    loadScheduleForEmployee(employeeId);
  } catch (err) {
    alert('Klaida: ' + err.message);
  }
}

async function uploadImage(file) {
  const formData = new FormData();
  formData.append('image', file);

  try {
    const res = await fetch('/api/upload/image', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.url;
  } catch (err) {
    alert('Nuotraukos įkėlimo klaida: ' + err.message);
    return null;
  }
}

function initSchedule() {
  const employeeSelect = $("#scheduleEmployee");
  if (employeeSelect) {
    employeeSelect.addEventListener("change", (e) => {
      loadScheduleForEmployee(parseInt(e.target.value));
    });
  }

  const deleteBtn = $("#deleteSchedule");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", deleteSchedule);
  }

  const monthInput = $("#scheduleMonth");
  if (monthInput) {
    if (!monthInput.value) {
      const now = new Date();
      monthInput.value = getCurrentMonthValue();
    }
    monthInput.addEventListener('change', () => {
      activeScheduleMonth = monthInput.value;
      const employeeId = parseInt($('#scheduleEmployee')?.value);
      if (employeeId) loadScheduleForEmployee(employeeId);
      else renderMonthCalendar();
    });
  }

  const limitInput = $("#monthlyLimit");
  if (limitInput) limitInput.addEventListener('input', renderMonthCalendar);

  const buildBtn = $("#buildScheduleBtn");
  if (buildBtn) buildBtn.addEventListener('click', saveBuiltSchedule);

  const clearBtn = $("#clearScheduleBtn");
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!confirm('Išvalyti pažymėtas grafiko dienas?')) return;
      selectedScheduleDays = new Set();
      renderMonthCalendar();
    });
  }

  renderMonthCalendar();

  const csvFile = $("#csvFile");
  if (csvFile) {
    csvFile.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const employeeId = parseInt($("#scheduleEmployee")?.value);
      if (!employeeId) {
        alert('Pirma pasirinkite darbuotoją');
        return;
      }

      try {
        const text = await file.text();
        const entries = parseScheduleCsv(text);
        if (!entries.length) {
          alert('Nepavyko rasti tinkamų grafiko eilučių. CSV faile turi būti bent datos ir laikai.');
          return;
        }

        const grouped = entries.reduce((acc, entry) => {
          const periodKey = String(entry.date || '').slice(0, 7) || ($('#scheduleMonth')?.value || getCurrentMonthValue());
          if (!acc[periodKey]) acc[periodKey] = [];
          acc[periodKey].push(entry);
          return acc;
        }, {});
        const periods = Object.keys(grouped).sort();
        const period = ($('#scheduleMonth')?.value && grouped[$('#scheduleMonth').value]) ? $('#scheduleMonth').value : periods[0];
        if ($('#scheduleMonth')) $('#scheduleMonth').value = period;
        activeScheduleMonth = period;

        for (const periodKey of periods) {
          await api('/api/schedules', {
            method: 'POST',
            body: JSON.stringify({ employeeId, period: periodKey, entries: grouped[periodKey], updateType: 'csv' })
          });
        }

        alert(`Grafikas importuotas: ${entries.length} įrašų, ${periods.length} mėn.`);
        await loadScheduleForEmployee(employeeId);
        csvFile.value = '';
      } catch (err) {
        alert('Klaida: ' + err.message);
      }
    });
  }

  const imgFile = $("#imgFile");
  if (imgFile) {
    imgFile.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const employeeId = parseInt($("#scheduleEmployee")?.value);
      if (!employeeId) {
        alert('Pirma pasirinkite darbuotoją');
        return;
      }

      const imageUrl = await uploadImage(file);
      if (!imageUrl) return;

      try {
        await api('/api/schedules', {
          method: 'POST',
          body: JSON.stringify({
            employeeId,
            period: $('#scheduleMonth')?.value || activeScheduleMonth || getCurrentMonthValue(),
            entries: currentSchedule?.entries || [],
            imageUrl,
            updateType: 'image'
          })
        });
        alert('Nuotrauka įkelta');
        loadScheduleForEmployee(employeeId);
        imgFile.value = '';
      } catch (err) {
        alert('Klaida: ' + err.message);
      }
    });
  }
}

function parseCSVRow(line, delim) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delim && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  values.push(current.trim());
  return values;
}

function parseCSV(text) {
  const lines = text
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .split('\n')
    .filter(l => l.trim().length);
  if (lines.length === 0) return { headers: [], rows: [] };

  const first = lines[0];
  const delim = (first.split(';').length > first.split(',').length) ? ';' : ',';
  const rows = lines.map(line => parseCSVRow(line, delim).map(normalizeText));
  return { headers: rows[0] || [], rows: rows.slice(1) };
}

function detectScheduleColumns(headers) {
  const normalized = headers.map(h => normalizeText(h).toLowerCase());
  const findIndex = (candidates) => normalized.findIndex(h => candidates.some(c => h.includes(c)));
  return {
    date: findIndex(['data', 'date']),
    day: findIndex(['diena', 'day']),
    start: findIndex(['prad', 'nuo', 'start']),
    end: findIndex(['paba', 'iki', 'end']),
    hours: findIndex(['val', 'hours']),
    shift: findIndex(['pam', 'shift']),
    note: findIndex(['pastab', 'komentar', 'note'])
  };
}

function parseScheduleCsv(text) {
  const { headers, rows } = parseCSV(text);
  if (!headers.length) return [];

  let columnMap = detectScheduleColumns(headers);
  let dataRows = rows;

  const hasDateHeader = columnMap.date !== -1 || columnMap.start !== -1 || columnMap.end !== -1;
  if (!hasDateHeader) {
    dataRows = [headers, ...rows];
    columnMap = { date: 0, day: 1, start: 2, end: 3, hours: 4, shift: 5, note: 6 };
  }

  const entries = dataRows.map((row) => {
    const date = normalizeDateValue(row[columnMap.date] || row[0] || '');
    const start = normalizeTimeValue(row[columnMap.start] || row[2] || '');
    const end = normalizeTimeValue(row[columnMap.end] || row[3] || '');
    const rawHours = normalizeText(row[columnMap.hours] || row[4] || '').replace(',', '.');
    const hours = rawHours ? (parseFloat(rawHours) || calculateHours(start, end)) : calculateHours(start, end);
    const day = normalizeText(row[columnMap.day] || '') || getLtWeekday(date);
    const shift = normalizeText(row[columnMap.shift] || row[5] || (hours > 0 ? 'D' : 'L')) || (hours > 0 ? 'D' : 'L');
    const note = normalizeText(row[columnMap.note] || row[6] || '');
    return { date, day, start, end, hours: Math.round(hours * 100) / 100, shift, note };
  }).filter(entry => entry.date && (entry.start || entry.end || entry.note || entry.hours >= 0));

  entries.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return entries;
}

// ============ PAYROLL ============

async function loadPayrollForEmployee(employeeId, manual = false) {
  if (!employeeId) return;
  const period = getPayrollMonthValue(manual);

  try {
    const payroll = await api(`/api/payroll/employee/${employeeId}?period=${encodeURIComponent(period)}`);
    if (payroll) {
      $('#h_hours').value = payroll.hours || '';
      $('#h_rate').value = payroll.rate || '';
      $('#h_otHours').value = payroll.overtimeHours || '';
      $('#h_otCoef').value = payroll.overtimeCoef || '1.5';
      $('#h_bonus').value = payroll.bonus || '';
      $('#h_deduct').value = payroll.deductions || '';
      $('#h_note').value = payroll.note || '';
      calculatePayroll();
    } else {
      ['#h_hours','#h_rate','#h_otHours','#h_bonus','#h_deduct','#h_note'].forEach(id => { const el = $(id); if (el) el.value = ''; });
      if ($('#h_otCoef')) $('#h_otCoef').value = '1.5';
      calculatePayroll();
    }
  } catch (err) {
    console.log('Nėra algos duomenų');
  }
}

function calculatePayroll() {
  const hours  = parseFloat($("#h_hours")?.value)   || 0;
  const rate   = parseFloat($("#h_rate")?.value)    || 0;
  const otH    = parseFloat($("#h_otHours")?.value) || 0;
  const coef   = parseFloat($("#h_otCoef")?.value)  || 1.5;
  const bonus  = parseFloat($("#h_bonus")?.value)   || 0;
  const deduct = parseFloat($("#h_deduct")?.value)  || 0;

  const base = hours * rate;
  const overtime = otH * rate * coef;
  const bruto = base + overtime;
  const total = bruto + bonus - deduct;

  if ($("#pay_bruto")) $("#pay_bruto").textContent = euro(bruto);
  if ($("#pay_total")) $("#pay_total").textContent = euro(total);
}

function calculateAutoPayroll(totalHours, overtimeHours, regularHours) {
  const rate   = parseFloat($("#auto_rate")?.value)    || 0;
  const coef   = parseFloat($("#auto_otCoef")?.value)  || 1.5;
  const bonus  = parseFloat($("#auto_bonus")?.value)   || 0;
  const deduct = parseFloat($("#auto_deduct")?.value)  || 0;

  if (!rate) return;

  const base = regularHours * rate;
  const ot   = overtimeHours * rate * coef;
  const bruto = base + ot;
  const total = bruto + bonus - deduct;

  const resultEl = $("#autoCalcResult");
  if (resultEl) resultEl.style.display = '';
  if ($("#auto_bruto")) $("#auto_bruto").textContent = euro(bruto);
  if ($("#auto_total")) $("#auto_total").textContent = euro(total);
  if ($("#auto_bruto_breakdown")) $("#auto_bruto_breakdown").textContent = `Bazė: ${euro(base)} • Viršval.: ${euro(ot)}`;
}

async function savePayroll(mode) {
  const isAuto = mode === 'auto';
  const employeeId = parseInt(isAuto ? $("#payrollEmployee")?.value : $("#payrollEmployeeManual")?.value);
  if (!employeeId) { alert('Pasirinkite darbuotoją'); return; }

  const emp = employees.find(e => e.id === employeeId);
  const now = new Date();
  const period = getPayrollMonthValue(!isAuto);

  let data;
  if (isAuto) {
    const totalH = lastAutoPayrollCalc?.totalHours || 0;
    const otH = lastAutoPayrollCalc?.overtimeHours || 0;
    const regH = lastAutoPayrollCalc?.regularHours || Math.round((totalH - otH) * 100) / 100;
    data = {
      employeeId, period,
      hours: regH,
      rate: parseFloat($("#auto_rate")?.value) || 0,
      overtimeHours: otH,
      overtimeCoef: parseFloat($("#auto_otCoef")?.value) || 1.5,
      bonus: parseFloat($("#auto_bonus")?.value) || 0,
      deductions: parseFloat($("#auto_deduct")?.value) || 0,
      note: $("#auto_note")?.value || ''
    };
  } else {
    data = {
      employeeId, period,
      hours: parseFloat($("#h_hours")?.value) || 0,
      rate: parseFloat($("#h_rate")?.value) || 0,
      overtimeHours: parseFloat($("#h_otHours")?.value) || 0,
      overtimeCoef: parseFloat($("#h_otCoef")?.value) || 1.5,
      bonus: parseFloat($("#h_bonus")?.value) || 0,
      deductions: parseFloat($("#h_deduct")?.value) || 0,
      note: $("#h_note")?.value || ''
    };
  }

  try {
    await api('/api/payroll', { method: 'POST', body: JSON.stringify(data) });
    alert('Alga išsaugota');
    if ($("#pay_last")) $("#pay_last").textContent = `${nowLt()} • ${emp?.firstName} ${emp?.lastName}`;
  } catch (err) {
    alert('Klaida: ' + err.message);
  }
}

async function autoCalcFromSchedule() {
  const employeeId = parseInt($('#payrollEmployee')?.value);
  const period = getPayrollMonthValue(false);
  if (!employeeId) { alert('Pirma pasirinkite darbuotoją'); return; }

  const infoEl = $("#autoCalcInfo");
  if (infoEl) { infoEl.style.display = 'block'; infoEl.textContent = '⏳ Kraunamas grafikas...'; }

  try {
    const sched = await api(`/api/schedules/employee/${employeeId}?period=${encodeURIComponent(period)}`);
    if (!sched || !sched.entries || sched.entries.length === 0) {
      if (infoEl) { infoEl.style.cssText += 'background:#fef9c3;border-color:#fde047;color:#854d0e;'; infoEl.textContent = '⚠️ Darbuotojas neturi grafiko su valandų duomenimis. Įkelkite CSV grafiką.'; }
      return;
    }

    let totalHours = 0;
    const MONTHLY_THRESHOLD = parseFloat($('#monthlyLimit')?.value) || 160;
    sched.entries.forEach(e => { totalHours += parseFloat(e.hours) || 0; });
    totalHours = Math.round(totalHours * 100) / 100;
    const overtimeHours = totalHours > MONTHLY_THRESHOLD ? Math.round((totalHours - MONTHLY_THRESHOLD) * 100) / 100 : 0;
    const regularHours  = Math.round((totalHours - overtimeHours) * 100) / 100;
    lastAutoPayrollCalc = { totalHours, overtimeHours, regularHours };

    const displayPeriod = sched.period || period;
    const workDays = sched.entries.filter(e => (parseFloat(e.hours)||0) > 0).length;

    if (infoEl) {
      infoEl.style.cssText = 'display:block;margin-top:10px;padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:12px;color:#166534;';
      infoEl.textContent = `✅ Periodas: ${displayPeriod} • ${workDays} darbo dienos • ${totalHours} val. iš viso${overtimeHours > 0 ? ` • Viršvalandžiai: ${overtimeHours} val.` : ' • Viršvalandžių nėra'}`;
    }

    calculateAutoPayroll(totalHours, overtimeHours, regularHours);

    if ($("#pay_employee")) {
      const emp = employees.find(e => e.id === employeeId);
      if (emp) $("#pay_employee").textContent = `${emp.firstName} ${emp.lastName} (${emp.badge})`;
    }
  } catch (err) {
    if (infoEl) { infoEl.style.cssText = 'display:block;background:#fef2f2;border-color:#fecaca;color:#dc2626;'; infoEl.textContent = '❌ Klaida: ' + err.message; }
  }
}

function initPayroll() {
  const defaultMonth = getCurrentMonthValue();
  if ($('#payrollMonth') && !$('#payrollMonth').value) $('#payrollMonth').value = defaultMonth;
  if ($('#payrollMonthManual') && !$('#payrollMonthManual').value) $('#payrollMonthManual').value = defaultMonth;
  const syncPayrollMonths = (srcId, dstId) => {
    const src = $(srcId); const dst = $(dstId);
    if (!src || !dst) return;
    src.addEventListener('change', () => {
      dst.value = src.value;
      const empId = parseInt($('#payrollEmployee')?.value || $('#payrollEmployeeManual')?.value);
      if (empId) loadPayrollForEmployee(empId, srcId === '#payrollMonthManual');
    });
  };
  syncPayrollMonths('#payrollMonth', '#payrollMonthManual');
  syncPayrollMonths('#payrollMonthManual', '#payrollMonth');

  // Sync both employee selects
  const syncSelects = (srcId, dstId) => {
    const src = $(srcId); const dst = $(dstId);
    if (!src || !dst) return;
    src.addEventListener("change", () => { dst.value = src.value; });
  };
  syncSelects("#payrollEmployee", "#payrollEmployeeManual");
  syncSelects("#payrollEmployeeManual", "#payrollEmployee");

  [$("#payrollEmployee"), $("#payrollEmployeeManual")].forEach(sel => {
    sel?.addEventListener("change", e => {
      const empId = parseInt(e.target.value);
      loadPayrollForEmployee(empId, e.target.id === 'payrollEmployeeManual');
      const emp = employees.find(em => em.id === empId);
      if ($("#pay_employee") && emp) $("#pay_employee").textContent = `${emp.firstName} ${emp.lastName} (${emp.badge})`;
    });
  });

  // Rate buttons
  document.querySelectorAll(".rate-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".rate-btn").forEach(b => {
        b.style.cssText = b.style.cssText.replace(/border:[^;]+;background:[^;]+;color:[^;]+;/,'');
        b.style.border = '2px solid #e2e8f0';
        b.style.background = '#f8fafc';
        b.style.color = '#475569';
      });
      btn.style.border = '2px solid #0f766e';
      btn.style.background = '#f0fdf4';
      btn.style.color = '#0f766e';
      if ($("#auto_rate")) $("#auto_rate").value = btn.dataset.rate;
    });
  });
  // Set default rate
  if ($("#auto_rate")) $("#auto_rate").value = '6.5';

  // Auto section
  $("#autoCalcFromSchedule")?.addEventListener("click", autoCalcFromSchedule);
  $("#savePayroll")?.addEventListener("click", () => savePayroll('auto'));
  $("#resetAutoCalc")?.addEventListener("click", () => {
    ["#auto_rate","#auto_bonus","#auto_deduct","#auto_note"].forEach(id => { const el=$(id); if(el) el.value=''; });
    if ($("#auto_otCoef")) $("#auto_otCoef").value = "1.5";
    if ($("#auto_bruto")) $("#auto_bruto").textContent = "—";
    if ($("#auto_total")) $("#auto_total").textContent = "—";
    if ($("#autoCalcInfo")) { $("#autoCalcInfo").style.display = 'none'; $("#autoCalcInfo").textContent=''; }
    if ($("#autoCalcResult")) $("#autoCalcResult").style.display = 'none';
    if ($("#auto_rate")) $("#auto_rate").value = '6.5';
  });

  // Manual section
  $("#calcPay")?.addEventListener("click", calculatePayroll);
  $("#savePayrollManual")?.addEventListener("click", () => savePayroll('manual'));
  $("#resetPay")?.addEventListener("click", () => {
    ["#h_hours","#h_rate","#h_otHours","#h_bonus","#h_deduct","#h_note"].forEach(id => { const el=$(id); if(el) el.value=''; });
    if ($("#h_otCoef")) $("#h_otCoef").value = "1.5";
    if ($("#pay_bruto")) $("#pay_bruto").textContent = "—";
    if ($("#pay_total")) $("#pay_total").textContent = "—";
  });
}

// ============ TRAINING ============

let trainingList = [];
let currentTrainingTasks = [];
let uploadedVideoUrl = '';

async function loadTraining() {
  try {
    trainingList = await api('/api/training');
    renderTrainingList(trainingList);
  } catch (err) {
    console.error('Klaida kraunant mokymus:', err);
  }
}

function renderTrainingList(training) {
  const list = $("#trainingList");
  if (!list) return;

  if (training.length === 0) {
    list.innerHTML = '<div class="muted">Nėra mokymų.</div>';
    return;
  }

  list.innerHTML = training.map(t => `
    <div class="training-item" style="margin-bottom:12px; padding:12px; border:1px solid var(--border); border-radius:12px; background:rgba(255,255,255,.03);">
      <div style="display:flex; justify-content:space-between; align-items:start; gap:12px;">
        <div style="flex:1;">
          <div class="v" style="font-weight:600; margin-bottom:4px;">${escapeHtml(t.title)}</div>
          <div class="muted" style="font-size:12px;">
            ${t.tasks?.length || 0} užduotys •
            ${t.videoUrl || t.localVideoUrl ? 'Su video' : 'Be video'}
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn-small btn-edit" onclick="editTraining(${t.id})">Redaguoti</button>
          <button class="btn-small btn-danger" onclick="deleteTraining(${t.id})">Ištrinti</button>
        </div>
      </div>
      ${t.videoUrl || t.localVideoUrl ? `
        <div style="margin-top:10px;">
          ${getVideoPreviewHtml(t.videoUrl, t.localVideoUrl, true)}
        </div>
      ` : ''}
    </div>
  `).join('');
}

function getVideoPreviewHtml(youtubeUrl, localUrl, small = false) {
  const height = small ? '150' : '250';

  if (youtubeUrl) {
    const videoId = extractYouTubeId(youtubeUrl);
    if (videoId) {
      return `<iframe width="100%" height="${height}" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen style="border-radius:8px;"></iframe>`;
    }
  }

  if (localUrl) {
    return `<video width="100%" height="${height}" controls style="border-radius:8px;"><source src="${localUrl}" type="video/mp4">Naršyklė nepalaiko video.</video>`;
  }

  return '';
}

function extractYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

window.editTraining = function(id) {
  const t = trainingList.find(tr => tr.id === id);
  if (!t) return;

  $("#t_editId").value = id;
  $("#t_title").value = t.title || '';
  $("#t_text").value = t.text || '';
  $("#t_videoUrl").value = t.videoUrl || '';
  uploadedVideoUrl = t.localVideoUrl || '';

  currentTrainingTasks = (t.tasks || []).map(task => ({ ...task }));
  renderTasksList();

  updateVideoPreview();

  $("#trainingFormTitle").textContent = 'Redaguoti mokymą';

  // Scroll to form
  $("#training").scrollIntoView({ behavior: 'smooth' });
};

window.deleteTraining = async function(id) {
  if (!confirm('Ar tikrai norite ištrinti šį mokymą?')) return;

  try {
    await api(`/api/training/${id}`, { method: 'DELETE' });
    await loadTraining();
    clearTrainingForm();
  } catch (err) {
    alert('Klaida: ' + err.message);
  }
};

function renderTasksList() {
  const list = $("#tasksList");
  if (!list) return;

  if (currentTrainingTasks.length === 0) {
    list.innerHTML = '<div class="muted" style="font-size:12px;">Nėra užduočių.</div>';
    return;
  }

  list.innerHTML = currentTrainingTasks.map((task, i) => `
    <div style="display:flex; align-items:center; gap:8px; padding:8px; background:rgba(255,255,255,.03); border-radius:8px; margin-bottom:6px;">
      <span style="flex:1;">${escapeHtml(task.title)}</span>
      <button class="btn-small btn-danger" onclick="removeTask(${i})">×</button>
    </div>
  `).join('');
}

window.removeTask = function(index) {
  currentTrainingTasks.splice(index, 1);
  renderTasksList();
};

function addTask() {
  const input = $("#newTaskInput");
  const title = input?.value.trim();
  if (!title) return;

  currentTrainingTasks.push({ title, done: false });
  input.value = '';
  renderTasksList();
}

function updateVideoPreview() {
  const preview = $("#videoPreview");
  const container = $("#videoPreviewContainer");
  const youtubeUrl = $("#t_videoUrl")?.value.trim();

  if (youtubeUrl || uploadedVideoUrl) {
    preview.style.display = 'block';
    container.innerHTML = getVideoPreviewHtml(youtubeUrl, uploadedVideoUrl);
  } else {
    preview.style.display = 'none';
    container.innerHTML = '';
  }
}

async function uploadVideo(file) {
  const formData = new FormData();
  formData.append('video', file);

  try {
    const res = await fetch('/api/upload/video', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.url;
  } catch (err) {
    alert('Video įkėlimo klaida: ' + err.message);
    return null;
  }
}

async function saveTraining() {
  const title = $("#t_title")?.value.trim();
  const text = $("#t_text")?.value.trim();
  const videoUrl = $("#t_videoUrl")?.value.trim();
  const editId = $("#t_editId")?.value;

  if (!title) {
    alert('Įveskite pavadinimą');
    return;
  }

  // Check if there's a file to upload
  const videoFile = $("#t_videoFile")?.files?.[0];
  let localVideoUrl = uploadedVideoUrl;

  if (videoFile) {
    const uploadUrl = await uploadVideo(videoFile);
    if (uploadUrl) {
      localVideoUrl = uploadUrl;
    }
  }

  const data = {
    title,
    text,
    videoUrl,
    localVideoUrl,
    tasks: currentTrainingTasks
  };

  try {
    if (editId) {
      await api(`/api/training/${editId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      alert('Mokymas atnaujintas');
    } else {
      await api('/api/training', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      alert('Mokymas sukurtas');
    }
    clearTrainingForm();
    await loadTraining();
  } catch (err) {
    alert('Klaida: ' + err.message);
  }
}

function clearTrainingForm() {
  $("#t_editId").value = '';
  $("#t_title").value = '';
  $("#t_text").value = '';
  $("#t_videoUrl").value = '';
  $("#t_videoFile").value = '';
  // Revoke blob URL to prevent memory leak
  if (uploadedVideoUrl && uploadedVideoUrl.startsWith('blob:')) {
    URL.revokeObjectURL(uploadedVideoUrl);
  }
  uploadedVideoUrl = '';
  currentTrainingTasks = [];
  renderTasksList();
  updateVideoPreview();
  $("#trainingFormTitle").textContent = 'Pridėti mokymą';
}

function initTraining() {
  const saveBtn = $("#saveTraining");
  if (saveBtn) {
    saveBtn.addEventListener("click", saveTraining);
  }

  const clearBtn = $("#clearTrainingForm");
  if (clearBtn) {
    clearBtn.addEventListener("click", clearTrainingForm);
  }

  const addTaskBtn = $("#addTaskBtn");
  if (addTaskBtn) {
    addTaskBtn.addEventListener("click", addTask);
  }

  const newTaskInput = $("#newTaskInput");
  if (newTaskInput) {
    newTaskInput.addEventListener("keypress", (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addTask();
      }
    });
  }

  const videoUrlInput = $("#t_videoUrl");
  if (videoUrlInput) {
    videoUrlInput.addEventListener("input", updateVideoPreview);
  }

  const videoFileInput = $("#t_videoFile");
  if (videoFileInput) {
    videoFileInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) {
        // Revoke old blob URL to prevent memory leak
        if (uploadedVideoUrl && uploadedVideoUrl.startsWith('blob:')) {
          URL.revokeObjectURL(uploadedVideoUrl);
        }
        // Show local preview
        uploadedVideoUrl = URL.createObjectURL(file);
        updateVideoPreview();
      }
    });
  }

  renderTasksList();
}

// ============ FEED ============

async function loadFeed() {
  try {
    const feed = await api('/api/feed');
    renderFeed(feed);
  } catch (err) {
    console.error('Klaida kraunant pranešimus:', err);
  }
}

function renderFeed(feed) {
  const list = $("#feedList");
  if (!list) return;

  if (feed.length === 0) {
    list.innerHTML = '<div class="muted">Siena tuščia.</div>';
    return;
  }

  list.innerHTML = feed.map(p => `
    <div class="post">
      <div class="posthead">
        <div class="who">
          <div class="avatar"></div>
          <div>
            <div class="name">${escapeHtml(p.author || "—")}</div>
            <div class="meta">${formatDate(p.createdAt)}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          ${p.tag ? `<span class="tag">${escapeHtml(p.tag)}</span>` : ''}
          <button class="btn-small btn-danger" onclick="deleteFeedPost(${p.id})">×</button>
        </div>
      </div>
      <p>${escapeHtml(p.text || "")}</p>
    </div>
  `).join("");
}

window.deleteFeedPost = async function(id) {
  if (!confirm('Ištrinti pranešimą?')) return;

  try {
    await api(`/api/feed/${id}`, { method: 'DELETE' });
    await loadFeed();
  } catch (err) {
    alert('Klaida: ' + err.message);
  }
};

async function postFeedMessage() {
  const author = $("#f_author")?.value || 'HR';
  const tag = $("#f_tag")?.value.trim() || '';
  const text = $("#f_text")?.value.trim() || '';

  if (!text) {
    alert("Įrašyk pranešimo tekstą.");
    return;
  }

  try {
    await api('/api/feed', {
      method: 'POST',
      body: JSON.stringify({ author, tag, text })
    });
    $("#f_text").value = "";
    $("#f_tag").value = "";
    await loadFeed();
  } catch (err) {
    alert('Klaida: ' + err.message);
  }
}

function initFeed() {
  const postBtn = $("#postMsg");
  if (postBtn) {
    postBtn.addEventListener("click", postFeedMessage);
  }

  const clearBtn = $("#clearFeed");
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      if (confirm("Tikrai išvalyti visus pranešimus?")) {
        const feed = await api('/api/feed');
        for (const post of feed) {
          await api(`/api/feed/${post.id}`, { method: 'DELETE' });
        }
        await loadFeed();
      }
    });
  }
}

// ============ USERS MANAGEMENT ============

let usersList = [];

async function loadUsers() {
  try {
    usersList = await api('/api/users');
    renderUsersList();
  } catch (err) {
    console.error('Klaida kraunant vartotojus:', err);
  }
}

function renderUsersList() {
  const list = $("#usersList");
  if (!list) return;

  if (usersList.length === 0) {
    list.innerHTML = '<div class="muted">Nėra vartotojų.</div>';
    return;
  }

  list.innerHTML = usersList.map(u => {
    const emp = employees.find(e => e.id === u.employeeId);
    const empName = emp ? `${emp.firstName} ${emp.lastName}` : '—';

    return `
      <div class="employee-item" data-id="${u.id}">
        <div class="employee-info">
          <div class="employee-name">${escapeHtml(u.username)}</div>
          <div class="employee-meta">${u.role === 'admin' ? 'Administratorius' : 'Darbuotojas'} • Susietas: ${escapeHtml(empName)}</div>
        </div>
        <div class="employee-actions">
          <button class="btn-small btn-edit" onclick="editUser(${u.id})">Redaguoti</button>
          <button class="btn-small btn-danger" onclick="deleteUser(${u.id})">Ištrinti</button>
        </div>
      </div>
    `;
  }).join('');
}

window.editUser = function(id) {
  const u = usersList.find(us => us.id === id);
  if (!u) return;

  $("#u_editId").value = id;
  $("#u_username").value = u.username || '';
  $("#u_password").value = '';
  $("#u_role").value = u.role || 'employee';
  $("#u_employeeId").value = u.employeeId || '';
  if ($("#u_email")) $("#u_email").value = u.email || '';
  $("#userFormTitle").textContent = 'Redaguoti vartotoją';

  // Switch to users tab
  $$("#nav button").forEach(b => b.classList.remove("active"));
  $("[data-target='users']").classList.add("active");
  $$(".section").forEach(s => s.classList.remove("active"));
  $("#users").classList.add("active");
};

window.deleteUser = async function(id) {
  if (!confirm('Ar tikrai norite ištrinti šį vartotoją?')) return;

  try {
    await api(`/api/users/${id}`, { method: 'DELETE' });
    await loadUsers();
    clearUserForm();
  } catch (err) {
    alert('Klaida: ' + err.message);
  }
};

async function saveUser() {
  const editId = $("#u_editId")?.value;
  const username = $("#u_username")?.value.trim();
  const password = $("#u_password")?.value;
  const role = $("#u_role")?.value;
  const employeeId = parseInt($("#u_employeeId")?.value) || null;

  if (!username) {
    alert('Įveskite vartotojo vardą');
    return;
  }

  if (!editId && !password) {
    alert('Įveskite slaptažodį');
    return;
  }

  const data = { username, role, employeeId, email: $("#u_email")?.value.trim() || '' };
  if (password) {
    data.password = password;
  }

  try {
    if (editId) {
      await api(`/api/users/${editId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      alert('Vartotojas atnaujintas');
    } else {
      await api('/api/users', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      alert('Vartotojas sukurtas');
    }
    clearUserForm();
    await loadUsers();
  } catch (err) {
    alert('Klaida: ' + err.message);
  }
}

function clearUserForm() {
  $("#u_editId").value = '';
  $("#u_username").value = '';
  $("#u_password").value = '';
  $("#u_role").value = 'employee';
  $("#u_employeeId").value = '';
  if ($("#u_email")) $("#u_email").value = '';
  $("#userFormTitle").textContent = 'Sukurti vartotoją';
}

function initUsers() {
  const saveBtn = $("#saveUser");
  if (saveBtn) {
    saveBtn.addEventListener("click", saveUser);
  }

  const clearBtn = $("#clearUserForm");
  if (clearBtn) {
    clearBtn.addEventListener("click", clearUserForm);
  }
}

// ============ EMPLOYEE SEARCH ============

function initEmployeeSearch() {
  const searchInput = $("#employeeSearch");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase().trim();
      if (!query) {
        renderEmployeesList();
        return;
      }

      const filtered = employees.filter(emp => {
        const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
        const badge = (emp.badge || '').toLowerCase();
        const role = (emp.role || '').toLowerCase();
        const dept = (emp.department || '').toLowerCase();
        return fullName.includes(query) || badge.includes(query) || role.includes(query) || dept.includes(query);
      });

      renderFilteredEmployees(filtered);
    });
  }
}

function renderFilteredEmployees(filtered) {
  const list = $("#employeesList");
  if (!list) return;

  if (filtered.length === 0) {
    list.innerHTML = '<div class="muted">Nerasta darbuotojų.</div>';
    return;
  }

  list.innerHTML = filtered.map(emp => `
    <div class="employee-item" data-id="${emp.id}">
      <div class="employee-info">
        <div class="employee-name">${escapeHtml(emp.firstName)} ${escapeHtml(emp.lastName)}</div>
        <div class="employee-meta">${escapeHtml(emp.role)} • ${escapeHtml(emp.department)} • Tabelis: ${escapeHtml(emp.badge)}</div>
      </div>
      <div class="employee-actions">
        <button class="btn-small btn-edit" onclick="editEmployee(${emp.id})">Redaguoti</button>
        <button class="btn-small btn-danger" onclick="deleteEmployee(${emp.id})">Ištrinti</button>
      </div>
    </div>
  `).join('');
}


// ============ VACATION REQUESTS ============

function vacationStatusBadge(status) {
  const map = {
    pending: '<span class="tag">Laukia</span>',
    approved: '<span class="tag" style="background:#dcfce7;color:#166534;border-color:#bbf7d0;">Patvirtinta</span>',
    rejected: '<span class="tag" style="background:#fee2e2;color:#991b1b;border-color:#fecaca;">Atmesta</span>'
  };
  return map[status] || `<span class="tag">${escapeHtml(status || '—')}</span>`;
}

async function loadVacationRequests() {
  const el = document.getElementById('vac_admin_list');
  if (!el) return;

  try {
    const data = await api('/api/vacation-requests');

    if (!data.length) {
      el.innerHTML = '<div class="muted">Atostogų prašymų kol kas nėra.</div>';
      return;
    }

    el.innerHTML = data.map(r => {
      const emp = employees.find(e => e.id === r.employeeId);
      const empName = emp ? `${emp.firstName} ${emp.lastName}` : `Darbuotojas #${r.employeeId}`;
      const meta = emp ? `${escapeHtml(emp.role || '—')} • Tabelis: ${escapeHtml(emp.badge || '—')}` : '—';
      return `
        <article class="vacation-admin-item">
          <div>
            <div class="vacation-admin-title">${escapeHtml(empName)}</div>
            <div class="vacation-admin-sub">${meta}</div>
            <div class="vacation-admin-metrics">
              <span class="vacation-pill">${escapeHtml(r.from)} – ${escapeHtml(r.to)}</span>
              <span class="vacation-pill">${r.dayCount || '—'} d.</span>
              <span class="vacation-pill">Pateikta: ${formatDate(r.createdAt)}</span>
            </div>
            <div class="vacation-admin-note">${escapeHtml(r.note || 'Komentaro nėra')}</div>
            ${r.reviewedAt ? `<div class="employee-meta" style="margin-top:10px;">Peržiūrėta: ${formatDate(r.reviewedAt)} • ${escapeHtml(r.reviewedBy || '—')}</div>` : ''}
          </div>
          <div class="vacation-admin-side">
            ${vacationStatusBadge(r.status)}
            ${r.status === 'pending' ? `
              <div class="vacation-admin-actions">
                <button class="btn-small btn-edit" onclick="approveVac(${r.id})">Patvirtinti</button>
                <button class="btn-small btn-danger" onclick="rejectVac(${r.id})">Atmesti</button>
              </div>
            ` : ''}
          </div>
        </article>
      `;
    }).join('');
  } catch (err) {
    el.innerHTML = `<div class="muted">Klaida kraunant prašymus: ${escapeHtml(err.message)}</div>`;
  }
}

window.approveVac = async function(id) {
  await api(`/api/vacation-requests/${id}/approve`, { method: 'PUT' });
  await loadEmployees();
  fillVacationBalanceEditor();
  await loadVacationRequests();
  alert('Prašymas patvirtintas');
};

window.rejectVac = async function(id) {
  await api(`/api/vacation-requests/${id}/reject`, { method: 'PUT' });
  await loadVacationRequests();
  alert('Prašymas atmestas');
};

function fillVacationBalanceEditor() {
  const select = $("#vacationBalanceEmployee");
  const input = $("#vacationBalanceInput");
  if (!select || !input) return;
  const empId = parseInt(select.value);
  const emp = employees.find(e => e.id === empId);
  if (!emp) {
    input.value = '';
    return;
  }
  input.value = getVacationDaysValue(emp);
}

async function saveVacationBalance() {
  const select = $("#vacationBalanceEmployee");
  const input = $("#vacationBalanceInput");
  if (!select || !input) return;
  const empId = parseInt(select.value);
  if (!empId) {
    alert('Pasirinkite darbuotoją');
    return;
  }
  const emp = employees.find(e => e.id === empId);
  if (!emp) {
    alert('Darbuotojas nerastas');
    return;
  }
  const days = Math.max(0, parseFloat(String(input.value).replace(',', '.')) || 0);
  await api(`/api/employees/${empId}`, {
    method: 'PUT',
    body: JSON.stringify({ ...emp, vacationDays: days, vacationHours: days })
  });
  await loadEmployees();
  fillVacationBalanceEditor();
  await loadVacationRequests();
  $("#vacationBalanceEmployee").value = String(empId);
  fillVacationBalanceEditor();
  alert('Atostogų likutis atnaujintas');
}

function initVacationAdmin() {
  const select = $("#vacationBalanceEmployee");
  const saveBtn = $("#saveVacationBalance");
  if (select) select.addEventListener('change', fillVacationBalanceEditor);
  if (saveBtn) saveBtn.addEventListener('click', saveVacationBalance);
}

// ---------- Initialize all modules ----------
async function init() {
  const isAuth = await checkAuth();
  if (!isAuth) return;

  initNavigation();
  initClock();
  initProfile();
  initSchedule();
  initPayroll();
  initTraining();
  initFeed();
  initUsers();
  initEmployeeSearch();
  initVacationAdmin();

  // Load data
  await loadEmployees();
  fillVacationBalanceEditor();
  await loadVacationRequests();
  await loadFeed();
  await loadTraining();
  await loadUsers();

  // Setup logout button
  const logoutBtn = $("#logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
