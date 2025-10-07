let lastRecording = '';
let copyClipboardBtn = document.getElementById('copyClipboardBtn');
let newRecordingBtn = document.getElementById('newRecordingBtn');
let clearClipboardBtn = document.getElementById('clearClipboardBtn');

clearClipboardBtn.addEventListener('click', async function(){
    await addToClipboard(' ');
});

newRecordingBtn.addEventListener('click', function(){
    chrome.storage.sync.set({recordingDelay: +document.querySelector('#recordingDelay').value,recording: true, complete:false}, function() {
        console.log("Started recording");
        top.close();
      });
});

window.addEventListener('load', function(){
    chrome.runtime.sendMessage({messageType:'getLastRecording'}, function(response){
        if(response && response.type === 'lastRecording') {
            lastRecording = response.lastRecording;
            if(!lastRecording.length) {
                chrome.storage.sync.set({recording: false, complete:false}, function() {
                    location = 'popup.html';
                });
            }
        }
    });
});
copyClipboardBtn.addEventListener('click', async function(){
    let title = document.getElementById('title');
    let message = document.getElementById('message');    
    title.innerHTML = 'Data copied to clipboard';
    message.textContent = 'Your data has been saved to your clipboard. Please paste this into Burp Suite.';
    await addToClipboard(lastRecording);
});

let creating; // A global promise to avoid concurrency issues
async function setupOffscreenDocument(path) {
    // Check all windows controlled by the service worker to see if one
    // of them is the offscreen document with the given path
    const offscreenUrl = chrome.runtime.getURL(path);
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) {
        return;
    }

    // create offscreen document
    if (creating) {
        await creating;
    } else {
        creating = chrome.offscreen.createDocument({
            url: path,
            reasons: [chrome.offscreen.Reason.CLIPBOARD],
            justification: 'Write text to the clipboard.',
        });
        await creating;
        creating = null;
    }
}

async function addToClipboard(value) {
    await setupOffscreenDocument(chrome.runtime.getManifest().name === 'Burp Suite Navigation Recorder' ? 'background/offscreen.html' : "navigation-recorder/background/offscreen.html");

    chrome.runtime.sendMessage({
        type: 'copy-data-to-clipboard',
        target: 'offscreen-doc',
        data: value
    });
}