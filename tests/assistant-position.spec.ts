import { test, expect } from '@playwright/test'
const key='haa:assistant-position:v1:local-preview:desktop'
test('拖动助手后刷新恢复位置，旧视口位置在小窗口仍可见',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto('/?demo=1')
 const launcher=page.locator('.assistant-launcher');await expect(launcher).toBeVisible()
 const initial=(await launcher.boundingBox())!
 await page.mouse.move(initial.x+20,initial.y+20);await page.mouse.down();await page.mouse.move(650,280,{steps:8});await page.mouse.up()
 await expect(page.locator('.study-os')).not.toHaveClass(/assistant-snapping/)
 const moved=(await launcher.boundingBox())!
 await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),key)).not.toBeNull()
 await page.reload();await expect(launcher).toBeVisible()
 const restored=(await launcher.boundingBox())!
 expect(restored.x).toBeCloseTo(moved.x,0);expect(restored.y).toBeCloseTo(moved.y,0)
 await page.setViewportSize({width:850,height:600});await page.reload()
 const small=(await launcher.boundingBox())!
 expect(small.x).toBeGreaterThanOrEqual(0);expect(small.y).toBeGreaterThanOrEqual(0)
 expect(small.x+small.width).toBeLessThanOrEqual(850);expect(small.y+small.height).toBeLessThanOrEqual(600)
})
test('损坏位置数据不影响助手打开',async({page})=>{
 await page.addInitScript(key=>localStorage.setItem(key,'{broken'),key)
 await page.goto('/?demo=1');await page.getByRole('button',{name:'打开学习助手'}).click()
 await expect(page.locator('.chat-window')).toBeVisible()
})
