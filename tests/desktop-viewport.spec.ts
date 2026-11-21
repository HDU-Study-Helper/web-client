import {test,expect} from '@playwright/test'
for(const viewport of [{width:1280,height:600},{width:1440,height:900},{width:1920,height:1080}])test(`${viewport.width}x${viewport.height}桌面三页无全局滚动且模块可滚动`,async({page})=>{
 await page.setViewportSize(viewport);await page.goto('/?demo=1')
 for(const name of ['主页','日程','我的']){
  await page.getByRole('button',{name,exact:true}).click()
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  const selectors=name==='主页'?['.courses-module']:name==='日程'?['.schedule-primary > .study-module','.schedule-notifications > .notification-preview']:['.profile-settings-column > .notification-preview']
  for(const selector of selectors){
   const el=page.locator(selector);await expect(el).toBeVisible()
   const r=(await el.boundingBox())!;expect(r.y).toBeGreaterThanOrEqual(0);expect(r.y+r.height).toBeLessThanOrEqual(viewport.height)
   const canScroll=await el.evaluate(e=>{const spacer=document.createElement('div');spacer.style.height='1500px';e.append(spacer);e.scrollTop=100;const moved=e.scrollTop>0;spacer.remove();e.scrollTop=0;return moved})
   expect(canScroll).toBe(true)
  }
 }
})
