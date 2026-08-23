# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Korean-language story-order guide for the game **트릭컬 (Trickcal)**. Renders story episodes as a pannable node graph (React Flow) so players can follow a recommended viewing order.

The site is a static Next.js export on GitHub Pages. Everything dynamic — data, images, admin auth — lives behind a single Cloudflare Worker.

```
GitHub Pages (앱 셸)  ──►  Worker  ──┬─►  D1  노드 데이터
                                     └─►  R2  이미지
```

## Commands

```bash
npm run dev      # 앱 (localhost:3000)
npm run build    # 정적 export -> ./out
npm run lint    # tsc --noEmit (next lint 는 Next 16 에서 제거됨)

# Worker (worker/ 안에서. wrangler 는 worker 의 devDependency)
node node_modules/wrangler/bin/wrangler.js dev --local --port 8788
node node_modules/wrangler/bin/wrangler.js deploy
node node_modules/wrangler/bin/wrangler.js d1 execute trickcal --local --file=../data/schema.sql
node node_modules/wrangler/bin/wrangler.js d1 execute trickcal --remote -y --command "SELECT ..."

# 검증
node scripts/verify-d1.mjs [--remote]                 # D1 내용을 data/backup 과 대조
node scripts/smoke-worker.mjs [BASE_URL] [PASSWORD]   # Worker 엔드포인트 전수 점검
node scripts/test-undo.mjs                            # src/lib/undo.mjs
node scripts/test-curation.mjs                        # src/lib/curation.mjs
```

There is no test framework; the scripts above are the checks. `scripts/` 는 `.gitignore` 에 걸려 있어 리포에 없다 — 이 컴퓨터에만 있다.

**Windows 주의**: Node 20 은 `.cmd` 직접 spawn 을 막는다(EINVAL). 스크립트에서 wrangler 를 부를 때는 `npx`/`npx.cmd` 가 아니라 `node worker/node_modules/wrangler/bin/wrangler.js` 를 쓴다. 또 `--command` 에 SQL 을 넘길 때 `shell: true` 를 주면 공백 단위로 쪼개지므로 쓰지 않는다.

## Deployment

`.github/workflows/deploy.yml` 이 `main` 푸시마다 빌드해서 GitHub Pages 로 배포한다. 일상 작업은 `develop`, 배포는 `main` 머지.

- 사이트: https://ember5521.github.io/trickcal-story-guide-ember/
- `next.config.js` 가 `repoName = 'trickcal-story-guide-ember'` 로 `basePath`/`assetPrefix` 를 고정한다. 리포명이 바뀌면 여기도 바꿔야 한다.
- Worker 는 GitHub 배포와 무관하게 `wrangler deploy` 로 따로 올린다.

## Worker API

`worker/src/index.ts` 하나에 전부 들어 있다. 바인딩은 `DB`(D1), `IMAGES`(R2), secret 은 `ADMIN_PASSWORD`.

```
공개    GET  /api/layout?view=&season=   레이아웃 + 참조 스토리를 서버에서 조인해 반환
        GET  /api/updates
        GET  /img/<key>                  R2 이미지
        POST /api/login                  비밀번호 -> 세션 토큰

관리자  POST /api/layout  /api/story  /api/image  /api/update-log
        GET  /api/stories  /api/images
```

`/api/layout` 이 조인까지 하는 것이 핵심이다. 예전에는 클라이언트가 레이아웃을 받고 `story_id` 를 모아 두 번째 요청을 보냈다.

### 요금이 발생하지 않는 이유 (건드리면 깨지는 전제)

이 프로젝트는 한 번 Supabase cached egress 무료 한도를 초과해 멈춘 적이 있다. 원인은 앞단 Cloudflare 워커가 캐시를 전혀 하지 않는 통과 프록시여서, 호스트명만 가린 채 모든 요청이 Supabase CDN 에 도달한 것이었다.

현재 구조가 그 재발을 막는 방식:

- **R2 버킷은 비공개.** 이미지에 닿는 경로가 Worker 뿐이다.
- **Workers 무료 플랜은 한도 초과 시 과금이 아니라 요청 거부.** 따라서 Worker 가 먼저 끊기고 R2 는 무료 한도에 닿지 못한다.
- **R2 는 egress 요금 항목 자체가 없다.**

그러므로 다음 두 가지를 하면 안전장치가 사라진다:
1. Workers 를 유료 플랜으로 올리는 것
2. R2 버킷을 public 으로 만들거나 `r2.dev`/커스텀 도메인을 붙이는 것

이미지 응답에 `Cache-Control: immutable` 을 붙이고 `caches.default` 를 쓰는 것도 같은 이유다. 키에 타임스탬프가 들어 있어 내용이 바뀌면 키도 바뀌므로 immutable 이 안전하다.

### 보안

관리자 UI 가 공개 번들에 실리므로 숨김은 방어가 아니다. 실제 방어선:

- 비밀번호는 Worker secret. 상수 시간 비교
- 로그인 실패 IP 당 15분에 10회 -> 15분 잠금 (`login_attempts` 테이블)
- 세션 토큰은 HMAC-SHA256, 8시간 만료. **비밀번호로 서명하므로 비밀번호를 바꾸면 기존 세션이 전부 무효화된다**
- CORS 는 `ALLOWED_ORIGINS` 로 제한. `*` 로 열면 남의 사이트가 이 Worker 를 통해 이미지를 끌어다 쓰면서 무료 요청 한도를 소모한다
- 업로드는 5MB 이하 + webp/png/jpeg 만

## 데이터 모델

D1 (SQLite). 스키마는 `data/schema.sql`, 원본 백업은 `data/backup/*.json`.

- **`master_stories`** — 에피소드 자체. `label`, `type`, `image`, `youtube_url`, `full_video_url`, `protagonist`, `part_label`, `split_type`, `importance`, `content`. 모든 뷰가 공유한다.
- **`story_layouts`** — `(view_type, season)` 당 한 행. `nodes`/`edges` 는 JSON 문자열(TEXT). 레이아웃 노드는 `id`, `story_id`, `x/y/w/h`, 모바일 전용 좌표 `m_x`/`m_y`, `splitType` 만 담는다.
- **`app_updates`** — 앱 내 알림 벨에 뜨는 변경 로그. 한 행(`id = 1`).
- **`login_attempts`** — IP 별 로그인 실패 카운터.

`view_type` 은 `recommended | release | elflix`, `season` 은 1~3. (`chrono` 뷰와 season 101 은 UI 에서 선택 불가능한 죽은 데이터여서 이관 때 버렸다.)

`image` 는 **상대 키**(`nodes/2/1769354330180.webp`)로 저장한다. 절대 URL 을 넣지 않으므로 서빙 호스트를 바꿔도 데이터를 건드릴 필요가 없다. 화면에 쓸 때 `imageUrl()` 로 감싼다.

삭제 엔드포인트는 없다. 노드를 지워도 `master_stories` 행은 남는다.

### 큐레이션 노드

`type = 'annotation'` 인 노드. 지도 위에 뜨는 안내 메모다. 두 가지가 보통 노드와 다르다.

**본문은 `master_stories.content` 에 있다.** `label` 은 마스터 라이브러리에서 고르기 위한 짧은 이름이고 본문이 아니다. 레이아웃 노드의 `content` 필드는 이관 전 데이터를 위한 폴백일 뿐이며 정본이 아니다. 본문을 master 에 두는 이유는 같은 문구가 `(view_type, season)` 9벌로 갈라져 따로 놀던 것을 막기 위해서다. 뷰가 달라도 본문이 같으면 한 master 행을 공유한다.

**붙는 자리는 엣지로 정한다.** 좌표 근접이 아니다. 모바일은 자동 배치라 좌표가 재계산되므로 근접성이 남지 않는다. 앞/뒤는 엣지 **방향**이 아니라 스토리 노드의 **어느 코너 핸들**에 붙였는지로 정한다. 화살표 방향은 화면에서 잘 안 보이지만 위치는 보인다.

```
스토리 노드 상단 좌측 (topLeft,  호박)   보기 전에 읽을 것
스토리 노드 상단 우측 (topRight, 하늘)   본 뒤에 읽을 것
```

판정은 `src/lib/curation.mjs` 의 `resolveAnchor` 한 곳에 있다. 앵커가 없는 큐레이션은 모바일에 뜨지 않고, PC 관리자 화면에서 붉은 테두리로 표시된다.

`displayEdges` 는 모든 엣지의 핸들을 최단거리로 재배정하는데 **큐레이션 엣지는 예외**다. 재배정에 맡기면 코너가 바뀌어 앞/뒤 의미가 멋대로 뒤집힌다.

큐레이션 노드 박스는 96×96 으로 고정한다 (원 자체가 `w-24 h-24`). 예전에 300×200 으로 저장된 것들이 있어 핸들이 원 바깥 허공에 떴다. 로드할 때 저장값을 무시하고 96 으로 덮는다.

모바일에는 엣지 UI 가 없다. 모바일 라이브러리에서 큐레이션을 불러올 수는 있지만 **앵커는 PC 에서 지정해야** 한다.

## 클라이언트

`src/lib/api.ts` 가 Worker 와 말하는 유일한 지점이다. 읽기/쓰기/이미지 URL/세션 토큰(sessionStorage)이 전부 여기 모여 있다.

`StoryCanvas.tsx` (PC, ~2600줄) 와 `MobileCanvas.tsx` (~1500줄) 는 같은 앱의 거의 독립적인 두 구현이다. `src/app/page.tsx` 가 user-agent 와 화면폭으로 고르고, 수동 토글은 `localStorage.view_mode` 에 남는다. **공통 동작을 고칠 때는 대개 두 곳 다 고쳐야 한다.** 모바일은 `m_x`/`m_y` 를, PC 는 `x`/`y` 를 읽는다.

PC 줌은 스케일이 걸려 있다. `SCALE_OUTER = 0.55` 이므로 React Flow 내부 줌 0.55 가 사용자에게 100% 로 보인다. 원시 줌 값 대신 `toDisplayZoom` / `fromDisplayZoom` 을 쓴다.

사용자 상태는 전부 `localStorage` 이고 서버에 저장되지 않는다:
`view_mode` · `user_settings` · `watched_history_s{season}` · `last_watched_story` · `user_story_memo` · `intro_completed` · `last_read_update_at`
