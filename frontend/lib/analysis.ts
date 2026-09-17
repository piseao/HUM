export function nextPoll(signal: AbortSignal, delay = 1500): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      cleanup();
      resolve();
    };
    const visible = () => {
      if (document.visibilityState === "visible") finish();
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = window.setTimeout(finish, delay);
    const cleanup = () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("pageshow", finish);
      signal.removeEventListener("abort", abort);
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("pageshow", finish);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
