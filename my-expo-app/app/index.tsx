import { Redirect } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';

export default function Index() {
  const { session, profile, loading } = useAuthStore();

  if (loading) return <LoadingSpinner fullScreen message="Yükleniyor..." />;
  if (!session) return <Redirect href="/(auth)/login" />;

  // profile henüz yüklenmediyse user_metadata'ya bak
  const userType =
    profile?.user_type ??
    (session.user.user_metadata?.user_type as string | undefined);

  if (!userType) return <LoadingSpinner fullScreen message="Yükleniyor..." />;

  if (userType === 'admin')        return <Redirect href="/(admin)" />;
  if (userType === 'clinic_admin') return <Redirect href={"/(clinic)" as any} />;
  if (userType === 'doctor')       return <Redirect href="/(doctor)" />;
  return <Redirect href="/(lab)" />;
}
