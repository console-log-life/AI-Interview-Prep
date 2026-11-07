import type { Metadata } from "next";
import { PartyPopper } from "lucide-react";

import { ProfileForm } from "@/components/profile/profile-form";
import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireUserPage } from "@/lib/auth/session";
import { getProfileForForm } from "@/lib/db/queries/profile";
import type { CodeLanguage, ExperienceLevel } from "@/types/user";

export const metadata: Metadata = {
  title: "Profile",
  description: "Your professional profile.",
};

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const user = await requireUserPage("/profile");
  const params = await searchParams;
  const profile = await getProfileForForm(user.id);

  return (
    <>
      <PageHeader
        title="Your profile"
        description="Everything here shapes the questions you're asked and what we recommend next."
      />

      {params.welcome === "1" && (
        <Alert variant="success">
          <PartyPopper aria-hidden="true" />
          <AlertTitle>Welcome to PrepPilot</AlertTitle>
          <AlertDescription>
            Add your target role and a few skills — that&apos;s all it takes for
            your first interview to be tailored to you.
          </AlertDescription>
        </Alert>
      )}

      <ProfileForm
        initial={{
          name: profile?.name ?? user.name ?? "",
          email: profile?.email ?? user.email,
          headline: profile?.headline ?? "",
          bio: profile?.bio ?? "",
          college: profile?.college ?? "",
          degree: profile?.degree ?? "",
          branch: profile?.branch ?? "",
          graduationYear: profile?.graduationYear ?? undefined,
          cgpa: profile?.cgpa ?? undefined,
          experienceLevel: (profile?.experienceLevel ?? "FRESHER") as ExperienceLevel,
          targetRole: profile?.targetRole ?? "",
          targetCompanies: profile?.targetCompanies ?? [],
          preferredLangs: (profile?.preferredLangs ?? []) as CodeLanguage[],
          skills: profile?.skills ?? [],
          location: profile?.location ?? "",
          phone: profile?.phone ?? "",
          githubUrl: profile?.githubUrl ?? "",
          linkedinUrl: profile?.linkedinUrl ?? "",
          portfolioUrl: profile?.portfolioUrl ?? "",
        }}
      />
    </>
  );
}
