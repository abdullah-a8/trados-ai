import { openai } from '@ai-sdk/openai';
import { streamText, convertToModelMessages, UIMessage } from 'ai';
import { TRADOS_SYSTEM_PROMPT } from '@/config/prompts';
import { MODEL_CONFIG } from '@/config/model';

// Allow streaming responses up to configured duration
export const maxDuration = MODEL_CONFIG.maxDuration;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: openai(MODEL_CONFIG.modelId),
    system: TRADOS_SYSTEM_PROMPT,
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
