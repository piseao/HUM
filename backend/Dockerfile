FROM python:3.10-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HUM_DATA_DIR=/data/projects \
    NUMBA_CACHE_DIR=/tmp/numba-cache \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1

WORKDIR /app
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt && pip check
COPY app ./app
COPY scripts ./scripts
COPY tests ./tests
RUN python -c "from basic_pitch import FilenameSuffix, build_icassp_2022_model_path; from basic_pitch.inference import Model; Model(str(build_icassp_2022_model_path(FilenameSuffix.onnx)))"

EXPOSE 10000
CMD ["sh", "-c", "exec python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1 --no-access-log"]
