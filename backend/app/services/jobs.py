from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from app.services.projects import Conflict


class AnalysisJobs:
    """Serialize inference while browsers poll short HTTP requests."""

    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="hum-analysis")
        self.pending = {}
        self.lock = Lock()

    def submit(self, key, service, project_id):
        with self.lock:
            old = self.pending.get(key)
            if old is not None and not old.done():
                return
            self.pending = {k: future for k, future in self.pending.items() if not future.done()}
            if len(self.pending) >= 3:
                raise Conflict("분석 요청이 많습니다. 잠시 후 다시 시도해 주세요.")
            self.pending[key] = self.executor.submit(service.analyze, project_id)

    def status(self, key):
        with self.lock:
            future = self.pending.get(key)
        if future is None:
            raise Conflict("서버가 재시작되었거나 분석이 종료되었습니다. 분석하기를 다시 눌러 주세요.")
        return future.result() if future.done() else None

    def close(self):
        self.executor.shutdown(wait=False, cancel_futures=True)
