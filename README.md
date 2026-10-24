# Fieldnotes — Local Tourist Day-Visit Planner

This is the Fieldnotes local tourist day-visit planner for attractions around Kirindiwela and Bandaranaikepura. It includes a public guide and a separate PHP/MySQL administration site.

## Architecture

- Public interface: `index.html`, `styles.css`, and `app.js`, linked as separate files. Browser itineraries and planning preferences persist in `localStorage`.
- Administrator interface: `admin/index.html`, `admin/admin.css`, and `admin/admin.js`. Open it at `/admin/`; the public footer links to it in a new tab.
- Server API: `api/index.php`, using PHP sessions and PDO prepared statements.
- Database: MySQL schema in `database/schema.sql`, including Attractions, Categories, Facilities, and their relationship tables.
- Administrator provisioning: CLI-only `scripts/create_admin.php`. There is no default admin password or public setup route.
- Maps: map search embeds and Google Maps direction links; no API key is required. Exact coordinates are blank until verified and recorded.

The public guide can be opened without PHP and uses the proposal's 10 attractions as a read-only fallback. When served by PHP and MySQL, it loads attractions and categories from the database. The dedicated dashboard supports attraction search, category filtering, sorting, pagination, and full attraction/custom-category CRUD. The four project categories cannot be renamed or removed; a category in use cannot be deleted. The legacy `attractions.facilities` text field remains available while the Facilities relationship is maintained for new edits.

## Requirements

- XAMPP or another PHP 8.1+ and MySQL/MariaDB environment.
- PHP extensions `pdo_mysql` and `mbstring` enabled.
- HTTPS for deployment. The PHP API marks session cookies Secure automatically when HTTPS is active.

## Local setup with XAMPP

1. Copy this folder under the XAMPP web root (for example, `C:\xampp\htdocs\fieldnotes`). Start MySQL in the XAMPP Control Panel.
2. In phpMyAdmin, create a database named `fieldnotes` using `utf8mb4`, then run `database/schema.sql` against it. This script uses create-if-missing and insert-if-missing statements; it does not drop tables or reset records.
3. Create a dedicated database user with only the permissions needed by this app (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) on the `fieldnotes` database. Do not use the MySQL root account for a deployed installation.
4. Open PowerShell, change to the application directory, then configure the database and app key in that shell. The password prompts below are hidden; these values are not written into source files:

```powershell
$env:FIELDNOTES_DB_HOST = '127.0.0.1'
$env:FIELDNOTES_DB_PORT = '3306' # Optional; defaults to 3306.
$env:FIELDNOTES_DB_NAME = 'fieldnotes'
$env:FIELDNOTES_DB_USER = 'fieldnotes_app'
$secureDb = Read-Host 'Database password' -AsSecureString
$ptrDb = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureDb)
$env:FIELDNOTES_DB_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptrDb)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptrDb)
$env:FIELDNOTES_APP_KEY = (php -r "echo bin2hex(random_bytes(32));")
```

5. Seed the initial proposal-based records. The SQL seed leaves opening hours, fees, facilities, visit duration, image URLs, and coordinates unknown because the supplied documents do not verify those values. If setup is rerun against existing data, existing rows are not overwritten.
6. Create the first administrator through the CLI. The password is supplied through a hidden PowerShell prompt and is never passed as a command-line argument:

```powershell
$secureAdmin = Read-Host 'New administrator password (12+ characters)' -AsSecureString
$ptrAdmin = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureAdmin)
$env:FIELDNOTES_INITIAL_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptrAdmin)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptrAdmin)
php scripts/create_admin.php your-admin-name
Remove-Item Env:FIELDNOTES_INITIAL_ADMIN_PASSWORD
```

7. Start the site from the same configured PowerShell session:

```powershell
php -S 127.0.0.1:8000 -t .
```

Visit `http://127.0.0.1:8000` for the public guide and `http://127.0.0.1:8000/admin/` for administrator access. Keep the database and application environment variables available to the PHP server process. Do not publish this local HTTP setup; use HTTPS and a managed secret store for deployment. Clear the local shell variables after the demonstration by closing the session.

For a local loopback XAMPP demonstration only, if database variables are absent the PHP web API defaults to `127.0.0.1:3307`, database `fieldnotes`, user `root`, and a blank MySQL password. This matches the XAMPP port shown in the supplied setup screenshot. CLI setup and non-local requests still require explicit environment variables. Set explicit credentials for any other local database configuration; never use the local root fallback on a deployed server.
## Admin security

- Passwords are stored with `password_hash()` and verified with `password_verify()`.
- Session IDs rotate after authentication; cookies are HttpOnly, SameSite=Lax, and Secure over HTTPS.
- Every admin endpoint checks the active administrator account. State-changing requests require a session CSRF token.
- Login errors are generic, failed attempts are rate-limited per client address for 15 minutes, and public routes do not return account data.
- Attraction/category updates use prepared statements, server-side validation, and transactions for category relationships. Output is escaped by the client renderer.
- The CLI setup refuses to create a predictable default account and refuses to add a second initial account.

## Planner behavior and data notes

- Search, category filtering, details, map search, add/remove/reorder, drag-and-drop, keyboard move controls, local persistence, copy/share, print, preferred category, route starting point, trip date, departure time, available hours, and traveler count are implemented.
- Entrance-fee summaries include known fees only. A blank fee means unknown; LKR 0 means confirmed free. Group estimates multiply known per-person fees by the traveler count and exclude food, transport, and unrecorded fees.
- Visit durations are totaled only when entered. The planner warns if known visit durations alone exceed the selected available time. It does not invent travel times or route distances.
- Attraction distances are approximate figures from the project proposal and refer to the starting area; they are not summed as route distances. Coordinates are not included until verified. Map search results need confirmation.
- Hours, fees, facilities, tips, images and durations should be checked with authoritative sources before the final academic demonstration. The proposal descriptions are presented as proposal descriptions, not independently verified claims.
- The CSS motion is subtle, uses IntersectionObserver for selected reveals, and disables nonessential motion for `prefers-reduced-motion`.

## Validation status

Verified in this task environment:

- `node --check app.js` and `node --check admin/admin.js` passed; PHP syntax checks passed for `api/index.php`, `config/database.php`, and `scripts/create_admin.php` using the installed XAMPP PHP runtime.
- The local PHP/MySQL services returned 10 attraction records and 4 project categories. The administrator signed in through `/admin/`, and the dashboard showed live record counts and completeness data.
- API checks passed for administrator login, dashboard/list access, attraction create/read/update/delete, custom category create/update/delete, normalized facilities and category links, protected project categories, blocking deletion of a category in use, logout, and rejecting an unauthenticated dashboard request.
- The browser displayed the separate dashboard, attraction table and category table; the attraction search reduced the 10-record list to the matching record.
- The public planner's existing search, category filters, itinerary editing, persistence, fees and travel-time unknown handling were checked earlier in the task; a 390 px mobile viewport had no horizontal overflow.
