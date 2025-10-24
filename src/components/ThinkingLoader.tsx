"use client";

import { useState, useEffect } from 'react';
import Image from 'next/image';

export type ThinkingPhase = 'ocr' | 'language-detection' | 'translation' | 'general';

interface ThinkingLoaderProps {
  phase?: ThinkingPhase;
  className?: string;
}

// Professional, agentic thinking messages for each phase
const THINKING_MESSAGES: Record<ThinkingPhase, string[]> = {
  ocr: [
    'Analyzing document structure...',
    'Extracting text from image...',
    'Processing image layers...',
    'Recognizing multilingual content...',
    'Optimizing text extraction...',
    'Detecting document layout...',
    'Identifying text regions...',
    'Processing complex formatting...',
  ],
  'language-detection': [
    'Identifying source language...',
    'Analyzing linguistic patterns...',
    'Detecting script characteristics...',
    'Determining optimal translation path...',
    'Validating language confidence...',
  ],
  translation: [
    'Translating document...',
    'Preserving document formatting...',
    'Ensuring translation accuracy...',
    'Maintaining structural integrity...',
    'Applying linguistic refinements...',
    'Finalizing professional translation...',
  ],
  general: [
    'Processing your request...',
    'Analyzing content...',
    'Preparing response...',
    'Thinking...',
    'Almost ready...',
  ],
};

// Phase-specific colors for visual feedback
const PHASE_COLORS: Record<ThinkingPhase, string> = {
  ocr: 'from-blue-500 to-cyan-500',
  'language-detection': 'from-purple-500 to-pink-500',
  translation: 'from-[#8353fd] to-[#e60054]',
  general: 'from-gray-500 to-gray-400',
};

export function ThinkingLoader({ phase = 'general', className = '' }: ThinkingLoaderProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const messages = THINKING_MESSAGES[phase];
  const phaseColor = PHASE_COLORS[phase];

  useEffect(() => {
    // Reset to first message when phase changes
    setMessageIndex(0);
  }, [phase]);

  useEffect(() => {
    // Cycle through messages
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setMessageIndex((prev) => (prev + 1) % messages.length);
        setIsAnimating(false);
      }, 300); // Fade out duration
    }, 3000); // Change message every 3 seconds

    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <div className={`flex items-start gap-3 ${className}`}>
      {/* TRADOS Logo with pulse animation */}
      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
        <div className="relative">
          {/* Pulsing glow effect */}
          <div className={`absolute inset-0 rounded-full bg-gradient-to-r ${phaseColor} opacity-50 blur-md animate-pulse`}></div>
          <Image
            src="/trados-logo.svg"
            alt="AI"
            width={32}
            height={32}
            className="w-8 h-8 relative z-10 animate-pulse"
          />
        </div>
      </div>

      {/* Thinking message bubble */}
      <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-[#2a2a2a] border border-white/5">
        <div className="flex flex-col gap-2">
          {/* Animated thinking text */}
          <div
            className={`text-[15px] text-white/90 font-medium transition-all duration-300 ${
              isAnimating ? 'opacity-40 translate-y-[-2px]' : 'opacity-100 translate-y-0'
            }`}
          >
            {messages[messageIndex]}
          </div>

          {/* Animated dots with gradient */}
          <div className="flex gap-1 mt-1">
            <div
              className={`w-2 h-2 rounded-full bg-gradient-to-r ${phaseColor} animate-bounce`}
              style={{ animationDelay: '0ms' }}
            ></div>
            <div
              className={`w-2 h-2 rounded-full bg-gradient-to-r ${phaseColor} animate-bounce`}
              style={{ animationDelay: '150ms' }}
            ></div>
            <div
              className={`w-2 h-2 rounded-full bg-gradient-to-r ${phaseColor} animate-bounce`}
              style={{ animationDelay: '300ms' }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
}
