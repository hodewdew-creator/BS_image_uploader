import formidable from "formidable";
import { readFile } from "fs/promises";

export const config = { api: { bodyParser: false } };

// ===== 정책 =====
const ALLOWED_EXT = ["jpg", "jpeg", "png"];
const MAX_FILE_BYTES = 40 * 1024 * 1024; // 40MB
const PIN_REQUIRED = true;

const VET_PATHS = {
  // ㄱ
  "김지현": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/김지현",
  "김형준": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/김형준",

  // ㅁ
  "문정현": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/문정현",
  "민금주": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/민금주",

  // ㅂ
  "박소민": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/박소민",

  // ㅅ
  "송애라": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/송애라",

  // ㅇ (유 → 이 순)
  "유수민": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/유수민",
  "이은지": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/이은지",
  "이소민": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/이소민",

  // ㅈ (정 → 조 순)
  "정소연": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/정소연",
  "조문주": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/조문주",

  // ㅎ
  "한아름": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/한아름"
};

// CORS
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(s=>s.trim()).filter(Boolean);
function cors(res, origin){
  if (ALLOWED_ORIGINS.length === 0) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
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
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: rtk })
  });
  const data = await rsp.json();
  if(!data.access_token) throw new Error("Dropbox token issue: " + JSON.stringify(data));
  return data.access_token;
}

async function uploadToDropbox(token, path, buffer){
  const up = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Dropbox-API-Arg": JSON.stringify({ path, mode: "add", autorename: true, mute: true }),
      "Content-Type": "application/octet-stream"
    },
    body: buffer
  });
  if (!up.ok) {
    const t = await up.text();
    throw new Error("Dropbox upload 실패: " + t);
  }
  return up.json();
}

export default async function handler(req, res){
  try{
    cors(res, req.headers.origin);
    if (req.method === "OPTIONS") { res.status(200).end(); return; }
    if (req.method !== "POST") { res.status(405).json({ ok:false, error:"Method not allowed" }); return; }

    // ---- 폼 파싱 (서버리스 안전 설정) ----
    const form = formidable({
      multiples: false,
      maxFileSize: MAX_FILE_BYTES + 1024 * 1024, // 여유 1MB
      uploadDir: "/tmp",
      keepExtensions: true
    });

    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fi
