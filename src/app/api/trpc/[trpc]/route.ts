import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '@/server/routers/_app'
import { createTRPCContext } from '@/server/trpc'

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    // Pass request headers into the context so the rate-limit middleware
    // can derive a stable identifier (user id when authenticated, IP otherwise).
    createContext: () => createTRPCContext({ headers: req.headers }),
  })

export { handler as GET, handler as POST }
