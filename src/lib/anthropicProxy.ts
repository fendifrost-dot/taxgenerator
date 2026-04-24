/**
 * anthropicProxy.ts
 *
 * Client-side helper for invoking the `anthropic-proxy` Supabase edge
 * function. Replaces every previous direct-from-browser call to
 * api.anthropic.com, which required a VITE_ANTHROPIC_API_KEY baked into the
 * bundle and was publicly readable.
 *
 * All callers should use `callClaudeMessages` instead of fetch'ing Anthropic
 * directly. The shape of the request/response mirrors the Anthropic Messages
 * API so existing prompt-construction code continues to work unchanged.
 */

import { supabase } from '@/integrations/supabase/client';

/**
 * Centralized Claude model identifier. Update here to change the model used
 * by every caller (businessEntityBuilder, taxOptimizer, documentParser,
 * priorYearBuilder, etc.).
 */
export const CLAUDE_MODEL = 'claude-opus-4-6';

export interface ClaudeContentBlock {
  type: string;
  text?: string;
  source?: unknown;
}

export interface ClaudeMessageResponse {
  id?: string;
  type?: string;
  role?: string;
  model?: string;
  content: ClaudeContentBlock[];
  stop_reason?: string;
  stop_sequence?: string | null;
  usage?: { input_tokens: number; output_tokens: number };
  error?: { type?: string; message?: string };
}

export interface ClaudeMessagesRequest {
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

export class AnthropicProxyError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AnthropicProxyError';
    this.status = status;
  }
}

/**
 * Invoke the `anthropic-proxy` edge function with a Messages API-shaped
 * request. The edge function attaches the server-side ANTHROPIC_API_KEY and
 * forwards to api.anthropic.com, so callers never need to pass a key.
 *
 * Throws AnthropicProxyError when the proxy or upstream API returns a non-OK
 * response. On success, returns the raw Messages response body.
 */
export async function callClaudeMessages(
  request: ClaudeMessagesRequest,
): Promise<ClaudeMessageResponse> {
  const { data, error } = await supabase.functions.invoke<ClaudeMessageResponse>(
    'anthropic-proxy',
    {
      body: request,
    },
  );

  if (error) {
    // supabase-js wraps non-2xx responses in FunctionsHttpError; the status
    // is on error.context?.status when present. Fall back to 500 otherwise.
    const status =
      (error as { context?: { status?: number } }).context?.status ?? 500;
    throw new AnthropicProxyError(error.message, status);
  }

  if (!data) {
    throw new AnthropicProxyError('Empty response from anthropic-proxy', 500);
  }

  if (data.error) {
    throw new AnthropicProxyError(
      data.error.message ?? 'Anthropic API error',
      500,
    );
  }

  return data;
}

/**
 * Convenience helper: pulls the first text block out of a Messages response.
 * Returns an empty string when the response contains no text content.
 */
export function extractText(response: ClaudeMessageResponse): string {
  return response.content?.find((b) => b.type === 'text')?.text ?? '';
}
