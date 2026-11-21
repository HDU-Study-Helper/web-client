import {test,expect} from '@playwright/test'
for(const width of [320,390,768,1440,1920]){
 test(`${width}日程与我的布局紧凑但操作可触达`,async({page})=>{
  await page.setViewportSize({width,height:900})
  await page.goto('/?demo=1')
  await page.getByRole('button',{name:'日程',exact:true}).click()
  expect(await page.locator('.schedule-primary').evaluate(e=>e.getBoundingClientRect().width)).toBeLessThanOrEqual(820)
  if(width>1100){
   const gap=await page.locator('.schedule-list.detailed li').first().evaluate(e=>{const children=e.children;const content=children[2].getBoundingClientRect();const type=children[3].getBoundingClientRect();return type.left-content.left})
   expect(gap).toBeLessThan(650)
  }
  await expect(page.locator('.companion-task')).toHaveCount(3)
  if(width>1000){
   const main=(await page.locator('.schedule-primary').boundingBox())!
   const side=(await page.locator('.schedule-companion').boundingBox())!
   expect(side.x).toBeGreaterThanOrEqual(main.x+main.width)
   expect(side.y).toBeCloseTo(main.y,0)
  }
  await page.locator('.companion-task').first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const rows=await page.locator('.schedule-list.detailed li').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height))
  expect(rows).toHaveLength(3)
  for(const height of rows){expect(height).toBeGreaterThanOrEqual(60);expect(height).toBeLessThanOrEqual(width<=760?100:80)}
  const dates=await page.locator('.schedule-dates > button').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height))
  for(const height of dates){expect(height).toBeGreaterThanOrEqual(width<=760?44:40);expect(height).toBeLessThanOrEqual(60)}
  await page.locator('.schedule-dates > button').nth(1).click()
  await expect(page.locator('.schedule-empty')).toBeVisible()
  expect(await page.locator('.schedule-empty').evaluate(e=>e.getBoundingClientRect().height)).toBeLessThanOrEqual(200)
  await page.getByRole('button',{name:'我的',exact:true}).click()
  expect(await page.locator('.profile-settings-column').evaluate(e=>e.getBoundingClientRect().width)).toBeLessThanOrEqual(800)
  expect(await page.locator('.profile-avatar').evaluate(e=>e.getBoundingClientRect().height)).toBe(44)
  for(const h of await page.locator('.preference-row').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height)))expect(h).toBeLessThanOrEqual(width<=390?160:100)
  await page.getByRole('switch',{name:'学业提醒'}).click()
  await expect(page.getByRole('switch',{name:'学业提醒'})).not.toBeChecked()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 })
}
