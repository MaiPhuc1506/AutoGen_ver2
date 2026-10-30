import type {Script} from '../render/script-schema.js';
const normalize=(s:string)=>s.normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
const evidenceMatches=(source:string,evidence:string)=>normalize(source).includes(normalize(evidence)) || normalize(source.replace(/`/g,'')).includes(normalize(evidence.replace(/`/g,'')));
/** Evidence match is a review aid, not proof that a generated explanation is correct. */
export function reviewStoryboard(script:Script, source:string):void {
  if(script.directingMode!=='auto')return;
  for(const scene of script.scenes){
    if(!scene.storyboard)throw new Error(`Cảnh ${scene.id} thiếu storyboard (intent, visualBrief, basis, evidence, transitionReason).`);
    scene.storyboard.status=evidenceMatches(source,scene.storyboard.evidence)?'source-matched':'needs-review';
    if(!scene.transition)scene.transition={type:scene.templateData.template==='code-window'?'zoom':scene.templateData.template==='data-flow'?'slide':'fade',duration:.25};
    if(scene.templateData.template==='code-window'){
      const code=normalize(scene.templateData.code);
      if(!normalize(source).includes(code))scene.storyboard.status='needs-review';
    }
  }
}

/** New GitHub drafts only: imported/legacy scripts keep their existing layout. */
export function prioritizePracticalExample(script:Script,sourceUrl:string):void {
  if(!script.explanationLevel || script.directingMode!=='auto' || !/^https:\/\/(?:www\.)?github\.com\//i.test(sourceUrl))return;
  const firstBody=script.scenes.findIndex(s=>s.type==='body');
  const example=script.scenes.findIndex(s=>s.type==='body'&&s.templateData.template==='worked-example');
  // Stable scene IDs retain coverage links; do this before timing is measured.
  if(firstBody>=0&&example>firstBody)script.scenes.splice(firstBody,0,...script.scenes.splice(example,1));
}
export function validatePracticalExamples(script:Script, sourceUrl:string):void {
  if(!script.explanationLevel || script.directingMode!=='auto' || !/^https:\/\/(?:www\.)?github\.com\//i.test(sourceUrl))return;
  const examples=script.scenes.filter(s=>s.templateData.template==='worked-example');
  const coverage=script.coverage?.items;
  const lacksFunction=coverage?.filter(i=>['purpose','features','usage','examples'].includes(i.topic));
  if(!examples.length && lacksFunction?.length===4 && lacksFunction.every(i=>i.status==='not-in-source'))return;
  if(script.scenes.find(s=>s.type==='body')?.templateData.template!=='worked-example')throw new Error('Ngay sau hook tên repo/số sao cần một cảnh worked-example giải thích đầu vào cụ thể → xử lý → kết quả. Không tạo thêm hook hoặc liệt kê tính năng chung.');
  const preferred=script.explanationLevel==='quick'?1:script.explanationLevel==='standard'?2:3;
  const explainedOmission=script.coverage?.omittedTopics.some(reason=>/(?:ví dụ|example)/iu.test(reason));
  if(examples.length<preferred&&!explainedOmission)throw new Error(`Mức ${script.explanationLevel} ưu tiên ${preferred} worked-example khác nhau, hiện chỉ có ${examples.length}. Thay cảnh liệt kê bằng tình huống mới có cơ sở. Nếu nguồn hoặc thời lượng không đủ, giải thích cụ thể việc bớt ví dụ trong coverage.omittedTopics, không bịa để đủ số lượng.`);
  const seen=new Set<string>();
  for(const scene of examples){
    const td=scene.templateData;
    if(td.template!=='worked-example')continue;
    if(scene.storyboard?.status!=='source-matched')throw new Error(`Ví dụ ${scene.id} có evidence không tìm thấy trong nguồn: ${JSON.stringify(scene.storyboard?.evidence)}. Thay bằng đoạn ngắn chép nguyên văn từ nguồn xác nhận chức năng; không ghép các đoạn xa nhau hoặc bịa kết quả chạy thử.`);
    if(scene.storyboard.basis!==td.basis)throw new Error(`Ví dụ ${scene.id}: basis của storyboard và worked-example phải khớp nhau.`);
    if([td.input,td.operation,td.output].some(v=>/^(?:input|output|data|process|dữ liệu|đầu vào|đầu ra|xử lý|kết quả)[.!]?$/iu.test(v.trim())))throw new Error(`Ví dụ ${scene.id} còn nhãn chung chung; cần đầu vào, thao tác và kết quả cụ thể dựa trên nguồn.`);
    const key=normalize(td.input)+'→'+normalize(td.output);
    if(seen.has(key))throw new Error(`Ví dụ ${scene.id} lặp đầu vào và kết quả của ví dụ trước. Chọn tác vụ khác hoặc bỏ cảnh lặp.`);
    seen.add(key);
  }
  const exampleCoverage=coverage?.find(i=>i.topic==='examples');
  if(exampleCoverage?.status==='covered' && !exampleCoverage.sceneIds.some(id=>examples.some(s=>s.id===id)))throw new Error('coverage.examples phải trỏ tới cảnh worked-example thực sự, không trỏ tới danh sách tính năng.');
}
