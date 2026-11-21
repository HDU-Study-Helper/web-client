import {test,expect} from '@playwright/test'
test('展开窗口按下不跳位，拖动跟随指针，松手按窗口尺寸贴边',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto('/?demo=1')
 await page.locator('.assistant-launcher').click();const panel=page.locator('.chat-window.is-ready');await expect(panel).toBeVisible()
 const before=(await panel.boundingBox())!;const handle=page.locator('.chat-window-handle');const r=(await handle.boundingBox())!
 await page.mouse.move(r.x+100,r.y+20);await page.mouse.down()
 const down=(await panel.boundingBox())!;expect(down.x).toBeCloseTo(before.x,0);expect(down.y).toBeCloseTo(before.y,0)
 await page.mouse.move(r.x+20,r.y-30,{steps:8})
 const moved=(await panel.boundingBox())!;expect(moved.x).toBeCloseTo(before.x-80,0);expect(moved.y).toBeCloseTo(before.y-50,0)
 await page.mouse.up();await expect(page.locator('.study-os')).not.toHaveClass(/assistant-snapping/)
 const dock=(await panel.boundingBox())!;expect(Math.min(dock.x-12,1440-12-dock.x-dock.width,dock.y-12,1000-12-dock.y-dock.height)).toBeCloseTo(0,0)
 await page.getByRole('button',{name:'关闭学习助手'}).click();await expect(page.locator('.chat-window')).toHaveCount(0)
 const ball=(await page.locator('.assistant-launcher').boundingBox())!;expect(Math.min(ball.x-12,1428-ball.x-ball.width,ball.y-12,988-ball.y-ball.height)).toBeCloseTo(0,0)
 const side=dock.x<=13||dock.x+dock.width>=1427
 if(side)expect(ball.y+ball.height/2).toBeCloseTo(dock.y+dock.height/2,0)
 else expect(ball.x+ball.width/2).toBeCloseTo(dock.x+dock.width/2,0)
 await page.locator('.assistant-launcher').click();await expect(panel).toBeVisible()
 const reopened=(await panel.boundingBox())!;expect(reopened.x).toBeCloseTo(dock.x,0);expect(reopened.y).toBeCloseTo(dock.y,0)
})
for(const edge of ['left','right','bottom'] as const) test(`${edge}边缘吸附及展开方向`,async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto('/?demo=1')
 const ball=page.locator('.assistant-launcher');await expect(ball).toBeVisible();const r=(await ball.boundingBox())!
 const target=edge==='left'?{x:180,y:450}:edge==='right'?{x:1250,y:450}:{x:720,y:750}
 await page.mouse.move(r.x+20,r.y+20);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:8});await page.mouse.up()
 await expect(page.locator('.study-os')).not.toHaveClass(/assistant-snapping/)
 const dock=(await ball.boundingBox())!
 if(edge==='left')expect(dock.x).toBeCloseTo(12,0)
 if(edge==='right')expect(dock.x+dock.width).toBeCloseTo(1428,0)
 if(edge==='bottom')expect(dock.y+dock.height).toBeCloseTo(888,0)
 await ball.click();await expect(page.locator('.chat-window.is-ready')).toBeVisible()
 const box=(await page.locator('.chat-window').boundingBox())!
 expect(box.x).toBeGreaterThanOrEqual(12);expect(box.x+box.width).toBeLessThanOrEqual(1428)
 expect(box.y).toBeGreaterThanOrEqual(12);expect(box.y+box.height).toBeLessThanOrEqual(888)
 if(edge==='left')expect(box.x).toBeCloseTo(dock.x,0)
 if(edge==='right')expect(box.x+box.width).toBeCloseTo(dock.x+dock.width,0)
 if(edge==='bottom')expect(box.x+box.width/2).toBeCloseTo(dock.x+dock.width/2,0)
})
test('桌面拖到中间后动画贴边，顶边中点双侧展开',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto('/?demo=1')
 const ball=page.locator('.assistant-launcher');await expect(ball).toBeVisible();const r=(await ball.boundingBox())!
 await page.mouse.move(r.x+20,r.y+20);await page.mouse.down();await page.mouse.move(720,180,{steps:8});await page.mouse.up()
 await expect(page.locator('.study-os')).not.toHaveClass(/assistant-snapping/)
 const dock=(await ball.boundingBox())!;expect(dock.y).toBeCloseTo(12,0)
 await ball.click();await expect(page.locator('.chat-window.is-ready')).toBeVisible()
 const panel=(await page.locator('.chat-window').boundingBox())!
 expect(panel.x+panel.width/2).toBeCloseTo(dock.x+dock.width/2,0)
 expect(panel.y).toBeGreaterThanOrEqual(12);expect(panel.y+panel.height).toBeLessThanOrEqual(900)
})
