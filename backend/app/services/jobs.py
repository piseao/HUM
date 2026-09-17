from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from app.services.projects import Conflict


class AnalysisJobs:
    """Serialize inference while browsers poll short HTTP requests."""

    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="hum-analysis")
        self.pending = {}
        self.progress = {}
        self.lock = Lock()

    def submit(self, key, service, project_id):
        with self.lock:
            old = self.pending.get(key)
            if old is not None and not old.done():
                return
            if sum(not future.done() for future in self.pending.values()) >= 3:
                raise Conflict("분석 요청이 많습니다. 잠시 후 다시 시도해 주세요.")
            for stale in list(self.pending):
                if len(self.pending) < 128:
                    break
                if self.pending[stale].done():
                    del self.pending[stale]
                    self.progress.pop(stale, None)
            self.progress[key] = {"stage": "audio_preparation", "progress": 25,
                                  "message": "오디오 준비가 끝났어요. 분석 순서를 기다리고 있어요."}

            def report(stage, progress, message):
                with self.lock:
                    self.progress[key] = {"stage": stage, "progress": progress, "message": message}

            self.pending[key] = self.executor.submit(service.analyze, project_id, report)

    def snapshot(self, key):
        with self.lock:
            return dict(self.progress.get(key, {}))

    def status(self, key):
        with self.lock:
            future = self.pending.get(key)
        if future is None:
            raise Conflict("서버가 재시작되었거나 분석이 종료되었습니다. 분석하기를 다시 눌러 주세요.")
        return future.result() if future.done() else None

    def close(self):
        self.executor.shutdown(wait=False, cancel_futures=True)
