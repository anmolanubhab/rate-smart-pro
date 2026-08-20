// supabase-js's functions.invoke() only ever attaches a generic message —
// "Edge Function returned a non-2xx status code" — to the error it throws
// on a non-2xx response; the actual { error: "..." } body our functions
// return is left on `error.context`, a raw Response, and never surfaced
// automatically. Every caller of functions.invoke() should route the
// thrown error through this first, or every failure the user sees is this
// same unhelpful string regardless of what actually went wrong server-side.
export async function extractFunctionErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context && typeof context === "object" && "json" in context && typeof (context as Response).json === "function") {
    try {
      const body = await (context as Response).clone().json();
      if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
        return (body as { error: string }).error;
      }
    } catch {
      // response body wasn't JSON — fall through to the generic message below
    }
  }
  return error instanceof Error ? error.message : "Request failed";
}
