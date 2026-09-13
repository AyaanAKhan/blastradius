import {
  analyzeChange,
  summarizeForLocalModel,
  type AnalysisResult,
  type RepositoryFile,
} from "@/lib/analyzer";

export const dynamic = "force-dynamic";

type AnalyzeBody = {
  diff?: unknown;
  files?: unknown;
};

function validFiles(value: unknown): value is RepositoryFile[] {
  return (
    Array.isArray(value) &&
    value.length <= 600 &&
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
        typeof file.isSurface === "boolean",
    )
  );
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

  const result = analyzeChange(body.diff, files);
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
