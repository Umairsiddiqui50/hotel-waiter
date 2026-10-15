import os
import sys
import argparse

# Add BE and DB to sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BE_DIR = os.path.join(BASE_DIR, "BE")
DB_DIR = os.path.join(BASE_DIR, "DB")

for p in [BE_DIR, DB_DIR, BASE_DIR]:
    if p not in sys.path:
        sys.path.insert(0, p)

def main():
    parser = argparse.ArgumentParser(description="Start FastAPI Restaurant Backend Server")
    parser.add_argument("--host", default="127.0.0.1", help="Host interface to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind (default: 8000)")
    parser.add_argument("--reload", action="store_true", default=True, help="Enable auto-reload on code changes")
    args = parser.parse_args()

    print(f"\n=======================================================")
    print(f"  Starting Grand Bistro Smart Table Service Backend")
    print(f"  Binding: http://{args.host}:{args.port}")
    print(f"  API Docs: http://{args.host}:{args.port}/docs")
    print(f"  ReDoc:    http://{args.host}:{args.port}/redoc")
    print(f"=======================================================\n")

    try:
        import uvicorn
    except ImportError:
        print("[ERROR] uvicorn is not installed. Run: pip install uvicorn")
        sys.exit(1)

    try:
        # We run BE.app.main:app
        uvicorn.run("BE.app.main:app", host=args.host, port=args.port, reload=args.reload)
    except Exception as e:
        print(f"[FATAL ERROR] Backend failed to start: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
