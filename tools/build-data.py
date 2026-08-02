#!/usr/bin/env python3
"""Tự động gộp các bài trong data/lessons thành dữ liệu website.

Người dùng chỉ cần thêm một file B14.json hoặc B14.txt vào data/lessons.
GitHub Actions sẽ chạy script này và cập nhật:
  - data/lessons.json
  - data/default-data.js

Chạy thủ công từ thư mục gốc project:
    python tools/build-data.py
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LESSON_DIR = ROOT / "data" / "lessons"
JSON_OUTPUT = ROOT / "data" / "lessons.json"
JS_OUTPUT = ROOT / "data" / "default-data.js"


def natural_key(value: str):
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", value)]


def normalize_word(raw):
    if isinstance(raw, list):
        raw = {
            "h": raw[0] if len(raw) > 0 else "",
            "p": raw[1] if len(raw) > 1 else "",
            "m": raw[2] if len(raw) > 2 else "",
        }
    if not isinstance(raw, dict):
        raw = {}
    return {
        "h": str(raw.get("h") or raw.get("hanzi") or "").strip(),
        "p": str(raw.get("p") or raw.get("pinyin") or "").strip(),
        "m": str(raw.get("m") or raw.get("meaning") or "").strip(),
    }


def parse_txt(path: Path):
    lesson_id = path.stem
    title = ""
    words = []
    errors = []

    for line_no, raw_line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("#"):
            meta = line[1:].strip()
            if ":" in meta:
                key, value = meta.split(":", 1)
                key = key.strip().lower()
                value = value.strip()
                if key in {"id", "ma", "mã"} and value:
                    lesson_id = value
                elif key in {"title", "ten", "tên"} and value:
                    title = value
            continue
        parts = [part.strip() for part in (line.split("|") if "|" in line else line.split("\t"))]
        if len(parts) < 3 or not parts[0]:
            errors.append(line_no)
            continue
        words.append({"h": parts[0], "p": parts[1], "m": " | ".join(parts[2:]).strip()})

    if errors:
        raise ValueError(f"{path.name}: sai định dạng ở dòng {', '.join(map(str, errors[:12]))}")
    return {"id": lesson_id, "title": title or lesson_id, "words": words}


def load_lesson(path: Path):
    if path.suffix.lower() == ".txt":
        raw = parse_txt(path)
    else:
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
        if isinstance(raw, list):
            raw = {"id": path.stem, "title": path.stem, "words": raw}
        if not isinstance(raw, dict):
            raise ValueError(f"{path.name}: dữ liệu phải là object JSON")

    lesson_id = str(raw.get("id") or path.stem).strip()
    title = str(raw.get("title") or lesson_id).strip()
    if not lesson_id:
        raise ValueError(f"{path.name}: thiếu id")

    words = [normalize_word(word) for word in raw.get("words", [])]
    words = [word for word in words if word["h"]]
    if not words:
        raise ValueError(f"{path.name}: không có từ hợp lệ")

    seen = set()
    duplicates = []
    for word in words:
        signature = (word["h"], word["p"], word["m"])
        if signature in seen:
            duplicates.append(word["h"])
        seen.add(signature)
    if duplicates:
        raise ValueError(f"{path.name}: có mục bị trùng hoàn toàn: {', '.join(duplicates[:10])}")

    return {"id": lesson_id, "title": title, "words": words}


def load_lessons():
    lessons = []
    seen_ids = set()
    paths = [
        path
        for path in LESSON_DIR.iterdir()
        if path.is_file()
        and path.suffix.lower() in {".json", ".txt"}
        and not path.name.startswith("_")
    ]
    paths.sort(key=lambda path: natural_key(path.stem))
    if not paths:
        raise SystemExit(f"Không tìm thấy file bài học trong {LESSON_DIR}")

    for path in paths:
        lesson = load_lesson(path)
        lesson_id = lesson["id"]
        if lesson_id in seen_ids:
            raise ValueError(f"Mã bài bị trùng: {lesson_id}")
        seen_ids.add(lesson_id)
        lessons.append(lesson)
    return lessons


def main():
    lessons = load_lessons()
    content = {"lessons": lessons}
    compact_content = json.dumps(content, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    revision = hashlib.sha256(compact_content.encode("utf-8")).hexdigest()[:16]
    data = {
        "version": 3,
        "metadata": {
            "name": "Từ vựng luyện chữ Hán",
            "generated_by": "tools/build-data.py",
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "revision": revision,
            "lesson_count": len(lessons),
            "word_count": sum(len(lesson["words"]) for lesson in lessons),
        },
        "lessons": lessons,
    }
    JSON_OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    compact = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    JS_OUTPUT.write_text("window.HANZI_DEFAULT_DB = " + compact + ";\n", encoding="utf-8")
    print(f"Đã tạo {JSON_OUTPUT.relative_to(ROOT)} và {JS_OUTPUT.relative_to(ROOT)}")
    print(
        f"Số bài: {len(lessons)} | Số từ: {data['metadata']['word_count']} | Revision: {revision}"
    )


if __name__ == "__main__":
    main()
