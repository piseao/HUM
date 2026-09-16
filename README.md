# HUM

떠오른 멜로디를 진짜 노래로.

브라우저에서 부른 노래를 기록하고, Spotify Basic Pitch로 음표를 추출한 뒤 직접 수정하고 확정하는 **Phase 1 로컬 MVP**입니다. 유료 API 키 없이 실행됩니다.

외부 HTTPS 테스트용 Vercel Hobby + Render Free 설정도 준비되어 있습니다. 계정 연결·배포 절차와 무료 저장소의 제한은 [배포 안내](docs/deployment.md)를 확인하세요. 아래 로컬 실행 방식은 그대로 사용할 수 있습니다.

## 1. 필요한 프로그램

- Node.js 22 이상과 npm: [Node.js 설치 페이지](https://nodejs.org/)
- Python 3.9~3.11: [Python 설치 페이지](https://www.python.org/downloads/). 현재 Mac에서는 기본 Python 3.9.6으로 검증했습니다. 새 환경에는 Python 3.10을 권장합니다. Basic Pitch 0.4.0의 오래된 의존성 때문에 Python 3.12 이상은 이 설치 절차에서 사용하지 마세요.
- Git: [Git 설치 페이지](https://git-scm.com/downloads)
- 최신 Chrome 권장. Safari에서는 MP4 녹음 경로를 제공하지만 실제 기기 테스트는 아직 하지 않았습니다.
- 마이크, 최초 패키지 설치 시 인터넷 연결, 패키지 설치용 여유 공간 약 2GB.

FFmpeg는 `imageio-ffmpeg` 패키지에 포함됩니다. 이 Mac에서는 별도로 설치할 필요가 없었습니다. 분석 모델도 Basic Pitch 패키지에 포함됩니다.

아래 명령어는 **macOS 터미널 기준**입니다. 터미널 앱을 열고 코드 상자 안의 명령어를 위에서부터 실행하세요. Windows/Linux는 Basic Pitch 의존성이 달라 별도 검증이 필요합니다.

## 2. 개발 도구 확인

```bash
node --version
npm --version
python3 --version
python3 -m pip --version
git --version
```

이 컴퓨터에서 확인한 버전: Node `22.22.0`, npm `10.9.4`, Python `3.9.6`, 초기 pip `21.2.4`, Git `2.39.2`. HUM 가상환경의 pip만 `26.0.1`로 업데이트했습니다.

## 3. 프로젝트 폴더로 이동

현재 위치:

```bash
cd /Users/onmam008/daeho/hum
```

다른 컴퓨터에서 GitHub로부터 내려받았다면 해당 `hum` 폴더의 경로로 바꾸세요. 기존 `daeho` 사이트 파일은 수정하지 않았습니다.

## 4. Frontend 설치

```bash
cd /Users/onmam008/daeho/hum/frontend
npm ci
```

`package-lock.json`에 실제 설치 버전을 고정했습니다. Next.js `16.3.5`, React `19.3.0`, TypeScript, App Router, Tailwind CSS 4, Lucide, Tone.js를 사용합니다.

## 5. Backend 가상환경 생성

```bash
cd /Users/onmam008/daeho/hum/backend
python3 -m venv .venv
source .venv/bin/activate
python --version
```

Python 3.10을 별도 설치했다면 가상환경 생성 명령만 `python3.10 -m venv .venv`로 바꾸세요. 이미 `.venv`가 있는 현재 컴퓨터에서는 활성화만 하면 됩니다.

## 6. Python 패키지 설치

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip check
```

설치에는 몇 분이 걸릴 수 있습니다. `requirements-macos-py39.lock.txt`는 실제 검증한 Mac/Python 3.9 환경의 전체 버전 목록입니다. 동일 환경을 재현할 때 `requirements.txt` 대신 사용할 수 있습니다. 다른 OS/Python에서는 기본 `requirements.txt`를 사용하세요.

## 7. Backend 실행

첫 번째 터미널에서:

```bash
cd /Users/onmam008/daeho/hum/backend
source .venv/bin/activate
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

`Uvicorn running on http://127.0.0.1:8000`이 나오면 성공입니다. 이 터미널을 켜 두세요.

- 상태 확인: <http://localhost:8000/api/health>
- API 설명/실행 화면: <http://localhost:8000/docs>

## 8. Frontend 실행

**새 터미널 창**을 열어서:

```bash
cd /Users/onmam008/daeho/hum/frontend
npm run dev
```

이 터미널도 켜 두세요. 서버를 끄려면 각 터미널에서 `Control + C`를 누릅니다.

## 9. 브라우저 접속

<http://localhost:3000>

마이크는 `localhost` 또는 HTTPS에서만 허용됩니다. 휴대폰에서 `localhost`를 입력하면 휴대폰 자신을 가리키므로 이 Mac에 접속되지 않습니다. 외부 HTTPS 테스트는 [배포 안내](docs/deployment.md)를 따릅니다. 모바일 크기의 UI는 브라우저 자동 테스트로 확인합니다.

### 이 컴퓨터에서 간편 실행

개발 중에는 아래 도우미로 서버를 백그라운드에서 실행할 수도 있습니다. 기본 포트가 사용 중이면 다음 빈 포트를 선택하여 접속 주소를 출력합니다.

```bash
cd /Users/onmam008/daeho/hum
python3 scripts/dev.py status
```

이미 서버가 실행 중이면 출력된 주소에 접속하세요. 서버가 없다면:

```bash
python3 scripts/dev.py start
```

종료:

```bash
python3 scripts/dev.py stop
```

로그는 `.run/backend.log`, `.run/frontend.log`에 있습니다. 수동 실행 방식과 도우미 방식 중 하나를 사용하세요.

## 10. 직접 테스트하기

1. `http://localhost:3000`에 접속합니다.
2. **새 노래 만들기**를 누릅니다.
3. **흥얼거리기** 또는 **노래 부르기**를 선택합니다.
4. 마이크 버튼을 누르고, 권한 요청에 **허용**을 누릅니다.
5. 약 10초 동안 `라~ 라라~ 라라라~`처럼 부릅니다. 조용한 곳에서 한 음씩 부르면 인식이 더 쉽습니다.
6. 정지 버튼을 누릅니다. 원본 녹음을 미리 들어볼 수 있습니다.
7. **분석하기**를 누릅니다. 첫 실행은 모델 로딩과 계산 준비로 더 오래 걸릴 수 있습니다.
8. 피아노롤에서 음표 가운데를 위아래로 움직여 음정을 바꿉니다. 양 끝을 움직이면 시작/끝 시간이 바뀝니다.
9. 음표 선택 후 아래의 음 높이·시작·길이 입력란으로도 수정할 수 있습니다. 키보드 위/아래 화살표도 지원합니다.
10. **멜로디 듣기**로 수정 결과를 확인합니다. 삼각파 기반의 간단한 신스 소리입니다.
11. 노래 모드에서는 가사를 직접 입력할 수 있습니다. 자동 인식은 미연결 안내를 표시합니다.
12. 프로젝트 이름을 입력합니다. 필요하면 **임시 저장**으로 편집 상태를 보관합니다.
13. **내 멜로디 확정 → 확정하기**를 누릅니다. 이후 음표 수정은 차단됩니다.
14. **프로젝트 저장**을 누릅니다.
15. 홈의 **내 프로젝트**에서 다시 열거나, 현재 URL을 새 탭에서 엽니다. 서버 재시작 후에도 데이터가 남습니다.

MIDI 다운로드 버튼은 **서버에 저장된 상태**를 내려받습니다. 수정 직후에는 임시 저장 또는 확정을 먼저 하세요. 원본 오디오는 편집하지 않습니다. 최대 녹음 길이는 2분, 파일 크기는 25MB입니다.

### 자동 테스트

Backend 테스트:

```bash
cd /Users/onmam008/daeho/hum/backend
.venv/bin/python -m pytest -q
```

실제 Basic Pitch 모델 테스트 및 가상 마이크용 10초 테스트 파일 생성:

```bash
.venv/bin/python -m scripts.smoke_analysis
```

`/tmp/hum-smoke/test-melody.wav`를 생성하고 실제 모델이 C4, D4, E4, G4를 인식하는지 확인합니다. 이 파일은 합성 테스트 음원이며 사용자의 목소리가 아닙니다.

앞서 설명한 방법으로 두 서버를 실행한 뒤:

```bash
cd /Users/onmam008/daeho/hum/frontend
npx playwright install chromium
npm run test:e2e
```

브라우저 테스트는 가상 마이크로 실제 MediaRecorder 녹음, 실제 Basic Pitch 분석, 음정 수정, 신스 오디오 신호, 확정, 저장, 새 탭 복원, 모바일 화면, 오류 메시지를 확인합니다. 테스트 프로젝트가 내 프로젝트 목록에 생깁니다. 실제 사람 목소리의 인식 품질은 위 직접 테스트로 별도 확인해야 합니다.

정적 검사와 배포용 빌드:

```bash
npm run typecheck
npm run build
```

현재 환경에서 Turbopack의 프로덕션 빌드 보조 프로세스가 포트 권한 오류를 내므로 `build`는 Next.js 공식 Webpack 옵션을 사용합니다. 개발 서버는 Turbopack으로 실행합니다.

## 11. Git repository 생성

**반드시 `hum` 안에서 진행하세요. 상위 `daeho`는 별도 사이트 저장소입니다.** 이 작업에서는 GitHub 원격 생성이나 push는 하지 않습니다.

```bash
cd /Users/onmam008/daeho/hum
git init -b main
git status
git add .
git status
git commit -m "Build HUM Phase 1 melody studio"
```

`git init`이 이미 되어 있으면 다시 할 필요가 없습니다. 커밋 작성자 설정을 요구하면 실제 본인의 정보를 입력하고 커밋을 다시 실행하세요:

```bash
git config user.name "본인 이름"
git config user.email "본인 GitHub 이메일"
```

Git에 포함되지 않아야 하는 파일을 확인할 수 있습니다:

```bash
git status --ignored --short
```

`.env`, `.env.local`, `uploads/`, `projects/`, 모든 WAV/MP3/WebM/M4A/OGG/MIDI, `.venv/`, `node_modules/`, `.next/`는 제외됩니다. `.env.example`에는 비밀값을 넣지 않습니다.

## 12. GitHub push

GitHub에서 로그인 후 **New repository**를 눌러 빈 `hum` 저장소를 만드세요. README나 라이선스를 자동 생성하지 않으면 첫 push가 간단합니다. 아래 `YOUR_GITHUB_ID`를 본인 계정으로 바꾸세요.

```bash
cd /Users/onmam008/daeho/hum
git remote add origin https://github.com/YOUR_GITHUB_ID/hum.git
git branch -M main
git push -u origin main
```

GitHub 인증은 브라우저 로그인, Git Credential Manager 또는 GitHub 토큰을 사용하세요. 토큰을 코드나 README에 입력하지 마세요. 이미 origin이 있으면 `git remote -v`로 먼저 확인하세요.

## 13. 자주 발생하는 오류

| 증상 | 해결 |
| --- | --- |
| `node`, `npm`을 찾지 못함 | Node.js 22 이상 설치 후 터미널을 다시 엽니다. |
| Python 패키지 설치 실패 | `python --version`과 가상환경 활성화를 확인하세요. Python 3.12 이상 대신 3.9~3.11 가상환경을 사용하세요. |
| `ModuleNotFoundError: app` | `hum/backend` 폴더에서 backend 명령을 실행하세요. |
| `Address already in use` | 이미 실행 중인 HUM 주소를 확인하거나 도우미를 사용하세요. 기존 다른 프로그램은 종료하지 않아도 됩니다. |
| 서버에 연결할 수 없음 | Backend와 Frontend가 모두 실행 중인지 확인하세요. Backend의 `/api/health`를 엽니다. |
| 백엔드 포트를 바꿈 | `frontend/.env.local`에 `BACKEND_URL=http://127.0.0.1:새포트`를 넣고 frontend를 재시작하세요. |
| 프론트엔드 포트를 바꿈 | 3000/3001 외에는 backend 실행 전에 `export HUM_ALLOWED_ORIGINS=http://localhost:새포트,http://127.0.0.1:새포트`를 실행하세요. 도우미는 자동 설정합니다. |
| 마이크 권한 거부 | 주소창 사이트 설정에서 마이크를 허용하고 페이지를 새로고침하세요. macOS 시스템 설정의 마이크 권한도 확인하세요. |
| 녹음이 너무 짧음 | 2초 이상 녹음하세요. 약 10초를 권장합니다. |
| 멜로디를 찾지 못함 | 무음 여부를 미리 듣기로 확인하고, 배경 음악 없이 또렷하게 한 음씩 다시 불러 주세요. |
| Basic Pitch 분석 실패 | Backend 로그와 패키지 설치 상태를 확인하세요. 원본은 남아 있으므로 내 프로젝트에서 분석을 다시 시도할 수 있습니다. |
| MIDI 생성 실패 | 원본이 유지됩니다. 다시 시도한 뒤 계속 실패하면 backend 로그를 확인하세요. |
| TensorFlow/TFLite 미설치 경고 | 이 앱은 ONNX를 명시적으로 사용합니다. 다른 런타임 경고만 있고 분석이 성공하면 추가 설치는 필요 없습니다. |
| 소리가 안 들림 | 시스템 음량과 브라우저 탭 음소거를 확인하고 멜로디 듣기를 다시 누르세요. |
| 다른 화면에서 수정된 프로젝트 | 다른 탭에서 저장한 내용과 충돌한 상태입니다. 새로고침하여 최신 상태를 다시 확인하세요. |
| 프로젝트가 안 보임 | 같은 backend 데이터 폴더를 사용 중인지 확인하세요. 시크릿 창에서도 서버의 저장 목록을 읽습니다. |
| 도우미의 상태 파일만 남음 | `python3 scripts/dev.py stop` 후 `start`를 실행하세요. |

## 데이터와 구조

```text
hum/
├── frontend/             # Next.js 앱, 녹음, 피아노롤, 재생
├── backend/
│   ├── app/
│   │   ├── main.py       # FastAPI API 및 의존성 연결
│   │   ├── models/       # 데이터 검증
│   │   └── services/     # 분석 / 프로젝트 / repository / storage / STT
│   ├── scripts/          # 실제 분석 테스트
│   ├── tests/
│   └── projects/         # 실행 시 생성, Git 제외
├── scripts/dev.py
└── docs/
```

프로젝트별 저장:

```text
backend/projects/<UUID>/
├── original_audio.webm   # 또는 WAV/M4A 등, 최초 업로드 바이트 보존
├── analysis.wav          # 분석용 별도 22.05kHz mono 변환본
├── original_notes.json   # 최초 성공 분석의 음표, 덮어쓰기 금지
├── edited_notes.json     # 현재 저장한 수정 음표
├── melody.mid            # 현재 저장한 수정 멜로디
└── project.json          # 상태, 가사, 원본/수정 음표, revision
```

`project.json`이 기준 데이터입니다. JSON은 임시 파일 작성 후 atomic replace로 저장하고, 프로젝트별 파일 잠금과 revision 검사로 동시 수정을 보호합니다. 원본 두 파일은 create-if-absent로만 생성합니다. 운영체제에서 파일을 직접 바꾸는 것까지 막는 보관 시스템은 아닙니다.

가사 필드는 `lyrics.original`과 `lyrics.edited`입니다. 사용자는 edited만 변경할 수 있습니다. STT 인터페이스는 준비되어 있지만 실제 공급자는 연결하지 않았습니다. Tempo는 비트 추정값이며, 비트가 충분하지 않으면 기본값 120 BPM을 표시합니다. 음표 시간은 초 단위이므로 이 기본값이 원본 리듬을 재배치하지 않습니다.

저장 위치를 변경하려면 backend 실행 전에 `export HUM_DATA_DIR=/원하는/절대경로`를 설정하세요. 기존 데이터는 자동 이동하지 않습니다. 백업은 backend를 정지한 뒤 `backend/projects` 전체를 별도 위치에 복사하세요.

## 이번 단계의 한계

- Basic Pitch의 전사 결과는 추정입니다. 숨소리, 비브라토, 배음, 소음에 따라 누락·중복 음표가 생길 수 있습니다. 원본과 비교하면서 직접 수정하세요.
- 사람 목소리의 정확도, iOS/Safari 실제 마이크, 다수 사용자·장시간 분석은 추가 검증이 필요합니다.
- 로그인 계정은 없습니다. 로컬은 개인용이며, 외부 테스트는 브라우저별 저장 공간을 분리합니다. 무료 서버의 데이터는 절전·재시작·재배포 시 사라집니다.
- AI 편곡, AI 보컬, 음원 출시, 결제 등 Phase 2 기능은 구현하지 않았습니다.

자세한 API·설계: [docs/architecture.md](docs/architecture.md). 검증 기록: [docs/verification.md](docs/verification.md).

기술 참고: [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation), [Spotify Basic Pitch](https://github.com/spotify/basic-pitch). 화면 사진: [Unsplash 스튜디오 사진](https://images.unsplash.com/photo-1598488035139-bdbb2231ce04), 라이선스 안내는 [docs/assets.md](docs/assets.md).
