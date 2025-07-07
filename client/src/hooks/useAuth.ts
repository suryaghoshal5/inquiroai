import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

export function useAuth() {
  // For development, use server endpoint but it returns mock user
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
  };
}
