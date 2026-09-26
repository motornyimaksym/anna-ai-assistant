FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY bridge.py runner.py session.py ./
RUN useradd --uid 10001 --create-home bridge
USER bridge
ENV PORT=8080 PYTHONDONTWRITEBYTECODE=1
CMD ["sh", "-c", "exec uvicorn bridge:app --host 0.0.0.0 --port ${PORT} --no-access-log --log-level critical"]
