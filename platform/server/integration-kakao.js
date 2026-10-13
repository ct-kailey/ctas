'use strict';
const {hash,fail}=require('./integration-contract');
function parseKakaoExport(input){
 if(typeof input!=='string'||!input.trim()||input.length>200000)fail('INVALID_KAKAO_EXPORT','대화 내보내기 텍스트는 1–200,000자까지 입력하세요.');
 let date=null,last=null;const messages=[],warnings=[],duplicates=new Map();
 const datePattern=/(\d{4})(?:년|\.)\s*(\d{1,2})(?:월|\.)\s*(\d{1,2})(?:일|\.)/;
 const timePattern=/(오전|오후)\s*(\d{1,2}):(\d{2})/;
 function setDate(parts){return `${parts[1]}-${parts[2].padStart(2,'0')}-${parts[3].padStart(2,'0')}`;}
 for(const raw of input.replace(/^\uFEFF/,'').split(/\r?\n/)){
  const dated=raw.match(datePattern),timed=raw.match(timePattern);let author,body,time;
  const desktop=raw.match(/^\[([^\]]+)\]\s*\[(오전|오후)\s*(\d{1,2}):(\d{2})\]\s?(.*)$/);
  const mobile=dated&&timed?raw.match(/(?:오전|오후)\s*\d{1,2}:\d{2},\s*(.*?)\s*:\s?(.*)$/):null;
  if(desktop){[,author,...time]=desktop;body=time.pop();}
  else if(mobile){date=setDate(dated);author=mobile[1];body=mobile[2];time=[timed[1],timed[2],timed[3]];}
  else if(dated&&/^[-\s]*\d{4}/.test(raw)&&!timed){date=setDate(dated);last=null;continue;}
  else {if(last){last.text+='\n'+raw;if(last.text.length>19500)fail('INVALID_KAKAO_EXPORT','긴 메시지는 19,500자 이하로 나누어 입력해 주세요.');}else if(raw.trim()&&!/대화|저장한 날짜|KakaoTalk|^-+$/.test(raw)){if(!warnings.includes('UNPARSED_HEADER'))warnings.push('UNPARSED_HEADER');}continue;}
  if(!date)fail('INVALID_KAKAO_EXPORT','첫 메시지 앞에 연·월·일이 포함된 날짜 구분이 필요합니다.');
  let hour=Number(time[1]),minute=Number(time[2]);if(hour<1||hour>12||minute>59)fail('INVALID_KAKAO_EXPORT','대화 시간 형식을 확인하세요.');hour=hour%12+(time[0]==='오후'?12:0);
  const sent_at=`${date}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00+09:00`,d=new Date(sent_at);if(Number.isNaN(d.getTime())||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)!==date)fail('INVALID_KAKAO_EXPORT','대화 날짜가 유효하지 않습니다.');
  last={kind:'created',author:author.trim(),text:body,sent_at,changed_at:null,url:null};messages.push(last);
 }
 if(!messages.length)fail('INVALID_KAKAO_EXPORT','메시지를 읽지 못했습니다. 한국어 카카오톡 텍스트 내보내기 형식을 사용하세요.');
 for(const m of messages){const fingerprint=hash([m.author,m.sent_at,m.text]),index=duplicates.get(fingerprint)||0;duplicates.set(fingerprint,index+1);m.message_id=`export:${hash([fingerprint,index])}`;m.event_id=m.message_id;}
 return {messages,warnings};
}
module.exports={parseKakaoExport};
