import { router } from '../trpc'
import { adminRouter } from './admin'
// Future routers (empty stubs for now):
// import { orgRouter } from './org'
// import { workforceRouter } from './workforce'

export const appRouter = router({
  admin: adminRouter,
})

export type AppRouter = typeof appRouter
