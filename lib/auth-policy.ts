export type AuthenticationFailure = {
  code: "AUTHENTICATION_REQUIRED"
  error: string
}

export const authenticationFailure: AuthenticationFailure = {
  code: "AUTHENTICATION_REQUIRED",
  error: "Your session could not be verified. Please sign in again.",
}

export function isAuthenticationFailure(
  value: unknown
): value is AuthenticationFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    value.code === authenticationFailure.code
  )
}

// Only an explicit rejection before work starts is safe to retry automatically.
export async function recoverSessionAction<T>(
  action: () => Promise<T>,
  refresh: () => Promise<string | null>
): Promise<T> {
  const result = await action()
  if (!isAuthenticationFailure(result)) return result
  if (!(await refresh())) return result
  return action()
}
