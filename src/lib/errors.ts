/**
 * Parse SQLite UNIQUE constraint errors into user-friendly messages.
 * Returns a localized message string, or null if the error is not a constraint violation.
 */
export function parseSqliteConstraintError(err: unknown): string | null {
  if (
    !(err instanceof Error) ||
    !("code" in err) ||
    (err as { code: string }).code !== "SQLITE_CONSTRAINT_UNIQUE"
  ) {
    return null;
  }

  const msg = err.message;

  // "UNIQUE constraint failed: users.name"
  if (msg.includes("users.name")) return "用户名已存在";
  if (msg.includes("users.password")) return "密码已被其他用户使用";

  return "数据冲突，请检查输入";
}
