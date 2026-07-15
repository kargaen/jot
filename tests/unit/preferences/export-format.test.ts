// Pins EPIC-014 item 9: the global export-format preference (JSON default, remembered).
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
(globalThis as unknown as { localStorage: Storage }).localStorage =
  new MemoryStorage() as unknown as Storage;

import { loadExportFormat, saveExportFormat } from "../../../src/utils/preferences/exportFormat";

let failures = 0;
function assertEqual<T>(label: string, actual: T, expected: T) {
  if (actual !== expected) { failures++; console.error(`  \x1b[31m✗ ${label}: expected ${expected}, got ${actual}\x1b[0m`); }
}

localStorage.clear();
assertEqual("default is json", loadExportFormat(), "json");

saveExportFormat("markdown");
assertEqual("markdown persists", loadExportFormat(), "markdown");

saveExportFormat("json");
assertEqual("switch back to json", loadExportFormat(), "json");

// A garbage value falls back to the default.
localStorage.setItem("jot_export_format", "yaml");
assertEqual("unknown value falls back to json", loadExportFormat(), "json");

if (failures > 0) { console.error(`\nExport format preference tests: ${failures} failed`); process.exit(1); }
console.log("Export format preference tests passed");
