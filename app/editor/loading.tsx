import { EditorSkeleton } from "@/components/studio/EditorSkeleton";

/** Shown at once while the editor page gets the project and its files ready on the server. */
export default function Loading() {
  return <EditorSkeleton />;
}
