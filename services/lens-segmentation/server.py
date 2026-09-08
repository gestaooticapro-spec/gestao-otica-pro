#!/usr/bin/env python3
"""Servico isolado de segmentacao de lentes para o tablet da MB Optical."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import sys
import tempfile
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import cv2
import numpy as np
from ultralytics import YOLO

from detect_lenses import DEFAULT_MODEL, LensMeasurement, analyze_image

SERVICE_DIR = Path(__file__).resolve().parent
MODEL_SOURCE_PATH = SERVICE_DIR / "MODEL_SOURCE.txt"
SHA256_PATTERN = re.compile(r"^sha256:\s*([0-9a-f]{64})\s*$", re.I | re.M)
DATA_URL_PATTERN = re.compile(r"^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$")
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MIN_IMAGE_BYTES = 128
TOKEN_PARTS = 4
used_jti: dict[str, int] = {}
inference_lock = threading.Lock()
MODEL: YOLO | None = None


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def read_expected_sha256() -> str:
    if not MODEL_SOURCE_PATH.is_file():
        raise RuntimeError("MODEL_SOURCE.txt ausente; recuse subir sem a origem do peso.")
    match = SHA256_PATTERN.search(MODEL_SOURCE_PATH.read_text(encoding="utf-8"))
    if not match:
        raise RuntimeError("MODEL_SOURCE.txt sem sha256 valido.")
    return match.group(1).lower()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_model_hash() -> None:
    if not DEFAULT_MODEL.is_file():
        raise RuntimeError(f"Peso ausente: {DEFAULT_MODEL}")
    expected = read_expected_sha256()
    actual = file_sha256(DEFAULT_MODEL)
    if actual != expected:
        raise RuntimeError(f"Hash do best.pt nao confere. esperado={expected} atual={actual}")


def allowed_origins() -> set[str]:
    raw = os.environ.get("LENS_SEGMENT_ALLOWED_ORIGINS", "").strip()
    if not raw:
        return set()
    return {item.strip().rstrip("/") for item in raw.split(",") if item.strip()}


def internal_secret() -> str:
    secret = os.environ.get("LENS_SEGMENT_INTERNAL_SECRET", "")
    if len(secret) < 32:
        raise RuntimeError("LENS_SEGMENT_INTERNAL_SECRET deve ter pelo menos 32 caracteres.")
    return secret


def verify_token(token: str, secret: str, now: int) -> dict[str, Any] | None:
    parts = token.split(".")
    if len(parts) != TOKEN_PARTS:
        return None
    store_raw, exp_raw, jti, signature = parts
    if not store_raw.isdigit() or not exp_raw.isdigit():
        return None
    store_id = int(store_raw)
    exp = int(exp_raw)
    if store_id < 1 or len(jti) < 16 or not re.fullmatch(r"[0-9a-f]+", jti, re.I):
        return None
    if exp < now:
        return None
    payload = f"{store_id}.{exp}.{jti}".encode("ascii")
    expected = b64url(hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).digest())
    if not hmac.compare_digest(signature, expected):
        return None
    return {"storeId": store_id, "exp": exp, "jti": jti}


def remember_jti(jti: str, exp: int, now: int) -> bool:
    expired = [key for key, until in used_jti.items() if until < now]
    for key in expired:
        del used_jti[key]
    if jti in used_jti:
        return False
    used_jti[jti] = exp
    return True


def mask_polygons(lens: LensMeasurement) -> list[list[list[int]]]:
    contours, _ = cv2.findContours(lens.mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    polygons: list[list[list[int]]] = []
    for contour in sorted(contours, key=cv2.contourArea, reverse=True):
        if cv2.contourArea(contour) < 4:
            continue
        perimeter = cv2.arcLength(contour, True)
        simplified = cv2.approxPolyDP(contour, max(0.75, perimeter * 0.0015), True)
        points = [[int(point[0][0]), int(point[0][1])] for point in simplified]
        if len(points) >= 3:
            polygons.append(points)
    return polygons


def serialize_lens(lens: LensMeasurement) -> dict[str, Any]:
    return {
        "side": lens.label,
        "confidence": round(lens.confidence, 6),
        "bbox": {"x": lens.x, "y": lens.y, "width": lens.width, "height": lens.height},
        "center": {"x": round(lens.center_x, 2), "y": round(lens.center_y, 2)},
        "areaPixels": int(lens.mask.sum()),
        "polygons": mask_polygons(lens),
    }


def decode_image(data_url: str) -> np.ndarray:
    match = DATA_URL_PATTERN.match(data_url.strip())
    if not match:
        raise ValueError("Formato da foto invalido.")
    raw = base64.b64decode(match.group(2), validate=True)
    if len(raw) < MIN_IMAGE_BYTES or len(raw) > MAX_IMAGE_BYTES:
        raise ValueError("Foto fora do limite permitido.")
    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Nao foi possivel ler a foto.")
    return image


class Handler(BaseHTTPRequestHandler):
    server_version = "MbOpticalLensSegmentation/1.0"

    def log_message(self, format: str, *args: object) -> None:
        print(f"[{self.log_date_time_string()}] {format % args}", file=sys.stderr)

    def cors_origin(self) -> str | None:
        origin = (self.headers.get("Origin") or "").rstrip("/")
        allowed = allowed_origins()
        if origin and origin in allowed:
            return origin
        return None

    def write_cors(self, origin: str | None) -> None:
        if not origin:
            return
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Max-Age", "600")

    def send_json(self, payload: dict[str, Any], status: int = HTTPStatus.OK, origin: str | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.write_cors(origin)
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        origin = self.cors_origin()
        if urlparse(self.path).path != "/v1/segment" or not origin:
            self.send_json({"ok": False, "message": "Origem nao autorizada."}, HTTPStatus.FORBIDDEN)
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self.write_cors(origin)
        self.end_headers()

    def do_GET(self) -> None:
        if urlparse(self.path).path != "/health":
            self.send_json({"ok": False, "message": "Recurso nao encontrado."}, HTTPStatus.NOT_FOUND)
            return
        self.send_json({"ok": True, "model": str(DEFAULT_MODEL.name)})

    def do_POST(self) -> None:
        origin = self.cors_origin()
        if urlparse(self.path).path != "/v1/segment":
            self.send_json({"ok": False, "message": "Recurso nao encontrado."}, HTTPStatus.NOT_FOUND, origin)
            return
        if not origin:
            self.send_json({"ok": False, "message": "Origem nao autorizada."}, HTTPStatus.FORBIDDEN)
            return

        authorization = self.headers.get("Authorization") or ""
        token = authorization[7:] if authorization.startswith("Bearer ") else ""
        try:
            secret = internal_secret()
        except RuntimeError as error:
            self.send_json({"ok": False, "message": str(error)}, HTTPStatus.SERVICE_UNAVAILABLE, origin)
            return
        now = int(time.time())
        parsed = verify_token(token, secret, now)
        if not parsed:
            self.send_json({"ok": False, "message": "Token invalido ou vencido."}, HTTPStatus.UNAUTHORIZED, origin)
            return
        if not remember_jti(parsed["jti"], parsed["exp"], now):
            self.send_json({"ok": False, "message": "Token ja utilizado."}, HTTPStatus.UNAUTHORIZED, origin)
            return

        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_IMAGE_BYTES * 2:
            self.send_json({"ok": False, "message": "Envie uma foto valida de ate 10 MB."}, HTTPStatus.BAD_REQUEST, origin)
            return
        raw_body = self.rfile.read(length)
        try:
            body = json.loads(raw_body.decode("utf-8"))
            data_url = body.get("dataUrl")
            if not isinstance(data_url, str):
                raise ValueError("dataUrl ausente.")
            image = decode_image(data_url)
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as error:
            self.send_json({"ok": False, "message": str(error) or "Pedido invalido."}, HTTPStatus.BAD_REQUEST, origin)
            return

        if MODEL is None:
            self.send_json({"ok": False, "message": "Modelo indisponivel."}, HTTPStatus.SERVICE_UNAVAILABLE, origin)
            return
        if not inference_lock.acquire(blocking=False):
            self.send_json({"ok": False, "message": "Analise ocupada. Tente de novo."}, HTTPStatus.SERVICE_UNAVAILABLE, origin)
            return

        temp_path: Path | None = None
        try:
            handle = tempfile.NamedTemporaryFile(prefix="mb-lens-", suffix=".jpg", delete=False)
            temp_path = Path(handle.name)
            handle.close()
            if not cv2.imwrite(str(temp_path), image):
                raise ValueError("Falha ao gravar foto temporaria.")
            lenses = analyze_image(MODEL, image)
            payload = {
                "ok": True,
                "imageWidth": int(image.shape[1]),
                "imageHeight": int(image.shape[0]),
                "mirrored": False,
                "lenses": [serialize_lens(lens) for lens in lenses],
            }
            self.send_json(payload, HTTPStatus.OK, origin)
        except ValueError as error:
            self.send_json({"ok": False, "message": str(error)}, HTTPStatus.UNPROCESSABLE_ENTITY, origin)
        except Exception:
            print("[lens-segmentation] falha na inferencia", file=sys.stderr)
            self.send_json({"ok": False, "message": "Nao foi possivel analisar a foto."}, HTTPStatus.INTERNAL_SERVER_ERROR, origin)
        finally:
            inference_lock.release()
            if temp_path is not None:
                try:
                    temp_path.unlink(missing_ok=True)
                except OSError as error:
                    print(f"[lens-segmentation] nao apagou temp: {error}", file=sys.stderr)


def main() -> int:
    global MODEL
    try:
        verify_model_hash()
        internal_secret()
        if not allowed_origins():
            raise RuntimeError("LENS_SEGMENT_ALLOWED_ORIGINS e obrigatorio.")
        print(f"Loading model: {DEFAULT_MODEL}", file=sys.stderr)
        MODEL = YOLO(str(DEFAULT_MODEL))
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    host = os.environ.get("LENS_SEGMENT_HOST", "127.0.0.1")
    port = int(os.environ.get("LENS_SEGMENT_PORT", "8090"))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"lens-segmentation listening on {host}:{port}", file=sys.stderr)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
