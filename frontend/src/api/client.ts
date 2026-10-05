export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type FastApiDetail = string | { msg: string; loc?: (string | number)[] }[]

function messageFrom(detail: FastApiDetail | undefined, status: number): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length > 0) return detail[0].msg
  if (status >= 500) return 'Something went wrong on our side. Please try again.'
  return 'Request failed. Please try again.'
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init.headers },
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection.')
  }
  if (res.status === 204) return undefined as T
  const body: unknown = await res.json().catch(() => undefined)
  if (!res.ok) {
    const detail = (body as { detail?: FastApiDetail } | undefined)?.detail
    throw new ApiError(res.status, messageFrom(detail, res.status))
  }
  return body as T
}

export const post = <T>(path: string, data?: unknown) =>
  api<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) })
