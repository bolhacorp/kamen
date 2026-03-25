/** LiveAvatar sandbox sessions must use this avatar only. */
export const SANDBOX_AVATAR_ID =
  "dd73ea75-1218-4ef3-92ce-606d5f7fbc0a" as const;

export function avatarIdForSandboxMode(
  isSandbox: boolean,
  avatarId: string,
): string {
  return isSandbox ? SANDBOX_AVATAR_ID : avatarId;
}
