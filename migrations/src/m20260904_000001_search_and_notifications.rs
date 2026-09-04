//! Full-text search indexes and the in-app notification feed.
//!
//! Search is native PostgreSQL, no external service (sovereignty). Two complementary mechanisms
//! back it:
//! - a generated `tsvector` column on `messages.body` using a French text-search configuration that
//!   folds accents (`unaccent`) and stems words, indexed with GIN, for word/phrase search;
//! - trigram GIN indexes (`pg_trgm`) on the accent-folded message body and file name, for partial
//!   substring and typo-tolerant matches.
//!
//! `ruchoir_unaccent` is an IMMUTABLE wrapper so `unaccent` can be used inside an index expression.
//! `to_tsvector(regconfig, text)` is itself immutable, which is what lets the generated column and
//! its GIN index exist.
//!
//! The `notifications` table is a per-user inbox (mentions, direct messages, thread replies) with an
//! unread state (`read_at IS NULL`). Rows cascade away with the source message or the recipient.

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();

        // Accent folding and trigram matching.
        db.execute_unprepared("CREATE EXTENSION IF NOT EXISTS unaccent;")
            .await?;
        db.execute_unprepared("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
            .await?;

        // Immutable wrapper: `unaccent(text)` is only STABLE, so it cannot appear in an index or
        // generated-column expression directly. Pinning the dictionary makes a safe immutable form.
        db.execute_unprepared(
            "CREATE OR REPLACE FUNCTION ruchoir_unaccent(text) RETURNS text \
             LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS \
             $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;",
        )
        .await?;

        // A French text-search configuration that folds accents before stemming. `CREATE TEXT SEARCH
        // CONFIGURATION` has no IF NOT EXISTS, so guard it for safe re-runs.
        db.execute_unprepared(
            "DO $$ BEGIN \
               IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'fr_unaccent') THEN \
                 CREATE TEXT SEARCH CONFIGURATION fr_unaccent ( COPY = french ); \
               END IF; \
             END $$;",
        )
        .await?;
        db.execute_unprepared(
            "ALTER TEXT SEARCH CONFIGURATION fr_unaccent \
             ALTER MAPPING FOR hword, hword_part, word WITH unaccent, french_stem;",
        )
        .await?;

        // Generated search vector on the message body + its GIN index.
        db.execute_unprepared(
            "ALTER TABLE messages ADD COLUMN IF NOT EXISTS search_vector tsvector \
             GENERATED ALWAYS AS (to_tsvector('fr_unaccent', body)) STORED;",
        )
        .await?;
        db.execute_unprepared(
            "CREATE INDEX IF NOT EXISTS messages_search_vector_gin \
             ON messages USING GIN (search_vector);",
        )
        .await?;
        // Trigram index on the accent-folded body for partial/fuzzy matches.
        db.execute_unprepared(
            "CREATE INDEX IF NOT EXISTS messages_body_trgm \
             ON messages USING GIN (ruchoir_unaccent(body) gin_trgm_ops);",
        )
        .await?;
        // Trigram index on the accent-folded file name.
        db.execute_unprepared(
            "CREATE INDEX IF NOT EXISTS files_name_trgm \
             ON files USING GIN (ruchoir_unaccent(name) gin_trgm_ops);",
        )
        .await?;

        // Per-user notification inbox.
        db.execute_unprepared(
            "CREATE TABLE IF NOT EXISTS notifications ( \
               id uuid PRIMARY KEY, \
               user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE, \
               kind text NOT NULL CHECK (kind IN ('mention', 'reply', 'dm')), \
               conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE, \
               message_id uuid NOT NULL REFERENCES messages (id) ON DELETE CASCADE, \
               actor_id uuid REFERENCES users (id) ON DELETE SET NULL, \
               created_at timestamptz NOT NULL DEFAULT now(), \
               read_at timestamptz \
             );",
        )
        .await?;
        db.execute_unprepared(
            "CREATE INDEX IF NOT EXISTS notifications_user_created \
             ON notifications (user_id, created_at DESC);",
        )
        .await?;
        db.execute_unprepared(
            "CREATE INDEX IF NOT EXISTS notifications_user_unread \
             ON notifications (user_id) WHERE read_at IS NULL;",
        )
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();

        db.execute_unprepared("DROP TABLE IF EXISTS notifications;")
            .await?;
        db.execute_unprepared("DROP INDEX IF EXISTS files_name_trgm;")
            .await?;
        db.execute_unprepared("DROP INDEX IF EXISTS messages_body_trgm;")
            .await?;
        db.execute_unprepared("DROP INDEX IF EXISTS messages_search_vector_gin;")
            .await?;
        db.execute_unprepared("ALTER TABLE messages DROP COLUMN IF EXISTS search_vector;")
            .await?;
        db.execute_unprepared("DROP TEXT SEARCH CONFIGURATION IF EXISTS fr_unaccent;")
            .await?;
        db.execute_unprepared("DROP FUNCTION IF EXISTS ruchoir_unaccent(text);")
            .await?;
        db.execute_unprepared("DROP EXTENSION IF EXISTS pg_trgm;")
            .await?;
        db.execute_unprepared("DROP EXTENSION IF EXISTS unaccent;")
            .await?;

        Ok(())
    }
}
