#!/usr/bin/env python3
"""Launcher for the Afterleaf Library Port GUI.

On Linux/macOS, run this file with python3 or double-click it if your file
manager supports Python scripts. On Windows, double-click library-port-gui.pyw
instead to avoid a console window.
"""

import runpy
import sys
from pathlib import Path

script = Path(__file__).resolve().with_suffix(".pyw")
if not script.exists():
    print(f"GUI script not found: {script}", file=sys.stderr)
    sys.exit(1)

runpy.run_path(str(script), run_name="__main__")
