This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Environment Variables

Copy `.env.example` to `.env.local` and configure the required API keys:

```bash
cp .env.example .env.local
```

Required API keys:
- **DATALAB_API_KEY**: Get from https://www.datalab.to/ (Surya OCR for multilingual image text extraction)
- **OPENAI_API_KEY**: Get from https://platform.openai.com/api-keys (GPT-4o for translation)
- **GOOGLE_GENERATIVE_AI_API_KEY**: Get from https://aistudio.google.com/app/apikey (Gemini 2.5 Flash)
- **UPSTASH_REDIS_REST_URL** and **UPSTASH_REDIS_REST_TOKEN**: Get from https://console.upstash.com/ (chat history storage)
- **AUTH_USERNAME** and **AUTH_PASSWORD**: Set your own credentials for authentication
- **SESSION_SECRET**: Generate using `openssl rand -base64 32`

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
