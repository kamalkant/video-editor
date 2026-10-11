"use client";

import { useState } from "react";

export function DeleteNowButton({ jobId }: { jobId: string }) {
  const [state, setState] = useState<"idle" | "deleting" | "deleted">("idle");
  if (state === "deleted") return <p role="status" className="text-sm">Deleted. The files are gone from this computer.</p>;
  return (
    <button
      type="button"
      className="btn btn-secondary"
      disabled={state === "deleting"}
      onClick={async () => {
        if (!window.confirm("Delete these files now? This can't be undone.")) return;
        setState("deleting");
        await fetch(`/api/jobs/${jobId}?purge=1`, { method: "DELETE" }).catch(() => null);
        setState("deleted");
      }}
    >
      Delete files now
    </button>
  );
}
