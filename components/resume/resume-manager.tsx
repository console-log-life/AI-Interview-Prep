"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiDelete, apiFetch, apiPost, errorMessage } from "@/lib/api/client";
import { formatDateTime } from "@/lib/utils";
import { MAX_RESUME_BYTES } from "@/lib/validation/resume";

export type ResumeSummary = {
  id: string;
  fileName: string;
  sizeBytes: number;
  status: "UPLOADED" | "PROCESSING" | "ANALYZED" | "FAILED";
  isPrimary: boolean;
  errorMessage: string | null;
  createdAt: string;
  hasAnalysis: boolean;
  userVerified: boolean;
};

const STATUS_META: Record<
  ResumeSummary["status"],
  { label: string; variant: "success" | "warning" | "destructive" | "secondary" }
> = {
  UPLOADED: { label: "Not analysed yet", variant: "secondary" },
  PROCESSING: { label: "Analysing…", variant: "warning" },
  ANALYZED: { label: "Analysed", variant: "success" },
  FAILED: { label: "Analysis failed", variant: "destructive" },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResumeManager({
  resumes,
  aiEnabled,
}: {
  resumes: ResumeSummary[];
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [analysingId, setAnalysingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResumeSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function upload(file: File) {
    // Client-side pre-checks are a courtesy; the server validates the bytes.
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files are accepted.");
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      toast.error("Resume must be smaller than 5 MB.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await apiFetch<{ id: string }>("/api/resume/upload", {
        method: "POST",
        body: formData,
      });
      toast.success("Resume uploaded.");
      router.refresh();
      if (aiEnabled) await analyse(result.id);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function analyse(resumeId: string) {
    setAnalysingId(resumeId);
    try {
      await apiPost(`/api/resume/${resumeId}/analyze`);
      toast.success("Resume analysed. Review the extracted details below.");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      router.refresh();
    } finally {
      setAnalysingId(null);
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/resume/${deleteTarget.id}`);
      toast.success("Resume deleted.");
      setDeleteTarget(null);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Uploader */}
      <Card className="rounded-2xl border-border/70">
        <CardHeader>
          <CardTitle className="type-card-title">Upload a resume</CardTitle>
          <CardDescription>
            PDF only, up to 5 MB. Text-based PDFs work — scanned images
            don&apos;t, because there is no text to read.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void upload(file);
            }}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
              dragOver ? "border-primary bg-accent" : "border-border"
            }`}
          >
            <Upload
              className="mb-3 h-8 w-8 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="text-sm font-medium">
              Drag a PDF here, or choose a file
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              We store the file securely and never share it.
            </p>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              id="resume-file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              loading={uploading}
              onClick={() => fileInput.current?.click()}
            >
              Choose PDF
            </Button>
          </div>

          {!aiEnabled && (
            <Alert variant="info" className="mt-4">
              <Sparkles aria-hidden="true" />
              <AlertTitle>Analysis is unavailable</AlertTitle>
              <AlertDescription>
                You can still upload and download resumes, but extracting a
                structured profile needs an Anthropic API key.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Existing files */}
      {resumes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No resume uploaded"
          description="With a resume on file, mock interviews ask about your actual projects instead of hypothetical ones."
        />
      ) : (
        <Card className="rounded-2xl border-border/70">
          <CardHeader>
            <CardTitle className="type-card-title">Your resumes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {resumes.map((resume) => {
                const meta = STATUS_META[resume.status];
                const busy = analysingId === resume.id;
                return (
                  <li
                    key={resume.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <FileText
                        className="h-5 w-5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {resume.fileName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(resume.sizeBytes)} ·{" "}
                          {formatDateTime(resume.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {resume.isPrimary && (
                        <Badge variant="outline">Primary</Badge>
                      )}
                      <Badge variant={meta.variant}>
                        {busy ? "Analysing…" : meta.label}
                      </Badge>
                      {resume.userVerified && (
                        <Badge variant="success">Reviewed by you</Badge>
                      )}

                      {aiEnabled && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => analyse(resume.id)}
                          disabled={busy}
                        >
                          {busy ? (
                            <Loader2 className="animate-spin" aria-hidden="true" />
                          ) : resume.hasAnalysis ? (
                            <RefreshCw aria-hidden="true" />
                          ) : (
                            <Sparkles aria-hidden="true" />
                          )}
                          {resume.hasAnalysis ? "Re-analyse" : "Analyse"}
                        </Button>
                      )}

                      <Button size="sm" variant="ghost" asChild>
                        <a
                          href={`/api/resume/${resume.id}/download`}
                          aria-label={`Download ${resume.fileName}`}
                        >
                          <Download aria-hidden="true" />
                        </a>
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget(resume)}
                        aria-label={`Delete ${resume.fileName}`}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>

                    {resume.status === "FAILED" && resume.errorMessage && (
                      <Alert variant="destructive" className="w-full">
                        <AlertDescription>
                          {resume.errorMessage}
                        </AlertDescription>
                      </Alert>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this resume?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.fileName} and its extracted profile will be removed
              permanently. Skills already added to your profile stay.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} loading={deleting}>
              Delete resume
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
