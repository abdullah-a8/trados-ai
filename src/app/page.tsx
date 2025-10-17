"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { PanelLeft, Plus, User, X, FileText, MessageSquarePlus, Trash2, ArrowUp, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { API_ROUTES, UI_CONFIG, APP_NAME } from "@/config/constants";
import { Streamdown } from "streamdown";
import { nanoid } from "nanoid";
import { StoredChat } from "@/lib/redis";
import { marked } from "marked";

// Helper function to convert files to Data URLs
async function convertFilesToDataURLs(files: FileList) {
  return Promise.all(
    Array.from(files).map(
      (file) =>
        new Promise<{
          type: "file";
          mediaType: string;
          url: string;
          filename: string;
        }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              type: "file",
              mediaType: file.type,
              url: reader.result as string,
              filename: file.name,
            });
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        })
    )
  );
}

export default function Home() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [chatHistory, setChatHistory] = useState<StoredChat[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasGeneratedTitle = useRef(false);
  const dragCounter = useRef(0);

  // Session-aware chat ID management
  const [chatId, setChatId] = useState(() => {
    if (typeof window !== 'undefined') {
      // Check if there's a session flag (set when explicitly loading a chat)
      const sessionId = sessionStorage.getItem('currentChatId');
      if (sessionId) {
        // This is a refresh of an existing session
        return sessionId;
      }
      // New session - always start fresh
      const newId = nanoid();
      sessionStorage.setItem('currentChatId', newId);
      return newId;
    }
    return nanoid();
  });

  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: chatId, // Use the chat ID
    transport: new DefaultChatTransport({
      api: API_ROUTES.chat,
      // IMPORTANT: Only send the last message to reduce network traffic
      prepareSendMessagesRequest({ messages, id }) {
        return {
          body: {
            message: messages[messages.length - 1], // Only last message
            id // Chat ID
          }
        };
      },
    }),
  });

  const isLoading = status === "submitted" || status === "streaming";

  // Load chat history list on mount
  useEffect(() => {
    const loadChatsHistory = async () => {
      try {
        const response = await fetch(API_ROUTES.chats);
        if (response.ok) {
          const data = await response.json();
          setChatHistory(data.chats || []);
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadChatsHistory();
  }, []);

  // Load current chat messages on mount or chat ID change
  useEffect(() => {
    const loadChatMessages = async () => {
      try {
        const response = await fetch(`${API_ROUTES.chat}?id=${chatId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.messages && data.messages.length > 0) {
            setMessages(data.messages);
          }
        }
      } catch (error) {
        console.error('Failed to load chat messages:', error);
      }
    };

    loadChatMessages();
  }, [chatId, setMessages]);

  // Generate AI title after first exchange and add to sidebar
  useEffect(() => {
    const generateTitleAndAddToSidebar = async () => {
      // After first exchange (user + assistant), generate AI title
      if (messages.length >= 2 && !hasGeneratedTitle.current) {
        hasGeneratedTitle.current = true;
        const firstUserMessage = messages.find(m => m.role === 'user');
        if (firstUserMessage) {
          const textPart = firstUserMessage.parts.find(p => p.type === 'text');
          if (textPart && textPart.text) {
            try {
              const titleResponse = await fetch(API_ROUTES.generateTitle, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chatId,
                  firstMessage: textPart.text,
                }),
              });

              if (titleResponse.ok) {
                const { title } = await titleResponse.json();

                // Add the new chat to sidebar with AI-generated title
                const newChat: StoredChat = {
                  id: chatId,
                  title,
                  messages: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };

                setChatHistory(prev => {
                  // Check if chat already exists (in case of race condition)
                  if (prev.some(c => c.id === chatId)) {
                    // Update existing
                    return prev.map(chat =>
                      chat.id === chatId
                        ? { ...chat, title, updatedAt: new Date().toISOString() }
                        : chat
                    );
                  }
                  // Add new chat at the top
                  return [newChat, ...prev];
                });
              }
            } catch (error) {
              console.error('Failed to generate title:', error);
            }
          }
        }
      }
    };

    generateTitleAndAddToSidebar();
  }, [messages, chatId]);

  // Handle creating a new chat
  const handleNewChat = () => {
    const newId = nanoid();
    setChatId(newId);
    sessionStorage.setItem('currentChatId', newId);
    setMessages([]);
    hasGeneratedTitle.current = false;
  };

  // Handle loading a previous chat
  const handleLoadChat = async (selectedChatId: string) => {
    setChatId(selectedChatId);
    sessionStorage.setItem('currentChatId', selectedChatId);
    hasGeneratedTitle.current = true; // Don't regenerate title for existing chats

    try {
      const response = await fetch(`${API_ROUTES.chat}?id=${selectedChatId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.messages) {
          setMessages(data.messages);
        }
      }
    } catch (error) {
      console.error('Failed to load chat:', error);
    }
  };

  // Handle deleting a chat
  const handleDeleteChat = async (chatIdToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering chat load

    try {
      const response = await fetch(`${API_ROUTES.chats}?id=${chatIdToDelete}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Remove from local state
        setChatHistory(prev => prev.filter(chat => chat.id !== chatIdToDelete));

        // If we deleted the current chat, create a new one
        if (chatIdToDelete === chatId) {
          handleNewChat();
        }
      }
    } catch (error) {
      console.error('Failed to delete chat:', error);
    }
  };

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      // Add new files to existing files
      setFiles(prev => [...prev, ...Array.from(event.target.files!)]);
    }
  };

  // Remove individual file
  const handleRemoveFile = (indexToRemove: number) => {
    setFiles(prev => prev.filter((_, index) => index !== indexToRemove));
    // Reset the file input to allow re-selecting the same file
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      // Filter for supported file types
      const supportedFiles = Array.from(droppedFiles).filter(file =>
        file.type.startsWith('image/') || file.type === 'application/pdf'
      );

      if (supportedFiles.length > 0) {
        // Add to existing files instead of replacing
        setFiles(prev => [...prev, ...supportedFiles]);
      }
    }
  };

  // Handle copying message text with rich formatting
  const handleCopyMessage = async (messageId: string, text: string) => {
    try {
      // Convert markdown to HTML
      const htmlContent = await marked(text);

      // Create clipboard items with both HTML and plain text formats
      const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
      const textBlob = new Blob([text], { type: 'text/plain' });

      const clipboardItem = new ClipboardItem({
        'text/html': htmlBlob,
        'text/plain': textBlob
      });

      await navigator.clipboard.write([clipboardItem]);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
      // Fallback to plain text if clipboard API fails
      try {
        await navigator.clipboard.writeText(text);
        setCopiedMessageId(messageId);
        setTimeout(() => setCopiedMessageId(null), 2000);
      } catch (fallbackErr) {
        console.error('Fallback copy also failed:', fallbackErr);
      }
    }
  };

  // Handle manual text selection copy - intercept and provide clean HTML
  const handleManualCopy = (e: React.ClipboardEvent) => {
    e.preventDefault();

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    try {
      // Get the HTML content from the selection
      const range = selection.getRangeAt(0);
      const fragment = range.cloneContents();

      // Create a temporary container
      const tempDiv = document.createElement('div');
      tempDiv.appendChild(fragment);

      // Function to recursively clean styles from elements
      const cleanElement = (element: Element) => {
        // Remove unwanted inline styles but keep the element structure
        if (element instanceof HTMLElement) {
          // Remove specific style properties that cause issues
          element.style.removeProperty('background-color');
          element.style.removeProperty('background');
          element.style.removeProperty('color');
          element.style.removeProperty('border');
          element.style.removeProperty('border-color');
          element.style.removeProperty('padding');
          element.style.removeProperty('margin');

          // If no styles remain, remove the style attribute entirely
          if (element.style.length === 0) {
            element.removeAttribute('style');
          }

          // Remove class attributes that contain styling
          element.removeAttribute('class');
        }

        // Recursively clean child elements
        Array.from(element.children).forEach(child => cleanElement(child));
      };

      // Clean all elements in the selection
      Array.from(tempDiv.children).forEach(child => cleanElement(child));

      // Get the cleaned HTML
      const cleanedHtml = tempDiv.innerHTML;
      const plainText = selection.toString();

      // Set clipboard data with both formats
      e.clipboardData.setData('text/html', cleanedHtml);
      e.clipboardData.setData('text/plain', plainText);
    } catch (err) {
      console.error('Failed to process copy:', err);
      // Fallback to plain text
      const plainText = selection.toString();
      e.clipboardData.setData('text/plain', plainText);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && files.length === 0) return;

    // Convert File[] to FileList for the conversion function
    const dataTransfer = new DataTransfer();
    files.forEach(file => dataTransfer.items.add(file));
    const fileParts = files.length > 0 ? await convertFilesToDataURLs(dataTransfer.files) : [];

    sendMessage({
      role: "user",
      parts: [{ type: "text", text: input }, ...fileParts],
    });

    setInput("");
    setFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Auto-scroll to bottom when new messages arrive
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex h-screen w-screen bg-[#212121] text-white relative overflow-hidden fixed inset-0">
      {/* Subtle Brand Gradient Background */}
      <div className="absolute inset-0 opacity-[0.15] pointer-events-none">
        <div className="absolute top-0 right-0 w-[1000px] h-[1000px] bg-gradient-to-br from-[#8353fd] via-[#6942ca] to-transparent blur-[150px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-[800px] h-[800px] bg-gradient-to-tr from-[#e60054] via-[#eb3376] to-transparent blur-[130px] rounded-full" />
      </div>

      {/* Left Sidebar */}
      <aside
        className={`${
          isSidebarOpen ? "w-64" : "w-0"
        } flex-shrink-0 border-r border-white/10 bg-[#171717] transition-all duration-300 ease-in-out overflow-hidden relative z-10`}
      >
        {/* Subtle gradient from bottom up */}
        <div className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-[#8353fd]/8 via-[#6942ca]/4 to-transparent pointer-events-none" />

        <div className="flex h-full flex-col relative z-10">
          {/* Sidebar Header with Logo */}
          <div className="flex items-center gap-3 border-b border-white/10 p-4">
            <Image
              src="/trados-logo.svg"
              alt="TRADOS by GLI Logo"
              width={28}
              height={28}
              className="h-7 w-7"
            />
            <span className="text-base font-semibold bg-gradient-to-r from-[#8353fd] to-[#e60054] bg-clip-text text-transparent">
              TRADOS <span className="text-xs">by</span> GLI
            </span>
          </div>

          {/* New Chat Button */}
          <div className="p-2 border-b border-white/10">
            <Button
              onClick={handleNewChat}
              className="w-full h-10 bg-white/5 hover:bg-white/10 text-white border border-white/10 flex items-center justify-center gap-2"
            >
              <MessageSquarePlus className="h-4 w-4" />
              <span>New Chat</span>
            </Button>
          </div>

          {/* Chat History */}
          <div className="flex-1 overflow-y-auto p-2">
            {isLoadingHistory ? (
              <div className="text-sm text-white/50 p-3 text-center">
                Loading chats...
              </div>
            ) : chatHistory.length === 0 ? (
              <div className="text-sm text-white/50 p-3 text-center">
                No chat history yet
              </div>
            ) : (
              <div className="space-y-1">
                {chatHistory.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => handleLoadChat(chat.id)}
                    className={`group relative flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                      chat.id === chatId
                        ? "bg-white/10 text-white"
                        : "hover:bg-white/5 text-white/70 hover:text-white"
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-sm font-medium truncate">
                        {chat.title}
                      </p>
                      <p className="text-xs text-white/50 mt-0.5">
                        {new Date(chat.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => handleDeleteChat(chat.id, e)}
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Current Session Info */}
          <div className="p-3 border-t border-white/10">
            <div className="text-xs text-white/50">
              <p className="font-medium mb-1">Current Session</p>
              <p className="truncate">ID: {chatId.slice(0, 8)}...</p>
              <p className="mt-0.5">Messages: {messages.length}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main
        className="flex flex-1 flex-col relative z-10 min-h-0"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Top Bar with Toggle */}
        <div className="relative flex h-12 flex-shrink-0 items-center bg-[#212121] px-3 border-b border-white/5">
          {/* Subtle gradient overlay for header */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#8353fd]/6 via-transparent to-[#e60054]/6 pointer-events-none" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="h-8 w-8 text-white/70 hover:bg-white/10 hover:text-white relative z-10"
          >
            <PanelLeft className="h-5 w-5" />
            <span className="sr-only">Toggle sidebar</span>
          </Button>
        </div>

        {/* Drag and Drop Overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-50 bg-[#212121]/95 backdrop-blur-sm border-4 border-dashed border-[#8353fd] rounded-lg m-4 flex items-center justify-center">
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#8353fd] to-[#e60054] flex items-center justify-center">
                <Plus className="w-12 h-12 text-white" />
              </div>
              <h3 className="text-2xl font-semibold text-white mb-2">Drop files here</h3>
              <p className="text-white/60">Upload images or PDF documents</p>
            </div>
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {messages.length === 0 ? (
            /* Welcome Screen - Centered Layout */
            <div className="flex-1 flex items-center justify-center px-4 pb-24 overflow-hidden">
              <div className="w-full max-w-4xl">
                {/* Welcome Message with Logo - Centered */}
                <div className="text-center mb-8 -mt-16">
                  <Image
                    src="/trados-logo.svg"
                    alt="TRADOS by GLI Logo"
                    width={64}
                    height={64}
                    className="mx-auto mb-6 h-16 w-16 opacity-60"
                  />
                  <h1 className="text-[32px] font-normal text-white/90 mb-6">
                    {UI_CONFIG.chat.welcomeMessage}
                  </h1>
                </div>

                {/* Message Input - Centered */}
                <div className="w-full max-w-4xl mx-auto">
                  {/* File Preview */}
                  {files.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {files.map((file, index) => (
                        <div
                          key={index}
                          className="relative group bg-[#2f2f2f] rounded-lg overflow-hidden"
                        >
                          {file.type.startsWith("image/") ? (
                            // Image thumbnail preview
                            <div className="relative w-20 h-20">
                              <Image
                                src={URL.createObjectURL(file)}
                                alt={file.name}
                                fill
                                className="object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveFile(index)}
                                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white/90 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            // PDF/Document preview
                            <div className="flex items-center gap-2 px-3 py-2 text-sm min-w-[120px]">
                              <FileText className="h-4 w-4 text-white/70 flex-shrink-0" />
                              <span className="text-white/90 max-w-[150px] truncate text-xs">
                                {file.name}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveFile(index)}
                                className="text-white/50 hover:text-white ml-auto"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="relative flex items-center">
                    {/* Hidden File Input */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      accept="image/*,application/pdf"
                      multiple
                      className="hidden"
                    />

                    {/* Plus Button */}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute left-3 h-8 w-8 text-white/50 hover:bg-white/10 hover:text-white z-10"
                    >
                      <Plus className="h-5 w-5" />
                      <span className="sr-only">Attach</span>
                    </Button>

                    {/* Input Field */}
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={UI_CONFIG.chat.inputPlaceholder}
                      disabled={isLoading}
                      className="w-full h-[52px] rounded-[26px] border-0 bg-[#2f2f2f] pl-14 pr-14 text-[15px] text-white placeholder:text-white/50 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-lg disabled:opacity-50"
                    />

                    {/* Send Button */}
                    <Button
                      type="submit"
                      size="icon"
                      disabled={isLoading || (!input.trim() && files.length === 0)}
                      className={`absolute right-2 h-9 w-9 rounded-full transition-all duration-200 ${
                        input.trim() || files.length > 0
                          ? "bg-white text-black hover:bg-white/90"
                          : "bg-white/10 text-white/30 hover:bg-white/20"
                      }`}
                    >
                      <ArrowUp className="h-5 w-5" />
                      <span className="sr-only">Send message</span>
                    </Button>
                  </form>
                </div>
              </div>
            </div>
          ) : (
            /* Chat Mode - Messages with Fixed Input at Bottom */
            <>
              {/* Messages Container - Scrollable with proper flex */}
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4">
                <div className="w-full max-w-4xl mx-auto">
                  <div className="space-y-6">
                    {messages.map((message) => {
                      const textContent = message.parts
                        .filter((part) => part.type === "text")
                        .map((part) => part.text)
                        .join("\n");

                      return (
                        <div key={message.id} className="flex flex-col">
                          <div
                            className={`flex items-start gap-3 ${
                              message.role === "user" ? "justify-end" : ""
                            }`}
                          >
                            {message.role === "assistant" && (
                              <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                                <Image
                                  src="/trados-logo.svg"
                                  alt="AI"
                                  width={32}
                                  height={32}
                                  className="w-8 h-8"
                                />
                              </div>
                            )}
                            <div className="group relative flex flex-col max-w-[80%] min-w-0">
                              <div
                                onCopy={handleManualCopy}
                                className={`rounded-2xl px-4 py-3 select-text overflow-hidden ${
                                  message.role === "user"
                                    ? "bg-[#2f2f2f] text-white"
                                    : "bg-[#2a2a2a] text-white/90"
                                }`}
                              >
                                {/* Render file attachments */}
                                <div className="space-y-2 mb-2">
                                  {message.parts
                                    .filter((part) => part.type === "file")
                                    .map((part, i) => {
                                      if (part.mediaType?.startsWith("image/")) {
                                        return (
                                          <div key={i} className="rounded-lg overflow-hidden select-none">
                                            <Image
                                              src={part.url}
                                              alt={part.filename || `image-${i}`}
                                              width={400}
                                              height={300}
                                              className="max-w-full h-auto"
                                            />
                                          </div>
                                        );
                                      }
                                      if (part.mediaType === "application/pdf") {
                                        return (
                                          <div key={i} className="rounded-lg overflow-hidden border border-white/10 select-none">
                                            <div className="flex items-center gap-2 p-2 bg-[#1a1a1a]">
                                              <FileText className="h-4 w-4 text-white/70" />
                                              <span className="text-sm text-white/90">
                                                {part.filename || `document-${i}.pdf`}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      }
                                      return null;
                                    })}
                                </div>

                                {/* Render text content - with proper overflow handling */}
                                <div className="text-[15px] leading-relaxed prose prose-invert prose-sm max-w-none select-text [&_*]:select-text overflow-x-auto">
                                  {message.parts
                                    .filter((part) => part.type === "text")
                                    .map((part, i) => (
                                      <Streamdown
                                        key={i}
                                        isAnimating={status === "streaming"}
                                      >
                                        {part.text}
                                      </Streamdown>
                                    ))}
                                </div>
                              </div>

                              {/* Copy Button */}
                              {textContent && (
                                <button
                                  onClick={() => handleCopyMessage(message.id, textContent)}
                                  className={`absolute -bottom-8 ${
                                    message.role === "user" ? "right-0" : "left-0"
                                  } flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#2a2a2a] hover:bg-[#333333] border border-white/10 opacity-0 group-hover:opacity-100 transition-all duration-200 text-xs text-white/70 hover:text-white/90`}
                                >
                                  {copiedMessageId === message.id ? (
                                    <>
                                      <Check className="h-3.5 w-3.5" />
                                      <span>Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3.5 w-3.5" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                            {message.role === "user" && (
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[#8353fd] to-[#e60054] flex items-center justify-center">
                                <User className="w-4 h-4 text-white" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {/* Only show thinking bubble when loading and no streaming message */}
                    {isLoading && status === "submitted" && (
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                          <Image
                            src="/trados-logo.svg"
                            alt="AI"
                            width={32}
                            height={32}
                            className="w-8 h-8 animate-pulse"
                          />
                        </div>
                        <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-[#2a2a2a]">
                          <div className="flex gap-1">
                            <div className="w-2 h-2 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                  {error && (
                    <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                      Error: {error.message}
                    </div>
                  )}
                </div>
              </div>

              {/* Message Input - Fixed at Bottom */}
              <div className="flex-shrink-0 border-t border-white/10 bg-[#212121] px-4 py-4">
                <div className="w-full max-w-4xl mx-auto">
                  {/* File Preview */}
                  {files.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {files.map((file, index) => (
                        <div
                          key={index}
                          className="relative group bg-[#2f2f2f] rounded-lg overflow-hidden"
                        >
                          {file.type.startsWith("image/") ? (
                            // Image thumbnail preview
                            <div className="relative w-20 h-20">
                              <Image
                                src={URL.createObjectURL(file)}
                                alt={file.name}
                                fill
                                className="object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveFile(index)}
                                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white/90 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            // PDF/Document preview
                            <div className="flex items-center gap-2 px-3 py-2 text-sm min-w-[120px]">
                              <FileText className="h-4 w-4 text-white/70 flex-shrink-0" />
                              <span className="text-white/90 max-w-[150px] truncate text-xs">
                                {file.name}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveFile(index)}
                                className="text-white/50 hover:text-white ml-auto"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="relative flex items-center">
                    {/* Hidden File Input */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      accept="image/*,application/pdf"
                      multiple
                      className="hidden"
                    />

                    {/* Plus Button */}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute left-3 h-8 w-8 text-white/50 hover:bg-white/10 hover:text-white z-10"
                    >
                      <Plus className="h-5 w-5" />
                      <span className="sr-only">Attach</span>
                    </Button>

                    {/* Input Field */}
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={UI_CONFIG.chat.inputPlaceholder}
                      disabled={isLoading}
                      className="w-full h-[52px] rounded-[26px] border-0 bg-[#2f2f2f] pl-14 pr-14 text-[15px] text-white placeholder:text-white/50 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-lg disabled:opacity-50"
                    />

                    {/* Send Button */}
                    <Button
                      type="submit"
                      size="icon"
                      disabled={isLoading || (!input.trim() && files.length === 0)}
                      className={`absolute right-2 h-9 w-9 rounded-full transition-all duration-200 ${
                        input.trim() || files.length > 0
                          ? "bg-white text-black hover:bg-white/90"
                          : "bg-white/10 text-white/30 hover:bg-white/20"
                      }`}
                    >
                      <ArrowUp className="h-5 w-5" />
                      <span className="sr-only">Send message</span>
                    </Button>
                  </form>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
