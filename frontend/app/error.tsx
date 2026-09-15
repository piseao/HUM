"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="shell">
      <h1>잠시 문제가 생겼습니다.</h1>
      <p>저장된 프로젝트는 다시 열 수 있습니다.</p>
      <button className="primary" onClick={reset}>
        다시 시도
      </button>
    </main>
  );
}
