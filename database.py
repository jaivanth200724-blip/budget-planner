import sqlite3
import json
import os
from datetime import datetime

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'budget.db')

DEFAULT_CATEGORIES = [
    {"name": "Housing", "type": "expense", "color": "#6366F1", "icon": "home"},
    {"name": "Food & Dining", "type": "expense", "color": "#F59E0B", "icon": "utensils"},
    {"name": "Transportation", "type": "expense", "color": "#3B82F6", "icon": "car"},
    {"name": "Utilities", "type": "expense", "color": "#10B981", "icon": "zap"},
    {"name": "Entertainment", "type": "expense", "color": "#EC4899", "icon": "film"},
    {"name": "Healthcare", "type": "expense", "color": "#EF4444", "icon": "heart-pulse"},
    {"name": "Shopping", "type": "expense", "color": "#8B5CF6", "icon": "shopping-bag"},
    {"name": "Education", "type": "expense", "color": "#14B8A6", "icon": "book-open"},
    {"name": "Personal Care", "type": "expense", "color": "#F97316", "icon": "smile"},
    {"name": "Investments", "type": "expense", "color": "#06B6D4", "icon": "trending-up"},
    {"name": "Miscellaneous", "type": "expense", "color": "#64748B", "icon": "more-horizontal"},
    {"name": "Salary", "type": "income", "color": "#10B981", "icon": "briefcase"},
    {"name": "Freelance", "type": "income", "color": "#06B6D4", "icon": "laptop"},
    {"name": "Investments & Dividends", "type": "income", "color": "#8B5CF6", "icon": "chart-pie"},
    {"name": "Gifts & Bonus", "type": "income", "color": "#F59E0B", "icon": "gift"},
    {"name": "Other Income", "type": "income", "color": "#64748B", "icon": "plus-circle"}
]

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Categories table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                type TEXT NOT NULL,
                color TEXT DEFAULT '#64748B',
                icon TEXT DEFAULT 'tag',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Budgets table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS budgets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                month TEXT UNIQUE NOT NULL,
                total_budget REAL NOT NULL DEFAULT 0.0,
                category_budgets TEXT DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Transactions table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                amount REAL NOT NULL,
                category TEXT NOT NULL,
                date TEXT NOT NULL,
                description TEXT NOT NULL,
                payment_method TEXT DEFAULT 'Debit Card',
                notes TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Insert default categories if none exist
        cursor.execute('SELECT COUNT(*) as cnt FROM categories')
        if cursor.fetchone()['cnt'] == 0:
            for cat in DEFAULT_CATEGORIES:
                cursor.execute('''
                    INSERT INTO categories (name, type, color, icon)
                    VALUES (?, ?, ?, ?)
                ''', (cat['name'], cat['type'], cat['color'], cat['icon']))
        
        conn.commit()

def get_categories():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM categories ORDER BY type DESC, name ASC')
        return [dict(row) for row in cursor.fetchall()]

def add_category(name, type_, color, icon):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT OR IGNORE INTO categories (name, type, color, icon)
            VALUES (?, ?, ?, ?)
        ''', (name, type_, color or '#64748B', icon or 'tag'))
        conn.commit()
        cursor.execute('SELECT * FROM categories WHERE name = ?', (name,))
        row = cursor.fetchone()
        return dict(row) if row else None

def get_budget(month):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM budgets WHERE month = ?', (month,))
        row = cursor.fetchone()
        if row:
            res = dict(row)
            try:
                res['category_budgets'] = json.loads(res.get('category_budgets') or '{}')
            except Exception:
                res['category_budgets'] = {}
            return res
        return {
            "month": month,
            "total_budget": 0.0,
            "category_budgets": {}
        }

def set_budget(month, total_budget, category_budgets=None):
    cat_budgets_json = json.dumps(category_budgets or {})
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO budgets (month, total_budget, category_budgets, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(month) DO UPDATE SET
                total_budget = excluded.total_budget,
                category_budgets = excluded.category_budgets,
                updated_at = CURRENT_TIMESTAMP
        ''', (month, float(total_budget), cat_budgets_json))
        conn.commit()
        return get_budget(month)

def get_transactions(month=None, category=None, type_=None, search=None, limit=1000):
    with get_db() as conn:
        cursor = conn.cursor()
        query = 'SELECT * FROM transactions WHERE 1=1'
        params = []

        if month:
            query += ' AND strftime("%Y-%m", date) = ?'
            params.append(month)
        if category and category != 'All':
            query += ' AND category = ?'
            params.append(category)
        if type_ and type_ != 'All':
            query += ' AND type = ?'
            params.append(type_)
        if search:
            query += ' AND (description LIKE ? OR notes LIKE ? OR category LIKE ?)'
            term = f"%{search}%"
            params.extend([term, term, term])

        query += ' ORDER BY date DESC, id DESC LIMIT ?'
        params.append(limit)

        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def get_transaction_by_id(tx_id):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM transactions WHERE id = ?', (tx_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def add_transaction(data):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO transactions (type, amount, category, date, description, payment_method, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            data.get('type', 'expense'),
            float(data.get('amount', 0)),
            data.get('category', 'Miscellaneous'),
            data.get('date', datetime.now().strftime('%Y-%m-%d')),
            data.get('description', 'Untitled'),
            data.get('payment_method', 'Debit Card'),
            data.get('notes', '')
        ))
        conn.commit()
        tx_id = cursor.lastrowid
        return get_transaction_by_id(tx_id)

def update_transaction(tx_id, data):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE transactions
            SET type = ?, amount = ?, category = ?, date = ?, description = ?, payment_method = ?, notes = ?
            WHERE id = ?
        ''', (
            data.get('type', 'expense'),
            float(data.get('amount', 0)),
            data.get('category', 'Miscellaneous'),
            data.get('date', datetime.now().strftime('%Y-%m-%d')),
            data.get('description', 'Untitled'),
            data.get('payment_method', 'Debit Card'),
            data.get('notes', ''),
            tx_id
        ))
        conn.commit()
        return get_transaction_by_id(tx_id)

def delete_transaction(tx_id):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM transactions WHERE id = ?', (tx_id,))
        conn.commit()
        return cursor.rowcount > 0

def get_summary(month):
    with get_db() as conn:
        cursor = conn.cursor()

        # Income total
        cursor.execute('''
            SELECT COALESCE(SUM(amount), 0) as total
            FROM transactions
            WHERE type = 'income' AND strftime("%Y-%m", date) = ?
        ''', (month,))
        total_income = float(cursor.fetchone()['total'])

        # Expense total
        cursor.execute('''
            SELECT COALESCE(SUM(amount), 0) as total
            FROM transactions
            WHERE type = 'expense' AND strftime("%Y-%m", date) = ?
        ''', (month,))
        total_expense = float(cursor.fetchone()['total'])

        # Budget
        budget_info = get_budget(month)
        total_budget = budget_info['total_budget']
        category_budgets = budget_info.get('category_budgets', {})

        # Expenses by Category
        cursor.execute('''
            SELECT category, COALESCE(SUM(amount), 0) as spent, COUNT(*) as count
            FROM transactions
            WHERE type = 'expense' AND strftime("%Y-%m", date) = ?
            GROUP BY category
            ORDER BY spent DESC
        ''', (month,))
        cat_rows = cursor.fetchall()

        # Get categories styling
        cursor.execute('SELECT name, color, icon FROM categories')
        cat_meta = {row['name']: {'color': row['color'], 'icon': row['icon']} for row in cursor.fetchall()}

        category_breakdown = []
        for r in cat_rows:
            name = r['category']
            spent = float(r['spent'])
            allocated_budget = float(category_budgets.get(name, 0.0))
            meta = cat_meta.get(name, {'color': '#64748B', 'icon': 'tag'})
            percent_of_total_expense = round((spent / total_expense * 100), 1) if total_expense > 0 else 0
            percent_of_category_budget = round((spent / allocated_budget * 100), 1) if allocated_budget > 0 else None

            category_breakdown.append({
                "category": name,
                "spent": spent,
                "count": r['count'],
                "allocated_budget": allocated_budget,
                "percentage_of_expense": percent_of_total_expense,
                "percentage_of_budget": percent_of_category_budget,
                "remaining": (allocated_budget - spent) if allocated_budget > 0 else None,
                "color": meta['color'],
                "icon": meta['icon']
            })

        # Daily spending & income
        cursor.execute('''
            SELECT date,
                   SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as daily_expense,
                   SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as daily_income
            FROM transactions
            WHERE strftime("%Y-%m", date) = ?
            GROUP BY date
            ORDER BY date ASC
        ''', (month,))
        daily_trends = [
            {
                "date": row['date'],
                "expense": float(row['daily_expense']),
                "income": float(row['daily_income'])
            }
            for row in cursor.fetchall()
        ]

        # Remaining and KPIs
        remaining_balance = total_income - total_expense
        budget_remaining = total_budget - total_expense if total_budget > 0 else 0
        budget_used_percentage = round((total_expense / total_budget * 100), 1) if total_budget > 0 else 0
        savings_rate = round((remaining_balance / total_income * 100), 1) if total_income > 0 else 0

        # Health status
        if total_budget == 0:
            health = "no_budget"
        elif budget_used_percentage > 100:
            health = "overbudget"
        elif budget_used_percentage >= 85:
            health = "warning"
        else:
            health = "healthy"

        return {
            "month": month,
            "total_income": total_income,
            "total_expense": total_expense,
            "remaining_balance": remaining_balance,
            "total_budget": total_budget,
            "budget_remaining": budget_remaining,
            "budget_used_percentage": budget_used_percentage,
            "savings_rate": savings_rate,
            "health_status": health,
            "category_breakdown": category_breakdown,
            "daily_trends": daily_trends
        }

def seed_sample_data():
    """Populates realistic sample data for the current month."""
    init_db()
    current_month = datetime.now().strftime('%Y-%m')
    
    # Set default budget
    set_budget(current_month, 4500.0, {
        "Housing": 1500.0,
        "Food & Dining": 600.0,
        "Transportation": 350.0,
        "Utilities": 250.0,
        "Entertainment": 200.0,
        "Healthcare": 150.0,
        "Shopping": 300.0
    })

    # Clear existing demo transactions if any for the month to avoid duplications
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM transactions WHERE strftime("%Y-%m", date) = ?', (current_month,))
        conn.commit()

    sample_txs = [
        {"type": "income", "amount": 4200.00, "category": "Salary", "day": "01", "description": "Primary Tech Job Monthly Salary", "payment_method": "Bank Transfer", "notes": "Direct deposit"},
        {"type": "income", "amount": 650.00, "category": "Freelance", "day": "08", "description": "Web Development Project Milestone", "payment_method": "Bank Transfer", "notes": "Client payout"},
        {"type": "income", "amount": 120.00, "category": "Investments & Dividends", "day": "15", "description": "Quarterly Index Fund Dividends", "payment_method": "Bank Transfer", "notes": "Auto-credited"},
        
        {"type": "expense", "amount": 1450.00, "category": "Housing", "day": "02", "description": "Apartment Rent & Building Maintenance", "payment_method": "Bank Transfer", "notes": "Monthly rent"},
        {"type": "expense", "amount": 142.50, "category": "Utilities", "day": "04", "description": "High-Speed Internet & Electricity Bill", "payment_method": "Credit Card", "notes": "Auto-pay"},
        {"type": "expense", "amount": 115.80, "category": "Food & Dining", "day": "05", "description": "Weekly Whole Foods Grocery Restock", "payment_method": "Debit Card", "notes": "Organic produce"},
        {"type": "expense", "amount": 45.00, "category": "Transportation", "day": "06", "description": "Gas Station Refuel", "payment_method": "Credit Card", "notes": "Shell station"},
        {"type": "expense", "amount": 32.50, "category": "Food & Dining", "day": "07", "description": "Team Lunch Bistro", "payment_method": "Credit Card", "notes": "Social lunch"},
        {"type": "expense", "amount": 18.99, "category": "Entertainment", "day": "09", "description": "Netflix & Spotify Premium Subscription", "payment_method": "Credit Card", "notes": "Monthly recurring"},
        {"type": "expense", "amount": 89.20, "category": "Shopping", "day": "10", "description": "Ergonomic Office Chair Cushion", "payment_method": "Credit Card", "notes": "Amazon order"},
        {"type": "expense", "amount": 65.00, "category": "Healthcare", "day": "11", "description": "Prescription Refill & Vitamins", "payment_method": "Debit Card", "notes": "Pharmacy"},
        {"type": "expense", "amount": 84.30, "category": "Food & Dining", "day": "12", "description": "Trader Joe's Pantry Run", "payment_method": "Debit Card", "notes": "Weekly snacks"},
        {"type": "expense", "amount": 55.00, "category": "Entertainment", "day": "13", "description": "Weekend Cinema & IMAX Tickets", "payment_method": "Debit Card", "notes": "Movie night"},
        {"type": "expense", "amount": 38.00, "category": "Transportation", "day": "14", "description": "Metro Transit Monthly Pass reload", "payment_method": "Credit Card", "notes": "Commute"}
    ]

    for tx in sample_txs:
        date_str = f"{current_month}-{tx['day']}"
        add_transaction({
            "type": tx["type"],
            "amount": tx["amount"],
            "category": tx["category"],
            "date": date_str,
            "description": tx["description"],
            "payment_method": tx["payment_method"],
            "notes": tx["notes"]
        })

    return {"status": "success", "message": f"Sample financial data seeded for {current_month}."}

def export_all():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM transactions ORDER BY date DESC')
        txs = [dict(r) for r in cursor.fetchall()]
        cursor.execute('SELECT * FROM budgets')
        budgets = [dict(r) for r in cursor.fetchall()]
        for b in budgets:
            try:
                b['category_budgets'] = json.loads(b.get('category_budgets') or '{}')
            except Exception:
                b['category_budgets'] = {}
        cursor.execute('SELECT * FROM categories')
        cats = [dict(r) for r in cursor.fetchall()]

        return {
            "version": "1.0",
            "exported_at": datetime.now().isoformat(),
            "budgets": budgets,
            "categories": cats,
            "transactions": txs
        }

def import_all(data):
    init_db()
    with get_db() as conn:
        cursor = conn.cursor()
        if 'categories' in data:
            for cat in data['categories']:
                cursor.execute('''
                    INSERT OR IGNORE INTO categories (name, type, color, icon)
                    VALUES (?, ?, ?, ?)
                ''', (cat.get('name'), cat.get('type', 'expense'), cat.get('color', '#64748B'), cat.get('icon', 'tag')))
        
        if 'budgets' in data:
            for b in data['budgets']:
                cat_b = json.dumps(b.get('category_budgets', {}))
                cursor.execute('''
                    INSERT INTO budgets (month, total_budget, category_budgets, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(month) DO UPDATE SET
                        total_budget = excluded.total_budget,
                        category_budgets = excluded.category_budgets,
                        updated_at = CURRENT_TIMESTAMP
                ''', (b.get('month'), float(b.get('total_budget', 0)), cat_b))

        if 'transactions' in data:
            for tx in data['transactions']:
                cursor.execute('''
                    INSERT INTO transactions (type, amount, category, date, description, payment_method, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    tx.get('type', 'expense'),
                    float(tx.get('amount', 0)),
                    tx.get('category', 'Miscellaneous'),
                    tx.get('date'),
                    tx.get('description', 'Imported'),
                    tx.get('payment_method', 'Debit Card'),
                    tx.get('notes', '')
                ))
        conn.commit()
    return {"status": "success", "message": "Import completed successfully."}
