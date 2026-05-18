/** One leading @ for UI — values from API/DB may already include @ from sanitizeUsername. */
export function displayHandle(raw: string | null | undefined): string {
  const cleaned = String(raw || '').trim().replace(/^@+/, '')
  if (!cleaned) return '—'
  return `@${cleaned}`
}
