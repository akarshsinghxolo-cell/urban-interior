import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | Urban Castle",
  description: "How Urban Castle accesses, uses, stores, and shares user and Google Drive data.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      summary="This policy explains what information Urban Castle handles, why it is needed, and the choices available to users."
    >
      <section>
        <h2>1. Information we handle</h2>
        <p>Urban Castle may handle account and profile details, customer and project records entered into the workspace, technical and security logs, and files that authorized users choose to manage through the service.</p>
        <p>When a workspace owner connects Google Drive, Urban Castle requests the <code>drive.file</code> permission. This permits the app to create and manage files that it creates or that a user explicitly opens or shares with the app. Urban Castle may store the connected Google account identifier, authorization tokens, Drive file identifiers, names, metadata, and the content of files that users intentionally upload or manage.</p>
      </section>

      <section>
        <h2>2. How information is used</h2>
        <ul>
          <li>To authenticate users and provide the requested workspace features.</li>
          <li>To create, upload, organize, retrieve, download, and manage selected project files in a connected Google Drive.</li>
          <li>To operate customer, quotation, site, procurement, finance, and project-delivery workflows.</li>
          <li>To secure the service, prevent abuse, diagnose failures, and provide support.</li>
        </ul>
      </section>

      <section>
        <h2>3. Google user data</h2>
        <p>Urban Castle uses Google user data only to provide or improve the Drive features visible to the user. It does not sell Google user data, use it for advertising, or transfer it to data brokers.</p>
        <p>Urban Castle&apos;s use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including its Limited Use requirements.</p>
      </section>

      <section>
        <h2>4. Sharing and service providers</h2>
        <p>Information may be processed by hosting, database, security, and storage providers only as needed to operate Urban Castle. Google processes Drive data under the user&apos;s Google agreement. Information may also be disclosed when required by law or to protect users or the service. A transfer of Google user data as part of a business transfer requires the user&apos;s explicit prior consent.</p>
        <p>Authorized workspace members can access project files according to their permissions. Uploaded Drive files currently receive “Anyone with the link” reader access: a person who obtains a file&apos;s Google link can view it without signing in to Urban Castle. Do not upload confidential information unless this sharing setting is appropriate. The Drive account owner can review and change sharing permissions in Google Drive.</p>
      </section>

      <section>
        <h2>5. Storage, security, and retention</h2>
        <p>Urban Castle uses reasonable technical and organizational safeguards. OAuth credentials and authorization tokens are treated as confidential. No system is completely secure, so absolute security cannot be guaranteed.</p>
        <p>Information is retained only while needed to provide the service, meet legal obligations, resolve disputes, and protect the service. Project files stored in Google Drive remain subject to the connected account&apos;s settings and retention controls.</p>
      </section>

      <section>
        <h2>6. Your choices</h2>
        <p>Users may stop using the service, ask the workspace owner to correct, export, or delete workspace records, disable a Drive account as an upload destination in Urban Castle, or revoke Urban Castle&apos;s access from their <a href="https://myaccount.google.com/permissions">Google Account permissions</a>. Disabling uploads does not revoke Google authorization. Revoking access stops future authorized Google Drive access but does not automatically delete records, files, or public sharing links already created. To restrict an existing file link, change that file&apos;s sharing permissions in Google Drive.</p>
      </section>

      <section>
        <h2>7. Changes and contact</h2>
        <p>This policy may be updated when the service or legal requirements change. Material changes will be posted here with a new effective date.</p>
        <p>For privacy questions or data requests, contact Urban Castle at <a href="mailto:colorburstberger@gmail.com">colorburstberger@gmail.com</a>. Include the account and records concerned so we can verify the request and coordinate with the workspace owner.</p>
      </section>
    </LegalPage>
  );
}
