FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY gateway.py .

EXPOSE 8000

# Listen on the platform-provided $PORT (Render/Railway/Fly inject it); fall
# back to 8000 for local runs. Shell form so the variable expands.
CMD ["sh", "-c", "uvicorn gateway:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
