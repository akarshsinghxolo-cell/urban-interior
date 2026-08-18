from pathlib import Path

path = Path("tests/customer-sites-save.test.ts")
data = path.read_bytes()
old = b'            status: "active",\r\n'
new = b'        status: "active",\r\n'
if data.count(old) != 3:
    raise SystemExit(f"expected three over-indented status lines, found {data.count(old)}")
path.write_bytes(data.replace(old, new))
print("Restored Customer save fixture indentation without changing line endings.")
