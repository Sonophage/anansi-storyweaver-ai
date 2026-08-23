import { buildContext } from '../src/context.ts';
import type { Input } from '../src/context.ts';
import { render, SYSTEM } from '../src/render.ts';
const HOST='http://127.0.0.1:8080', MODEL='write-nt-qwen36-h';
const post=async(p:string,b:unknown)=>{const r=await fetch(HOST+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b),signal:AbortSignal.timeout(600_000)});if(!r.ok)throw new Error(`${p} ${r.status} ${(await r.text()).slice(0,160)}`);return r.json();};
const { input } = await import('../fixture.ts');
const inp = input as Input; inp.budget = 22923;
const body = render(buildContext(inp,(s)=>Math.ceil(s.length/3.6))).slice(SYSTEM.length);
const variants: [string, Record<string,unknown>][] = [
  ['baseline max_tokens=900',            { max_tokens: 900 }],
  ['enable_thinking:false',              { max_tokens: 900, chat_template_kwargs: { enable_thinking: false } }],
  ['reasoning_budget:0',                 { max_tokens: 900, reasoning_budget: 0 }],
  ['/no_think suffix',                   { max_tokens: 900, _suffix: ' /no_think' }],
];
for (const [label, extra] of variants) {
  const { _suffix, ...opts } = extra as any;
  try {
    const t0=Date.now();
    const r=await post('/v1/chat/completions',{model:MODEL,temperature:0.85,
      messages:[{role:'system',content:SYSTEM},{role:'user',content:body+(_suffix??'')}],...opts});
    const m=r.choices?.[0]?.message??{};
    const prose=(m.content??'').trim();
    console.log(`${label.padEnd(26)} ${((Date.now()-t0)/1000).toFixed(1)}s  reasoning=${String((m.reasoning_content??'').length).padStart(5)}  prose=${String(prose.length).padStart(5)}  ${JSON.stringify(prose.slice(0,70))}`);
  } catch(e:any){ console.log(`${label.padEnd(26)} ERROR ${e.message}`); }
}
