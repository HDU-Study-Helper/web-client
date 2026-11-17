import { test, expect } from '@playwright/test'

for (const reduced of [false, true]) {
  test(`统一弹窗${reduced ? '尊重减少动效' : '具有进出动效'}，内容点击与拖出不关闭，遮罩关闭且恢复焦点`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' })
    await page.goto('/?demo=1')
    const trigger = page.getByRole('button', { name: '查看高等数学详情', exact: true })
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveCSS('animation-name', reduced ? 'none' : 'modal-in')
    const box = (await dialog.boundingBox())!
    await page.mouse.click(box.x + 5, box.y + box.height / 2)
    await expect(dialog).toBeVisible()
    await page.mouse.move(box.x + 5, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(4, 4)
    await page.mouse.up()
    await expect(dialog).toBeVisible()
    await dialog.evaluate((element) => {
      element.addEventListener('animationstart', (event) => {
        if ((event as AnimationEvent).animationName === 'modal-out') document.documentElement.dataset.modalExitSeen = 'true'
      })
    })
    await page.mouse.click(4, 4)
    if (!reduced) await expect(page.locator('html')).toHaveAttribute('data-modal-exit-seen', 'true')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await trigger.click()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })
}

test('清空确认点击遮罩只取消，消息与聊天浮窗保持', async ({ page }) => {
  await page.goto('/?demo=1')
  await page.getByRole('button', { name: '打开学习助手' }).click()
  await page.getByRole('textbox', { name: '向学习助手提问' }).fill('保留这条消息')
  await page.getByRole('button', { name: '发送消息' }).click()
  await page.getByRole('button', { name: '清空并新建', exact: true }).click()
  await page.mouse.click(4, 4)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('log')).toContainText('保留这条消息')
  await expect(page.getByRole('button', { name: '清空并新建', exact: true })).toBeFocused()
})
