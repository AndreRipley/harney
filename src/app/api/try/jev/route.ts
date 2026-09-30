import { type NextRequest } from "next/server";
import { JEV_ENDPOINT } from "@/lib/harness/jev";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: { apiKey?: string; model?: string; state?: unknown; questions?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "That request could not be read." }, { status: 400 });
  }
  if (!body.apiKey?.trim()) {
    return Response.json({ error: "Add a TypeSafe API key to run this Jev decision." }, { status: 400 });
  }
  try {
    const response = await fetch(JEV_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${body.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: body.model || "jev-latest", state: body.state ?? "", questions: body.questions }),
      signal: AbortSignal.timeout(8000),
    });
    const raw = await response.text();
    if (!response.ok) {
      return Response.json({ error: `Jev returned ${response.status}.` }, { status: 502 });
    }
    return new Response(raw, { headers: { "content-type": "application/json" } });
  } catch {
    return Response.json({ error: "Jev could not be reached." }, { status: 502 });
  }
}
