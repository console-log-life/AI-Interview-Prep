import { Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ServiceNoticeProps = {
  title: string;
  message: string;
  envHint?: string;
};

/**
 * Rendered when an optional integration (AI provider, code sandbox) has no
 * credentials on this deployment.
 *
 * The feature is honestly reported as unavailable and the exact fix is shown —
 * deliberately instead of silently substituting fake output.
 */
export function ServiceNotice({ title, message, envHint }: ServiceNoticeProps) {
  return (
    <Alert variant="info">
      <Info aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {envHint && (
          <pre className="mt-2 overflow-x-auto rounded-md bg-background/80 px-3 py-2 text-xs">
            <code>{envHint}</code>
          </pre>
        )}
      </AlertDescription>
    </Alert>
  );
}
