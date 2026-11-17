import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const layers = ['tokens', 'base', 'components', 'theme', 'workspace', 'responsive', 'timetable', 'accessibility', 'polish']
const files = ['tokens.css', 'styles.css', 'components.css', 'retro.css', 'workspace.css', 'workspace-responsive.css', 'timetable.css', 'accessibility.css', 'workspace-polish.css']

test('CSS 分层在文件插入顺序颠倒后保持基础组件视觉一致', async ({ page }) => {
  const sources = files.map((file) => readFileSync(resolve('src', file), 'utf8'))
  expect(sources.filter((source) => /:root\s*\{/.test(source))).toHaveLength(1)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible()
  await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.id = 'layer-probe'
    probe.innerHTML = '<button class="button button-primary">按钮</button><input value="输入"><div class="notice notice-error">错误</div><dialog class="modal" open>弹窗</dialog>'
    document.body.append(probe)
  })
  const signatures = () => page.locator('#layer-probe > *').evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element)
    return Object.fromEntries(['color', 'backgroundColor', 'borderRadius', 'borderColor', 'boxShadow', 'fontFamily', 'fontSize', 'padding', 'minHeight'].map((key) => [key, style[key as keyof CSSStyleDeclaration]]))
  }))
  const original = await signatures()
  await page.evaluate(({ layers, sources }) => {
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((element) => element.remove())
    const order = document.createElement('style')
    order.textContent = `@layer ${layers.join(', ')};`
    document.head.append(order)
    for (let i = layers.length - 1; i >= 0; i--) {
      const style = document.createElement('style')
      style.textContent = `@layer ${layers[i]} { ${sources[i]} }`
      document.head.append(style)
    }
  }, { layers, sources })
  expect(await signatures()).toEqual(original)
})
