import { getConfig } from "./api/secrets";
import { LiveAvatarDemo } from "../src/components/LiveAvatarDemo";

export default function Home() {
  const config = getConfig();
  return <LiveAvatarDemo apiUrl={config.API_URL} />;
}
