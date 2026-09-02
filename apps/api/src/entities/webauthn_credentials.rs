//! The `webauthn_credentials` table: registered passkeys.
//!
//! The full `webauthn-rs` `Passkey` (which carries the public key and signature counter) is stored
//! serialized in `public_key`; `credential_id` holds the raw credential id for lookups. The counter
//! lives inside the serialized blob and is updated on each authentication.

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "webauthn_credentials")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub user_id: Uuid,
    pub credential_id: Vec<u8>,
    pub public_key: Vec<u8>,
    pub sign_count: i64,
    pub transports: Option<String>,
    pub label: Option<String>,
    pub created_at: TimeDateTimeWithTimeZone,
    pub last_used_at: Option<TimeDateTimeWithTimeZone>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
