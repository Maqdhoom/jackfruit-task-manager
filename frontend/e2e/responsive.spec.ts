import { expect, test } from '@playwright/test'
import { calendarTask, mockAuthenticatedApi } from './testHelpers'

test('calendar remains navigable without horizontal overflow on desktop, tablet, and mobile', async ({ page }) => {
  await mockAuthenticatedApi(page)
  await page.goto('/calendar')

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    await expect(page.getByRole('link', { name: calendarTask.title })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next month' })).toBeVisible()

    const dimensions = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      layoutBoxes: [...document.querySelectorAll('#app, .app-shell, .projects-shell, .projects-sidebar, .calendar-toolbar')]
        .map((element) => {
          const bounds = element.getBoundingClientRect()
          return {
            className: typeof element.className === 'string' ? element.className : element.id,
            left: Math.round(bounds.left),
            right: Math.round(bounds.right),
            width: Math.round(bounds.width),
            scrollWidth: element.scrollWidth,
          }
        }),
      overflowingElements: [...document.querySelectorAll('body *')]
        .map((element) => {
          const bounds = element.getBoundingClientRect()
          return {
            tag: element.tagName,
            className: typeof element.className === 'string' ? element.className : '',
            right: Math.round(bounds.right),
            width: Math.round(bounds.width),
          }
        })
        .filter((element) => element.width > 0 && element.right > window.innerWidth)
        .slice(0, 8),
    }))
    expect(dimensions.documentWidth, JSON.stringify({
      layoutBoxes: dimensions.layoutBoxes,
      overflowingElements: dimensions.overflowingElements,
    }))
      .toBeLessThanOrEqual(dimensions.viewportWidth)
  }
})
