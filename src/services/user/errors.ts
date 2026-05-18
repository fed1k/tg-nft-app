export type AccountBlockCode = 'USER_BANNED' | 'USER_SUSPENDED'

export class UserApiError extends Error {
  code?: string
  userStatus?: string

  constructor(message: string, opts?: { code?: string; userStatus?: string }) {
    super(message)
    this.name = 'UserApiError'
    this.code = opts?.code
    this.userStatus = opts?.userStatus
  }
}

export function isAccountBlockedError(err: unknown): err is UserApiError {
  if (!(err instanceof UserApiError)) return false
  return err.code === 'USER_BANNED' || err.code === 'USER_SUSPENDED'
}
