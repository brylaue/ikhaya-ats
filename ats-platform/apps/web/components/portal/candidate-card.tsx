import { FileText } from "lucide-react";
import { Application } from "@/types";
import { generateAvatarColor, getInitials } from "@/lib/utils";

interface PortalCandidateCardProps {
  application: Application;
  onDownloadResume?: () => void;
  onAdvance?: () => void;
  onHold?: () => void;
  onPass?: () => void;
}

export function PortalCandidateCard({
  application,
  onDownloadResume,
  onAdvance,
  onHold,
  onPass,
}: PortalCandidateCardProps) {
  const candidate = application.candidate;
  const avatarColor = generateAvatarColor(candidate?.fullName || "");
  const initials = getInitials(candidate?.fullName || "");

  if (!candidate) return null;

  return (
    <div className="bg-white border-2 border-cyan-100 rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4 mb-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
          style={{ backgroundColor: avatarColor }}
        >
          {initials}
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-foreground">{candidate.fullName}</h3>
          <p className="text-muted-foreground">{candidate.currentTitle}</p>
          <p className="text-sm text-muted-foreground">{candidate.currentCompany}</p>
        </div>
      </div>

      {/* Recruiter Headline */}
      {application.recruiterNote && (
        <div className="bg-cyan-50 border border-cyan-200 rounded p-3 mb-4">
          <p className="text-sm text-foreground italic">{application.recruiterNote}</p>
        </div>
      )}

      {/* Contact Details */}
      <div className="space-y-2 mb-4 text-sm">
        <div>
          <p className="text-muted-foreground">Email</p>
          <p className="font-medium text-foreground break-all">{candidate.email}</p>
        </div>
        {candidate.phone && (
          <div>
            <p className="text-muted-foreground">Phone</p>
            <p className="font-medium text-foreground">{candidate.phone}</p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-4 border-t border-cyan-100">
        <button
          onClick={onDownloadResume}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-cyan-50 text-cyan-600 rounded-lg hover:bg-cyan-100 font-medium transition-colors text-sm"
        >
          <FileText size={16} />
          Resume
        </button>
        <button
          onClick={onAdvance}
          className="flex-1 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-medium transition-colors text-sm"
        >
          Advance
        </button>
        <button
          onClick={onHold}
          className="flex-1 px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 font-medium transition-colors text-sm"
        >
          Hold
        </button>
        <button
          onClick={onPass}
          className="flex-1 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium transition-colors text-sm"
        >
          Pass
        </button>
      </div>
    </div>
  );
}
