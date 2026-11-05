import { expect, test } from '@playwright/test'
import { calendarTask, mockAuthenticatedApi } from './testHelpers'

test('calendar loads due tasks and navigates between months', async ({ page }) => {
  await mockAuthenticatedApi(page)
  await page.goto('/calendar')

  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible()
  await expect(page.getByRole('link', { name: calendarTask.title })).toBeVisible()
  const monthHeading = page.locator('.calendar-month-navigation h2')
  const currentMonth = await monthHeading.textContent()

  await page.getByRole('button', { name: 'Next month' }).click()
  await expect(monthHeading).not.toHaveText(currentMonth ?? '')
  await page.getByRole('button', { name: 'Today' }).click()
  await expect(monthHeading).toHaveText(currentMonth ?? '')
})
