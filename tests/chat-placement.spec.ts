import { test, expect } from '@playwright/test'

for (const position of [{ x: 1160, y: 45 }, { x: 45, y: 60 }, { x: 1160, y: 720 }]) {
  test(`悬浮球${position.x},${position.y}展开留在视口且叉号在右上角`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/?demo=1')
    const launcher = page.getByRole('button', { name: '打开学习助手' })
    const initial = (await launcher.boundingBox())!
    await page.mouse.move(initial.x + initial.width / 2, initial.y + initial.height / 2)
    await page.mouse.down()
    await page.mouse.move(position.x, position.y, { steps: 12 })
    await page.mouse.up()
    await expect(page.locator('.study-os')).not.toHaveClass(/assistant-snapping/)
    const origin = (await launcher.boundingBox())!
    await launcher.click()
    const panel = page.getByRole('region', { name: 'Academic Assistant 对话区域' })
    await expect(panel).toHaveClass(/is-ready/)
    const box = (await panel.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(11)
    expect(box.y).toBeGreaterThanOrEqual(11)
    expect(box.x + box.width).toBeLessThanOrEqual(1269)
    expect(box.y + box.height).toBeLessThanOrEqual(789)
    if (position.y < 100) {
      const side = origin.x <= 13 || origin.x + origin.width >= 1267
      const expected = side ? Math.max(12, Math.min(origin.y + origin.height / 2 - box.height / 2, 788 - box.height)) : origin.y
      expect(box.y).toBeCloseTo(expected, 0)
    }
    const close = page.getByRole('button', { name: '关闭学习助手' })
    const closeBox = (await close.boundingBox())!
    expect(box.x + box.width - closeBox.x - closeBox.width).toBeLessThanOrEqual(18)
    expect(closeBox.y - box.y).toBeLessThanOrEqual(18)
    await close.click()
    await expect(panel).toHaveCount(0)
    const restored = (await launcher.boundingBox())!
    expect(restored.x).toBeCloseTo(origin.x, 0)
    expect(restored.y).toBeCloseTo(origin.y, 0)
  })
}
