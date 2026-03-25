import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, Search, Zap, ChevronRight } from "lucide-react";
import rawTemplates from "@/data/templates.json";

export interface TemplateFields {
  name: string;
  role?: string;
  customRole?: string;
  context?: string;
  task?: string;
  constraints?: string;
  audience?: string;
  examples?: string;
  optional?: string;
  aiProvider?: string;
  aiModel?: string;
}

interface FlatTemplate {
  id: string;
  name: string;
  category: string;
  complexity: string;
  recommended_model: string;
  frequency_rank: number;
  trigger_phrases?: string[];
  when_to_use?: string;
  role?: string;
  custom_role?: string;
  context?: string;
  task?: string;
  constraints?: string;
  audience?: string;
  examples?: string;
  optional?: string;
}

interface TemplateLibraryProps {
  onUse: (fields: TemplateFields) => void;
  triggerLabel?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  BUILD:      "bg-blue-100 text-blue-800",
  STRATEGY:   "bg-purple-100 text-purple-800",
  RESEARCH:   "bg-green-100 text-green-800",
  PRODUCT:    "bg-orange-100 text-orange-800",
  CONTENT:    "bg-pink-100 text-pink-800",
  REGULATORY: "bg-red-100 text-red-800",
  ANALYSIS:   "bg-yellow-100 text-yellow-800",
  META:       "bg-gray-100 text-gray-800",
  SYNTHESIS:  "bg-teal-100 text-teal-800",
};

const COMPLEXITY_COLORS: Record<string, string> = {
  high:   "bg-red-50 text-red-700 border border-red-200",
  medium: "bg-yellow-50 text-yellow-700 border border-yellow-200",
  low:    "bg-green-50 text-green-700 border border-green-200",
};

function modelLabel(modelId: string): string {
  const parts = modelId.split("/");
  return parts.length > 1 ? parts.slice(1).join("/") : modelId;
}

function providerFromModel(modelId: string): string {
  return modelId.split("/")[0] ?? "";
}

// Flatten templates + variants into a single list of selectable items
function flattenTemplates(): FlatTemplate[] {
  const result: FlatTemplate[] = [];

  for (const tpl of (rawTemplates as { templates: Record<string, unknown>[] }).templates) {
    const variants = tpl.variants as Record<string, unknown>[] | undefined;
    if (variants && variants.length > 0) {
      for (const v of variants) {
        result.push({
          id:               String(v.variant_id ?? tpl.id),
          name:             `${tpl.name} — ${v.variant_name}`,
          category:         String(tpl.category),
          complexity:       String(tpl.complexity),
          recommended_model: String(v.recommended_model ?? tpl.recommended_model ?? ""),
          frequency_rank:   Number(tpl.frequency_rank ?? 99),
          trigger_phrases:  (v.trigger_phrases ?? tpl.trigger_phrases) as string[] | undefined,
          when_to_use:      String(v.description ?? ""),
          role:             String(v.role ?? tpl.role ?? ""),
          custom_role:      String(v.custom_role ?? tpl.custom_role ?? ""),
          context:          String(v.context ?? tpl.context ?? ""),
          task:             String(v.task ?? tpl.task ?? ""),
          constraints:      String(v.constraints ?? tpl.constraints ?? ""),
          audience:         String(v.audience ?? tpl.audience ?? ""),
          examples:         String(v.examples ?? tpl.examples ?? ""),
          optional:         String(v.optional ?? tpl.optional ?? ""),
        });
      }
    } else {
      result.push({
        id:               String(tpl.id),
        name:             String(tpl.name),
        category:         String(tpl.category),
        complexity:       String(tpl.complexity),
        recommended_model: String(tpl.recommended_model ?? ""),
        frequency_rank:   Number(tpl.frequency_rank ?? 99),
        trigger_phrases:  tpl.trigger_phrases as string[] | undefined,
        role:             String(tpl.role ?? ""),
        custom_role:      String(tpl.custom_role ?? ""),
        context:          String(tpl.context ?? ""),
        task:             String(tpl.task ?? ""),
        constraints:      String(tpl.constraints ?? ""),
        audience:         String(tpl.audience ?? ""),
        examples:         String(tpl.examples ?? ""),
        optional:         String(tpl.optional ?? ""),
      });
    }
  }

  return result.sort((a, b) => a.frequency_rank - b.frequency_rank);
}

const ALL_TEMPLATES = flattenTemplates();
const ALL_CATEGORIES = ["All", ...Array.from(new Set(ALL_TEMPLATES.map(t => t.category)))];

export default function TemplateLibrary({ onUse, triggerLabel = "Browse Templates" }: TemplateLibraryProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const filtered = useMemo(() => {
    return ALL_TEMPLATES.filter(t => {
      const matchesCategory = category === "All" || t.category === category;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        (t.trigger_phrases ?? []).some(p => p.toLowerCase().includes(q)) ||
        (t.when_to_use ?? "").toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [search, category]);

  function handleUse(tpl: FlatTemplate) {
    const VALID_ROLES = ["researcher", "product_manager", "developer", "content_writer", "designer", "presales_consultant", "custom"];
    const role = VALID_ROLES.includes(tpl.role) ? tpl.role : "custom";

    onUse({
      name:        tpl.name,
      role,
      customRole:  tpl.custom_role || undefined,
      context:     tpl.context || undefined,
      task:        tpl.task || undefined,
      constraints: tpl.constraints || undefined,
      audience:    tpl.audience || undefined,
      examples:    tpl.examples || undefined,
      optional:    tpl.optional || undefined,
      aiProvider:  providerFromModel(tpl.recommended_model),
      aiModel:     tpl.recommended_model,
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-300 transition-all duration-200"
        >
          <BookOpen className="w-4 h-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <BookOpen className="w-5 h-5 text-purple-600" />
            Prompt Template Library
            <Badge variant="secondary" className="ml-2 text-xs">
              {ALL_TEMPLATES.length} templates
            </Badge>
          </DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            Battle-tested templates from 70+ real conversations. Select one to pre-fill your form.
          </p>
        </DialogHeader>

        {/* Search + Filter */}
        <div className="px-6 py-4 space-y-3 shrink-0 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search templates..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 ${
                  category === cat
                    ? "bg-purple-600 text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Template Cards */}
        <ScrollArea className="flex-1 px-6 py-4">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>No templates match your search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map(tpl => (
                <div
                  key={tpl.id}
                  className="group border border-gray-200 rounded-xl p-4 hover:border-purple-300 hover:shadow-md transition-all duration-200 bg-white flex flex-col gap-3"
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[tpl.category] ?? "bg-gray-100 text-gray-800"}`}>
                          {tpl.category}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${COMPLEXITY_COLORS[tpl.complexity] ?? ""}`}>
                          {tpl.complexity}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-gray-900 leading-tight">{tpl.name}</p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0 mt-1">#{tpl.id}</span>
                  </div>

                  {/* Model + when to use */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Zap className="w-3 h-3 text-purple-400" />
                      <span className="font-mono text-purple-700">{modelLabel(tpl.recommended_model)}</span>
                    </div>
                    {tpl.when_to_use && (
                      <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{tpl.when_to_use}</p>
                    )}
                    {!tpl.when_to_use && tpl.trigger_phrases && tpl.trigger_phrases.length > 0 && (
                      <p className="text-xs text-gray-400 italic line-clamp-1">
                        e.g. "{tpl.trigger_phrases[0]}"
                      </p>
                    )}
                  </div>

                  {/* Use button */}
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleUse(tpl)}
                    className="w-full mt-auto bg-purple-600 hover:bg-purple-700 text-white gap-1.5 transition-all duration-200 group-hover:shadow-sm"
                  >
                    Use Template
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
