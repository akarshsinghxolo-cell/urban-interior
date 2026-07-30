from pathlib import Path

path = Path("src/components/rdash/CustomerSitesDialog.tsx")
text = path.read_text()
old_import = 'import { reserveEntityId } from "@/lib/uploads/upload-types";\n'
new_import = 'import { reserveEntityId, type UploadBatchId } from "@/lib/uploads/upload-types";\n'
if text.count(old_import) != 1:
    raise SystemExit("Upload type import anchor not found exactly once")
text = text.replace(old_import, new_import, 1)
old_type = '  registerBatch: (batchId: string) => void;\n'
new_type = '  registerBatch: (batchId: UploadBatchId) => UploadBatchId;\n'
if text.count(old_type) != 1:
    raise SystemExit("registerBatch type anchor not found exactly once")
text = text.replace(old_type, new_type, 1)
path.write_text(text)
