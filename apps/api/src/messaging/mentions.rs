//! Mention extraction from a message body.
//!
//! Mentions are parsed server-side at send time and resolved to stable user ids in
//! `message_mentions`, which later drives notifications. Parsing is intentionally split from
//! resolution: [`extract_mention_tokens`] is a pure, unit-tested scan of the raw markdown, and
//! [`resolve_mentions`] maps the resulting tokens onto real accounts against the database.
//!
//! Grammar (MVP): `@here` and `@channel` are the two broadcast tokens; anything else of the form
//! `@handle` (letters, digits, `.`, `_`, `-`) is a candidate user mention, matched case-insensitively
//! against member display names. An `@` that is not at a word boundary (e.g. inside `user@host`) is
//! ignored, so email addresses never register as mentions. Ambiguous or unmatched handles are left
//! as plain text and simply not stored. Richer, unambiguous mention tokens (id-backed) can layer on
//! later without changing the storage shape.

use std::collections::BTreeSet;

use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter};
use uuid::Uuid;

use super::error::ApiError;
use crate::entities::users;

/// The distinct mention tokens found in a body.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct MentionTokens {
    /// Lowercased candidate user handles, de-duplicated.
    pub users: BTreeSet<String>,
    /// Whether `@here` appeared.
    pub here: bool,
    /// Whether `@channel` appeared.
    pub channel: bool,
}

impl MentionTokens {
    /// Whether nothing mentionable was found.
    pub fn is_empty(&self) -> bool {
        self.users.is_empty() && !self.here && !self.channel
    }
}

/// Scan a raw message body for mention tokens. Pure and allocation-light; no I/O.
pub fn extract_mention_tokens(body: &str) -> MentionTokens {
    let mut tokens = MentionTokens::default();
    let bytes = body.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] != b'@' {
            i += 1;
            continue;
        }
        // A mention starts at the beginning of the body or after a non-word character, so that
        // `user@host` (an email) never triggers one.
        let at_boundary = i == 0 || !is_handle_char(bytes[i - 1]);
        if !at_boundary {
            i += 1;
            continue;
        }
        let start = i + 1;
        let mut end = start;
        while end < bytes.len() && is_handle_char(bytes[end]) {
            end += 1;
        }
        if end == start {
            i += 1;
            continue;
        }
        // Safe: handle bytes are ASCII (`is_handle_char`), so the slice is valid UTF-8. Trailing
        // `.`/`-`/`_` are punctuation (e.g. the period ending a sentence), not part of the handle;
        // interior ones are kept so `first.last` handles survive.
        let handle = body[start..end].trim_end_matches(['.', '-', '_']);
        if handle.is_empty() {
            i = end;
            continue;
        }
        match handle.to_ascii_lowercase().as_str() {
            "here" => tokens.here = true,
            "channel" | "everyone" | "all" => tokens.channel = true,
            other => {
                tokens.users.insert(other.to_string());
            }
        }
        i = end;
    }
    tokens
}

/// One resolved mention destined for `message_mentions`.
pub struct ResolvedMention {
    pub user_id: Uuid,
    /// One of `user`, `here`, `channel`.
    pub mention_type: &'static str,
}

/// Resolve tokens to concrete `message_mentions` rows against `audience` (the conversation's
/// members). User handles are matched case-insensitively on `display_name` within the audience;
/// ambiguous handles (more than one match) are dropped. `@here`/`@channel` expand to one row per
/// audience member (excluding the author), so downstream notification logic is a plain lookup.
pub async fn resolve_mentions(
    db: &DatabaseConnection,
    author_id: Uuid,
    audience: &[Uuid],
    tokens: &MentionTokens,
) -> Result<Vec<ResolvedMention>, ApiError> {
    if tokens.is_empty() || audience.is_empty() {
        return Ok(Vec::new());
    }

    let members = users::Entity::find()
        .filter(users::Column::Id.is_in(audience.iter().copied()))
        .all(db)
        .await?;

    let mut resolved: Vec<ResolvedMention> = Vec::new();
    let mut seen: BTreeSet<Uuid> = BTreeSet::new();

    // Broadcast mentions: one row per other member, typed so notifications can distinguish them.
    if tokens.here || tokens.channel {
        let mention_type = if tokens.channel { "channel" } else { "here" };
        for member in &members {
            if member.id != author_id && seen.insert(member.id) {
                resolved.push(ResolvedMention {
                    user_id: member.id,
                    mention_type,
                });
            }
        }
    }

    // User handles: unambiguous, case-insensitive display-name matches within the audience.
    for handle in &tokens.users {
        let matches: Vec<&users::Model> = members
            .iter()
            .filter(|m| m.display_name.to_ascii_lowercase() == *handle)
            .collect();
        if let [only] = matches.as_slice() {
            if seen.insert(only.id) {
                resolved.push(ResolvedMention {
                    user_id: only.id,
                    mention_type: "user",
                });
            } else if let Some(existing) = resolved.iter_mut().find(|r| r.user_id == only.id) {
                // A direct @user mention is more specific than a broadcast one.
                existing.mention_type = "user";
            }
        }
    }

    Ok(resolved)
}

/// Whether a byte may appear inside a mention handle (ASCII word characters plus `.`, `_`, `-`).
fn is_handle_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'.' || b == b'_' || b == b'-'
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_user_mention() {
        let t = extract_mention_tokens("hey @alice can you look?");
        assert!(t.users.contains("alice"));
        assert!(!t.here && !t.channel);
    }

    #[test]
    fn broadcast_tokens() {
        let t = extract_mention_tokens("@here and @channel please");
        assert!(t.here && t.channel);
        assert!(t.users.is_empty());
    }

    #[test]
    fn email_is_not_a_mention() {
        let t = extract_mention_tokens("write to bob@example.org today");
        assert!(t.is_empty());
    }

    #[test]
    fn case_insensitive_and_deduped() {
        let t = extract_mention_tokens("@Alice @alice @ALICE");
        assert_eq!(t.users.len(), 1);
        assert!(t.users.contains("alice"));
    }

    #[test]
    fn mention_at_start_and_punctuation_boundary() {
        let t = extract_mention_tokens("@carol, ping @dave.");
        assert!(t.users.contains("carol"));
        assert!(t.users.contains("dave"));
    }

    #[test]
    fn bare_at_is_ignored() {
        let t = extract_mention_tokens("email me @ 5pm @");
        assert!(t.is_empty());
    }
}
