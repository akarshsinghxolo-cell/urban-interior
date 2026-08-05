# Managed Google Drive access policy

Urban Castle deliberately keeps large file bytes off Vercel. Managed uploads use Google Drive resumable sessions and the browser transfers the file directly to Google. Preview, thumbnail, open, and download routes authorize the Urban Castle user first and then redirect the browser to Google so Google serves the bytes.

## Current sharing model

After a managed upload is verified and moved to its canonical Drive folder, Urban Castle creates this Google Drive permission:

```json
{
  "type": "anyone",
  "role": "reader",
  "allowFileDiscovery": false
}
```

This means the file is not intended to be searchable/discoverable, but **anyone who obtains the Google Drive URL can read it without an Urban Castle session**. Urban Castle authorization controls whether the application reveals/redirects to the managed file; it cannot revoke a copied Google URL while the Drive permission remains `anyone:reader`.

## Appropriate content

This model is appropriate for low-sensitivity, operationally shareable material such as catalogues, product images, site photos intended for sharing, and drawings that are already meant to be link-shareable.

Do not treat the current Drive sharing model as strong confidentiality for identity documents, private contracts, confidential financial records, sensitive customer documents, or any material whose access must stop immediately when Urban Castle permissions change.

## Reliability and cost boundary

- OAuth refresh tokens stay server-side and are encrypted before persistence.
- Google access tokens are short-lived and refreshed server-side.
- Resumable upload session URLs are temporary capabilities persisted only with the local upload job/server upload state.
- File bytes upload directly browser → Google Drive.
- Preview, thumbnail, open, and download bytes flow Google Drive → browser after an Urban Castle authorization/redirect step.
- Vercel must not proxy file bodies.

## Future private-storage path

If strong per-request confidentiality becomes mandatory, keep the same Urban Castle authorization model but move those sensitive objects to storage that supports short-lived signed GET/PUT URLs. Do not reintroduce Vercel as the file-byte proxy simply to make Drive files private.
