# Production Dockerfile for StickerPicker
FROM python:3.11-slim

# Thiết lập môi trường Python Production
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8080 \
    SECURITY_CODE=uhm2026 \
    BOT_TOKEN=7633439079:AAE4ZEViclHi3NE8GB8E39iEOtnd7I5e8lI

# Cài đặt các thư viện hệ thống phụ thuộc
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libmagic1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cài đặt Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy mã nguồn dự án
COPY . .

# Kiểm tra sức khỏe container (Healthcheck)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/ || exit 1

EXPOSE 8080

CMD ["python", "server.py"]
