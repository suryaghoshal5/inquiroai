/**
 * ModelPicker — searchable, grouped model selector for all OpenRouter providers.
 *
 * Props:
 *   provider  — currently selected provider key (e.g. "anthropic")
 *   model     — currently selected full model ID (e.g. "anthropic/claude-3-5-sonnet-20241022")
 *   onProviderChange / onModelChange — controlled callbacks
 *   placeholder — shown in the model trigger when nothing selected
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Select, SelectContent, SelectGroup, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, RefreshCw, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { AIProvider } from "@/types";

interface ModelPickerProps {
  provider: string;
  model: string;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  providerPlaceholder?: string;
  modelPlaceholder?: string;
}

export default function ModelPicker({
  provider,
  model,
  onProviderChange,
  onModelChange,
  providerPlaceholder = "Provider",
  modelPlaceholder = "Model",
}: ModelPickerProps) {
  const [modelSearch, setModelSearch] = useState("");
  const queryClient = useQueryClient();

  const { data: providers = {}, isLoading } = useQuery<Record<string, AIProvider>>({
    queryKey: ["/api/ai-providers"],
    staleTime: 0,          // Always check for fresh data (OpenRouter catalog changes)
    refetchOnMount: true,  // Re-fetch every time ModelPicker mounts
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai-providers/refresh", {});
      return res.json();
    },
    onSuccess: (fresh) => {
      queryClient.setQueryData(["/api/ai-providers"], fresh);
    },
  });

  // Sort providers alphabetically by display name
  const sortedProviders = useMemo(
    () =>
      Object.entries(providers).sort(([, a], [, b]) =>
        a.name.localeCompare(b.name)
      ),
    [providers]
  );

  const currentProviderModels: string[] = providers[provider]?.models ?? [];

  const filteredModels = useMemo(() => {
    const q = modelSearch.trim().toLowerCase();
    if (!q) return currentProviderModels;
    return currentProviderModels.filter(m => m.toLowerCase().includes(q));
  }, [currentProviderModels, modelSearch]);

  // Show only the part after the slash as label, keep full ID as value
  const modelLabel = (id: string) => {
    const slash = id.indexOf("/");
    return slash !== -1 ? id.slice(slash + 1) : id;
  };

  const providerCount = Object.keys(providers).length;

  return (
    <div className="space-y-2">
      {/* Header row: provider count + refresh */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {isLoading
            ? "Loading providers…"
            : `${providerCount} provider${providerCount !== 1 ? "s" : ""} available via OpenRouter`}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          className="h-6 px-2 text-xs text-gray-400 hover:text-blue-600"
        >
          <RefreshCw className={`w-3 h-3 mr-1 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
    <div className="grid grid-cols-2 gap-3">
      {/* Provider */}
      <div className="relative">
        <Select
          value={provider}
          onValueChange={v => {
            onProviderChange(v);
            onModelChange("");
            setModelSearch("");
          }}
        >
          <SelectTrigger className={`rounded-xl text-sm ${provider ? "pr-8" : ""}`}>
            <SelectValue placeholder={providerPlaceholder} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {sortedProviders.map(([key, p]) => (
              <SelectItem key={key} value={key}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Clear provider + model */}
        {provider && (
          <button
            type="button"
            onClick={() => { onProviderChange(""); onModelChange(""); setModelSearch(""); }}
            className="absolute right-8 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors z-10"
            title="Clear selection"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Model — searchable */}
      <div className="relative">
      <Select
        value={model}
        onValueChange={onModelChange}
        disabled={!provider}
      >
        <SelectTrigger className={`rounded-xl text-sm ${model ? "pr-8" : ""}`}>
          <SelectValue placeholder={modelPlaceholder}>
            {model ? modelLabel(model) : modelPlaceholder}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {/* Inline search box */}
          <div className="px-2 py-1.5 sticky top-0 bg-white border-b border-gray-100 z-10">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input
                autoFocus
                placeholder="Search models…"
                value={modelSearch}
                onChange={e => setModelSearch(e.target.value)}
                onKeyDown={e => e.stopPropagation()}
                className="h-7 pl-8 text-xs rounded-lg border-gray-200"
              />
            </div>
          </div>
          <SelectGroup>
            {filteredModels.length === 0 ? (
              <div className="py-4 text-center text-xs text-gray-400">No models found</div>
            ) : (
              filteredModels.map(m => (
                <SelectItem key={m} value={m} className="text-sm">
                  {modelLabel(m)}
                </SelectItem>
              ))
            )}
          </SelectGroup>
        </SelectContent>
      </Select>
      {/* Clear model only */}
      {model && (
        <button
          type="button"
          onClick={() => { onModelChange(""); setModelSearch(""); }}
          className="absolute right-8 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors z-10"
          title="Clear model"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      </div>
    </div>
    </div>
  );
}
