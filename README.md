# FinTrack Pro — Personal Budget Planner

A professional fullstack personal finance and budget management web application with dual-layer persistence (SQLite REST API + offline-first `localStorage`).

![FinTrack Pro](https://img.shields.io/badge/Architecture-Fullstack-indigo)
![Python](https://img.shields.io/badge/Backend-Python%203%20Standard%20Library-blue)
![Database](https://img.shields.io/badge/Database-SQLite3-emerald)
![Offline](https://img.shields.io/badge/Storage-localStorage%20Synced-success)

---

## ✨ Features

- **Monthly Budget Setting**: Set overall monthly spending caps and category-level budgets (Housing, Food, Utilities, Entertainment, etc.).
- **Income & Expense Tracking**: Record financial transactions with amount, date, category, payment method, and notes. Quick-add buttons for instant amount entry.
- **Real-Time Remaining Balance**: Immediate calculation and display of:
  - Total Income
  - Total Expenses
  - Net Savings / Balance (Income − Expenses)
  - Budget Remaining (Budget − Expenses)
  - Burn Rate % with dynamic health indicators (*Healthy*, *Caution*, *Over Budget!*)
- **Visual Spending Breakdown**: Interactive Chart.js Donut chart with category colors and percentage tooltips.
- **Cashflow Velocity Chart**: Daily income vs expense comparison bar chart.
- **Category Progress Cards**: Visual progress bars showing spent vs allocated limits for each spending category.
- **Search & Filters**: Instant search by description, category filters, and All/Expense/Income tabs.
- **Dual Persistence Architecture**:
  - **SQLite Backend**: Stores transactions, budgets, and categories in `budget.db` via REST API.
  - **localStorage Sync**: Real-time sync to browser `localStorage` ensuring full functionality even in standalone/offline mode.
- **Data Portability**:
  - Export records to CSV (compatible with Excel, Google Sheets).
  - Export full backup to JSON.
  - Import JSON backups.
  - One-click realistic sample data seeder.
  - Printable financial summary view.

---

## 🚀 Quick Start

### Start the Application Server
Run the launch script from the project folder:
```bash
cd /Users/jaivanth/.gemini/antigravity/scratch/budget-planner
./run.sh
```
Or directly using Python:
```bash
python3 server.py 8000
```

Open your browser and navigate to:
```
http://localhost:8000
```

> **Note**: Zero external dependencies required! Uses macOS built-in Python 3 standard library and SQLite.
