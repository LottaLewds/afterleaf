import readline from "node:readline";

export interface ChecklistItem {
  id: string;
  label: string;
  description?: string;
}

export const runChecklist = async (
  title: string,
  items: ChecklistItem[],
): Promise<Set<string>> => {
  const selected = new Set<string>(items.map((item) => item.id));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const render = () => {
    console.log(`\n${title}`);
    console.log(
      'Numbers comma-separated toggle items (e.g. "2,5"), "a" = all, "n" = none, Enter = confirm.',
    );
    items.forEach((item, index) => {
      const mark = selected.has(item.id) ? "[x]" : "[ ]";
      const desc = item.description ? ` — ${item.description}` : "";
      console.log(`  ${index + 1}. ${mark} ${item.label}${desc}`);
    });
  };

  return new Promise((resolve) => {
    const ask = () => {
      render();
      rl.question("\n> ", (answer) => {
        const trimmed = answer.trim().toLowerCase();
        if (trimmed === "") {
          rl.close();
          resolve(new Set(selected));
          return;
        }
        if (trimmed === "a") {
          items.forEach((item) => selected.add(item.id));
          ask();
          return;
        }
        if (trimmed === "n") {
          selected.clear();
          ask();
          return;
        }
        const indices = trimmed
          .split(",")
          .map((part) => Number.parseInt(part.trim(), 10))
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= items.length);
        for (const index of indices) {
          const id = items[index - 1]?.id;
          if (!id) continue;
          if (selected.has(id)) selected.delete(id);
          else selected.add(id);
        }
        ask();
      });
    };
    ask();
  });
};

export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
};
