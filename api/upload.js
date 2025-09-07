<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
  <title>백산 이미지 업로더</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;padding:16px;line-height:1.4}
    .row{margin-bottom:12px}
    label{display:block;font-weight:600;margin-bottom:6px}
    input,select,button{font-size:16px;padding:10px;border:1px solid #ddd;border-radius:10px;width:100%}
    button{cursor:pointer}
    small{color:#666}
    .grid{display:grid;gap:12px}
    #status{white-space:pre-wrap;font-size:14px;background:#f9fafb;border:1px solid #eee;border-radius:8px;padding:10px;min-height:48px}
  </style>
</head>
<body>
  <h2>백산 이미지 업로더</h2>
  <div class="grid">
    <div class="row">
      <label for="pin">공용 PIN</label>
      <input id="pin" inputmode="numeric" pattern="\d*" placeholder="병원 공용 PIN 코드(예: 6364)" />
    </div>

    <div class="row">
      <label for="vet">수의사</label>
      <select id="vet">
        <option value="">선택</option>
        <!-- ㄱㄴㄷ 순 정렬 -->
        <option>김지현</option>
        <option>김형준</option>
        <option>문정현</option>
        <option>민금주</option>
        <option>박소민</option>
        <option>송애라</option>
        <option>유수민</option>
        <option>이은지</option>
        <option>이소민</option>
        <option>정소연</option>
        <option>조문주</option>
        <option>한아름</option>
      </select>
    </div>

    <div class="row">
      <label for="patient">환자이름 <span style="color:#c00">*</span></label>
      <input id="patient" placeholder="예: 냥냥이" required />
    </div>

    <div class="row">
      <label for="owner">보호자이름 (선택)</label>
      <input id="owner" placeholder="예: 김호두" />
    </div>

    <div class="row">
      <label for="title">제목 <span style="color:#c00">*</span></label>
      <input id="title" placeholder="예: 간FNA" required />
      <small>최종 파일명: 환자_보호자?_YYYYMMDD_제목.jpg (PNG는 .png)</small>
    </div>

    <div class="row">
      <label for="file">사진 촬영/선택</label>
      <input id="file" type="file" accept="image/*" capture="environment" multiple />
      <small>긴 변이 2500px 초과할 때만 자동으로 줄입니다. (jpg/png)</small>
    </div>

    <button id="upload">업로드</button>
    <pre id="status"></pre>
  </div>

  <script>
    // 전역 에러도 상태창에 출력
    window.addEventListener('error', e => {
      const s = document.getElementById('status');
      if (s) s.textContent += `\n❌ 스크립트 오류: ${e.message}`;
    });

    function todayYYYYMMDD(){
      const d = new Date(); const p=n=>String(n).padStart(2,'0');
      return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}`;
    }

    // iOS Safari 호환: 일반 <canvas> 사용. 2500px 초과시에만 리사이즈
    async function resizeIfNeeded(file){
      const isPNG = file.type === 'image/png';
      const isJPG = file.type === 'image/jpeg' || file.type === 'image/jpg';
      if(!isPNG && !isJPG) return file;

      const bmp = await createImageBitmap(file);
      const max = 2500;
      const long = Math.max(bmp.width, bmp.height);
      if(long <= max) return file; // 그대로 업로드

      const scale = max / long;
      const w = Math.round(bmp.width * scale);
      const h = Math.round(bmp.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.drawImage(bmp, 0, 0, w, h);

      const mime = isPNG ? 'image/png' : 'image/jpeg';
      const quality = isPNG ? undefined : 0.9;

      const blob = await new Promise((resolve, reject) => {
        if (!canvas.toBlob) {
          try {
            const dataURL = canvas.toDataURL(mime, quality);
            const bstr = atob(dataURL.split(',')[1]);
            const u8 = new Uint8Array(bstr.length);
            for (let i=0;i<bstr.length;i++) u8[i]=bstr.charCodeAt(i);
            resolve(new Blob([u8], { type: mime }));
          } catch (e) { reject(e); }
        } else {
          canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), mime, quality);
        }
      });

      const ext = isPNG ? '.png' : '.jpg';
      const base = file.name.replace(/\.\w+$/, '');
      return new File([blob], base + ext, { type: mime, lastModified: Date.now() });
    }

    document.getElementById('upload').onclick = async () => {
      const status = document.getElementById('status');
      status.textContent = '';

      const pin = document.getElementById('pin').value.trim();
      const vet = document.getElementById('vet').value.trim();
      const patient = document.getElementById('patient').value.trim();
      const owner = document.getElementById('owner').value.trim();
      const title = document.getElementById('title').value.trim();
      const files = [...document.getElementById('file').files];

      if(!pin){ alert('공용 PIN을 입력하세요'); return; }
      if(!vet){ alert('수의사를 선택하세요'); return; }
      if(!patient){ alert('환자이름은 필수입니다'); return; }
      if(!title){ alert('제목을 입력하세요'); return; }
      if(files.length===0){ alert('사진을 선택/촬영하세요'); return; }

      const ymd = todayYYYYMMDD();

      for(const f of files){
        let rf = f;
        try {
          rf = await resizeIfNeeded(f);
        } catch(e) {
          status.textContent += `\n⚠️ 리사이즈 실패, 원본으로 업로드: ${e.message}`;
          rf = f;
        }

        const hintName = `${patient}${owner?`_${owner}`:''}_${ymd}_${title}` + (rf.type==='image/png'?'.png':'.jpg');

        const form = new FormData();
        form.append('pin', pin);
        form.append('vet', vet);
        form.append('patient', patient);
        form.append('owner', owner);
        form.append('title', title);
        form.append('file', rf, hintName);

        try{
          const res = await fetch('/api/upload', { method: 'POST', body: form });
          const ct = res.headers.get('content-type') || '';
          const body = ct.includes('application/json') ? await res.json() : { ok:false, error: await res.text() };
          if(body.ok){
            status.textContent += `\n✅ 업로드 완료: ${body.path}`;
          }else{
            status.textContent += `\n❌ 실패: ${body.error || res.statusText}`;
          }
        }catch(e){
          status.textContent += `\n❌ 네트워크 오류: ${e.message}`;
        }
      }
    };
  </script>
</body>
</html>
