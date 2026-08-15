-- Cloudflare D1 (SQLite) schema for trickcal-story-guide
--
-- Supabase(Postgres)에서 옮겨온 스키마. 달라진 점:
--   * identity_hash 제거      - 클라이언트 미사용, 217행 중 107행 null
--   * admin_settings 제거     - 비밀번호는 Worker secret으로, 동기화 개념은 폐기
--   * nodes/edges 는 TEXT     - SQLite에 JSON 타입 없음. 행 전체를 통째로 읽어가는
--                               구조라 JSON 쿼리가 필요 없어 문제되지 않음
--   * image 은 상대 경로      - 'nodes/2/1769354330180.webp' 형태로 저장하고
--                               서빙 주소는 클라이언트가 붙임 (호스트 이전이 자유로워짐)

CREATE TABLE IF NOT EXISTS master_stories (
    id             TEXT    PRIMARY KEY,
    label          TEXT    NOT NULL DEFAULT '',
    type           TEXT    NOT NULL DEFAULT 'main',
    image          TEXT    NOT NULL DEFAULT '',
    youtube_url    TEXT    NOT NULL DEFAULT '',
    full_video_url TEXT,
    protagonist    TEXT    NOT NULL DEFAULT '',
    part_label     TEXT    NOT NULL DEFAULT '',
    split_type     TEXT    NOT NULL DEFAULT 'none',
    importance     INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL,
    updated_at     TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS story_layouts (
    view_type  TEXT    NOT NULL,
    season     INTEGER NOT NULL,
    nodes      TEXT    NOT NULL DEFAULT '[]',
    edges      TEXT    NOT NULL DEFAULT '[]',
    updated_at TEXT    NOT NULL,
    PRIMARY KEY (view_type, season)
);

CREATE TABLE IF NOT EXISTS app_updates (
    id         INTEGER PRIMARY KEY,
    content    TEXT    NOT NULL DEFAULT '',
    updated_at TEXT    NOT NULL
);

-- 관리자 UI가 공개 사이트에 실리므로 비밀번호 무차별 대입이 가능해진다.
-- IP별 최근 실패 횟수를 세어 잠근다. Supabase RPC에는 없던 방어.
CREATE TABLE IF NOT EXISTS login_attempts (
    ip           TEXT    PRIMARY KEY,
    fail_count   INTEGER NOT NULL DEFAULT 0,
    window_start INTEGER NOT NULL,  -- epoch ms
    locked_until INTEGER NOT NULL DEFAULT 0
);
