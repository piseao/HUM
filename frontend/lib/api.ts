const backendOrigin = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(
  /\/$/,
  "",
);

export function apiUrl(path: string): string {
  return `${backendOrigin}/api${path}`;
}

function clientHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  if (process.env.NEXT_PUBLIC_ISOLATE_CLIENTS === "true") {
    let id = localStorage.getItem("hum-client-id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("hum-client-id", id);
    }
    headers.set("X-HUM-Client-ID", id);
  }
  return headers;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(apiUrl(path), {
      ...init,
      headers: clientHeaders(init),
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "서버에 연결할 수 없습니다. 연결 상태와 브라우저 저장 공간 설정을 확인해 주세요.",
    );
  }
}

export async function apiBlob(path: string): Promise<Blob> {
  const response = await request(path);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.detail || "오디오 파일을 불러오지 못했습니다.");
  }
  return response.blob();
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await request(path, init);
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
