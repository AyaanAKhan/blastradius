import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const environment = {
  ...process.env,
  PAGES_BUILD: "1",
  NEXT_PUBLIC_SITE_URL: "https://ayaanakhan.github.io",
  NEXT_PUBLIC_BASE_PATH: "/blastradius",
};
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const buildCommand = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : npmCommand;
const buildArguments = process.platform === "win32"
  ? ["/d", "/s", "/c", "npm run build"]
  : ["run", "build"];
const build = spawnSync(buildCommand, buildArguments, {
  cwd: projectRoot,
  env: environment,
  stdio: "inherit",
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

const output = path.join(projectRoot, "out");
let removedMaps = 0;
let largestScript = 0;
const visit = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      visit(file);
    } else if (entry.name.endsWith(".map")) {
      fs.unlinkSync(file);
      removedMaps += 1;
    } else if (entry.name.endsWith(".js")) {
      largestScript = Math.max(largestScript, fs.statSync(file).size);
    }
  }
};
visit(output);
fs.writeFileSync(path.join(output, ".nojekyll"), "", "utf8");
if (largestScript > 250_000) {
  throw new Error(`Largest production script is ${largestScript} bytes, above the 250 KB budget.`);
}
process.stdout.write(`Pages build ready. Removed ${removedMaps} map file(s); largest script: ${largestScript} bytes.\n`);
const audit = spawnSync(process.execPath, [path.join(projectRoot, "scripts", "audit-site.mjs")], {
  cwd: projectRoot,
  stdio: "inherit",
});
if (audit.status !== 0) process.exit(audit.status ?? 1);
