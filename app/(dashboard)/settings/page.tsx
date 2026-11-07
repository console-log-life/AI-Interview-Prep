import type { Metadata } from "next";
import Link from "next/link";
import { Bot, Braces, Database, ShieldCheck } from "lucide-react";

import {
  ChangePasswordForm,
  DeleteAccountCard,
} from "@/components/settings/settings-forms";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { aiAvailable } from "@/lib/ai";
import { requireUserPage } from "@/lib/auth/session";
import { executionAvailable } from "@/lib/coding";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/utils";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = {
  title: "Settings",
  description: "Account and platform settings.",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUserPage("/settings");

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { createdAt: true, lastLoginAt: true, role: true },
  });

  const integrations = [
    {
      name: "AI provider",
      icon: Bot,
      // Provider NAME only — the key itself never crosses to the client.
      detail: aiAvailable()
        ? `${env.ai.provider} · ${env.ai.model}`
        : "Not configured",
      ready: aiAvailable(),
      hint: "Powers mock interviews, resume analysis and job matching.",
    },
    {
      name: "Code execution",
      icon: Braces,
      detail: executionAvailable()
        ? `${env.codeExecution.provider} sandbox`
        : "Not configured",
      ready: executionAvailable(),
      hint: "Runs coding submissions in an isolated external sandbox.",
    },
    {
      name: "File storage",
      icon: Database,
      detail: `${env.storage.provider} provider`,
      ready: true,
      hint: "Where uploaded resume PDFs are kept.",
    },
  ];

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your account, and what this deployment has configured."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Email</dt>
              <dd className="mt-0.5 truncate text-sm font-medium">
                {user.email}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Role</dt>
              <dd className="mt-0.5">
                <Badge variant={account?.role === "ADMIN" ? "default" : "secondary"}>
                  {account?.role === "ADMIN" ? "Administrator" : "Student"}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Member since</dt>
              <dd className="mt-0.5 text-sm font-medium">
                {formatDate(account?.createdAt)}
              </dd>
            </div>
          </dl>

          <div className="mt-5 border-t pt-4">
            <Button asChild variant="outline" size="sm">
              <Link href="/profile">Edit your profile</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Platform integrations</CardTitle>
          <CardDescription>
            What this deployment has wired up. Secrets are never shown here —
            only whether a provider is configured.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {integrations.map((integration) => (
              <li
                key={integration.name}
                className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <integration.icon
                    className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{integration.name}</p>
                    <p className="text-xs text-muted-foreground text-pretty">
                      {integration.hint}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {integration.detail}
                  </span>
                  <Badge variant={integration.ready ? "success" : "warning"}>
                    {integration.ready ? "Configured" : "Not configured"}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <ChangePasswordForm />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Your data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p className="text-pretty">
            Your practice data is private to your account. Resume files are
            stored outside the database and only ever served through an
            authenticated, ownership-checked download route.
          </p>
          <p className="text-pretty">
            PrepPilot is a preparation tool. It does not make hiring decisions,
            does not share your data with employers, and no score here is a
            prediction about any real application.
          </p>
        </CardContent>
      </Card>

      <DeleteAccountCard />
    </>
  );
}
