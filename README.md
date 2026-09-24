# 오늘 브리핑

아침에 휴대폰이나 맥북으로 열면 그날 챙길 것을 한 화면에 모아 보여 주는 개인 대시보드입니다.

- **오늘 브리핑**: 일정, 마감, 중요한 메일, 기억할 알림을 한 문장으로 요약하고, ‘브리핑 듣기’로 읽어 줍니다. 하루 일정은 가로 띠 하나로 보여 줍니다.
- **잊지 말 것**: 기한이 지난 과제, 오늘 마감, 메모, 중요한 알림과 메일을 급한 순서로 모은 체크리스트입니다.
- **Google 계정 여러 개**: Gmail, 캘린더, 클래스룸을 계정 3개 이상에서 가져와 한 목록으로 합칩니다. 계정마다 별명과 색이 붙습니다.
- **중요 메일 요약**: 맥에서 Claude Code(사용자 구독)로 최근 메일을 판단해, 챙겨야 할 메일만 한 줄 요약·할 일·마감과 함께 강조합니다.
- **과제**: 클래스룸 과제(연결된 경우)와 메일에서 찾은 마감을 한곳에 모읍니다. 학교 계정이 외부 앱을 막아도 클래스룸 알림 메일을 전달받으면 채워집니다.
- **맥 캘린더·메모**: 맥 캘린더 앱 일정(공휴일 포함)을 오늘 일정에 합치고, 메모 앱의 고정 메모·남은 체크리스트·최근 메모를 보여 줍니다.
- **AI 사용량**: Claude Code와 Codex의 남은 한도(5시간, 주간), 사용한 토큰, API 정가로 환산한 원화 금액을 보여 줍니다.
- **기억할 알림**: 맥 알림 센터와 휴대폰 자동화 앱이 보낸 알림 가운데 규칙에 맞는 것만 기록합니다. 인증번호와 광고는 저장하지 않습니다.
- 휴대폰과 PC 화면을 모두 지원하고, 홈 화면에 추가하면 앱처럼 열립니다. 5분마다, 그리고 탭으로 돌아올 때 자동으로 새로고침됩니다.

## 구성

```
휴대폰 ─(단축어/자동화 앱)─┐
                          ├─▶  대시보드 (Next.js, Vercel)  ◀─ Google API (Gmail·캘린더·클래스룸)
맥 에이전트 ──────────────┘         │
 (Claude Code·Codex 기록,           └─ 저장소: Upstash Redis (로컬에서는 .data/store.json)
  남은 한도, 맥 알림)
```

- `app/`, `components/`, `lib/`: 대시보드
- `agent/`: 맥에서 도는 수집 에이전트 (Node.js, 외부 패키지 없음)

## 로컬에서 실행

Node.js 22.5 이상이 필요합니다.

```bash
npm install
cp .env.example .env.local   # 값 채우기 (아래 참고)
npm run dev                  # http://localhost:3300
```

`GOOGLE_CLIENT_ID`를 비워 두면 로그인 없이 ‘로컬 개발 모드’로 열립니다. `http://localhost:3300/?demo=1` 은 예시 데이터로 화면 전체를 보여 줍니다.

| 환경 변수 | 설명 |
| --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth 클라이언트 |
| `ALLOWED_EMAILS` | 로그인할 수 있는 Google 계정 (쉼표로 구분). 나머지 계정은 로그인 뒤 설정에서 연결 |
| `SESSION_SECRET` | 세션 서명과 토큰 암호화 키. `openssl rand -base64 48` |
| `INGEST_TOKEN` | 에이전트·휴대폰이 데이터를 보낼 때 쓰는 토큰. `openssl rand -base64 32` |
| `APP_URL` | 배포 주소. Google 리디렉션 URI를 만들 때 씀 |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis. 비우면 `.data/store.json` 파일에 저장 |
| `USD_KRW_FALLBACK` | 환율 API가 모두 실패할 때 쓸 원/달러 값 |

## Google 설정 (계정 3개 연결)

1. [Google Cloud 콘솔](https://console.cloud.google.com/)에서 프로젝트를 만들고 **Gmail API**, **Google Calendar API**, **Google Classroom API**를 사용 설정합니다.
2. **OAuth 동의 화면**을 ‘외부’로 만들고, 연결할 Google 계정 3개를 모두 **테스트 사용자**로 추가합니다.
3. **사용자 인증 정보 → OAuth 클라이언트 ID → 웹 애플리케이션**을 만들고, 승인된 리디렉션 URI에 아래를 넣습니다.
   - `http://localhost:3300/api/auth/google/callback`
   - `https://배포-주소/api/auth/google/callback`
4. 클라이언트 ID와 보안 비밀을 환경 변수에 넣고, `ALLOWED_EMAILS`에 주로 쓰는 계정을 적습니다.
5. 그 계정으로 로그인한 뒤 **설정 → Google 계정 → 계정 추가**에서 나머지 계정을 연결합니다. 학교 계정은 ‘클래스룸’만 골라도 됩니다.

주의할 점:
- 동의 화면이 **테스트 모드면 7일마다 다시 로그인**해야 합니다. 계속 쓰려면 브랜딩에 홈페이지(`https://배포-주소`)와 개인정보처리방침(`https://배포-주소/privacy`)을 넣고, 대상 화면에서 ‘앱 게시’를 누르세요. ‘확인되지 않은 앱’ 경고가 나오지만 본인 계정은 계속 진행할 수 있습니다. 테스트 모드에서 받은 권한은 여전히 7일 뒤 만료되므로, 게시한 뒤 대시보드 맨 위의 안내에 따라 계정마다 한 번씩 다시 연결하세요.
- 대시보드 로그인은 90일 동안 유지되고, 쓰는 동안에는 하루에 한 번 자동으로 연장됩니다.
- 학교나 회사 Workspace 계정은 관리자가 외부 앱을 막아 두었을 수 있습니다. 그때는 설정 화면에 오류가 표시됩니다.

## 맥 에이전트

에이전트는 2분마다 아래를 모아 대시보드로 보냅니다. 로그인 토큰은 맥 밖으로 나가지 않고, 계산된 숫자와 알림 내용만 보냅니다.

- `~/.claude/projects/**/*.jsonl`: Claude Code 응답별 토큰 사용량 (모델, 캐시 읽기·쓰기 포함)
- `~/.codex/sessions/**/rollout-*.jsonl`: Codex 응답별 토큰 사용량과 요금제 한도(`rate_limits`)
- Claude 남은 한도: Claude Code CLI 로그인 정보로 계정 사용량 API를 조회합니다(`/usage` 화면과 같은 값, 5분에 한 번)
- 맥 알림 센터 데이터베이스: 새로 온 알림
- 맥 캘린더 앱: 오늘부터 3일치 일정 (반복 일정·구독 캘린더·공휴일 포함)
- 맥 메모 앱: 고정한 메모, 체크하지 않은 체크리스트 항목, 최근 7일 안에 고친 메모 (잠긴 메모 제외)
- 중요 메일 요약: 대시보드가 모아 준 최근 메일을 `claude -p`로 판단·요약 (도구·MCP 없이 실행, 한도 90% 이상이면 미룸, `AGENT_MAIL_SUMMARY=0`으로 끔)

```bash
cp agent/.env.example agent/.env   # DASHBOARD_URL, INGEST_TOKEN 입력
npm run agent:dry                  # 보내지 않고 무엇이 수집되는지 보기
npm run agent                      # 한 번 보내기
npm run agent -- --check           # 대시보드 주소·토큰·저장소(Redis인지) 확인
bash agent/install-launchd.sh      # 로그인할 때 켜지고 2분마다 실행
bash agent/uninstall-launchd.sh    # 자동 실행 끄기
```

- 기록은 `~/.schedulemg/agent.log`에, 파일별 집계 캐시는 `~/.schedulemg/`에 남습니다. 처음 한 번은 전체 기록을 읽고, 그 뒤로는 바뀐 파일만 읽습니다.
- **Claude 한도**: 데스크톱 앱만 쓰면 CLI 로그인 토큰이 갱신되지 않아서, 토큰이 만료되면 에이전트가 `claude`를 없는 모델 이름으로 한 번 실행합니다. CLI가 스스로 토큰을 갱신하고 모델 호출은 바로 실패하므로 사용량은 들지 않습니다(30분에 한 번까지, `AGENT_REFRESH_CLAUDE_LOGIN=0`으로 끔). 에이전트가 토큰을 직접 고치지는 않습니다.
- **맥 알림**: 백그라운드(launchd)에서 알림 데이터베이스를 읽으려면 node에 전체 디스크 접근 권한이 필요합니다. 시스템 설정 → 개인정보 보호 및 보안 → 전체 디스크 접근 권한 → `+` → `Cmd+Shift+G`로 `/opt/homebrew/bin/node` 입력 → 열기 → 켜기. 권한이 없으면 대시보드의 ‘기억할 알림’ 칸에 이유가 표시됩니다. Homebrew로 node를 업그레이드하면 다시 켜야 할 수 있습니다.
- iPhone 미러링을 켜 두면 iPhone 알림도 맥 알림 센터를 거쳐 함께 수집됩니다.

## 휴대폰 알림

휴대폰 자동화 앱이 `POST /api/ingest/notifications`로 알림을 보내면 규칙에 맞는 것만 기록합니다. 헤더에 `Authorization: Bearer <INGEST_TOKEN>`을 넣고 JSON으로 보냅니다.

```json
{ "source": "iphone", "app": "카카오톡", "title": "팀플 단톡방", "body": "내일 발표 자료 오늘 밤까지", "important": false }
```

- **iPhone**: 단축어 앱 → 자동화 → ‘메시지’ 또는 ‘이메일’ 트리거 → ‘URL 콘텐츠 가져오기’(POST, JSON). 공유 시트용 단축어에서 `important: true`로 보내면 무엇이든 바로 ‘기억할 것’에 넣을 수 있습니다.
- **Android**: MacroDroid 같은 앱에서 ‘알림 수신’ 트리거 → ‘HTTP 요청’(POST, JSON).
- 같은 주소로 GET을 보내면 연결을 시험할 수 있습니다. 자세한 순서는 대시보드 **설정 → 휴대폰 알림 연결**에 있습니다.
- 어떤 알림을 중요하게 볼지는 **설정 → 알림 규칙**에서 키워드와 앱으로 바꿀 수 있습니다.

## 배포 (Vercel)

```bash
vercel link --yes --project schedulemg
# Upstash for Redis 무료 요금제, 도쿄 리전, 한도 초과 시 자동 유료 전환 끔 (처음 한 번은 브라우저에서 약관 동의 필요)
vercel integration add upstash/upstash-kv --plan free -m primaryRegion=hnd1 -m autoUpgrade=false -e production --no-env-pull
vercel env add GOOGLE_CLIENT_ID production  # 나머지 환경 변수도 같은 방법으로 추가
vercel deploy --prod
```

- 서버 함수는 `vercel.json`에서 도쿄(`hnd1`)로 지정했습니다. 한국에서 가깝고 Upstash와 같은 리전이라 빠릅니다.
- GitHub 저장소를 연결해 두면 `main`에 푸시할 때마다 자동으로 배포됩니다.
- 배포한 뒤 Google 리디렉션 URI에 배포 주소를 추가하고, `agent/.env`의 `DASHBOARD_URL`을 배포 주소로 바꿉니다. 휴대폰에서 열어 ‘홈 화면에 추가’를 하면 앱처럼 쓸 수 있습니다.
- 비용: Vercel Hobby와 Upstash 무료 요금제(월 50만 명령, 256MB) 안에서 돌아가도록 만들었습니다. 이 대시보드는 하루 2천 명령 안팎을 씁니다.

## 금액 계산

- 금액은 **API 정가로 환산한 추정치**입니다. 구독 요금제로 쓴 사용량도 ‘API였다면 얼마’로 계산합니다.
- 모델별 단가는 `lib/usage/pricing.ts`에 있습니다 (2026년 9월 Anthropic·OpenAI 공식 가격). Claude는 캐시 쓰기 5분(입력×1.25)과 1시간(입력×2), 캐시 읽기, 빠른 모드(×2), 웹 검색을 반영합니다. GPT-5.6 Sol은 2026-11-21까지 프로모션 가격으로 계산합니다.
- 환율은 유럽중앙은행 기준 환율(frankfurter)을 6시간마다 받아 쓰고, 실패하면 `USD_KRW_FALLBACK`을 씁니다.
- 남은 한도는 퍼센트로 표시됩니다. Anthropic과 OpenAI는 구독 요금제의 토큰 한도를 숫자로 공개하지 않습니다.

## 개인정보와 보안

- Google refresh token은 `SESSION_SECRET`에서 만든 키로 **AES-256-GCM 암호화**해 저장합니다. Google 권한은 모두 읽기 전용입니다.
- 인증번호가 담긴 알림과 `(광고)` 알림은 저장하지 않습니다. 일반 알림은 3일, 기억할 알림은 최대 45일 뒤 지웁니다.
- 대시보드는 `ALLOWED_EMAILS`에 있거나 이미 연결한 계정만 로그인할 수 있습니다. 데이터 수집 주소는 `INGEST_TOKEN`이 있어야만 받습니다.
