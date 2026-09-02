//! The `space_members` table: a user's membership of a space, with a role.
//!
//! Composite primary key (`space_id`, `user_id`): a user belongs to a space at most once.

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "space_members")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub space_id: Uuid,
    #[sea_orm(primary_key, auto_increment = false)]
    pub user_id: Uuid,
    /// One of `owner`, `admin`, `member`, `guest` (enforced by a CHECK constraint).
    pub role: String,
    pub invited_by: Option<Uuid>,
    pub joined_at: TimeDateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
