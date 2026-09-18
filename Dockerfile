FROM python:3.13-alpine
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 STACKTRACE_CONFIG=/config/timeline.yaml
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && addgroup -S app && adduser -S -G app -u 10001 app
COPY app ./app
COPY config/timeline.yaml /config/timeline.yaml
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=2)" || exit 1
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "4", "--worker-tmp-dir", "/tmp", "--access-logfile", "-", "--error-logfile", "-", "app.server:application"]
