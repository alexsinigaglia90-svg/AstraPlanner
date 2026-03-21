import { createTRPCReact } from '@trpc/react-query'
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import type { AppRouter } from '@/server/routers/_app'

export const trpc = createTRPCReact<AppRouter>()

function getBaseUrl() {
  if (typeof window !== 'undefined') return ''
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return `http://localhost:3000`
}

export function makeTRPCClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${getBaseUrl()}/api/trpc`,
        transformer: superjson,
      }),
    ],
  })
}
