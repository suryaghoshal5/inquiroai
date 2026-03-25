import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import FileBrowser from "@/components/FileBrowser";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  Share,
  Settings,
  Copy,
  ThumbsUp,
  ThumbsDown,
  Paperclip,
  Send,
  MoreHorizontal,
  FileText,
  File,
  ChevronDown,
  ChevronUp,
  Sparkles,
  X,
  Cpu,
  Link2,
  Bookmark,
  BookmarkCheck,
  FolderOpen,
  ChevronRight,
  Network,
  ArrowDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import LinkToProjectModal from "@/components/LinkToProjectModal";
import ModelPicker from "@/components/ModelPicker";
import RoleSelector from "@/components/RoleSelector";
import CodeContextIndicator from "@/components/CodeContextIndicator";
import CodeBlockActions from "@/components/CodeBlockActions";
import type { ProcessedBlock } from "@/components/CodeBlockActions";
import { apiRequest } from "@/lib/queryClient";
import type { Chat, Message } from "@/types";
import type { EvaluationData, RecommendationData, ContextStatus, CodeContextMeta } from "@/pages/Chat";

interface ChatInterfaceProps {
  chat: Chat;
  messages: Message[];
  onSendMessage: (content: string) => void;
  isLoading: boolean;
  streamingMessage?: string | null;
  lastEvaluation?: EvaluationData | null;
  lastRecommendation?: RecommendationData | null;
  onModelOverride?: (model: string | null) => void;
  currentModelOverride?: string | null;
  contextStatus?: ContextStatus | null;
  onArchive?: () => void;
  isArchiving?: boolean;
  onExtractGraph?: () => void;
  isExtractingGraph?: boolean;
  obsidianVaultConfigured?: boolean;
  projectName?: string;
  projectId?: number;
  projectLocalFolderPath?: string | null;
  lastCodeContext?: CodeContextMeta | null;
}

interface AttachedChatFile {
  chatFile: {
    id: number;
    chatId: number;
    projectFileId: number;
    attachedAt: string;
    detachedAt: string | null;
  };
  projectFile: {
    id: number;
    fileName: string;
    relativePath: string;
    fileType: string;
    fileSizeBytes: number;
    createdAt: string;
  };
}

export default function ChatInterface({
  chat,
  messages,
  onSendMessage,
  isLoading,
  streamingMessage,
  lastEvaluation,
  lastRecommendation,
  onModelOverride,
  currentModelOverride,
  contextStatus,
  onArchive,
  isArchiving,
  onExtractGraph,
  isExtractingGraph,
  obsidianVaultConfigured,
  projectName,
  projectId,
  projectLocalFolderPath,
  lastCodeContext,
}: ChatInterfaceProps) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [inputMessage, setInputMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showFileBrowserDialog, setShowFileBrowserDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [bannerExpanded, setBannerExpanded] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showInlineModelPicker, setShowInlineModelPicker] = useState(false);
  const [inlinePickerProvider, setInlinePickerProvider] = useState("");
  const [inlinePickerModel, setInlinePickerModel] = useState("");
  const [rolePopoverOpen, setRolePopoverOpen] = useState(false);
  const [localRole, setLocalRole] = useState(chat.role);
  const [localCustomRole, setLocalCustomRole] = useState(chat.customRole ?? "");
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const userScrolledUpRef = useRef(false);
  // Map of messageId → processed code blocks (populated after streaming completes)
  const [processedBlocks, setProcessedBlocks] = useState<Record<number, ProcessedBlock[]>>({});

  // Attached files query (only for project chats with a local folder)
  const { data: attachedFiles, refetch: refetchAttached } = useQuery<AttachedChatFile[]>({
    queryKey: [`/api/chats/${chat.id}/files`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/chats/${chat.id}/files`);
      return res.json();
    },
    enabled: !!projectLocalFolderPath,
  });

  const detachFileMutation = useMutation({
    mutationFn: async (chatFileId: number) => {
      await apiRequest("DELETE", `/api/chats/${chat.id}/files/${chatFileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/chats/${chat.id}/files`] });
    },
    onError: () => {
      toast({ title: "Could not detach file", variant: "destructive" });
    },
  });

  const roleMutation = useMutation({
    mutationFn: async (newRole: string) => {
      const res = await apiRequest("PATCH", `/api/chats/${chat.id}`, { role: newRole });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/chats/${chat.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
    },
    onError: () => {
      toast({ title: "Could not update role", variant: "destructive" });
    },
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bannerDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Process code blocks in the latest assistant message (after streaming completes)
  useEffect(() => {
    if (!projectId || !projectLocalFolderPath) return;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "assistant") return;
    if (processedBlocks[lastMsg.id] !== undefined) return; // already processed

    const hasFence = /```[\w]*\n/.test(lastMsg.content);
    if (!hasFence) return;

    apiRequest("POST", `/api/projects/${projectId}/process-code-response`, {
      responseText: lastMsg.content,
    })
      .then(res => res.json())
      .then(data => {
        if (data.blocks?.length > 0) {
          setProcessedBlocks(prev => ({ ...prev, [lastMsg.id]: data.blocks }));
        }
      })
      .catch(() => {/* non-fatal — code actions just won't appear */});
  }, [messages, projectId, projectLocalFolderPath]);

  // Auto-scroll to bottom when new messages arrive (unless user scrolled up)
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Auto-scroll during streaming (unless user manually scrolled up)
  useEffect(() => {
    if (isLoading && !userScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [streamingMessage, isLoading]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isNearBottom = distanceFromBottom < 200;
    userScrolledUpRef.current = !isNearBottom;
    setShowScrollButton(!isNearBottom);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    userScrolledUpRef.current = false;
    setShowScrollButton(false);
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputMessage]);

  // Typing indicator disabled (no WebSocket)
  useEffect(() => {
    if (isTyping) {
      const timer = setTimeout(() => {
        setIsTyping(false);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [isTyping]);

  // Show banner when evaluation arrives and score < 7
  useEffect(() => {
    if (lastEvaluation?.show_suggestion) {
      setBannerVisible(true);
      setBannerExpanded(false);
      if (bannerDismissTimer.current) clearTimeout(bannerDismissTimer.current);
      bannerDismissTimer.current = setTimeout(() => {
        setBannerVisible(false);
      }, 8000);
    } else {
      setBannerVisible(false);
    }
    return () => {
      if (bannerDismissTimer.current) clearTimeout(bannerDismissTimer.current);
    };
  }, [lastEvaluation]);

  const handleSend = () => {
    if (!inputMessage.trim() || isLoading) return;
    setBannerVisible(false);
    onSendMessage(inputMessage.trim());
    setInputMessage("");
    setIsTyping(false);
  };

  const dismissBanner = () => {
    setBannerVisible(false);
    if (bannerDismissTimer.current) clearTimeout(bannerDismissTimer.current);
  };

  const useImprovedPrompt = () => {
    if (lastEvaluation?.improved_prompt) {
      setInputMessage(lastEvaluation.improved_prompt);
    }
    dismissBanner();
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return "text-green-600";
    if (score >= 6) return "text-yellow-600";
    return "text-red-500";
  };

  const getContextBarColor = (pct: number) => {
    if (pct < 0.5)  return { bar: "bg-green-500",  text: "text-green-700"  };
    if (pct < 0.7)  return { bar: "bg-yellow-500", text: "text-yellow-700" };
    if (pct < 0.85) return { bar: "bg-orange-500", text: "text-orange-700" };
    return           { bar: "bg-red-500",    text: "text-red-700"   };
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (!isTyping) {
      setIsTyping(true);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied",
        description: "Message copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy message",
        variant: "destructive",
      });
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'researcher':
        return <i className="fas fa-search text-white text-lg"></i>;
      case 'product_manager':
        return <i className="fas fa-chart-line text-white text-lg"></i>;
      case 'developer':
        return <i className="fas fa-code text-white text-lg"></i>;
      case 'content_writer':
        return <i className="fas fa-pen-fancy text-white text-lg"></i>;
      case 'designer':
        return <i className="fas fa-palette text-white text-lg"></i>;
      case 'custom':
        return <i className="fas fa-plus text-white text-lg"></i>;
      default:
        return <i className="fas fa-robot text-white text-lg"></i>;
    }
  };

  const formatTime = (date: Date) => {
    // DB stores local time but JSON serialization appends Z (UTC marker).
    // Strip it so the browser treats the value as local time directly.
    const raw = typeof date === 'string' ? (date as string).replace(/Z$/, '') : date;
    return new Date(raw).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const exportChat = (format: 'pdf' | 'markdown' | 'word') => {
    const chatContent = messages.map(msg => {
      const timestamp = formatTime(msg.createdAt);
      const role = msg.role === 'user' ? 'You' : 'AI Assistant';
      return `[${timestamp}] ${role}:\n${msg.content}\n\n`;
    }).join('');

    const fullContent = `Chat: ${chat.title}\nRole: ${chat.role === 'custom' ? chat.customRole : chat.role.replace('_', ' ')}\nModel: ${chat.aiModel}\nCreated: ${new Date(chat.createdAt).toLocaleString()}\n\n=== CONVERSATION ===\n\n${chatContent}`;

    if (format === 'markdown') {
      const blob = new Blob([fullContent], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${chat.title.replace(/[^a-zA-Z0-9]/g, '_')}.md`;
      link.click();
      URL.revokeObjectURL(url);
    } else if (format === 'word') {
      const blob = new Blob([fullContent], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${chat.title.replace(/[^a-zA-Z0-9]/g, '_')}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } else if (format === 'pdf') {
      // For PDF, we'll use a simple text approach for now
      const blob = new Blob([fullContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${chat.title.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
      link.click();
      URL.revokeObjectURL(url);
    }

    toast({
      title: "Chat Exported",
      description: `Chat exported as ${format.toUpperCase()}`,
    });
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Chat Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 role-${localRole.replace('_', '-')}`}>
              {getRoleIcon(localRole)}
            </div>
            <div className="min-w-0">
              {/* Project breadcrumb */}
              {projectName && (
                <button
                  onClick={() => projectId && navigate(`/projects/${projectId}`)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors mb-0.5"
                >
                  <FolderOpen className="w-3 h-3" />
                  <span>{projectName}</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              )}
              <h3 className="text-base font-semibold text-gray-900 truncate">{chat.title}</h3>
              {/* Role pill + model pill */}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {/* Role pill — clicking opens popover to change role */}
                <Popover open={rolePopoverOpen} onOpenChange={setRolePopoverOpen}>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200 transition-colors cursor-pointer">
                      {localRole === 'custom' ? (localCustomRole || 'Custom') : localRole.replace(/_/g, ' ')}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[480px] p-4" align="start">
                    <p className="text-xs font-medium text-gray-500 mb-3">Change role for this chat</p>
                    <RoleSelector
                      value={localRole}
                      onChange={(newRole) => {
                        setLocalRole(newRole);
                        roleMutation.mutate(newRole);
                        setRolePopoverOpen(false);
                        toast({ title: "Role updated", description: `Switched to ${newRole.replace(/_/g, ' ')}` });
                      }}
                    />
                  </PopoverContent>
                </Popover>

                {/* Model pill — clicking scrolls to/toggles inline model picker */}
                <button
                  onClick={() => setShowInlineModelPicker(v => !v)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200 hover:bg-purple-200 transition-colors cursor-pointer"
                >
                  <Cpu className="w-3 h-3" />
                  {currentModelOverride
                    ? (currentModelOverride.includes("/") ? currentModelOverride.slice(currentModelOverride.indexOf("/") + 1) : currentModelOverride)
                    : (chat.aiModel?.includes("/") ? chat.aiModel.slice(chat.aiModel.indexOf("/") + 1) : (chat.aiModel || "Auto"))
                  }
                  {currentModelOverride && <span className="text-purple-500 ml-0.5">·override</span>}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-1 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" title="Export Chat" className="hover:scale-[1.02] transition-all duration-200">
                  <Share className="w-4 h-4 text-gray-500" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportChat('pdf')}>
                  <FileText className="w-4 h-4 mr-2" />
                  Export as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportChat('markdown')}>
                  <File className="w-4 h-4 mr-2" />
                  Export as Markdown
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportChat('word')}>
                  <FileText className="w-4 h-4 mr-2" />
                  Export as Word
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={showSettings} onOpenChange={setShowSettings}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" title="Chat Settings" className="hover:scale-[1.02] transition-all duration-200">
                  <Settings className="w-4 h-4 text-gray-500" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Chat Configuration</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Title</label>
                    <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm">{chat.title}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Role</label>
                    <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm">
                      {chat.role === 'custom' ? chat.customRole : chat.role.replace('_', ' ')}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Context</label>
                    <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm max-h-32 overflow-y-auto">
                      {chat.context || 'No context provided'}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Task</label>
                    <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm max-h-32 overflow-y-auto">
                      {chat.task || 'No task provided'}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Input Data</label>
                    <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm max-h-32 overflow-y-auto">
                      {chat.inputData || 'No input data provided'}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Constraints</label>
                    <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm max-h-32 overflow-y-auto">
                      {chat.constraints || 'No constraints provided'}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Examples</label>
                    <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm max-h-32 overflow-y-auto">
                      {chat.examples || 'No examples provided'}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Target Audience</label>
                    <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm">
                      {chat.audience || 'No audience specified'}
                    </div>
                  </div>
                  <div className="flex space-x-4">
                    <div className="flex-1">
                      <label className="text-sm font-medium text-gray-700">AI Provider</label>
                      <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm">{chat.aiProvider}</div>
                    </div>
                    <div className="flex-1">
                      <label className="text-sm font-medium text-gray-700">Model</label>
                      <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm">{chat.aiModel}</div>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            
            <Button
              variant="ghost"
              size="sm"
              title={chat.projectId ? "Move to another project" : "Link to project"}
              onClick={() => setShowLinkModal(true)}
              className="flex items-center gap-1.5 text-gray-500 hover:text-blue-600 hover:scale-[1.02] transition-all duration-200"
            >
              <Link2 className="w-4 h-4" />
            </Button>

            {onArchive && (
              <Button
                variant="ghost"
                size="sm"
                title={chat.archivedAt ? "Already archived to Notion" : "Archive to Memory (Notion)"}
                onClick={onArchive}
                disabled={isArchiving}
                className={`flex items-center gap-1.5 hover:scale-[1.02] transition-all duration-200 ${chat.archivedAt ? "text-green-600" : "text-gray-500 hover:text-purple-600"}`}
              >
                {chat.archivedAt ? (
                  <BookmarkCheck className="w-4 h-4" />
                ) : (
                  <Bookmark className={`w-4 h-4 ${isArchiving ? "animate-pulse" : ""}`} />
                )}
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              title={obsidianVaultConfigured ? "Extract to Obsidian Knowledge Graph" : "Extract to Graph (configure vault in Settings first)"}
              onClick={onExtractGraph ?? (() => {})}
              disabled={isExtractingGraph}
              className={`flex items-center gap-1.5 hover:scale-[1.02] transition-all duration-200 ${obsidianVaultConfigured ? "text-gray-500 hover:text-violet-600" : "text-gray-300"}`}
            >
              <Network className={`w-4 h-4 ${isExtractingGraph ? "animate-pulse" : ""}`} />
            </Button>

            <Button variant="ghost" size="sm" className="hover:scale-[1.02] transition-all duration-200">
              <MoreHorizontal className="w-4 h-4 text-gray-500" />
            </Button>
          </div>
        </div>
      </div>

      {/* Link to project modal */}
      <LinkToProjectModal
        chatId={chat.id}
        chatTitle={chat.title}
        currentProjectId={chat.projectId}
        open={showLinkModal}
        onClose={() => setShowLinkModal(false)}
      />

      {/* Attached Files Pill Bar — shown only when files are attached */}
      {projectLocalFolderPath && attachedFiles && attachedFiles.length > 0 && (
        <div className="px-6 py-2 border-b border-gray-100 flex flex-wrap items-center gap-2 bg-white">
          {attachedFiles.map(({ chatFile, projectFile }) => (
            <div
              key={chatFile.id}
              title={`${(projectFile.fileSizeBytes / 1024).toFixed(1)} KB · Extracted ${new Date(projectFile.createdAt).toLocaleDateString()}`}
              className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-full px-3 py-1 text-xs text-blue-800"
            >
              <FileText className="w-3 h-3 shrink-0" />
              <span className="max-w-[160px] truncate">{projectFile.fileName}</span>
              <button
                onClick={() => detachFileMutation.mutate(chatFile.id)}
                className="ml-0.5 text-blue-400 hover:text-red-500 transition-colors"
                title="Remove file"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            onClick={() => setShowFileBrowserDialog(true)}
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors px-2 py-1 rounded-full border border-dashed border-gray-200 hover:border-blue-300"
          >
            <Paperclip className="w-3 h-3" />
            Attach file
          </button>
        </div>
      )}

      {/* File Browser Dialog */}
      {projectLocalFolderPath && projectId && (
        <Dialog open={showFileBrowserDialog} onOpenChange={setShowFileBrowserDialog}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4" />
                Attach files to this chat
              </DialogTitle>
            </DialogHeader>
            <FileBrowser
              projectId={projectId}
              folderPath={projectLocalFolderPath}
              chatId={chat.id}
              onChatFileAttached={() => {
                refetchAttached();
                setShowFileBrowserDialog(false);
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Messages Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-6"
      >
        <div className="space-y-6 max-w-4xl mx-auto">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className="max-w-3xl">
                <div
                  className={`rounded-2xl p-4 shadow-sm ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-md'
                      : 'bg-gray-50 border border-gray-200 text-gray-900 rounded-bl-md'
                  }`}
                >
                  <div className="text-sm leading-relaxed">
                    {message.role === 'assistant' ? (() => {
                      // Counter tracks which code block we're rendering (for matching to processedBlocks)
                      let blockIdx = 0;
                      const msgBlocks = processedBlocks[message.id];
                      return (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({children}) => <h1 className="text-xl font-bold text-gray-900 mt-4 mb-2 first:mt-0 border-b border-gray-200 pb-1">{children}</h1>,
                          h2: ({children}) => <h2 className="text-lg font-semibold text-gray-900 mt-4 mb-2 first:mt-0">{children}</h2>,
                          h3: ({children}) => <h3 className="text-base font-semibold text-gray-900 mt-3 mb-1 first:mt-0">{children}</h3>,
                          h4: ({children}) => <h4 className="text-sm font-semibold text-gray-800 mt-2 mb-1">{children}</h4>,
                          p: ({children}) => <p className="text-gray-700 mb-3 last:mb-0 leading-relaxed">{children}</p>,
                          ul: ({children}) => <ul className="list-disc pl-5 mb-3 text-gray-700 space-y-1">{children}</ul>,
                          ol: ({children}) => <ol className="list-decimal pl-5 mb-3 text-gray-700 space-y-1">{children}</ol>,
                          li: ({children}) => <li className="text-gray-700 leading-relaxed">{children}</li>,
                          code: ({className, children}) => {
                            const isInline = !className;
                            return isInline
                              ? <code className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-xs font-mono border border-blue-100">{children}</code>
                              : <code className={`font-mono text-xs text-gray-800 ${className ?? ''}`}>{children}</code>;
                          },
                          pre: ({children}) => {
                            const thisIdx = blockIdx++;
                            const processed = msgBlocks?.[thisIdx];
                            return (
                              <div className="mb-3">
                                <pre className="bg-gray-900 text-gray-100 p-4 rounded-xl overflow-x-auto text-xs font-mono leading-relaxed border border-gray-700">
                                  {children}
                                </pre>
                                {projectId && processed && (
                                  <CodeBlockActions
                                    block={processed}
                                    projectId={projectId}
                                  />
                                )}
                              </div>
                            );
                          },
                          blockquote: ({children}) => (
                            <blockquote className="border-l-4 border-blue-400 pl-4 py-1 my-3 bg-blue-50 rounded-r-lg text-gray-600 italic">
                              {children}
                            </blockquote>
                          ),
                          strong: ({children}) => <strong className="font-semibold text-gray-900">{children}</strong>,
                          em: ({children}) => <em className="italic text-gray-700">{children}</em>,
                          hr: () => <hr className="border-gray-200 my-4" />,
                          a: ({href, children}) => (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">
                              {children}
                            </a>
                          ),
                          table: ({children}) => (
                            <div className="overflow-x-auto mb-3">
                              <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg text-xs">
                                {children}
                              </table>
                            </div>
                          ),
                          thead: ({children}) => <thead className="bg-gray-50">{children}</thead>,
                          tbody: ({children}) => <tbody className="divide-y divide-gray-100">{children}</tbody>,
                          tr: ({children}) => <tr className="hover:bg-gray-50">{children}</tr>,
                          th: ({children}) => <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">{children}</th>,
                          td: ({children}) => <td className="px-3 py-2 text-gray-700">{children}</td>,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                      );
                    })() : (
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    )}
                  </div>
                </div>
                <div className={`mt-2 flex items-center ${message.role === 'user' ? 'justify-end' : 'justify-between'}`}>
                  <div className="text-xs text-gray-600">
                    {formatTime(message.createdAt)}
                    {message.role === 'assistant' && message.metadata?.model && (
                      <span className="ml-2 text-green-600">• {message.metadata.model}</span>
                    )}
                  </div>
                  {message.role === 'assistant' && (
                    <div className="flex space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(message.content)}
                        className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                        title="Copy"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                        title="Like"
                      >
                        <ThumbsUp className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                        title="Dislike"
                      >
                        <ThumbsDown className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Typing indicator — shown while waiting for the first token */}
          {isLoading && !streamingMessage && (
            <div className="flex justify-start">
              <div className="max-w-3xl">
                <div className="bg-gray-100 rounded-2xl rounded-bl-md p-4 shadow-sm">
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                    <span className="text-sm text-gray-500">AI is thinking...</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Streaming bubble — progressively rendered as tokens arrive */}
          {streamingMessage && (
            <div className="flex justify-start">
              <div className="max-w-3xl">
                <div className="bg-gray-50 border border-gray-200 text-gray-900 rounded-2xl rounded-bl-md p-4 shadow-sm">
                  <div className="text-sm leading-relaxed">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({children}) => <h1 className="text-xl font-bold text-gray-900 mt-4 mb-2 first:mt-0 border-b border-gray-200 pb-1">{children}</h1>,
                        h2: ({children}) => <h2 className="text-lg font-semibold text-gray-900 mt-4 mb-2 first:mt-0">{children}</h2>,
                        h3: ({children}) => <h3 className="text-base font-semibold text-gray-900 mt-3 mb-1 first:mt-0">{children}</h3>,
                        p: ({children}) => <p className="text-gray-700 mb-3 last:mb-0 leading-relaxed">{children}</p>,
                        ul: ({children}) => <ul className="list-disc pl-5 mb-3 text-gray-700 space-y-1">{children}</ul>,
                        ol: ({children}) => <ol className="list-decimal pl-5 mb-3 text-gray-700 space-y-1">{children}</ol>,
                        li: ({children}) => <li className="text-gray-700 leading-relaxed">{children}</li>,
                        code: ({className, children}) => {
                          const isInline = !className;
                          return isInline
                            ? <code className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-xs font-mono border border-blue-100">{children}</code>
                            : <code className={`font-mono text-xs text-gray-800 ${className ?? ''}`}>{children}</code>;
                        },
                        pre: ({children}) => (
                          <pre className="bg-gray-900 text-gray-100 p-4 rounded-xl overflow-x-auto mb-3 text-xs font-mono leading-relaxed border border-gray-700">
                            {children}
                          </pre>
                        ),
                        strong: ({children}) => <strong className="font-semibold text-gray-900">{children}</strong>,
                        a: ({href, children}) => (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">{children}</a>
                        ),
                      }}
                    >
                      {streamingMessage}
                    </ReactMarkdown>
                    {/* Blinking cursor at end of stream */}
                    <span className="inline-block w-0.5 h-4 ml-0.5 bg-gray-500 animate-pulse align-middle" />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Scroll to latest floating button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-24 right-6 z-50 flex items-center gap-2 bg-purple-600 text-white rounded-full px-4 py-2 shadow-lg text-sm hover:bg-purple-700 hover:scale-[1.02] transition-all duration-200"
        >
          <ArrowDown className="w-4 h-4" />
          {isLoading ? "Streaming…" : "New message"}
        </button>
      )}

      {/* Input Area */}
      <div className="bg-white border-t border-gray-200 p-6">
        <div className="max-w-4xl mx-auto">

          {/* Code Context Indicator — shown when last prompt was code_* type */}
          {lastCodeContext && projectLocalFolderPath && (
            <div className="mb-2 px-1">
              <CodeContextIndicator codeContext={lastCodeContext} />
            </div>
          )}

          {/* Context Status Bar */}
          {contextStatus && contextStatus.limit_tokens > 0 && (() => {
            const pct = contextStatus.current_tokens / contextStatus.limit_tokens;
            const colors = getContextBarColor(pct);
            const barWidth = `${Math.min(pct * 100, 100).toFixed(1)}%`;
            return (
              <div className="mb-2 flex items-center gap-3 text-xs">
                <div className="flex-1">
                  <div className="h-1.5 w-full rounded-full bg-gray-200">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-500 ${colors.bar}`}
                      style={{ width: barWidth }}
                    />
                  </div>
                </div>
                <span className={`shrink-0 font-medium ${colors.text}`}>
                  {(pct * 100).toFixed(0)}% of context used
                </span>
                {contextStatus.compression_count > 0 && (
                  <span className="shrink-0 text-gray-400">
                    · Compressed {contextStatus.compression_count}×
                  </span>
                )}
              </div>
            );
          })()}

          {/* Prompt Suggestion Banner */}
          {bannerVisible && lastEvaluation && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="font-medium text-amber-800">
                    Prompt score:{" "}
                    <span className={getScoreColor(lastEvaluation.score)}>
                      {lastEvaluation.score}/10
                    </span>
                    {" "}— Suggestion available
                  </span>
                  {lastRecommendation && (
                    <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 flex items-center gap-1">
                      <Cpu className="w-3 h-3" />
                      {lastRecommendation.display_name}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-amber-700 hover:text-amber-900"
                    onClick={() => setBannerExpanded(v => !v)}
                  >
                    {bannerExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-amber-700 hover:text-amber-900"
                    onClick={dismissBanner}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {bannerExpanded && (
                <div className="mt-3 space-y-3">
                  {lastEvaluation.issues.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-amber-700 mb-1">Issues:</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {lastEvaluation.issues.map((issue, i) => (
                          <li key={i} className="text-xs text-amber-800">{issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="rounded-lg bg-white border border-amber-200 p-2.5">
                    <p className="text-xs font-medium text-amber-700 mb-1">Suggested prompt:</p>
                    <p className="text-xs text-gray-700 whitespace-pre-wrap">{lastEvaluation.improved_prompt}</p>
                  </div>
                  {lastRecommendation && (
                    <div className="rounded-lg bg-white border border-amber-200 p-2.5">
                      <p className="text-xs font-medium text-amber-700 mb-1">Recommended model for next message:</p>
                      <p className="text-xs text-gray-700">
                        <span className="font-medium">{lastRecommendation.display_name}</span>
                        {" — "}{lastRecommendation.reasoning}
                        <span className="text-gray-400 ml-1">
                          (~${(lastRecommendation.estimated_cost_per_1k_tokens * 1000).toFixed(2)}/1K tokens)
                        </span>
                      </p>
                      {onModelOverride && (
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
                            onClick={() => {
                              onModelOverride(lastRecommendation.model);
                              toast({ title: "Model override set", description: `Next message will use ${lastRecommendation.display_name}` });
                              dismissBanner();
                            }}
                          >
                            Use {lastRecommendation.display_name}
                          </Button>
                          {currentModelOverride && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs text-gray-500"
                              onClick={() => { onModelOverride(null); dismissBanner(); }}
                            >
                              Clear override
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white"
                      onClick={useImprovedPrompt}
                    >
                      Use suggested prompt
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={dismissBanner}
                    >
                      Keep mine
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Model status pill */}
          <div className="mb-2">
            {currentModelOverride ? (
              /* Manual override active */
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 px-2 py-1 rounded-full bg-gray-100 hover:bg-gray-200">
                <Cpu className="w-3 h-3 text-blue-500" />
                ⚡ {currentModelOverride.includes("/") ? currentModelOverride.slice(currentModelOverride.indexOf("/") + 1) : currentModelOverride}
                <span className="text-gray-400">· Manual override</span>
                {onModelOverride && (
                  <button
                    onClick={() => onModelOverride(null)}
                    className="ml-0.5 text-gray-400 hover:text-red-500 transition-colors"
                    title="Reset to auto"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ) : (
              /* Auto mode — show recommendation if available, else generic */
              <button
                type="button"
                onClick={() => setShowInlineModelPicker(v => !v)}
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 px-2 py-1 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <Cpu className={`w-3 h-3 ${lastRecommendation ? "text-green-500" : "text-gray-400"}`} />
                {lastRecommendation
                  ? <>⚡ Auto: {lastRecommendation.display_name}</>
                  : <>⚡ AI Engine: Auto</>
                }
                <span className="text-gray-400 underline">· Change model</span>
              </button>
            )}
          </div>

          {/* Inline model picker — appears when user clicks "Change model" */}
          {showInlineModelPicker && !currentModelOverride && onModelOverride && (
            <div className="mb-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                  <Cpu className="w-3 h-3" /> Override AI model for next message
                </span>
                <button
                  type="button"
                  onClick={() => { setShowInlineModelPicker(false); setInlinePickerProvider(""); setInlinePickerModel(""); }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <ModelPicker
                provider={inlinePickerProvider}
                model={inlinePickerModel}
                onProviderChange={setInlinePickerProvider}
                onModelChange={(m) => {
                  setInlinePickerModel(m);
                  if (m) {
                    onModelOverride(m);
                    setShowInlineModelPicker(false);
                    setInlinePickerProvider("");
                    setInlinePickerModel("");
                    toast({ title: "Model override set", description: `Next message will use ${m.includes("/") ? m.slice(m.indexOf("/") + 1) : m}` });
                  }
                }}
                providerPlaceholder="Select provider"
                modelPlaceholder="Select model"
              />
            </div>
          )}

          <div className="flex items-end space-x-4">
            <div className="flex-1">
              <div className="relative">
                <Textarea
                  ref={textareaRef}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your message..."
                  className="w-full min-h-[3rem] max-h-32 px-4 py-3 pr-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-200 resize-none"
                  disabled={isLoading}
                />
                {projectLocalFolderPath && projectId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-3 top-3 p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                    title="Attach File from Project"
                    onClick={() => setShowFileBrowserDialog(true)}
                  >
                    <Paperclip className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
            <Button
              onClick={handleSend}
              disabled={!inputMessage.trim() || isLoading}
              className="px-6 py-3 gradient-bg text-white rounded-xl font-medium hover:shadow-lg transition-all duration-200 flex items-center space-x-2"
            >
              <Send className="w-4 h-4" />
              <span>Send</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
