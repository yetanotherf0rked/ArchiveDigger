# Archive Digger

Archive Digger is a Firefox extension that checks for archived versions of the current page using the web.archive.org CDX API. It automatically fetches archive entries and displays a side-by-side diff view between the archived and current versions.

## Installation

1. **Clone or download** the repository.
2. Open Firefox and navigate to `about:debugging`.
3. Click **"Load Temporary Add-on"** (or **"This Firefox"**) and select the `manifest.json` file from the repository.

## Usage

- Visit any webpage—the extension automatically checks for archive entries.
- Click the extension icon to open the popup showing the number of archive results.
- Click the **"Show"** button next to a result to open a diff view comparing the archived and current page versions.

## Future Tasks

- Implement media EXIF diff.
- Add archive.today support (requires advanced parsing and captcha handling).
- Fix global similarity score calculation.
- Test URL diff functionality thoroughly.

