from pathlib import Path

path = Path("scripts/fix-vendor-consumers.py")
text = path.read_text()
old = '''replace_all("src/components/rdash/modules/RateFinderModule.tsx", [
    ("rate.rawUnitId", "rate.rateUnit"),
    ("rate.vendorRateId", "rate.sourceId"),
    ("rate.rawRate", "rate.quotedRate"),
])'''
new = '''replace_all("src/components/rdash/modules/RateFinderModule.tsx", [
    ("selected.rawUnitId", "selected.rateUnit"),
    ("selected.vendorRateId", "selected.sourceId"),
    ("selected.rawRate", "selected.quotedRate"),
])'''
if old not in text:
    raise SystemExit("Expected RateFinder transformer block not found")
path.write_text(text.replace(old, new, 1))
print("Vendor consumer transformer markers corrected.")
