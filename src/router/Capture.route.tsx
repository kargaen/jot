import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import type { ParsedInput } from "../models/shared";
import type { AppOutletContext } from "./AppLayout.route";
import { useCaptureComposer } from "../hooks/useMobileApp";
import MobileCaptureView from "../views/pages/mobile/capture/MobileCapture.view";
import { logger } from "../utils/observability/logger";

// Route container: wires the capture composer + shared app data to the capture
// view. On save it persists the draft, refreshes shared data, and opens the new
// task's detail route. (Save/error-mapping mirrors the legacy handler and is
// removed with /_legacy once the port completes.)
export default function CaptureRoute() {
  const { data } = useOutletContext<AppOutletContext>();
  const capture = useCaptureComposer();
  const navigate = useNavigate();
  const location = useLocation();
  // Bumped when arriving from the widget so the form clears even if already here.
  const resetToken = (location.state as { reset?: number } | null)?.reset;

  async function handleSave(
    parsed: ParsedInput,
    opts?: { description?: Record<string, unknown> | null },
  ) {
    try {
      const result = await capture.saveDraft({
        title: parsed.title,
        projectId: parsed.project?.id ?? null,
        projectName: parsed.suggestedProjectName ?? undefined,
        dueDate: parsed.dueDate ?? null,
        dueTime: parsed.dueTime ?? null,
        priority: parsed.priority,
        recurrenceRule: parsed.recurrenceRule ?? null,
        tagIds: parsed.tags.map((t) => t.id),
        description: opts?.description ?? null,
        projects: data.projects,
      });
      await data.refresh();
      navigate(`/tasks/${result.task.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRls = msg.includes("42501") || msg.toLowerCase().includes("row-level security");
      const isAuth = msg.toLowerCase().includes("not authenticated") || msg.toLowerCase().includes("jwt");
      if (isRls || isAuth) {
        logger.error("capture", `save blocked — session/RLS: ${msg}`);
        throw new Error("Your session may have expired. Please sign out and sign back in, then try again.");
      }
      logger.error("capture", `save failed: ${msg}`);
      throw err;
    }
  }

  return <MobileCaptureView projects={data.projects} tags={data.tags} onSave={handleSave} resetToken={resetToken} />;
}
