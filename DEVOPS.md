# Hướng dẫn DevOps - Triển khai Production (Docker)

Tài liệu ngắn gọn giúp DevOps triển khai dự án **StickerPicker** lên môi trường **Production** bằng Docker & Docker Compose chỉ với **1 câu lệnh**.

---

## 🚀 1. Triển khai Nhanh (Quick Production Deploy)

### Lệnh duy nhất để khởi chạy:
```bash
docker compose up -d --build
```

---

## ⚙️ 2. Cấu hình Môi trường (Environment Variables)

Thay đổi các biến môi trường trực tiếp trong file `docker-compose.yml` hoặc truyền vào container:

| Biến | Giá trị mặc định | Mô tả |
| :--- | :--- | :--- |
| `PORT` | `8080` | Cổng HTTP Server nội bộ của Container |
| `SECURITY_CODE` | `uhm2026` | Mã bảo mật yêu cầu khi nhập trên giao diện Web |
| `BOT_TOKEN` | `7633439079:...` | Bot Token Telegram tự động đăng nhập kết nối API |

---

## 💾 3. Lưu trữ dữ liệu cố định (Persistent Volumes)

Container sử dụng 2 mount point quan trọng trong `docker-compose.yml` để **không bị mất dữ liệu khi restart/rebuild**:

- `./web/packs` 👉 Lưu trữ toàn bộ Sticker JSON và hình ảnh đã tải về.
- `./sticker-import.session` 👉 Lưu trữ phiên đăng nhập Telegram MTProto API (không cần đăng nhập lại số điện thoại).

---

## 🌐 4. Cấu hình Nginx Reverse Proxy & SSL (Production)

File cấu hình Nginx mẫu đặt phía trước Docker (`/etc/nginx/sites-available/stickerpicker`):

```nginx
server {
    listen 80;
    server_name sticker.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name sticker.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/sticker.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sticker.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 🛠️ 5. Quản lý & Lệnh thường dùng

- **Xem Logs ứng dụng:**
  ```bash
  docker compose logs -f
  ```
- **Kiểm tra Healthcheck:**
  ```bash
  docker ps
  ```
- **Dừng ứng dụng:**
  ```bash
  docker compose down
  ```
- **Rebuild lại khi có code mới:**
  ```bash
  git pull && docker compose up -d --build
  ```
