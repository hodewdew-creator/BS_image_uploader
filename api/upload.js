import formidable from "formidable";
import { readFile } from "fs/promises";

export const config = { api: { bodyParser: false } };

// ===== 정책 =====
const ALLOWED_EXT = ["jpg","jpeg","png"];
const MAX_FILE_BYTES = 40 * 1024 * 1024; // 40MB
const PIN_REQUIRED = true;

// 수의사 → 기존 폴더 경로 (슬래시 / 표기, 맨 앞 / 필수)
const VET_PATHS = {
  "김지현": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/김지현",
  "김형준": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/김형준",
  "문정현": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/문정현",
  "민금주": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/민금주",
  "박소민": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/박소민",
  "송애라": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/송애라",
  "유수민": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/유수민",
  "이은지": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/이은지",
  "이소민": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/이소민",
  "정소연": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/정소연",
  "조문주": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/조문주",
  "한아름": "/백산 데이타 공유 폴더/01. 수의사/000. 입원환자처치표/한아름"
};

// CORS
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(s=>s.trim()).filter(Boolean);
function cors(res, origin){
  if (ALLOWED_ORIGINS.length === 0) res.setHeader("Access-Control-Allow-Origin", "*");
  else if (origin && ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
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
  // ❶ 원래 JSON 만들고
  const apiArg = JSON.stringify({
    path,
    mode: "add",
    autorename: true,
    mute: true
  });

  // ❷ 한글/비ASCII를 안전하게 URL-인코딩
  const safeArg = encodeURI(apiArg);

  const up = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      // ❸ 인코딩된 값을 헤더에 넣기
      "Dropbox-API-Arg": safeArg,
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
  try {
    cors(res, req.headers.origin);

    if (req.method === "OPTIONS") { res.status(200).end(); return; }

    // ✅ GET은 헬스체크 용으로 항상 JSON 200
    if (req.method === "GET") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.status(200).end(JSON.stringify({ ok:false, hint:"POST /api/upload 로 파일 업로드", method:req.method }));
      return;
    }

    if (req.method !== "POST") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.status(405).end(JSON.stringify({ ok:false, error:"Method not allowed" }));
      return;
    }

    // ---- 폼 파싱 (서버리스 안전 설정) ----
    const form = formidable({
      multiples: false,
      maxFileSize: MAX_FILE_BYTES + 1024 * 1024,
      uploadDir: "/tmp",
      keepExtensions: true
    });

    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => err ? reject(err) : resolve({ fields, files }));
    });

    // 파일 레퍼런스 정규화
    let fileField = files?.file ?? files?.["file"] ?? Object.values(files || {})[0];
    const f = Array.isArray(fileField) ? fileField[0] : fileField;

    const pin = clean(fields.pin);
    if (PIN_REQUIRED) {
      const PIN_CODE = process.env.PIN_CODE;
      if(!PIN_CODE) throw new Error("PIN_CODE not set on server");
      if(pin !== PIN_CODE) { res.status(401).json({ ok:false, error:"PIN 불일치" }); return; }
    }

    const vet = clean(fields.vet);
    const patient = clean(fields.patient);
    const owner = clean(fields.owner);
    const title = clean(fields.title);

    if(!vet || !VET_PATHS[vet]) { res.status(400).json({ ok:false, error:"허용되지 않은 수의사" }); return; }
    if(!patient) { res.status(400).json({ ok:false, error:"환자이름 누락" }); return; }
    if(!title) { res.status(400).json({ ok:false, error:"제목 누락" }); return; }
    if(!f || !f.filepath) { res.status(400).json({ ok:false, error:"업로드된 파일 없음" }); return; }
    if(f.size > MAX_FILE_BYTES) { res.status(400).json({ ok:false, error:`파일이 너무 큽니다(최대 ${(MAX_FILE_BYTES/1024/1024)|0}MB)` }); return; }

    const buf = await readFile(f.filepath);
    const ext = (f.originalFilename?.match(/\.([a-zA-Z0-9]+)$/)?.[1] || "jpg").toLowerCase();
    if(!ALLOWED_EXT.includes(ext)) { res.status(400).json({ ok:false, error:`허용되지 않은 확장자(.${ext})` }); return; }

    const dateStr = ymd();
    const baseName = owner ? `${patient}_${owner}_${dateStr}_${title}` : `${patient}_${dateStr}_${title}`;
    const basePath = VET_PATHS[vet];
    const dropboxPath = `${basePath}/${baseName}.${ext}`;

    const token = await getDropboxAccessToken();

    await uploadToDropbox(token, dropboxPath, buf);

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

  } catch (e) {
    console.error(e);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(500).end(JSON.stringify({ ok:false, error: String(e.message || e) }));
  }
}

