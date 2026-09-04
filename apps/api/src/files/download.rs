//! Byte endpoints: download, inline preview, and thumbnail.
//!
//! All bytes are proxied back through the API (the browser never contacts the object store), served
//! with the stored content type, `Content-Disposition` (attachment for download, inline only for
//! safe preview types), and the global `X-Content-Type-Options: nosniff`, so uploaded content is
//! never rendered or executed in an unexpected context.

use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, StatusCode};
use axum::response::Response;
use sea_orm::{DatabaseConnection, EntityTrait};
use uuid::Uuid;

use crate::auth::extract::AuthSession;
use crate::entities::{file_versions, files};
use crate::state::AppState;

use super::authz;
use super::error::FileError;
use super::mime;
use super::thumbnail::THUMBNAIL_MIME;

/// `GET /api/v1/files/{file_id}/download`: stream the current version's bytes as an attachment.
#[utoipa::path(
    get,
    path = "/api/v1/files/{file_id}/download",
    tag = "files",
    params(("file_id" = Uuid, Path, description = "File id")),
    responses(
        (status = 200, description = "The file bytes"),
        (status = 403, description = "No access to the file"),
        (status = 404, description = "File or its bytes not found"),
        (status = 503, description = "Object storage not configured")
    )
)]
pub async fn download_file(
    State(state): State<AppState>,
    session: AuthSession,
    Path(file_id): Path<Uuid>,
) -> Result<Response, FileError> {
    serve_object(&state, session.user_id, file_id, false).await
}

/// `GET /api/v1/files/{file_id}/preview`: serve the bytes inline for previewable types.
#[utoipa::path(
    get,
    path = "/api/v1/files/{file_id}/preview",
    tag = "files",
    params(("file_id" = Uuid, Path, description = "File id")),
    responses(
        (status = 200, description = "The file bytes (inline when previewable)"),
        (status = 403, description = "No access to the file"),
        (status = 404, description = "File or its bytes not found"),
        (status = 503, description = "Object storage not configured")
    )
)]
pub async fn preview_file(
    State(state): State<AppState>,
    session: AuthSession,
    Path(file_id): Path<Uuid>,
) -> Result<Response, FileError> {
    serve_object(&state, session.user_id, file_id, true).await
}

/// `GET /api/v1/files/{file_id}/thumbnail`: the current version's thumbnail (images only).
#[utoipa::path(
    get,
    path = "/api/v1/files/{file_id}/thumbnail",
    tag = "files",
    params(("file_id" = Uuid, Path, description = "File id")),
    responses(
        (status = 200, description = "The thumbnail image"),
        (status = 403, description = "No access to the file"),
        (status = 404, description = "No thumbnail for this file"),
        (status = 503, description = "Object storage not configured")
    )
)]
pub async fn thumbnail_file(
    State(state): State<AppState>,
    session: AuthSession,
    Path(file_id): Path<Uuid>,
) -> Result<Response, FileError> {
    let access = authz::ensure_readable(&state.db, file_id, session.user_id).await?;
    let storage = state
        .storage
        .as_ref()
        .ok_or(FileError::StorageUnavailable)?;
    let version = current_version(&state.db, &access.file).await?;
    let key = version.thumbnail_key.ok_or(FileError::NotFound)?;
    let bytes = storage.get(&key).await?;

    build_response(bytes, THUMBNAIL_MIME, "inline", "thumbnail.jpg", true)
}

/// Shared body of download/preview: authorize, load the current version, fetch and return the bytes.
async fn serve_object(
    state: &AppState,
    user_id: Uuid,
    file_id: Uuid,
    inline: bool,
) -> Result<Response, FileError> {
    let access = authz::ensure_readable(&state.db, file_id, user_id).await?;
    let file = access.file;
    if file.kind == "folder" {
        return Err(FileError::BadRequest("cannot download a folder"));
    }
    let storage = state
        .storage
        .as_ref()
        .ok_or(FileError::StorageUnavailable)?;

    let version = current_version(&state.db, &file).await?;
    let key = version.storage_key.ok_or(FileError::NotFound)?;
    let bytes = storage.get(&key).await?;

    // Preview serves safe types inline; everything else (and every download) is an attachment.
    let disposition = if inline && mime::is_inline_previewable(&version.mime_type) {
        "inline"
    } else {
        "attachment"
    };
    build_response(bytes, &version.mime_type, disposition, &file.name, false)
}

/// The current version of a file, or a `404` when it was never uploaded.
async fn current_version(
    db: &DatabaseConnection,
    file: &files::Model,
) -> Result<file_versions::Model, FileError> {
    let version_id = file.current_version_id.ok_or(FileError::NotFound)?;
    file_versions::Entity::find_by_id(version_id)
        .one(db)
        .await?
        .ok_or(FileError::NotFound)
}

/// Assemble a byte response with content type, disposition and an ASCII-safe filename.
fn build_response(
    bytes: Vec<u8>,
    content_type: &str,
    disposition: &str,
    filename: &str,
    cacheable: bool,
) -> Result<Response, FileError> {
    let length = bytes.len();
    let disposition_value = format!("{disposition}; filename=\"{}\"", ascii_filename(filename));

    let mut builder = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_DISPOSITION, disposition_value)
        .header(header::CONTENT_LENGTH, length.to_string());
    if cacheable {
        // Thumbnails are immutable per version key; let the browser cache them privately.
        builder = builder.header(header::CACHE_CONTROL, "private, max-age=86400");
    }
    builder.body(Body::from(bytes)).map_err(|error| {
        tracing::error!(%error, "failed to build file response");
        FileError::Internal
    })
}

/// Reduce a filename to a header-safe ASCII form (quotes and backslashes dropped, non-ASCII replaced).
fn ascii_filename(name: &str) -> String {
    let mapped: String = name
        .chars()
        .map(|c| {
            if c == '"' || c == '\\' || c.is_control() {
                '_'
            } else if c.is_ascii() {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = mapped.trim();
    if trimmed.is_empty() {
        "download".to_owned()
    } else {
        trimmed.chars().take(255).collect()
    }
}
