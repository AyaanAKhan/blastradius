import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const output = path.join(projectRoot, "out");
const basePath = "/blastradius";
const htmlFiles = [
  "index.html",
  "analyze/index.html",
  "method/index.html",
  "sources/index.html",
  "404.html",
];
const requiredFiles = [
  ...htmlFiles,
  "robots.txt",
  "sitemap.xml",
  "llms.txt",
  "favicon.svg",
  "og.png",
  "readme-graph.png",
  ".nojekyll",
];
const failures = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(output, file))) failures.push(`Missing exported file: ${file}`);
}

function routeTarget(href) {
  const withoutHash = href.split("#", 1)[0].split("?", 1)[0];
  if (!withoutHash || withoutHash === basePath || withoutHash === `${basePath}/`) return "index.html";
  if (!withoutHash.startsWith(`${basePath}/`)) return undefined;
  const route = withoutHash.slice(basePath.length + 1).replace(/\/$/, "");
  if (!route) return "index.html";
  return route.includes(".") ? route : `${route}/index.html`;
}

for (const file of htmlFiles) {
  const absolute = path.join(output, file);
  if (!fs.existsSync(absolute)) continue;
  const html = fs.readFileSync(absolute, "utf8");
  const h1Count = (html.match(/<h1(?:\s|>)/g) ?? []).length;
  if (h1Count !== 1) failures.push(`${file}: expected one h1, found ${h1Count}`);
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";
  if (!title) failures.push(`${file}: missing title`);
  if (/\b(vite|react)\b/i.test(title)) failures.push(`${file}: framework name leaked into title`);
  if (!/<meta name="description" content="[^"]+"/.test(html)) failures.push(`${file}: missing meta description`);
  if (!/<link rel="canonical" href="https:\/\/ayaanakhan\.github\.io\/blastradius\//.test(html)) {
    failures.push(`${file}: missing deployment canonical`);
  }
  if (!/<meta property="og:image" content="https:\/\/ayaanakhan\.github\.io\/blastradius\/og\.png"/.test(html)) {
    failures.push(`${file}: missing social image`);
  }
  for (const tag of html.match(/<img\b[^>]*>/g) ?? []) {
    if (!/\salt="[^"]*"/.test(tag)) failures.push(`${file}: image without alt text`);
  }
  for (const match of html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) {
    const href = match[1];
    if (/^(https?:|mailto:|tel:)/.test(href)) continue;
    const target = routeTarget(href);
    if (target && !fs.existsSync(path.join(output, target))) {
      failures.push(`${file}: broken internal link ${href}`);
    }
  }
}

const generatedFiles = [];
const visit = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file);
    else generatedFiles.push(file);
  }
};
visit(output);
if (generatedFiles.some((file) => file.endsWith(".map"))) failures.push("Production source map found");
const largestScript = generatedFiles
  .filter((file) => file.endsWith(".js"))
  .reduce((largest, file) => Math.max(largest, fs.statSync(file).size), 0);
if (largestScript > 250_000) failures.push(`Largest script exceeds 250 KB: ${largestScript} bytes`);

const searchable = generatedFiles
  .filter((file) => !/\.(png|woff2?|ico)$/i.test(file))
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");
const prohibited = ["chat" + "gpt", "open" + "ai", "co" + "dex"];
for (const term of prohibited) {
  if (searchable.toLowerCase().includes(term)) failures.push(`Prohibited product reference found: ${term}`);
}

if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`Static audit passed: ${htmlFiles.length} pages, one h1 each, links resolved, largest script ${largestScript} bytes.\n`);
