import type { AnalysisOptions, RankingPolicy } from "./analyzer.js";

export const CONFIG_FILE = "blastradius.config.json";

export type BlastRadiusConfig = {
  sensitiveTerms?: string[];
  hopLimit?: number;
  ignore?: string[];
  format?: "markdown" | "json" | "sarif";
  failOn?: "never" | "unknowns" | "watchlist";
  rankingPolicy?: RankingPolicy;
};

function stringList(value: unknown, key: string) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${key} must be an array of non-empty strings.`);
  }
  return [...new Set(value.map((item) => item.trim()))];
}

export function parseBlastRadiusConfig(source: string): BlastRadiusConfig {
  const value = JSON.parse(source) as unknown;
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${CONFIG_FILE} must contain a JSON object.`);
  }
  const raw = value as Record<string, unknown>;
  const allowed = new Set(["sensitiveTerms", "hopLimit", "ignore", "format", "failOn", "rankingPolicy"]);
  const unknown = Object.keys(raw).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Unknown ${CONFIG_FILE} field: ${unknown[0]}`);

  if (raw.hopLimit !== undefined && (!Number.isInteger(raw.hopLimit) || Number(raw.hopLimit) < 1 || Number(raw.hopLimit) > 10)) {
    throw new Error("hopLimit must be an integer from 1 through 10.");
  }
  const formats = new Set(["markdown", "json", "sarif"]);
  if (raw.format !== undefined && !formats.has(String(raw.format))) {
    throw new Error("format must be markdown, json, or sarif.");
  }
  const failureModes = new Set(["never", "unknowns", "watchlist"]);
  if (raw.failOn !== undefined && !failureModes.has(String(raw.failOn))) {
    throw new Error("failOn must be never, unknowns, or watchlist.");
  }
  const rankingPolicies = new Set(["rank-v1", "rank-v2", "no-buckets", "buckets-only", "churn-only"]);
  if (raw.rankingPolicy !== undefined && !rankingPolicies.has(String(raw.rankingPolicy))) {
    throw new Error("rankingPolicy is not supported.");
  }

  return {
    sensitiveTerms: stringList(raw.sensitiveTerms, "sensitiveTerms"),
    hopLimit: raw.hopLimit as number | undefined,
    ignore: stringList(raw.ignore, "ignore"),
    format: raw.format as BlastRadiusConfig["format"],
    failOn: raw.failOn as BlastRadiusConfig["failOn"],
    rankingPolicy: raw.rankingPolicy as RankingPolicy | undefined,
  };
}

export function mergeAnalysisOptions(
  options: AnalysisOptions,
  config: BlastRadiusConfig,
): AnalysisOptions {
  return {
    ...options,
    hopLimit: config.hopLimit ?? options.hopLimit,
    rankingPolicy: config.rankingPolicy ?? options.rankingPolicy,
    sensitiveTerms: config.sensitiveTerms ?? options.sensitiveTerms,
  };
}
