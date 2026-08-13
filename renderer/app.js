/* ══════════════════════════════════════════════════════
   FinTrack — app.js
   Tüm UI mantığı, veri yönetimi, grafik ve pop-up'lar
══════════════════════════════════════════════════════ */
'use strict';

// ─── State ──────────────────────────────────────────────────────────────────
const state = {
  year:  new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  transactions: [],
  filter: 'all',
  search: '',
  summary: { income: 0, expense: 0, card: 0, net: 0, categoryBreakdown: [] },
  budgets: [],
  editingId: null,
  selectedCategory: null,
  selectedPayment: 'cash',
  selectedBank: null,
  selectedRecurringType: 'expense',
  activeTab: 'expense-tab',
  sidebarOpen: true,
  barChart: null,
  pieChart: null,
};

const MONTH_NAMES = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fmt = (n) => '₺' + Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().split('T')[0];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function toast(msg, type = 'success') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span>`;
  $('toast-container').appendChild(el);
  setTimeout(() => { el.style.animation = 'fadeOut 0.3s ease forwards'; setTimeout(() => el.remove(), 300); }, 3000);
}

function animateCounter(el, targetVal, prefix = '₺') {
  const startVal = parseFloat(el.dataset.raw || 0);
  const diff = targetVal - startVal;
  const steps = 25;
  let step = 0;
  const interval = setInterval(() => {
    step++;
    const eased = step / steps;
    const current = startVal + diff * eased;
    el.textContent = prefix + Math.abs(current).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (step >= steps) {
      clearInterval(interval);
      el.dataset.raw = targetVal;
    }
  }, 16);
}

// ─── Window Controls ─────────────────────────────────────────────────────────
$('btn-minimize').addEventListener('click', () => window.api.minimize());
$('btn-maximize').addEventListener('click', () => window.api.maximize());
$('btn-close').addEventListener('click',    () => window.api.close());

// ─── Sidebar Toggle ──────────────────────────────────────────────────────────
function toggleSidebar(force) {
  state.sidebarOpen = force !== undefined ? force : !state.sidebarOpen;
  $('sidebar').classList.toggle('collapsed', !state.sidebarOpen);
  localStorage.setItem('sidebar', state.sidebarOpen ? '1' : '0');
}
$('btn-menu-toggle').addEventListener('click', () => toggleSidebar());
if (localStorage.getItem('sidebar') === '0') toggleSidebar(false);

// ─── Year/Month Navigation ───────────────────────────────────────────────────
function updatePeriodUI() {
  $('current-year').textContent = state.year;
  $('titlebar-period').textContent = `${MONTH_NAMES[state.month - 1]} ${state.year}`;
  document.querySelectorAll('.month-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.month) === state.month);
  });
}

$('btn-prev-year').addEventListener('click', () => { state.year--; updatePeriodUI(); loadAll(); });
$('btn-next-year').addEventListener('click', () => { state.year++; updatePeriodUI(); loadAll(); });

$('month-grid').addEventListener('click', e => {
  const btn = e.target.closest('.month-btn');
  if (!btn) return;
  state.month = parseInt(btn.dataset.month);
  updatePeriodUI();
  loadAll();
});

// ─── Sidebar Nav ─────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const view = item.dataset.view;
    if (view === 'budget')    openModal('modal-budget'),    loadBudgetModal();
    if (view === 'recurring') openModal('modal-recurring'), loadRecurringModal();
    if (view === 'cards')     openModal('modal-cards'),     loadCardsModal();
  });
});

// ─── Load All Data ───────────────────────────────────────────────────────────
async function loadAll() {
  await Promise.all([loadTransactions(), loadSummary(), loadBudgets()]);
  renderCharts();
}

async function loadTransactions() {
  state.transactions = await window.api.getTransactions(state.year, state.month);
  renderTable();
}

async function loadSummary() {
  state.summary = await window.api.getSummary(state.year, state.month);
  renderSummary();
}

async function loadBudgets() {
  state.budgets = await window.api.getBudgets(state.year, state.month);
  renderBudgets();
}

// ─── Summary Render ───────────────────────────────────────────────────────────
function renderSummary() {
  const { income, expense, card, net, categoryBreakdown } = state.summary;

  const incEl  = $('summary-income');
  const expEl  = $('summary-expense');
  const netEl  = $('summary-net');

  animateCounter(incEl, income);
  animateCounter(expEl, expense + card);
  animateCounter(netEl, Math.abs(net));

  incEl.className  = 'card-amount income counter-animated';
  expEl.className  = 'card-amount expense counter-animated';
  netEl.className  = `card-amount net ${net >= 0 ? 'positive' : 'negative'} counter-animated`;

  const incCount = state.transactions.filter(t => t.type === 'income').length;
  const expCount = state.transactions.filter(t => t.type === 'expense').length;
  const cardCount = state.transactions.filter(t => t.type === 'card').length;

  $('summary-income-sub').innerHTML  = `Bu ay <span class="sub-detail">${incCount}</span> gelir kaydı`;
  $('summary-expense-sub').innerHTML = `<span class="sub-detail">${expCount}</span> harcama + <span class="sub-detail">${cardCount}</span> kart`;

  const netWarn = $('net-warning');
  netWarn.style.display = net < 0 ? 'inline-flex' : 'none';

  // Sidebar stats
  $('sidebar-net').textContent = (net >= 0 ? '+' : '-') + fmt(Math.abs(net));
  $('sidebar-net').style.color = net >= 0 ? 'var(--income)' : 'var(--expense)';
  $('sidebar-exp').textContent = fmt(expense + card);
}

// ─── Table Render ─────────────────────────────────────────────────────────────
function renderTable() {
  const body = $('table-body');
  let data = state.transactions;

  // Filter
  if (state.filter !== 'all') data = data.filter(t => t.type === state.filter);

  // Search
  if (state.search) {
    const q = state.search.toLowerCase();
    data = data.filter(t =>
      (t.description || '').toLowerCase().includes(q) ||
      (t.category    || '').toLowerCase().includes(q) ||
      (t.bank_name   || '').toLowerCase().includes(q) ||
      String(t.amount).includes(q)
    );
  }

  $('table-count').textContent = `${data.length} kayıt`;

  if (data.length === 0) {
    body.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">${state.search ? 'Sonuç bulunamadı' : 'Henüz kayıt yok'}</div>
        <div class="empty-sub">${state.search ? '"' + state.search + '" için eşleşme yok' : 'Gelir veya gider eklemek için butonları kullanın'}</div>
      </div>`;
    return;
  }

  body.innerHTML = data.map(t => {
    const rowClass = t.type === 'income' ? 'income-row' : t.type === 'card' ? 'card-row' : 'expense-row';
    const amtClass = t.type === 'income' ? 'income' : t.type === 'card' ? 'card' : 'expense';
    const amtPrefix = t.type === 'income' ? '+' : '-';
    const amount = t.type === 'card' ? t.period_debt : t.amount;
    const typeLabel = t.type === 'income' ? 'Gelir' : t.type === 'card' ? 'Kart Borcu' : 'Harcama';
    const dateFormatted = t.date ? new Date(t.date + 'T00:00:00').toLocaleDateString('tr-TR', { day:'2-digit', month:'short', year:'numeric' }) : '-';
    const bankInfo = t.type === 'card' ? `<div style="font-size:11px;color:var(--card-debt)">${t.bank_name || ''}</div>` : '';

    return `
      <div class="tr ${rowClass}" data-id="${t.id}" title="Düzenlemek için çift tıklayın">
        <div class="td date">${dateFormatted}</div>
        <div class="td"><span class="cat-badge">${t.category || (t.type === 'card' ? '💳 ' + (t.bank_name || '') : '-')}</span></div>
        <div class="td">${t.description || ''} ${bankInfo}</div>
        <div class="td"><span class="type-badge ${t.type}">${typeLabel}</span></div>
        <div class="td amount ${amtClass}">${amtPrefix}${fmt(amount || 0)}</div>
        <div class="td tr-actions">
          <span class="double-click-hint">çift tık</span>
          <button class="btn-icon" title="Düzenle" data-edit="${t.id}">✏️</button>
        </div>
      </div>`;
  }).join('');

  // Double-click to edit
  body.querySelectorAll('.tr').forEach(row => {
    row.addEventListener('dblclick', () => openEdit(parseInt(row.dataset.id)));
    row.querySelector('[data-edit]')?.addEventListener('click', e => {
      e.stopPropagation();
      openEdit(parseInt(row.dataset.id));
    });
  });
}

// ─── Filters ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filter = btn.dataset.filter;
    renderTable();
  });
});

$('search-input').addEventListener('input', e => {
  state.search = e.target.value.trim();
  renderTable();
});

// ─── Budget Render ────────────────────────────────────────────────────────────
function renderBudgets() {
  const grid = $('budget-grid');
  const cats = ['🍔 Yemek','🛒 Market','🚌 Ulaşım','🎬 Eğlence','🧾 Fatura','🏠 Kira','💊 Sağlık','📦 Diğer'];
  const breakdown = {};
  state.summary.categoryBreakdown.forEach(c => { breakdown[c.category] = c.total; });

  const budgetMap = {};
  state.budgets.forEach(b => { budgetMap[b.category] = b.monthly_limit; });

  const items = cats.filter(c => budgetMap[c]);
  if (items.length === 0) {
    grid.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px;">Bütçe hedefi belirlenmemiş. "Düzenle" butonuna tıklayın.</div>';
    return;
  }

  grid.innerHTML = items.map(cat => {
    const limit   = budgetMap[cat] || 0;
    const spent   = breakdown[cat] || 0;
    const pct     = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
    const status  = pct >= 100 ? 'exceeded' : pct >= 80 ? 'warn' : 'ok';
    return `
      <div class="budget-item">
        <div class="budget-item-header">
          <span class="budget-cat">${cat}</span>
          <span class="budget-pct ${status}">${Math.round(pct)}%</span>
        </div>
        <div class="budget-bar"><div class="budget-fill ${status}" style="width:${pct}%"></div></div>
        <div class="budget-amounts">${fmt(spent)} / ${fmt(limit)}</div>
      </div>`;
  }).join('');
}

// ─── Charts ───────────────────────────────────────────────────────────────────
async function renderCharts() {
  const monthlyData = await window.api.getMonthlyData(state.year);
  const labels = MONTH_NAMES.map(m => m.slice(0, 3));

  // Bar Chart
  if (state.barChart) state.barChart.destroy();
  const barCtx = $('bar-chart').getContext('2d');
  state.barChart = new Chart(barCtx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Gelir',
          data: monthlyData.map(d => d.income),
          backgroundColor: 'rgba(0,214,143,0.7)',
          borderColor: 'rgba(0,214,143,1)',
          borderWidth: 1,
          borderRadius: 6,
        },
        {
          label: 'Gider + Kart',
          data: monthlyData.map(d => d.expense),
          backgroundColor: 'rgba(255,71,87,0.7)',
          borderColor: 'rgba(255,71,87,1)',
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#8888aa', font: { size: 11 }, boxWidth: 14 } },
        tooltip: {
          callbacks: { label: ctx => ' ' + fmt(ctx.parsed.y) }
        }
      },
      scales: {
        x: { ticks: { color: '#55556a' }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#55556a', callback: v => '₺' + (v >= 1000 ? (v/1000).toFixed(0) + 'K' : v) }, grid: { color: 'rgba(255,255,255,0.04)' } },
      }
    }
  });

  // Pie Chart
  const catData = state.summary.categoryBreakdown;
  if (state.pieChart) state.pieChart.destroy();
  const pieCtx = $('pie-chart').getContext('2d');
  if (catData.length === 0) {
    pieCtx.fillStyle = '#55556a';
    pieCtx.font = '13px Inter';
    pieCtx.textAlign = 'center';
    pieCtx.fillText('Bu ay harcama kaydı yok', pieCtx.canvas.width / 2, 90);
    return;
  }
  const pieColors = ['#ff4757','#ffa502','#00d68f','#7c5cbf','#1e90ff','#ff6b81','#eccc68','#a29bfe'];
  state.pieChart = new Chart(pieCtx, {
    type: 'doughnut',
    data: {
      labels: catData.map(c => c.category),
      datasets: [{
        data: catData.map(c => c.total),
        backgroundColor: pieColors,
        borderColor: '#1a1a2e',
        borderWidth: 2,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { position: 'right', labels: { color: '#8888aa', font: { size: 11 }, boxWidth: 12, padding: 8 } },
        tooltip: { callbacks: { label: ctx => ' ' + fmt(ctx.parsed) } }
      }
    }
  });
}

// Chart section toggles
$('toggle-bar-chart').addEventListener('click', () => {
  const w = $('bar-chart-wrapper');
  const hidden = w.style.display === 'none';
  w.style.display = hidden ? 'block' : 'none';
  $('toggle-bar-chart').textContent = hidden ? 'Gizle' : 'Göster';
});
$('toggle-pie-chart').addEventListener('click', () => {
  const w = $('pie-chart-wrapper');
  const hidden = w.style.display === 'none';
  w.style.display = hidden ? 'block' : 'none';
  $('toggle-pie-chart').textContent = hidden ? 'Gizle' : 'Göster';
});

// ─── Modal Helpers ────────────────────────────────────────────────────────────
function openModal(id) {
  const overlay = $(id);
  overlay.classList.add('open');
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(id); }, { once: true });
}
function closeModal(id) {
  const overlay = $(id);
  overlay.classList.remove('open');
}

// Close buttons
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

// ESC key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});

// Draggable modals
function makeDraggable(headerEl, modalEl) {
  let startX, startY, startL, startT;
  headerEl.addEventListener('mousedown', e => {
    if (e.target.closest('button')) return;
    const rect = modalEl.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    startL = rect.left; startT = rect.top;
    modalEl.style.position = 'fixed';
    modalEl.style.margin = '0';
    modalEl.style.left = startL + 'px';
    modalEl.style.top  = startT + 'px';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp, { once: true });
  });
  function onMove(e) {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    modalEl.style.left = Math.max(0, Math.min(window.innerWidth  - modalEl.offsetWidth,  startL + dx)) + 'px';
    modalEl.style.top  = Math.max(0, Math.min(window.innerHeight - modalEl.offsetHeight, startT + dy)) + 'px';
  }
  function onUp() { document.removeEventListener('mousemove', onMove); }
}
makeDraggable($('modal-income-header'),   $('modal-income-box'));
makeDraggable($('modal-expense-header'),  $('modal-expense-box'));
makeDraggable($('modal-edit-header'),     $('modal-edit-box'));
makeDraggable($('modal-budget-header'),   $('modal-budget-box'));
makeDraggable($('modal-recurring-header'),$('modal-recurring-box'));
makeDraggable($('modal-cards-header'),    $('modal-cards-box'));

// ─── Gelir Modal ──────────────────────────────────────────────────────────────
$('btn-add-income').addEventListener('click', () => {
  $('income-amount').value = '';
  $('income-date').value   = today();
  $('income-desc').value   = '';
  $('income-category').value = '💼 Maaş';
  openModal('modal-income');
  setTimeout(() => $('income-amount').focus(), 350);
});

$('btn-save-income').addEventListener('click', async () => {
  const amount = parseFloat($('income-amount').value);
  const date   = $('income-date').value;
  const desc   = $('income-desc').value.trim();
  const cat    = $('income-category').value;

  if (!amount || amount <= 0) { toast('Lütfen geçerli bir tutar girin', 'error'); return; }
  if (!date)   { toast('Lütfen tarih seçin', 'error'); return; }

  const [y, m] = date.split('-').map(Number);
  await window.api.addTransaction({
    type: 'income', amount, date, category: cat, description: desc,
    bank_name: null, period_debt: null, total_debt: null, due_date: null,
    payment_method: 'cash', year: y, month: m
  });
  closeModal('modal-income');
  toast(`💰 ${fmt(amount)} gelir eklendi!`, 'success');
  if (y === state.year && m === state.month) await loadAll();
});

// ─── Gider / Kart Modal ───────────────────────────────────────────────────────
$('btn-add-expense').addEventListener('click', () => {
  state.selectedCategory = null;
  state.selectedPayment  = 'cash';
  state.selectedBank     = null;
  state.activeTab        = 'expense-tab';

  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.pay-btn').forEach(b => b.classList.toggle('selected', b.dataset.pay === 'cash'));
  document.querySelectorAll('.bank-btn').forEach(b => b.classList.remove('selected'));
  $('expense-amount').value = '';
  $('expense-date').value   = today();
  $('expense-desc').value   = '';
  $('card-total-debt').value   = '';
  $('card-period-debt').value  = '';
  $('card-due-date').value     = '';
  $('card-note').value         = '';

  switchExpenseTab('expense-tab');
  openModal('modal-expense');
  setTimeout(() => $('expense-amount').focus(), 350);
});

// Tab switching
function switchExpenseTab(tabId) {
  state.activeTab = tabId;
  $('expense-tab').style.display = tabId === 'expense-tab' ? 'block' : 'none';
  $('card-tab').style.display    = tabId === 'card-tab'    ? 'block' : 'none';
  $('tab-expense').classList.toggle('active', tabId === 'expense-tab');
  $('tab-card').classList.toggle('active', tabId === 'card-tab');

  const footer = $('expense-modal-footer');
  if (tabId === 'expense-tab') {
    $('btn-save-expense').className = 'btn-submit-expense';
    $('btn-save-expense').textContent = '💸 Harcama Kaydet';
  } else {
    $('btn-save-expense').className = 'btn-submit-card';
    $('btn-save-expense').textContent = '💳 Kart Borcu Kaydet';
  }
}

$('tab-expense').addEventListener('click', () => switchExpenseTab('expense-tab'));
$('tab-card').addEventListener('click',    () => switchExpenseTab('card-tab'));

// Category buttons
$('category-grid').addEventListener('click', e => {
  const btn = e.target.closest('.cat-btn');
  if (!btn) return;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  state.selectedCategory = btn.dataset.cat;
});

// Payment method
document.querySelectorAll('.pay-btn[data-pay]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pay-btn[data-pay]').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.selectedPayment = btn.dataset.pay;
  });
});

// Bank buttons
document.querySelectorAll('.bank-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.bank-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.selectedBank = btn.dataset.bank;
  });
});

// Save expense/card
$('btn-save-expense').addEventListener('click', async () => {
  if (state.activeTab === 'expense-tab') {
    const amount = parseFloat($('expense-amount').value);
    const date   = $('expense-date').value;
    const desc   = $('expense-desc').value.trim();
    const cat    = state.selectedCategory || '📦 Diğer';

    if (!amount || amount <= 0) { toast('Lütfen geçerli bir tutar girin', 'error'); return; }
    if (!date)   { toast('Lütfen tarih seçin', 'error'); return; }

    const [y, m] = date.split('-').map(Number);
    await window.api.addTransaction({
      type: 'expense', amount, date, category: cat, description: desc,
      bank_name: null, period_debt: null, total_debt: null, due_date: null,
      payment_method: state.selectedPayment, year: y, month: m
    });
    closeModal('modal-expense');
    toast(`💸 ${fmt(amount)} harcama eklendi!`, 'success');
    if (y === state.year && m === state.month) await loadAll();
    await checkBudgetAlert(cat, y, m);

  } else {
    // Card payment
    const bank       = state.selectedBank;
    const periodDebt = parseFloat($('card-period-debt').value);
    const totalDebt  = parseFloat($('card-total-debt').value) || 0;
    const dueDate    = $('card-due-date').value;
    const note       = $('card-note').value.trim();

    if (!bank)                         { toast('Lütfen banka seçin', 'error'); return; }
    if (!periodDebt || periodDebt <= 0){ toast('Lütfen dönem borcunu girin', 'error'); return; }

    const dateStr = dueDate || today();
    const [y, m]  = dateStr.split('-').map(Number);
    const txYear  = state.year;
    const txMonth = state.month;

    await window.api.addTransaction({
      type: 'card', amount: periodDebt, date: dateStr,
      category: '💳 Kart Borcu', description: note || (bank + ' kart borcu'),
      bank_name: bank, period_debt: periodDebt, total_debt: totalDebt,
      due_date: dueDate, payment_method: 'card', year: txYear, month: txMonth
    });
    closeModal('modal-expense');
    toast(`💳 ${bank} ${fmt(periodDebt)} kart borcu eklendi!`, 'success');

    // Due date notification
    if (dueDate) {
      const due = new Date(dueDate);
      const now = new Date();
      const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 5) {
        await window.api.sendNotification(
          '💳 Kart Ödeme Hatırlatması',
          `${bank} kartınızın son ödeme tarihi: ${due.toLocaleDateString('tr-TR')} (${diffDays} gün kaldı)`
        );
      }
    }
    await loadAll();
  }
});

// ─── Budget alert ─────────────────────────────────────────────────────────────
async function checkBudgetAlert(category, year, month) {
  const budgets = await window.api.getBudgets(year, month);
  const budget  = budgets.find(b => b.category === category);
  if (!budget) return;
  const summary = await window.api.getSummary(year, month);
  const spent   = summary.categoryBreakdown.find(c => c.category === category)?.total || 0;
  const pct     = (spent / budget.monthly_limit) * 100;
  if (pct >= 100) toast(`⚠️ ${category} bütçesini aştınız! (${fmt(spent)} / ${fmt(budget.monthly_limit)})`, 'warning');
  else if (pct >= 80) toast(`⚠️ ${category} bütçesinin %${Math.round(pct)}'ine ulaştınız`, 'info');
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function openEdit(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;
  state.editingId = id;

  $('edit-amount').value   = tx.type === 'card' ? (tx.period_debt || '') : tx.amount;
  $('edit-date').value     = tx.date || today();
  $('edit-category').value = tx.category || '';
  $('edit-desc').value     = tx.description || '';

  const isCard = tx.type === 'card';
  $('edit-card-fields').style.display = isCard ? 'block' : 'none';
  if (isCard) {
    $('edit-bank').value        = tx.bank_name || '';
    $('edit-period-debt').value = tx.period_debt || '';
  }
  openModal('modal-edit');
}

$('btn-save-edit').addEventListener('click', async () => {
  if (!state.editingId) return;
  const tx      = state.transactions.find(t => t.id === state.editingId);
  const amount  = parseFloat($('edit-amount').value);
  const date    = $('edit-date').value;
  const cat     = $('edit-category').value.trim();
  const desc    = $('edit-desc').value.trim();

  if (!amount || amount <= 0) { toast('Lütfen geçerli bir tutar girin', 'error'); return; }

  const [y, m] = date.split('-').map(Number);
  const updateData = {
    type: tx.type, amount, date, category: cat, description: desc,
    bank_name: tx.type === 'card' ? $('edit-bank').value.trim() : tx.bank_name,
    period_debt: tx.type === 'card' ? parseFloat($('edit-period-debt').value) : tx.period_debt,
    total_debt: tx.total_debt, due_date: tx.due_date,
    payment_method: tx.payment_method
  };

  await window.api.updateTransaction(state.editingId, updateData);
  closeModal('modal-edit');
  toast('✏️ İşlem güncellendi', 'success');
  await loadAll();
});

$('btn-delete-tx').addEventListener('click', async () => {
  if (!state.editingId) return;
  if (!confirm('Bu işlemi silmek istediğinize emin misiniz?')) return;
  await window.api.deleteTransaction(state.editingId);
  closeModal('modal-edit');
  toast('🗑️ İşlem silindi', 'info');
  state.editingId = null;
  await loadAll();
});

// ─── Budget Modal ─────────────────────────────────────────────────────────────
async function loadBudgetModal() {
  const cats = ['🍔 Yemek','🛒 Market','🚌 Ulaşım','🎬 Eğlence','🧾 Fatura','🏠 Kira','💊 Sağlık','📦 Diğer'];
  const budgets = await window.api.getBudgets(state.year, state.month);
  const budgetMap = {};
  budgets.forEach(b => { budgetMap[b.category] = b.monthly_limit; });

  $('budget-form-grid').innerHTML = cats.map(cat => `
    <div class="budget-cat-item">
      <span class="budget-cat-label">${cat}</span>
      <input type="number" class="budget-limit-input" data-cat="${cat}" placeholder="₺ 0" value="${budgetMap[cat] || ''}" min="0" step="1" />
    </div>`).join('');
}

$('btn-edit-budgets').addEventListener('click', () => {
  openModal('modal-budget');
  loadBudgetModal();
});

$('btn-save-budgets').addEventListener('click', async () => {
  const inputs = $('budget-form-grid').querySelectorAll('.budget-limit-input');
  const promises = [];
  inputs.forEach(input => {
    const val = parseFloat(input.value);
    if (val > 0) {
      promises.push(window.api.setBudget({ category: input.dataset.cat, monthly_limit: val, year: state.year, month: state.month }));
    }
  });
  await Promise.all(promises);
  closeModal('modal-budget');
  toast('🎯 Bütçe hedefleri kaydedildi', 'success');
  await loadBudgets();
});

// ─── Recurring Modal ──────────────────────────────────────────────────────────
async function loadRecurringModal() {
  const items = await window.api.getRecurring();
  const list  = $('recurring-list');
  if (items.length === 0) {
    list.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">Henüz tekrarlayan işlem tanımlanmadı.</div>';
    return;
  }
  list.innerHTML = items.map(item => `
    <div class="recurring-item">
      <div class="recurring-info">
        <div class="recurring-name">${item.category || ''} ${item.description || ''}</div>
        <div class="recurring-detail">Her ayın ${item.day_of_month}. günü • ${item.type === 'income' ? 'Gelir' : 'Gider'}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="recurring-amount ${item.type}">${item.type === 'income' ? '+' : '-'}${fmt(item.amount)}</span>
        <button class="btn-icon" style="opacity:1;" data-del-recurring="${item.id}" title="Sil">🗑️</button>
      </div>
    </div>`).join('');

  list.querySelectorAll('[data-del-recurring]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await window.api.deleteRecurring(parseInt(btn.dataset.delRecurring));
      toast('🗑️ Silindi', 'info');
      await loadRecurringModal();
    });
  });
}

let _recurringType = 'expense';
document.querySelectorAll('.pay-btn[data-rtype]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pay-btn[data-rtype]').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    _recurringType = btn.dataset.rtype;
  });
});

$('btn-add-recurring-item').addEventListener('click', async () => {
  const amount = parseFloat($('recurring-amount').value);
  const day    = parseInt($('recurring-day').value);
  const cat    = $('recurring-cat').value.trim();
  const desc   = $('recurring-desc').value.trim();

  if (!amount || amount <= 0) { toast('Tutar girin', 'error'); return; }
  if (!day || day < 1 || day > 31) { toast('Geçerli bir gün girin (1-31)', 'error'); return; }

  await window.api.addRecurring({ type: _recurringType, amount, category: cat, description: desc, day_of_month: day });
  $('recurring-amount').value = '';
  $('recurring-day').value    = '';
  $('recurring-cat').value    = '';
  $('recurring-desc').value   = '';
  toast('🔁 Tekrarlayan işlem eklendi', 'success');
  await loadRecurringModal();
});

$('btn-apply-recurring').addEventListener('click', async () => {
  const result = await window.api.applyRecurring(state.year, state.month);
  if (result.added > 0) {
    toast(`🔄 ${result.added} tekrarlayan işlem bu aya eklendi`, 'success');
    await loadAll();
  } else {
    toast('Tüm tekrarlayan işlemler zaten mevcut', 'info');
  }
});

// ─── Cards Modal ──────────────────────────────────────────────────────────────
async function loadCardsModal() {
  const cards = await window.api.getCards();
  const list  = $('cards-list');
  if (cards.length === 0) {
    list.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">Henüz kart tanımlanmadı.</div>';
    return;
  }
  list.innerHTML = cards.map(card => `
    <div class="card-item">
      <div class="card-item-info">
        <div class="card-item-bank">💳 ${card.bank_name}</div>
        <div class="card-item-detail">Kesim: ${card.closing_day}. gün • Son Ödeme: ${card.due_day}. gün</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="card-item-limit">${card.card_limit > 0 ? fmt(card.card_limit) + ' limit' : 'Limitsiz'}</span>
        <button class="btn-icon" style="opacity:1;" data-del-card="${card.id}" title="Sil">🗑️</button>
      </div>
    </div>`).join('');

  list.querySelectorAll('[data-del-card]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await window.api.deleteCard(parseInt(btn.dataset.delCard));
      toast('🗑️ Kart silindi', 'info');
      await loadCardsModal();
    });
  });
}

$('btn-add-card-item').addEventListener('click', async () => {
  const bank    = $('new-card-bank').value.trim();
  const limit   = parseFloat($('new-card-limit').value)   || 0;
  const closing = parseInt($('new-card-closing').value)   || 1;
  const due     = parseInt($('new-card-due').value)       || 10;

  if (!bank) { toast('Banka adı girin', 'error'); return; }

  await window.api.addCard({ bank_name: bank, card_limit: limit, closing_day: closing, due_day: due });
  $('new-card-bank').value    = '';
  $('new-card-limit').value   = '';
  $('new-card-closing').value = '';
  $('new-card-due').value     = '';
  toast(`💳 ${bank} kartı eklendi`, 'success');
  await loadCardsModal();
});

// ─── CSV Export ───────────────────────────────────────────────────────────────
$('btn-export').addEventListener('click', async () => {
  const result = await window.api.exportCSV(state.year, state.month);
  if (result.success) toast(`📤 CSV dosyası indirildi!`, 'success');
  else toast('Export başarısız', 'error');
});

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.ctrlKey) {
    if (e.key === 'g' || e.key === 'G') { e.preventDefault(); $('btn-add-income').click(); }
    if (e.key === 'h' || e.key === 'H') { e.preventDefault(); $('btn-add-expense').click(); }
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); $('search-input').focus(); $('search-input').select(); }
    if (e.key === 'b' || e.key === 'B') { e.preventDefault(); toggleSidebar(); }
  }
});

// ─── Due Date Checks ──────────────────────────────────────────────────────────
async function checkDueDates() {
  const txs = await window.api.getTransactions(state.year, state.month);
  const cardTxs = txs.filter(t => t.type === 'card' && t.due_date);
  const today_d = new Date();
  for (const tx of cardTxs) {
    const due  = new Date(tx.due_date);
    const diff = Math.ceil((due - today_d) / (1000 * 60 * 60 * 24));
    if (diff >= 0 && diff <= 3) {
      await window.api.sendNotification(
        '💳 Son Ödeme Tarihi Yaklaşıyor',
        `${tx.bank_name || 'Kart'} borcunuzun son ödeme tarihi: ${due.toLocaleDateString('tr-TR')} (${diff} gün kaldı)`
      );
    }
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
(async function init() {
  updatePeriodUI();
  await loadAll();
  await checkDueDates();
  console.log('FinTrack başlatıldı ✅');
})();
