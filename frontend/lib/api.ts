export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...init, cache: "no-store" });
  } catch {
    throw new Error(
      "서버에 연결할 수 없습니다. 백엔드 실행 상태와 인터넷 연결을 확인해 주세요.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    );
  if (data === null)
    throw new Error("서버 응답을 읽지 못했습니다. 다시 시도해 주세요.");
  return data;
}
export const jsonRequest = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});
