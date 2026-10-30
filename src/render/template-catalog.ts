import type { TemplateDataType } from './script-schema.js';
/** Editor catalogue: typed defaults, never executable templates supplied by a URL. */
export const TEMPLATE_CATALOG: { id: TemplateDataType['template']; label: string; data: TemplateDataType }[] = [
  {id:'data-flow',label:'Sơ đồ · input → xử lý → output',data:{template:'data-flow',title:'Luồng dữ liệu',nodes:[{label:'Input',detail:'Dữ liệu từ nguồn'},{label:'Output',detail:'Kết quả được mô tả'}],caption:'Minh họa luồng từ tài liệu'}},
  {id:'worked-example',label:'Ví dụ minh họa · từng bước',data:{template:'worked-example',title:'Ví dụ minh họa',input:'Input theo tài liệu',operation:'Xử lý theo tài liệu',output:'Kết quả theo tài liệu',basis:'conceptual'}},
  {id:'hook' ,label:'Hook · kính & tên sản phẩm',data:{template:'hook',headline:'Ý chính của video',subhead:'Bằng chứng từ nguồn',kenBurns:'zoom-in'}},
  {id:'stat-hero',label:'Số liệu lớn',data:{template:'stat-hero',value:'15',label:'Thay bằng số có trong nguồn'}},
  {id:'feature-list',label:'Thẻ tính năng',data:{template:'feature-list',title:'Điểm nổi bật',bullets:['Nội dung từ nguồn']}},
  {id:'callout',label:'Trích dẫn / điểm nhấn',data:{template:'callout',statement:'Một ý chính có trong nguồn'}},
  {id:'comparison',label:'So sánh hai phía',data:{template:'comparison',left:{label:'Phía A',value:'Chi tiết A',color:'cyan'},right:{label:'Phía B',value:'Chi tiết B',color:'purple'}}},
  {id:'workflow',label:'Workflow · từng bước',data:{template:'workflow',title:'Cách bắt đầu',steps:[{label:'Bước một',detail:'Điền thao tác thật'},{label:'Bước hai',detail:'Điền kết quả thật'}]}},
  {id:'code-window',label:'Code / terminal',data:{template:'code-window',title:'Lệnh từ README',language:'shell',code:'# Dán lệnh có thật từ README',note:'Kiểm tra điều kiện trước khi chạy'}},
  {id:'spec-table',label:'Bảng thông tin',data:{template:'spec-table',productName:'Thông tin dự án',specs:[{label:'Thuộc tính',value:'Giá trị từ nguồn'}]}},
  {id:'pros-cons',label:'Ưu điểm / giới hạn',data:{template:'pros-cons',title:'Cân nhắc trước khi dùng',pros:['Điểm mạnh từ nguồn'],cons:['Điều kiện từ nguồn']}},
  {id:'verdict-score',label:'Điểm đánh giá · cần nguồn',data:{template:'verdict-score',productName:'Tên sản phẩm',score:0,scale:'10',verdict:'Điền điểm có nguồn',summary:'Không tự tạo điểm đánh giá'}},
  {id:'price-tag',label:'Giá · cần nguồn',data:{template:'price-tag',productName:'Tên sản phẩm',price:'Điền giá từ nguồn'}},
  {id:'image-gallery',label:'Bộ ảnh',data:{template:'image-gallery',title:'Hình ảnh dự án',images:[{src:'about:blank',caption:'Dán URL ảnh'}]}},
  {id:'phone-mockup',label:'Khung điện thoại',data:{template:'phone-mockup',title:'Giao diện',screenSrc:'about:blank',caption:'Dán URL screenshot vào screenSrc'}},
  {id:'outro',label:'Kết thúc',data:{template:'outro',ctaTop:'Xem repo để tìm hiểu',channelName:'Kênh của bạn',source:'github.com'}},
];
