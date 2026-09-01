import { AppRoot } from "@/features/app/AppRoot";

/**
 * The application shell (UI exploration). Runs on mocked data behind the data seam;
 * no backend is wired yet. The API health probe now lives at /status.
 */
export default function Home() {
  return <AppRoot />;
}
