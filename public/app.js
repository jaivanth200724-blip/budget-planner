/**
 * FinTrack Pro — Personal Budget Planner
 * Dual-layer Fullstack Architecture: SQLite REST API + Offline-First LocalStorage
 */

const STORAGE_KEYS = {
  TRANSACTIONS: 'fintrack_transactions_v1',
  BUDGETS: 'fintrack_budgets_v1',
  CATEGORIES: 'fintrack_categories_v1',
  ACTIVE_MONTH: 'fintrack_active_month_v1'
};

const DEFAULT_CATEGORIES = [
  { id: 1, name: "Housing", type: "expense", color: "#6366F1", icon: "home" },
  { id: 2, name: "Food & Dining", type: "expense", color: "#F59E0B", icon: "utensils" },
  { id: 3, name: "Transportation", type: "expense", color: "#3B82F6", icon: "car" },
  { id: 4, name: "Utilities", type: "expense", color: "#10B981", icon: "zap" },
  { id: 5, name: "Entertainment", type: "expense", color: "#EC4899", icon: "film" },
  { id: 6, name: "Healthcare", type: "expense", color: "#EF4444", icon: "heart-pulse" },
  { id: 7, name: "Shopping", type: "expense", color: "#8B5CF6", icon: "shopping-bag" },
  { id: 8, name: "Education", type: "expense", color: "#14B8A6", icon: "book-open" },
  { id: 9, name: "Personal Care", type: "expense", color: "#F97316", icon: "smile" },
  { id: 10, name: "Investments", type: "expense", color: "#06B6D4", icon: "trending-up" },
  { id: 11, name: "Miscellaneous", type: "expense", color: "#64748B", icon: "more-horizontal" },
  { id: 12, name: "Salary", type: "income", color: "#10B981", icon: "briefcase" },
  { id: 13, name: "Freelance", type: "income", color: "#06B6D4", icon: "laptop" },
  { id: 14, name: "Investments & Dividends", type: "income", color: "#8B5CF6", icon: "chart-pie" },
  { id: 15, name: "Gifts & Bonus", type: "income", color: "#F59E0B", icon: "gift" },
  { id: 16, name: "Other Income", type: "income", color: "#64748B", icon: "plus-circle" }
];

// App State
const state = {
  isBackendAvailable: false,
  currentMonth: new Date().toISOString().slice(0, 7), // YYYY-MM
  transactions: [],
  categories: [],
  budgets: {}, // { 'YYYY-MM': { total_budget: 0, category_budgets: {} } }
  filters: {
    type: 'All',
    category: 'All',
    search: ''
  },
  charts: {
    category: null,
    cashflow: null
  }
};

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-triangle';
  if (type === 'info') iconName = 'info';

  toast.innerHTML = `
    <i data-lucide="${iconName}" class="w-4 h-4 shrink-0"></i>
    <span class="flex-1">${message}</span>
  `;
  container.appendChild(toast);
  lucide.createIcons({ root: toast });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==========================================
// LOCAL STORAGE LAYER
// ==========================================
const LocalStorageDB = {
  load() {
    try {
      const storedTx = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      state.transactions = storedTx ? JSON.parse(storedTx) : [];

      const storedBudgets = localStorage.getItem(STORAGE_KEYS.BUDGETS);
      state.budgets = storedBudgets ? JSON.parse(storedBudgets) : {};

      const storedCats = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
      state.categories = storedCats ? JSON.parse(storedCats) : DEFAULT_CATEGORIES;

      const storedMonth = localStorage.getItem(STORAGE_KEYS.ACTIVE_MONTH);
      if (storedMonth) state.currentMonth = storedMonth;
    } catch (e) {
      console.warn('LocalStorage load error, fallback to defaults', e);
      state.categories = DEFAULT_CATEGORIES;
    }
  },

  save() {
    try {
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(state.transactions));
      localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(state.budgets));
      localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(state.categories));
      localStorage.setItem(STORAGE_KEYS.ACTIVE_MONTH, state.currentMonth);
    } catch (e) {
      console.error('LocalStorage save error:', e);
    }
  }
};

// ==========================================
// BACKEND SYNC LAYER
// ==========================================
async function checkBackendHealth() {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (res.ok) {
      state.isBackendAvailable = true;
      updateSyncStatusUI(true);
      return true;
    }
  } catch (err) {
    state.isBackendAvailable = false;
  }
  state.isBackendAvailable = false;
  updateSyncStatusUI(false);
  return false;
}

function updateSyncStatusUI(online) {
  const statusEl = document.getElementById('footer-sync-status');
  if (!statusEl) return;
  if (online) {
    statusEl.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
      <span>SQLite Server & LocalStorage Synced</span>
    `;
  } else {
    statusEl.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
      <span>LocalStorage Active (Offline Mode)</span>
    `;
  }
}

async function syncWithBackend() {
  const isOnline = await checkBackendHealth();
  if (!isOnline) {
    LocalStorageDB.load();
    return;
  }

  try {
    // 1. Fetch categories
    const catRes = await fetch('/api/categories');
    if (catRes.ok) {
      state.categories = await catRes.json();
    }

    // 2. Fetch budgets for active month
    const budgetRes = await fetch(`/api/budgets?month=${state.currentMonth}`);
    if (budgetRes.ok) {
      const budgetData = await budgetRes.json();
      state.budgets[state.currentMonth] = {
        total_budget: budgetData.total_budget || 0,
        category_budgets: budgetData.category_budgets || {}
      };
    }

    // 3. Fetch all transactions
    const txRes = await fetch('/api/transactions');
    if (txRes.ok) {
      state.transactions = await txRes.json();
    }

    // Update localStorage with fresh server snapshot
    LocalStorageDB.save();
  } catch (err) {
    console.warn('Sync failed, using localStorage:', err);
    LocalStorageDB.load();
  }
}

// ==========================================
// BUSINESS LOGIC & AGGREGATES
// ==========================================
function getMonthSummary(month) {
  const monthTxs = state.transactions.filter(t => t.date && t.date.startsWith(month));
  
  let totalIncome = 0;
  let totalExpense = 0;
  let incomeCount = 0;
  let expenseCount = 0;

  const categorySpentMap = {};

  monthTxs.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    if (t.type === 'income') {
      totalIncome += amt;
      incomeCount++;
    } else {
      totalExpense += amt;
      expenseCount++;
      categorySpentMap[t.category] = (categorySpentMap[t.category] || 0) + amt;
    }
  });

  const monthBudget = state.budgets[month] || { total_budget: 0, category_budgets: {} };
  const totalBudget = parseFloat(monthBudget.total_budget) || 0;
  const categoryBudgets = monthBudget.category_budgets || {};

  const remainingBalance = totalIncome - totalExpense;
  const budgetRemaining = totalBudget > 0 ? (totalBudget - totalExpense) : 0;
  const budgetBurnPct = totalBudget > 0 ? ((totalExpense / totalBudget) * 100) : 0;
  const savingsRate = totalIncome > 0 ? ((remainingBalance / totalIncome) * 100) : 0;

  // Build category breakdown
  const categoryBreakdown = Object.keys(categorySpentMap).map(catName => {
    const spent = categorySpentMap[catName];
    const catObj = state.categories.find(c => c.name === catName) || { color: '#64748B', icon: 'tag' };
    const allocated = parseFloat(categoryBudgets[catName]) || 0;
    const pctOfBudget = allocated > 0 ? (spent / allocated) * 100 : null;

    return {
      name: catName,
      spent: spent,
      allocated: allocated,
      remaining: allocated > 0 ? (allocated - spent) : null,
      pctOfBudget: pctOfBudget,
      color: catObj.color,
      icon: catObj.icon
    };
  }).sort((a, b) => b.spent - a.spent);

  // Daily cashflow trends
  const dailyMap = {};
  monthTxs.forEach(t => {
    if (!dailyMap[t.date]) {
      dailyMap[t.date] = { date: t.date, income: 0, expense: 0 };
    }
    const amt = parseFloat(t.amount) || 0;
    if (t.type === 'income') dailyMap[t.date].income += amt;
    else dailyMap[t.date].expense += amt;
  });

  const dailyTrends = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

  return {
    month,
    totalIncome,
    totalExpense,
    incomeCount,
    expenseCount,
    remainingBalance,
    totalBudget,
    budgetRemaining,
    budgetBurnPct,
    savingsRate,
    categoryBreakdown,
    dailyTrends
  };
}

// ==========================================
// RENDER UI
// ==========================================
function renderUI() {
  const summary = getMonthSummary(state.currentMonth);
  renderKPIs(summary);
  renderCharts(summary);
  renderCategoryBudgets(summary);
  renderTransactionsTable();
  updateCategoryDropdowns();
  lucide.createIcons();
}

function formatCurrency(val) {
  const num = parseFloat(val) || 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(num);
}

function renderKPIs(summary) {
  // Monthly Budget
  document.getElementById('kpi-total-budget').textContent = formatCurrency(summary.totalBudget);
  document.getElementById('kpi-budget-note').textContent = summary.totalBudget > 0 ? 'Allocated ceiling' : 'No budget set';

  // Income
  document.getElementById('kpi-total-income').textContent = formatCurrency(summary.totalIncome);
  document.getElementById('kpi-income-count').textContent = `${summary.incomeCount} credit entries`;

  // Expense
  document.getElementById('kpi-total-expense').textContent = formatCurrency(summary.totalExpense);
  document.getElementById('kpi-expense-count').textContent = `${summary.expenseCount} debit entries`;

  // Net Balance (Income - Expense)
  const balanceEl = document.getElementById('kpi-remaining-balance');
  balanceEl.textContent = formatCurrency(summary.remainingBalance);
  if (summary.remainingBalance > 0) {
    balanceEl.className = 'text-xl lg:text-2xl font-bold text-emerald-600';
  } else if (summary.remainingBalance < 0) {
    balanceEl.className = 'text-xl lg:text-2xl font-bold text-rose-600';
  } else {
    balanceEl.className = 'text-xl lg:text-2xl font-bold text-slate-900';
  }
  document.getElementById('kpi-savings-rate').textContent = `Savings Rate: ${summary.savingsRate.toFixed(1)}%`;

  // Budget Remaining
  const budgetLeftEl = document.getElementById('kpi-budget-remaining');
  budgetLeftEl.textContent = formatCurrency(summary.budgetRemaining);
  const statusNote = document.getElementById('kpi-budget-status');

  if (summary.totalBudget === 0) {
    budgetLeftEl.className = 'text-xl lg:text-2xl font-bold text-slate-400';
    statusNote.textContent = 'Set budget target';
  } else if (summary.budgetRemaining < 0) {
    budgetLeftEl.className = 'text-xl lg:text-2xl font-bold text-rose-600';
    statusNote.textContent = 'Deficit / Over Budget';
  } else {
    budgetLeftEl.className = 'text-xl lg:text-2xl font-bold text-slate-900';
    statusNote.textContent = `${formatCurrency(summary.budgetRemaining)} remaining`;
  }

  // Budget Burn %
  const burnEl = document.getElementById('kpi-budget-used');
  const badgeEl = document.getElementById('kpi-health-badge');

  if (summary.totalBudget === 0) {
    burnEl.textContent = '0%';
    badgeEl.textContent = 'No Cap';
    badgeEl.className = 'inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600';
  } else {
    burnEl.textContent = `${summary.budgetBurnPct.toFixed(1)}%`;
    if (summary.budgetBurnPct > 100) {
      badgeEl.textContent = 'Over Budget!';
      badgeEl.className = 'inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full badge-danger';
    } else if (summary.budgetBurnPct >= 85) {
      badgeEl.textContent = 'Caution (>85%)';
      badgeEl.className = 'inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full badge-warning';
    } else {
      badgeEl.textContent = 'Healthy';
      badgeEl.className = 'inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full badge-healthy';
    }
  }

  // Overall Progress Bar
  const progFill = document.getElementById('overall-progress-bar');
  const progNumbers = document.getElementById('budget-progress-numbers');
  const progSubtitle = document.getElementById('budget-progress-subtitle');

  progNumbers.textContent = `${formatCurrency(summary.totalExpense)} spent of ${formatCurrency(summary.totalBudget)} limit`;

  let fillWidth = 0;
  if (summary.totalBudget > 0) {
    fillWidth = Math.min(100, summary.budgetBurnPct);
    if (summary.budgetBurnPct > 100) {
      progFill.className = 'progress-bar-fill h-full bg-rose-500 rounded-full animate-pulse';
      progSubtitle.textContent = `Warning: You have exceeded your monthly limit by ${formatCurrency(Math.abs(summary.budgetRemaining))}.`;
    } else if (summary.budgetBurnPct >= 85) {
      progFill.className = 'progress-bar-fill h-full bg-amber-500 rounded-full';
      progSubtitle.textContent = `You have used ${summary.budgetBurnPct.toFixed(1)}% of your monthly allowance. Spend cautiously.`;
    } else {
      progFill.className = 'progress-bar-fill h-full bg-emerald-500 rounded-full';
      progSubtitle.textContent = `On track! You have ${formatCurrency(summary.budgetRemaining)} remaining to spend this month.`;
    }
  } else {
    progFill.className = 'progress-bar-fill h-full bg-slate-300 rounded-full';
    progSubtitle.textContent = 'Click "Set Budget" to define your spending limit and keep finances on track.';
  }
  progFill.style.width = `${fillWidth}%`;
}

function renderCharts(summary) {
  // 1. Spending by Category Donut
  const catCanvas = document.getElementById('category-chart');
  const emptyMsg = document.getElementById('chart-empty-msg');
  document.getElementById('chart-total-expenses').textContent = formatCurrency(summary.totalExpense);

  if (summary.categoryBreakdown.length === 0) {
    if (state.charts.category) {
      state.charts.category.destroy();
      state.charts.category = null;
    }
    catCanvas.classList.add('hidden');
    emptyMsg.classList.remove('hidden');
  } else {
    catCanvas.classList.remove('hidden');
    emptyMsg.classList.add('hidden');

    const labels = summary.categoryBreakdown.map(c => c.name);
    const data = summary.categoryBreakdown.map(c => c.spent);
    const colors = summary.categoryBreakdown.map(c => c.color);

    if (state.charts.category) {
      state.charts.category.data.labels = labels;
      state.charts.category.data.datasets[0].data = data;
      state.charts.category.data.datasets[0].backgroundColor = colors;
      state.charts.category.update();
    } else {
      state.charts.category = new Chart(catCanvas, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: data,
            backgroundColor: colors,
            borderWidth: 2,
            borderColor: '#ffffff',
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: {
                boxWidth: 10,
                font: { size: 10, family: 'inherit' },
                padding: 10
              }
            },
            tooltip: {
              callbacks: {
                label: function (context) {
                  const val = context.parsed || 0;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                  return ` ${context.label}: $${val.toFixed(2)} (${pct}%)`;
                }
              }
            }
          },
          cutout: '72%'
        }
      });
    }
  }

  // 2. Daily Cashflow Trend Bar Chart
  const cashflowCanvas = document.getElementById('cashflow-chart');
  const dates = summary.dailyTrends.map(d => d.date.slice(8)); // just day 'DD'
  const expenseData = summary.dailyTrends.map(d => d.expense);
  const incomeData = summary.dailyTrends.map(d => d.income);

  if (state.charts.cashflow) {
    state.charts.cashflow.data.labels = dates;
    state.charts.cashflow.data.datasets[0].data = incomeData;
    state.charts.cashflow.data.datasets[1].data = expenseData;
    state.charts.cashflow.update();
  } else {
    state.charts.cashflow = new Chart(cashflowCanvas, {
      type: 'bar',
      data: {
        labels: dates,
        datasets: [
          {
            label: 'Income',
            data: incomeData,
            backgroundColor: '#10b981',
            borderRadius: 4
          },
          {
            label: 'Expense',
            data: expenseData,
            backgroundColor: '#f43f5e',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 9 } }
          },
          y: {
            grid: { color: '#f1f5f9' },
            ticks: {
              font: { size: 9 },
              callback: val => `$${val}`
            }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { boxWidth: 8, font: { size: 9 } }
          }
        }
      }
    });
  }
}

function renderCategoryBudgets(summary) {
  const container = document.getElementById('category-progress-list');
  if (!container) return;

  const monthBudget = state.budgets[state.currentMonth] || { category_budgets: {} };
  const catBudgets = monthBudget.category_budgets || {};

  // Combine categories that either have an allocation or have spending
  const expenseCats = state.categories.filter(c => c.type === 'expense');
  const activeItems = expenseCats.map(cat => {
    const breakdown = summary.categoryBreakdown.find(b => b.name === cat.name);
    const spent = breakdown ? breakdown.spent : 0;
    const allocated = parseFloat(catBudgets[cat.name]) || 0;
    const pct = allocated > 0 ? (spent / allocated) * 100 : null;
    return {
      name: cat.name,
      spent: spent,
      allocated: allocated,
      pct: pct,
      remaining: allocated > 0 ? (allocated - spent) : null,
      color: cat.color,
      icon: cat.icon
    };
  }).filter(item => item.allocated > 0 || item.spent > 0)
    .sort((a, b) => (b.allocated || b.spent) - (a.allocated || a.spent));

  if (activeItems.length === 0) {
    container.innerHTML = `
      <div class="text-center py-6 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
        <i data-lucide="tag" class="w-6 h-6 text-slate-300 mx-auto mb-1"></i>
        <p class="text-xs text-slate-500 font-medium">No category caps assigned yet.</p>
        <button id="btn-seed-caps" class="mt-2 text-xs text-brand-600 font-semibold hover:underline">
          Assign category caps
        </button>
      </div>
    `;
    const seedBtn = document.getElementById('btn-seed-caps');
    if (seedBtn) seedBtn.addEventListener('click', openBudgetModal);
    return;
  }

  container.innerHTML = activeItems.map(item => {
    let barColor = 'bg-brand-600';
    let statusText = '';
    let barWidth = 0;

    if (item.allocated > 0) {
      barWidth = Math.min(100, item.pct);
      if (item.pct > 100) {
        barColor = 'bg-rose-500';
        statusText = `<span class="text-rose-600 font-semibold">Over by ${formatCurrency(Math.abs(item.remaining))}</span>`;
      } else if (item.pct >= 85) {
        barColor = 'bg-amber-500';
        statusText = `<span class="text-amber-600 font-medium">${formatCurrency(item.remaining)} left (${item.pct.toFixed(0)}%)</span>`;
      } else {
        barColor = 'bg-emerald-500';
        statusText = `<span class="text-slate-500">${formatCurrency(item.remaining)} left</span>`;
      }
    } else {
      barWidth = 100;
      barColor = 'bg-slate-300';
      statusText = `<span class="text-slate-400">No limit set</span>`;
    }

    return `
      <div class="space-y-1">
        <div class="flex items-center justify-between text-xs">
          <div class="flex items-center gap-1.5 font-medium text-slate-800">
            <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${item.color}"></span>
            <span>${item.name}</span>
          </div>
          <div class="text-right text-[11px]">
            <span class="font-semibold text-slate-900">${formatCurrency(item.spent)}</span>
            ${item.allocated > 0 ? `<span class="text-slate-400"> / ${formatCurrency(item.allocated)}</span>` : ''}
          </div>
        </div>
        <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
          <div class="h-full rounded-full ${barColor}" style="width: ${barWidth}%;"></div>
        </div>
        <div class="flex items-center justify-between text-[10px]">
          <span class="text-slate-400">${item.allocated > 0 ? `${item.pct.toFixed(0)}% used` : 'Uncapped'}</span>
          ${statusText}
        </div>
      </div>
    `;
  }).join('');
}

function renderTransactionsTable() {
  const tbody = document.getElementById('transaction-table-body');
  const emptyState = document.getElementById('tx-empty-state');
  const countLabel = document.getElementById('tx-count-label');

  // Filter transactions
  let filtered = state.transactions.filter(t => {
    // Month filter
    if (t.date && !t.date.startsWith(state.currentMonth)) return false;

    // Type filter
    if (state.filters.type !== 'All' && t.type !== state.filters.type) return false;

    // Category filter
    if (state.filters.category !== 'All' && t.category !== state.filters.category) return false;

    // Search query
    if (state.filters.search) {
      const q = state.filters.search.toLowerCase();
      const matchDesc = (t.description || '').toLowerCase().includes(q);
      const matchNotes = (t.notes || '').toLowerCase().includes(q);
      const matchCat = (t.category || '').toLowerCase().includes(q);
      if (!matchDesc && !matchNotes && !matchCat) return false;
    }
    return true;
  });

  // Sort descending by date
  filtered.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id - a.id));

  countLabel.textContent = `Showing ${filtered.length} of ${state.transactions.length} total records`;

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  tbody.innerHTML = filtered.map(tx => {
    const isIncome = tx.type === 'income';
    const amountClass = isIncome ? 'text-emerald-600 font-bold' : 'text-slate-900 font-semibold';
    const sign = isIncome ? '+' : '-';
    const catObj = state.categories.find(c => c.name === tx.category) || { color: '#64748B', icon: 'tag' };

    return `
      <tr class="hover:bg-slate-50/80 transition group" data-id="${tx.id}">
        <td class="py-3 px-4">
          <div class="font-medium text-slate-900 text-xs">${escapeHtml(tx.description)}</div>
          ${tx.notes ? `<div class="text-[11px] text-slate-400 mt-0.5 truncate max-w-xs">${escapeHtml(tx.notes)}</div>` : ''}
        </td>
        <td class="py-3 px-3">
          <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium" style="background-color: ${catObj.color}15; color: ${catObj.color}">
            <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${catObj.color}"></span>
            ${escapeHtml(tx.category)}
          </span>
        </td>
        <td class="py-3 px-3 text-slate-500 text-[11px] whitespace-nowrap">
          ${formatDateDisplay(tx.date)}
        </td>
        <td class="py-3 px-3 text-slate-500 text-[11px]">
          <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium">
            ${escapeHtml(tx.payment_method || 'Debit')}
          </span>
        </td>
        <td class="py-3 px-4 text-right ${amountClass} text-xs whitespace-nowrap">
          ${sign}${formatCurrency(tx.amount)}
        </td>
        <td class="py-3 px-3 text-right whitespace-nowrap">
          <div class="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition">
            <button class="btn-edit-tx p-1 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition" data-id="${tx.id}" title="Edit">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            </button>
            <button class="btn-delete-tx p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition" data-id="${tx.id}" title="Delete">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Attach action listeners
  tbody.querySelectorAll('.btn-edit-tx').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditTransactionModal(btn.dataset.id);
    });
  });

  tbody.querySelectorAll('.btn-delete-tx').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteTransaction(btn.dataset.id);
    });
  });
}

function updateCategoryDropdowns() {
  const filterSelect = document.getElementById('tx-category-filter');
  const inputSelect = document.getElementById('tx-input-cat');
  if (!filterSelect || !inputSelect) return;

  const currentVal = filterSelect.value;
  const currentInputVal = inputSelect.value;

  // Filter dropdown
  let filterOptions = '<option value="All">All Categories</option>';
  state.categories.forEach(c => {
    filterOptions += `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)} (${c.type})</option>`;
  });
  filterSelect.innerHTML = filterOptions;
  filterSelect.value = currentVal || 'All';

  // Modal input dropdown based on selected type
  const activeType = document.getElementById('tx-input-type')?.value || 'expense';
  const matchingCats = state.categories.filter(c => c.type === activeType);
  
  let inputOptions = '';
  matchingCats.forEach(c => {
    inputOptions += `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`;
  });
  inputSelect.innerHTML = inputOptions;
  if (currentInputVal && matchingCats.some(c => c.name === currentInputVal)) {
    inputSelect.value = currentInputVal;
  }
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-');
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================
// MODAL MANAGEMENT
// ==========================================
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('open');
    lucide.createIcons({ root: modal });
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('open');
}

function setupModalClosers() {
  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
    modal.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => modal.classList.remove('open'));
    });
  });
}

// ==========================================
// TRANSACTION CRUD OPERATIONS
// ==========================================
function openAddTransactionModal() {
  document.getElementById('modal-tx-title').innerHTML = `
    <i data-lucide="plus-circle" class="w-5 h-5 text-brand-600"></i>
    Record Transaction
  `;
  document.getElementById('tx-submit-btn-text').textContent = 'Save Transaction';
  document.getElementById('tx-edit-id').value = '';
  document.getElementById('tx-input-amount').value = '';
  document.getElementById('tx-input-desc').value = '';
  document.getElementById('tx-input-notes').value = '';
  
  // Date default to today in active month if same, or 1st of month
  const today = new Date().toISOString().slice(0, 10);
  if (today.startsWith(state.currentMonth)) {
    document.getElementById('tx-input-date').value = today;
  } else {
    document.getElementById('tx-input-date').value = `${state.currentMonth}-01`;
  }

  setTxTypeInModal('expense');
  openModal('modal-tx');
  document.getElementById('tx-input-amount').focus();
}

function openEditTransactionModal(id) {
  const tx = state.transactions.find(t => String(t.id) === String(id));
  if (!tx) return;

  document.getElementById('modal-tx-title').innerHTML = `
    <i data-lucide="edit-3" class="w-5 h-5 text-brand-600"></i>
    Edit Transaction
  `;
  document.getElementById('tx-submit-btn-text').textContent = 'Update Transaction';
  document.getElementById('tx-edit-id').value = tx.id;
  document.getElementById('tx-input-amount').value = tx.amount;
  document.getElementById('tx-input-desc').value = tx.description;
  document.getElementById('tx-input-date').value = tx.date;
  document.getElementById('tx-input-payment').value = tx.payment_method || 'Debit Card';
  document.getElementById('tx-input-notes').value = tx.notes || '';

  setTxTypeInModal(tx.type);
  document.getElementById('tx-input-cat').value = tx.category;

  openModal('modal-tx');
}

function setTxTypeInModal(type) {
  const inputType = document.getElementById('tx-input-type');
  const btnExpense = document.getElementById('tx-type-btn-expense');
  const btnIncome = document.getElementById('tx-type-btn-income');

  inputType.value = type;

  if (type === 'expense') {
    btnExpense.className = 'py-2 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 transition bg-white text-rose-600 shadow-xs';
    btnIncome.className = 'py-2 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 transition text-slate-500 hover:text-emerald-600';
  } else {
    btnExpense.className = 'py-2 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 transition text-slate-500 hover:text-rose-600';
    btnIncome.className = 'py-2 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 transition bg-white text-emerald-600 shadow-xs';
  }

  updateCategoryDropdowns();
  lucide.createIcons();
}

async function handleSaveTransaction(e) {
  e.preventDefault();

  const editId = document.getElementById('tx-edit-id').value;
  const txData = {
    type: document.getElementById('tx-input-type').value,
    amount: parseFloat(document.getElementById('tx-input-amount').value),
    description: document.getElementById('tx-input-desc').value.trim(),
    category: document.getElementById('tx-input-cat').value,
    date: document.getElementById('tx-input-date').value,
    payment_method: document.getElementById('tx-input-payment').value,
    notes: document.getElementById('tx-input-notes').value.trim()
  };

  if (!txData.amount || txData.amount <= 0) {
    showToast('Please enter a valid amount greater than $0', 'error');
    return;
  }
  if (!txData.description) {
    showToast('Please enter a description for the transaction', 'error');
    return;
  }

  if (state.isBackendAvailable) {
    try {
      if (editId) {
        const res = await fetch(`/api/transactions/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(txData)
        });
        if (res.ok) {
          const updated = await res.json();
          const idx = state.transactions.findIndex(t => String(t.id) === String(editId));
          if (idx !== -1) state.transactions[idx] = updated;
          showToast('Transaction updated successfully!');
        }
      } else {
        const res = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(txData)
        });
        if (res.ok) {
          const created = await res.json();
          state.transactions.unshift(created);
          showToast('Transaction saved to budget!');
        }
      }
    } catch (err) {
      console.warn('API call failed, falling back to local save:', err);
      saveTransactionLocally(editId, txData);
    }
  } else {
    saveTransactionLocally(editId, txData);
  }

  LocalStorageDB.save();
  closeModal('modal-tx');

  // If user recorded for a different month, offer to switch
  const txMonth = txData.date.slice(0, 7);
  if (txMonth !== state.currentMonth) {
    state.currentMonth = txMonth;
    document.getElementById('month-picker').value = txMonth;
  }

  renderUI();
}

function saveTransactionLocally(editId, txData) {
  if (editId) {
    const idx = state.transactions.findIndex(t => String(t.id) === String(editId));
    if (idx !== -1) {
      state.transactions[idx] = { ...state.transactions[idx], ...txData };
      showToast('Transaction updated (LocalStorage)');
    }
  } else {
    const newTx = {
      id: Date.now(),
      ...txData,
      created_at: new Date().toISOString()
    };
    state.transactions.unshift(newTx);
    showToast('Transaction saved (LocalStorage)');
  }
}

async function handleDeleteTransaction(id) {
  if (!confirm('Are you sure you want to delete this transaction record?')) return;

  if (state.isBackendAvailable) {
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        state.transactions = state.transactions.filter(t => String(t.id) !== String(id));
        showToast('Transaction deleted successfully.');
      }
    } catch (err) {
      console.warn('Delete via API failed, deleting locally:', err);
      state.transactions = state.transactions.filter(t => String(t.id) !== String(id));
      showToast('Transaction deleted (LocalStorage).');
    }
  } else {
    state.transactions = state.transactions.filter(t => String(t.id) !== String(id));
    showToast('Transaction deleted (LocalStorage).');
  }

  LocalStorageDB.save();
  renderUI();
}

// ==========================================
// BUDGET MANAGEMENT
// ==========================================
function openBudgetModal() {
  const monthLabel = document.getElementById('budget-modal-month-label');
  const totalInput = document.getElementById('budget-input-total');
  const catContainer = document.getElementById('category-budget-inputs');

  const [y, m] = state.currentMonth.split('-');
  const dt = new Date(y, m - 1, 1);
  monthLabel.textContent = `For ${dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;

  const currentBudget = state.budgets[state.currentMonth] || { total_budget: 0, category_budgets: {} };
  totalInput.value = currentBudget.total_budget || '';

  // Render per-category inputs
  const expenseCats = state.categories.filter(c => c.type === 'expense');
  catContainer.innerHTML = expenseCats.map(c => {
    const allocated = currentBudget.category_budgets ? (currentBudget.category_budgets[c.name] || '') : '';
    return `
      <div class="flex items-center justify-between gap-3 bg-slate-50 p-2 rounded-lg border border-slate-200">
        <div class="flex items-center gap-2 text-xs font-medium text-slate-700">
          <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${c.color}"></span>
          <span>${escapeHtml(c.name)}</span>
        </div>
        <div class="relative w-28">
          <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
          <input type="number" step="10" min="0" data-cat="${escapeHtml(c.name)}" value="${allocated}" placeholder="0" class="cat-budget-input w-full pl-6 pr-2 py-1 text-xs border border-slate-200 focus:border-brand-500 rounded-md outline-none text-right font-semibold">
        </div>
      </div>
    `;
  }).join('');

  // Update sum label
  function updateBudgetSum() {
    let sum = 0;
    catContainer.querySelectorAll('.cat-budget-input').forEach(inp => {
      sum += parseFloat(inp.value) || 0;
    });
    document.getElementById('category-budget-sum-label').textContent = `Category Sum: $${sum.toFixed(2)}`;
  }

  catContainer.querySelectorAll('.cat-budget-input').forEach(inp => {
    inp.addEventListener('input', updateBudgetSum);
  });
  updateBudgetSum();

  openModal('modal-budget');
  totalInput.focus();
}

async function handleSaveBudget(e) {
  e.preventDefault();

  const total = parseFloat(document.getElementById('budget-input-total').value) || 0;
  const categoryBudgets = {};

  document.querySelectorAll('.cat-budget-input').forEach(inp => {
    const val = parseFloat(inp.value);
    if (val > 0) {
      categoryBudgets[inp.dataset.cat] = val;
    }
  });

  const payload = {
    month: state.currentMonth,
    total_budget: total,
    category_budgets: categoryBudgets
  };

  if (state.isBackendAvailable) {
    try {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast('Monthly budget updated!');
      }
    } catch (err) {
      console.warn('Budget API call failed, saved locally:', err);
    }
  }

  state.budgets[state.currentMonth] = {
    total_budget: total,
    category_budgets: categoryBudgets
  };

  LocalStorageDB.save();
  closeModal('modal-budget');
  showToast('Monthly budget applied!');
  renderUI();
}

// ==========================================
// CATEGORY MANAGEMENT
// ==========================================
function openCategoryModal() {
  document.getElementById('cat-input-name').value = '';
  document.getElementById('cat-input-type').value = 'expense';
  document.getElementById('cat-input-color').value = '#6366F1';
  openModal('modal-category');
}

async function handleSaveCategory(e) {
  e.preventDefault();

  const name = document.getElementById('cat-input-name').value.trim();
  const type = document.getElementById('cat-input-type').value;
  const color = document.getElementById('cat-input-color').value;

  if (!name) {
    showToast('Please enter a category name', 'error');
    return;
  }

  if (state.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    showToast('Category with this name already exists', 'error');
    return;
  }

  const newCat = {
    id: Date.now(),
    name: name,
    type: type,
    color: color,
    icon: type === 'expense' ? 'shopping-bag' : 'dollar-sign'
  };

  if (state.isBackendAvailable) {
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCat)
      });
      if (res.ok) {
        const saved = await res.json();
        state.categories.push(saved);
        showToast(`Category "${name}" created!`);
      }
    } catch (err) {
      state.categories.push(newCat);
      showToast(`Category "${name}" created (LocalStorage)!`);
    }
  } else {
    state.categories.push(newCat);
    showToast(`Category "${name}" created (LocalStorage)!`);
  }

  LocalStorageDB.save();
  closeModal('modal-category');
  updateCategoryDropdowns();
  renderUI();
}

// ==========================================
// DATA IMPORT & EXPORT
// ==========================================
function exportAsJSON() {
  const data = {
    version: "1.0",
    exported_at: new Date().toISOString(),
    budgets: state.budgets,
    categories: state.categories,
    transactions: state.transactions
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `budget_backup_${state.currentMonth}_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('JSON backup file exported!');
}

function exportAsCSV() {
  if (state.transactions.length === 0) {
    showToast('No transactions to export', 'error');
    return;
  }

  const headers = ['ID', 'Date', 'Type', 'Category', 'Amount', 'Description', 'Payment Method', 'Notes'];
  const rows = state.transactions.map(t => [
    t.id,
    t.date,
    t.type,
    `"${(t.category || '').replace(/"/g, '""')}"`,
    t.amount,
    `"${(t.description || '').replace(/"/g, '""')}"`,
    `"${(t.payment_method || '').replace(/"/g, '""')}"`,
    `"${(t.notes || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transactions_${state.currentMonth}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Transactions exported as CSV!');
}

async function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const data = JSON.parse(evt.target.result);
      if (!data.transactions && !data.budgets) {
        throw new Error('Invalid format');
      }

      if (state.isBackendAvailable) {
        await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        await syncWithBackend();
      } else {
        if (data.transactions) state.transactions = data.transactions;
        if (data.budgets) state.budgets = data.budgets;
        if (data.categories) state.categories = data.categories;
        LocalStorageDB.save();
      }

      showToast('Data backup imported successfully!');
      closeModal('modal-data');
      renderUI();
    } catch (err) {
      showToast('Failed to parse backup file. Please ensure valid JSON.', 'error');
    }
  };
  reader.readAsText(file);
}

async function seedSampleData() {
  if (state.isBackendAvailable) {
    try {
      const res = await fetch('/api/seed', { method: 'POST' });
      if (res.ok) {
        await syncWithBackend();
        showToast('Sample financial data loaded!');
        renderUI();
        return;
      }
    } catch (e) {
      console.warn('API seed failed, loading locally');
    }
  }

  // Local fallback seeding
  state.budgets[state.currentMonth] = {
    total_budget: 4500,
    category_budgets: {
      "Housing": 1500,
      "Food & Dining": 600,
      "Transportation": 350,
      "Utilities": 250,
      "Entertainment": 200,
      "Healthcare": 150,
      "Shopping": 300
    }
  };

  const sample = [
    { id: 1, type: "income", amount: 4200, category: "Salary", date: `${state.currentMonth}-01`, description: "Primary Job Monthly Salary", payment_method: "Bank Transfer", notes: "Direct deposit" },
    { id: 2, type: "income", amount: 650, category: "Freelance", date: `${state.currentMonth}-08`, description: "Web App Development Contract", payment_method: "Bank Transfer", notes: "Milestone completion" },
    { id: 3, type: "expense", amount: 1450, category: "Housing", date: `${state.currentMonth}-02`, description: "Apartment Rent & Maintenance", payment_method: "Bank Transfer", notes: "Monthly lease" },
    { id: 4, type: "expense", amount: 142.50, category: "Utilities", date: `${state.currentMonth}-04`, description: "High-Speed Internet & Power Bill", payment_method: "Credit Card", notes: "Auto-pay" },
    { id: 5, type: "expense", amount: 115.80, category: "Food & Dining", date: `${state.currentMonth}-05`, description: "Whole Foods Groceries", payment_method: "Debit Card", notes: "Weekly groceries" },
    { id: 6, type: "expense", amount: 45.00, category: "Transportation", date: `${state.currentMonth}-06`, description: "Gas Station Refill", payment_method: "Credit Card", notes: "Shell" },
    { id: 7, type: "expense", amount: 89.20, category: "Shopping", date: `${state.currentMonth}-09`, description: "Ergonomic Desk Accessories", payment_method: "Credit Card", notes: "Office upgrade" },
    { id: 8, type: "expense", amount: 18.99, category: "Entertainment", date: `${state.currentMonth}-10`, description: "Netflix & Spotify Streaming", payment_method: "Credit Card", notes: "Monthly sub" },
    { id: 9, type: "expense", amount: 65.00, category: "Healthcare", date: `${state.currentMonth}-11`, description: "Pharmacy Prescription Refill", payment_method: "Debit Card", notes: "Health vitamins" }
  ];

  state.transactions = sample;
  LocalStorageDB.save();
  showToast('Sample data seeded locally!');
  renderUI();
}

function clearAllData() {
  if (!confirm('Are you sure you want to clear all transactions and budgets? This cannot be undone.')) return;
  state.transactions = [];
  state.budgets = {};
  LocalStorageDB.save();
  showToast('All financial records cleared.', 'info');
  renderUI();
}

// ==========================================
// EVENT LISTENERS INITIALIZATION
// ==========================================
function initEvents() {
  // Month Picker
  const monthPicker = document.getElementById('month-picker');
  monthPicker.value = state.currentMonth;
  monthPicker.addEventListener('change', (e) => {
    state.currentMonth = e.target.value;
    LocalStorageDB.save();
    renderUI();
  });

  // Modal Triggers
  document.getElementById('btn-open-add-tx').addEventListener('click', openAddTransactionModal);
  document.getElementById('btn-open-add-tx-secondary').addEventListener('click', openAddTransactionModal);
  document.getElementById('btn-empty-add-tx').addEventListener('click', openAddTransactionModal);
  document.getElementById('btn-open-budget').addEventListener('click', openBudgetModal);
  document.getElementById('btn-quick-budget-edit').addEventListener('click', openBudgetModal);
  document.getElementById('btn-quick-add-cat').addEventListener('click', openCategoryModal);

  // Actions Menu Dropdown Toggle
  const actionsMenuBtn = document.getElementById('btn-actions-menu');
  const actionsDropdown = document.getElementById('actions-dropdown');
  actionsMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    actionsDropdown.classList.toggle('hidden');
  });
  document.addEventListener('click', () => {
    actionsDropdown.classList.add('hidden');
  });

  // Actions Dropdown buttons
  document.getElementById('btn-seed-sample').addEventListener('click', () => {
    actionsDropdown.classList.add('hidden');
    seedSampleData();
  });
  document.getElementById('btn-open-data-mgr').addEventListener('click', () => {
    actionsDropdown.classList.add('hidden');
    openModal('modal-data');
  });
  document.getElementById('btn-print-report').addEventListener('click', () => {
    actionsDropdown.classList.add('hidden');
    window.print();
  });
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    actionsDropdown.classList.add('hidden');
    clearAllData();
  });

  // Forms Submits
  document.getElementById('form-tx').addEventListener('submit', handleSaveTransaction);
  document.getElementById('form-budget').addEventListener('submit', handleSaveBudget);
  document.getElementById('form-category').addEventListener('submit', handleSaveCategory);

  // Transaction Type Toggle Buttons in Modal
  document.getElementById('tx-type-btn-expense').addEventListener('click', () => setTxTypeInModal('expense'));
  document.getElementById('tx-type-btn-income').addEventListener('click', () => setTxTypeInModal('income'));

  // Quick Amount Buttons
  document.querySelectorAll('.quick-amt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const amtInput = document.getElementById('tx-input-amount');
      const cur = parseFloat(amtInput.value) || 0;
      const add = parseFloat(btn.dataset.amt) || 0;
      amtInput.value = (cur + add).toFixed(2);
    });
  });

  // Filters & Search
  document.getElementById('tx-search').addEventListener('input', (e) => {
    state.filters.search = e.target.value.trim();
    renderTransactionsTable();
  });

  document.querySelectorAll('.tx-type-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tx-type-tab').forEach(t => {
        t.className = 'tx-type-tab flex-1 py-1 rounded text-center transition text-slate-500 hover:text-slate-800';
      });
      tab.className = 'tx-type-tab flex-1 py-1 rounded text-center transition bg-white text-slate-900 shadow-xs';
      state.filters.type = tab.dataset.type;
      renderTransactionsTable();
    });
  });

  document.getElementById('tx-category-filter').addEventListener('change', (e) => {
    state.filters.category = e.target.value;
    renderTransactionsTable();
  });

  // Export / Import
  document.getElementById('btn-export-json').addEventListener('click', exportAsJSON);
  document.getElementById('btn-export-csv').addEventListener('click', exportAsCSV);
  document.getElementById('import-file-input').addEventListener('change', handleImportFile);

  setupModalClosers();
}

// ==========================================
// BOOTSTRAP APPLICATION
// ==========================================
async function initApp() {
  LocalStorageDB.load();
  initEvents();

  // Try synchronizing with fullstack SQLite server
  await syncWithBackend();

  // If both server and localStorage are empty on very first launch, seed sample data so user immediately sees rich graphs
  if (state.transactions.length === 0) {
    await seedSampleData();
  }

  renderUI();
}

document.addEventListener('DOMContentLoaded', initApp);
