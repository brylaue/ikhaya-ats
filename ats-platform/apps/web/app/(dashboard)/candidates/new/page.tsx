"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import { useCandidates, useCompanies } from "@/lib/supabase/hooks";
import { toast } from "sonner";

const SOURCE_OPTIONS = [
  { value: "linkedin",   label: "LinkedIn" },
  { value: "referral",   label: "Referral" },
  { value: "inbound",    label: "Inbound / Applied" },
  { value: "headhunted", label: "Headhunted" },
  { value: "database",   label: "Database" },
  { value: "other",      label: "Other" },
];

export default function NewCandidatePage() {
  const { addCandidate } = useCandidates();
  const { companies }    = useCompanies();
  const router           = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  // Core fields
  const [firstName,    setFirstName]    = useState("");
  const [lastName,     setLastName]     = useState("");
  const [email,        setEmail]        = useState("");
  const [phone,        setPhone]        = useState("");
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentCompany, setCurrentCompany] = useState("");
  const [location,     setLocation]     = useState("");
  const [linkedinUrl,  setLinkedinUrl]  = useState("");
  const [source,       setSource]       = useState("");

  // Skills — managed as an array with an add-chip UI
  const [skills,       setSkills]       = useState<string[]>([]);
  const [skillInput,   setSkillInput]   = useState("");

  function addSkill() {
    const s = skillInput.trim();
    if (s && !skills.includes(s)) {
      setSkills((prev) => [...prev, s]);
    }
    setSkillInput("");
  }

  function removeSkill(skill: string) {
    setSkills((prev) => prev.filter((s) => s !== skill));
  }

  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("First and last name are required");
      return;
    }

    setIsLoading(true);
    try {
      const candidate = await addCandidate({
        firstName:      firstName.trim(),
        lastName:       lastName.trim(),
        email:          email.trim(),
        phone:          phone.trim() || undefined,
        currentTitle:   currentTitle.trim() || undefined,
        currentCompany: currentCompany.trim() || undefined,
        location:       location.trim() || undefined,
        linkedinUrl:    linkedinUrl.trim() || undefined,
        source:         source || undefined,
        skills:         skills.length > 0 ? skills : undefined,
      });

      if (candidate) {
        toast.success(`${candidate.firstName} ${candidate.lastName} added`);
        router.push(`/candidates/${candidate.id}`);
      } else {
        toast.error("Failed to create candidate");
      }
    } catch {
      toast.error("Failed to create candidate");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="space-y-6 p-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/candidates" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            ← Back to Candidates
          </Link>
          <h1 className="text-3xl font-bold text-foreground">Add Candidate</h1>
        </div>

        <div className="max-w-2xl bg-card rounded-lg border border-border p-8 space-y-8">

          {/* Name row */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-4">Basic Info</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Smith"
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 415 555 0100"
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>

          {/* Current role */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-4">Current Position</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Title</label>
                <input
                  type="text"
                  value={currentTitle}
                  onChange={(e) => setCurrentTitle(e.target.value)}
                  placeholder="e.g., VP of Engineering"
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Company</label>
                <input
                  type="text"
                  value={currentCompany}
                  onChange={(e) => setCurrentCompany(e.target.value)}
                  placeholder="e.g., Acme Corp"
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>
            </div>
          </div>

          {/* Location + LinkedIn */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., San Francisco, CA"
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">LinkedIn URL</label>
              <input
                type="url"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="https://linkedin.com/in/janesmith"
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>

          {/* Source */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              <option value="">Select source…</option>
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Skills */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Skills</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addSkill();
                  }
                }}
                placeholder="Type a skill and press Enter"
                className="flex-1 px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
              <button
                type="button"
                onClick={addSkill}
                className="px-4 py-2 bg-muted text-foreground rounded-md text-sm font-medium hover:bg-muted transition-colors"
              >
                Add
              </button>
            </div>
            {skills.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700"
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() => removeSkill(skill)}
                      className="text-brand-400 hover:text-brand-700 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 border-t border-border pt-6">
            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="px-6 py-2 bg-brand-600 text-white rounded-md text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {isLoading ? "Adding…" : "Add Candidate"}
            </button>
            <Link
              href="/candidates"
              className="px-6 py-2 text-muted-foreground text-sm font-medium hover:text-foreground"
            >
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
