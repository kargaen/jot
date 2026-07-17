import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const DEFAULT_ROOT = "src/views";
const SERVICE_IMPORT_PATTERN = /from\s+["'][^"']*services\//;

function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) return tsFilesUnder(path);
      return /\.(ts|tsx)$/.test(path) ? [path] : [];
    })
    .sort();
}

export function findViewServiceImportViolations(root = DEFAULT_ROOT): string[] {
  return tsFilesUnder(root).filter((path) => SERVICE_IMPORT_PATTERN.test(readFileSync(path, "utf8")));
}

export function formatViewServiceImportViolations(violations: string[]): string {
  return violations.map((path) => `- ${relative(process.cwd(), path)}`).join("\n");
}

const isCli = process.argv[1]?.endsWith("check-view-service-imports.ts") ?? false;

if (isCli) {
  const violations = findViewServiceImportViolations();
  if (violations.length > 0) {
    console.error(`View files must not import services directly:\n${formatViewServiceImportViolations(violations)}`);
    process.exit(1);
  }
  console.log("View/service import boundary passed: 0 violations");
}
