from pathlib import Path

path = Path("src/components/rdash/modules/GpsTrackingModule.tsx")
text = path.read_text()
old = 'className="min-h-[560px]" emptyTitle="No mapped route or field records"'
new = 'className="h-[clamp(300px,44svh,420px)] sm:h-[440px] lg:h-[560px]" emptyTitle="No mapped route or field records"'
count = text.count(old)
if count != 1:
    raise SystemExit(f"expected exactly one Team GPS map height target, found {count}")
path.write_text(text.replace(old, new))
print("Updated Team GPS Monitor map to responsive phone/tablet/desktop heights.")
