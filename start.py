#!/usr/bin/env python3
"""
Restaurant Smart Table Service & Waiter Routing System
Documented Main Entry Point
"""
import os
import sys
import argparse
import subprocess

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

def start_backend():
    script = os.path.join(BASE_DIR, "scripts", "start_backend.py")
    subprocess.run([sys.executable, script])

def check_database():
    script = os.path.join(BASE_DIR, "scripts", "check_database.py")
    subprocess.run([sys.executable, script])

def run_tests():
    script = os.path.join(BASE_DIR, "scripts", "run_tests.py")
    subprocess.run([sys.executable, script])

def start_frontend(port=3000):
    fe_dir = os.path.join(BASE_DIR, "FE")
    print(f"\n=======================================================")
    print(f"  Starting Frontend Web Server")
    print(f"  URL: http://127.0.0.1:{port}/")
    print(f"  Customer Table 7: http://127.0.0.1:{port}/#/customer?table=7")
    print(f"  Waiter Portal:    http://127.0.0.1:{port}/#/waiter/dashboard")
    print(f"  Manager Console:  http://127.0.0.1:{port}/#/manager/dashboard")
    print(f"=======================================================\n")
    subprocess.run([sys.executable, "-m", "http.server", str(port), "--directory", fe_dir])

def seed_database():
    script = os.path.join(BASE_DIR, "DB", "seed.py")
    subprocess.run([sys.executable, script])

def interactive_menu():
    while True:
        print("""
========================================================================
Restaurant Smart Table Service & Waiter Routing System — Grand Bistro
========================================================================
1. Start Backend Server (FastAPI on http://127.0.0.1:8000)
2. Check Database Connectivity & Schema Health
3. Run Backend Regression Test Suite
4. Start Frontend Dev Server (http://127.0.0.1:3000)
5. Run Safe Database Seeding (DB/seed.py)
0. Exit
========================================================================
""")
        try:
            choice = input("Enter choice [0-5]: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nExiting.")
            break

        if choice == "1":
            start_backend()
        elif choice == "2":
            check_database()
        elif choice == "3":
            run_tests()
        elif choice == "4":
            start_frontend()
        elif choice == "5":
            seed_database()
        elif choice == "0":
            print("Exiting.")
            break
        else:
            print("Invalid choice. Please select 0 to 5.")

def main():
    parser = argparse.ArgumentParser(description="Grand Bistro Smart Table Service Main Entry Point")
    parser.add_argument("--backend", action="store_true", help="Start FastAPI backend server")
    parser.add_argument("--check-db", action="store_true", help="Check database connectivity and integrity")
    parser.add_argument("--test", action="store_true", help="Run backend regression test suite")
    parser.add_argument("--frontend", action="store_true", help="Start frontend local dev server")
    parser.add_argument("--seed", action="store_true", help="Run safe database seed script")
    parser.add_argument("--port", type=int, default=3000, help="Port for frontend dev server (default: 3000)")
    
    # Handle shorthand positional arguments as well
    if len(sys.argv) > 1 and sys.argv[1] in ["backend", "check-db", "test", "frontend", "seed"]:
        cmd = sys.argv[1]
        if cmd == "backend": start_backend()
        elif cmd == "check-db": check_database()
        elif cmd == "test": run_tests()
        elif cmd == "frontend": start_frontend()
        elif cmd == "seed": seed_database()
        return

    args, unknown = parser.parse_known_args()

    if args.backend:
        start_backend()
    elif args.check_db:
        check_database()
    elif args.test:
        run_tests()
    elif args.frontend:
        start_frontend(args.port)
    elif args.seed:
        seed_database()
    else:
        interactive_menu()

if __name__ == "__main__":
    main()
