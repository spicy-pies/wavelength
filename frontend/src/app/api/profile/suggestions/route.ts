import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY ?? "",
});

const MAX_SUGGESTIONS = 6;

/** Minimum query length before calling the model (avoids noisy single-char requests). */
const MIN_QUERY_LENGTH = 2;

/**
 * Defensively parse model output into a string array.
 * Ensures array, strings only, trim, no empty, dedupe, max 6.
 */
function parseSuggestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const strings = raw
    .map((s) => (typeof s === "string" ? String(s).trim() : ""))
    .filter(Boolean);
  return [...new Set(strings)].slice(0, MAX_SUGGESTIONS);
}

export async function POST(request: Request) {
  if (!process.env.GROQ_API_KEY) {
    console.warn("[API profile/suggestions] GROQ_API_KEY is not set; returning 503.");
    return NextResponse.json(
      { error: "Suggestions not configured", suggestions: [] },
      { status: 503 }
    );
  }

  let body: { query?: unknown; category?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", suggestions: [] }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  const category = typeof body.category === "string" ? body.category : "Interests";

  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "user",
          content: `Autocomplete the search query "${query}" in the category "${category}". Return exactly ${MAX_SUGGESTIONS} real, specific suggestions (artist names, show titles, game titles, etc.) that start with or closely match what the user typed. Be specific, not generic.
Return ONLY a JSON array of strings, no markdown, no explanation. Example: ["result1","result2","result3","result4","result5","result6"]`,
        },
      ],
      max_tokens: 120,
      temperature: 0.3,
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*?\]/);
      raw = match ? JSON.parse(match[0]) : [];
    }

    const suggestions = parseSuggestions(raw);
    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("[API profile/suggestions] Groq error:", err);
    return NextResponse.json(
      { error: "Suggestions temporarily unavailable", suggestions: [] },
      { status: 500 }
    );
  }
}
