//! Development seed data.
//!
//! `ruchoir-api seed` populates a realistic dev workspace so later messaging, files and UI work has
//! representative data to build against. It is **dev-only**: the command refuses to run
//! unless `RUCHOIR_ENV=dev` (or `--force` is passed), so it can never touch a production database.
//!
//! It is idempotent at the workspace level: the six accounts are upserted by email (so they line up
//! with the Nextcloud import fixture), and if the demo space already exists the seed
//! stops early rather than duplicating rows. Running it twice leaves the same final state.
//!
//! Timestamps are left unset on insert so PostgreSQL fills its `now()` defaults; only natural keys
//! and non-default columns are written.

use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, DatabaseTransaction, DbErr, EntityTrait,
    QueryFilter, Set, TransactionTrait,
};
use uuid::Uuid;

use crate::auth;
use crate::config::Config;
use crate::entities::{
    channel_members, channel_pins, channels, conversations, dm_conversations, dm_participants,
    file_shares, file_versions, files, message_attachments, message_link_previews,
    message_mentions, message_reactions, messages, read_cursors, space_members, spaces,
    user_preferences, user_saved_messages, users,
};

/// Shared password for every seeded account (matches the Nextcloud import fixture).
const SEED_PASSWORD: &str = "Passw0rd!seed";
/// Natural key of the demo space; its presence marks the database as already seeded.
const SPACE_SLUG: &str = "atelier";

/// Entry point for the `seed` subcommand.
pub async fn run(
    db: &DatabaseConnection,
    config: &Config,
) -> Result<(), Box<dyn std::error::Error>> {
    guard_dev_environment()?;

    let txn = db.begin().await?;

    // Accounts first (upserted by email so re-runs and existing dev accounts both work).
    let admin = upsert_user(&txn, config, "admin@atelier.test", "Camille Roussel").await?;
    let alice = upsert_user(&txn, config, "alice@atelier.test", "Alice Fournier").await?;
    let bob = upsert_user(&txn, config, "bob@atelier.test", "Yanis Berthier").await?;
    let carol = upsert_user(&txn, config, "carol@atelier.test", "Carol Nguyen").await?;
    let david = upsert_user(&txn, config, "david@atelier.test", "David Morel").await?;
    let emma = upsert_user(&txn, config, "emma@atelier.test", "Emma Leroy").await?;
    let all_members = [admin, alice, bob, carol, david, emma];

    // If the demo space already exists, the workspace is seeded: stop before duplicating rows.
    if spaces::Entity::find()
        .filter(spaces::Column::Slug.eq(SPACE_SLUG))
        .one(&txn)
        .await?
        .is_some()
    {
        txn.commit().await?;
        tracing::info!("seed: demo space already present; accounts ensured, nothing else to do");
        return Ok(());
    }

    // Space and membership (admin owns it, everyone else is a member).
    let space_id = Uuid::new_v4();
    spaces::ActiveModel {
        id: Set(space_id),
        name: Set("Atelier Nantes".to_owned()),
        slug: Set(SPACE_SLUG.to_owned()),
        created_by: Set(Some(admin)),
        ..Default::default()
    }
    .insert(&txn)
    .await?;

    for (i, member) in all_members.iter().enumerate() {
        space_members::ActiveModel {
            space_id: Set(space_id),
            user_id: Set(*member),
            role: Set(if i == 0 { "owner" } else { "member" }.to_owned()),
            invited_by: Set(if i == 0 { None } else { Some(admin) }),
            ..Default::default()
        }
        .insert(&txn)
        .await?;
    }

    // Flesh out the owner's profile so the profile card has representative data.
    users::ActiveModel {
        id: Set(admin),
        title: Set(Some("Gerante de l'atelier".to_owned())),
        pronouns: Set(Some("elle".to_owned())),
        timezone: Set(Some("Europe/Paris".to_owned())),
        bio: Set(Some("Responsable de l'atelier et des annonces.".to_owned())),
        ..Default::default()
    }
    .update(&txn)
    .await?;

    // Representative client preferences for the owner (theme/font/text size + JSON blobs).
    user_preferences::ActiveModel {
        user_id: Set(admin),
        theme: Set(Some("system".to_owned())),
        font: Set(Some("plex-sans".to_owned())),
        text_size: Set(Some("comfortable".to_owned())),
        emoji_pack: Set(Some("fluent".to_owned())),
        emoji_animated: Set(Some(true)),
        notifications: Set(Some(
            "{\"enabled\":true,\"sound\":true,\"quietHours\":false}".to_owned(),
        )),
        ui_state: Set(Some("{\"welcome\":{\"dismissed\":false}}".to_owned())),
        ..Default::default()
    }
    .insert(&txn)
    .await?;

    // The import assistant: a bot account (no password), mirroring the mocked "Assistant d'import".
    let import_bot = create_bot(&txn, "import-bot@atelier.test", "Assistant d'import").await?;
    space_members::ActiveModel {
        space_id: Set(space_id),
        user_id: Set(import_bot),
        role: Set("member".to_owned()),
        invited_by: Set(Some(admin)),
        ..Default::default()
    }
    .insert(&txn)
    .await?;

    // Channels, mirroring the UI mock fixtures (general, private comptabilite, ...).
    let general = create_channel(
        &txn,
        space_id,
        admin,
        "general",
        "public",
        Some("Annonces et vie de l'atelier"),
        None,
    )
    .await?;
    let compta = create_channel(
        &txn,
        space_id,
        admin,
        "comptabilite-2026",
        "private",
        Some("Suivi des ecritures et rapprochements"),
        Some("slack"),
    )
    .await?;
    let bois = create_channel(
        &txn,
        space_id,
        admin,
        "atelier-bois",
        "public",
        Some("Coordination de l'atelier bois"),
        None,
    )
    .await?;
    let chantier = create_channel(
        &txn,
        space_id,
        admin,
        "chantier-reze",
        "public",
        Some("Chantier de Reze, suivi et logistique"),
        Some("mattermost"),
    )
    .await?;
    let veille = create_channel(
        &txn,
        space_id,
        admin,
        "veille-marche",
        "public",
        Some("Appels d'offres et veille concurrentielle"),
        None,
    )
    .await?;
    let archives = create_channel(
        &txn,
        space_id,
        admin,
        "archives-2025",
        "archived",
        Some("Canal archive, lecture seule"),
        None,
    )
    .await?;
    let _ = (bois, chantier, veille, archives);

    // Explicit membership for the private channel (public channels are open to space members).
    add_channel_member(&txn, compta, admin, "owner").await?;
    add_channel_member(&txn, compta, alice, "member").await?;
    add_channel_member(&txn, compta, bob, "member").await?;
    add_channel_member(&txn, general, admin, "owner").await?;
    add_channel_member(&txn, general, alice, "member").await?;

    // A file with one version, shared into the general channel.
    let file_id = Uuid::new_v4();
    files::ActiveModel {
        id: Set(file_id),
        space_id: Set(space_id),
        owner_id: Set(Some(admin)),
        name: Set("Bilan_2026_v4.ods".to_owned()),
        kind: Set("file-spreadsheet".to_owned()),
        size_bytes: Set(253_952),
        ..Default::default()
    }
    .insert(&txn)
    .await?;
    let version_id = Uuid::new_v4();
    file_versions::ActiveModel {
        id: Set(version_id),
        file_id: Set(file_id),
        version_no: Set(1),
        size_bytes: Set(253_952),
        mime_type: Set("application/vnd.oasis.opendocument.spreadsheet".to_owned()),
        created_by: Set(Some(admin)),
        ..Default::default()
    }
    .insert(&txn)
    .await?;
    // Point the file at its current version (app-maintained pointer, no FK).
    files::ActiveModel {
        id: Set(file_id),
        current_version_id: Set(Some(version_id)),
        ..Default::default()
    }
    .update(&txn)
    .await?;
    file_shares::ActiveModel {
        id: Set(Uuid::new_v4()),
        file_id: Set(file_id),
        shared_by: Set(Some(admin)),
        target_channel_id: Set(Some(general)),
        permission: Set("view".to_owned()),
        ..Default::default()
    }
    .insert(&txn)
    .await?;

    // A system "welcome" notice plus a first message in general.
    insert_system_message(&txn, general, "channel_created").await?;
    let welcome = insert_message(
        &txn,
        general,
        admin,
        "Bienvenue dans l'atelier ! Les annonces passent ici.",
    )
    .await?;

    // A small thread in the private channel: a root with an attachment/reactions, then a reply.
    let root = insert_message(
        &txn,
        compta,
        admin,
        "Le bilan est pret. Je le depose dans les fichiers du canal, relecture avant vendredi.",
    )
    .await?;
    message_attachments::ActiveModel {
        message_id: Set(root),
        file_id: Set(file_id),
        file_version_id: Set(Some(version_id)),
        position: Set(0),
        ..Default::default()
    }
    .insert(&txn)
    .await?;
    add_reaction(&txn, root, alice, "\u{2705}").await?; // white check mark
    add_reaction(&txn, root, bob, "\u{1F44D}").await?; // thumbs up
    let reply = insert_reply(
        &txn,
        compta,
        bob,
        "Recu. Deux ecritures de mars a rapprocher, retour dans la journee.",
        root,
    )
    .await?;
    let _ = reply;
    // Bump the denormalized reply counter on the root.
    messages::ActiveModel {
        id: Set(root),
        reply_count: Set(1),
        ..Default::default()
    }
    .update(&txn)
    .await?;

    // A message with a resolved mention and a stored link preview.
    let mention_msg = insert_message(
        &txn,
        compta,
        alice,
        "Merci @bob, je regarde la veille ici: https://boamp.fr",
    )
    .await?;
    message_mentions::ActiveModel {
        message_id: Set(mention_msg),
        mentioned_user_id: Set(bob),
        mention_type: Set("user".to_owned()),
    }
    .insert(&txn)
    .await?;
    message_link_previews::ActiveModel {
        id: Set(Uuid::new_v4()),
        message_id: Set(mention_msg),
        url: Set("https://boamp.fr".to_owned()),
        domain: Set("boamp.fr".to_owned()),
        title: Set(Some("BOAMP - Appels d'offres".to_owned())),
        description: Set(Some(
            "Bulletin officiel des annonces des marches publics.".to_owned(),
        )),
        ..Default::default()
    }
    .insert(&txn)
    .await?;

    // Pin the root message and let admin bookmark it.
    channel_pins::ActiveModel {
        channel_id: Set(compta),
        message_id: Set(root),
        pinned_by: Set(Some(admin)),
        ..Default::default()
    }
    .insert(&txn)
    .await?;
    user_saved_messages::ActiveModel {
        user_id: Set(admin),
        message_id: Set(root),
        ..Default::default()
    }
    .insert(&txn)
    .await?;

    // A direct message between admin and alice.
    let dm_id = Uuid::new_v4();
    conversations::ActiveModel {
        id: Set(dm_id),
        space_id: Set(space_id),
        kind: Set("direct".to_owned()),
        ..Default::default()
    }
    .insert(&txn)
    .await?;
    dm_conversations::ActiveModel {
        id: Set(dm_id),
        space_id: Set(space_id),
        is_group: Set(false),
        created_by: Set(Some(admin)),
        ..Default::default()
    }
    .insert(&txn)
    .await?;
    for user in [admin, alice] {
        dm_participants::ActiveModel {
            dm_id: Set(dm_id),
            user_id: Set(user),
            ..Default::default()
        }
        .insert(&txn)
        .await?;
    }
    insert_message(
        &txn,
        dm_id,
        alice,
        "Salut Camille, tu as deux minutes pour le point compta ?",
    )
    .await?;

    // A direct message from the import assistant (the bot), mirroring the mocked bot DM.
    let bot_dm = Uuid::new_v4();
    conversations::ActiveModel {
        id: Set(bot_dm),
        space_id: Set(space_id),
        kind: Set("direct".to_owned()),
        ..Default::default()
    }
    .insert(&txn)
    .await?;
    dm_conversations::ActiveModel {
        id: Set(bot_dm),
        space_id: Set(space_id),
        is_group: Set(false),
        created_by: Set(Some(import_bot)),
        ..Default::default()
    }
    .insert(&txn)
    .await?;
    for user in [admin, import_bot] {
        dm_participants::ActiveModel {
            dm_id: Set(bot_dm),
            user_id: Set(user),
            ..Default::default()
        }
        .insert(&txn)
        .await?;
    }
    insert_message(
        &txn,
        bot_dm,
        import_bot,
        "Import Nextcloud termine : 6 comptes, 16 conversations, 92 messages.",
    )
    .await?;

    // A read cursor: admin has read up to the welcome message in general.
    read_cursors::ActiveModel {
        conversation_id: Set(general),
        user_id: Set(admin),
        last_read_message_id: Set(Some(welcome)),
        ..Default::default()
    }
    .insert(&txn)
    .await?;

    txn.commit().await?;
    tracing::info!("seed: demo workspace created (6 users, 6 channels, messages, files, 1 DM)");
    Ok(())
}

/// Refuse to run outside development unless explicitly forced.
fn guard_dev_environment() -> Result<(), Box<dyn std::error::Error>> {
    let is_dev = std::env::var("RUCHOIR_ENV")
        .map(|v| v == "dev")
        .unwrap_or(false);
    let forced = std::env::args().any(|a| a == "--force");
    if is_dev || forced {
        Ok(())
    } else {
        Err("refusing to seed: set RUCHOIR_ENV=dev (or pass --force) to run the dev seed".into())
    }
}

/// Find a user by email, or create it with the shared seed password.
async fn upsert_user(
    txn: &DatabaseTransaction,
    config: &Config,
    email: &str,
    display_name: &str,
) -> Result<Uuid, Box<dyn std::error::Error>> {
    if let Some(existing) = users::Entity::find()
        .filter(users::Column::Email.eq(email))
        .one(txn)
        .await?
    {
        return Ok(existing.id);
    }
    let id = Uuid::new_v4();
    let password_hash =
        auth::hash_password(config, SEED_PASSWORD).map_err(|e| format!("hash failed: {e:?}"))?;
    users::ActiveModel {
        id: Set(id),
        email: Set(email.to_owned()),
        display_name: Set(display_name.to_owned()),
        password_hash: Set(Some(password_hash)),
        status: Set("active".to_owned()),
        mfa_enforced: Set(false),
        ..Default::default()
    }
    .insert(txn)
    .await?;
    Ok(id)
}

/// Create a bot account: no password, active, flagged `is_bot`.
async fn create_bot(
    txn: &DatabaseTransaction,
    email: &str,
    display_name: &str,
) -> Result<Uuid, DbErr> {
    let id = Uuid::new_v4();
    users::ActiveModel {
        id: Set(id),
        email: Set(email.to_owned()),
        display_name: Set(display_name.to_owned()),
        password_hash: Set(None),
        status: Set("active".to_owned()),
        mfa_enforced: Set(false),
        is_bot: Set(true),
        ..Default::default()
    }
    .insert(txn)
    .await?;
    Ok(id)
}

/// Create a conversation of kind `channel` and its channel row (shared primary key).
async fn create_channel(
    txn: &DatabaseTransaction,
    space_id: Uuid,
    created_by: Uuid,
    name: &str,
    channel_type: &str,
    topic: Option<&str>,
    imported_source: Option<&str>,
) -> Result<Uuid, DbErr> {
    let id = Uuid::new_v4();
    conversations::ActiveModel {
        id: Set(id),
        space_id: Set(space_id),
        kind: Set("channel".to_owned()),
        ..Default::default()
    }
    .insert(txn)
    .await?;
    channels::ActiveModel {
        id: Set(id),
        space_id: Set(space_id),
        name: Set(name.to_owned()),
        channel_type: Set(channel_type.to_owned()),
        topic: Set(topic.map(str::to_owned)),
        created_by: Set(Some(created_by)),
        imported_source: Set(imported_source.map(str::to_owned)),
        ..Default::default()
    }
    .insert(txn)
    .await?;
    Ok(id)
}

async fn add_channel_member(
    txn: &DatabaseTransaction,
    channel_id: Uuid,
    user_id: Uuid,
    role: &str,
) -> Result<(), DbErr> {
    channel_members::ActiveModel {
        channel_id: Set(channel_id),
        user_id: Set(user_id),
        role: Set(role.to_owned()),
        ..Default::default()
    }
    .insert(txn)
    .await?;
    Ok(())
}

async fn insert_message(
    txn: &DatabaseTransaction,
    conversation_id: Uuid,
    author_id: Uuid,
    body: &str,
) -> Result<Uuid, DbErr> {
    let id = Uuid::new_v4();
    messages::ActiveModel {
        id: Set(id),
        conversation_id: Set(conversation_id),
        author_id: Set(Some(author_id)),
        kind: Set("message".to_owned()),
        body: Set(body.to_owned()),
        ..Default::default()
    }
    .insert(txn)
    .await?;
    Ok(id)
}

async fn insert_reply(
    txn: &DatabaseTransaction,
    conversation_id: Uuid,
    author_id: Uuid,
    body: &str,
    parent_message_id: Uuid,
) -> Result<Uuid, DbErr> {
    let id = Uuid::new_v4();
    messages::ActiveModel {
        id: Set(id),
        conversation_id: Set(conversation_id),
        author_id: Set(Some(author_id)),
        kind: Set("message".to_owned()),
        body: Set(body.to_owned()),
        parent_message_id: Set(Some(parent_message_id)),
        ..Default::default()
    }
    .insert(txn)
    .await?;
    Ok(id)
}

async fn insert_system_message(
    txn: &DatabaseTransaction,
    conversation_id: Uuid,
    event: &str,
) -> Result<Uuid, DbErr> {
    let id = Uuid::new_v4();
    messages::ActiveModel {
        id: Set(id),
        conversation_id: Set(conversation_id),
        author_id: Set(None),
        kind: Set("system".to_owned()),
        system_event: Set(Some(event.to_owned())),
        ..Default::default()
    }
    .insert(txn)
    .await?;
    Ok(id)
}

async fn add_reaction(
    txn: &DatabaseTransaction,
    message_id: Uuid,
    user_id: Uuid,
    emoji: &str,
) -> Result<(), DbErr> {
    message_reactions::ActiveModel {
        message_id: Set(message_id),
        user_id: Set(user_id),
        emoji: Set(emoji.to_owned()),
        ..Default::default()
    }
    .insert(txn)
    .await?;
    Ok(())
}
