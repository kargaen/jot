import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const versionArg = args.find((arg) => !arg.startsWith("--"));

function readText(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function writeText(path, value) {
  writeFileSync(resolve(root, path), value);
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function writeJson(path, value) {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeVersion(value) {
  const version = value?.trim().replace(/^v/i, "");
  if (!version || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Expected a semver version like 0.8.0, got "${value ?? ""}"`);
  }
  return version;
}

function replaceOrFail(text, pattern, replacement, file) {
  if (!pattern.test(text)) throw new Error(`Could not find version pattern in ${file}`);
  return text.replace(pattern, replacement);
}

const packageJson = readJson("package.json");
const version = normalizeVersion(versionArg ?? packageJson.version);
const mismatches = [];

function noteMismatch(file, current) {
  if (current !== version) mismatches.push(`${file}: ${current || "(missing)"} != ${version}`);
}

const tauriConf = readJson("src-tauri/tauri.conf.json");
noteMismatch("package.json", packageJson.version);
noteMismatch("src-tauri/tauri.conf.json", tauriConf.version);

const cargoToml = readText("src-tauri/Cargo.toml");
const cargoVersion = cargoToml.match(/^\s*version\s*=\s*"([^"]+)"/m)?.[1] ?? "";
noteMismatch("src-tauri/Cargo.toml", cargoVersion);

const docsIndex = readText("docs/index.html");
const docsVersion = docsIndex.match(/Windows 10\+ &middot; v([^<]+)/)?.[1] ?? "";
noteMismatch("docs/index.html", docsVersion);
if (!docsIndex.includes("https://github.com/kargaen/jot/releases/latest")) {
  mismatches.push("docs/index.html: download CTA should point to the latest release");
}

if (checkOnly) {
  if (mismatches.length > 0) {
    console.error("Version drift found:");
    for (const mismatch of mismatches) console.error(`- ${mismatch}`);
    process.exit(1);
  }
  console.log(`Version files are synced at ${version}.`);
  process.exit(0);
}

packageJson.version = version;
writeJson("package.json", packageJson);

const packageLock = readJson("package-lock.json");
packageLock.version = version;
if (packageLock.packages?.[""]) packageLock.packages[""].version = version;
writeJson("package-lock.json", packageLock);

tauriConf.version = version;
writeJson("src-tauri/tauri.conf.json", tauriConf);

writeText(
  "src-tauri/Cargo.toml",
  replaceOrFail(cargoToml, /^(\s*version\s*=\s*")[^"]+(")/m, `$1${version}$2`, "src-tauri/Cargo.toml"),
);

let nextDocs = replaceOrFail(
  docsIndex,
  /https:\/\/github\.com\/kargaen\/jot\/releases(?:\/latest)?/g,
  "https://github.com/kargaen/jot/releases/latest",
  "docs/index.html",
);
nextDocs = replaceOrFail(
  nextDocs,
  /Windows 10\+ &middot; v[^<]+/,
  `Windows 10+ &middot; v${version}`,
  "docs/index.html",
);
writeText("docs/index.html", nextDocs);

console.log(`Synced Jot version to ${version}.`);
