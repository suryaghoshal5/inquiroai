import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Share, 
  Settings, 
  Copy, 
  ThumbsUp, 
  ThumbsDown, 
  Paperclip,
  Send,
  MoreHorizontal
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Chat, Message } from "@/types";

interface ChatInterfaceProps {
  chat: Chat;
  messages: Message[];
  onSendMessage: (content: string) => void;
  isLoading: boolean;
  ws: WebSocket | null;
}

export default function ChatInterface({ 
  chat, 
  messages, 
  onSendMessage, 
  isLoading,
  ws 
}: ChatInterfaceProps) {
  const [inputMessage, setInputMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputMessage]);

  // Handle typing indicators via WebSocket
  useEffect(() => {
    if (ws && isTyping) {
      ws.send(JSON.stringify({
        type: "typing",
        chatId: chat.id,
        userId: "current_user",
        isTyping: true
      }));

      const timer = setTimeout(() => {
        setIsTyping(false);
        ws.send(JSON.stringify({
          type: "typing",
          chatId: chat.id,
          userId: "current_user",
          isTyping: false
        }));
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [ws, isTyping, chat.id]);

  const handleSend = () => {
    if (!inputMessage.trim() || isLoading) return;
    
    onSendMessage(inputMessage.trim());
    setInputMessage("");
    setIsTyping(false);
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
    return new Date(date).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Chat Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center role-${chat.role.replace('_', '-')}`}>
              {getRoleIcon(chat.role)}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{chat.title}</h3>
              <p className="text-sm text-gray-500">
                {chat.role === 'custom' ? chat.customRole : chat.role.replace('_', ' ')} • 
                <span className="text-green-600 ml-1">{chat.aiModel}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="sm" title="Share Chat">
              <Share className="w-4 h-4 text-gray-500" />
            </Button>
            <Button variant="ghost" size="sm" title="Chat Settings">
              <Settings className="w-4 h-4 text-gray-500" />
            </Button>
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="w-4 h-4 text-gray-500" />
            </Button>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-6">
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
                      ? 'chat-bubble-user text-white rounded-br-md'
                      : 'chat-bubble-ai text-white rounded-bl-md'
                  }`}
                >
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </div>
                </div>
                <div className={`mt-2 flex items-center ${message.role === 'user' ? 'justify-end' : 'justify-between'}`}>
                  <div className="text-xs text-gray-500">
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

          {/* Typing Indicator */}
          {isLoading && (
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

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="bg-white border-t border-gray-200 p-6">
        <div className="max-w-4xl mx-auto">
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-3 top-3 p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                  title="Attach File"
                >
                  <Paperclip className="w-4 h-4" />
                </Button>
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
