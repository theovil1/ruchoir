//! MIME sniffing and file-kind classification.
//!
//! The stored content type is always derived from the bytes (magic-number sniffing), never trusted
//! from the client, per the upload-hardening rules. The kind maps a MIME onto the small set the UI
//! understands (`image`, `file-text`, `file-spreadsheet`, `file`).

/// Detect a MIME type from the leading magic bytes, falling back to a generic binary type.
///
/// `infer` recognizes binary formats (images, PDF, office archives, audio/video). Plain text has no
/// signature, so text uploads fall back to `application/octet-stream` and are treated as generic
/// files; this is the safe default (never guess an executable/inline type from unrecognized bytes).
pub fn sniff_mime(bytes: &[u8]) -> String {
    infer::get(bytes)
        .map(|kind| kind.mime_type().to_owned())
        .unwrap_or_else(|| "application/octet-stream".to_owned())
}

/// Whether a MIME is an image the thumbnailer and inline preview handle.
pub fn is_image(mime: &str) -> bool {
    mime.starts_with("image/")
}

/// Whether a MIME is safe to serve `inline` for in-browser preview. Everything else is forced to a
/// download so uploaded content is never rendered/executed in an unexpected context.
pub fn is_inline_previewable(mime: &str) -> bool {
    mime.starts_with("image/") || mime == "application/pdf" || mime.starts_with("text/")
}

/// Map a MIME onto the UI's file-kind vocabulary (matches the `files.kind` CHECK constraint).
pub fn kind_for_mime(mime: &str) -> &'static str {
    if is_image(mime) {
        "image"
    } else if is_spreadsheet(mime) {
        "file-spreadsheet"
    } else if is_textual(mime) {
        "file-text"
    } else {
        "file"
    }
}

fn is_spreadsheet(mime: &str) -> bool {
    matches!(
        mime,
        "application/vnd.ms-excel"
            | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            | "application/vnd.oasis.opendocument.spreadsheet"
            | "text/csv"
    )
}

fn is_textual(mime: &str) -> bool {
    mime.starts_with("text/")
        || matches!(
            mime,
            "application/pdf"
                | "application/msword"
                | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                | "application/vnd.oasis.opendocument.text"
                | "application/rtf"
                | "application/json"
        )
}
