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
text = text.replace(old, new, 1)

procurement_marker = '''text = text.replace('placeholder={vendorRate ? String(vendorRate.quoted_rate) : "0"}', 'placeholder={vendorRate ? String(vendorRate.quoted_rate) : "0"}')
p.write_text(text)

# -------------------------------------------------------------------------
# Rate Finder'''
procurement_replacement = '''text = text.replace('placeholder={vendorRate ? String(vendorRate.quoted_rate) : "0"}', 'placeholder={vendorRate ? String(vendorRate.quoted_rate) : "0"}')
text = text.replace('row.rate !== vendorRate?.rate', 'row.rate !== vendorRate?.quoted_rate')
text = text.replace('r.vendorRate?.rate ?? ""', 'r.vendorRate?.quoted_rate ?? ""')
p.write_text(text)

# -------------------------------------------------------------------------
# Rate Finder'''
if procurement_marker not in text:
    raise SystemExit("Expected Procurement transformer tail not found")
text = text.replace(procurement_marker, procurement_replacement, 1)

path.write_text(text)
print("Vendor consumer transformer markers corrected.")
