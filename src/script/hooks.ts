/** Source-only alternatives; no invented percentages, promises, rankings or scarcity. */
export interface HookSuggestion { label: string; headline: string; subhead: string; voiceText: string; }
export function compactText(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}
export function sourceFacts(content: string, title: string): string[] {
  const clean = content.replace(/```[\s\S]*?```/g, ' ').replace(/https?:\/\/\S+/g, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/^[\s#>*-]+/gm, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  const facts = clean.split(/\n+|(?<=[.!?])\s+/u).map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s.length >= 12);
  return [...new Set(facts.length ? facts : [title.trim()])];
}
export function buildHookSuggestions(title: string, content: string, hookType?: 'problem-solution'|'question'): HookSuggestion[] {
  const facts = sourceFacts(content, title);
  // Prefer a short concrete action/benefit over the repository or article name.
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const ranked = [...facts].sort((a,b) => {
    const score = (s: string) => (/(tao|tu dong|chi can|mot cau|giup|ho tro|tiet kiem)/.test(norm(s)) ? 4 : 0) + (/\d/.test(s) ? 2 : 0) - Math.max(0,s.split(/\s+/).length-22)/10;
    return score(b)-score(a);
  });
  const benefit = ranked[0];
  const numeric = facts.find(f => /\d/.test(f));
  const caveat = facts.find(f => /\b(nhưng|chưa|không|giới hạn|lưu ý)\b/iu.test(f));
  const direct: HookSuggestion = { label:'Đi thẳng vào lợi ích', headline:compactText(benefit.replace(/[.!?]+$/,''),40), subhead:compactText(title,40), voiceText:benefit };
  // A narrow, source-backed editorial rewrite for the design-system use case.
  if (facts.some(f => /m[oộ]t c[aâ]u/iu.test(f) && /design system/iu.test(f) && /(?:tạo|ra)/iu.test(f) && !/(?:không|chưa) thể/iu.test(f))) {
    direct.headline = 'Một câu.\nCả design system?';
    direct.voiceText = 'Một câu mô tả, ra cả design system?';
    direct.subhead = compactText(facts.find(f=>/design system/iu.test(f)) || title,40);
  }
  const evidence = numeric || ranked[1] || benefit;
  const question = (caveat || ranked[ranked.length-1] || benefit).replace(/[.!?]+$/,'');
  const suggestions = [direct,
    { label: numeric ? 'Mở bằng số liệu nguồn' : 'Mở bằng tính năng', headline:compactText(evidence.replace(/[.!?]+$/,''),40), subhead:'Chi tiết có trong nguồn', voiceText:evidence },
    { label:caveat ? 'Đặt giới hạn lên trước' : 'Đặt câu hỏi', headline:compactText(question+'?',40), subhead:compactText(title,40), voiceText:question+'?' },
  ].filter((v,i,a)=>a.findIndex(p=>p.voiceText===v.voiceText)===i);
  if(hookType==='question')return suggestions.map(h=>({...h,label:'Câu hỏi · '+h.label,headline:compactText(h.headline.replace(/[.!?…]+$/u,'')+'?',40),voiceText:h.voiceText.replace(/[.!?]+$/u,'')+'?'}));
  if(hookType==='problem-solution'){
    const problem=facts.find(f=>/(?:khó|mất thời gian|thủ công|ngốn|rườm rà|vấn đề|bất tiện|too many|manual|problem|slow|difficult)/iu.test(f));
    // Source-only mode preserves exact statements, including negation and units.
    const solution=ranked.find(f=>f!==problem);
    if(problem&&solution){
      const lowerInitial=(s:string)=>s.replace(/^[A-ZÀ-Ỹ][a-zà-ỹ]/u,m=>m.toLowerCase());
      const contrast=/^(?:Bạn phải|Phải|Mở|Dựng|Làm|Thao tác|Việc|Người dùng phải)(?:\s|$)/u.test(problem);
      const voiceText=contrast?'Thay vì '+lowerInitial(problem.replace(/[.!?]+$/u,''))+', '+lowerInitial(solution):problem+' '+solution;
      suggestions.unshift({label:'Vấn đề → giải pháp',headline:compactText(problem,40),subhead:compactText(solution,40),voiceText});
    }
    else suggestions[0]={...suggestions[0],label:'Giải pháp từ nguồn · chưa có vấn đề cụ thể'};
  }
  return suggestions.slice(0,4);
}
