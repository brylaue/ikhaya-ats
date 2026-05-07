"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X, Printer, Download, Loader2, FileText,
  MapPin, Mail, Phone, Globe, Briefcase, GraduationCap,
  Tag, ChevronDown, Check,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResumeCandidate {
  id:               string;
  firstName:        string;
  lastName:         string;
  email?:           string;
  phone?:           string;
  location?:        string;
  currentTitle?:    string;
  currentCompany?:  string;
  linkedinUrl?:     string;
  summary?:         string;
  skills?:          string[];
  yearsExperience?: number;
}

interface AgencyBrand {
  name:       string;
  logoUrl:    string | null;
  brandColor: string;
  website?:   string;
}

type Template = "classic" | "modern" | "minimal";

const TEMPLATES: { id: Template; label: string }[] = [
  { id: "classic", label: "Classic"  },
  { id: "modern",  label: "Modern"   },
  { id: "minimal", label: "Minimal"  },
];

// ─── Branding hook ────────────────────────────────────────────────────────────

function useAgencyBrand(): { brand: AgencyBrand | null; loading: boolean } {
  const [brand, setBrand]   = useState<AgencyBrand | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data: userRow } = await supabase
        .from("users")
        .select("agency_id")
        .eq("id", user.id)
        .single();
      if (!userRow?.agency_id) { setLoading(false); return; }
      const { data: agency } = await supabase
        .from("agencies")
        .select("name, logo_url, brand_color, website")
        .eq("id", userRow.agency_id)
        .single();
      if (agency) {
        setBrand({
          name:       agency.name ?? "Your Agency",
          logoUrl:    agency.logo_url ?? null,
          brandColor: agency.brand_color ?? "#5461f5",
          website:    agency.website ?? undefined,
        });
      }
      setLoading(false);
    })();
  }, []);

  return { brand, loading };
}

// ─── Template renderers ───────────────────────────────────────────────────────

interface TemplateProps {
  candidate: ResumeCandidate;
  brand:     AgencyBrand;
  jobTitle?: string;
  jobClient?: string;
  note?:     string;
}

function ClassicTemplate({ candidate, brand, jobTitle, jobClient, note }: TemplateProps) {
  const color = brand.brandColor;
  return (
    <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 12, lineHeight: 1.5, color: "#1a1a1a", maxWidth: 740 }}>
      {/* Agency header */}
      <div style={{ borderBottom: `3px solid ${color}`, paddingBottom: 10, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {brand.logoUrl && <img src={brand.logoUrl} alt={brand.name} style={{ height: 36, objectFit: "contain" }} />}
          <span style={{ fontFamily: "Arial, sans-serif", fontSize: 14, fontWeight: 700, color }}>{brand.name}</span>
        </div>
        <div style={{ textAlign: "right", fontSize: 10, color: "#666", fontFamily: "Arial, sans-serif" }}>
          <p>Candidate Submission</p>
          {jobTitle  && <p>Role: {jobTitle}</p>}
          {jobClient && <p>Client: {jobClient}</p>}
        </div>
      </div>

      {/* Candidate name + title */}
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontFamily: "Arial, sans-serif", fontSize: 22, fontWeight: 700, margin: 0, color: "#1a1a1a" }}>
          {candidate.firstName} {candidate.lastName}
        </h1>
        {candidate.currentTitle && (
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#444" }}>{candidate.currentTitle}{candidate.currentCompany ? ` · ${candidate.currentCompany}` : ""}</p>
        )}
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap" as const, gap: 12, fontSize: 11, color: "#555", fontFamily: "Arial, sans-serif" }}>
          {candidate.email    && <span>✉ {candidate.email}</span>}
          {candidate.phone    && <span>✆ {candidate.phone}</span>}
          {candidate.location && <span>◎ {candidate.location}</span>}
        </div>
      </div>

      {/* Summary */}
      {candidate.summary && (
        <div style={{ marginBottom: 14 }}>
          <h2 style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 700, color, borderBottom: `1px solid ${color}`, paddingBottom: 3, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: 1 }}>
            Professional Summary
          </h2>
          <p style={{ margin: 0, fontSize: 12 }}>{candidate.summary}</p>
        </div>
      )}

      {/* Skills */}
      {candidate.skills && candidate.skills.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <h2 style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 700, color, borderBottom: `1px solid ${color}`, paddingBottom: 3, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: 1 }}>
            Key Skills
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
            {candidate.skills.map((s) => (
              <span key={s} style={{ background: `${color}18`, color, fontFamily: "Arial, sans-serif", fontSize: 10, fontWeight: 600, borderRadius: 4, padding: "2px 8px" }}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recruiter note */}
      {note && (
        <div style={{ marginTop: 20, borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
          <h2 style={{ fontFamily: "Arial, sans-serif", fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: 1 }}>
            Recruiter Note
          </h2>
          <p style={{ margin: 0, fontSize: 11, color: "#444", fontStyle: "italic" }}>{note}</p>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 30, borderTop: `1px solid ${color}`, paddingTop: 8, display: "flex", justifyContent: "space-between", fontFamily: "Arial, sans-serif", fontSize: 9, color: "#999" }}>
        <span>Submitted by {brand.name}{brand.website ? ` · ${brand.website}` : ""}</span>
        <span>Confidential — for client review only</span>
      </div>
    </div>
  );
}

function ModernTemplate({ candidate, brand, jobTitle, jobClient, note }: TemplateProps) {
  const color = brand.brandColor;
  return (
    <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, lineHeight: 1.55, color: "#1a1a1a", maxWidth: 740 }}>
      {/* Bold color header */}
      <div style={{ background: color, color: "#fff", padding: "20px 24px", borderRadius: "6px 6px 0 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{candidate.firstName} {candidate.lastName}</h1>
          {candidate.currentTitle && <p style={{ margin: "4px 0 0", opacity: 0.85, fontSize: 13 }}>{candidate.currentTitle}{candidate.currentCompany ? ` — ${candidate.currentCompany}` : ""}</p>}
          <div style={{ marginTop: 8, display: "flex", gap: 14, fontSize: 10, opacity: 0.9 }}>
            {candidate.email    && <span>✉ {candidate.email}</span>}
            {candidate.phone    && <span>✆ {candidate.phone}</span>}
            {candidate.location && <span>◎ {candidate.location}</span>}
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: 10, opacity: 0.8 }}>
          {brand.logoUrl && <img src={brand.logoUrl} alt={brand.name} style={{ height: 30, objectFit: "contain", filter: "brightness(0) invert(1)", marginBottom: 4 }} />}
          <p style={{ margin: 0 }}>{brand.name}</p>
          {jobTitle  && <p style={{ margin: "2px 0 0" }}>Role: {jobTitle}</p>}
          {jobClient && <p style={{ margin: "2px 0 0" }}>Client: {jobClient}</p>}
        </div>
      </div>

      <div style={{ padding: "18px 24px", border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 6px 6px" }}>
        {candidate.summary && (
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 1.5, color: "#888", marginBottom: 6 }}>Summary</h2>
            <p style={{ margin: 0 }}>{candidate.summary}</p>
          </div>
        )}

        {candidate.skills && candidate.skills.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 1.5, color: "#888", marginBottom: 8 }}>Skills</h2>
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5 }}>
              {candidate.skills.map((s) => (
                <span key={s} style={{ background: "#f3f4f6", fontSize: 10, fontWeight: 600, borderRadius: 20, padding: "3px 10px", color: "#374151" }}>{s}</span>
              ))}
            </div>
          </div>
        )}

        {note && (
          <div style={{ background: `${color}0d`, borderLeft: `3px solid ${color}`, padding: "10px 14px", borderRadius: "0 4px 4px 0" }}>
            <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color }}>Recruiter Note</p>
            <p style={{ margin: 0, fontSize: 11, color: "#444" }}>{note}</p>
          </div>
        )}

        <div style={{ marginTop: 20, fontSize: 9, color: "#aaa", display: "flex", justifyContent: "space-between", borderTop: "1px solid #f3f4f6", paddingTop: 8 }}>
          <span>Submitted by {brand.name}</span>
          <span>Confidential · Client review only</span>
        </div>
      </div>
    </div>
  );
}

function MinimalTemplate({ candidate, brand, jobTitle, jobClient, note }: TemplateProps) {
  return (
    <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, lineHeight: 1.6, color: "#1a1a1a", maxWidth: 740 }}>
      {/* Clean top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #e5e7eb" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#999", letterSpacing: 1.5, textTransform: "uppercase" as const }}>
          {brand.name} · Candidate Submission
        </span>
        <span style={{ fontSize: 10, color: "#aaa" }}>
          {jobTitle && `${jobTitle}`}{jobClient && ` · ${jobClient}`}
        </span>
      </div>

      <h1 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>{candidate.firstName} {candidate.lastName}</h1>
      {candidate.currentTitle && <p style={{ margin: "0 0 10px", color: "#555" }}>{candidate.currentTitle}{candidate.currentCompany ? `, ${candidate.currentCompany}` : ""}</p>}

      <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#555", marginBottom: 18 }}>
        {candidate.email    && <span>{candidate.email}</span>}
        {candidate.phone    && <span>{candidate.phone}</span>}
        {candidate.location && <span>{candidate.location}</span>}
      </div>

      {candidate.summary && <p style={{ margin: "0 0 18px", color: "#333" }}>{candidate.summary}</p>}

      {candidate.skills && candidate.skills.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 1.5, color: "#999" }}>Skills</p>
          <p style={{ margin: 0, color: "#333" }}>{candidate.skills.join(" · ")}</p>
        </div>
      )}

      {note && (
        <div style={{ marginTop: 18, padding: "10px 0", borderTop: "1px solid #e5e7eb" }}>
          <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 1.5, color: "#999" }}>Recruiter Note</p>
          <p style={{ margin: 0, fontStyle: "italic", color: "#444" }}>{note}</p>
        </div>
      )}

      <div style={{ marginTop: 24, borderTop: "1px solid #e5e7eb", paddingTop: 8, fontSize: 9, color: "#bbb", display: "flex", justifyContent: "space-between" }}>
        <span>{brand.name}{brand.website ? ` · ${brand.website}` : ""}</span>
        <span>Confidential</span>
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface BrandedResumeModalProps {
  candidate:  ResumeCandidate;
  jobTitle?:  string;
  jobClient?: string;
  onClose:    () => void;
}

export function BrandedResumeModal({ candidate, jobTitle, jobClient, onClose }: BrandedResumeModalProps) {
  const { brand, loading } = useAgencyBrand();
  const [template, setTemplate] = useState<Template>("classic");
  const [note, setNote]         = useState("");
  const [printing, setPrinting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useCallback(() => {
    if (!printRef.current || !brand) return;
    setPrinting(true);

    // US-368: Build the print window via DOM APIs instead of document.write().
    // document.write replaces the document and is a classic DOM-XSS sink;
    // textContent/appendChild sanitize-by-default. The body HTML itself is
    // React-generated so it's already escaped — we deep-clone the node to
    // preserve inline styles and computed layout.
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) { setPrinting(false); return; }

    const printTitle = `${candidate.firstName} ${candidate.lastName} — ${brand.name} Submission`;

    // Replace any existing content with a fresh <html> tree
    const doc = win.document;
    doc.open();
    doc.close(); // gives us a clean blank document to build into
    doc.documentElement.innerHTML = ""; // clear <html>

    const head = doc.createElement("head");
    const titleEl = doc.createElement("title");
    titleEl.textContent = printTitle; // safe — no HTML parsing
    head.appendChild(titleEl);

    const style = doc.createElement("style");
    style.textContent = `
      body { margin: 0; padding: 32px; background: #fff; }
      @page { size: A4; margin: 20mm; }
      @media print { body { padding: 0; } }
    `;
    head.appendChild(style);

    const body = doc.createElement("body");
    // Deep-clone the live React-rendered resume node — attributes & styles survive
    body.appendChild(printRef.current.cloneNode(true));

    doc.documentElement.appendChild(head);
    doc.documentElement.appendChild(body);

    win.onload = () => {
      win.focus();
      win.print();
      win.close();
      setPrinting(false);
    };
    // Some browsers skip the onload for blank-doc writes — kick print on next tick as a fallback
    setTimeout(() => {
      if (!win.closed) {
        try { win.focus(); win.print(); win.close(); } catch {}
        setPrinting(false);
      }
    }, 500);
  }, [brand, candidate]);

  const brandFallback: AgencyBrand = {
    name:       "Your Agency",
    logoUrl:    null,
    brandColor: "#5461f5",
  };

  const activeBrand = brand ?? brandFallback;

  const templateProps: TemplateProps = { candidate, brand: activeBrand, jobTitle, jobClient, note: note || undefined };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch bg-black/60" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ml-auto flex h-full w-full max-w-5xl flex-col bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-brand-600" />
            <div>
              <h2 className="text-base font-semibold text-foreground">Branded Submission Pack</h2>
              <p className="text-xs text-muted-foreground">{candidate.firstName} {candidate.lastName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={printing || loading}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              Print / Save PDF
            </button>
            <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 shrink-0 border-r border-border bg-muted/30 p-4 space-y-4 overflow-y-auto">
            {/* Template picker */}
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">Template</p>
              <div className="space-y-1.5">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTemplate(t.id)}
                    className={cn(
                      "w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      template === t.id ? "bg-brand-600 text-white" : "text-foreground hover:bg-accent"
                    )}
                  >
                    {t.label}
                    {template === t.id && <Check className="h-3.5 w-3.5" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Recruiter note */}
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">Recruiter Note</p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note for the client about why this candidate is a strong fit…"
                rows={5}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              />
            </div>

            {/* Info */}
            <div className="rounded-lg border border-border bg-card p-3 space-y-1.5 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Candidate info included</p>
              <div className="space-y-1">
                {candidate.email       && <p className="flex items-center gap-1.5"><Mail className="h-3 w-3" />{candidate.email}</p>}
                {candidate.phone       && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{candidate.phone}</p>}
                {candidate.location    && <p className="flex items-center gap-1.5"><MapPin className="h-3 w-3" />{candidate.location}</p>}
                {candidate.currentTitle && <p className="flex items-center gap-1.5"><Briefcase className="h-3 w-3" />{candidate.currentTitle}</p>}
                {candidate.skills && candidate.skills.length > 0 && (
                  <p className="flex items-center gap-1.5"><Tag className="h-3 w-3" />{candidate.skills.length} skills</p>
                )}
              </div>
            </div>

            {/* Brand info */}
            {brand && (
              <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground mb-1">Agency branding</p>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ background: brand.brandColor }} />
                  <span>{brand.name}</span>
                </div>
                {brand.logoUrl && <p className="mt-1 text-emerald-600">✓ Logo attached</p>}
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="flex-1 overflow-y-auto bg-muted/20 p-6">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="mx-auto max-w-[740px] rounded-xl bg-white shadow-lg overflow-hidden">
                <div className="p-8" ref={printRef}>
                  {template === "classic" && <ClassicTemplate {...templateProps} />}
                  {template === "modern"  && <ModernTemplate  {...templateProps} />}
                  {template === "minimal" && <MinimalTemplate  {...templateProps} />}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
