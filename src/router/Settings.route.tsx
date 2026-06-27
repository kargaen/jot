import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "./AppLayout.route";
import {
  useMobileAccountActions,
  useMobileProjectsActions,
  useMobileSpacesActions,
} from "../hooks/useMobileApp";
import MobileSettingsView from "../views/pages/mobile/settings/MobileSettings.view";

// Route container: feeds the Settings view from shared app data + the account,
// spaces, and projects action hooks. Sign-out and space changes refresh the
// shared data.
export default function SettingsRoute() {
  const { user, data } = useOutletContext<AppOutletContext>();
  const accountActions = useMobileAccountActions();
  const spaceActions = useMobileSpacesActions();
  const projectActions = useMobileProjectsActions();

  return (
    <MobileSettingsView
      email={user?.email ?? ""}
      areas={data.areas}
      projects={data.projects}
      tasks={data.tasks}
      hiddenAreaIds={data.hiddenAreaIds}
      onHiddenChange={data.handleHiddenChange}
      accountActions={accountActions}
      spaceActions={spaceActions}
      projectActions={projectActions}
      onSignedOut={() => data.refresh()}
      onAreasChanged={() => data.refresh()}
    />
  );
}
