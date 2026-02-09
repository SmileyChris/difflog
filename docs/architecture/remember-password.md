---
icon: lucide/key
---

# Remember Password

The "Remember password" feature allows users to opt-in to persisting their sync password in localStorage, so they don't need to re-enter it when starting a new browser session.

## Security Warning

!!! danger "Plaintext Storage"
    Remembered passwords are stored in **plaintext** in localStorage. This means:

    - Any JavaScript running on the page can access them
    - They are vulnerable to XSS attacks
    - Browser extensions with page access can read them
    - Anyone with physical access to the device can view them in DevTools

    Users should only enable this feature on trusted, personal devices.

## Storage Format

Passwords are stored in localStorage under the key `difflog-remembered-passwords`:

```json
{
  "profile-id-1": "password1",
  "profile-id-2": "password2"
}
```

This is a simple key-value map from profile ID to password string.

## Password Resolution Order

When the app needs the sync password, it checks these sources in order:

1. **Session storage** - Current tab's cached password
2. **Remembered passwords** - localStorage, keyed by active profile ID
3. **User prompt** - Show password input in sync dropdown

If a remembered password is found, it's automatically promoted to session storage for the current tab:

```typescript
function getSyncPasswordWithFallback(): string | null {
  const sessionPwd = getSyncPassword();
  if (sessionPwd) return sessionPwd;

  const profileId = activeProfileId.value;
  if (profileId) {
    const remembered = getRememberedPassword(profileId);
    if (remembered) {
      // Promote to session storage for this tab
      setSyncPassword(remembered);
      return remembered;
    }
  }
  return null;
}
```

## Lifecycle

| Event | Action |
|-------|--------|
| User checks "Remember password" + syncs successfully | Password saved to localStorage |
| User clicks "forget saved password" | Cleared from both session and localStorage |
| User deletes profile | Password cleared from localStorage |
| User switches profiles | Session storage cleared (remembered stays) |
| Browser session ends | Session storage cleared (remembered stays) |
| **Sync fails with invalid password (401)** | **Cleared from both session and localStorage** |

## Password Validation

Passwords are only cached (in session or localStorage) **after a successful sync**. This prevents the app from repeatedly retrying with an invalid password:

1. User enters password in sync dropdown
2. App attempts to sync with server
3. **If successful**: Password is cached in session storage (and localStorage if "Remember" was checked)
4. **If 401 Invalid Password**: Error is shown, no password is cached, any remembered password for this profile is cleared

### Multi-Device Password Changes

If you change your sync password on one device, other devices with a remembered (now invalid) password will:

1. Attempt auto-sync with the remembered password
2. Receive 401 "Invalid password" from server
3. Automatically clear the remembered password
4. Show the password prompt with "Invalid password" error
5. Stop retrying until user enters the correct password

This prevents the app from hammering the server with invalid credentials and triggering rate limits.

## UI Elements

### Password Form (when password needed)

When the user needs to enter their password, a checkbox appears:

A "Remember password" checkbox appears in the sync/import password forms.

### Forget Button (when logged in)

The "forget password" button text changes based on whether the password is remembered:

- **Session only**: "forget password"
- **Remembered**: "forget saved password"

Clicking either clears both session and remembered passwords.

## API

### sync.ts

```typescript
// Get remembered password for a profile
getRememberedPassword(profileId: string): string | null

// Save password for a profile
setRememberedPassword(profileId: string, password: string): void

// Clear password for a profile
clearRememberedPassword(profileId: string): void

// Check if a profile has a remembered password
hasRememberedPassword(profileId: string): boolean
```

### sync.svelte.ts (store)

```typescript
// Check if active profile has a remembered password
isPasswordRemembered(): boolean

// Remember password for active profile
rememberPassword(password: string): void

// Forget password for active profile (session + remembered)
forgetPassword(): void
```

## Related

- [Sync System](sync.md) - How sync works
- [Encryption](encryption.md) - How content is encrypted (password still needed for decryption)
