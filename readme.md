# Archive Digger

Archive Digger is a Firefox extension that checks if the current page has an entry on [archive.today](https://archive.today/) and [web.archive.org](https://web.archive.org/). The extension automatically updates its "history" icon badge with the number of archive results found. When you click the icon, a popup displays the results—sorted by date—with details about the service (archive.today or web.archive.org). You also have the option to disable automatic archive fetching.

## Features

- **Automatic Archive Check:** Automatically searches for archive entries on both archive.today and web.archive.org when you load a new page.
- **Dynamic Badge Count:** The extension icon displays the number of archive results found.
- **Results Popup:** Click the extension icon to view archive details sorted by date and service.
- **Toggle Archive Fetching:** Easily disable or enable automatic archive fetching using a checkbox in the popup.

    
## Installation

1. **Clone or Download:** Get the repository to your local machine.
2. **Open Firefox:** In the Firefox address bar, navigate to `about:debugging`.
3. **Load Temporary Add-on:** Click on "This Firefox" (or "Load Temporary Add-on" in older versions) and then click "Load Temporary Add-on".
4. **Select Manifest:** Choose the `manifest.json` file from the repository folder.
5. **Use the Extension:** The extension will now be active. Browse any webpage and the extension will check for archives.

## Usage

- **Automatic Archive Checking:** By default, Archive Digger fetches archive entries for the current active tab.
- **Viewing Results:** The number of results appears on the extension icon as a badge. Click the icon to open the popup and view details.
- **Disable Automatic Fetching:** Uncheck the "Automatic Archive Fetching" option in the popup to stop the extension from querying archives automatically.

## Development

- **Background Script (`background.js`):** Handles tab updates, fetches archive data from web.archive.org (via their API) and archive.today (using a basic HTML check), and updates the badge.
- **Popup (`popup.html` and `popup.js`):** Displays the results and allows users to toggle automatic archive fetching.
- **APIs Used:** Utilizes Firefox’s WebExtension APIs for tabs, browser actions, messaging, and local storage.
- **Note on Archive.today:** The archive.today check uses a rudimentary method to detect archive entries. In a production scenario, consider enhancing the parsing logic for more reliable results.

## Known Issues

- **Archive.today Parsing:** The method for detecting archive.today entries is basic and might need improvement for consistent accuracy.
- **Error Handling:** Further error handling and user feedback mechanisms can be implemented for a smoother user experience.

## License

This project is licensed under the [MIT License](LICENSE).
