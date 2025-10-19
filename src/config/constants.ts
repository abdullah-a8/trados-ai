/**
 * Application-wide constants for TRADOS by GLI
 */

export const APP_NAME = 'TRADOS by GLI';

export const APP_DESCRIPTION = 'Professional translation and transcription tool';

export const UI_CONFIG = {
  sidebar: {
    width: 256, // w-64 in px
    widthCollapsed: 0,
  },
  chat: {
    maxWidth: '48rem',
    inputPlaceholder: 'Assign a task',
    welcomeMessage: `The next-generation tool for professional translation and transcription, built on the principles of TRADOS`,
  },
} as const;

export const API_ROUTES = {
  chat: '/api/chat',
  chats: '/api/chats',
  generateTitle: '/api/chats/generate-title',
} as const;
