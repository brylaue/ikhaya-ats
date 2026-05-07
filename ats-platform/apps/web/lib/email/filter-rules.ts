/**
 * US-053: Email rule matching engine.
 *
 * Used by Gmail + Microsoft Graph ingestion to decide what to do with an
 * incoming message. Rules are ordered by priority (ASC); first match wins.
 * Personal rules override agency rules at the same priority (because personal
 * rules are filtered to the user; agency rules have user_id=NULL).
 */

export type RuleAction = "ignore" | "log" | "log_with_tag";

export interface FilterRule {
  id: string;
  agency_id: string;
  user_id: string | null;
  priority: number;
  enabled: boolean;
  match: {
    sender?: string;          // exact or *@domain.com glob
    recipient?: string;
    domain?: string;          // matches either sender or recipient domain
    subject_regex?: string;   // full regex, user-provided
  };
  action: RuleAction;
  tag: string | null;
}

export interface IncomingMessage {
  from_email: string;
  to_emails: string[];
  subject: string | null;
}

export interface RuleDecision {
  action: RuleAction;
  tag: string | null;
  matched_rule_id: string | null;
}

function matchGlob(pattern: string, value: string): boolean {
  if (!pattern) return false;
  if (pattern.startsWith("*@")) {
    return value.toLowerCase().endsWith(pattern.slice(1).toLowerCase());
  }
  return pattern.toLowerCase() === value.toLowerCase();
}

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at < 0 ? "" : email.slice(at + 1).toLowerCase();
}

export function evaluateRules(rules: FilterRule[], msg: IncomingMessage): RuleDecision {
  const sorted = [...rules]
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    const m = rule.match || {};
    let matched = true;

    if (m.sender && !matchGlob(m.sender, msg.from_email)) matched = false;
    if (matched && m.recipient) {
      matched = msg.to_emails.some((r) => matchGlob(m.recipient!, r));
    }
    if (matched && m.domain) {
      const d = m.domain.toLowerCase();
      const hasDomain = domainOf(msg.from_email) === d || msg.to_emails.some((r) => domainOf(r) === d);
      if (!hasDomain) matched = false;
    }
    if (matched && m.subject_regex) {
      try {
        const re = new RegExp(m.subject_regex, "i");
        if (!re.test(msg.subject ?? "")) matched = false;
      } catch {
        // Invalid regex on the rule — treat as non-matching, don't crash ingestion
        matched = false;
      }
    }

    if (matched) {
      return { action: rule.action, tag: rule.tag, matched_rule_id: rule.id };
    }
  }
  // Default: log with no tag
  return { action: "log", tag: null, matched_rule_id: null };
}
