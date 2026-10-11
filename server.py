import http.server
import json
import mimetypes
import os
import sys
import urllib.parse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import database

PORT = 8000
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public')

class BudgetAppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def end_headers(self):
        # Enable CORS for local testing/development flexibility
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def parse_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > 0:
            raw_data = self.rfile.read(content_length).decode('utf-8')
            try:
                return json.loads(raw_data)
            except Exception:
                return {}
        return {}

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # Helper to get single query parameter
        def get_param(name, default=None):
            val = query.get(name)
            return val[0] if val else default

        # REST API endpoints
        if path == '/api/health':
            self.send_json({"status": "ok", "app": "Personal Budget Planner API"})
            return

        if path == '/api/categories':
            cats = database.get_categories()
            self.send_json(cats)
            return

        if path == '/api/budgets':
            month = get_param('month')
            budget = database.get_budget(month)
            self.send_json(budget)
            return

        if path == '/api/transactions':
            month = get_param('month')
            category = get_param('category')
            type_ = get_param('type')
            search = get_param('search')
            txs = database.get_transactions(month=month, category=category, type_=type_, search=search)
            self.send_json(txs)
            return

        if path == '/api/summary':
            month = get_param('month')
            summary = database.get_summary(month)
            self.send_json(summary)
            return

        if path == '/api/export':
            export_data = database.export_all()
            self.send_json(export_data)
            return

        # Fallback to static files
        if path == '/' or path == '':
            self.path = '/index.html'
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.parse_body()

        if path == '/api/transactions':
            new_tx = database.add_transaction(body)
            self.send_json(new_tx, status=201)
            return

        if path == '/api/budgets':
            month = body.get('month')
            total = body.get('total_budget', 0)
            category_budgets = body.get('category_budgets', {})
            saved = database.set_budget(month, total, category_budgets)
            self.send_json(saved, status=200)
            return

        if path == '/api/categories':
            name = body.get('name')
            type_ = body.get('type', 'expense')
            color = body.get('color', '#64748B')
            icon = body.get('icon', 'tag')
            saved = database.add_category(name, type_, color, icon)
            self.send_json(saved, status=201)
            return

        if path == '/api/seed':
            res = database.seed_sample_data()
            self.send_json(res, status=200)
            return

        if path == '/api/import':
            res = database.import_all(body)
            self.send_json(res, status=200)
            return

        self.send_json({"error": "Endpoint not found"}, status=404)

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.parse_body()

        if path.startswith('/api/transactions/'):
            try:
                tx_id = int(path.split('/')[-1])
                updated = database.update_transaction(tx_id, body)
                if updated:
                    self.send_json(updated, status=200)
                else:
                    self.send_json({"error": "Transaction not found"}, status=404)
            except Exception as e:
                self.send_json({"error": str(e)}, status=400)
            return

        self.send_json({"error": "Endpoint not found"}, status=404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith('/api/transactions/'):
            try:
                tx_id = int(path.split('/')[-1])
                success = database.delete_transaction(tx_id)
                if success:
                    self.send_json({"status": "success", "id": tx_id}, status=200)
                else:
                    self.send_json({"error": "Transaction not found"}, status=404)
            except Exception as e:
                self.send_json({"error": str(e)}, status=400)
            return

        self.send_json({"error": "Endpoint not found"}, status=404)

def run_server(port=PORT):
    database.init_db()
    # Check if we should seed default data
    txs = database.get_transactions()
    if len(txs) == 0:
        database.seed_sample_data()

    server_address = ('', port)
    httpd = ThreadingHTTPServer(server_address, BudgetAppHandler)
    print(f"Personal Budget Planner Server running at http://localhost:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()

if __name__ == '__main__':
    port = PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    run_server(port)
