//! OS credential-store access for connection secrets, hardened against the
//! macOS Keychain's find-then-add behavior.
//!
//! Secrets live in the platform secure store: the macOS Keychain, the Windows
//! Credential Manager, or the Linux kernel keyutils (which needs no daemon and
//! therefore works headless). The store is selected once, on first use, via
//! [`keyring_core::set_default_store`].
//!
//! # macOS duplicate-item recovery
//!
//! The Keychain backend behind `keyring`/`security-framework` implements
//! "set" as *find then add*: the scoped lookup against the login keychain is
//! attempted first, and when it fails (for any reason) a new item is added.
//! If the login keychain is locked, the lookup fails, macOS prompts to unlock
//! it, and the subsequent add discovers the item created by an earlier login
//! still exists, returning `errSecDuplicateItem`. [`set_password`] detects
//! that OSStatus and recovers by deleting the stale item and retrying once,
//! so re-logins and ticket refreshes succeed after the keychain is unlocked.
//! Failures that persist are mapped to actionable messages via
//! [`describe_error`].

use std::sync::OnceLock;

pub use keyring_core as keyring;

/// The Keychain/Credential Manager service name under which all Clustri
/// secrets are stored. Each entry's account is `"{connection_id}:{field}"`.
pub const SERVICE: &str = "clustri";

/// Initializes the platform credential store, exactly once, before the first
/// entry is created. Subsequent calls return the cached outcome.
fn init_store() -> keyring::Result<()> {
    static INIT: OnceLock<Result<(), String>> = OnceLock::new();
    let cached = INIT.get_or_init(|| {
        #[cfg(target_os = "macos")]
        let store = apple_native_keyring_store::keychain::Store::new();
        #[cfg(target_os = "windows")]
        let store = windows_native_keyring_store::Store::new();
        #[cfg(target_os = "linux")]
        let store = linux_keyutils_keyring_store::Store::new();
        #[cfg(any(
            target_os = "macos",
            target_os = "windows",
            target_os = "linux"
        ))]
        match store {
            Ok(s) => {
                keyring_core::set_default_store(s);
                Ok(())
            }
            Err(e) => Err(e.to_string()),
        }
        #[cfg(not(any(
            target_os = "macos",
            target_os = "windows",
            target_os = "linux"
        )))]
        Err("no keyring store is configured for this platform".to_string())
    });
    match cached {
        Ok(()) => Ok(()),
        Err(message) => Err(keyring::Error::Invalid(
            "store".to_string(),
            message.clone(),
        )),
    }
}

/// Returns the keyring entry for a connection's field, initializing the
/// platform store on first use. Entry construction failures are mapped to
/// [`crate::Error::KeyringError`] so callers that tolerate a missing store
/// (e.g. headless Linux) can treat them as `None`.
pub fn entry(connection_id: &str, field: &str) -> crate::Result<keyring::Entry> {
    init_store().map_err(|e| crate::Error::KeyringError(describe_error(&e)))?;
    let key = format!("{}:{}", connection_id, field);
    keyring::Entry::new(SERVICE, &key).map_err(|e| crate::Error::KeyringError(describe_error(&e)))
}

/// Writes a secret for a connection field, recovering from the macOS
/// "item already exists" failure by deleting the stale item and retrying once.
pub fn set_password(connection_id: &str, field: &str, value: &str) -> crate::Result<()> {
    let entry = entry(connection_id, field)?;
    match entry.set_password(value) {
        Ok(()) => Ok(()),
        Err(keyring::Error::PlatformFailure(inner)) if is_duplicate_item(inner.as_ref()) => {
            // The item exists but the pre-add lookup could not see it (the
            // login keychain was locked during the lookup). Once the user has
            // unlocked the keychain, deleting and re-adding succeeds.
            let _ = entry.delete_credential();
            entry
                .set_password(value)
                .map_err(|e| crate::Error::KeyringError(describe_error(&e)))
        }
        Err(e) => Err(crate::Error::KeyringError(describe_error(&e))),
    }
}

/// Deletes a stored secret for a connection field. A missing entry is not an
/// error, so clearing credentials is idempotent.
pub fn delete_credential(connection_id: &str, field: &str) -> crate::Result<()> {
    let entry = entry(connection_id, field)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(crate::Error::KeyringError(describe_error(&e))),
    }
}

/// Maps a keyring error to a message with actionable guidance. On macOS the
/// underlying OSStatus is inspected for the known failure modes (duplicate
/// item, locked keychain, missing entitlement); everything else keeps the
/// platform detail so it can be reported or debugged.
pub fn describe_error(err: &keyring::Error) -> String {
    match err {
        keyring::Error::PlatformFailure(inner) => {
            #[cfg(target_os = "macos")]
            {
                if let Some(sec_err) = inner.downcast_ref::<security_framework::base::Error>() {
                    return match sec_err.code() {
                        // errSecDuplicateItem: the item exists but could not be
                        // located for update (locked login keychain during the
                        // lookup, or a stray item in another keychain).
                        -25299 => format!(
                            "macOS Keychain: the stored item already exists and could not \
                             be replaced. Your login keychain is likely locked or its \
                             password is out of date. Open Keychain Access, unlock the \
                             'login' keychain (or use Edit > Change Password for Keychain \
                             'login'), then try again. If a duplicate '{SERVICE}' item is \
                             listed under the iCloud keychain, delete it there as well. \
                             ({inner})"
                        ),
                        // errSecAuthFailed: the keychain did not unlock.
                        -25293 => format!(
                            "macOS Keychain: the login keychain is locked or the password \
                             is incorrect. Unlock it in Keychain Access and try again. \
                             ({inner})"
                        ),
                        // errSecMissingEntitlement: unsigned app access denial.
                        -34018 => format!(
                            "macOS Keychain: access was denied because the app is not \
                             signed with keychain entitlements. ({inner})"
                        ),
                        _ => format!("macOS Keychain error: {inner}"),
                    };
                }
            }
            format!("Secure storage error: {inner}")
        }
        keyring::Error::NoStorageAccess(inner) => format!(
            "Secure storage is locked or unavailable: {inner}. Unlock your login keychain \
             (or keyring) and try again."
        ),
        _ => err.to_string(),
    }
}

/// True when a platform error is the macOS `errSecDuplicateItem` code, which
/// the login keychain reports when an add hits an item that already exists.
fn is_duplicate_item(err: &(dyn std::error::Error + Send + Sync + 'static)) -> bool {
    #[cfg(target_os = "macos")]
    {
        if let Some(sec_err) = err.downcast_ref::<security_framework::base::Error>() {
            return sec_err.code() == -25299;
        }
    }
    let _ = err;
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn describe_error_explains_locked_storage() {
        let err = keyring::Error::NoStorageAccess(Box::new(std::io::Error::other("locked")));
        let msg = describe_error(&err);
        assert!(msg.contains("locked or unavailable"), "{msg}");
        assert!(msg.contains("Unlock"), "{msg}");
    }

    #[test]
    fn describe_error_keeps_platform_detail() {
        let err = keyring::Error::PlatformFailure(Box::new(std::io::Error::other("boom")));
        let msg = describe_error(&err);
        assert!(msg.contains("Secure storage error"), "{msg}");
        assert!(msg.contains("boom"), "{msg}");
    }

    #[test]
    fn describe_error_passes_other_variants_through() {
        let err = keyring::Error::Invalid("service".to_string(), "cannot be empty".to_string());
        assert_eq!(describe_error(&err), err.to_string());
    }

    #[test]
    fn set_get_delete_round_trip() {
        let id = uuid::Uuid::new_v4().to_string();
        let field = "unit";
        let value = "round-trip-secret";
        set_password(&id, field, value).expect("set_password should succeed");
        let entry = entry(&id, field).expect("entry should be constructible");
        assert_eq!(
            entry.get_password().expect("get_password should succeed"),
            value
        );
        delete_credential(&id, field).expect("delete_credential should succeed");
        match entry.get_password() {
            Err(keyring::Error::NoEntry) => {}
            other => panic!("expected NoEntry after delete, got {other:?}"),
        }
    }

    #[test]
    fn delete_credential_is_idempotent() {
        let id = uuid::Uuid::new_v4().to_string();
        delete_credential(&id, "unit").expect("deleting a missing entry should be a no-op");
    }
}
