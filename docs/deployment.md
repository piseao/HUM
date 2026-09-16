# Phase 1 무료 HTTPS 테스트 배포

## 구성

- Frontend: Vercel Hobby, GitHub `piseao/HUM`, Root Directory `frontend`.
- Backend: Render Free, GitHub `piseao/HUM`, 루트 `render.yaml`의 Docker Web Service.
- Python 3.10 + FastAPI + Spotify Basic Pitch ONNX. 한 프로세스에서 분석을 순차 실행합니다.
- Frontend 브라우저가 환경변수의 HTTPS API 주소로 직접 요청합니다. Vercel 프록시를 통해 오디오나 긴 분석 요청을 전달하지 않습니다.
- CORS는 지정한 Vercel origin과 localhost만 허용합니다.
- Render 무료 플랜의 파일 저장소는 임시입니다. 과금 리소스와 영구 디스크는 생성하지 않습니다.

현재 준비 파일만으로 외부 서비스가 자동 생성되지는 않습니다. Vercel/Render 계정 로그인과 저장소 연결이 완료되어야 실제 HTTPS 주소가 발급됩니다.

## 무료 플랜에서 꼭 알아둘 점

Render Free는 15분 동안 요청이 없으면 절전 상태로 전환되며 다음 접근 때 다시 켜지는 데 시간이 걸립니다. 절전·재시작·재배포 때 서버의 녹음과 프로젝트 파일이 사라집니다. 이번 환경은 짧은 녹음의 기능 테스트용이며 작품 보관용이 아닙니다. 로컬 `backend/projects`는 이 배포에 업로드하지 않습니다.

비용 없이 사용하려면 Render 서비스의 `Free`, Vercel의 `Hobby`를 유지하고 유료 업그레이드나 유료 체험을 시작하지 마세요. 이미 결제 수단이 연결된 계정에서는 계정의 초과 사용량·지출 한도도 확인해야 합니다. Render 무료 한도를 넘었을 때 결제 수단이 있으면 일부 추가 사용량이 과금될 수 있습니다. 자동 유료 전환을 구성하지 않습니다.

Vercel Hobby는 개인·비상업적 테스트에 맞는 플랜입니다. 상용 운영 전에는 해당 시점의 플랜 조건을 다시 확인하세요.

공식 참고: [Render Free](https://render.com/docs/free), [Vercel Hobby](https://vercel.com/docs/plans/hobby).

## 1. Render 백엔드 생성

1. [Render](https://dashboard.render.com/)에 GitHub로 로그인합니다.
2. [HUM Blueprint 배포 시작](https://dashboard.render.com/select-repo?type=blueprint&repo=https%3A%2F%2Fgithub.com%2Fpiseao%2FHUM)을 엽니다. 또는 New → Blueprint에서 `piseao/HUM` 저장소를 연결합니다.
3. `render.yaml`을 읽도록 설정합니다. Web Service 이름은 `hum-phase1-api`, 플랜은 반드시 **Free**인지 확인합니다.
4. `HUM_ALLOWED_ORIGINS`에는 아직 Vercel 주소가 없으면 임시로 `http://localhost:3000`을 입력합니다. Vercel 배포 후 정확한 주소로 갱신합니다.
5. Deploy 후 생성된 실제 `https://...onrender.com` 주소를 확인합니다. 이 문서의 예시 주소를 그대로 사용하지 마세요.
6. 백엔드 URL 뒤에 `/api/health`를 붙여 열었을 때 `status: ok`인지 확인합니다.

설정값:

| 항목 | 값 |
| --- | --- |
| Runtime | Docker |
| Dockerfile | `./backend/Dockerfile` |
| Docker context | `./backend` |
| Region | Singapore |
| Plan | Free |
| Instances | 1 |
| Health check | `/api/health` |
| HUM_DATA_DIR | `/data/projects` |
| HUM_ISOLATE_CLIENTS | `true` |
| HUM_ALLOWED_ORIGINS | 실제 Vercel HTTPS origin, 여러 개면 쉼표 구분 |

자동 배포는 꺼져 있습니다. 이후 변경 반영은 Render의 Manual Deploy를 사용합니다. 한 인스턴스를 유지해야 JSON 파일 잠금과 분석 큐가 일관되게 동작합니다.

## 2. Vercel 프론트엔드 생성

1. [Vercel 새 프로젝트](https://vercel.com/new)에 GitHub로 로그인합니다.
2. `piseao/HUM`을 Import합니다. 비용 없는 개인 Hobby 계정을 선택합니다.
3. Root Directory를 **frontend**로 설정합니다. 프레임워크는 Next.js입니다.
4. 아래 환경변수를 Production에 추가합니다.
5. Deploy를 누릅니다. `frontend/vercel.json`의 `npm ci`와 `npm run build`가 사용됩니다.

| 환경변수 | 값 |
| --- | --- |
| NEXT_PUBLIC_BACKEND_URL | Render에서 발급된 실제 HTTPS 주소. `/api`를 붙이지 않습니다. |
| NEXT_PUBLIC_ISOLATE_CLIENTS | `true` |

`NEXT_PUBLIC_` 값은 브라우저에 공개됩니다. 여기에 API 키나 비밀번호를 넣으면 안 됩니다. 현재 필요한 값은 공개 백엔드 주소와 boolean뿐입니다.

Vercel 배포에서는 HTTPS 백엔드와 사용자 분리가 설정되지 않으면 빌드를 실패시킵니다. 따라서 실수로 localhost 백엔드를 참조하는 배포가 만들어지지 않습니다.

## 3. 실제 두 주소 연결

Vercel의 **Production** 주소가 `https://실제앱.vercel.app`이라면 Render Environment에서:

```text
HUM_ALLOWED_ORIGINS=https://실제앱.vercel.app
```

저장 후 Render 서비스를 재배포합니다. localhost 3000/3001은 코드에서 함께 허용합니다. Preview 배포나 별도 도메인도 테스트하려면 정확한 origin을 쉼표로 추가합니다. `*` 또는 모든 Vercel 도메인을 허용하는 와일드카드는 사용하지 않습니다.

Vercel에서 다른 사람도 접속할 수 있는 Production 배포 주소를 사용하세요. Deployment Protection이 켜져 있으면 해당 테스트 프로젝트의 공개 접근 설정을 확인해야 합니다. Preview URL을 공유하면 Vercel 로그인을 요구할 수 있습니다.

## 4. HTTPS 최종 확인

1. PC의 시크릿 창과 아이폰 Safari에서 Vercel Production HTTPS 주소를 엽니다.
2. 서버가 잠들어 있으면 첫 요청이 느릴 수 있습니다. 잠시 기다린 뒤 새로고침합니다.
3. 새 노래 만들기 → 흥얼거리기/노래 부르기 → 마이크 권한 허용 → 약 10초 녹음 → 정지.
4. 분석하기 → 음표 표시 → 음정 수정 → 멜로디 듣기 → 내 멜로디 확정 → 프로젝트 저장.
5. 원본 미리듣기와 MIDI 다운로드가 동작하는지 확인합니다.
6. 같은 브라우저에서 새로고침해 저장 상태를 확인합니다. 무료 서버가 재시작되기 전까지 저장 데이터가 유지됩니다.
7. 새 브라우저/기기에서는 다른 사람의 프로젝트가 나타나지 않는지 확인합니다.
8. 아이폰의 음성 메모 M4A 파일로 파일 업로드도 확인합니다. 인앱 브라우저 대신 Safari를 사용합니다.

검증된 로컬 가상 마이크 테스트와 실제 아이폰 물리 마이크 테스트는 다릅니다. 실제 발급된 HTTPS 주소에서 최종 확인을 마친 후에만 외부 배포 성공으로 기록합니다.

## 브라우저별 테스트 저장 공간

외부 테스트는 UUID를 브라우저 localStorage에 생성하고 `X-HUM-Client-ID` 헤더로 전달합니다. 서버는 그 값의 SHA-256별 디렉터리를 분리합니다. 다른 브라우저는 다른 저장 공간을 보며, 프로젝트 URL만으로 남의 오디오를 열 수 없습니다. 오디오와 MIDI도 동일한 헤더로 요청합니다. 제3자 쿠키를 사용하지 않으므로 Safari의 쿠키 차단에 의존하지 않습니다.

로그인 계정이 아니므로 브라우저 데이터를 지우면 이전 공간으로 접근할 수 없고, PC와 아이폰 간 자동 동기화도 없습니다. 이 식별자는 접근 키처럼 취급하여 공유하지 마세요. 개발자 도구에서 이 값을 직접 가져가는 사람을 막는 계정 인증은 Phase 1 범위에 없습니다.

## 분석 중 연결 유지

- `POST /api/audio/analyze?background=true`는 분석을 시작하고 202로 즉시 응답합니다.
- `GET /api/audio/analyze/{project_id}`로 완료 상태를 조회합니다.
- 기존 동기 `POST /api/audio/analyze`도 유지합니다.
- 동시 모델 추론은 1개, 진행·대기 요청 합계는 최대 3개입니다.
- 서버 재시작으로 분석이 중단되면 재시도 안내를 보여줍니다. 무료 서버 재시작으로 파일까지 사라졌다면 다시 업로드해야 합니다.

## 로컬 실행 보존

환경변수를 설정하지 않은 `npm run dev`는 기존 `/api` → `127.0.0.1:8000` 프록시를 사용합니다. 기본 backend는 기존 `backend/projects`를 그대로 읽습니다. 기존 로컬 프로젝트를 클라우드 디렉터리로 옮기거나 삭제하지 않습니다.

`frontend/.env.example`, `backend/.env.example`은 공개해도 되는 예시만 담고 있습니다. 실제 `.env` 및 서비스 인증 정보는 Git에 포함하지 않습니다. Docker 빌드도 app/scripts/tests의 Python 소스와 requirements만 허용하므로 녹음·환경변수 파일이 이미지에 들어가지 않습니다.

## 나중에 유료 전환할 때

명시적으로 전환하기로 결정한 뒤에만 Render 유료 서비스와 `/data` 영구 디스크를 연결합니다. 현재 저장 인터페이스와 `HUM_DATA_DIR`는 그대로 사용할 수 있습니다. 무료 서비스의 기존 파일은 자동으로 영구 디스크로 이전되지 않습니다. 전환 전에 보관할 데이터를 별도 백업해야 합니다.

Railway도 컨테이너와 volume에 적합하지만 지속적인 무료 테스트를 우선하여 현재는 Render Free로 준비했습니다. Phase 2A의 악기 기능은 포함하지 않습니다.
