// Callback URLs can reach monitoring before React removes their query string.
export function redactAuthTelemetry<T>(event: T): T {
  const clean = (value: unknown, depth: number): unknown => {
    if (depth > 12) return "[Filtered]"
    if (typeof value === "string")
      return value
        .replace(/Bearer\s+[^\s"']+/gi, "Bearer [Filtered]")
        .replace(
          /("(?:access_?token|refresh_?token|id_?token|credentials|codeVerifier)"\s*:\s*")[^"]*/gi,
          "$1[Filtered]"
        )
        .replace(
          /([?&](?:code|state|access_token|refresh_token|id_token|error_description)=)[^&#\s]*/gi,
          "$1[Filtered]"
        )
    if (Array.isArray(value)) return value.map((item) => clean(item, depth + 1))
    if (!value || typeof value !== "object") return value
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /^(authorization|cookie|set-cookie|access_?token|refresh_?token|id_?token|credentials|codeVerifier)$/i.test(
          key
        )
          ? "[Filtered]"
          : clean(item, depth + 1),
      ])
    )
  }
  return clean(event, 0) as T
}
