//! Server-side image thumbnailing.
//!
//! Image uploads are decoded to read their intrinsic dimensions and to produce a downscaled JPEG
//! thumbnail (aspect ratio preserved) stored as a second object. Decoding is limited to the web
//! formats the crate is built with (JPEG, PNG, GIF, WebP); anything else fails and the upload keeps
//! its bytes without a thumbnail.

use std::io::Cursor;

use image::{GenericImageView, ImageFormat};

/// The MIME type generated thumbnails are stored and served with.
pub const THUMBNAIL_MIME: &str = "image/jpeg";

/// The result of inspecting an uploaded image.
pub struct ImageInfo {
    /// Intrinsic width of the original image, in pixels.
    pub width: u32,
    /// Intrinsic height of the original image, in pixels.
    pub height: u32,
    /// Encoded JPEG bytes of the thumbnail.
    pub thumbnail: Vec<u8>,
}

/// Decode `bytes` as an image and produce its dimensions plus a thumbnail whose longest edge is at
/// most `max_px`. Returns an error for unsupported or corrupt image data.
pub fn make_thumbnail(bytes: &[u8], max_px: u32) -> Result<ImageInfo, image::ImageError> {
    let image = image::load_from_memory(bytes)?;
    let (width, height) = image.dimensions();

    // Downscale only: `thumbnail` bounds the longest edge to `max_px` but would UPSCALE a smaller
    // image, so skip it when the source already fits (a thumbnail must never exceed the original).
    // `thumbnail` preserves the aspect ratio and is fast. Flatten to RGB so the JPEG encoder never
    // sees an alpha channel.
    let scaled = if width > max_px || height > max_px {
        image.thumbnail(max_px, max_px)
    } else {
        image
    };
    let mut encoded = Vec::new();
    image::DynamicImage::ImageRgb8(scaled.to_rgb8())
        .write_to(&mut Cursor::new(&mut encoded), ImageFormat::Jpeg)?;

    Ok(ImageInfo {
        width,
        height,
        thumbnail: encoded,
    })
}
