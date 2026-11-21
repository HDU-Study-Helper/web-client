import {test,expect} from '@playwright/test'
for(const width of [320,1440,1920])test(`${width}通知提问占位可筛选且不请求后端`,async({page})=>{
 const requests:string[]=[];page.on('request',r=>{if(r.url().includes('/api/'))requests.push(r.url())})
 await page.setViewportSize({width,height:1080});await page.goto('/?demo=1');
 for(const name of ['日程','我的']){
  await page.getByRole('button',{name,exact:true}).click()
  const panel=page.getByRole('region',{name:'通知与提问预览'})
  await expect(panel).toContainText('Mock 预览');await expect(panel.locator('.notification-item')).toHaveCount(4)
  await panel.getByRole('button',{name:'提问',exact:true}).click();await expect(panel.locator('.notification-item')).toHaveCount(2)
  await panel.locator('.notification-item').first().click();await expect(page.getByRole('dialog')).toContainText('模拟')
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 }
 expect(requests).toEqual([])
 await page.goto('/?demo=1&show=tlfull');await expect(page.locator('.schedule-notifications')).toBeHidden()
})
