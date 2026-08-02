#!/usr/bin/env python3
"""Tạo dữ liệu phân tích chữ Hán cho các chữ đang có trong bài học.

Nguồn mặc định: Make Me a Hanzi dictionary.txt (LGPL-3.0-or-later).
Script chỉ giữ lại các trường cần cho chức năng học:
- bộ thủ chính (radical)
- cấu trúc IDS (decomposition)
- các thành phần đồ họa
- loại cấu tạo và thành phần gợi nghĩa/gợi âm khi nguồn có dữ liệu

Chạy từ thư mục gốc project:
    python tools/build-characters.py

Kiểm thử hoặc chạy offline với file nguồn cục bộ:
    python tools/build-characters.py --source tests/fixtures/makemeahanzi-sample.txt
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.request
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LESSONS_PATH = ROOT / "data" / "lessons.json"
OUTPUT_PATH = ROOT / "data" / "characters.json"
SOURCE_URL = "https://raw.githubusercontent.com/skishore/makemeahanzi/refs/heads/master/dictionary.txt"

IDC_LABELS = {
    "⿰": "trái – phải",
    "⿱": "trên – dưới",
    "⿲": "trái – giữa – phải",
    "⿳": "trên – giữa – dưới",
    "⿴": "bao quanh kín",
    "⿵": "bao quanh, hở dưới",
    "⿶": "bao quanh, hở trên",
    "⿷": "bao quanh, hở phải",
    "⿸": "bao quanh từ trên-trái",
    "⿹": "bao quanh từ trên-phải",
    "⿺": "bao quanh từ dưới-trái",
    "⿻": "chồng/đan xen",
    "⿼": "bao quanh từ phải",
    "⿽": "bao quanh từ dưới",
    "⿾": "biến thể ngang",
    "⿿": "biến thể dọc",
}

ETYMOLOGY_LABELS = {
    "pictophonetic": "hình thanh",
    "ideographic": "hội ý/chỉ sự",
    "pictographic": "tượng hình",
}


def is_han_character(char: str) -> bool:
    if not char:
        return False
    code = ord(char)
    return (
        0x3400 <= code <= 0x4DBF
        or 0x4E00 <= code <= 0x9FFF
        or 0xF900 <= code <= 0xFAFF
        or 0x20000 <= code <= 0x2FA1F
    )


def collect_characters() -> list[str]:
    data = json.loads(LESSONS_PATH.read_text(encoding="utf-8"))
    chars: set[str] = set()
    for lesson in data.get("lessons", []):
        for word in lesson.get("words", []):
            for char in str(word.get("h", "")):
                if is_han_character(char):
                    chars.add(char)
    return sorted(chars, key=ord)


def is_ids_operator(char: str) -> bool:
    code = ord(char)
    return 0x2FF0 <= code <= 0x2FFF or char in {"〾", "㇯"}


def extract_components(decomposition: str, character: str) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for char in decomposition or "":
        if char in {"？", "?", "⬚"} or is_ids_operator(char):
            continue
        if char == character and len(decomposition) == 1:
            continue
        if char.isspace() or char in seen:
            continue
        seen.add(char)
        output.append(char)
    return output


def load_existing() -> dict[str, dict]:
    if not OUTPUT_PATH.exists():
        return {}
    try:
        data = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
        return {
            str(item.get("character")): item
            for item in data.get("characters", [])
            if item.get("character")
        }
    except Exception:
        return {}


def read_source(path: Path | None) -> tuple[list[str], str]:
    if path:
        return path.read_text(encoding="utf-8-sig").splitlines(), str(path)

    last_error: Exception | None = None
    for attempt in range(1, 4):
        request = urllib.request.Request(
            SOURCE_URL,
            headers={"User-Agent": "hanzi-trainer-build/1.0"},
        )
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                raw = response.read().decode("utf-8")
            return raw.splitlines(), SOURCE_URL
        except Exception as error:  # pragma: no cover - phụ thuộc mạng
            last_error = error
            if attempt < 3:
                time.sleep(attempt * 2)
    if last_error:
        raise last_error
    raise RuntimeError("Không tải được nguồn phân tích chữ.")


def parse_source(lines: list[str], wanted: set[str]) -> dict[str, dict]:
    found: dict[str, dict] = {}
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        character = str(item.get("character") or "")
        if character in wanted:
            found[character] = item
            if len(found) == len(wanted):
                break
    return found


def normalize_entry(character: str, raw: dict | None, existing: dict | None) -> dict:
    source = raw or existing or {}
    decomposition = str(source.get("decomposition") or "").strip()
    if decomposition.startswith("？") or decomposition == "?":
        decomposition = ""
    radical = str(source.get("radical") or "").strip()
    components = extract_components(decomposition, character)
    etymology = source.get("etymology") if isinstance(source.get("etymology"), dict) else {}
    etymology_type = str(etymology.get("type") or source.get("etymology_type") or "").strip()
    semantic = str(etymology.get("semantic") or source.get("semantic") or "").strip()
    phonetic = str(etymology.get("phonetic") or source.get("phonetic") or "").strip()
    first = decomposition[0] if decomposition else ""

    return {
        "character": character,
        "radical": radical,
        "decomposition": decomposition,
        "structure": IDC_LABELS.get(first, "chữ đơn/thành phần chưa xác định" if not decomposition else "cấu trúc khác"),
        "components": components,
        "formation": ETYMOLOGY_LABELS.get(etymology_type, ""),
        "semantic": semantic,
        "phonetic": phonetic,
        "available": bool(radical or decomposition or semantic or phonetic),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, help="File dictionary.txt cục bộ để kiểm thử/offline")
    parser.add_argument("--strict", action="store_true", help="Báo lỗi nếu không tải được nguồn")
    args = parser.parse_args()

    chars = collect_characters()
    wanted = set(chars)
    existing = load_existing()
    source_entries: dict[str, dict] = {}
    source_name = "dữ liệu hiện có"
    source_error = ""

    try:
        lines, source_name = read_source(args.source)
        source_entries = parse_source(lines, wanted)
    except Exception as error:  # pragma: no cover - nhánh mạng phụ thuộc môi trường
        source_error = str(error)
        if args.strict:
            raise
        print(f"Cảnh báo: không tải được dữ liệu phân tích mới: {error}", file=sys.stderr)

    entries = [normalize_entry(char, source_entries.get(char), existing.get(char)) for char in chars]
    available = sum(1 for entry in entries if entry["available"])
    payload_for_revision = json.dumps(entries, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    revision = hashlib.sha256(payload_for_revision.encode("utf-8")).hexdigest()[:16]
    output = {
        "version": 1,
        "metadata": {
            "generated_by": "tools/build-characters.py",
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "revision": revision,
            "character_count": len(entries),
            "available_count": available,
            "source": "Make Me a Hanzi dictionary.txt",
            "source_url": SOURCE_URL,
            "source_license": "LGPL-3.0-or-later",
            "source_loaded_from": source_name,
            "source_error": source_error,
        },
        "characters": entries,
    }
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Đã tạo {OUTPUT_PATH.relative_to(ROOT)}: {available}/{len(entries)} chữ có dữ liệu phân tích")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
