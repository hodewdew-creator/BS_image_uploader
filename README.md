# FORCAT-Dropbox-Uploader

휴대폰에서 로그인 없이 사진을 올리면, Vercel 서버리스 API가 **기존 Dropbox 폴더(수의사별)**에 저장합니다.

## 빠른 시작
1) 이 템플릿으로 새 리포 생성 → Vercel 프로젝트로 Import
2) 환경변수 추가: `DROPBOX_*`, `PIN_CODE`, `ALLOWED_ORIGINS`
3) 배포 후 `/public/upload.html` 접속

## 환경변수
- `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN`
- `PIN_CODE`: 공용 업로드 PIN (기본 6364 로 제공)
- `ALLOWED_ORIGINS`: CORS 허용 도메인(쉼표 구분). 현재 설정: https://bs-image-uploader.vercel.app

## 보안/정책
- 화이트리스트된 수의사만 업로드 가능
- 확장자: jpg/jpeg/png
- 최대 40MB (클라에서 2500px 리사이즈 권장)
- 덮어쓰기 방지(`mode: add, autorename: true`)
- 동일 폴더에 업로드 메타 JSON 로그 저장

## 주의
- Dropbox 앱 권한은 **Full Dropbox**로 생성해야 기존 폴더 경로에 접근 가능
