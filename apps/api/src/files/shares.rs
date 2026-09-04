//! File-share endpoints: list, create and delete shares.
//!
//! A share grants a `view`/`edit` permission to exactly one target: a user or a channel. Listing a
//! file's shares needs read access; creating or deleting one needs edit rights (owner or space
//! owner/admin). Targets are validated against the file's space so a share never points outside it.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use sea_orm::ActiveValue::Set;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::auth::extract::AuthSession;
use crate::entities::{conversations, file_shares, space_members};
use crate::state::AppState;

use super::authz;
use super::dto::{rfc3339, CreateShareRequest, ShareDto};
use super::error::FileError;

/// `GET /api/v1/files/{file_id}/shares`: list a file's shares.
#[utoipa::path(
    get,
    path = "/api/v1/files/{file_id}/shares",
    tag = "files",
    params(("file_id" = Uuid, Path, description = "File id")),
    responses(
        (status = 200, description = "The file's shares", body = [ShareDto]),
        (status = 403, description = "No access to the file")
    )
)]
pub async fn list_shares(
    State(state): State<AppState>,
    session: AuthSession,
    Path(file_id): Path<Uuid>,
) -> Result<Json<Vec<ShareDto>>, FileError> {
    authz::ensure_readable(&state.db, file_id, session.user_id).await?;

    let shares = file_shares::Entity::find()
        .filter(file_shares::Column::FileId.eq(file_id))
        .order_by_asc(file_shares::Column::CreatedAt)
        .all(&state.db)
        .await?
        .into_iter()
        .map(to_dto)
        .collect();
    Ok(Json(shares))
}

/// `POST /api/v1/files/{file_id}/shares`: share a file with a user or a channel.
#[utoipa::path(
    post,
    path = "/api/v1/files/{file_id}/shares",
    tag = "files",
    params(("file_id" = Uuid, Path, description = "File id")),
    request_body = CreateShareRequest,
    responses(
        (status = 201, description = "Share created", body = ShareDto),
        (status = 400, description = "Invalid target or permission"),
        (status = 403, description = "Not allowed to share this file")
    )
)]
pub async fn create_share(
    State(state): State<AppState>,
    session: AuthSession,
    Path(file_id): Path<Uuid>,
    Json(body): Json<CreateShareRequest>,
) -> Result<(StatusCode, Json<ShareDto>), FileError> {
    let access = authz::ensure_editable(&state.db, file_id, session.user_id).await?;
    let space_id = access.file.space_id;

    if body.permission != "view" && body.permission != "edit" {
        return Err(FileError::BadRequest("permission must be view or edit"));
    }
    // Exactly one target: user XOR channel (mirrors the table's CHECK constraint).
    match (body.target_user_id, body.target_channel_id) {
        (Some(user_id), None) => {
            if space_members::Entity::find_by_id((space_id, user_id))
                .one(&state.db)
                .await?
                .is_none()
            {
                return Err(FileError::BadRequest(
                    "target user is not a member of the space",
                ));
            }
        }
        (None, Some(channel_id)) => {
            let conversation = conversations::Entity::find_by_id(channel_id)
                .one(&state.db)
                .await?
                .ok_or(FileError::BadRequest("target channel not found"))?;
            if conversation.space_id != space_id || conversation.kind != "channel" {
                return Err(FileError::BadRequest("invalid target channel"));
            }
        }
        _ => {
            return Err(FileError::BadRequest(
                "exactly one of target_user_id or target_channel_id is required",
            ));
        }
    }

    let share_id = Uuid::new_v4();
    let now = OffsetDateTime::now_utc();
    let model = file_shares::ActiveModel {
        id: Set(share_id),
        file_id: Set(file_id),
        shared_by: Set(Some(session.user_id)),
        target_user_id: Set(body.target_user_id),
        target_channel_id: Set(body.target_channel_id),
        permission: Set(body.permission),
        created_at: Set(now),
        expires_at: Set(None),
    }
    .insert(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(to_dto(model))))
}

/// `DELETE /api/v1/files/{file_id}/shares/{share_id}`: remove a share.
#[utoipa::path(
    delete,
    path = "/api/v1/files/{file_id}/shares/{share_id}",
    tag = "files",
    params(
        ("file_id" = Uuid, Path, description = "File id"),
        ("share_id" = Uuid, Path, description = "Share id")
    ),
    responses(
        (status = 204, description = "Share removed"),
        (status = 403, description = "Not allowed to modify this file"),
        (status = 404, description = "Share not found")
    )
)]
pub async fn delete_share(
    State(state): State<AppState>,
    session: AuthSession,
    Path((file_id, share_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, FileError> {
    authz::ensure_editable(&state.db, file_id, session.user_id).await?;

    let share = file_shares::Entity::find_by_id(share_id)
        .one(&state.db)
        .await?
        .ok_or(FileError::NotFound)?;
    if share.file_id != file_id {
        return Err(FileError::NotFound);
    }
    file_shares::Entity::delete_by_id(share_id)
        .exec(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

/// Map a share row to its DTO.
fn to_dto(model: file_shares::Model) -> ShareDto {
    ShareDto {
        id: model.id,
        file_id: model.file_id,
        shared_by: model.shared_by,
        target_user_id: model.target_user_id,
        target_channel_id: model.target_channel_id,
        permission: model.permission,
        created_at: rfc3339(model.created_at),
        expires_at: model.expires_at.map(rfc3339),
    }
}
