# Burp Suite Extension
The BurpSuite Dom Invador extention that only exists in Burp own chromium browser

## Instructions
### 1. Clone to the google chrome path
- In your Chrome browser, type `chrome://version` into the address bar and press Enter.
* In the __Profile Path__ section copy the address and go to the address in your os and find `extension` folder and go to it.
+ clone this project here: `git clone [BurpSuiteExtension](https://github.com/zeotrix/BurpSuiteExtension.git)`

### 2. Open the Extensions Page:
   In your Chrome browser, type `chrome://extensions` into the address bar and press Enter.
   
### 3. Enable Developer Mode: 
In the top right corner of the Extensions page, you will see a toggle switch labeled "Developer mode". Click this switch to turn it on.
### 4. Load the Extension:
Once Developer mode is enabled, a new button called "Load unpacked" will appear near the top left of the page.
### 5. Select the Folder:
A file dialog will open. Navigate to the folder where your extension files are located.

**Important:** You need to select the root folder of the extension—the folder that contains the manifest.json file.

### 5. Click "Select Folder" (or "Open" on some systems).
The extension should now be loaded into your Chrome browser and appear on the extensions list and Inspect section.
### 6. Enable DOM Invador
Back to browser and open Burp Suite extention from top right and in `DOM INVADOR` section enable it
### 7. Use and Enjoy!
# Remember
When you load an unpacked extension, Chrome creates a link to the folder's current location. It does not copy the files into Chrome's main installation directory. This is why you can leave the folder wherever you prefer (like your desktop, a dedicated development folder, etc.) and it will still work. If you move or delete that folder, the extension will stop working in Chrome.

