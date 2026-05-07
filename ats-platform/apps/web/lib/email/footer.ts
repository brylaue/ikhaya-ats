/**
 * CAN-SPAM compliant email footer (US-482)
 *
 * Every outbound marketing / sourcing email MUST include:
 *   1. A clear identification of the sender (legal agency name).
 *   2. A valid physical postal address.
 *   3. A conspicuous, unambiguous way to opt out (unsubscribe link).
 *
 * In addition, RFC 8058 (one-click) and RFC 2369 recommend:
 *   - `List-Unsubscribe: <mailto:...>, <https://.../unsubscribe/TOKEN>`
 *   - `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
 *
 * `buildFooter(...)` returns { html, text, headers } so the send adapter can
 * splice the footer into the body and attach the headers in one shot.
 */

import { unsubscribeUrl, mintUnsubscribeToken } from "./unsubscribe";

export interface AgencyFooterInfo {
  agencyId:     string;
  legalName:    string;
  mailingAddress: string;     // free-form multi-line (use \n as separator)
  supportEmail?: string;
}

export interface FooterBuildArgs {
  baseUrl:   string;          // e.g. https://app.ikhaya.io
  recipient: string;
  messageId?: string;
  agency:    AgencyFooterInfo;
}

export interface BuiltFooter {
  html:    string;
  text:    string;
  headers: Record<string, string>;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nl2br(s: string): string {
  return esc(s).replace(/\n/g, "<br>");
}

export function buildFooter(args: FooterBuildArgs): BuiltFooter {
  const payload = {
    agencyId:  args.agency.agencyId,
    email:     args.recipient,
    messageId: args.messageId,
  };
  const httpsUrl = unsubscribeUrl(args.baseUrl, payload);

  // mailto: variant enables one-tap unsubscribe in clients like iOS Mail.
  const mailtoAddr =
    args.agency.supportEmail ||
    `unsubscribe+${mintUnsubscribeToken(payload)}@${hostOf(args.baseUrl)}`;
  const mailtoUrl = `mailto:${mailtoAddr}?subject=unsubscribe`;

  const html = `
<hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0;">
<div style="color:#6b7280;font-size:12px;line-height:1.5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="margin-bottom:8px;">
    ${esc(args.agency.legalName)}<br>
    ${nl2br(args.agency.mailingAddress)}
  </div>
  <div>
    You're receiving this email because a recruiter at ${esc(args.agency.legalName)} contacted you directly.
    <a href="${esc(httpsUrl)}" style="color:#6366f1;text-decoration:underline;">Unsubscribe</a>
    to stop future emails from this recruiter.
  </div>
</div>`.trim();

  const text =
    `\n\n--\n${args.agency.legalName}\n${args.agency.mailingAddress}\n\n` +
    `You're receiving this email because a recruiter at ${args.agency.legalName} contacted you directly.\n` +
    `Unsubscribe: ${httpsUrl}\n`;

  const headers: Record<string, string> = {
    "List-Unsubscribe":      `<${mailtoUrl}>, <${httpsUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    "List-Id":               `<agency-${args.agency.agencyId}.${hostOf(args.baseUrl)}>`,
  };

  return { html, text, headers };
}

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return "localhost"; }
}

/**
 * Quick validator for the agency footer-info record — used in the settings UI
 * to tell the recruiter whether their agency is ready to send.
 */
export function validateFooterInfo(info: Partial<AgencyFooterInfo>): string[] {
  const errs: string[] = [];
  if (!info.legalName || info.legalName.trim().length < 2) {
    errs.push("Legal name is required (shown in the email footer).");
  }
  if (!info.mailingAddress || info.mailingAddress.trim().length < 10) {
    errs.push("A physical mailing address is required by CAN-SPAM.");
  }
  return errs;
}
