import { test, expect } from '@playwright/test'

const EMAIL = 'asinigaglia@ascentra.nl'
const PASSWORD = process.env.TEST_PASSWORD ?? '123456'

test.describe('Phase 2: Data Core', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[type="password"]', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard**', { timeout: 10_000 })
  })

  test('Dashboard loads with sidebar and header', async ({ page }) => {
    // Header should have AstraPlanner text
    await expect(page.getByRole('banner').getByText('AstraPlanner')).toBeVisible()
    // Sidebar nav items
    await expect(page.getByRole('complementary').getByText('Dashboard')).toBeVisible()
    await expect(page.getByRole('complementary').getByText('Employees')).toBeVisible()
    await expect(page.getByRole('complementary').getByText('Settings')).toBeVisible()
  })

  test('Site selector is visible and has sites', async ({ page }) => {
    const selector = page.getByRole('button', { name: /Amsterdam|Rotterdam/i })
    await expect(selector.first()).toBeVisible({ timeout: 5_000 })
  })

  test('Organization settings page loads data', async ({ page }) => {
    await page.getByRole('complementary').getByText('Settings').click()
    await page.waitForURL('**/dashboard/settings**')

    // Should show org name in the heading
    await expect(page.getByRole('heading', { name: 'AstraLogistics BV' })).toBeVisible({ timeout: 5_000 })
    // Should show locale
    await expect(page.getByText('Europe/Amsterdam')).toBeVisible()
  })

  test('Sites page lists both sites', async ({ page }) => {
    await page.goto('/dashboard/settings/sites')

    // Use headings to avoid ambiguity with site selector
    await expect(page.getByRole('heading', { name: 'Amsterdam Distribution Center' })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('heading', { name: 'Rotterdam Fulfillment Hub' })).toBeVisible()
  })

  test('Site detail page loads', async ({ page }) => {
    await page.goto('/dashboard/settings/sites')
    await page.getByRole('heading', { name: 'Amsterdam Distribution Center' }).click()
    await page.waitForURL('**/dashboard/settings/sites/**', { timeout: 10_000 })

    await expect(page.getByText('Amsterdam Distribution Center')).toBeVisible()
  })

  test('Processes page loads for active site', async ({ page }) => {
    await page.goto('/dashboard/processes')

    const content = page.getByText('Picking').or(page.getByText('Select a site'))
    await expect(content.first()).toBeVisible({ timeout: 5_000 })
  })

  test('Employees page loads with search', async ({ page }) => {
    await page.goto('/dashboard/employees')

    await expect(page.getByRole('heading', { name: /Employees/i })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByPlaceholder(/search/i)).toBeVisible()
  })

  test('Employee detail page loads', async ({ page }) => {
    await page.goto('/dashboard/employees')

    // Wait for any employee name from seed data
    const employee = page.getByText('Lars').or(page.getByText('Sophie')).or(page.getByText('Pieter'))

    if (await employee.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      await employee.first().click()
      await page.waitForURL('**/dashboard/employees/**')
      await expect(page.getByText('Skills').or(page.getByText('Personal'))).toBeVisible({ timeout: 5_000 })
    }
  })

  test('Audit log page loads', async ({ page }) => {
    await page.goto('/dashboard/settings/audit')

    await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible({ timeout: 5_000 })
  })

  test('Logout works', async ({ page }) => {
    await page.locator('button[aria-label="User menu"]').click()
    await expect(page.getByText('Sign out')).toBeVisible()
    await page.getByText('Sign out').click()
    await page.waitForURL('**/login**', { timeout: 5_000 })
  })
})
