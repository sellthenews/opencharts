import { chromium } from '@playwright/test';
const b = await chromium.launch({channel:'chrome'});
const p = await b.newPage({viewport:{width:1400,height:900}, locale:'pl-PL'});
await p.goto('http://127.0.0.1:4173/?dex=xrpl');
await p.waitForSelector('#app[data-ready="true"]',{timeout:60000});
await p.evaluate(()=>localStorage.setItem('opencharts:dex-watch-address','rJJKbp9fXL9AR4kZwVzHLNkUCvY7D1kjCa'));
await p.click('[data-dex-tab="account"]'); 
for (let i=0;i<6;i++){ await p.waitForTimeout(1500); console.log(i, (await p.locator('.dex-body').innerText()).slice(0,120).replace(/\n/g,' / ')); }
await b.close();
