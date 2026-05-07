/**
 * Public unsubscribe landing page (US-473)
 *
 * Server component — verifies the token, writes to the suppression list, and
 * renders a confirmation. Does NOT require auth. Idempotent: revisiting the
 * URL after a successful unsubscribe simply re-confirms.
 */

import { redirect } from "next/navigation";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe";
import { addSuppression }          from "@/lib/email/suppression";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function UnsubscribePage({ params }: Props) {
  const { token } = await params;
  const payload = verifyUnsubscribeToken(decodeURIComponent(token));

  if (!payload) {
    return (
      <Shell title="Invalid unsubscribe link">
        <p className="text-gray-600">
          This unsubscribe link is invalid or corrupted. If you keep receiving
          emails you did not ask for, you can reply to the original email with
          the word <em>unsubscribe</em> and a human will remove you.
        </p>
      </Shell>
    );
  }

  try {
    await addSuppression({
      agencyId:  payload.agencyId,
      email:     payload.email,
      reason:    "unsubscribe",
      messageId: payload.messageId,
      source:    "footer_link",
    });
  } catch (err) {
    console.error("[unsubscribe] suppression write failed", err);
    return (
      <Shell title="Something went wrong">
        <p className="text-gray-600">
          We couldn't process your unsubscribe request right now. Please try the
          link again in a few minutes, or reply to the email with the word
          <em> unsubscribe</em>.
        </p>
      </Shell>
    );
  }

  return (
    <Shell title="You're unsubscribed">
      <p className="text-gray-600">
        <strong>{payload.email}</strong> will no longer receive outreach emails
        from this recruiter. It may take up to 24 hours for any emails already
        in flight to stop.
      </p>
      <p className="mt-4 text-sm text-gray-500">
        Changed your mind? Reply to the last email you received and ask to be
        added back.
      </p>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-xl shadow-sm p-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-4">{title}</h1>
        {children}
      </div>
    </main>
  );
}

// Silences unused import when we don't take the redirect branch.
void redirect;
