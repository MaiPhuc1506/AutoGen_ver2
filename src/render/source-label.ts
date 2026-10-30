/** Compact on-screen attribution. Full URLs remain untouched in media.json/script.json. */
export function sourceLabel(value:string):string {
  let label=value.trim().replace(/^Nguồn:\s*/i,'');
  const pretty=(raw:string)=>{try{
    const u=new URL(raw.startsWith('http')?raw:'https://'+raw);
    const host=u.hostname.replace(/^www\./,'');const p=u.pathname.split('/').filter(Boolean);
    if(['github.com','raw.githubusercontent.com','opengraph.githubassets.com'].includes(host)){
      const parts=host==='opengraph.githubassets.com'?p.slice(1):p;
      return 'GitHub'+(parts.length>=2?' · '+parts.slice(0,2).join('/').replace(/\.git$/,''):'');
    }
    if(host==='avatars.githubusercontent.com')return 'GitHub · ảnh tài khoản';
    return host;
  }catch{return 'Tư liệu nguồn';}};
  label=label.replace(/https?:\/\/[^\s<>"')]+/gi,pretty).replace(/\b(?:raw\.githubusercontent\.com|github\.com|opengraph\.githubassets\.com)\/[^\s<>"')]+/gi,pretty);
  if(/^(?:\/?Users\/|\/?private\/|[A-Z]:\\|studio-asset:|media\/)/i.test(label))label='Tư liệu tải lên';
  label=label.replace(/\s+/g,' ').trim();return label.length>64?label.slice(0,61)+'…':label;
}
