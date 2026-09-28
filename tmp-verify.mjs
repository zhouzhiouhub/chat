import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page.on('pageerror', (error) => {
  throw error
})
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: '设置' }).click()
await page.getByRole('heading', { name: 'API 配置' }).waitFor()
const settings = await page.locator('main').innerText()
for (const text of ['GPT-6 Astra', '对话', 'GPT Image 2', '图片', 'Doubao Seed 2.1 Pro', 'Gemini 3.8 Flash', 'Seedream 5.0 Pro']) {
  if (!settings.includes(text)) throw new Error(`settings missing ${text}`)
}
const openai = page.locator('section').filter({ has: page.getByRole('heading', { name: 'OpenAI' }) })
await openai.locator('input[type="password"]').fill('sk-test-local')
await openai.getByRole('button', { name: '保存' }).click()
await page.getByRole('button', { name: '返回对话' }).click()

const picker = page.getByLabel('模型')
await picker.waitFor()
const labels = await picker.locator('option').allTextContents()
if (!labels.some((item) => item.includes('自动'))) throw new Error('missing auto')
if (!labels.some((item) => item.includes('GPT-6 Astra') && item.includes('对话'))) throw new Error('missing chat option')
if (!labels.some((item) => item.includes('GPT Image 2') && item.includes('图片'))) throw new Error('missing image option')
await page.getByLabel('比例').waitFor()

await page.locator('textarea').fill('你好')
await page.getByRole('button', { name: '发送' }).click()
await page.getByText('GPT-6 Astra').first().waitFor({ timeout: 8000 })

await picker.selectOption({ label: 'GPT Image 2 · 图片' })
await page.getByLabel('比例').waitFor()
await page.locator('textarea').fill('画一只玻璃瓶')
await page.getByRole('button', { name: '发送' }).click()
await page.getByText('GPT Image 2 · OpenAI').waitFor({ timeout: 8000 })

await picker.selectOption({ label: 'GPT-6 Astra · 对话' })
if (await page.getByLabel('比例').count()) throw new Error('chat model still shows image controls')

console.log('OK')
await browser.close()
