import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation } from "wouter";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Chat from "@/pages/Chat";
import NewChat from "@/pages/NewChat";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";
import type { ApiKey } from "@/types";

function AuthenticatedHome() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const { data: apiKeys, isLoading: apiKeysLoading } = useQuery<ApiKey[]>({
    queryKey: ["/api/api-keys"],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (isAuthenticated && !apiKeysLoading && apiKeys !== undefined) {
      // If user has no API keys, redirect to settings
      if (apiKeys.length === 0) {
        navigate("/settings");
      } else {
        // If user has API keys, redirect to new chat page
        navigate("/chat/new");
      }
    }
  }, [isAuthenticated, apiKeysLoading, apiKeys, navigate]);

  // Show loading while checking API keys
  if (apiKeysLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 gradient-bg rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <i className="fas fa-brain text-white text-2xl"></i>
          </div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return null;
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 gradient-bg rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <i className="fas fa-brain text-white text-2xl"></i>
          </div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      {!isAuthenticated ? (
        <Route path="/" component={Landing} />
      ) : (
        <>
          <Route path="/" component={AuthenticatedHome} />
          <Route path="/chat" component={Dashboard} />
          <Route path="/chat/new" component={NewChat} />
          <Route path="/chat/:id" component={Chat} />
          <Route path="/settings" component={Settings} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
