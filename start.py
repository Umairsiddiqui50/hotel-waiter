#!/usr/bin/env python3
"""
Restaurant Smart Table Service & Waiter Routing System
Grand Bistro Unified Control & Startup CLI
"""
import os
import sys
import time
import socket
import argparse
import subprocess
import webbrowser

# Ensure UTF-8 output on Windows consoles if supported
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

def is_port_in_use(port: int) -> bool:
    """Check if a TCP port is currently listening on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0

def check_backend_healthy(port: int = 8000) -> bool:
    """Check if the backend health check endpoint returns 200."""
    try:
        import urllib.request
        import json
        url = f"http://127.0.0.1:{port}/api/v1/health"
        req = urllib.request.Request(url, headers={"User-Agent": "HealthCheck/1.0"})
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            data = json.loads(resp.read().decode())
            return data.get("status") == "healthy"
    except Exception:
        return False

def start_backend(port: int = 8000):
    script = os.path.join(BASE_DIR, "scripts", "start_backend.py")
    subprocess.run([sys.executable, script, "--port", str(port)])

def check_database():
    script = os.path.join(BASE_DIR, "scripts", "check_database.py")
    subprocess.run([sys.executable, script])

def run_tests():
    script = os.path.join(BASE_DIR, "scripts", "run_tests.py")
    subprocess.run([sys.executable, script])

def start_frontend(port: int = 3000):
    fe_dir = os.path.join(BASE_DIR, "FE")
    print("\n" + "=" * 60)
    print("  Starting Frontend Web Server")
    print(f"  URL:              http://127.0.0.1:{port}/")
    print(f"  Customer Table 7: http://127.0.0.1:{port}/#/customer?table=7")
    print(f"  Kitchen KDS:      http://127.0.0.1:{port}/#/kitchen")
    print(f"  Waiter Portal:    http://127.0.0.1:{port}/#/waiter/dashboard")
    print(f"  Manager Console:  http://127.0.0.1:{port}/#/admin/dashboard")
    print("=" * 60 + "\n")
    subprocess.run([sys.executable, "-m", "http.server", str(port), "--directory", fe_dir])

def start_both(port_be: int = 8000, port_fe: int = 3000, open_browser: bool = False):
    """Launch both Backend and Frontend concurrently."""
    be_script = os.path.join(BASE_DIR, "scripts", "start_backend.py")
    fe_dir = os.path.join(BASE_DIR, "FE")

    proc_be = None
    proc_fe = None

    print("\n" + "=" * 72)
    print("  Starting Grand Bistro Full Stack (Backend + Frontend + MySQL)")
    print("=" * 72)

    # 1. Start or detect backend
    if is_port_in_use(port_be):
        if check_backend_healthy(port_be):
            print(f"  [OK] Backend is ALREADY running and healthy at: http://127.0.0.1:{port_be}")
        else:
            print(f"  [!] Port {port_be} is in use by another process.")
    else:
        print(f"  [*] Launching FastAPI Backend on port {port_be}...")
        proc_be = subprocess.Popen([sys.executable, be_script, "--port", str(port_be)])
        for _ in range(10):
            time.sleep(0.5)
            if check_backend_healthy(port_be):
                print(f"  [OK] Backend started successfully on port {port_be}")
                break

    # 2. Start or detect frontend
    if is_port_in_use(port_fe):
        print(f"  [OK] Frontend is ALREADY running at: http://127.0.0.1:{port_fe}")
    else:
        print(f"  [*] Launching Frontend HTTP Server on port {port_fe}...")
        proc_fe = subprocess.Popen([sys.executable, "-m", "http.server", str(port_fe), "--directory", fe_dir])
        time.sleep(0.5)
        print(f"  [OK] Frontend started successfully on port {port_fe}")

    print("\n" + "=" * 72)
    print("  GRAND BISTRO SYSTEM IS ONLINE & ACTIVE!")
    print("=" * 72)
    print(f"  [Customer Screen]   http://127.0.0.1:{port_fe}/#/customer?table=7")
    print(f"  [Kitchen KDS]       http://127.0.0.1:{port_fe}/#/kitchen")
    print(f"  [Waiter Portal]     http://127.0.0.1:{port_fe}/#/waiter/dashboard")
    print(f"  [Manager Console]   http://127.0.0.1:{port_fe}/#/admin/dashboard")
    print(f"  [Backend Swagger]   http://127.0.0.1:{port_be}/docs")
    print(f"  [Health Check]      http://127.0.0.1:{port_be}/api/v1/health")
    print(f"  [MySQL Workbench]   Database: hotel_waiter_db (root:8094271418@127.0.0.1:3306)")
    print("=" * 72)
    print("  Press CTRL+C at any time to shut down servers.\n")

    if open_browser:
        try:
            webbrowser.open(f"http://127.0.0.1:{port_fe}/#/customer?table=7")
        except Exception:
            pass

    try:
        while True:
            time.sleep(1)
            if proc_be and proc_be.poll() is not None:
                print("[WARNING] Backend process exited.")
                break
            if proc_fe and proc_fe.poll() is not None:
                print("[WARNING] Frontend process exited.")
                break
    except KeyboardInterrupt:
        print("\n[SHUTDOWN] Stopping servers gracefully...")
    finally:
        for proc in [proc_fe, proc_be]:
            if proc and proc.poll() is None:
                try:
                    proc.terminate()
                    proc.wait(timeout=2)
                except Exception:
                    proc.kill()
        print("[SHUTDOWN] Complete.")

def seed_database():
    script = os.path.join(BASE_DIR, "DB", "seed.py")
    subprocess.run([sys.executable, script])

def interactive_menu():
    while True:
        print("""
========================================================================
Restaurant Smart Table Service & Waiter Routing System — Grand Bistro
========================================================================
1. Start Full Stack (Backend + Frontend together) [RECOMMENDED]
2. Start Backend Server only (FastAPI on http://127.0.0.1:8000)
3. Start Frontend Dev Server only (http://127.0.0.1:3000)
4. Check Database Connectivity (MySQL hotel_waiter_db & Tables)
5. Run Backend Regression Test Suite
6. Run Safe Database Seeding (DB/seed.py)
0. Exit
========================================================================
""")
        try:
            choice = input("Enter choice [0-6]: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nExiting.")
            break

        if choice == "1":
            start_both(open_browser=True)
        elif choice == "2":
            start_backend()
        elif choice == "3":
            start_frontend()
        elif choice == "4":
            check_database()
        elif choice == "5":
            run_tests()
        elif choice == "6":
            seed_database()
        elif choice == "0":
            print("Exiting.")
            break
        else:
            print("Invalid choice. Please select 0 to 6.")

def main():
    parser = argparse.ArgumentParser(description="Grand Bistro Smart Table Service Main Entry Point")
    parser.add_argument("--all", action="store_true", help="Start both Backend and Frontend concurrently")
    parser.add_argument("--backend", action="store_true", help="Start FastAPI backend server")
    parser.add_argument("--frontend", action="store_true", help="Start frontend local dev server")
    parser.add_argument("--check-db", action="store_true", help="Check database connectivity and integrity")
    parser.add_argument("--test", action="store_true", help="Run backend regression test suite")
    parser.add_argument("--seed", action="store_true", help="Run safe database seed script")
    parser.add_argument("--port", type=int, default=3000, help="Port for frontend dev server (default: 3000)")
    parser.add_argument("--be-port", type=int, default=8000, help="Port for backend server (default: 8000)")
    parser.add_argument("--open", action="store_true", default=False, help="Automatically open browser")
    
    # Handle shorthand positional arguments as well
    if len(sys.argv) > 1 and sys.argv[1] in ["all", "both", "full", "backend", "check-db", "test", "frontend", "seed"]:
        cmd = sys.argv[1]
        if cmd in ["all", "both", "full"]: start_both(open_browser=True)
        elif cmd == "backend": start_backend()
        elif cmd == "check-db": check_database()
        elif cmd == "test": run_tests()
        elif cmd == "frontend": start_frontend()
        elif cmd == "seed": seed_database()
        return

    args, unknown = parser.parse_known_args()

    if args.all:
        start_both(args.be_port, args.port, open_browser=args.open)
    elif args.backend:
        start_backend(args.be_port)
    elif args.frontend:
        start_frontend(args.port)
    elif args.check_db:
        check_database()
    elif args.test:
        run_tests()
    elif args.seed:
        seed_database()
    else:
        interactive_menu()

if __name__ == "__main__":
    main()
