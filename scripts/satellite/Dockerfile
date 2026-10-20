FROM python:3.12-slim

WORKDIR /app
COPY scripts/satellite/requirements.txt /app/scripts/satellite/requirements.txt
RUN pip --default-timeout=60 --retries=5 install --no-cache-dir -r /app/scripts/satellite/requirements.txt
COPY scripts /app/scripts
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
CMD ["python", "-m", "scripts.satellite.worker"]
