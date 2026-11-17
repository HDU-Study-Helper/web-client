import { test, expect } from '@playwright/test'

for (const width of [320, 390, 820]) {
  test(`${width}px：内容由页面滚动，模块间距与边框一致`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 })
    await page.goto('/?demo=1')
    const layout = await page.locator('.dashboard-scroll').evaluate((element) => {
      const style = getComputedStyle(element)
      const modules = Array.from(element.querySelectorAll('.study-module')).map((module) => {
        const css = getComputedStyle(module)
        const rect = module.getBoundingClientRect()
        return { border: css.borderTopWidth, shadow: css.boxShadow, padding: parseFloat(css.paddingLeft), margin: parseFloat(css.marginBottom), left: rect.left, right: rect.right }
      })
      return { overflow: style.overflowY, ownScroll: element.scrollHeight > element.clientHeight + 1, modules }
    })
    expect(layout.overflow).toBe('visible')
    expect(layout.ownScroll).toBe(false)
    for (const module of layout.modules) {
      expect(module.border).toBe('1px')
      expect(module.shadow).toBe('none')
      expect(module.padding).toBeGreaterThanOrEqual(16)
      expect(module.margin).toBeGreaterThanOrEqual(20)
      expect(module.left).toBeGreaterThanOrEqual(16)
      expect(module.right).toBeLessThanOrEqual(width - 15)
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    expect(await page.locator('.dashboard-scroll').evaluate((element) => element.scrollTop)).toBe(0)
    expect((await page.locator('.os-header').boundingBox())!.y).toBeCloseTo(0, 0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    for (const name of ['日程', '我的']) {
      await page.getByRole('button', { name, exact: true }).click()
      expect(await page.locator('.workspace-main').evaluate((element) => getComputedStyle(element).overflowY)).toBe('visible')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
  })
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
  test(`${viewport.width}×${viewport.height}：桌面主页固定视口，模块独立滚动`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/?demo=1')
    await page.getByRole('button', { name: '查看全部 5 门课程' }).click()
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true)
    for (const selector of ['.today-module', '.brief-module', '.courses-module']) {
      const module = page.locator(selector)
      await expect(module).toHaveCSS('overflow-y', 'auto')
      const box = (await module.boundingBox())!
      expect(box.y).toBeGreaterThan(0)
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
    }
    await page.locator('.courses-module').evaluate((element) => {
      const spacer = document.createElement('div')
      spacer.style.height = '800px'
      element.append(spacer)
      element.scrollTop = element.scrollHeight
    })
    expect(await page.locator('.courses-module').evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    expect(await page.locator('.dashboard-scroll').evaluate((element) => element.scrollTop)).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: '日程', exact: true }).click()
    await expect(page.locator('.study-os')).not.toHaveClass(/is-home/)
  })
}

test('普通学业内容使用正文字体，统计与课程不使用像素字体', async ({ page }) => {
  await page.goto('/?demo=1')
  for (const selector of ['.stat strong', '.course-code', '.module-subtitle']) {
    const font = await page.locator(selector).first().evaluate((element) => getComputedStyle(element).fontFamily)
    expect(font).not.toContain('Lyusung')
    expect(font).not.toContain('Georgia')
    expect(font).not.toContain('DM Sans')
  }
  await expect(page.locator('.module-index, .module-label, .welcome-kicker')).toHaveCount(0)
})
