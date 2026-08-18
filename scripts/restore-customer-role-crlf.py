from pathlib import Path

FILES = [
    Path("src/components/rdash/customer-sites-form-model.ts"),
    Path("tests/customer-sites-save.test.ts"),
]

for path in FILES:
    text = path.read_bytes().decode("utf-8")
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    path.write_bytes(normalized.replace("\n", "\r\n").encode("utf-8"))
    if b"\r\n" not in path.read_bytes():
        raise SystemExit(f"{path}: CRLF restoration failed")

print("Restored original CRLF style for Customer Roles removal files.")
