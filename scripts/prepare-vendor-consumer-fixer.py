from pathlib import Path

path = Path("scripts/fix-vendor-consumers.py")
text = path.read_text()

old_ratefinder = '''replace_all("src/components/rdash/modules/RateFinderModule.tsx", [
    ("rate.rawUnitId", "rate.rateUnit"),
    ("rate.vendorRateId", "rate.sourceId"),
    ("rate.rawRate", "rate.quotedRate"),
])'''
new_ratefinder = '''replace_all("src/components/rdash/modules/RateFinderModule.tsx", [
    ("selected.rawUnitId", "selected.rateUnit"),
    ("selected.vendorRateId", "selected.sourceId"),
    ("selected.rawRate", "selected.quotedRate"),
])'''
if old_ratefinder not in text:
    raise SystemExit("Expected RateFinder transformer block not found")
text = text.replace(old_ratefinder, new_ratefinder, 1)

# The Procurement transformer already has a stable final current-rate replacement
# immediately before it writes the file. Extend that exact block with the two
# last VendorRate reads TypeScript exposed.
old_procurement_tail = '''text = text.replace('placeholder={vendorRate ? String(vendorRate.rate) : "0"}', 'placeholder={vendorRate ? String(vendorRate.quoted_rate) : "0"}')
p.write_text(text)'''
new_procurement_tail = '''text = text.replace('placeholder={vendorRate ? String(vendorRate.rate) : "0"}', 'placeholder={vendorRate ? String(vendorRate.quoted_rate) : "0"}')
text = text.replace('row.rate !== vendorRate?.rate', 'row.rate !== vendorRate?.quoted_rate')
text = text.replace('r.vendorRate?.rate ?? ""', 'r.vendorRate?.quoted_rate ?? ""')
p.write_text(text)'''
if old_procurement_tail not in text:
    raise SystemExit("Expected Procurement transformer tail not found")
text = text.replace(old_procurement_tail, new_procurement_tail, 1)

path.write_text(text)
print("Vendor consumer transformer markers corrected.")
