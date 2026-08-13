/**
 * FinTrack — JSON Veritabanı Katmanı
 * Native derleme gerektirmeyen, fs modülü ile kalıcı JSON saklama.
 * API, better-sqlite3 ile birebir aynı tutulmuştur.
 */
const fs   = require('fs');
const path = require('path');
const { app } = require('electron');

// ─── Storage Path ─────────────────────────────────────────────────────────────
const dataDir = path.join(app.getPath('userData'), 'fintrack-data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const DB_FILE = path.join(dataDir, 'db.json');

// ─── Default Schema ───────────────────────────────────────────────────────────
const DEFAULT = {
  transactions: [],
  budgets:      [],
  credit_cards: [],
  recurring:    [],
  _counters: { transactions: 1, budgets: 1, credit_cards: 1, recurring: 1 },
};

// ─── Read / Write ─────────────────────────────────────────────────────────────
function readDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      return { ...DEFAULT, ...JSON.parse(raw) };
    }
  } catch (e) { console.error('DB read error:', e); }
  return JSON.parse(JSON.stringify(DEFAULT));
}

function writeDB(db) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) { console.error('DB write error:', e); }
}

function nextId(db, table) {
  if (!db._counters) db._counters = {};
  const id = (db._counters[table] || 1);
  db._counters[table] = id + 1;
  return id;
}

// ─── Transactions ─────────────────────────────────────────────────────────────
function getTransactions(year, month) {
  const db = readDB();
  return db.transactions
    .filter(t => t.year === year && t.month === month)
    .sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return b.id - a.id;
    });
}

function addTransaction(data) {
  const db  = readDB();
  const id  = nextId(db, 'transactions');
  const now = new Date().toISOString();
  const record = { id, ...data, created_at: now };
  db.transactions.push(record);
  writeDB(db);
  return record;
}

function updateTransaction(id, data) {
  const db = readDB();
  const idx = db.transactions.findIndex(t => t.id === id);
  if (idx === -1) return null;
  db.transactions[idx] = { ...db.transactions[idx], ...data, id };
  writeDB(db);
  return db.transactions[idx];
}

function deleteTransaction(id) {
  const db = readDB();
  db.transactions = db.transactions.filter(t => t.id !== id);
  writeDB(db);
  return { success: true };
}

// ─── Summary ──────────────────────────────────────────────────────────────────
function getSummary(year, month) {
  const txs = getTransactions(year, month);

  const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  const card    = txs.filter(t => t.type === 'card').reduce((s, t) => s + (t.period_debt || 0), 0);

  const catMap = {};
  txs.filter(t => t.type === 'expense').forEach(t => {
    if (!catMap[t.category]) catMap[t.category] = 0;
    catMap[t.category] += t.amount || 0;
  });
  const categoryBreakdown = Object.entries(catMap).map(([category, total]) => ({ category, total }));

  return { income, expense, card, net: income - expense - card, categoryBreakdown };
}

function getMonthlyData(year) {
  const result = [];
  for (let m = 1; m <= 12; m++) {
    const s = getSummary(year, m);
    result.push({ month: m, income: s.income, expense: s.expense + s.card, net: s.net });
  }
  return result;
}

// ─── Budgets ──────────────────────────────────────────────────────────────────
function getBudgets(year, month) {
  const db = readDB();
  return db.budgets.filter(b => b.year === year && b.month === month);
}

function setBudget(data) {
  const db  = readDB();
  const idx = db.budgets.findIndex(b =>
    b.category === data.category && b.year === data.year && b.month === data.month
  );
  if (idx !== -1) {
    db.budgets[idx].monthly_limit = data.monthly_limit;
  } else {
    db.budgets.push({ id: nextId(db, 'budgets'), ...data });
  }
  writeDB(db);
  return { success: true };
}

// ─── Credit Cards ─────────────────────────────────────────────────────────────
function getCards() {
  const db = readDB();
  return [...db.credit_cards].reverse();
}

function addCard(data) {
  const db = readDB();
  const id = nextId(db, 'credit_cards');
  const record = { id, ...data };
  db.credit_cards.push(record);
  writeDB(db);
  return record;
}

function deleteCard(id) {
  const db = readDB();
  db.credit_cards = db.credit_cards.filter(c => c.id !== id);
  writeDB(db);
  return { success: true };
}

// ─── Recurring ────────────────────────────────────────────────────────────────
function getRecurring() {
  const db = readDB();
  return [...db.recurring].reverse();
}

function addRecurring(data) {
  const db     = readDB();
  const id     = nextId(db, 'recurring');
  const record = { id, ...data, created_at: new Date().toISOString() };
  db.recurring.push(record);
  writeDB(db);
  return record;
}

function deleteRecurring(id) {
  const db = readDB();
  db.recurring = db.recurring.filter(r => r.id !== id);
  writeDB(db);
  return { success: true };
}

function applyRecurring(year, month) {
  const items = getRecurring();
  let added = 0;
  const existing = getTransactions(year, month);

  for (const item of items) {
    const day  = String(item.day_of_month).padStart(2, '0');
    const mo   = String(month).padStart(2, '0');
    const date = `${year}-${mo}-${day}`;
    const desc = (item.description || '') + ' (Otomatik)';

    const alreadyExists = existing.some(t =>
      t.description === desc &&
      Math.abs(t.amount - item.amount) < 0.01 &&
      t.type === item.type
    );

    if (!alreadyExists) {
      addTransaction({
        type: item.type, amount: item.amount, date,
        category: item.category, description: desc,
        bank_name: null, period_debt: null, total_debt: null,
        due_date: null, payment_method: 'cash',
        year, month
      });
      added++;
    }
  }
  return { added };
}

module.exports = {
  getTransactions, addTransaction, updateTransaction, deleteTransaction,
  getSummary, getMonthlyData,
  getBudgets, setBudget,
  getCards, addCard, deleteCard,
  getRecurring, addRecurring, deleteRecurring, applyRecurring,
};
