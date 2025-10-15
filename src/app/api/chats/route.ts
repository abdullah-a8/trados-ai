import { listChats, deleteChat } from '@/lib/chat-store';
import { NextResponse } from 'next/server';

/**
 * GET endpoint to list all chats
 */
export async function GET() {
  try {
    const chats = await listChats(50); // Get last 50 chats

    return NextResponse.json({ chats }, { status: 200 });
  } catch (error) {
    console.error('List chats error:', error);
    return NextResponse.json(
      { error: 'Failed to list chats' },
      { status: 500 }
    );
  }
}

/**
 * DELETE endpoint to delete a specific chat
 */
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get('id');

    if (!chatId) {
      return NextResponse.json(
        { error: 'Chat ID required' },
        { status: 400 }
      );
    }

    await deleteChat(chatId);

    return NextResponse.json(
      { success: true, message: 'Chat deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete chat error:', error);
    return NextResponse.json(
      { error: 'Failed to delete chat' },
      { status: 500 }
    );
  }
}
