#!/usr/bin/env python3
"""Unified test runner for Python eval layer."""

import subprocess
import sys
from pathlib import Path


def main():
    root_dir = Path(__file__).parent.parent
    python_eval_dir = root_dir / "packages" / "python-eval"
    tests_dir = python_eval_dir / "tests"

    if not tests_dir.exists():
        print(f"❌ Python tests directory not found: {tests_dir}")
        return 1

    print(f"Running Python tests from {tests_dir}...")
    result = subprocess.run(
        [sys.executable, "-m", "pytest", str(tests_dir), "-v", "--tb=short"],
        cwd=str(python_eval_dir),
    )

    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
