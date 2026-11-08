import { escapeMarkup as e } from './workflow.js';

const headings = [
  ['கல்லில் பதிந்த', 'காலத்தின் குரல்'],
  ['கல்லும் செப்பும்', 'பேசும் வரலாறு'],
  ['யார்? எப்போது?', 'எப்படி?'],
  ['ஒரு பதிவு.', 'பல கேள்விகள்.'],
  ['பழைய பதிவுகள்.', 'புதிய புரிதல்.']
];
const labels = ['வரலாற்றின் சுவடுகள்', 'கல்வெட்டு · செப்பேடு', 'பதிவுகள் தரும் தகவல்கள்', 'ஒப்பிட்டு அறிதல்', 'சான்றுகள் வழியே வரலாறு'];
const lines = (x, y, width, count, color = '#c8bb9c') => Array.from({ length: count }, (_, i) => `<path d="M${x} ${y + i * 32}h${width - (i % 3) * 42}" stroke="${color}" stroke-width="5" stroke-linecap="round" opacity=".55"/>`).join('');
const svg = inner => `<svg viewBox="0 0 880 600" width="880" height="600" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
const card = (x, y, w, h, copper = false) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${copper ? '#6e412d' : '#34342e'}" stroke="${copper ? '#c48c5c' : '#888372'}" stroke-width="3"/>`;

function illustration(scene) {
  switch (scene) {
    case 0: return svg(`<ellipse cx="440" cy="536" rx="300" ry="25" fill="#000" opacity=".3"/><path d="M235 62L665 50L710 495L185 495Z" fill="#353730" stroke="#8f8872" stroke-width="4"/>${lines(275, 143, 305, 8)}<circle cx="650" cy="415" r="94" fill="#121b1b" stroke="#d9ae73" stroke-width="8"/><path d="M717 481l86 85" stroke="#d9ae73" stroke-width="23" stroke-linecap="round"/>${lines(603, 390, 100, 3, '#e8c58d')}<path d="M205 500h450" stroke="#cfa56d" stroke-width="2" opacity=".5"/>`);
    case 1: return svg(`${card(50, 95, 345, 345)}${lines(95, 162, 240, 7)}${card(475, 112, 340, 105, true)}${card(475, 231, 340, 105, true)}${card(475, 350, 340, 105, true)}<path d="M535 103v355" stroke="#d5ad71" stroke-width="12"/>${lines(570, 153, 185, 2)}${lines(570, 272, 185, 2)}${lines(570, 391, 185, 2)}<text x="220" y="520" fill="#ede1c9" text-anchor="middle" font-size="37">கல்வெட்டு</text><text x="645" y="520" fill="#e7bd8c" text-anchor="middle" font-size="37">செப்பேடு</text>`);
    case 2: return svg(`<path d="M440 170V490M180 340h520" stroke="#bb9462" stroke-width="3" opacity=".65"/>${card(305, 35, 270, 180)}${lines(345, 85, 180, 3)}${[['கொடை', 180, 350], ['ஆட்சி', 440, 475], ['நிர்வாகம்', 700, 350]].map(([t, x, y]) => `<circle cx="${x}" cy="${y}" r="106" fill="#132828" stroke="#b99c6d" stroke-width="3"/><text x="${x}" y="${Number(y) + 14}" fill="#efe3cc" text-anchor="middle" font-size="35">${t}</text>`).join('')}`);
    case 3: return svg(`${card(38, 105, 220, 285)}${card(330, 40, 220, 285)}${card(620, 105, 220, 285)}${lines(73, 162, 145, 5)}${lines(365, 97, 145, 5)}${lines(655, 162, 145, 5)}<path d="M150 415v48h580v-48M440 355v108" fill="none" stroke="#cba56f" stroke-width="4"/><rect x="266" y="480" width="348" height="85" rx="42" fill="#183632" stroke="#598b7e" stroke-width="2"/><text x="440" y="535" text-anchor="middle" font-size="36" fill="#e6d8bd">ஒப்பீடு · ஆய்வு</text>`);
    default: return svg(`<circle cx="440" cy="265" r="210" fill="none" stroke="#5b7163" stroke-width="2"/><circle cx="440" cy="265" r="184" fill="#1b2c27" stroke="#b79565" stroke-width="3"/>${card(332, 125, 216, 265)}${lines(365, 180, 145, 5)}<path d="M212 476h456" stroke="#cda970" stroke-width="3"/><text x="440" y="550" text-anchor="middle" fill="#e8d6b2" font-size="42">சான்றுகளே அடித்தளம்</text>`);
  }
}

export function frameHtml(scene, caption, progress) {
  if (!Number.isInteger(scene) || scene < 0 || scene > 4) throw new Error('Pilot visuals support five scenes only.');
  return `<!doctype html><html lang="ta"><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;overflow:hidden}body{font-family:'Nirmala UI',sans-serif;color:#f2e7d0;background:radial-gradient(ellipse at 18% 12%,#39372a 0,transparent 55%),radial-gradient(ellipse at 88% 65%,#1c3933 0,transparent 60%),#101b1b}
.grain{position:absolute;inset:0;opacity:.1;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' opacity='.3' filter='url(%23n)'/%3E%3C/svg%3E");pointer-events:none}
header{position:absolute;top:126px;left:92px;right:144px;display:flex;align-items:center;justify-content:space-between;font-size:27px;letter-spacing:2px;color:#d1b68b}.mark{width:38px;height:38px;border:2px solid #c7a36c;transform:rotate(45deg);margin-right:22px;display:inline-block}.brand{display:flex;align-items:center}.rule{position:absolute;left:92px;right:144px;top:206px;height:1px;background:#7f7758}
.eyebrow{position:absolute;left:92px;top:255px;font-size:28px;color:#96b7a6}h1{position:absolute;top:307px;left:84px;right:130px;font-size:78px;line-height:1.65;font-weight:700;margin:0;letter-spacing:-1px}h1 span{display:block;color:#dfb97f}.art{position:absolute;left:66px;top:645px;width:880px;height:600px}.art svg{font-family:'Nirmala UI',sans-serif}.art-note{position:absolute;top:1244px;left:92px;color:#9caa99;font-size:23px}
.caption{position:absolute;left:76px;right:128px;top:1315px;height:310px;border-left:4px solid #d8ad72;padding:22px 30px;background:linear-gradient(90deg,#091515d9,#09151555);border-radius:0 16px 16px 0;display:flex;align-items:center}.caption p{font-size:51px;line-height:1.7;font-weight:600;margin:0;overflow-wrap:normal;white-space:normal}
.footer{position:absolute;left:92px;right:144px;top:1670px;color:#a4b4a5;font-size:24px;line-height:1.8}.footer b{color:#d0b588;font-weight:400}.track{position:absolute;left:92px;right:144px;top:1768px;display:flex;gap:12px}.track i{display:block;width:20%;height:4px;background:#536054}.track i.on{background:#d6ac72}.progress{position:absolute;bottom:0;left:0;height:4px;background:#b08c59;width:${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%}
</style><div class="grain"></div><header><div class="brand"><i class="mark"></i>தமிழ் வரலாறு</div><div>01 / கல்வெட்டுகள்</div></header><div class="rule"></div><div class="eyebrow">${e(labels[scene])}</div><h1>${e(headings[scene][0])}<span>${e(headings[scene][1])}</span></h1><div class="art">${illustration(scene)}</div><div class="art-note">விளக்கப்படம்</div><div class="caption" style="${caption ? '' : 'visibility:hidden'}"><p>${e(caption)}</p></div><div class="footer"><b>ஆதாரங்கள்</b><br>தமிழ்நாடு தொல்லியல் துறை · ASI</div><div class="track">${Array.from({ length: 5 }, (_, i) => `<i class="${i <= scene ? 'on' : ''}"></i>`).join('')}</div><div class="progress"></div></html>`;
}
