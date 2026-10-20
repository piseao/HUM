# HUM 개발 인수인계

기준일: 2026-10-20. 코드 기준 `7af002d` (GitHub main에 푸시, Vercel·Render 배포 완료).

## 목표와 현재 범위

음악 전문 지식이 없어도 흥얼거리거나 부른 멜로디를 기록·수정하고 자기 노래로 발전시키는 도구입니다. 현재는 멜로디 초안 제작과 악기별 합성음 미리 듣기까지 구현했습니다. 자동 반주·AI 편곡·보컬·완성 음원 제작은 후속 단계이며 세부 사양은 미확정입니다.

## 구현 완료

- 녹음·파일 업로드, Basic Pitch 음표 추출과 실제 분석 진행률, 화면 복귀.
- 음정·시간·길이 수정, 실행 취소, 원본과 멜로디 재생, 수동 가사 입력.
- 멜로디 확정, 임시 저장·프로젝트 저장·복원, MIDI 다운로드.
- 기본 신스·피아노·벨·스트링 합성음 선택, 저장·복원, 확정 후 악기 변경, MIDI 악기 설정.
- 오프라인 전체 데이터 백업·복원 도구. 운영 영구 저장 전환은 하지 않았습니다.

## 검증과 배포

- 로컬: Backend 25개, Chromium 기능 검사, WebKit 모바일 검사, TypeScript와 프로덕션 빌드 통과 기록.
- 공개 사이트: 10월 16일 실행한 Chromium 7개 모두 통과(4.8분). 10월 20일 중단된 대화의 실행 세션에서 최종 출력을 회수했습니다. 첫 모바일 실제 분석 흐름은 4.2분, 후속 녹음·편집·악기·저장 흐름은 29.1초였습니다.
- 공개 주소: https://hum-phase1.vercel.app
- API: https://hum-phase1-api.onrender.com
- Render 서비스: `srv-dal34oijnfac73cacve0`, 배포: `dep-db8o5c3bc2fs73bj5sv0`.
- GitHub: https://github.com/piseao/HUM . 상위 `daeho`와 별도 Git 저장소이므로 Git 명령은 `hum` 안에서 실행합니다.
- Vercel은 push 후 자동 배포, Render는 수동 배포입니다. 양쪽 코드를 확인해야 하며 프론트 배포 성공만으로 작업 완료라 판단하지 않습니다.

## 다음 작업 순서

1. 실제 목소리와 실제 아이폰 녹음·재생·인식 품질 확인. [절차](device-verification.md). WebKit·합성 음원 결과로 대체하지 않습니다.
2. 핵심 기능의 다음 범위 확정: 반주·편곡 단계에서 먼저 제공할 악기 트랙, 코드 입력/추천, 리듬과 내보내기 범위를 정합니다. 이는 구현 제안이며 확정된 사양이 아닙니다.
3. 합의한 작은 단위부터 구현하고 원본 음표·음성 보존과 기존 확정 규칙을 회귀 검증합니다.

영구 저장은 별도 선택 과제입니다. 무료 유지/외부 저장소 또는 유료 디스크 여부가 결정되지 않았으므로 플랜을 변경하지 않습니다. Git의 코드·문서는 유지되지만 무료 서버의 작업 데이터는 재시작·재배포 시 사라질 수 있습니다. 브라우저 식별자는 로그인 계정이 아니며 기기 간 동기화도 없습니다.

## 재개 시 참고

- [설계/API](architecture.md), [검증 기록](verification.md), [배포](deployment.md), [저장소 이전 준비](persistent-storage.md).
- `frontend/AGENTS.md`를 읽고 Next.js 변경 전 설치 패키지의 해당 문서를 확인합니다.
- `.run/`은 인증·임시 검증 파일이 포함된 Git 제외 영역입니다. 문서나 커밋에 인증값을 복사하지 않습니다.
- 브라우저 로그인과 CLI 인증은 별도입니다. Render CLI 인증이 만료되면 `render login` 후 Authorize CLI가 필요합니다.
- `/tmp/hum-smoke/test-melody.wav`는 사라질 수 있습니다. 공개 브라우저 테스트 전에 `backend/.venv/bin/python -m scripts.smoke_analysis`를 backend 폴더에서 실행해 준비합니다.
- 공개 테스트는 frontend 폴더에서 `HUM_TEST_URL=https://hum-phase1.vercel.app HUM_TEST_ANALYSIS_TIMEOUT_MS=600000 npm run test:e2e`. 무료 서버를 고려해 분석 완료까지 기다리며 불필요하게 재배포하지 않습니다.
