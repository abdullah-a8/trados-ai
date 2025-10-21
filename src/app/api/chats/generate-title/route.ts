import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { NextResponse } from 'next/server';
import { updateChatTitle } from '@/lib/chat-store';

// Title generation should be fast, but allow some buffer
export const maxDuration = 15;

/**
 * POST endpoint to generate AI title for a chat
 */
export async function POST(req: Request) {
  try {
    const { chatId, firstMessage } = await req.json();

    if (!chatId || !firstMessage) {
      return NextResponse.json(
        { error: 'Chat ID and first message required' },
        { status: 400 }
      );
    }

    // Generate a concise title using AI
    const { text: title } = await generateText({
      model: google('gemini-2.5-flash'), // Use Gemini 2.5 Flash for title generation
      system: 'You are a title generator. Generate a very short, concise title (max 6 words) that captures the main topic of the user\'s message. Only return the title, no quotes or extra text.',
      prompt: `Generate a short title for this message: "${firstMessage}"`,
    });

    // Update the chat title in Redis
    await updateChatTitle(chatId, title.trim());

    return NextResponse.json({ title: title.trim() }, { status: 200 });
  } catch (error) {
    console.error('Generate title error:', error);
    return NextResponse.json(
      { error: 'Failed to generate title' },
      { status: 500 }
    );
  }
}
