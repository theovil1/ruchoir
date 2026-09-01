//! The session cookie.
//!
//! Uses the `__Host-` prefix, which browsers only accept when the cookie is `Secure`, has
//! `Path=/`, and carries no `Domain`. Combined with `HttpOnly` and `SameSite=Lax` this is the
//! hardened baseline: unreadable from JavaScript, not sent on cross-site POSTs, and host-locked.

use axum_extra::extract::cookie::{Cookie, SameSite};

/// Name of the session cookie. The `__Host-` prefix is a browser-enforced hardening marker.
pub const SESSION_COOKIE: &str = "__Host-ruchoir_session";

/// Build the session cookie carrying the opaque session id.
pub fn session_cookie(id: String, max_age_secs: i64) -> Cookie<'static> {
    Cookie::build((SESSION_COOKIE, id))
        .http_only(true)
        .secure(true)
        .same_site(SameSite::Lax)
        .path("/")
        .max_age(time::Duration::seconds(max_age_secs))
        .build()
}

/// Build an expired cookie that clears the session cookie on the client.
pub fn clear_session_cookie() -> Cookie<'static> {
    Cookie::build((SESSION_COOKIE, ""))
        .http_only(true)
        .secure(true)
        .same_site(SameSite::Lax)
        .path("/")
        .max_age(time::Duration::ZERO)
        .build()
}
