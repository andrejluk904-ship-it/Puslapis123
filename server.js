const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const SITE_URL = process.env.SITE_URL || '';

// Resend konfiguracija Railway aplinkai.
// Reikalingi kintamieji Railway Variables skiltyje:
// RESEND_API_KEY, RESEND_FROM_EMAIL, SITE_URL
// RESEND_FROM_EMAIL turi būti iš patvirtinto Resend domeno, pvz.:
// Darbuotojų portalas <noreply@tavo-domenas.lt>
const RESEND_API_URL = 'https://api.resend.com/emails';

async function sendWithResend(payload) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Resend API neprijungtas. Railway Variables turi būti RESEND_API_KEY.');
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'employee-portal/1.0'
    },
    body: JSON.stringify(payload)
  });

  const resultText = await response.text();
  let result;
  try {
    result = resultText ? JSON.parse(resultText) : {};
  } catch (err) {
    result = { message: resultText };
  }

  if (!response.ok) {
    const message = result?.message || result?.error || `Resend klaida: ${response.status}`;
    throw new Error(message);
  }

  return result;
}


const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|webm|mov|avi/;
    const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mime = allowedTypes.test(file.mimetype);
    if (ext || mime) {
      cb(null, true);
    } else {
      cb(new Error('Netinkamas failo tipas'));
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'portal-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Data file paths
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const EMPLOYEES_FILE = path.join(DATA_DIR, 'employees.json');
const SCHEDULES_FILE = path.join(DATA_DIR, 'schedules.json');
const PAYROLL_FILE = path.join(DATA_DIR, 'payroll.json');
const FEED_FILE = path.join(DATA_DIR, 'feed.json');
const TRAINING_FILE = path.join(DATA_DIR, 'training.json');
const TRAINING_PROGRESS_FILE = path.join(DATA_DIR, 'training_progress.json');
const VACATION_FILE = path.join(DATA_DIR, 'vacation_requests.json');
const RESET_TOKENS_FILE = path.join(DATA_DIR, 'reset_tokens.json');

// Helper functions
function readJSON(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function getResetTokens() {
  const tokens = readJSON(RESET_TOKENS_FILE);
  const now = Date.now();
  return Array.isArray(tokens) ? tokens.filter(t => Number(t.expires) > now) : [];
}

function saveResetTokens(tokens) {
  writeJSON(RESET_TOKENS_FILE, tokens);
}

function getBaseUrl(req) {
  if (SITE_URL) return SITE_URL.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

async function sendPasswordResetEmail(toEmail, resetLink) {
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Darbuotojų portalas <onboarding@resend.dev>';

  await sendWithResend({
    from: fromEmail,
    to: [toEmail],
    subject: 'Slaptažodžio atstatymas',
    text: `Sveiki,\n\nNorėdami atstatyti slaptažodį, atidarykite šią nuorodą:\n${resetLink}\n\nNuoroda galioja 1 valandą. Jeigu slaptažodžio atstatymo neprašėte, šį laišką ignoruokite.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <h2>Slaptažodžio atstatymas</h2>
        <p>Norėdami atstatyti slaptažodį, spauskite žemiau esantį mygtuką:</p>
        <p>
          <a href="${resetLink}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">
            Keisti slaptažodį
          </a>
        </p>
        <p>Nuoroda galioja 1 valandą.</p>
        <p style="font-size:13px;color:#64748b">Jeigu mygtukas neveikia, nukopijuokite šią nuorodą į naršyklę:<br>${resetLink}</p>
      </div>
    `
  });
}

function getNextId(items) {
  if (items.length === 0) return 1;
  return Math.max(...items.map(i => i.id)) + 1;
}

function getEmployeeVacationDays(employee) {
  if (!employee) return 0;
  if (employee.vacationDays !== undefined && employee.vacationDays !== null && employee.vacationDays !== '') {
    return Number(employee.vacationDays) || 0;
  }
  if (employee.vacationHours !== undefined && employee.vacationHours !== null && employee.vacationHours !== '') {
    return (Number(employee.vacationHours) || 0) / 8;
  }
  return 0;
}


function normalizePeriod(period) {
  const raw = String(period || '').trim();
  const m = raw.match(/^(\d{4})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}`;
  return raw;
}

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getSchedulePeriod(schedule) {
  const p = normalizePeriod(schedule?.period);
  if (p) return p;
  const first = Array.isArray(schedule?.entries) ? schedule.entries.find(e => e.date)?.date : '';
  return normalizePeriod(first);
}

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Reikia prisijungti' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Tik administratoriams' });
  }
  next();
}

// ============ AUTH ROUTES ============

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const users = readJSON(USERS_FILE);

  const user = users.find(u => u.username === username);
  if (!user) {
    return res.status(401).json({ error: 'Neteisingas prisijungimo vardas arba slaptažodis' });
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ error: 'Neteisingas prisijungimo vardas arba slaptažodis' });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    employeeId: user.employeeId
  };

  res.json({
    success: true,
    user: req.session.user,
    redirect: user.role === 'admin' ? '/portal.html' : '/darbuotojo.html'
  });
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Serve reset password page
app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'reset-password.html'));
});

// ── Forgot password / send reset link through Resend ────────────────────────
app.post('/api/forgot-password', async (req, res) => {
  const { email, username } = req.body;
  const identifier = String(email || username || '').trim().toLowerCase();
  if (!identifier) return res.status(400).json({ error: 'Įveskite vartotojo vardą arba el. paštą' });

  const users = readJSON(USERS_FILE);
  const user = users.find(u =>
    String(u.email || '').trim().toLowerCase() === identifier ||
    String(u.username || '').trim().toLowerCase() === identifier
  );

  if (!user) return res.status(404).json({ error: 'Vartotojas nerastas' });
  if (!user.email) return res.status(400).json({ error: 'Šis vartotojas neturi priskirto el. pašto adreso' });

  const token = crypto.randomBytes(32).toString('hex');
  const tokens = getResetTokens().filter(t => Number(t.userId) !== Number(user.id));
  tokens.push({ token, userId: user.id, expires: Date.now() + 60 * 60 * 1000 });
  saveResetTokens(tokens);

  const resetLink = `${getBaseUrl(req)}/reset-password?token=${token}`;

  try {
    await sendPasswordResetEmail(user.email, resetLink);
    res.json({ success: true, message: 'Atstatymo nuoroda išsiųsta į el. paštą. Nuoroda galioja 1 val.' });
  } catch (err) {
    console.error('Resend siuntimo klaida:', err.message);
    res.status(500).json({ error: 'Nepavyko išsiųsti el. laiško. Patikrinkite Railway Variables: RESEND_API_KEY, RESEND_FROM_EMAIL ir SITE_URL.' });
  }
});

// ── Reset password ───────────────────────────────────────────────────────────
app.post('/api/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Trūksta duomenų' });
  if (password.length < 6) return res.status(400).json({ error: 'Slaptažodis per trumpas (min. 6 simboliai)' });

  const tokens = getResetTokens();
  const entry = tokens.find(t => t.token === token);
  if (!entry) return res.status(400).json({ error: 'Neteisinga arba pasibaigusi nuoroda' });
  if (Date.now() > Number(entry.expires)) {
    saveResetTokens(tokens.filter(t => t.token !== token));
    return res.status(400).json({ error: 'Nuoroda nebegalioja. Bandykite iš naujo.' });
  }

  const users = readJSON(USERS_FILE);
  const idx = users.findIndex(u => Number(u.id) === Number(entry.userId));
  if (idx === -1) return res.status(400).json({ error: 'Vartotojas nerastas' });

  users[idx].password = await bcrypt.hash(password, 10);
  writeJSON(USERS_FILE, users);
  saveResetTokens(tokens.filter(t => t.token !== token));

  res.json({ success: true });
});



// Get current user
app.get('/api/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Neprisijungęs' });
  }
  res.json(req.session.user);
});

// Register new user (admin only)
app.post('/api/users', requireAdmin, async (req, res) => {
  const { username, password, role, employeeId, email } = req.body;
  const users = readJSON(USERS_FILE);

  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Toks vartotojas jau egzistuoja' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = {
    id: getNextId(users),
    username,
    email: email || '',
    password: hashedPassword,
    role: role || 'employee',
    employeeId: employeeId || null
  };

  users.push(newUser);
  writeJSON(USERS_FILE, users);

  res.json({ success: true, user: { ...newUser, password: undefined } });
});

// ============ EMPLOYEES CRUD ============

// Get all employees (admin)
app.get('/api/employees', requireAdmin, (req, res) => {
  const employees = readJSON(EMPLOYEES_FILE);
  res.json(employees);
});

// Get single employee
app.get('/api/employees/:id', requireAuth, (req, res) => {
  const employees = readJSON(EMPLOYEES_FILE);
  const employee = employees.find(e => e.id === parseInt(req.params.id));

  // Employees can only see their own data
  if (req.session.user.role !== 'admin' && req.session.user.employeeId !== parseInt(req.params.id)) {
    return res.status(403).json({ error: 'Prieiga uždrausta' });
  }

  if (!employee) {
    return res.status(404).json({ error: 'Darbuotojas nerastas' });
  }
  res.json(employee);
});

// Create employee (admin)
app.post('/api/employees', requireAdmin, (req, res) => {
  const employees = readJSON(EMPLOYEES_FILE);
  const newEmployee = {
    id: getNextId(employees),
    ...req.body
  };
  employees.push(newEmployee);
  writeJSON(EMPLOYEES_FILE, employees);
  res.json(newEmployee);
});

// Update employee (admin)
app.put('/api/employees/:id', requireAdmin, (req, res) => {
  const employees = readJSON(EMPLOYEES_FILE);
  const index = employees.findIndex(e => e.id === parseInt(req.params.id));

  if (index === -1) {
    return res.status(404).json({ error: 'Darbuotojas nerastas' });
  }

  employees[index] = { ...employees[index], ...req.body, id: parseInt(req.params.id) };
  writeJSON(EMPLOYEES_FILE, employees);
  res.json(employees[index]);
});

// Delete employee (admin)
app.delete('/api/employees/:id', requireAdmin, (req, res) => {
  let employees = readJSON(EMPLOYEES_FILE);
  const index = employees.findIndex(e => e.id === parseInt(req.params.id));

  if (index === -1) {
    return res.status(404).json({ error: 'Darbuotojas nerastas' });
  }

  employees.splice(index, 1);
  writeJSON(EMPLOYEES_FILE, employees);
  res.json({ success: true });
});

// ============ SCHEDULES CRUD ============

// Get all schedules (admin)
app.get('/api/schedules', requireAdmin, (req, res) => {
  const schedules = readJSON(SCHEDULES_FILE);
  const period = normalizePeriod(req.query.period);
  const employeeId = req.query.employeeId ? parseInt(req.query.employeeId) : null;
  let result = schedules;
  if (employeeId) result = result.filter(s => s.employeeId === employeeId);
  if (period) result = result.filter(s => getSchedulePeriod(s) === period);
  res.json(result);
});

// Get schedule by employee and month (?period=YYYY-MM)
app.get('/api/schedules/employee/:employeeId', requireAuth, (req, res) => {
  const schedules = readJSON(SCHEDULES_FILE);
  const employeeId = parseInt(req.params.employeeId);
  const requestedPeriod = normalizePeriod(req.query.period) || getCurrentPeriod();

  if (req.session.user.role !== 'admin' && req.session.user.employeeId !== employeeId) {
    return res.status(403).json({ error: 'Prieiga uždrausta' });
  }

  let schedule = schedules.find(s => s.employeeId === employeeId && getSchedulePeriod(s) === requestedPeriod);

  // Backwards compatibility: if old data had only one schedule and no clear period, return it only when period matches its entries.
  res.json(schedule || null);
});

// Create/Update schedule for employee + month (admin)
app.post('/api/schedules', requireAdmin, (req, res) => {
  const schedules = readJSON(SCHEDULES_FILE);
  const { employeeId, entries, imageUrl, updateType } = req.body;
  const period = normalizePeriod(req.body.period) || getCurrentPeriod();

  if (!employeeId) return res.status(400).json({ error: 'Pasirinkite darbuotoją' });
  if (!period) return res.status(400).json({ error: 'Pasirinkite mėnesį' });

  const existingIndex = schedules.findIndex(s => s.employeeId === employeeId && getSchedulePeriod(s) === period);
  const now = new Date().toISOString();

  if (existingIndex !== -1) {
    if (updateType === 'image') {
      schedules[existingIndex].period = period;
      schedules[existingIndex].imageUrl = imageUrl;
      schedules[existingIndex].imageUpdatedAt = now;
    } else if (updateType === 'csv') {
      schedules[existingIndex].period = period;
      schedules[existingIndex].entries = entries || [];
      schedules[existingIndex].csvUpdatedAt = now;
    } else {
      schedules[existingIndex] = { ...schedules[existingIndex], period, entries: entries || schedules[existingIndex].entries || [] };
      if (imageUrl !== undefined) {
        schedules[existingIndex].imageUrl = imageUrl;
        schedules[existingIndex].imageUpdatedAt = now;
      }
      schedules[existingIndex].csvUpdatedAt = now;
    }
    writeJSON(SCHEDULES_FILE, schedules);
    res.json(schedules[existingIndex]);
  } else {
    const newSchedule = {
      id: getNextId(schedules),
      employeeId,
      period,
      entries: entries || [],
      imageUrl: imageUrl || null,
      csvUpdatedAt: entries && entries.length > 0 ? now : null,
      imageUpdatedAt: imageUrl ? now : null
    };
    schedules.push(newSchedule);
    writeJSON(SCHEDULES_FILE, schedules);
    res.json(newSchedule);
  }
});

// Delete schedule (admin)
app.delete('/api/schedules/:id', requireAdmin, (req, res) => {
  let schedules = readJSON(SCHEDULES_FILE);
  schedules = schedules.filter(s => s.id !== parseInt(req.params.id));
  writeJSON(SCHEDULES_FILE, schedules);
  res.json({ success: true });
});

// ============ PAYROLL CRUD ============

// Get all payroll (admin)
app.get('/api/payroll', requireAdmin, (req, res) => {
  const payroll = readJSON(PAYROLL_FILE);
  const period = normalizePeriod(req.query.period);
  const employeeId = req.query.employeeId ? parseInt(req.query.employeeId) : null;
  let result = payroll;
  if (employeeId) result = result.filter(p => p.employeeId === employeeId);
  if (period) result = result.filter(p => normalizePeriod(p.period) === period);
  res.json(result);
});

// Get payroll by employee and month (?period=YYYY-MM)
app.get('/api/payroll/employee/:employeeId', requireAuth, (req, res) => {
  const payroll = readJSON(PAYROLL_FILE);
  const employeeId = parseInt(req.params.employeeId);
  const period = normalizePeriod(req.query.period) || getCurrentPeriod();

  if (req.session.user.role !== 'admin' && req.session.user.employeeId !== employeeId) {
    return res.status(403).json({ error: 'Prieiga uždrausta' });
  }

  const record = payroll.find(p => p.employeeId === employeeId && normalizePeriod(p.period) === period);
  res.json(record || null);
});

// Create/Update payroll by employee + month (admin)
app.post('/api/payroll', requireAdmin, (req, res) => {
  const payroll = readJSON(PAYROLL_FILE);
  const { employeeId, ...data } = req.body;
  const period = normalizePeriod(data.period) || getCurrentPeriod();

  if (!employeeId) return res.status(400).json({ error: 'Pasirinkite darbuotoją' });

  const existingIndex = payroll.findIndex(p => p.employeeId === employeeId && normalizePeriod(p.period) === period);

  const record = {
    ...data,
    period,
    employeeId,
    updatedAt: new Date().toISOString()
  };

  if (existingIndex !== -1) {
    payroll[existingIndex] = { ...payroll[existingIndex], ...record };
    writeJSON(PAYROLL_FILE, payroll);
    res.json(payroll[existingIndex]);
  } else {
    record.id = getNextId(payroll);
    payroll.push(record);
    writeJSON(PAYROLL_FILE, payroll);
    res.json(record);
  }
});

// Delete payroll (admin)
app.delete('/api/payroll/:id', requireAdmin, (req, res) => {
  let payroll = readJSON(PAYROLL_FILE);
  payroll = payroll.filter(p => p.id !== parseInt(req.params.id));
  writeJSON(PAYROLL_FILE, payroll);
  res.json({ success: true });
});

// ============ FEED CRUD ============

// Get all feed posts
app.get('/api/feed', requireAuth, (req, res) => {
  const feed = readJSON(FEED_FILE);
  res.json(feed.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// Create feed post (admin)
app.post('/api/feed', requireAdmin, (req, res) => {
  const feed = readJSON(FEED_FILE);
  const newPost = {
    id: getNextId(feed),
    ...req.body,
    createdAt: new Date().toISOString()
  };
  feed.push(newPost);
  writeJSON(FEED_FILE, feed);
  res.json(newPost);
});

// Update feed post (admin)
app.put('/api/feed/:id', requireAdmin, (req, res) => {
  const feed = readJSON(FEED_FILE);
  const index = feed.findIndex(f => f.id === parseInt(req.params.id));

  if (index === -1) {
    return res.status(404).json({ error: 'Pranešimas nerastas' });
  }

  feed[index] = { ...feed[index], ...req.body, id: parseInt(req.params.id) };
  writeJSON(FEED_FILE, feed);
  res.json(feed[index]);
});

// Delete feed post (admin)
app.delete('/api/feed/:id', requireAdmin, (req, res) => {
  let feed = readJSON(FEED_FILE);
  feed = feed.filter(f => f.id !== parseInt(req.params.id));
  writeJSON(FEED_FILE, feed);
  res.json({ success: true });
});

// ============ TRAINING CRUD ============

// Get all training
app.get('/api/training', requireAuth, (req, res) => {
  const training = readJSON(TRAINING_FILE);
  res.json(training);
});

// Create training (admin)
app.post('/api/training', requireAdmin, (req, res) => {
  const training = readJSON(TRAINING_FILE);
  const newTraining = {
    id: getNextId(training),
    ...req.body,
    tasks: req.body.tasks || []
  };
  training.push(newTraining);
  writeJSON(TRAINING_FILE, training);
  res.json(newTraining);
});

// Update training (admin)
app.put('/api/training/:id', requireAdmin, (req, res) => {
  const training = readJSON(TRAINING_FILE);
  const index = training.findIndex(t => t.id === parseInt(req.params.id));

  if (index === -1) {
    return res.status(404).json({ error: 'Mokymas nerastas' });
  }

  training[index] = { ...training[index], ...req.body, id: parseInt(req.params.id) };
  writeJSON(TRAINING_FILE, training);
  res.json(training[index]);
});

// Delete training (admin)
app.delete('/api/training/:id', requireAdmin, (req, res) => {
  let training = readJSON(TRAINING_FILE);
  training = training.filter(t => t.id !== parseInt(req.params.id));
  writeJSON(TRAINING_FILE, training);
  res.json({ success: true });
});

// Get training progress for current employee
app.get('/api/training/progress', requireAuth, (req, res) => {
  const employeeId = req.session.user.employeeId;
  if (!employeeId) {
    return res.json({});
  }
  const progress = readJSON(TRAINING_PROGRESS_FILE);
  const employeeProgress = progress.find(p => p.employeeId === employeeId);
  res.json(employeeProgress?.tasks || {});
});

// Update training task status (per-employee progress)
app.put('/api/training/:id/tasks/:taskIndex', requireAuth, (req, res) => {
  const training = readJSON(TRAINING_FILE);
  const trainingId = parseInt(req.params.id);
  const index = training.findIndex(t => t.id === trainingId);

  if (index === -1) {
    return res.status(404).json({ error: 'Mokymas nerastas' });
  }

  const taskIndex = parseInt(req.params.taskIndex);
  if (!training[index].tasks || !training[index].tasks[taskIndex]) {
    return res.status(404).json({ error: 'Užduotis nerasta' });
  }

  // Store progress per employee
  const employeeId = req.session.user.employeeId;
  if (!employeeId) {
    return res.status(400).json({ error: 'Vartotojas nepriskirtas darbuotojui' });
  }

  const progress = readJSON(TRAINING_PROGRESS_FILE);
  let employeeProgress = progress.find(p => p.employeeId === employeeId);

  if (!employeeProgress) {
    employeeProgress = { employeeId, tasks: {} };
    progress.push(employeeProgress);
  }

  // Key format: "trainingId_taskIndex"
  const taskKey = `${trainingId}_${taskIndex}`;
  employeeProgress.tasks[taskKey] = req.body.done;

  writeJSON(TRAINING_PROGRESS_FILE, progress);
  res.json({ success: true, tasks: employeeProgress.tasks });
});

// ============ FILE UPLOAD ============

// Upload video file
app.post('/api/upload/video', requireAdmin, upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nepasirinktas failas' });
  }
  res.json({
    success: true,
    filename: req.file.filename,
    url: '/uploads/' + req.file.filename
  });
});

// Upload image file
app.post('/api/upload/image', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nepasirinktas failas' });
  }
  res.json({
    success: true,
    filename: req.file.filename,
    url: '/uploads/' + req.file.filename
  });
});

// ============ VACATION REQUESTS ============

function calcDays(from, to) {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
}

// Get all vacation requests (admin)
app.get('/api/vacation-requests', requireAdmin, (req, res) => {
  const requests = readJSON(VACATION_FILE);
  res.json(requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// Get own vacation requests (employee/admin self)
app.get('/api/vacation-requests/me', requireAuth, (req, res) => {
  const requests = readJSON(VACATION_FILE);
  const employeeId = req.session.user.employeeId;
  if (!employeeId) return res.json([]);
  const mine = requests.filter(r => r.employeeId === employeeId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(mine);
});

// Create vacation request
app.post('/api/vacation-requests', requireAuth, (req, res) => {
  const employeeId = req.session.user.employeeId;
  if (!employeeId) {
    return res.status(400).json({ error: 'Vartotojas nepriskirtas darbuotojui' });
  }

  const { from, to, note } = req.body;
  if (!from || !to) {
    return res.status(400).json({ error: 'Nurodykite datas' });
  }

  const dayCount = calcDays(from, to);
  if (!dayCount) {
    return res.status(400).json({ error: 'Neteisingas laikotarpis' });
  }

  const employees = readJSON(EMPLOYEES_FILE);
  const employee = employees.find(e => e.id === employeeId);
  const availableDays = getEmployeeVacationDays(employee);
  if (availableDays && dayCount > availableDays) {
    return res.status(400).json({ error: 'Nepakanka atostogų dienų likučio' });
  }

  const requests = readJSON(VACATION_FILE);
  const newReq = {
    id: getNextId(requests),
    employeeId,
    from,
    to,
    dayCount,
    note: note || '',
    status: 'pending',
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: null
  };

  requests.push(newReq);
  writeJSON(VACATION_FILE, requests);
  res.json(newReq);
});

// Approve vacation request
app.put('/api/vacation-requests/:id/approve', requireAdmin, (req, res) => {
  const requests = readJSON(VACATION_FILE);
  const employees = readJSON(EMPLOYEES_FILE);
  const id = parseInt(req.params.id);
  const reqIndex = requests.findIndex(r => r.id === id);

  if (reqIndex === -1) return res.status(404).json({ error: 'Prašymas nerastas' });

  const request = requests[reqIndex];
  request.status = 'approved';
  request.reviewedAt = new Date().toISOString();
  request.reviewedBy = req.session.user.username;

  const employee = employees.find(e => e.id === request.employeeId);
  if (employee) {
    const currentDays = getEmployeeVacationDays(employee);
    const deduction = Number(request.dayCount) || 0;
    const remainingDays = Math.max(0, Math.round((currentDays - deduction) * 100) / 100);
    employee.vacationDays = remainingDays;
    employee.vacationHours = remainingDays;
  }

  writeJSON(VACATION_FILE, requests);
  writeJSON(EMPLOYEES_FILE, employees);
  res.json({ success: true, request });
});

// Reject vacation request
app.put('/api/vacation-requests/:id/reject', requireAdmin, (req, res) => {
  const requests = readJSON(VACATION_FILE);
  const id = parseInt(req.params.id);
  const reqIndex = requests.findIndex(r => r.id === id);

  if (reqIndex === -1) return res.status(404).json({ error: 'Prašymas nerastas' });

  requests[reqIndex].status = 'rejected';
  requests[reqIndex].reviewedAt = new Date().toISOString();
  requests[reqIndex].reviewedBy = req.session.user.username;

  writeJSON(VACATION_FILE, requests);
  res.json({ success: true, request: requests[reqIndex] });
});

// ============ USERS MANAGEMENT ============

// Get all users (admin)
app.get('/api/users', requireAdmin, (req, res) => {
  const users = readJSON(USERS_FILE);
  // Don't send passwords
  res.json(users.map(u => ({ ...u, password: undefined })));
});

// Update user (admin)
app.put('/api/users/:id', requireAdmin, async (req, res) => {
  const users = readJSON(USERS_FILE);
  const userId = parseInt(req.params.id);
  const index = users.findIndex(u => u.id === userId);

  if (index === -1) {
    return res.status(404).json({ error: 'Vartotojas nerastas' });
  }

  const { password, username, ...otherData } = req.body;

  // Check if new username conflicts with another user
  if (username && username !== users[index].username) {
    const existingUser = users.find(u => u.username === username && u.id !== userId);
    if (existingUser) {
      return res.status(400).json({ error: 'Toks vartotojo vardas jau užimtas' });
    }
  }

  users[index] = { ...users[index], ...otherData };
  if (username) {
    users[index].username = username;
  }

  // If new password provided, hash it
  if (password) {
    users[index].password = await bcrypt.hash(password, 10);
  }

  writeJSON(USERS_FILE, users);
  res.json({ ...users[index], password: undefined });
});

// Delete user (admin)
app.delete('/api/users/:id', requireAdmin, (req, res) => {
  let users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === parseInt(req.params.id));

  if (!user) {
    return res.status(404).json({ error: 'Vartotojas nerastas' });
  }

  // Don't allow deleting the last admin
  if (user.role === 'admin') {
    const adminCount = users.filter(u => u.role === 'admin').length;
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'Negalima ištrinti paskutinio administratoriaus' });
    }
  }

  users = users.filter(u => u.id !== parseInt(req.params.id));
  writeJSON(USERS_FILE, users);
  res.json({ success: true });
});

// ============ INIT: Create default admin if not exists ============

async function initDefaultUsers() {
  const users = readJSON(USERS_FILE);
  let modified = false;

  // Check if admin exists
  const adminExists = users.some(u => u.username === 'admin');
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    users.push({
      id: getNextId(users),
      username: 'admin',
      password: hashedPassword,
      role: 'admin',
      employeeId: null
    });
    modified = true;
  }

  // Check if jonas exists
  const jonasExists = users.some(u => u.username === 'jonas');
  if (!jonasExists) {
    const hashedPassword = await bcrypt.hash('jonas123', 10);
    users.push({
      id: getNextId(users),
      username: 'jonas',
      password: hashedPassword,
      role: 'employee',
      employeeId: 1
    });
    modified = true;
  }

  // Only write if changes were made
  if (modified) {
    writeJSON(USERS_FILE, users);
  }
}

// Multer error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Failas per didelis (max 100MB)' });
    }
    return res.status(400).json({ error: 'Failo įkėlimo klaida: ' + err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message || 'Klaida' });
  }
  next();
});

// Start server
app.listen(PORT, async () => {
  await initDefaultUsers();
  console.log(`
Darbuotojų portalas veikia: http://localhost:${PORT}
`);
});
