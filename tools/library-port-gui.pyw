#!/usr/bin/env python3
"""Afterleaf Library Port - graphical exporter/importer.

Double-click this file on Windows to run without a console window.
On Linux/macOS, run: python3 tools/library-port-gui.pyw
"""

import json
import shutil
import subprocess
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, scrolledtext, ttk

SECTION_TREE = [
    ("library-group", "Library", [
        ("library", "Prepared library pack"),
        ("sources", "Original source archives"),
    ]),
    ("content-group", "Content", [
        ("channels", "TV channels"),
        ("posters", "Posters"),
        ("artFrames", "Art frames"),
        ("models", "Models"),
        ("books", "Legacy books folder"),
    ]),
    ("world-group", "World", [
        ("worldSave", "World save"),
    ]),
    ("config-group", "Configuration", [
        ("libraryConfig", "Library config (machine specific paths)"),
    ]),
]

CHECKED = "[x] "
UNCHECKED = "[ ] "
PARTIAL = "[-] "

INSTALL_COLOR = "#2b6cb0"   # blue - always the Afterleaf install field
PACKAGE_COLOR = "#dd6b20"   # orange - always the package folder field


class SectionTree:
    def __init__(self, parent_widget):
        tree_container = tk.Frame(parent_widget)
        tree_container.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        tree_container.columnconfigure(0, weight=1)
        tree_container.rowconfigure(0, weight=1)

        self.tree = ttk.Treeview(tree_container, selectmode="browse", show="tree")
        self.tree.grid(row=0, column=0, sticky="nsew")

        scrollbar = ttk.Scrollbar(
            tree_container, orient=tk.VERTICAL, command=self.tree.yview
        )
        scrollbar.grid(row=0, column=1, sticky="ns")
        self.tree.configure(yscrollcommand=scrollbar.set)

        self.tree.bind("<ButtonRelease-1>", self.on_click)

        self.item_to_section: dict[str, str | None] = {}
        self.section_to_item: dict[str, str] = {}
        self.item_to_world_key: dict[str, str] = {}
        self.checked_sections: set[str] = set()
        self.checked_world_keys: set[str] = set()
        self.world_keys_loaded = False

        for group_id, group_label, children in SECTION_TREE:
            group_iid = self.tree.insert(
                "", tk.END, iid=group_id, text=UNCHECKED + group_label, open=True
            )
            self.item_to_section[group_iid] = None
            for section_id, section_label in children:
                item_iid = self.tree.insert(
                    group_iid,
                    tk.END,
                    iid=section_id,
                    text=UNCHECKED + section_label,
                )
                self.item_to_section[item_iid] = section_id
                self.section_to_item[section_id] = item_iid

    def on_click(self, event):
        item = self.tree.identify_row(event.y)
        if not item:
            return
        self.toggle(item)

    def section_state(self, section_id):
        if section_id == "worldSave" and self.world_keys_loaded:
            if not self.checked_world_keys:
                return "unchecked"
            total = len(self.item_to_world_key)
            if len(self.checked_world_keys) == total:
                return "checked"
            return "partial"
        return "checked" if section_id in self.checked_sections else "unchecked"

    def parent_state(self, item):
        children = self.tree.get_children(item)
        if not children:
            return "unchecked"
        checked_count = 0
        for child in children:
            section = self.item_to_section.get(child)
            if section is None:
                continue
            if self.section_state(section) == "checked":
                checked_count += 1
        if checked_count == 0:
            return "unchecked"
        if checked_count == len(children):
            return "checked"
        return "partial"

    def is_checked(self, item):
        if item in self.item_to_world_key:
            return item in self.checked_world_keys
        section = self.item_to_section.get(item)
        if section is not None:
            return self.section_state(section) == "checked"
        return self.parent_state(item) == "checked"

    def toggle(self, item):
        if item in self.item_to_world_key:
            key = self.item_to_world_key[item]
            if item in self.checked_world_keys:
                self.checked_world_keys.discard(item)
            else:
                self.checked_world_keys.add(item)
            self.update_text(item)
            self.update_text("worldSave")
            self.update_parents()
            return

        section = self.item_to_section.get(item)
        if section == "worldSave":
            if self.world_keys_loaded:
                new_state = not self.is_checked(item)
                if new_state:
                    self.checked_world_keys = set(self.item_to_world_key.keys())
                    self.checked_sections.add("worldSave")
                else:
                    self.checked_world_keys.clear()
                    self.checked_sections.discard("worldSave")
                for child in self.tree.get_children(item):
                    self.update_text(child)
            else:
                if item in self.checked_sections:
                    self.checked_sections.discard(item)
                else:
                    self.checked_sections.add(item)
            self.update_text(item)
            self.update_parents()
            return

        if section is None:
            new_state = not self.is_checked(item)
            for child in self.tree.get_children(item):
                child_section = self.item_to_section.get(child)
                if child_section is None:
                    continue
                if child_section == "worldSave" and self.world_keys_loaded:
                    if new_state:
                        self.checked_world_keys = set(self.item_to_world_key.keys())
                        self.checked_sections.add("worldSave")
                    else:
                        self.checked_world_keys.clear()
                        self.checked_sections.discard("worldSave")
                    for key_child in self.tree.get_children(child):
                        self.update_text(key_child)
                else:
                    if new_state:
                        self.checked_sections.add(child_section)
                    else:
                        self.checked_sections.discard(child_section)
                self.update_text(child)
        else:
            if new_state := not self.is_checked(item):
                self.checked_sections.add(item)
            else:
                self.checked_sections.discard(item)
            self.update_text(item)

        self.update_parents()

    def update_text(self, item):
        if item in self.item_to_world_key:
            label = self.tree.item(item, "text")[4:]
            prefix = CHECKED if item in self.checked_world_keys else UNCHECKED
            self.tree.item(item, text=prefix + label)
            return

        section = self.item_to_section.get(item)
        label = self.tree.item(item, "text")[4:]
        if section is None:
            state = self.parent_state(item)
        else:
            state = self.section_state(section)

        if state == "checked":
            prefix = CHECKED
        elif state == "partial":
            prefix = PARTIAL
        else:
            prefix = UNCHECKED
        self.tree.item(item, text=prefix + label)

    def update_parents(self):
        for group_id, _, _ in SECTION_TREE:
            self.update_text(group_id)

    def load_world_keys(self, keys):
        self.clear_world_keys()
        world_iid = self.section_to_item.get("worldSave")
        if not world_iid:
            return
        for key in sorted(keys):
            item_iid = f"worldSaveKey:{key}"
            self.tree.insert(
                world_iid,
                tk.END,
                iid=item_iid,
                text=UNCHECKED + key,
            )
            self.item_to_world_key[item_iid] = key
        self.world_keys_loaded = True
        self.tree.item(world_iid, open=True)
        self.update_text(world_iid)
        self.update_parents()

    def clear_world_keys(self):
        for item_iid in list(self.item_to_world_key.keys()):
            self.tree.delete(item_iid)
        self.item_to_world_key.clear()
        self.checked_world_keys.clear()
        self.world_keys_loaded = False
        if "worldSave" in self.section_to_item:
            self.update_text("worldSave")
        self.update_parents()

    def get_selected_sections(self):
        sections = set(self.checked_sections)
        if self.checked_world_keys:
            sections.add("worldSave")
        return [section for section in sections]

    def get_world_save_keys(self):
        if not self.world_keys_loaded:
            return None
        if not self.checked_world_keys:
            return []
        return [self.item_to_world_key[item] for item in self.checked_world_keys]

    def select_all(self):
        for item in self.tree.get_children(""):
            for child in self.tree.get_children(item):
                section = self.item_to_section.get(child)
                if section is None:
                    continue
                if section == "worldSave" and self.world_keys_loaded:
                    self.checked_world_keys = set(self.item_to_world_key.keys())
                    self.checked_sections.add("worldSave")
                else:
                    self.checked_sections.add(child)
                self.update_text(child)
                if section == "worldSave":
                    for key_child in self.tree.get_children(child):
                        self.update_text(key_child)
        self.update_parents()

    def select_none(self):
        self.checked_sections.clear()
        self.checked_world_keys.clear()
        for item in self.tree.get_children(""):
            for child in self.tree.get_children(item):
                self.update_text(child)
                if child == "worldSave":
                    for key_child in self.tree.get_children(child):
                        self.update_text(key_child)
        self.update_parents()


class LibraryPortApp:
    def __init__(self, root):
        self.root = root
        root.title("Afterleaf Library Port")
        root.geometry("1400x850")

        self.scripts_dir = Path(__file__).resolve().parent.parent / "scripts"
        self.bun_path = self.find_bun()

        # Two-column layout: left = controls, right = output (full height)
        root.columnconfigure(0, weight=1)
        root.columnconfigure(1, weight=1)
        root.rowconfigure(0, weight=1)

        left = tk.Frame(root)
        left.grid(row=0, column=0, sticky="nsew")

        right = tk.Frame(root)
        right.grid(row=0, column=1, sticky="nsew")

        # --- Mode selection ---
        mode_frame = tk.Frame(left)
        mode_frame.pack(fill=tk.X, padx=10, pady=(10, 5))
        self.mode = tk.StringVar(value="export")
        tk.Radiobutton(
            mode_frame,
            text="Export",
            variable=self.mode,
            value="export",
            command=self.update_labels,
        ).pack(side=tk.LEFT, padx=5)
        tk.Radiobutton(
            mode_frame,
            text="Import",
            variable=self.mode,
            value="import",
            command=self.update_labels,
        ).pack(side=tk.LEFT, padx=5)

        # --- Paths ---
        # These two fields never swap position or label: "Afterleaf install"
        # is always the top field, "Package folder" is always the bottom
        # field. Only the direction arrow between them changes with the
        # mode, so what's on screen never has to be re-read from scratch
        # when switching Export/Import.
        path_frame = tk.Frame(left)
        path_frame.pack(fill=tk.X, padx=10, pady=5)
        path_frame.columnconfigure(1, weight=1)

        self.install_dot = tk.Label(path_frame, text="\u25cf", fg=INSTALL_COLOR)
        self.install_dot.grid(row=0, column=0, sticky=tk.W)
        tk.Label(path_frame, text="Afterleaf install:").grid(
            row=0, column=1, sticky=tk.W, padx=(2, 0)
        )
        self.install_entry = tk.Entry(path_frame)
        self.install_entry.grid(
            row=1, column=0, columnspan=2, sticky=tk.EW, padx=(18, 5), pady=(0, 3)
        )
        tk.Button(path_frame, text="Browse...", command=self.browse_install).grid(
            row=1, column=2, pady=(0, 3)
        )

        self.direction_label = tk.Label(
            path_frame, text="", font=("TkDefaultFont", 10, "bold"), fg="#555555"
        )
        self.direction_label.grid(
            row=2, column=0, columnspan=3, sticky=tk.W, padx=18, pady=2
        )

        self.package_dot = tk.Label(path_frame, text="\u25cf", fg=PACKAGE_COLOR)
        self.package_dot.grid(row=3, column=0, sticky=tk.W)
        tk.Label(path_frame, text="Package folder:").grid(
            row=3, column=1, sticky=tk.W, padx=(2, 0)
        )
        self.package_entry = tk.Entry(path_frame)
        self.package_entry.grid(
            row=4, column=0, columnspan=2, sticky=tk.EW, padx=(18, 5), pady=(0, 3)
        )
        tk.Button(path_frame, text="Browse...", command=self.browse_package).grid(
            row=4, column=2, pady=(0, 3)
        )

        # --- Bun executable ---
        bun_frame = tk.Frame(left)
        bun_frame.pack(fill=tk.X, padx=10, pady=5)
        tk.Label(bun_frame, text="bun executable:").pack(side=tk.LEFT)
        self.bun_entry = tk.Entry(bun_frame)
        self.bun_entry.insert(0, self.bun_path or "")
        self.bun_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        tk.Button(bun_frame, text="Browse...", command=self.browse_bun).pack(
            side=tk.LEFT
        )

        # --- Sections tree ---
        tree_frame = tk.LabelFrame(left, text="Sections")
        tree_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        self.section_tree = SectionTree(tree_frame)

        tree_buttons = tk.Frame(tree_frame)
        tree_buttons.pack(fill=tk.X, padx=5, pady=2)
        tk.Button(
            tree_buttons, text="Select all", command=self.section_tree.select_all
        ).pack(side=tk.LEFT, padx=5)
        tk.Button(
            tree_buttons, text="Select none", command=self.section_tree.select_none
        ).pack(side=tk.LEFT, padx=5)
        tk.Button(
            tree_buttons,
            text="Load world-save keys",
            command=self.load_world_save_keys,
        ).pack(side=tk.LEFT, padx=5)

        # --- Run ---
        self.run_button = tk.Button(left, text="Run", command=self.on_run, width=14)
        self.run_button.pack(pady=10)

        # --- Output log (right column, full height) ---
        log_frame = tk.LabelFrame(right, text="Output")
        log_frame.pack(fill=tk.BOTH, expand=True, padx=(0, 10), pady=10)
        self.output = scrolledtext.ScrolledText(
            log_frame, state=tk.DISABLED, wrap=tk.WORD
        )
        self.output.pack(fill=tk.BOTH, expand=True)

        self.update_labels()

    def find_bun(self):
        return shutil.which("bun") or ""

    def update_labels(self):
        if self.mode.get() == "export":
            self.direction_label.config(text="\u25bc  export (install \u2192 package)")
        else:
            self.direction_label.config(text="\u25b2  import (package \u2192 install)")

    def browse_install(self):
        path = filedialog.askdirectory()
        if path:
            self.install_entry.delete(0, tk.END)
            self.install_entry.insert(0, path)

    def browse_package(self):
        path = filedialog.askdirectory()
        if path:
            self.package_entry.delete(0, tk.END)
            self.package_entry.insert(0, path)

    def browse_bun(self):
        path = filedialog.askopenfilename(
            title="Select bun executable",
            filetypes=[("Executable", "bun.exe bun"), ("All files", "*.*")],
        )
        if path:
            self.bun_entry.delete(0, tk.END)
            self.bun_entry.insert(0, path)

    def load_world_save_keys(self):
        install = self.install_entry.get().strip()
        package = self.package_entry.get().strip()
        if self.mode.get() == "export":
            if not install:
                messagebox.showerror("Error", "Set the Afterleaf install path first.")
                return
            world_save_path = Path(install) / "content" / "world-save.json"
        else:
            if not package:
                messagebox.showerror("Error", "Set the package folder path first.")
                return
            world_save_path = Path(package) / "world-save.json"
        try:
            data = json.loads(world_save_path.read_text(encoding="utf-8"))
        except Exception as error:
            messagebox.showerror("Error", f"Could not read world-save.json:\n{error}")
            return
        keys = sorted(data.keys()) if isinstance(data, dict) else []
        self.section_tree.load_world_keys(keys)
        self.log(f"Loaded {len(keys)} world-save keys from {world_save_path}\n")

    def log(self, message):
        self.output.configure(state=tk.NORMAL)
        self.output.insert(tk.END, message)
        self.output.see(tk.END)
        self.output.configure(state=tk.DISABLED)

    def on_run(self):
        bun = self.bun_entry.get().strip()
        if not bun or not Path(bun).exists():
            messagebox.showerror("Error", "bun executable not found. Please set its path.")
            return

        sections = self.section_tree.get_selected_sections()
        if not sections:
            messagebox.showerror("Error", "Select at least one section.")
            return

        world_keys = self.section_tree.get_world_save_keys()
        if "worldSave" in sections and world_keys is not None and len(world_keys) == 0:
            messagebox.showerror(
                "Error",
                "World save is selected but no keys are checked. "
                "Either uncheck World save or select at least one key.",
            )
            return

        install = self.install_entry.get().strip()
        package = self.package_entry.get().strip()
        if not install or not package:
            messagebox.showerror("Error", "Please fill both path fields.")
            return

        # The working directory is always the Afterleaf install (that's
        # what installDir=process.cwd() resolves against in cli.ts), and
        # the positional argument is always the package folder - true for
        # both export and import.
        mode = self.mode.get()
        cwd = install
        args = [package]
        if mode == "export":
            script = self.scripts_dir / "library-export.ts"
        else:
            script = self.scripts_dir / "library-import.ts"

        args.extend(["--only", ",".join(sections), "--yes"])
        if world_keys is not None and len(world_keys) > 0:
            args.extend(["--world-save-keys", ",".join(world_keys)])

        self.run_button.config(state=tk.DISABLED)
        self.log(f"Running: bun {script} {' '.join(args)}\n")
        self.log(f"Working directory: {cwd}\n")

        thread = threading.Thread(
            target=self.run_subprocess,
            args=(bun, str(script), args, cwd),
            daemon=True,
        )
        thread.start()

    def run_subprocess(self, bun, script, args, cwd):
        try:
            process = subprocess.Popen(
                [bun, script, *args],
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            for line in process.stdout:
                self.root.after(0, self.log, line)
            process.stdout.close()
            return_code = process.wait()
            self.root.after(
                0,
                self.log,
                f"\nFinished with exit code {return_code}.\n",
            )
        except Exception as error:
            self.root.after(0, self.log, f"\nError: {error}\n")
        finally:
            self.root.after(0, lambda: self.run_button.config(state=tk.NORMAL))


def main():
    root = tk.Tk()
    LibraryPortApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
