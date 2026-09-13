import {
  analyzeChange,
  summarizeForLocalModel,
  type AnalysisOptions,
  type AnalysisResult,
  type RepositoryFile,
} from "@/lib/analyzer";

export const dynamic = "force-dynamic";

type AnalyzeBody = {
  diff?: unknown;
  files?: unknown;
  options?: unknown;
};

function validFiles(value: unknown): value is RepositoryFile[] {
  return (
    Array.isArray(value) &&
    value.length <= 5_000 &&
    value.every(
      (file) =>
        file &&
        typeof file === "object" &&
        typeof file.path === "string" &&
        file.path.length <= 400 &&
        Array.isArray(file.imports) &&
        file.imports.length <= 80 &&
        file.imports.every((entry: unknown) => typeof entry === "string" && entry.length <= 300) &&
        typeof file.isTest === "boolean" &&
        typeof file.isSurface === "boolean" &&
        (file.hasDynamicImport === undefined || typeof file.hasDynamicImport === "boolean"),
    )
  );
}

function validOptions(value: unknown): value is AnalysisOptions {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const options = value as Record<string, unknown>;
  if (options.baseUrl !== undefined && (typeof options.baseUrl !== "string" || options.baseUrl.length > 300)) {
    return false;
  }
  if (options.aliases !== undefined) {
    if (!options.aliases || typeof options.aliases !== "object" || Array.isArray(options.aliases)) return false;
    const aliases = Object.entries(options.aliases);
    if (
      aliases.length > 100 ||
      aliases.some(([prefix, target]) => prefix.length > 200 || typeof target !== "string" || target.length > 300)
    ) {
      return false;
    }
  }
  if (
    options.externalPackages !== undefined &&
    (!Array.isArray(options.externalPackages) ||
      options.externalPackages.length > 2_000 ||
      options.externalPackages.some((name) => typeof name !== "string" || name.length > 214))
  ) {
    return false;
  }
  return true;
}

async function localModelBrief(result: AnalysisResult) {
  const runtime = typeof process === "undefined" ? undefined : process.env;
  const baseUrl = runtime?.OLLAMA_URL?.replace(/\/$/, "");
  if (!baseUrl) return undefined;

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(4500),
    body: JSON.stringify({
      model: runtime?.OLLAMA_MODEL ?? "qwen2.5:3b",
      stream: false,
      options: { temperature: 0.1 },
      messages: [
        {
          role: "system",
          content:
            "You are a cautious code-review planner. In at most 70 words, identify the best review target and why. Use only the supplied evidence, mention uncertainty, and never claim a bug was found.",
        },
        {
          role: "user",
          content: JSON.stringify(summarizeForLocalModel(result)),
        },
      ],
    }),
  });
  if (!response.ok) return undefined;
  const payload = (await response.json()) as { message?: { content?: string } };
  return payload.message?.content?.trim().slice(0, 900);
}

export async function POST(request: Request) {
  let body: AnalyzeBody;
  try {
    body = (await request.json()) as AnalyzeBody;
  } catch {
    return Response.json({ error: "The request must be valid JSON." }, { status: 400 });
  }

  if (typeof body.diff !== "string" || body.diff.length === 0 || body.diff.length > 500_000) {
    return Response.json(
      { error: "Provide a unified diff between 1 and 500,000 characters." },
      { status: 400 },
    );
  }
  const files = body.files ?? [];
  if (!validFiles(files)) {
    return Response.json({ error: "The repository map is invalid or too large." }, { status: 400 });
  }
  if (!validOptions(body.options)) {
    return Response.json({ error: "The repository configuration is invalid or too large." }, { status: 400 });
  }

  const result = analyzeChange(body.diff, files, body.options);
  try {
    const brief = await localModelBrief(result);
    if (brief) {
      result.brief = brief;
      result.narrativeSource = "local-model";
    }
  } catch {
    // The evidence engine remains the reliable fallback when a local model is unavailable.
  }
  return Response.json(result, {
    headers: { "cache-control": "no-store" },
  });
}
