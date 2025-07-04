import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { 
  Plus, 
  Trash2, 
  Check, 
  X, 
  AlertCircle, 
  Eye, 
  EyeOff,
  Bot,
  Star,
  Sparkles,
  Brain
} from "lucide-react";
import type { ApiKey, AIProvider } from "@/types";

export default function ApiKeyManager() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: apiKeys, isLoading: keysLoading } = useQuery<ApiKey[]>({
    queryKey: ["/api/api-keys"],
    retry: false,
  });

  const { data: aiProviders } = useQuery<Record<string, AIProvider>>({
    queryKey: ["/api/ai-providers"],
  });

  const addKeyMutation = useMutation({
    mutationFn: async ({ provider, apiKey }: { provider: string; apiKey: string }) => {
      setIsValidating(true);
      const response = await apiRequest("POST", "/api/api-keys", { provider, apiKey });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
      setShowAddForm(false);
      setSelectedProvider("");
      setApiKey("");
      setShowKey(false);
      toast({
        title: "Success",
        description: "API key added successfully",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to add API key",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsValidating(false);
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: async (keyId: number) => {
      await apiRequest("DELETE", `/api/api-keys/${keyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
      toast({
        title: "Success",
        description: "API key removed successfully",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to remove API key",
        variant: "destructive",
      });
    },
  });

  const handleAddKey = () => {
    if (!selectedProvider || !apiKey.trim()) {
      toast({
        title: "Error",
        description: "Please select a provider and enter an API key",
        variant: "destructive",
      });
      return;
    }

    addKeyMutation.mutate({ provider: selectedProvider, apiKey: apiKey.trim() });
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'openai':
        return <Bot className="w-6 h-6 text-green-600" />;
      case 'gemini':
        return <Star className="w-6 h-6 text-blue-600" />;
      case 'claude':
        return <Brain className="w-6 h-6 text-purple-600" />;
      case 'grok':
        return <Sparkles className="w-6 h-6 text-orange-600" />;
      default:
        return <Bot className="w-6 h-6 text-gray-600" />;
    }
  };

  const getProviderName = (provider: string) => {
    if (aiProviders && aiProviders[provider]) {
      return aiProviders[provider].name;
    }
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  };

  const getStatusBadge = (isValid: boolean) => {
    return isValid ? (
      <Badge className="bg-green-100 text-green-800 border-green-200">
        <Check className="w-3 h-3 mr-1" />
        Verified
      </Badge>
    ) : (
      <Badge variant="destructive">
        <X className="w-3 h-3 mr-1" />
        Invalid
      </Badge>
    );
  };

  const availableProviders = aiProviders 
    ? Object.keys(aiProviders).filter(provider => 
        !apiKeys?.some(key => key.provider === provider)
      )
    : [];

  return (
    <div className="space-y-6">
      {/* Add New API Key */}
      {!showAddForm ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-gray-900">Add New API Key</h4>
                <p className="text-sm text-gray-500 mt-1">
                  Add API keys from different providers to enable AI conversations
                </p>
              </div>
              <Button
                onClick={() => setShowAddForm(true)}
                disabled={availableProviders.length === 0}
                className="gradient-bg text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Key
              </Button>
            </div>
            {availableProviders.length === 0 && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  All available providers already have API keys configured.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-gray-900">Add New API Key</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowAddForm(false);
                    setSelectedProvider("");
                    setApiKey("");
                    setShowKey(false);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Provider</label>
                  <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select Provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProviders.map((provider) => (
                        <SelectItem key={provider} value={provider}>
                          {getProviderName(provider)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">API Key</label>
                  <div className="relative">
                    <Input
                      type={showKey ? "text" : "password"}
                      placeholder="Enter your API key..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1"
                    >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddForm(false);
                    setSelectedProvider("");
                    setApiKey("");
                    setShowKey(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddKey}
                  disabled={!selectedProvider || !apiKey.trim() || isValidating || addKeyMutation.isPending}
                  className="gradient-bg text-white"
                >
                  {isValidating || addKeyMutation.isPending ? "Validating..." : "Add Key"}
                </Button>
              </div>

              {selectedProvider && (
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5" />
                    <div className="text-sm text-blue-700">
                      <p className="font-medium">Important:</p>
                      <p>Your API key will be encrypted and stored securely. We will validate the key before saving it.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing API Keys */}
      <div className="space-y-4">
        <h4 className="font-medium text-gray-900">Your API Keys</h4>
        
        {keysLoading ? (
          <Card>
            <CardContent className="p-6">
              <div className="animate-pulse space-y-4">
                {Array(3).fill(0).map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gray-200 rounded-xl"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </div>
                    <div className="w-20 h-6 bg-gray-200 rounded"></div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : apiKeys && apiKeys.length > 0 ? (
          <div className="space-y-4">
            {apiKeys.map((key) => (
              <Card key={key.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                        {getProviderIcon(key.provider)}
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {getProviderName(key.provider)}
                        </h4>
                        <p className="text-sm text-gray-500">
                          {key.keyPreview || 'API Key'} • {getStatusBadge(key.isValid)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteKeyMutation.mutate(key.id)}
                        disabled={deleteKeyMutation.isPending}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Remove Key"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6">
              <div className="text-center py-8">
                <Bot className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h4 className="font-medium text-gray-900 mb-2">No API Keys</h4>
                <p className="text-gray-500 text-sm">
                  Add your first API key to start using AI providers with InquiroAI.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
