export default class RecorderControl {
    incognito = false;
    recordingDelay = 0;
    recordingWindowId = -1;
    recordingTabId = -1;
    tabIdLookup = Object.create(null);
    #sequence = [];
    #recording = false;
    #lastRecording = "";
    #imagePath = chrome.runtime.getManifest().name === 'Burp Suite Navigation Recorder' ? '../images/' : '../navigation-recorder/images/';
    #windowIds = [];
    start(delay) {
        this.recordingDelay = delay;
        console.log('Recording...');
        let that = this;
        this.#sequence = [];
        this.#lastRecording = '';
        chrome.extension.isAllowedIncognitoAccess(function (isAllowed){
          if(isAllowed) {
            that.launchRecordingWindow(true);
          } else {
              chrome.storage.sync.get('bypassIncognito', function(data) {
                  if(data.bypassIncognito) {
                      that.launchRecordingWindow(false);
                  }
              });
          }
        });                       
    }
    launchRecordingWindow(incognito) {
        let that = this;
        this.incognito = incognito;
        chrome.windows.create({incognito, focused: true, state: 'maximized'}, function(win){
            that.recordingWindowId = win.id;
            that.recordingTabId = win.tabs[0].id;
            chrome.tabs.onCreated.addListener(that.tabCreatedListener.bind(that));
            chrome.windows.onCreated.addListener(that.windowCreatedListener.bind(that));
            chrome.windows.onRemoved.addListener(that.windowRemovedListener.bind(that));
            chrome.webNavigation.onDOMContentLoaded.addListener(that.tabListener.bind(that));
            chrome.action.setIcon({path: that.#imagePath + 'WebApp-Recorder-recording-icon.png'});
            that.manualUrlListener = that.manualUrlListener.bind(that);
            chrome.webNavigation.onBeforeNavigate.addListener(that.manualUrlListener);
            chrome.webNavigation.onCommitted.addListener(that.manualUrlListener);
            that.tabIdLookup[that.recordingTabId] = win.id;
            that.saveEvent({
                name:"Burp Suite Navigation Recorder", version: '2.0.13', recordingDelay: that.recordingDelay, eventType: "start", platform: navigator.platform, iframes: [], windows: [{windowId: win.id}], tabs: [{tabId: that.recordingTabId, windowId: win.id}]
            });
        });
    }
    isRecording() {
      return this.#recording;
    }
    getLastRecording() {
      return this.#lastRecording;
    }
    setRecordingState(state) {
        this.#recording = state;
    }
    async copyToClipboard(text) {
        await addToClipboard(text);
    }
    triggersNavigation(lastEvent) {
        return !!(lastEvent && lastEvent.eventType !== "start" && lastEvent.eventType !== "goto");
    }
    tabIdToWindowId(tabId) {
        return this.tabIdLookup[tabId];
    }
    manualUrlListener(details) { 
        if(/^https?:/.test(details.url)) {
            let date = new Date();
            let gotoEvent = {
                date: date,
                timestamp: +date,
                eventType: 'goto',
                url: details.url,
                triggersNavigation: true,
                frameId: details.frameId,
                tabId: details.tabId,
                windowId: this.tabIdToWindowId(details.tabId)
            };
            let lastEvent = this.lastEvent();
            if(details.transitionQualifiers && details.transitionQualifiers.includes('client_redirect')) {
                let clientSideRedirect = {
                    date: date,
                    timestamp: +date,
                    url: details.url,
                    eventType: 'clientSideRedirect',
                    frameId: details.frameId,
                    tabId: details.tabId,
                    windowId: this.tabIdToWindowId(details.tabId)
                };
                if(this.triggersNavigation(lastEvent)) {
                    lastEvent.triggersNavigation = true;
                }
                this.saveEvent(clientSideRedirect);
            } else if(this.triggersNavigation(lastEvent)) {
              lastEvent.triggersNavigation = true;
              let navigateEvent = {
                  date: date,
                  timestamp: +date,
                  eventType: 'userNavigate',
                  url: details.url,
                  frameId: details.frameId,
                  tabId: details.tabId,
                  windowId: this.tabIdToWindowId(details.tabId)
              };
              this.addStartUrl(details.url, details.tabId);
              this.saveEvent(navigateEvent);
            }

            if(details.transitionType === 'auto_bookmark') {
               gotoEvent.fromAddressBar = true;
               gotoEvent.url = lastEvent.url;
               this.addStartUrl(details.url, details.tabId);
            } else if(details.transitionQualifiers && details.transitionQualifiers.includes('from_address_bar') && lastEvent && lastEvent.eventType === 'goto') {
              gotoEvent.fromAddressBar = true;  
              gotoEvent.url = lastEvent.url;
              this.addStartUrl(details.url, details.tabId);
            } else {
              gotoEvent.fromAddressBar = false;
            }      
            if(!lastEvent) {                
              this.saveEvent(gotoEvent);                                
            } else {
              if(!(lastEvent.fromAddressBar && gotoEvent.fromAddressBar && gotoEvent.url === lastEvent.url)) {
                this.saveEvent(gotoEvent);
              } 
            }
        }
      }
      addStartUrl(url, tabId) {
        let element = this.#sequence[0]['tabs'].find(element => element.tabId === tabId);
        if(element && !element.attributes) {
            element.attributes = {firstUrl: url};
        }
      }
      addInfoToFirstEvent(property, data, lookupPropertyName, lookupPropertyValue) {
          if(!this.#sequence[0][property].find(element => element[lookupPropertyName] === lookupPropertyValue)) {
              this.#sequence[0][property].push(data);
          }
      }
      tabCreatedListener(tab) {
        let that = this;
        if(!this.isRecording()) {
            return;
        }
        if(tab.windowId < that.recordingWindowId || (that.incognito && !tab.incognito)) {
            return;
        }
        chrome.tabs.query({windowId: tab.windowId}, function(tabs){
            if(!tabs.length) {
              return;
            }
            that.addInfoToFirstEvent('tabs', {tabId: tab.id, windowId: tab.windowId, openerTabId: tab.openerTabId}, 'tabId', tab.id);
            that.tabIdLookup[tab.id] = tab.windowId;
            chrome.scripting.executeScript(
                {
                    target: {tabId: tabs[0].id},
                    func: function(windowId, tabId){
                        recorder.collectEvents({createdTab:true, triggersNavigation:true, opensNewContext:true, windowId: windowId,tabId: tabId});
                    },
                    args: [tab.windowId, tabs[0].id],
                    injectImmediately: true
                }
            ).catch(e => {
                console.log("Failed to collect events. error:",e);
            });
        });
      }
      collectIframeInfo(frameId, windowId, iframeInfo) {
        this.iframeCreated(windowId, frameId, iframeInfo);
      }
      iframeCreated(windowId, frameId, iframeInfo) {
        let firstEvent = this.#sequence[0];
        for(let i=0;i<firstEvent.iframes.length;i++) {
            if(firstEvent.iframes[i].frameId === frameId) {
                return;
            }
        }
        firstEvent.iframes.push({frameId: frameId, createdByWindowId: windowId, ...iframeInfo});
      }
      windowCreatedListener(win) {
          if(!this.isRecording()) {
              return;
          }
          if(win.id < this.recordingWindowId || (this.incognito && !win.incognito)) {
              return;
          }
          if(win.id !== this.recordingWindowId) {
              this.#windowIds.push(win.id);
              let tabId = -1;
              chrome.tabs.query({windowId: win.id}, function(tabs){
                  that.tabIdLookup[tabs[0].id] = win.id;
                  tabId = tabs[0].id;
              });

              let that = this;
              chrome.tabs.query({windowId: this.recordingWindowId}, function(tabs){
              if(!tabs.length) {
                  return;
              }
              that.addInfoToFirstEvent('windows', {windowId: win.id, state: win.state}, 'windowId', win.id);
              chrome.scripting.executeScript(
                  {
                      target: {tabId: tabs[0].id},
                      func: function(windowId, tabId){
                          recorder.collectEvents({createdWindow:true, triggersNavigation:true, opensNewContext:true, windowId: windowId, tabId: tabId});
                      },
                      args: [win.id, tabs[0].id],
                      injectImmediately: true
                  }
              ).catch(e => {
                  console.log("Failed to collect events. error:",e);
              });
            });                    
          }
      }
      findLastEvent(excludeTypeRegex, callback){
        let len = this.#sequence.length;
        if(len) {
          for(let i=len-1;i>0;i--) {
            if(this.#sequence[i] && !excludeTypeRegex.test(this.#sequence[i].eventType)) {
              callback(i, this.#sequence);
              return;
            }
          }
        }
      }
      windowRemovedListener(winId) {
        if(this.isRecording() && winId !== this.recordingWindowId) {
          if(this.#sequence.length) {
            this.findLastEvent(/^(?:goto|userNavigate)$/, function(pos, obj){
               obj[pos].closesContext = true;
            });            
          }                            
        }
        if(this.isRecording() && winId === this.recordingWindowId) {
          chrome.storage.sync.set({recording: false, complete:true});
          this.complete();
        }
      }
      tabListener(details) {
        let delay = this.recordingDelay;
        let that = this;
        if(this.isRecording()) {
          chrome.tabs.get(details.tabId, function(tab) {
              if(tab.windowId < that.recordingWindowId || (that.incognito && !tab.incognito)) {
                  return;
              }
              chrome.scripting.executeScript(
                  {
                      target: {tabId: details.tabId, frameIds:[details.frameId]},
                      func: function(frameId, tabId, delay){
                          window.recorder.start(frameId,tabId,delay);
                      },
                      args: [details.frameId, details.tabId, delay],
                      injectImmediately: true
                  }
              ).catch(e => {
                  console.log("Failed to execute JavaScript:",e);
              });
          });                   
        }      
      }
      lastEvent() {
        return this.#sequence[this.#sequence.length-1];
      }
      saveEvent(event) {
        this.#sequence.push(event);
      }
      addWindowTabInformation(events) {
        let firstEvent = this.#sequence[0];
        for(let i = 0; i < events.length;i++) {
            let event = events[i];
            if(event.createdTabId) {
               for(let j=0;j<firstEvent.tabs.length;j++) {
                   if(firstEvent.tabs[j].tabId === event.createdTabId && firstEvent.tabs[j].windowId === event.windowId && event.opensNewContext) {
                       firstEvent.tabs[j].createdByEvent = i;
                       break;
                   }
               }
            } else if(event.createdWindowId) {
                for(let j=0;j<firstEvent.windows.length;j++) {
                    if(firstEvent.windows[j].windowId === event.createdWindowId && firstEvent.windows[j].tabId === event.tabId && event.opensNewContext) {
                        firstEvent.windows[j].createdByEvent = i;
                        break;
                    }
                }
            }
        }
      }
      storeData(data) {
        this.#sequence = this.#sequence.concat(data);
      }
      installed() {
        console.log("Extension installed");
      }
      pageUnload() {
          chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if(!tabs.length) {
              return;
          }
            if(tabs[0]) {
                chrome.scripting.executeScript(
                    {
                        target: {tabId: tabs[0].id},
                        func: function(){
                            recorder.collectEvents();
                        },
                        injectImmediately: true
                    }
                ).catch(e => {
                    console.log("Failed to collect events. error:",e);
                });
            } else {
              console.log("Unable to collect events tab doesn't exist");
            }
          });        
      }
      finish() {
        console.log('Stopped recording.');
        chrome.tabs.query({windowId: this.recordingWindowId}, function(tabs) {
          if(!tabs.length) {
            return;
          }
            chrome.scripting.executeScript(
                {
                    target: {tabId: tabs[0].id},
                    func: function(){
                        recorder.finish();
                    },
                    injectImmediately: true
                }
            ).catch(e => {
                console.log("Error closing window",e);
            });
        });
        chrome.action.setIcon({path: this.#imagePath + 'WebApp-Recorder-stop-icon.png'});
      }
      sendWarningMessage() {
        if(!this.isRecording()) {
            return;
        }
        chrome.tabs.query({windowId: this.recordingWindowId}, function(tabs) {
            chrome.scripting.executeScript(
                {
                    target: {tabId: tabs[0].id},
                    func: function(){
                        recorder.showWarningMessage();
                    },
                    injectImmediately: true
                }
            ).catch(e => {
                console.log("Failed to send warning message",e);
            });
        });
      }
      filterEvents(events) {
          let filtered = [];          
          for(let i=0;i<events.length;i++) {
            let event = events[i];
            let lastEvent = events[i-1];            
            if(event.eventType === 'goto') {
              if(!event.fromAddressBar) {
                continue;
              } else {
                if(lastEvent && lastEvent.eventType === 'goto') {              
                  let lastFiltered = filtered[filtered.length-1];
                  if(lastFiltered && lastFiltered.eventType !== 'start') {
                    filtered[filtered.length-1] = event;
                  } else {
                    filtered.push(event);
                  }
                } else {
                  filtered.push(event);
                }             
              }
            } else {              
              filtered.push(event);
            }
          }          
          return filtered;
      }
      async complete() {
        let filteredEvents = this.filterEvents(this.#sequence);
        this.addWindowTabInformation(filteredEvents);
        if(this.#sequence.length) {
          try {             
            this.#lastRecording = JSON.stringify(filteredEvents, undefined, 4);
          } catch(e) {
            console.log("Failed to save JSON"+e);
          }    
        }
        chrome.notifications.create("notify", {iconUrl: this.#imagePath + "WebApp-Recorder-128.png", title:"Burp Suite navigation recorder", type:"basic", message:"Your recording has finished and has been copied to your clipboard."});

        for(const winId of this.#windowIds) {
            try {
                await chrome.windows.remove(winId);
            } catch(e) {
                console.log("Could not close window. Already closed.");
            }
        }
        if(this.recordingWindowId > 0) {
            try {
                await chrome.windows.remove(this.recordingWindowId);
            } catch(e){
                console.log("Could not close original recording window. User already closed it.");
            } finally {
                await this.copyToClipboard(this.getLastRecording());
                this.#sequence = [];
                this.removeListeners();
                this.setRecordingState(false);
            }
        }
      }
      removeListeners() {
          chrome.tabs.onCreated.removeListener(this.tabCreatedListener);
          chrome.windows.onCreated.removeListener(this.windowCreatedListener);
          chrome.windows.onRemoved.removeListener(this.windowRemovedListener);
          chrome.webNavigation.onDOMContentLoaded.removeListener(this.tabListener);
          chrome.webNavigation.onBeforeNavigate.removeListener(this.manualUrlListener);
          chrome.webNavigation.onCommitted.removeListener(this.manualUrlListener);
      }
}

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