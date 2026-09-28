#!/usr/bin/env python3
import http.server
import socketserver
import json
import subprocess
import sys
import os

PORT = 8080
# Mã bảo mật để import sticker (có thể thay đổi qua biến môi trường SECURITY_CODE)
SECURITY_CODE = os.environ.get("SECURITY_CODE", "uhm2026")

import mimetypes

mimetypes.add_type("video/webm", ".webm")
mimetypes.add_type("application/json", ".tgs")
mimetypes.add_type("image/webp", ".webp")

class StickerPickerHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory="web", **kwargs)

    def guess_type(self, path):
        if path.endswith(".webm"):
            return "video/webm"
        if path.endswith(".tgs"):
            return "application/json"
        if path.endswith(".webp"):
            return "image/webp"
        return super().guess_type(path)

    def end_headers(self):
        # Tự động thêm CORS header cho tất cả phản hồi
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

        # Chống cache mã nguồn JavaScript, HTML và cấu hình Sticker Packs JSON
        clean_path = self.path.split("?")[0].rstrip("/")
        if clean_path.endswith((".js", ".json", ".html")) or clean_path in ["", "/"]:
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")

        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        clean_path = self.path.split("?")[0].rstrip("/")
        if clean_path == "/api/import":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                data = json.loads(body) if body else {}
                url = data.get("url", "").strip()
                code = data.get("security_code", "").strip()
                ext = data.get("ext", "webp").strip()
                is_animated = data.get("is_animated", False)

                # Kiểm tra mã bảo mật
                if code != SECURITY_CODE:
                    self.send_response(401)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": False, "error": "Mã bảo mật không đúng!"}, ensure_ascii=False).encode("utf-8"))
                    return

                if not url:
                    self.send_response(400)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": False, "error": "Vui lòng nhập URL Telegram Sticker!"}, ensure_ascii=False).encode("utf-8"))
                    return

                # Tự động ưu tiên sử dụng python.exe trong môi trường ảo (.venv) nơi chứa telethon
                python_exe = sys.executable
                venv_exe = os.path.join(os.getcwd(), ".venv", "Scripts", "python.exe") if sys.platform == "win32" else os.path.join(os.getcwd(), ".venv", "bin", "python")
                if os.path.exists(venv_exe):
                    python_exe = venv_exe

                # SCRIPT sticker.stickerimport tự động xử lý cả sticker tĩnh lẫn động (.tgs)
                module = "sticker.stickerimport"
                cmd = [python_exe, "-m", module, url]
                if ext in ["webp", "png", "jpg"]:
                    cmd.extend(["--ext", ext])

                # Thực thi lệnh import python
                result = subprocess.run(cmd, capture_output=True, text=True, cwd=os.getcwd())

                if result.returncode == 0:
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": True, "message": "Import Sticker Pack thành công!"}, ensure_ascii=False).encode("utf-8"))
                else:
                    err_msg = result.stderr or result.stdout or "Không thể import sticker."
                    self.send_response(500)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": False, "error": f"Lỗi: {err_msg.strip()}"}, ensure_ascii=False).encode("utf-8"))

            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False).encode("utf-8"))
        else:
            self.send_response(404)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": f"Path not found: {self.path}"}, ensure_ascii=False).encode("utf-8"))

if __name__ == "__main__":
    print(f"==================================================")
    print(f" Sticker Picker Production Server: http://0.0.0.0:{PORT}")
    print(f"==================================================")
    server = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), StickerPickerHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nĐang dừng server...")
        server.server_close()
