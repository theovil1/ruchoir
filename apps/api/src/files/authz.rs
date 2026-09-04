//! File authorization: the membership choke point for the files surface.
//!
//! Read access to a file follows space membership: the Files screen is space-wide by design (like
//! public-channel history being open to space members), so any member of a file's space may list,
//! preview and download its files. Mutations (upload a new version, rename, move, delete, share)
//! require the file's owner or a space owner/admin. Finer per-channel file ACLs (restricting a
//! private-channel attachment to that channel's members) are a later hardening step.

use sea_orm::{DatabaseConnection, EntityTrait};
use uuid::Uuid;

use super::error::FileError;
use crate::entities::{files, space_members};

/// A resolved, authorized handle to a file the caller may access.
pub struct FileAccess {
    /// The file row (guaranteed to be in a space the caller belongs to, and not soft-deleted).
    pub file: files::Model,
    /// Whether the caller may mutate the file (owner, or a space owner/admin).
    pub can_edit: bool,
}

/// Ensure the caller belongs to a space, or fail with `403`.
pub async fn ensure_space_member(
    db: &DatabaseConnection,
    space_id: Uuid,
    user_id: Uuid,
) -> Result<(), FileError> {
    space_members::Entity::find_by_id((space_id, user_id))
        .one(db)
        .await?
        .map(|_| ())
        .ok_or(FileError::Forbidden)
}

/// Whether the caller is an `owner`/`admin` of a space.
pub async fn is_space_admin(
    db: &DatabaseConnection,
    space_id: Uuid,
    user_id: Uuid,
) -> Result<bool, FileError> {
    Ok(space_members::Entity::find_by_id((space_id, user_id))
        .one(db)
        .await?
        .map(|m| m.role == "owner" || m.role == "admin")
        .unwrap_or(false))
}

/// Resolve and authorize a file for reading, or fail with `403` (never revealing whether the file
/// exists to a non-member). A soft-deleted file is a `404` for a member who addresses it by id.
pub async fn ensure_readable(
    db: &DatabaseConnection,
    file_id: Uuid,
    user_id: Uuid,
) -> Result<FileAccess, FileError> {
    let file = files::Entity::find_by_id(file_id)
        .one(db)
        .await?
        .ok_or(FileError::Forbidden)?;
    ensure_space_member(db, file.space_id, user_id).await?;
    if file.deleted_at.is_some() {
        return Err(FileError::NotFound);
    }
    let can_edit =
        file.owner_id == Some(user_id) || is_space_admin(db, file.space_id, user_id).await?;
    Ok(FileAccess { file, can_edit })
}

/// Resolve and authorize a file for mutation (owner or space owner/admin), or fail with `403`.
pub async fn ensure_editable(
    db: &DatabaseConnection,
    file_id: Uuid,
    user_id: Uuid,
) -> Result<FileAccess, FileError> {
    let access = ensure_readable(db, file_id, user_id).await?;
    if !access.can_edit {
        return Err(FileError::Forbidden);
    }
    Ok(access)
}
