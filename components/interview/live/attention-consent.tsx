"use client";

import { Eye, Monitor, ShieldCheck, Users } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * What attention feedback measures, said before it measures anything.
 *
 * Shown on the device-check page when the feature is enabled, and the
 * candidate has to choose. There is no pre-ticked box and no "by continuing
 * you agree": a camera feature that starts because someone did not read a
 * banner is not consented to.
 *
 * The four facts below are the ones that decide whether a candidate is
 * comfortable, so they are stated plainly rather than buried in a policy —
 * what is measured, that it never leaves the browser, that it is coaching
 * rather than a verdict, and that declining costs them nothing.
 */
export function AttentionConsent({
  onDecide,
  decided,
}: {
  onDecide: (enabled: boolean) => void;
  /** Null until the candidate chooses. */
  decided: boolean | null;
}) {
  if (decided !== null) {
    return (
      <Alert>
        <ShieldCheck aria-hidden="true" />
        <AlertTitle>
          {decided ? "Attention feedback is on" : "Attention feedback is off"}
        </AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span className="text-pretty">
            {decided
              ? "You will get feedback on eye contact and focus after the interview. Nothing is recorded or uploaded."
              : "No attention measurements will be taken. The interview and your report are otherwise unchanged."}
          </span>
          <Button size="sm" variant="outline" onClick={() => onDecide(!decided)}>
            {decided ? "Turn it off" : "Turn it on"}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <section
      aria-labelledby="attention-consent-heading"
      className="rounded-xl border bg-card p-4"
    >
      <h3 id="attention-consent-heading" className="text-base font-semibold">
        Attention feedback — your choice
      </h3>
      <p className="mt-1 text-sm text-muted-foreground text-pretty">
        Optional. It gives you coaching on how present you come across on
        camera, the way a real interviewer would notice it.
      </p>

      <dl className="mt-4 space-y-3 text-sm">
        <Fact icon={Eye} term="What it measures">
          Whether your face is in frame, whether you are facing the screen, how
          many faces are visible, and whether you switch tabs or leave
          fullscreen.
        </Fact>
        <Fact icon={ShieldCheck} term="Where it happens">
          Entirely in your browser. Frames are measured and immediately
          discarded — <strong>no video or image is stored or uploaded, ever</strong>.
          Only totals reach the server: a percentage and a few counts.
        </Fact>
        <Fact icon={Monitor} term="What it is for">
          Feedback, not a pass or fail. Nothing here is scored, nothing is
          reported to anyone, and looking away is never treated as cheating.
        </Fact>
        <Fact icon={Users} term="If you would rather not">
          Turn it off and take the interview exactly as normal. Your report
          keeps everything else and simply has no attention section.
        </Fact>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onDecide(true)}>
          Turn on attention feedback
        </Button>
        <Button size="sm" variant="outline" onClick={() => onDecide(false)}>
          No thanks
        </Button>
      </div>
    </section>
  );
}

function Fact({
  icon: Icon,
  term,
  children,
}: {
  icon: typeof Eye;
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2.5">
      <Icon
        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <div>
        <dt className="font-medium">{term}</dt>
        <dd className="text-muted-foreground text-pretty">{children}</dd>
      </div>
    </div>
  );
}
