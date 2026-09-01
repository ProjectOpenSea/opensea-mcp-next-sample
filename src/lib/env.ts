/**
 * Server-only environment access.
 *
 * The route handler needs two provider credentials. Reading them through this
 * module instead of touching `process.env` inline gives us one place that
 * (a) fails loudly at request time when a credential is missing, and
 * (b) never lets the credential value reach a client response or a log line.
 *
 * `MissingEnvError` deliberately carries only the variable *name*. Anything
 * that formats this error for a caller therefore cannot leak a secret.
 */

export class MissingEnvError extends Error {
  constructor(public readonly variable: string) {
    super(`Missing required environment variable: ${variable}`);
    this.name = "MissingEnvError";
  }
}

function requireEnv(variable: string): string {
  const value = process.env[variable];
  if (typeof value !== "string" || value.trim() === "") {
    throw new MissingEnvError(variable);
  }
  return value;
}

/** Bearer token for `https://mcp.opensea.io/sse`. */
export function openSeaBearerToken(): string {
  return requireEnv("OPENSEA_BEARER_TOKEN");
}

/**
 * Assert the OpenAI credential is present before we open the MCP connection.
 *
 * `@ai-sdk/openai` reads `OPENAI_API_KEY` from the environment itself, so we do
 * not pass the value anywhere. We only check it, so a misconfigured deployment
 * fails with a clear reason instead of an opaque provider error mid-stream.
 */
export function assertOpenAiCredential(): void {
  requireEnv("OPENAI_API_KEY");
}

/**
 * Optional shared secret that gates `POST /api/chat`.
 *
 * This sample proxies a paid model and a paid MCP token. Left unset the route
 * is open to anyone who can reach the deployment, which is fine on localhost
 * and is not fine on a public URL. Set `CHAT_ACCESS_TOKEN` and callers must
 * send `Authorization: Bearer <token>`.
 */
export function chatAccessToken(): string | undefined {
  const value = process.env.CHAT_ACCESS_TOKEN;
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * Whether an unauthenticated deployment is explicitly allowed.
 *
 * Requiring an opt-in means the insecure configuration is a deliberate choice
 * that shows up in the deployment config, rather than the silent default.
 */
export function allowsAnonymousChat(): boolean {
  return process.env.ALLOW_ANONYMOUS_CHAT === "true";
}
