import { router } from '../trpc'
import { adminRouter } from './admin'
import { orgRouter } from './org'
import { workforceRouter } from './workforce'
import { demandRouter } from './demand'
import { workloadRouter } from './workload'
import { planningRouter } from './planning'
import { scenarioRouter } from './scenario'
import { wizardRouter } from './wizard'
import { onboardingRouter } from './onboarding'

export const appRouter = router({
  admin: adminRouter,
  org: orgRouter,
  workforce: workforceRouter,
  demand: demandRouter,
  workload: workloadRouter,
  planning: planningRouter,
  scenario: scenarioRouter,
  wizard: wizardRouter,
  onboarding: onboardingRouter,
})

export type AppRouter = typeof appRouter
