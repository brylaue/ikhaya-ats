"use client";

import { useState, useRef, useCallback } from "react";
import {
  Upload, X, ChevronRight, ChevronLeft, Check, AlertCircle,
  FileText, Users, ArrowRight, RefreshCw, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCandidates } from "@/lib/supabase/hooks";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "upload" | "map" | "preview" | "done";

interface CsvRow {
  [key: string]: string;
}

interface FieldMapping {
  csvColumn: string | null;
  required: boolean;
}

interface MappedCandidate {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  title?: string;
  company?: string;
  location?: string;
  linkedin?: string;
  notes?: string;
  _raw: CsvRow;
  _valid: boolean;
  _errors: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SYSTEM_FIELDS: { key: keyof Omit<MappedCandidate, "_raw" | "_valid" | "_errors">; label: string; required: boolean }[] = [
  { key: "firstName",  label: "First Name",      required: true  },
  { key: "lastName",   label: "Last Name",        required: true  },
  { key: "email",      label: "Email",            required: true  },
  { key: "phone",      label: "Phone",            required: false },
  { key: "title",      label: "Current Title",    required: false },
  { key: "company",    label: "Current Company",  required: false },
  { key: "location",   label: "Location",         required: false },
  { key: "linkedin",   label: "LinkedIn URL",     required: false },
  { key: "notes",      label: "Notes",            required: false },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    // Basic CSV parse — handles quoted fields naively
    const values: string[] = [];
    let inQuote = false;
    let current = "";
    for (const ch of lines[i]) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { values.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    values.push(current.trim());

    const row: CsvRow = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });
    rows.push(row);
  }
  return { headers, rows };
}

function autoMap(csvHeaders: string[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  SYSTEM_FIELDS.forEach(({ key }) => { mapping[key] = null; });

  const ALIASES: Record<string, string[]> = {
    firstName:  ["first name", "first", "firstname", "given name", "givenname"],
    lastName:   ["last name",  "last",  "lastname",  "surname",    "family name"],
    email:      ["email", "email address", "e-mail"],
    phone:      ["phone", "phone number", "mobile", "cell", "telephone"],
    title:      ["title", "job title", "current title", "position", "role"],
    company:    ["company", "employer", "current company", "organization", "organisation"],
    location:   ["location", "city", "city, state", "address", "region"],
    linkedin:   ["linkedin", "linkedin url", "linkedin profile"],
    notes:      ["notes", "note", "comments", "bio", "summary"],
  };

  csvHeaders.forEach((header) => {
    const lower = header.toLowerCase();
    SYSTEM_FIELDS.forEach(({ key }) => {
      if (mapping[key] !== null) return; // already matched
      if ((ALIASES[key] ?? []).some((alias) => lower.includes(alias) || alias.includes(lower))) {
        mapping[key] = header;
      }
    });
  });

  return mapping;
}

function mapRows(rows: CsvRow[], mapping: Record<string, string | null>): MappedCandidate[] {
  return rows.map((row) => {
    const errors: string[] = [];
    const candidate: MappedCandidate = {
      firstName: mapping.firstName ? (row[mapping.firstName] ?? "") : "",
      lastName:  mapping.lastName  ? (row[mapping.lastName]  ?? "") : "",
      email:     mapping.email     ? (row[mapping.email]     ?? "") : "",
      phone:     mapping.phone     ? (row[mapping.phone]     ?? undefined) : undefined,
      title:     mapping.title     ? (row[mapping.title]     ?? undefined) : undefined,
      company:   mapping.company   ? (row[mapping.company]   ?? undefined) : undefined,
      location:  mapping.location  ? (row[mapping.location]  ?? undefined) : undefined,
      linkedin:  mapping.linkedin  ? (row[mapping.linkedin]  ?? undefined) : undefined,
      notes:     mapping.notes     ? (row[mapping.notes]     ?? undefined) : undefined,
      _raw:   row,
      _valid: true,
      _errors: [],
    };

    if (!candidate.firstName) errors.push("Missing first name");
    if (!candidate.lastName)  errors.push("Missing last name");
    if (!candidate.email)     errors.push("Missing email");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email)) errors.push("Invalid email");

    candidate._valid  = errors.length === 0;
    candidate._errors = errors;
    return candidate;
  });
}

const SAMPLE_CSV = `First Name,Last Name,Email,Phone,Title,Company,Location,LinkedIn
Jane,Smith,jane.smith@example.com,+1 555-0101,VP of Product,Acme Corp,San Francisco CA,https://linkedin.com/in/janesmith
Marcus,Johnson,m.johnson@example.com,+1 555-0102,Senior Engineer,TechCo,New York NY,https://linkedin.com/in/marcusjohnson
Priya,Patel,priya.patel@example.com,,Head of Design,Startup Inc,Austin TX,
`;

// ─── Step: Upload ─────────────────────────────────────────────────────────────

function UploadStep({
  onParsed,
}: {
  onParsed: (headers: string[], rows: CsvRow[]) => void;
}) {
  const [dragging, setDragging]   = useState(false);
  const [fileName, setFileName]   = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [rowCount, setRowCount]   = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function processFile(file: File) {
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      setError("Please upload a CSV file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCsv(text);
      if (headers.length === 0) { setError("Could not parse CSV — no headers found."); return; }
      setFileName(file.name);
      setRowCount(rows.length);
      setError(null);
      onParsed(headers, rows);
    };
    reader.readAsText(file);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []);

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "ikhaya-import-sample.csv";
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Upload your CSV</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Export from LinkedIn Recruiter, Bullhorn, or any spreadsheet. We'll help you map the columns.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors",
          dragging ? "border-brand-500 bg-brand-50" : "border-border hover:border-brand-300 hover:bg-accent/30"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const f = e.target.files?.[0];
            if (f) processFile(f);
          }}
        />
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100">
          <Upload className="h-6 w-6 text-brand-600" />
        </div>
        {fileName && rowCount !== null ? (
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">{fileName}</p>
            <p className="text-xs text-emerald-600 font-medium mt-0.5">{rowCount} rows detected ✓</p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">Drop your CSV here</p>
            <p className="text-xs text-muted-foreground">or click to browse</p>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* Download sample */}
      <button
        onClick={(e) => { e.stopPropagation(); downloadSample(); }}
        className="flex items-center gap-1.5 self-start text-xs text-brand-600 hover:underline"
      >
        <Download className="h-3.5 w-3.5" />Download sample CSV template
      </button>

      {/* Accepted sources note */}
      <div className="rounded-lg border border-border bg-accent/30 p-3">
        <p className="text-[11px] font-semibold text-foreground mb-1.5">Accepted export sources</p>
        <div className="flex flex-wrap gap-2">
          {["LinkedIn Recruiter", "Bullhorn", "Greenhouse", "Lever", "Google Sheets", "Excel"].map((s) => (
            <span key={s} className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground">{s}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Step: Map ────────────────────────────────────────────────────────────────

function MapStep({
  csvHeaders,
  mapping,
  onChange,
}: {
  csvHeaders: string[];
  mapping: Record<string, string | null>;
  onChange: (key: string, val: string | null) => void;
}) {
  const unmapped = csvHeaders.filter((h) => !Object.values(mapping).includes(h));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Map your columns</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          We've auto-matched what we can. Verify or adjust the mappings below.
        </p>
      </div>

      <div className="space-y-2">
        {SYSTEM_FIELDS.map(({ key, label, required }) => (
          <div key={key} className="flex items-center gap-3">
            <div className="w-36 shrink-0">
              <p className="text-xs font-medium text-foreground">{label}</p>
              {required && <p className="text-[10px] text-red-500">Required</p>}
            </div>
            <select
              value={mapping[key] ?? ""}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                onChange(key, e.target.value === "" ? null : e.target.value)
              }
              className={cn(
                "flex-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500",
                mapping[key] ? "border-emerald-300" : required ? "border-red-300" : "border-border"
              )}
            >
              <option value="">— Not mapped —</option>
              {csvHeaders.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            {mapping[key] ? (
              <Check className="h-4 w-4 text-emerald-500 shrink-0" />
            ) : (
              <div className="h-4 w-4 shrink-0" />
            )}
          </div>
        ))}
      </div>

      {unmapped.length > 0 && (
        <div className="rounded-lg border border-border bg-accent/30 p-3">
          <p className="text-[11px] font-semibold text-foreground mb-1">Unmapped columns</p>
          <p className="text-[10px] text-muted-foreground mb-2">These CSV columns won't be imported.</p>
          <div className="flex flex-wrap gap-1.5">
            {unmapped.map((h) => (
              <span key={h} className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground line-through">{h}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step: Preview ────────────────────────────────────────────────────────────

function PreviewStep({ candidates }: { candidates: MappedCandidate[] }) {
  const valid   = candidates.filter((c) => c._valid);
  const invalid = candidates.filter((c) => !c._valid);
  const [showInvalid, setShowInvalid] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Review before importing</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Check the data looks right. Invalid rows are shown separately.
        </p>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-lg font-bold text-foreground">{candidates.length}</p>
          <p className="text-[10px] text-muted-foreground">Total rows</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-center">
          <p className="text-lg font-bold text-emerald-700">{valid.length}</p>
          <p className="text-[10px] text-muted-foreground">Ready to import</p>
        </div>
        <div className={cn("rounded-lg border p-3 text-center", invalid.length > 0 ? "border-red-200 bg-red-50/50" : "border-border bg-card")}>
          <p className={cn("text-lg font-bold", invalid.length > 0 ? "text-red-600" : "text-foreground")}>{invalid.length}</p>
          <p className="text-[10px] text-muted-foreground">Skipped (errors)</p>
        </div>
      </div>

      {/* Valid candidates table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-accent/40">
            <tr>
              <th className="px-3 py-2 font-semibold text-foreground">Name</th>
              <th className="px-3 py-2 font-semibold text-foreground">Email</th>
              <th className="px-3 py-2 font-semibold text-foreground">Title</th>
              <th className="px-3 py-2 font-semibold text-foreground">Company</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {valid.slice(0, 8).map((c, i) => (
              <tr key={i} className="hover:bg-accent/20">
                <td className="px-3 py-2 font-medium text-foreground">{c.firstName} {c.lastName}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.email}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.title ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.company ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {valid.length > 8 && (
          <div className="border-t border-border px-3 py-2 text-center text-[10px] text-muted-foreground">
            + {valid.length - 8} more candidates
          </div>
        )}
      </div>

      {/* Invalid rows toggle */}
      {invalid.length > 0 && (
        <div>
          <button
            onClick={() => setShowInvalid((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:underline"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            {invalid.length} row{invalid.length !== 1 ? "s" : ""} will be skipped
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", showInvalid && "rotate-90")} />
          </button>

          {showInvalid && (
            <div className="mt-2 space-y-1">
              {invalid.slice(0, 5).map((c, i) => (
                <div key={i} className="rounded-lg border border-red-200 bg-red-50/50 px-3 py-2">
                  <p className="text-xs font-medium text-red-700">{c.firstName || c.email || `Row ${i + 1}`}</p>
                  <p className="text-[10px] text-red-600">{c._errors.join(", ")}</p>
                </div>
              ))}
              {invalid.length > 5 && (
                <p className="text-[10px] text-muted-foreground pl-1">and {invalid.length - 5} more…</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Step: Done ───────────────────────────────────────────────────────────────

function DoneStep({ imported }: { imported: number }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
        <Check className="h-8 w-8 text-emerald-600" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-foreground">Import complete! 🎉</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {imported} candidate{imported !== 1 ? "s" : ""} added to your database
        </p>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-2.5 text-sm font-medium text-emerald-700">
        <Users className="h-4 w-4" />
        View in Candidates
      </div>
    </div>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS: { id: Step; label: string }[] = [
  { id: "upload",  label: "Upload"  },
  { id: "map",     label: "Map"     },
  { id: "preview", label: "Preview" },
];

function StepIndicator({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, i) => (
        <div key={step.id} className="flex items-center">
          <div className="flex items-center gap-1.5">
            <div className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold",
              i < idx  ? "bg-emerald-500 text-white" :
              i === idx ? "bg-brand-600 text-white" :
                         "bg-muted text-muted-foreground"
            )}>
              {i < idx ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <span className={cn(
              "text-xs font-medium",
              i === idx ? "text-foreground" : "text-muted-foreground"
            )}>{step.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={cn("mx-2 h-px w-8", i < idx ? "bg-emerald-400" : "bg-border")} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface ImportModalProps {
  onClose: () => void;
}

export function CandidateImportModal({ onClose }: ImportModalProps) {
  const { bulkAddCandidates }         = useCandidates();
  const [step, setStep]               = useState<Step>("upload");
  const [csvHeaders, setCsvHeaders]   = useState<string[]>([]);
  const [csvRows, setCsvRows]         = useState<CsvRow[]>([]);
  const [mapping, setMapping]         = useState<Record<string, string | null>>({});
  const [candidates, setCandidates]   = useState<MappedCandidate[]>([]);
  const [importing, setImporting]     = useState(false);
  const [importedCount, setImported]  = useState(0);

  function handleParsed(headers: string[], rows: CsvRow[]) {
    setCsvHeaders(headers);
    setCsvRows(rows);
    setMapping(autoMap(headers));
  }

  function handleMapChange(key: string, val: string | null) {
    setMapping((prev) => ({ ...prev, [key]: val }));
  }

  function canAdvanceUpload() {
    return csvHeaders.length > 0 && csvRows.length > 0;
  }

  function canAdvanceMap() {
    const requiredFields = SYSTEM_FIELDS.filter((f) => f.required);
    return requiredFields.every((f) => mapping[f.key] !== null);
  }

  function handleNext() {
    if (step === "upload") {
      setStep("map");
    } else if (step === "map") {
      const mapped = mapRows(csvRows, mapping);
      setCandidates(mapped);
      setStep("preview");
    } else if (step === "preview") {
      handleImport();
    }
  }

  function handleBack() {
    if (step === "map")     setStep("upload");
    if (step === "preview") setStep("map");
  }

  async function handleImport() {
    setImporting(true);
    const valid = candidates.filter((c) => c._valid);
    try {
      const count = await bulkAddCandidates(
        valid.map((c) => ({
          firstName:      c.firstName,
          lastName:       c.lastName,
          email:          c.email,
          phone:          c.phone,
          currentTitle:   c.title,
          currentCompany: c.company,
          location:       c.location,
          linkedinUrl:    c.linkedin,
          source:         "import",
        }))
      );
      setImported(count);
      setStep("done");
      toast.success(`${count} candidate${count !== 1 ? "s" : ""} imported successfully`);
    } catch (err) {
      console.error(err);
      toast.error("Import failed — please try again");
    } finally {
      setImporting(false);
    }
  }

  const validCount = candidates.filter((c) => c._valid).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex w-full max-w-2xl flex-col rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100">
              <FileText className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Import Candidates</h2>
              <p className="text-[11px] text-muted-foreground">CSV / spreadsheet import</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step indicator */}
        {step !== "done" && (
          <div className="shrink-0 border-b border-border px-6 py-3">
            <StepIndicator current={step} />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === "upload"  && <UploadStep  onParsed={handleParsed} />}
          {step === "map"     && <MapStep     csvHeaders={csvHeaders} mapping={mapping} onChange={handleMapChange} />}
          {step === "preview" && <PreviewStep candidates={candidates} />}
          {step === "done"    && <DoneStep    imported={importedCount} />}
        </div>

        {/* Footer */}
        {step !== "done" && (
          <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-between">
            <button
              onClick={step === "upload" ? onClose : handleBack}
              className="flex items-center gap-1.5 rounded-md border border-border px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              {step === "upload" ? "Cancel" : <><ChevronLeft className="h-3.5 w-3.5" />Back</>}
            </button>

            <div className="flex items-center gap-3">
              {step === "preview" && candidates.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {validCount} of {candidates.length} rows valid
                </p>
              )}
              <button
                onClick={handleNext}
                disabled={
                  (step === "upload"  && !canAdvanceUpload()) ||
                  (step === "map"     && !canAdvanceMap()) ||
                  (step === "preview" && validCount === 0) ||
                  importing
                }
                className="flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? (
                  <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Importing…</>
                ) : step === "preview" ? (
                  <><Upload className="h-3.5 w-3.5" />Import {validCount} Candidates</>
                ) : (
                  <>Next<ArrowRight className="h-3.5 w-3.5" /></>
                )}
              </button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="shrink-0 border-t border-border px-6 py-4 flex justify-center">
            <button
              onClick={onClose}
              className="rounded-md bg-brand-600 px-6 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
