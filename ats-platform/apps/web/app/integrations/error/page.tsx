/**
 * /integrations/error
 *
 * Minimal error page for email integration failures such as
 * cross-tenant connection conflicts. Reads `?reason=` from the URL
 * and displays a human-readable explanation with a link back to settings.
 *
 * Stage 4 — Microsoft OAuth.
 */

import Link from "next/link";

const REASON_MESSAGES: Record<string, { title: string; message: string }> = {
  "already-bound": {
    title: "Account already connected",
    message:
      "This email account is already linked to a different organisation in Ikhaya. " +
      "Each email account can only be connected to one organisation at a time. " +
      "Please disconnect it from the other organisation first, or use a different email account.",
  },
};

const DEFAULT_MESSAGE = {
  title: "Integration error",
  message: "Something went wrong while connecting your email account. Please try again.",
};

export default async function IntegrationErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const params = await searchParams;
  const reason = params.reason ?? "";
  const { title, message } = REASON_MESSAGES[reason] ?? DEFAULT_MESSAGE;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-8 shadow-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg
            className="h-6 w-6 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h1 className="mb-2 text-xl font-semibold text-foreground">{title}</h1>
        <p className="mb-6 text-sm text-muted-foreground">{message}</p>
        <Link
          href="/settings/integrations"
          className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
        >
          Back to Settings
        </Link>
      </div>
    </div>
  );
}
