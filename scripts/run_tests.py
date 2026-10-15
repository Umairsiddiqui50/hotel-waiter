import os
import sys
import subprocess

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BE_TESTS = os.path.join(BASE_DIR, "BE", "tests")

def main():
    print(f"\n=== Running Grand Bistro Backend Regression Test Suite ===")
    cmd = [
        sys.executable,
        "-m", "pytest",
        BE_TESTS,
        "-o", "pythonpath=BE DB backend"
    ] + sys.argv[1:]

    print(f"Executing: {' '.join(cmd)}\n")
    res = subprocess.run(cmd, cwd=BASE_DIR)
    sys.exit(res.returncode)

if __name__ == "__main__":
    main()
