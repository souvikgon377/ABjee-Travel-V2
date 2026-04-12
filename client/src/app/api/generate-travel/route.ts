import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";

type TravelType = "itinerary" | "places" | "restaurants" | "hotels";

interface TravelRequestBody {
  place?: string;
  country?: string;
  interest?: string;
  type?: TravelType;
  duration?: string;
  budget?: string;
  travelStyle?: string;
  travelers?: string;
}

const typeLabels: Record<TravelType, string> = {
  itinerary: "Travel Itinerary",
  places: "Top Places to Visit",
  restaurants: "Top Restaurants",
  hotels: "Top Hotels & Resorts",
};

const typeInstructions: Record<TravelType, string> = {
  itinerary: [
    "Return keys: overview, duration, budgetEstimate, travelTips, routeFlow, routePoints, days, localInsights.",
    "days must be an array of { day, title, activities }.",
    "routePoints must be an array of { name, lat, lng } with practical coordinates when possible.",
  ].join(" "),
  places: "Return keys: overview, results, localInsights. results must be an array of top attractions with description, category, and bestTimeToVisit.",
  restaurants: "Return keys: overview, results, localInsights. results must be an array of restaurants with cuisine, signatureDish, and priceRange.",
  hotels: "Return keys: overview, results, localInsights. results must include budget, mid-range, and luxury options with area and priceRange.",
};

function buildPrompt(payload: Required<Pick<TravelRequestBody, "place" | "country" | "type">> & Pick<TravelRequestBody, "interest">): string {
  const tripPreferences = [
    payload.interest ? `Interest: ${payload.interest}` : null,
  ].filter(Boolean);

  return [
    "Act as a professional travel planner.",
    "",
    `Destination: ${payload.place}`,
    `Country: ${payload.country}`,
    ...tripPreferences,
    "",
    `Generate: ${typeLabels[payload.type]}`,
    "",
    "Rules:",
    "- Keep response structured and clean",
    "- Make it suitable for UI display",
    "- Ensure realistic and helpful recommendations",
    "- Include local insights",
    "",
    "If itinerary:",
    "- Add day-wise plan",
    "- Add budget estimate",
    "- Add travel tips",
    "- Add route flow for map visualization",
    "- Include realistic restaurants and stay suggestions when possible",
    "",
    "Output requirements:",
    "- Return JSON only, no markdown or prose outside JSON.",
    `- ${typeInstructions[payload.type]}`,
  ].join("\n");
}

function extractJsonContent(rawText: string): string {
  const trimmed = rawText.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TravelRequestBody;
    const place = body.place?.trim();
    const country = body.country?.trim();
    const interest = body.interest?.trim() || "";
    const duration = body.duration?.trim() || "";
    const budget = body.budget?.trim() || "";
    const travelStyle = body.travelStyle?.trim() || "";
    const travelers = body.travelers?.trim() || "";
    const type = body.type;

    if (!place || !country) {
      return fail("place and country are required", 400);
    }

    if (!type || !(type in typeLabels)) {
      return fail("type must be one of: itinerary, places, restaurants, hotels", 400);
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      return fail("Gemini API key is missing. Set GEMINI_API_KEY.", 500);
    }

    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    const prompt = [
      buildPrompt({ place, country, interest, type }),
      duration ? `Preferred Duration: ${duration}` : "",
      budget ? `Preferred Budget: ${budget}` : "",
      travelStyle ? `Travel Style: ${travelStyle}` : "",
      travelers ? `Travelers: ${travelers}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.6,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      return fail(payload.error?.message || "Failed to generate travel content", 502);
    }

    const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || "";
    if (!content) {
      return fail("No content generated by AI", 502);
    }

    const jsonText = extractJsonContent(content);
    let structured: unknown = null;
    try {
      structured = JSON.parse(jsonText);
    } catch {
      structured = null;
    }

    return ok({
      content,
      structured,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return fail(message, 500);
  }
}
