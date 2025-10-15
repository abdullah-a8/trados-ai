"use client";

import { useState } from "react";
import Image from "next/image";
import { PanelLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Home() {
  const [message, setMessage] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    // TODO: Handle message sending
    console.log("Message:", message);
    setMessage("");
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
        <div className="flex h-full flex-col">
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
              TRADOS AI
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
        <div className="flex h-12 items-center bg-[#212121] px-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="h-8 w-8 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <PanelLeft className="h-5 w-5" />
            <span className="sr-only">Toggle sidebar</span>
          </Button>
        </div>

        {/* Chat Area with Centered Content */}
        <div className="flex-1 flex items-center justify-center overflow-y-auto px-4 pb-24">
          <div className="w-full max-w-4xl -mt-16">
            {/* Welcome Message with Logo */}
            <div className="text-center mb-6">
              <Image
                src="/trados-logo.svg"
                alt="TRADOS Logo"
                width={64}
                height={64}
                className="mx-auto mb-6 h-16 w-16 opacity-60"
              />
              <h1 className="text-[32px] font-normal text-white/90 mb-6">
                What can I help you translate today?
              </h1>
            </div>

            {/* Message Input - Centered and Wide */}
            <div className="w-full max-w-[48rem] mx-auto">
              <form onSubmit={handleSendMessage} className="relative flex items-center">
                {/* Plus Button */}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute left-3 h-8 w-8 text-white/50 hover:bg-white/10 hover:text-white z-10"
                >
                  <Plus className="h-5 w-5" />
                  <span className="sr-only">Attach</span>
                </Button>

                {/* Input Field */}
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Ask anything..."
                  className="w-full h-[52px] rounded-[26px] border-0 bg-[#2f2f2f] pl-14 pr-4 text-[15px] text-white placeholder:text-white/50 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-lg"
                />
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
