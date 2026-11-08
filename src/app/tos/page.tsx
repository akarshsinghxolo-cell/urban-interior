import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service | Urban Castle",
  description: "Terms governing access to and use of the Urban Castle business workspace.",
};

export default function TermsOfServicePage() {
  return (
    <LegalPage
      title="Terms of Service"
      summary="These terms govern access to and use of the Urban Castle business workspace and its Google Drive integration."
    >
      <section>
        <h2>1. Using Urban Castle</h2>
        <p>Urban Castle is a business workspace for authorized users to manage customers, quotations, site execution, procurement, finance, field activity, and project files. By using the service, you agree to these terms and the <a href="/privacy">Privacy Policy</a>.</p>
      </section>

      <section>
        <h2>2. Accounts and authorization</h2>
        <p>You must provide accurate information, protect your credentials, and use only accounts and data you are authorized to access. Workspace owners are responsible for granting and removing team access. You are responsible for activity performed through your account unless you promptly report unauthorized use.</p>
      </section>

      <section>
        <h2>3. Acceptable use</h2>
        <p>You may not misuse the service, bypass access controls, interfere with operation, upload unlawful or malicious content, violate another person&apos;s rights, or use Urban Castle or Google APIs in a deceptive, unauthorized, or illegal manner.</p>
      </section>

      <section>
        <h2>4. Your content</h2>
        <p>You retain ownership of content you submit or store. You grant Urban Castle only the limited permission needed to process that content and provide the requested features. You are responsible for having the rights and permissions needed for customer, employee, contractor, financial, and project information you enter.</p>
      </section>

      <section>
        <h2>5. Google Drive and third-party services</h2>
        <p>If you connect Google Drive, you authorize Urban Castle to create and manage files within the permission shown on Google&apos;s consent screen. Google services remain governed by Google&apos;s own terms and policies. Third-party service availability may affect Urban Castle features.</p>
      </section>

      <section>
        <h2>6. Availability and changes</h2>
        <p>The service may be changed, suspended, or discontinued for maintenance, security, legal, or operational reasons. We aim to keep it useful and available but do not promise uninterrupted or error-free operation. Important data should be reviewed and backed up as appropriate for your business.</p>
      </section>

      <section>
        <h2>7. Suspension and termination</h2>
        <p>Access may be suspended or ended for violation of these terms, security risk, legal requirements, or loss of authorization from the workspace owner. You may stop using the service at any time and may revoke Google access from your Google Account.</p>
      </section>

      <section>
        <h2>8. Disclaimers and responsibility</h2>
        <p>To the extent permitted by law, Urban Castle is provided on an “as is” and “as available” basis. Urban Castle is not liable for indirect, incidental, special, or consequential loss arising from use of the service. Nothing in these terms excludes rights or liability that cannot legally be excluded.</p>
      </section>

      <section>
        <h2>9. Changes and contact</h2>
        <p>These terms may be updated from time to time. Continued use after an updated version becomes effective means you accept the updated terms.</p>
        <p>Questions about these terms may be sent to <a href="mailto:colorburstberger@gmail.com">colorburstberger@gmail.com</a>.</p>
      </section>
    </LegalPage>
  );
}
