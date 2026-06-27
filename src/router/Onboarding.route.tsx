import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useMobileAppData } from "../hooks/useMobileApp";
import MobileOnboardingView from "../views/pages/mobile/onboarding/MobileOnboarding.view";

// Full-screen route shown when a signed-in user has no spaces yet. Uses its own
// data instance (it lives outside the protected layout); on success it creates
// the first space and enters the app.
export default function OnboardingRoute() {
  const { user } = useAuth();
  const data = useMobileAppData(user?.id ?? null);
  const navigate = useNavigate();

  return (
    <MobileOnboardingView
      name={data.firstAreaName}
      setName={data.setFirstAreaName}
      busy={data.firstAreaBusy}
      error={data.firstAreaError}
      onSubmit={async () => {
        const area = await data.createFirstArea();
        if (area) navigate("/today", { replace: true });
      }}
    />
  );
}
