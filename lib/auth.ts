import "server-only";
import { cookies } from "next/headers";
import { createHash } from "crypto";

// 대시보드 진입 비밀번호. 환경변수로 덮어쓸 수 있고 기본값은 0708.
const PASSWORD = process.env.APP_PASSWORD ?? "0708";

export const SESSION_COOKIE = "session";

// 쿠키에는 비밀번호 원문이 아니라 해시를 저장해 위조를 막는다.
export function sessionToken(): string {
  return createHash("sha256").update(`toss-dash:${PASSWORD}`).digest("hex");
}

export function checkPassword(pw: unknown): boolean {
  return typeof pw === "string" && pw === PASSWORD;
}

// 요청 쿠키가 유효한 세션인지 검사 (서버 측 강제).
export async function isAuthed(): Promise<boolean> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value === sessionToken();
}
