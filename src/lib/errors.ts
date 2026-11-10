/** Errors from supabase-js RPCs carry Postgres `details`; validation errors put a JSON list there. */
export type RpcError = { message: string; code?: string; details?: string | null; hint?: string | null }

export function isRpcError(e: unknown): e is RpcError {
  return typeof e === 'object' && e !== null && 'message' in e
}

/** Server-side validation problems (create_exam / update_exam raise 22023 with a JSON array). */
export function rpcProblems(e: unknown): string[] {
  if (!isRpcError(e) || e.code !== '22023' || !e.details) return []
  try {
    const parsed: unknown = JSON.parse(e.details)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function errorMessage(e: unknown): string {
  if (isRpcError(e)) return e.message
  if (e instanceof Error) return e.message
  return String(e)
}
