"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { PanelLeft, Plus, User, X, FileText, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { API_ROUTES, UI_CONFIG, APP_NAME } from "@/config/constants";
import { Streamdown } from "streamdown";

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
  const [files, setFiles] = useState<FileList | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: API_ROUTES.chat,
    }),
  });

  const isLoading = status === "submitted" || status === "streaming";

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFiles(event.target.files);
    }
  };

  // Remove selected files
  const handleRemoveFiles = () => {
    setFiles(undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && (!files || files.length === 0)) return;

    const fileParts = files && files.length > 0 ? await convertFilesToDataURLs(files) : [];

    sendMessage({
      role: "user",
      parts: [{ type: "text", text: input }, ...fileParts],
    });

    setInput("");
    setFiles(undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#212121] text-white relative overflow-hidden">
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
              alt="TRADOS Logo"
              width={28}
              height={28}
              className="h-7 w-7"
            />
            <span className="text-base font-semibold bg-gradient-to-r from-[#8353fd] to-[#e60054] bg-clip-text text-transparent">
              {APP_NAME}
            </span>
          </div>

          {/* Sidebar Content - Chat History Placeholder */}
          <div className="flex-1 overflow-y-auto p-2">
            <div className="text-sm text-white/50 p-3">
              Chat history will appear here
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex flex-1 flex-col overflow-hidden relative z-10">
        {/* Top Bar with Toggle */}
        <div className="relative flex h-12 items-center bg-[#212121] px-3 border-b border-white/5">
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

        {/* Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {messages.length === 0 ? (
            /* Welcome Screen - Centered Layout */
            <div className="flex-1 flex items-center justify-center px-4 pb-24">
              <div className="w-full max-w-4xl">
                {/* Welcome Message with Logo - Centered */}
                <div className="text-center mb-8 -mt-16">
                  <Image
                    src="/trados-logo.svg"
                    alt="TRADOS Logo"
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
                  {files && files.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {Array.from(files).map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 bg-[#2f2f2f] rounded-lg px-3 py-2 text-sm"
                        >
                          {file.type.startsWith("image/") ? (
                            <ImageIcon className="h-4 w-4 text-white/70" />
                          ) : (
                            <FileText className="h-4 w-4 text-white/70" />
                          )}
                          <span className="text-white/90 max-w-[200px] truncate">
                            {file.name}
                          </span>
                          <button
                            type="button"
                            onClick={handleRemoveFiles}
                            className="text-white/50 hover:text-white"
                          >
                            <X className="h-4 w-4" />
                          </button>
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
                      className="w-full h-[52px] rounded-[26px] border-0 bg-[#2f2f2f] pl-14 pr-4 text-[15px] text-white placeholder:text-white/50 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-lg disabled:opacity-50"
                    />
                  </form>
                </div>
              </div>
            </div>
          ) : (
            /* Chat Mode - Messages with Fixed Input at Bottom */
            <>
              {/* Messages Container - Scrollable */}
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="w-full max-w-4xl mx-auto">
                  <div className="space-y-6">
                    {messages.map((message) => (
                      <div key={message.id} className="flex flex-col">
                        <div
                          className={`flex items-start gap-3 ${
                            message.role === "user" ? "justify-end" : ""
                          }`}
                        >
                          {message.role === "assistant" && (
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[#8353fd] to-[#e60054] flex items-center justify-center">
                              <Image
                                src="/trados-logo.svg"
                                alt="AI"
                                width={18}
                                height={18}
                                className="opacity-90"
                              />
                            </div>
                          )}
                          <div
                            className={`max-w-[80%] rounded-2xl px-4 py-3 ${
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
                                      <div key={i} className="rounded-lg overflow-hidden">
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
                                      <div key={i} className="rounded-lg overflow-hidden border border-white/10">
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

                            {/* Render text content */}
                            <div className="text-[15px] leading-relaxed prose prose-invert prose-sm max-w-none">
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
                          {message.role === "user" && (
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[#8353fd] to-[#e60054] flex items-center justify-center">
                              <User className="w-4 h-4 text-white" />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {/* Only show thinking bubble when loading and no streaming message */}
                    {isLoading && status === "submitted" && (
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[#8353fd] to-[#e60054] flex items-center justify-center">
                          <Image
                            src="/trados-logo.svg"
                            alt="AI"
                            width={18}
                            height={18}
                            className="opacity-90 animate-pulse"
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
                  {files && files.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {Array.from(files).map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 bg-[#2f2f2f] rounded-lg px-3 py-2 text-sm"
                        >
                          {file.type.startsWith("image/") ? (
                            <ImageIcon className="h-4 w-4 text-white/70" />
                          ) : (
                            <FileText className="h-4 w-4 text-white/70" />
                          )}
                          <span className="text-white/90 max-w-[200px] truncate">
                            {file.name}
                          </span>
                          <button
                            type="button"
                            onClick={handleRemoveFiles}
                            className="text-white/50 hover:text-white"
                          >
                            <X className="h-4 w-4" />
                          </button>
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
                      className="w-full h-[52px] rounded-[26px] border-0 bg-[#2f2f2f] pl-14 pr-4 text-[15px] text-white placeholder:text-white/50 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-lg disabled:opacity-50"
                    />
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
