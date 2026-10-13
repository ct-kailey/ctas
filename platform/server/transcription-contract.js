'use strict';
const {createHash}=require('node:crypto');
const path=require('node:path');
const {error}=require('./auth');
const {id,text,timestamp,hash,object}=require('./context-contract');
const MAX_AUDIO_BYTES=20*1024*1024;
const MODELS=new Set(['whisper-1','gpt-4o-transcribe','gpt-4o-mini-transcribe','gpt-4o-mini-transcribe-2025-12-15','gpt-4o-transcribe-diarize','gpt-transcribe']);
function fail(code,message,status=400){throw error(code,message,status);}
function audioInput(file){
 if(!file||!Buffer.isBuffer(file.buffer)||!file.buffer.length||file.buffer.length>MAX_AUDIO_BYTES)fail('TRANSCRIPTION_FILE_SIZE','음성 파일은 1바이트 이상 20 MiB 이하여야 합니다.',413);
 const filename=text(file.originalname,'음성 파일 이름',255);
 if(/[\\/\x00-\x1f\x7f]/.test(filename))fail('TRANSCRIPTION_FILENAME','파일 이름에 경로나 제어 문자를 사용할 수 없습니다.');
 const ext=path.extname(filename).toLowerCase(),b=file.buffer,mime=String(file.mimetype||'').split(';')[0].toLowerCase();
 const audioMime={'.wav':['audio/wav','audio/x-wav','audio/wave'],'.mp3':['audio/mpeg','audio/mp3'],'.m4a':['audio/mp4','audio/x-m4a'],'.mp4':['audio/mp4','video/mp4'],'.webm':['audio/webm','video/webm'],'.ogg':['audio/ogg','application/ogg'],'.flac':['audio/flac','audio/x-flac']}[ext];
 if(!audioMime||!audioMime.includes(mime))fail('TRANSCRIPTION_FILE_TYPE','WAV, MP3, M4A, MP4, WebM, OGG, FLAC 음성 파일을 선택하세요.',415);
 let valid=false;
 if(ext==='.wav')valid=b.length>=44&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WAVE'&&b.readUInt32LE(4)+8<=b.length;
 if(ext==='.mp3')valid=b.length>=10&&(b.toString('ascii',0,3)==='ID3'||(b[0]===255&&(b[1]&224)===224&&(b[1]&6)!==0));
 if(ext==='.mp4'||ext==='.m4a')valid=b.length>=24&&b.toString('ascii',4,8)==='ftyp'&&b.readUInt32BE(0)>=16&&b.readUInt32BE(0)<=b.length;
 if(ext==='.webm')valid=b.length>=16&&b.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))&&b.subarray(4,Math.min(b.length,4096)).includes(Buffer.from('webm'));
 if(ext==='.ogg')valid=b.length>=28&&b.toString('ascii',0,4)==='OggS'&&b[4]===0;
 if(ext==='.flac')valid=b.length>=42&&b.toString('ascii',0,4)==='fLaC';
 if(!valid)fail('TRANSCRIPTION_FILE_SIGNATURE','파일의 실제 형식이 확장자·음성 형식과 일치하지 않습니다.',415);
 return {filename,mime_type:audioMime[0],audio:Buffer.from(b),audio_sha256:createHash('sha256').update(b).digest('hex')};
}
function uploadInput(body,file){object(body,['request_id','title','domain_id','occurred_at','channel','language']);const language=body.language||null;if(language!==null&&!/^[a-z]{2}$/.test(language))fail('TRANSCRIPTION_LANGUAGE','언어는 ko, en 등 두 글자 코드를 사용하세요.');return {id:id(body.request_id),title:text(body.title,'회의 제목',300),domain_id:body.domain_id?id(body.domain_id):null,occurred_at:timestamp(body.occurred_at),channel:text(body.channel||'회의 녹음','회의 채널',200),language,...audioInput(file)};}
function modelConfig(config={}){const model=config.transcriptionModel||'whisper-1';if(!MODELS.has(model))fail('TRANSCRIPTION_MODEL','지원하는 음성 변환 모델을 설정하세요.',503);return {apiKey:config.apiKey||'',model};}
function normalizeTranscript(value,model){
 if(!value||typeof value.text!=='string'||!value.text.trim()||value.text.length>300000||value.text.includes('\0'))fail('TRANSCRIPTION_INVALID_RESULT','음성 변환 결과 형식을 확인할 수 없습니다.',502);
 const duration=value.duration===undefined?null:Number(value.duration);if(duration!==null&&(!Number.isFinite(duration)||duration<0||duration>86400))fail('TRANSCRIPTION_INVALID_RESULT','음성 길이 정보를 확인할 수 없습니다.',502);
 const raw=value.segments===undefined?[]:value.segments;if(!Array.isArray(raw)||raw.length>5000)fail('TRANSCRIPTION_INVALID_RESULT','음성 구간 정보를 확인할 수 없습니다.',502);
 const segments=raw.map((s,i)=>{if(!s||typeof s.text!=='string'||s.text.length>300000||!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.start<0||s.end<s.start||(duration!==null&&s.end>duration+1))fail('TRANSCRIPTION_INVALID_RESULT','음성 구간 시각이 올바르지 않습니다.',502);return {id:`segment_${i+1}`,start:s.start,end:s.end,text:s.text,speaker:model==='gpt-4o-transcribe-diarize'&&typeof s.speaker==='string'?s.speaker.slice(0,200):null};});
 return {text:value.text,segments,duration,language:typeof value.language==='string'?value.language.slice(0,100):null,model,speaker_identification:segments.some(s=>s.speaker!==null)?'anonymous_labels':'not_available',timestamps:segments.length?'segment':'not_available',content_is_untrusted:true};
}
function reviewInput(body){object(body,['request_id','expected_original_sha256','expected_context_version','edited_text','reason','segment_ids']);if(!/^[a-f0-9]{64}$/.test(body.expected_original_sha256||''))fail('TRANSCRIPTION_HASH_REQUIRED','확인한 원본 전사문 해시가 필요합니다.');if(!Number.isSafeInteger(body.expected_context_version)||body.expected_context_version<0)fail('CONTEXT_VERSION_REQUIRED','현재 Main Context 버전이 필요합니다.');if(!Array.isArray(body.segment_ids)||body.segment_ids.length>5000||body.segment_ids.some(v=>typeof v!=='string'||!/^segment_[1-9]\d*$/.test(v))||new Set(body.segment_ids).size!==body.segment_ids.length)fail('TRANSCRIPTION_SEGMENTS','확인한 음성 구간을 선택하세요.');return {request_id:id(body.request_id),expected_original_sha256:body.expected_original_sha256,expected_context_version:body.expected_context_version,edited_text:text(body.edited_text,'검토한 회의 내용',40000),reason:text(body.reason,'검토 내용',5000),segment_ids:[...body.segment_ids].sort((a,b)=>Number(a.slice(8))-Number(b.slice(8)))};}
module.exports={MAX_AUDIO_BYTES,MODELS,fail,audioInput,uploadInput,modelConfig,normalizeTranscript,reviewInput,hash};
