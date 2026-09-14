import type { NarrationSummary } from "@/lib/analyzer";
import { BodyTooLargeError, readBoundedJson } from "@/lib/request-body";

export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 100_000;

type NarrateBody = {
  summary?: unknown;
};

function validSummary(value: unknown): value is NarrationSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const summary = value as Record<string, unknown>;
  return (
    summary.policyVersion === "rank-v1" &&
    Array.isArray(summary.changedFiles) &&
    summary.changedFiles.length <= 200 &&
    summary.changedFiles.every((path) => typeof path === "string" && path.length <= 400) &&
    Array.isArray(summary.impactedFiles) &&
    summary.impactedFiles.length <= 24 &&
    Array.isArray(summary.reviewOrder) &&
    summary.reviewOrder.length <= 5 &&
    Array.isArray(summary.factors) &&
    summary.factors.length <= 12 &&
    Array.isArray(summary.unknowns) &&
    summary.unknowns.length <= 20
  );
}

export async function POST(request: Request) {
  let body: NarrateBody;
  try {
    body = await readBoundedJson<NarrateBody>(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return Response.json({ error: "The narration request is too large." }, { status: 413 });
    }
    return Response.json({ error: "The request must be valid JSON." }, { status: 400 });
  }
  if (!validSummary(body.summary)) {
    return Response.json({ error: "Provide a valid evidence summary." }, { status: 400 });
  }

  const baseUrl = process.env.OLLAMA_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    return Response.json({ error: "A local model is not configured for this server." }, { status: 503 });
  }

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(4_500),
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL ?? "qwen2.5:3b",
        stream: false,
        options: { temperature: 0.1 },
        messages: [
          {
            role: "system",
            content:
              "Write at most 70 words for a cautious code reviewer. Identify the best review target using only supplied evidence. Mention uncertainty and never claim a bug was found.",
          },
          { role: "user", content: JSON.stringify(body.summary) },
        ],
      }),
    });
    if (!response.ok) {
      return Response.json({ error: "The local model did not return a result." }, { status: 502 });
    }
    const payload = (await response.json()) as { message?: { content?: string } };
    const brief = payload.message?.content?.trim().slice(0, 900);
    if (!brief) return Response.json({ error: "The local model returned an empty result." }, { status: 502 });
    return Response.json({ brief }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "The local model is unavailable." }, { status: 502 });
  }
}
