import { execFileSync } from "node:child_process";
import fs from "node:fs";

const projectRoot = new URL("../", import.meta.url);
const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  cwd: projectRoot,
  encoding: "utf8",
}).split("\0").filter(Boolean);
const prohibited = ["chat" + "gpt", "open" + "ai", "co" + "dex"];
const failures = [];

for (const relative of tracked) {
  const file = new URL(relative.replaceAll("\\", "/"), projectRoot);
  const content = fs.readFileSync(file);
  if (content.includes(0)) continue;
  const text = content.toString("utf8").toLowerCase();
  for (const term of prohibited) {
    if (text.includes(term)) failures.push(`${relative}: prohibited product reference`);
  }
  if (text.includes(String.fromCodePoint(0x2014))) failures.push(`${relative}: em dash`);
}

if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`Source hygiene passed for ${tracked.length} files.\n`);
