"""Offline, checksum-verified snapshots. Stop all writers before either command."""
import argparse
import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path


def files(root):
    result = {}
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError("심볼릭 링크가 포함된 데이터는 처리할 수 없습니다.")
        if path.is_file() and path.name != ".lock":
            result[path.relative_to(root).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
        elif not path.is_file() and not path.is_dir():
            raise ValueError("일반 파일과 폴더만 지원합니다.")
    return result


def transfer(source, destination, restore=False):
    source, destination = Path(source), Path(destination)
    if source.is_symlink() or not source.is_dir():
        raise ValueError("원본은 실제 데이터 폴더여야 합니다.")
    source, destination = source.resolve(), destination.absolute()
    if destination.exists() or destination.is_symlink():
        raise ValueError("기존 폴더에는 덮어쓰지 않습니다. 새 경로를 지정하세요.")
    if destination.resolve().is_relative_to(source):
        raise ValueError("원본 폴더 안에 결과를 만들 수 없습니다.")
    data = source / "data" if restore else source
    if restore:
        if data.is_symlink() or not data.is_dir():
            raise ValueError("백업 데이터 폴더가 없습니다.")
        manifest = json.loads((source / "manifest.json").read_text())
        if manifest.get("version") != 1 or not isinstance(manifest.get("files"), dict):
            raise ValueError("지원하지 않는 백업 형식입니다.")
        expected = manifest["files"]
    else:
        expected = files(data)
    if not expected:
        raise ValueError("빈 데이터는 백업하거나 복원하지 않습니다.")
    if files(data) != expected:
        raise ValueError("백업 파일 목록 또는 체크섬이 일치하지 않습니다.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=".hum-transfer-", dir=destination.parent))
    try:
        target = temporary / "result"
        copied = target if restore else target / "data"
        copied.mkdir(parents=True)
        for name in expected:
            path = copied / name
            path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(data / name, path)
        if files(copied) != expected or files(data) != expected:
            raise ValueError("복사 중 데이터가 변경되었습니다. 서버를 정지하고 다시 실행하세요.")
        if not restore:
            (target / "manifest.json").write_text(json.dumps({"version": 1, "files": expected}, indent=2))
        # Reserve the destination so a concurrent run cannot replace existing data.
        destination.mkdir()
        try:
            os.replace(target, destination)
        except BaseException:
            destination.rmdir()
            raise
    finally:
        shutil.rmtree(temporary)
    return len(expected)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["backup", "restore"])
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--server-stopped", action="store_true", required=True,
                        help="모든 백엔드 쓰기 작업을 정지한 뒤에만 지정하세요.")
    args = parser.parse_args()
    try:
        count = transfer(args.source, args.destination, restore=args.action == "restore")
    except (OSError, ValueError) as exc:
        parser.exit(1, f"실패: {exc}\n")
    print(f"{args.action}: {count}개 파일 체크섬 검증 완료 → {args.destination}")


if __name__ == "__main__":
    main()
