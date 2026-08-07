import { Redirect } from "expo-router";
import { useAuth } from "../src/features/auth/AuthProvider";

export default function Index() {
  const { isLoading, isPreview, profile, session } = useAuth();
  if (isLoading) return null;
  if (isPreview) return <Redirect href="/(tabs)/home" />;
  if (!session) return <Redirect href="/welcome" />;
  if (!profile) return <Redirect href="/profile-setup" />;
  return <Redirect href="/(tabs)/challenges" />;
}
