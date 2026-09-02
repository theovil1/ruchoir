//! Real-time transport and presence.
//!
//! This module carries server-to-client push (new messages, reactions, pins, read updates, typing,
//! presence) over a WebSocket, with a read-only SSE fallback. State-changing operations are *not*
//! here: they are REST handlers in [`crate::messaging`] that, after committing, call
//! [`hub::Hub::publish`] to fan the resulting event out. Delivery is brokered through a single
//! Valkey pub/sub channel so the design scales to several API instances without sticky sessions.
//!
//! - [`event`] - the versioned envelope and the fan-out wire type.
//! - [`hub`] - the local connection registry and the Valkey pub/sub bridge.
//! - [`presence`] - ephemeral live presence plus the persistent manual override.
//! - [`typing`] - throttled, ephemeral typing signals.
//! - [`ws`] / [`sse`] - the two transports.
//! - [`routes`] - the sub-router.

pub mod event;
pub mod hub;
pub mod presence;
pub mod routes;
pub mod sse;
pub mod typing;
pub mod ws;

pub use hub::Hub;
