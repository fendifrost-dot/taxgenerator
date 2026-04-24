/**
 * anthropic-proxy
 *
 * Server-side proxy to Anthropic's Messages API.
 *
 * Why it exists:
 *   The browser bundle previously called api.anthropic.com directly using a
 *   VITE_ANTHROPIC_API_KEY baked into the build. That approach requires
 *   `anthropic-dangerous-direct-browser-access: true` and, more importantly,
 *   exposes the API key to every visitor of the site. This edge function
 *   keeps the key server-side and only forwards authenticated requests.
 *
 * Request (POST):
 *   {
 *     "model":       "claude-opus-4-6",
 *     "max_tokens":  8192,
 *     "system":      "optional system prompt",
 *     "messages":    [{ role: "user", content: "..." }]
 *   }
 *
 * The `messages` value may be a plain string or an array of content blocks
 * (text / image / document) - the proxy passes the body through verbatim.
 *
 * Response:
 *   Forwarded response body from api.anthropic.com. On success this is the
 *   standard Anthropic messages response, e.g.
 *     { id, type: "message", content: [{ type: "text", text: "..." }], ... }
 *
 * Auth:
 *   Requires a valid Supabase user session (JWT in the Authorization header).
 *   Anonymous callers are rejected with 401 so the proxy cannot be used as a
 *   free Anthropic gateway.
 *
 * Environment:
 *   ANTHROPIC_API_KEY  - required server-side secret (NOT VITE_-prefixed)
 *   SUPABASE_URL       - injected automatically by Supabase
 *   SUPABASE_ANON_KEY  - injected automatically by Supabase
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

interface MessagesRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: unknown;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  metadata?: Record<string, unknown>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // --- Auth ---------------------------------------------------------------
  // The function relies on Supabase's built-in verify_jwt gate to validate
  // the Authorization header before this handler runs. We additionally
  // require the header be present so that callers without any Supabase
  // credentials at all get an obvious 401 rather than a confusing 500.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  // --- Server-side API key ------------------------------------------------
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!anthropicKey) {
    return jsonResponse(
      {
        error:
          "ANTHROPIC_API_KEY is not configured on the server. " +
          "Set it under Supabase project secrets for this function.",
      },
      500,
    );
  }

  // --- Parse + validate request -------------------------------------------
  let body: MessagesRequest;
  try {
    body = (await req.json()) as MessagesRequest;
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON" }, 400);
  }

  if (!body.model || typeof body.model !== "string") {
    return jsonResponse({ error: "model is required" }, 400);
  }
  if (!body.max_tokens || typeof body.max_tokens !== "number") {
    return jsonResponse({ error: "max_tokens is required" }, 400);
  }
  if (!body.messages) {
    return jsonResponse({ error: "messages is required" }, 400);
  }

  // Cap max_tokens defensively so a client bug can't drain the key.
  const MAX_ALLOWED = 16384;
  const maxTokens = Math.min(body.max_tokens, MAX_ALLOWED);

  // --- Forward to Anthropic -----------------------------------------------
  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: body.model,
      max_tokens: maxTokens,
      system: body.system,
      messages: body.messages,
      temperature: body.temperature,
      top_p: body.top_p,
      top_k: body.top_k,
      stop_sequences: body.stop_sequences,
      metadata: body.metadata,
    }),
  });

  const upstreamBody = await upstream.text();
  return new Response(upstreamBody, {
    status: upstream.status,
    headers: {
      ...corsHeaders,
      "Content-Type":
        upstream.headers.get("Content-Type") ?? "application/json",
    },
  });
});
