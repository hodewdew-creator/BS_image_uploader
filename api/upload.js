// api/upload.js  (Vercel Serverless Function)
import formidable from "formidable";
import { readFile } from "fs/promises";

// Vercel 전용 설정: bodyParser 끄기 (formidable 사용)
export const config = { api: { bodyParser: false } };

// === 환경설정 ===
const ALLOWED_EXT = ["jpg","jpeg","png"];
const MAX_FILE_BYTES = 40 * 1024 * 1024; // 40MB
const PIN_REQUIRED = true;

// 수의사 → 기존 폴더 경로(드롭박스 API 경로 표기, 슬래시 사용)
const VET_PATHS = {
  "김형준": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/김형준",
  "김지현": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/김지현",
  "조문주": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/조문주",
  "이소민": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/이소민",
  "송애라": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/송애라",
  "이은지": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/이은지",
  "민금주": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/민금주",
  "유수민": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/유수민",
  "정소연": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/정소연",
  "문정현": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/문정현",
  "한아름": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/한아름",
  "박소민": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/박소민"
};

// CORS 허용 도메인(쉼표로 여러 개). 예: "https://forcat.baeksan.co.kr,http://localhost:5173"
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(s=>s.trim()).filter(Boolean);

function cors(res, origin){
  if(ALLOWED_ORIGINS.length===0){
    // 기본: 개발 편의 위해 모든 출처 허용(원하면 바꾸세요)
    res.setHeader("Access-Control-Allow-Origin", "*");
  }else if(origin && ALLOWED_ORIGINS.includes(origin)){
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function clean(s){ return String(s||"").trim().replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " "); }
function ymd(){ const d=new Date(); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}`; }

async function getDropboxAccessToken(){
  const key = process.env.DROPBOX_APP_KEY;
  const sec = process.env.DROPBOX_APP_SECRET;
  const rtk = process.env.DROPBOX_REFRESH_TOKEN;
  if(!key || !sec || !rtk) throw new Error("Dropbox env missing");
  const basic = Buffer.from(`${key}:${sec}`).toString("base64");
  const rsp = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method:"POST",
    headers:{ "Authorization":`Basic ${basic}`, "Content-Type":"application/x-www-form-urlencoded" },
    body:new URLSearchParams({ grant_type:"refresh_token", refresh_token:rtk })
  });
  const data = await rsp.json();
  if(!data.access_token) throw new Error("Dropbox token issue: "+JSON.stringify(data));
  return data.access_token;
}

async function uploadToDropbox(token, path, buffer){
  const up = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method:"POST",
    headers:{
      "Authorization": `Bearer ${token}`,
      "Dropbox-API-Arg": JSON.stringify({ path, mode:"add", autorename:true, mute:true }),
      "Content-Type":"application/octet-stream"
    },
    body: buffer
  });
  if(!up.ok){
    const t = await up.text();
    throw new Error("Dropbox upload 실패: " + t);
  }
  return up.json();
}

export default async function handler(req, res){
  try{
    cors(res, req.headers.origin);
    if(req.method === "OPTIONS"){ res.status(200).end(); return; }
    if(req.method !== "POST"){ res.status(405).json({ok:false, error:"Method not allowed"}); return; }

    // ---- parse form ----
    const form = formidable({ multiples:false, maxFileSize: MAX_FILE_BYTES+1024*1024 /*조금 여유*/ });
    const { fields, files } = await new Promise((resolve,reject)=>{
      form.parse(req,(err,fields,files)=> err?reject(err):resolve({fields,files}));
    });

    const pin = clean(fields.pin);
    if(PIN_REQUIRED){
      const PIN_CODE = process.env.PIN_CODE;
      if(!PIN_CODE) return res.status(500).json({ok:false, error:"PIN_CODE not set on server"});
      if(pin !== PIN_CODE) return res.status(401).json({ok:false, error:"PIN 불일치"});
    }

    const vet = clean(fields.vet);
    const patient = clean(fields.patient);
    const owner = clean(fields.owner);
    const title = clean(fields.title);
    const f = files.file;

    if(!vet || !VET_PATHS[vet]) return res.status(400).json({ok:false, error:"허용되지 않은 수의사"});
    if(!patient) return res.status(400).json({ok:false, error:"환자이름 누락"});
    if(!title) return res.status(400).json({ok:false, error:"제목 누락"});
    if(!f) return res.status(400).json({ok:false, error:"파일 없음"});
    if(f.size > MAX_FILE_BYTES) return res.status(400).json({ok:false, error:`파일이 너무 큽니다(최대 ${(MAX_FILE_BYTES/1024/1024)|0}MB)`});

    const buf = await readFile(f.filepath);
    const ext = (f.originalFilename?.match(/\.([a-zA-Z0-9]+)$/)?.[1] || "jpg").toLowerCase();
    if(!ALLOWED_EXT.includes(ext)) return res.status(400).json({ok:false, error:`허용되지 않은 확장자(.${ext})`});

    const dateStr = ymd();
    const baseName = owner ? `${patient}_${owner}_${dateStr}_${title}` : `${patient}_${dateStr}_${title}`;
    const basePath = VET_PATHS[vet];
    const dropboxPath = `${basePath}/${baseName}.${ext}`;

    const token = await getDropboxAccessToken();

    // 1) 원본 이미지 업로드
    await uploadToDropbox(token, dropboxPath, buf);

    // 2) 메타데이터 JSON 로그도 같은 폴더에 저장
    const meta = {
      uploaded_at: new Date().toISOString(),
      vet, patient, owner, title, date: dateStr,
      original_filename: f.originalFilename || null,
      size_bytes: f.size,
      mime: f.mimetype || null,
      saved_path: dropboxPath,
      client_ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null,
      user_agent: req.headers["user-agent"] || null
    };
    const metaBuf = Buffer.from(JSON.stringify(meta, null, 2), "utf-8");
    await uploadToDropbox(token, `${basePath}/${baseName}.json`, metaBuf);

    res.status(200).json({ ok:true, path: dropboxPath });
  }catch(e){
    console.error(e);
    res.status(500).json({ ok:false, error: e.message });
  }
}
