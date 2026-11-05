import { expect, test } from '@playwright/test'

test('protected calendar redirects unauthenticated users to login', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { message: 'Authentication required' } })
  )

  await page.goto('/calendar')

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
})

test('login errors are surfaced without leaking server details', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { message: 'Authentication required' } })
  )
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ status: 401, json: { message: 'Invalid email or password' } })
  )

  await page.goto('/')
  await page.getByLabel('Email').fill('bad@example.test')
  await page.getByLabel('Password').fill('not-a-real-password')
  await page.getByRole('button', { name: 'Log in' }).click()

  await expect(page.getByRole('alert')).toHaveText('Invalid email or password')
  await expect(page.getByText(/database|stack|secret/i)).toHaveCount(0)
})
