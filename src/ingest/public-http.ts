import axios from 'axios';
import {lookup} from 'node:dns';
import {isIP} from 'node:net';
import {Agent as HttpAgent} from 'node:http';
import {Agent as HttpsAgent} from 'node:https';

export type PublicGet = (url:string,headers?:Record<string,string>)=>Promise<any>;
export function publicUrl(value:string):string {
 const u=new URL(value);
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port)||isPrivateAddress(u.hostname)||/\.(?:local|localhost|internal)$/i.test(u.hostname))throw new Error('Chỉ hỗ trợ URL HTTP(S) công khai, không có thông tin đăng nhập.');
 return u.toString();
}
export function isPrivateAddress(value:string):boolean {
 const ip=value.toLowerCase().replace(/^\[|\]$/g,'');
 if(ip==='localhost'||ip==='::'||ip==='::1'||ip.startsWith('::')||ip.startsWith('ff')&&isIP(ip)===6||/^(?:fc|fd|fe[89ab])/i.test(ip)&&isIP(ip)===6)return true;
 if(isIP(ip)===4){const [a,b]=ip.split('.').map(Number);return a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127;}
 return false;
}
// Validate the resolved address on each connection, including redirects. Nock can still mock requests without real DNS.
const safeLookup:typeof lookup=((hostname:string,options:any,callback:any)=>{
 lookup(hostname,{all:true},(error,addresses)=>{
  if(error)return callback(error);
  if(!addresses.length||addresses.some(a=>isPrivateAddress(a.address)))return callback(new Error('Địa chỉ mạng nội bộ không được hỗ trợ.'));
  if(options?.all)return callback(null,addresses);
  callback(null,addresses[0].address,addresses[0].family);
 });
}) as typeof lookup;
const httpAgent=new HttpAgent({lookup:safeLookup}),httpsAgent=new HttpsAgent({lookup:safeLookup});
export const publicGet:PublicGet=async(url,headers={})=>{
 const response=await axios.get(publicUrl(url),{headers:{'User-Agent':'AutoGenVid-AINewsRadar/1.0',...headers},timeout:12000,proxy:false,maxContentLength:3*1024*1024,maxBodyLength:3*1024*1024,beforeRedirect:options=>{const host=String(options.hostname||'');publicUrl(`${options.protocol}//${host.includes(':')&&!host.startsWith('[')?`[${host}]`:host}${options.port?`:${options.port}`:''}/`);if(options.auth)throw new Error('Không cho phép đăng nhập qua redirect.');},maxRedirects:Object.keys(headers).some(k=>k.toLowerCase()==='authorization')?0:3,httpAgent,httpsAgent});
 return response.data;
};
export function accessMessage(error:unknown):string {
 if(axios.isAxiosError(error)){
  const status=error.response?.status;
  if(status===429)return 'Nguồn đang giới hạn lượt gọi (429). Radar sẽ thử lại sau thời gian cache.';
  if(status===401||status===403)return `Nguồn từ chối truy cập (${status}); có thể cần quyền API hoặc nội dung không công khai.`;
  if(status)return `Nguồn trả HTTP ${status}.`;
  return error.code==='ECONNABORTED'?'Nguồn phản hồi quá chậm.': 'Không thể kết nối tới nguồn.';
 }
 return error instanceof Error?error.message:'Không thể đọc nguồn.';
}
