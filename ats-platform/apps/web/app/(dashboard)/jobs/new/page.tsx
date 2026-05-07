"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCompanies, useJobs } from "@/lib/supabase/hooks";
import Link from "next/link";
import { toast } from "sonner";
import type { JobType } from "@/types";
import { BiasCheckPanel } from "@/components/jobs/bias-check-panel";

// ─── URL param reader (must be in Suspense boundary) ─────────────────────────

function ClientPreloader({ onLoad }: { onLoad: (id: string) => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const id = searchParams.get("clientId");
    if (id) onLoad(id);
  }, [searchParams, onLoad]);
  return null;
}

export default function NewJobPage() {
  const { companies } = useCompanies();
  const { addJob } = useJobs();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  // Form state
  const [jobTitle, setJobTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [location, setLocation] = useState("");
  const [jobType, setJobType] = useState<JobType>("permanent");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [feeType, setFeeType] = useState("percentage");
  const [feeValue, setFeeValue] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [recruiterId, setRecruiterId] = useState("");
  const [description, setDescription] = useState("");
  const [stageTemplate, setStageTemplate] = useState("default");
  const [copyFromJobId, setCopyFromJobId] = useState("");

  const handleCreateJob = async () => {
    if (!jobTitle.trim() || !clientId) {
      toast.error("Please fill in required fields");
      return;
    }

    setIsLoading(true);
    try {
      const newJobId = await addJob({
        title: jobTitle.trim(),
        companyId: clientId || undefined,
        location: location.trim() || undefined,
        employmentType: jobType,
        salaryMin: salaryMin ? Number(salaryMin) : undefined,
        salaryMax: salaryMax ? Number(salaryMax) : undefined,
        feeType: feeType === "percentage" ? "contingency" : "flat_fee",
        feePct: feeValue ? Number(feeValue) : undefined,
        priority,
        description: description.trim() || undefined,
      });
      toast.success("Job created successfully");
      router.push(newJobId ? `/jobs/${newJobId}` : "/jobs");
    } catch (_error) {
      toast.error("Failed to create job");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveAsDraft = async () => {
    if (!jobTitle.trim()) {
      toast.error("Job title is required");
      return;
    }

    setIsLoading(true);
    try {
      const newJobId = await addJob({
        title: jobTitle.trim(),
        companyId: clientId || undefined,
        location: location.trim() || undefined,
        employmentType: jobType,
        salaryMin: salaryMin ? Number(salaryMin) : undefined,
        salaryMax: salaryMax ? Number(salaryMax) : undefined,
        feeType: feeType === "percentage" ? "contingency" : "flat_fee",
        feePct: feeValue ? Number(feeValue) : undefined,
        priority,
        description: description.trim() || undefined,
      });
      toast.success("Job saved as draft");
      router.push(newJobId ? `/jobs/${newJobId}` : "/jobs");
    } catch (_error) {
      toast.error("Failed to save draft");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      {/* Pre-select client from ?clientId= URL param */}
      <Suspense fallback={null}>
        <ClientPreloader onLoad={setClientId} />
      </Suspense>

      <div className="space-y-6 p-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/jobs" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            ← Back to Jobs
          </Link>
          <h1 className="text-3xl font-bold text-foreground">New Job Requisition</h1>
        </div>

        {/* Form Container */}
        <div className="max-w-2xl bg-card rounded-lg border border-border p-8 space-y-8">
          {/* Two-column grid */}
          <div className="grid grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Job Title */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Job Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g., VP of Engineering"
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </div>

              {/* Client */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Client <span className="text-red-500">*</span>
                </label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  <option value="">Select a client</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Location */}
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

              {/* Job Type */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Job Type</label>
                <select
                  value={jobType}
                  onChange={(e) => setJobType(e.target.value as JobType)}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  <option value="permanent">Permanent</option>
                  <option value="contract">Contract</option>
                  <option value="interim">Interim</option>
                  <option value="temp">Temp</option>
                </select>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Salary Min */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Salary Min</label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">$</span>
                  <input
                    type="number"
                    value={salaryMin}
                    onChange={(e) => setSalaryMin(e.target.value)}
                    placeholder="0"
                    className="flex-1 px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>

              {/* Salary Max */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Salary Max</label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">$</span>
                  <input
                    type="number"
                    value={salaryMax}
                    onChange={(e) => setSalaryMax(e.target.value)}
                    placeholder="0"
                    className="flex-1 px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>

              {/* Fee Type & Value */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Fee</label>
                <div className="flex gap-2">
                  <select
                    value={feeType}
                    onChange={(e) => setFeeType(e.target.value)}
                    className="flex-1 px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  >
                    <option value="percentage">% of salary</option>
                    <option value="flat">Flat fee</option>
                  </select>
                  <div className="flex items-center gap-2 flex-1">
                    {feeType === "percentage" && <span className="text-muted-foreground">%</span>}
                    {feeType === "flat" && <span className="text-muted-foreground">$</span>}
                    <input
                      type="number"
                      value={feeValue}
                      onChange={(e) => setFeeValue(e.target.value)}
                      placeholder="0"
                      className="flex-1 px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                    />
                  </div>
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high" | "urgent")}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  <option value="low">Low</option>
                  <option value="medium">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              {/* Recruiter */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Recruiter</label>
                <select
                  value={recruiterId}
                  onChange={(e) => setRecruiterId(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  <option value="">Select a recruiter</option>
                  {/* Populated from team members once multi-user is live */}
                  <option value="me">Me</option>
                </select>
              </div>
            </div>
          </div>

          {/* Job Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Job Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder="Enter job description..."
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
            />
            {/* US-483: Bias checker */}
            <div className="mt-2">
              <BiasCheckPanel text={description} />
            </div>
          </div>

          {/* Stage Template */}
          <div className="space-y-4 border-t border-border pt-6">
            <h3 className="text-sm font-semibold text-foreground">Stage Template</h3>
            <div className="space-y-3">
              <label className="flex items-start gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="radio"
                  name="template"
                  value="default"
                  checked={stageTemplate === "default"}
                  onChange={(e) => setStageTemplate(e.target.value)}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium text-foreground">Use agency default stages</p>
                  <p className="text-xs text-muted-foreground">Apply standard pipeline stages</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="radio"
                  name="template"
                  value="copy"
                  checked={stageTemplate === "copy"}
                  onChange={(e) => setStageTemplate(e.target.value)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <p className="font-medium text-foreground">Copy from existing job</p>
                  <p className="text-xs text-muted-foreground">Use stages from another job</p>
                  {stageTemplate === "copy" && (
                    <select
                      value={copyFromJobId}
                      onChange={(e) => setCopyFromJobId(e.target.value)}
                      className="w-full mt-2 px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                    >
                      <option value="">Select a job</option>
                      {/* Would populate with existing jobs */}
                    </select>
                  )}
                </div>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 border-t border-border pt-6">
            <button
              onClick={handleCreateJob}
              disabled={isLoading}
              className="px-6 py-2 bg-brand-600 text-white rounded-md text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {isLoading ? "Creating..." : "Create Job"}
            </button>
            <button
              onClick={handleSaveAsDraft}
              disabled={isLoading}
              className="px-6 py-2 bg-card border border-border text-foreground rounded-md text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              {isLoading ? "Saving..." : "Save as Draft"}
            </button>
            <Link href="/jobs" className="px-6 py-2 text-muted-foreground text-sm font-medium hover:text-foreground">
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
