const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

let currentUser = null;
let employee = null;
let schedule = null;
let payroll = null;
let training = [];
let trainingProgress = {};
let feed = [];

// ============ UTILITIES ============

function ltDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
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

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function localDateIso(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function currentMonthValue() {
  return `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
}

function currentMonthLabel() {
  const monthNames = ['Sausis','Vasaris','Kovas','Balandis','Gegužė','Birželis','Liepa','Rugpjūtis','Rugsėjis','Spalis','Lapkritis','Gruodis'];
  return `${monthNames[calMonth]} ${calYear}`;
}

function syncMonthLabels() {
  const payLabel = $('#payMonthLabel');
  if (payLabel) payLabel.textContent = currentMonthLabel();
}

async function loadMonthData() {
  await Promise.all([loadSchedule(), loadPayroll()]);
}

// ============ API ============

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

// ============ AUTH ============

async function checkAuth() {
  try {
    currentUser = await api('/api/me');
    if (currentUser.role === 'admin') {
      // Admin should use portal.html
      window.location.href = '/portal.html';
      return false;
    }
    if (!currentUser.employeeId) {
      alert('Vartotojas nepriskirtas darbuotojui');
      window.location.href = '/index.html';
      return false;
    }
    return true;
  } catch (err) {
    window.location.href = '/index.html';
    return false;
  }
}

async function logout() {
  await api('/api/logout', { method: 'POST' });
  window.location.href = '/index.html';
}

// ============ LOAD DATA ============

async function loadEmployeeData() {
  try {
    employee = await api(`/api/employees/${currentUser.employeeId}`);
    renderProfile();
  } catch (err) {
    console.error('Klaida kraunant darbuotojo duomenis:', err);
  }
}

async function loadSchedule() {
  try {
    schedule = await api(`/api/schedules/employee/${currentUser.employeeId}?period=${encodeURIComponent(currentMonthValue())}`);
    renderSchedule();
  } catch (err) {
    console.log('Nėra grafiko');
    schedule = null;
    renderSchedule();
  }
}

async function loadPayroll() {
  try {
    payroll = await api(`/api/payroll/employee/${currentUser.employeeId}?period=${encodeURIComponent(currentMonthValue())}`);
    renderPayroll();
  } catch (err) {
    console.log('Nėra algos duomenų');
    payroll = null;
    renderPayroll();
  }
}

async function loadTraining() {
  try {
    training = await api('/api/training');
    trainingProgress = await api('/api/training/progress');
    renderTraining();
  } catch (err) {
    console.error('Klaida kraunant mokymus:', err);
  }
}

async function loadFeed() {
  try {
    feed = await api('/api/feed');
    renderFeed();
  } catch (err) {
    console.error('Klaida kraunant pranešimus:', err);
  }
}

// ============ CLOCK ============

function initClock() {
  function tick() {
    const el = $("#clock");
    if (el) {
      el.textContent = ltDateTime(new Date().toISOString());
    }
  }
  tick();
  setInterval(tick, 30_000);
}

// ============ NAVIGATION ============

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

// ============ RENDER PROFILE ============

function renderProfile() {
  if (!employee) return;

  const pName = $("#p_name");
  const pBadge = $("#p_badge");
  const pRole = $("#p_role");
  const pDept = $("#p_dept");
  const pVac = $("#p_vac");
  const pShiftType = $("#p_shiftType");
  const pManager = $("#p_manager");
  const sideUser = $("#sideUser");
  const sideStatus = $("#sideStatus");
  const lastLogin = $("#lastLogin");
  const payEmployee = $("#pay_employee");
  const periodBadge = $("#periodBadge");
  const shiftLabel = $("#shiftLabel");
  const vacBalance = $("#vac_balance");

  if (pName) pName.textContent = `${employee.firstName} ${employee.lastName}`;
  if (pBadge) pBadge.textContent = employee.badge;
  if (pRole) pRole.textContent = employee.role;
  if (pDept) pDept.textContent = employee.department;
  const vacationDays = getVacationDaysValue(employee);
  if (pVac) pVac.textContent = `${vacationDays} d.`;
  if (pShiftType) pShiftType.textContent = employee.scheduleType || '—';
  if (pManager) pManager.textContent = employee.manager || '—';

  if (sideUser) sideUser.textContent = `${employee.firstName} ${employee.lastName} (tabelis ${employee.badge})`;
  if (sideStatus) sideStatus.textContent = employee.status || 'Aktyvus';
  if (lastLogin) lastLogin.textContent = ltDateTime(new Date().toISOString());

  if (payEmployee) payEmployee.textContent = `${employee.firstName} ${employee.lastName} • ${employee.badge}`;
  if (shiftLabel) shiftLabel.textContent = employee.scheduleType || '—';
  if (vacBalance) vacBalance.textContent = `${vacationDays} d.`;
}

// ============ RENDER SCHEDULE ============

// ── Calendar state ───────────────────────────────────────────────────────────
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-based

function renderSchedule() {
  if (!schedule) {
    renderCalendar({}, calYear, calMonth);
    const grid = $('#calendarGrid');
    if (grid) grid.innerHTML += '<div style="color:#94a3b8;padding:20px;grid-column:1/-1;">Šiam mėnesiui grafikas dar nepriskirtas.</div>';
    wireCalendarNavigation();
    return;
  }

  const validEntries = Array.isArray(schedule.entries)
    ? schedule.entries.filter(e => /^\d{4}-\d{2}-\d{2}$/.test(String(e.date || '')))
    : [];

  if (!validEntries.length && schedule.imageUrl) {
    const grid = $("#calendarGrid");
    if (grid) grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;"><img src="${escapeHtml(schedule.imageUrl)}" style="max-width:100%;border-radius:8px;" /></div>`;
    return;
  }

  if (!validEntries.length) {
    const grid = $("#calendarGrid");
    if (grid) grid.innerHTML = '<div style="color:#94a3b8;padding:20px;grid-column:1/-1;">Grafikas dar nepriskirtas.</div>';
    return;
  }

  // Build lookup: "YYYY-MM-DD" -> entry
  const entryMap = {};
  validEntries.forEach(e => {
    if (e.date) entryMap[e.date] = e;
  });

  renderCalendar(entryMap, calYear, calMonth);
  wireCalendarNavigation();
}

function wireCalendarNavigation() {
  const prevBtn = $('#calPrev');
  const nextBtn = $('#calNext');
  if (prevBtn) prevBtn.onclick = async () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    await loadMonthData();
  };
  if (nextBtn) nextBtn.onclick = async () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    await loadMonthData();
  };

  const payPrev = $('#payPrev');
  const payNext = $('#payNext');
  if (payPrev) payPrev.onclick = async () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    await loadMonthData();
  };
  if (payNext) payNext.onclick = async () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    await loadMonthData();
  };
}

function updateScheduleMonthInfo(entryMap, year, month) {
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const entries = Object.values(entryMap)
    .filter(e => String(e.date || '').startsWith(monthKey))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const workEntries = entries.filter(e => (parseFloat(e.hours) || 0) > 0);
  const totalHours = Math.round(workEntries.reduce((sum, e) => sum + (parseFloat(e.hours) || 0), 0) * 100) / 100;
  const MONTHLY_THRESHOLD = 160;
  const overtimeHours = totalHours > MONTHLY_THRESHOLD ? Math.round((totalHours - MONTHLY_THRESHOLD) * 100) / 100 : 0;

  const schedTotal = $("#schedTotal");
  const schedDays  = $("#schedDays");
  const schedOt    = $("#schedOt");
  if (schedTotal) schedTotal.textContent = `${totalHours} val.`;
  if (schedDays)  schedDays.textContent  = `${workEntries.length} d.`;
  if (schedOt)    schedOt.textContent    = overtimeHours > 0 ? `${overtimeHours} val.` : '0 val.';

  const banner = $("#nextShiftBanner");
  if (!banner) return;

  if (!workEntries.length) {
    banner.style.display = 'none';
    return;
  }

  const today = localDateIso();
  const todayMonth = today.slice(0, 7);
  let next = null;

  // Jei žiūrimas dabartinis arba ateities mėnuo, rodoma artimiausia būsima pamaina.
  // Jei žiūrimas praėjęs mėnuo, rodoma pirma to mėnesio pamaina, kad neatsirastų neigiamos dienos.
  if (monthKey >= todayMonth) {
    next = workEntries.find(x => x.date >= today) || workEntries[0];
  } else {
    next = workEntries[0];
  }

  const nextDate = $("#nextDate");
  const nextTime = $("#nextTime");
  const nextNote = $("#nextNote");
  const nextCountdown = $("#nextCountdown");

  const dayNames = { Pn:'Pirmadienis', An:'Antradienis', Tr:'Trečiadienis', Kt:'Ketvirtadienis', Pt:'Penktadienis', Še:'Šeštadienis', Sk:'Sekmadienis' };
  const fullDay = dayNames[next.day] || next.day || '';

  banner.style.display = 'block';
  if (nextDate) nextDate.textContent = `${fullDay}, ${next.date}`;
  if (nextTime) nextTime.textContent = next.start && next.end ? `${next.start} – ${next.end}  (${next.hours} val.)` : `${next.hours} val.`;
  if (nextNote) nextNote.textContent = next.note || '';

  if (nextCountdown) {
    const diff = Math.ceil((new Date(`${next.date}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
    if (diff === 0) nextCountdown.textContent = '📍 Šiandien';
    else if (diff === 1) nextCountdown.textContent = '⏰ Rytoj';
    else if (diff > 1) nextCountdown.textContent = `⏳ Po ${diff} d.`;
    else nextCountdown.textContent = 'Pasirinktas mėnuo';
  }
}

function renderCalendar(entryMap, year, month) {
  const grid = $("#calendarGrid");
  const label = $("#calMonthLabel");
  if (!grid) return;

  const monthNames = ['Sausis','Vasaris','Kovas','Balandis','Gegužė','Birželis','Liepa','Rugpjūtis','Rugsėjis','Spalis','Lapkritis','Gruodis'];
  if (label) label.textContent = `${monthNames[month]} ${year}`;
  syncMonthLabels();

  grid.innerHTML = '';

  // Day headers Mon–Sun
  ['Pr','An','Tr','Kt','Pt','Še','Sk'].forEach(d => {
    const el = document.createElement('div');
    el.textContent = d;
    el.style.cssText = 'text-align:center;font-size:11px;font-weight:600;color:#94a3b8;padding:4px 0;';
    grid.appendChild(el);
  });

  const firstDay = new Date(year, month, 1);
  // Monday-based offset
  let offset = firstDay.getDay() - 1;
  if (offset < 0) offset = 6;

  for (let i = 0; i < offset; i++) {
    grid.appendChild(document.createElement('div'));
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = localDateIso();

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const entry = entryMap[dateStr];
    const hours = entry ? (parseFloat(entry.hours) || 0) : 0;
    const shift = entry?.shift || '';
    const isToday = dateStr === todayStr;
    const isWeekend = ((offset + day - 1) % 7) >= 5;

    let bg = '#f1f5f9';
    let color = '#94a3b8';
    let border = '1px solid #e2e8f0';

    if (hours > 0) {
      if (shift === 'V') { bg = '#fef2f2'; color = '#dc2626'; border = '1px solid #fecaca'; }
      else if (shift === 'N') { bg = '#f5f3ff'; color = '#7c3aed'; border = '1px solid #ddd6fe'; }
      else { bg = '#f0fdf4'; color = '#0f766e'; border = '1px solid #bbf7d0'; }
    } else if (isWeekend) {
      bg = '#fafafa'; color = '#cbd5e1';
    }

    const el = document.createElement('div');
    el.style.cssText = `background:${bg};border:${isToday ? '2px solid #0f766e' : border};border-radius:8px;padding:6px 4px;text-align:center;cursor:${entry ? 'pointer' : 'default'};min-height:52px;position:relative;transition:.15s;`;

    el.innerHTML = `
      <div style="font-size:12px;font-weight:${isToday?'700':'500'};color:${isToday?'#0f766e':color};">${day}</div>
      ${hours > 0 ? `<div style="font-size:10px;font-weight:600;color:${color};margin-top:2px;">${hours}h</div>` : ''}
      ${entry?.start && entry?.end ? `<div style="font-size:9px;color:${color};opacity:.8;">${entry.start}–${entry.end}</div>` : ''}
      ${isToday ? '<div style="position:absolute;top:3px;right:3px;width:5px;height:5px;background:#0f766e;border-radius:50%;"></div>' : ''}
    `;

    if (entry) {
      el.title = `${dateStr}${entry.start ? ' | ' + entry.start + '–' + entry.end : ''} | ${hours} val.${entry.note ? ' | ' + entry.note : ''}`;
      el.onmouseenter = () => { el.style.transform = 'scale(1.04)'; el.style.boxShadow = '0 2px 8px rgba(0,0,0,.1)'; };
      el.onmouseleave = () => { el.style.transform = ''; el.style.boxShadow = ''; };
    }

    grid.appendChild(el);
  }

  updateScheduleMonthInfo(entryMap, year, month);
}


// ============ RENDER PAYROLL ============

function renderPayroll() {
  syncMonthLabels();
  const payBruto = $("#pay_bruto");
  const payTotal = $("#pay_total");
  const payBrutoBreakdown = $("#pay_bruto_breakdown");

  if (!payroll) {
    // Try auto-calculate from schedule if available
    if (schedule && Array.isArray(schedule.entries) && schedule.entries.length > 0) {
      renderAutoPayrollFromSchedule();
    } else {
      const payPeriod = $('#pay_period');
      if (payPeriod) payPeriod.textContent = currentMonthValue();
      if (payBruto) payBruto.textContent = "—";
      if (payTotal) payTotal.textContent = "—";
    }
    return;
  }

  const base = payroll.hours * payroll.rate;
  const ot = payroll.overtimeHours * payroll.rate * payroll.overtimeCoef;
  const bruto = base + ot;
  const total = bruto + payroll.bonus - payroll.deductions;

  const payPeriod = $("#pay_period");
  const payHours = $("#pay_hours");
  const payRate = $("#pay_rate");
  const payOt = $("#pay_ot");
  const payBonus = $("#pay_bonus");
  const payDeduct = $("#pay_deduct");
  const payNote = $("#pay_note");
  const payUpdated = $("#pay_updated");

  if (payPeriod) payPeriod.textContent = payroll.period || currentMonthValue();
  if (payHours) payHours.textContent = `${payroll.hours} val.`;
  if (payRate) payRate.textContent = `${euro(payroll.rate)} / val.`;
  if (payOt) payOt.textContent = `${payroll.overtimeHours} val. (${payroll.overtimeCoef}x)`;
  if (payBonus) payBonus.textContent = euro(payroll.bonus);
  if (payDeduct) payDeduct.textContent = euro(payroll.deductions);
  if (payNote) payNote.textContent = payroll.note || "—";

  if (payBruto) payBruto.textContent = euro(bruto);
  if (payTotal) payTotal.textContent = euro(total);
  if (payBrutoBreakdown) payBrutoBreakdown.textContent = `Bazė: ${euro(base)} • Viršval.: ${euro(ot)}`;
  if (payUpdated) payUpdated.textContent = ltDateTime(payroll.updatedAt);
}

function renderAutoPayrollFromSchedule() {
  // Darbuotojo puslapyje neberodome žalios „Automatinis skaičiavimas iš grafiko“ kortelės.
  // Paliekame tik valandų užpildymą atlyginimo kortelėje pagal pasirinkto mėnesio grafiką.
  const oldAutoCalc = $("#pay_auto_calc");
  if (oldAutoCalc) oldAutoCalc.remove();

  if (!schedule || !Array.isArray(schedule.entries) || schedule.entries.length === 0) return;

  let totalHours = 0;
  schedule.entries.forEach(entry => {
    const h = parseFloat(entry.hours) || 0;
    if (h > 0) totalHours += h;
  });

  totalHours = Math.round(totalHours * 100) / 100;

  const payHours = $("#pay_hours");
  const payBruto = $("#pay_bruto");
  const payTotal = $("#pay_total");
  const payBrutoBreakdown = $("#pay_bruto_breakdown");

  if (payHours) payHours.textContent = `${totalHours} val. (iš grafiko)`;
  if (payBruto) payBruto.textContent = "—";
  if (payTotal) payTotal.textContent = "—";
  if (payBrutoBreakdown) payBrutoBreakdown.textContent = `Valandos iš grafiko • įkainis dar nenustatytas`;
}

// ============ RENDER TRAINING ============

function extractYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

// Sanitize HTML - only allow safe tags
function sanitizeHtml(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  // Remove script tags and event handlers
  div.querySelectorAll('script').forEach(el => el.remove());
  div.querySelectorAll('*').forEach(el => {
    // Remove all event handlers
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    });
    // Remove javascript: links
    if (el.tagName === 'A' && el.href && el.href.toLowerCase().startsWith('javascript:')) {
      el.removeAttribute('href');
    }
  });
  return div.innerHTML;
}

function isTaskDone(trainingId, taskIndex) {
  const key = `${trainingId}_${taskIndex}`;
  return trainingProgress[key] === true;
}

function renderTraining() {
  const trainTitle = $("#train_title");
  const trainText = $("#train_text");
  const trainVideoWrap = $("#train_videoWrap");
  const trainTasks = $("#train_tasks");

  if (training.length === 0) {
    if (trainTitle) trainTitle.textContent = "Nėra mokymų";
    if (trainText) trainText.innerHTML = "<div class='muted'>Mokymai dar nepridėti.</div>";
    if (trainVideoWrap) trainVideoWrap.style.display = "none";
    if (trainTasks) trainTasks.innerHTML = "";
    return;
  }

  // Render all trainings
  let allHtml = '';
  let allTasksHtml = '';

  training.forEach((t, tIndex) => {
    // Training title and text
    if (tIndex > 0) {
      allHtml += '<div class="hr" style="margin:20px 0;"></div>';
    }
    allHtml += `<h3 style="margin:0 0 10px; font-size:15px;">${escapeHtml(t.title)}</h3>`;
    allHtml += `<div style="line-height:1.6; color:#1e293b;">${sanitizeHtml(t.text || '')}</div>`;

    // Video
    if (t.videoUrl) {
      const videoId = extractYouTubeId(t.videoUrl);
      if (videoId) {
        allHtml += `<div class="video" style="margin-top:12px;"><iframe src="https://www.youtube.com/embed/${videoId}" allowfullscreen></iframe></div>`;
      }
    } else if (t.localVideoUrl) {
      allHtml += `<div style="margin-top:12px;"><video width="100%" controls style="border-radius:8px;"><source src="${escapeHtml(t.localVideoUrl)}" type="video/mp4">Naršyklė nepalaiko video.</video></div>`;
    }

    // Tasks for this training
    if (t.tasks && t.tasks.length > 0) {
      if (tIndex > 0) {
        allTasksHtml += '<div class="hr" style="margin:16px 0;"></div>';
      }
      allTasksHtml += `<div class="muted" style="font-size:11px; margin-bottom:8px;">${escapeHtml(t.title)}</div>`;

      t.tasks.forEach((task, taskIndex) => {
        const done = isTaskDone(t.id, taskIndex);
        allTasksHtml += `
          <div class="kv" style="cursor:pointer; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <input type="checkbox" ${done ? 'checked' : ''} data-training-id="${t.id}" data-task-index="${taskIndex}" style="width:18px; height:18px; cursor:pointer;" />
              <div>
                <div class="k">${done ? "Atlikta" : "Neatlikta"}</div>
                <div class="v">${escapeHtml(task.title)}</div>
              </div>
            </div>
            <span class="tag">${done ? "✅" : "⬜"}</span>
          </div>
        `;
      });
    }
  });

  // Update DOM
  if (trainTitle) trainTitle.textContent = training.length === 1 ? training[0].title : `Mokymai (${training.length})`;
  if (trainText) trainText.innerHTML = allHtml;
  if (trainVideoWrap) trainVideoWrap.style.display = "none"; // Videos are inline now
  if (trainTasks) {
    trainTasks.innerHTML = allTasksHtml || '<div class="muted">Nėra užduočių.</div>';

    // Add event listeners for checkboxes
    trainTasks.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', async (e) => {
        const trainingId = e.target.dataset.trainingId;
        const taskIndex = e.target.dataset.taskIndex;
        const done = e.target.checked;

        try {
          const result = await api(`/api/training/${trainingId}/tasks/${taskIndex}`, {
            method: 'PUT',
            body: JSON.stringify({ done })
          });
          // Update local progress
          trainingProgress = result.tasks || {};
          renderTraining();
        } catch (err) {
          console.error('Klaida atnaujinant užduotį:', err);
          e.target.checked = !done; // Revert on error
        }
      });
    });
  }
}


// ============ VACATION REQUESTS ============

function employeeVacationStatusBadge(status) {
  const map = {
    pending: '<span class="tag">Laukia</span>',
    approved: '<span class="tag" style="background:#dcfce7;color:#166534;border-color:#bbf7d0;">Patvirtinta</span>',
    rejected: '<span class="tag" style="background:#fee2e2;color:#991b1b;border-color:#fecaca;">Atmesta</span>'
  };
  return map[status] || `<span class="tag">${escapeHtml(status || '—')}</span>`;
}

async function submitVacation() {
  const from = document.getElementById('vac_from')?.value;
  const to = document.getElementById('vac_to')?.value;
  const note = document.getElementById('vac_note')?.value?.trim() || '';

  if (!from || !to) {
    alert('Pasirinkite atostogų datas');
    return;
  }

  if (to < from) {
    alert('Pabaigos data negali būti ankstesnė už pradžios datą');
    return;
  }

  await api('/api/vacation-requests', {
    method: 'POST',
    body: JSON.stringify({ from, to, note })
  });

  document.getElementById('vac_from').value = '';
  document.getElementById('vac_to').value = '';
  document.getElementById('vac_note').value = '';

  alert('Atostogų prašymas išsiųstas');
  await loadMyVacations();
}

async function loadMyVacations() {
  const el = document.getElementById('vac_list');
  if (!el) return;

  try {
    const data = await api('/api/vacation-requests/me');

    if (!data.length) {
      el.innerHTML = '<div class="muted">Dar nepateikėte nei vieno atostogų prašymo.</div>';
      return;
    }

    el.innerHTML = data.map(r => `
      <article class="vacation-request">
        <div class="vacation-request-top">
          <div>
            <div class="vacation-request-title">${escapeHtml(r.from)} – ${escapeHtml(r.to)}</div>
            <div class="vacation-request-meta">Pateikta: ${ltDateTime(r.createdAt)} • ${r.dayCount || '—'} d.</div>
          </div>
          ${employeeVacationStatusBadge(r.status)}
        </div>
        <p class="vacation-request-note">${escapeHtml(r.note || 'Komentaro nėra')}</p>
        ${r.reviewedAt ? `<div class="vacation-request-foot">Peržiūrėta: ${ltDateTime(r.reviewedAt)}${r.reviewedBy ? ` • ${escapeHtml(r.reviewedBy)}` : ''}</div>` : ''}
      </article>
    `).join('');
  } catch (err) {
    el.innerHTML = `<div class="muted">Klaida kraunant prašymus: ${escapeHtml(err.message)}</div>`;
  }
}

function initVacationEmployee() {
  const btn = document.getElementById('vac_submit');
  if (btn) btn.addEventListener('click', submitVacation);
}

// ============ RENDER FEED ============

function renderFeed() {
  const list = $("#feedList");
  if (!list) return;

  if (feed.length === 0) {
    list.innerHTML = '<div class="muted">Nėra pranešimų.</div>';
    return;
  }

  list.innerHTML = feed.map(p => `
    <div class="post">
      <div class="posthead">
        <div class="who">
          <div class="avatar"></div>
          <div>
            <div class="name">${escapeHtml(p.author || "—")}</div>
            <div class="meta">${ltDateTime(p.createdAt)}</div>
          </div>
        </div>
        ${p.tag ? `<span class="tag">${escapeHtml(p.tag)}</span>` : `<span class="tag">Pranešimas</span>`}
      </div>
      <p>${escapeHtml(p.text || "")}</p>
    </div>
  `).join("");
}

// ============ INIT ============

async function init() {
  const isAuth = await checkAuth();
  if (!isAuth) return;

  initClock();
  initNavigation();
  initVacationEmployee();

  // Load all data
  await loadEmployeeData();
  await loadSchedule();
  await loadPayroll();
  await loadTraining();
  await loadFeed();
  await loadMyVacations();

  // Setup logout button
  const logoutBtn = $("#logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
