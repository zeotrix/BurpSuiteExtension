export default function updateIcon() {
    chrome.storage.local.get(['lastTab'], (result) => {
        let lastTabId = result.lastTab;
        if (lastTabId === "nav-dom-invader-tab") {
            new Promise((resolve, reject) => chrome.storage.local.get('enabled', function(result) {
                if (typeof result.enabled === 'undefined') {
                    resolve(false);
                } else {
                    resolve(result.enabled);
                }
            })).then(enabled => {chrome.action.setIcon({path: '../dom-invader-extension/images/DomInvader-128' +
                    ((enabled) ? '' : '-off') +
                    '.png'});
            });
        }
        else if (lastTabId === "nav-recorder-tab") {
            chrome.action.setIcon({path: '../navigation-recorder/images/WebApp-Recorder-128.png'});
        }
    });
}