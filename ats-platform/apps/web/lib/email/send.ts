export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  const { to, subject, html, text, from } = options;

  // In production, integrate with your transactional email provider (e.g. Resend, SendGrid, Postmark).
  // This stub logs to console in development and returns success.
  if (process.env.NODE_ENV === "development") {
    console.log("[email/send] Would send email:", { to, from, subject, text: text ?? html.replace(/<[^>]+>/g, "") });
    return { success: true };
  }

  // Resend integration example (uncomment and configure if using Resend):
  // const res = await fetch("https://api.resend.com/emails", {
  //   method: "POST",
  //   headers: {
  //     "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
  //     "Content-Type": "application/json",
  //   },
  //   body: JSON.stringify({
  //     from: from ?? `Ikhaya ATS <noreply@${process.env.EMAIL_SENDING_DOMAIN ?? "ikhaya.io"}>`,
  //     to,
  //     subject,
  //     html,
  //     text,
  //   }),
  // });
  // if (!res.ok) {
  //   const err = await res.text();
  //   return { success: false, error: err };
  // }
  // return { success: true };

  console.log("[email/send] Email send not configured for production. To:", to, "Subject:", subject);
  return { success: true };
}
