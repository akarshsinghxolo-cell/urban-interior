from pathlib import Path

path = Path('src/components/rdash/modules/DataImportModule.tsx')
text = path.read_text()

# The main patch removes the two import defaults already. Keep these removals
# idempotent so the finalizer can run after that patch without assuming they remain.
for old in [
    '                    customer_segments: ["service_customer"],\n',
    '                            customer_segments: ["service_customer"],\n',
]:
    text = text.replace(old, '')

old_metric = 'db.customers.filter((customer) => customer.customer_segments.includes("service_customer")).length'
if text.count(old_metric) != 1:
    raise SystemExit(f'DataImportModule.tsx: expected one role-based Existing customers metric, found {text.count(old_metric)}')
text = text.replace(old_metric, 'db.customers.length', 1)
path.write_text(text)

banned = [
    'customer_segments', 'CustomerSegment', 'DEFAULT_CUSTOMER_SEGMENTS', 'CUSTOMER_SEGMENTS',
    '"walk_in"', '"service_customer"', '"product_buyer"', '"repeat_customer"', '"trade_customer"',
    '>Customer roles<',
]
violations = []
for source in Path('src').rglob('*'):
    if source.suffix not in {'.ts', '.tsx'}:
        continue
    body = source.read_text()
    for token in banned:
        if token in body:
            violations.append(f'{source}: {token}')
if violations:
    raise SystemExit('Active Customer Roles leftovers after Data Import cleanup:\n' + '\n'.join(violations))

print('Data Import and active source Customer Roles cleanup verified.')
