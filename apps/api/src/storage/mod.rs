//! Object storage: the single boundary between the API and the S3-compatible backend.
//!
//! Every file byte flows through [`S3Store`], so swapping the backend is a configuration change
//! (point the endpoint at another S3-compatible server), never a code change. Garage is the default,
//! sovereign backend. The store is built once at startup and shared through `AppState`; when no
//! credentials are configured it is simply absent and the byte endpoints report 503.

mod s3;

pub use s3::{S3Store, StorageError};
