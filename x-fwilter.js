// ==UserScript==
// @name         X-Fwilter
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Filter away retweets, self-retweets, videos, images, texts, ..
// @author       TheFeThrone
// @match        https://x.com/*
// @exclude      *://x.com/i/*
// @exclude      *://x.com/hashtag/*
// @exclude      *://x.com/notifications/*
// @exclude      *://x.com/settings/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=x.com
// @run-at       document-start
// @resource retweet https://raw.githubusercontent.com/TheFeThrone/X-Fwilter/refs/heads/main/icons/retweet.svg
// @resource selftweet https://raw.githubusercontent.com/TheFeThrone/X-Fwilter/refs/heads/main/icons/selfretweet.svg
// @resource video https://raw.githubusercontent.com/TheFeThrone/X-Fwilter/refs/heads/main/icons/film.svg
// @resource image https://raw.githubusercontent.com/TheFeThrone/X-Fwilter/refs/heads/main/icons/image.svg
// @resource text https://raw.githubusercontent.com/TheFeThrone/X-Fwilter/refs/heads/main/icons/book.svg
// @grant        GM_addStyle
// @grant        GM_getResourceURL
// @downloadURL https://update.greasyfork.org/scripts/555162/X-Fwilter.user.js
// @updateURL https://update.greasyfork.org/scripts/555162/X-Fwilter.meta.js
// ==/UserScript==

(async function() {
    'use strict';

    // --- CONSTANTS & CONFIG ---

    const FILTERS = {
        Retweet: 'retweet',
        Selftweet: 'selftweet',
        Video: 'video',
        Image: 'image',
        Text: 'text'
    };

    const ICONS = {
        retweet: GM_getResourceURL("retweet"),
        selftweet: GM_getResourceURL("selftweet"),
        video: GM_getResourceURL("video"),
        image: GM_getResourceURL("image"),
        text: GM_getResourceURL("text")
    };

    const FILTER_ICON_MAP = {
        Retweet: 'retweet',
        Selftweet: 'selftweet',
        Video: 'video',
        Image: 'image',
        Text: 'text'
    };

    // --- STYLE MANAGEMENT ---
    let stylesInjected = false;

    function setupStyles() {
        if (stylesInjected) return;
        stylesInjected = true;
        GM_addStyle(`
            .fwilter-wrapper {
                display: flex;
                flex-direction: column;
                align-items: center;
                // position: sticky;
                // display: grid;
                position: fixed;
                gap: 0.5em;
                left: 0;
                top: 5em;
            }
            #fwilter {
                display: flex;
            }
            #fwilter > div { margin: 0 8px; position: relative; } /* Added position relative */
            #fwilter input[type="checkbox"] { display: none; }

            #fwilter input[type="checkbox"] + label {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
                border: 1px solid #cfd9de;
                border-radius: 50%;
                cursor: pointer;
                transition: background-color 0.2s ease;
            }

            #fwilter input[type="checkbox"] + label::before {
                content: '';
                width: 20px;
                height: 20px;
                background-color: #c8a2c8;
                mask-image: var(--fwilter-visible-svg);
                mask-size: contain;
                mask-position: center;
                mask-repeat: no-repeat;
            }
            #fwilter input[type="checkbox"]:checked + label::before {
                background-color: #E0245E;
            }

            #fwilter input[type="checkbox"] + label:hover::before {
                background-color: violet;
            }
        `);

        // Inject icon definitions into the page
        let iconVariablesCSS = ':root {\n';
        for (const key in ICONS) {
            iconVariablesCSS += `    --icon-${key}-visible: url("${ICONS[key]}");\n`;
        }
        iconVariablesCSS += '}';
        const iconStyleElement = document.createElement('style');
        iconStyleElement.id = 'fwilter-icon-definitions';
        iconStyleElement.textContent = iconVariablesCSS;
        document.head.appendChild(iconStyleElement);
    }

    let dynamicStyleElement = null;
    function updateFilterStyles() {
        let cssToApply = '';

        const wrapper = document.querySelector('#fwilter');
        const videoChecked = document.getElementById('Video')?.checked;
        const imageChecked = document.getElementById('Image')?.checked;

        for (const [checkboxId, filterType] of Object.entries(FILTERS)) {
            const checkbox = document.getElementById(checkboxId);
            if (!checkbox || !checkbox.checked) continue;

            // Special handling for video
            if (filterType === 'video' && !imageChecked) {
                cssToApply += `
                [data-testid="cellInnerDiv"][fwilter-types~="video"]:not([fwilter-types~="image"]) { display: none; }\n`;
                continue;
            }

            // Special handling for image
            if (filterType === 'image' && !videoChecked) {
                cssToApply += `
                [data-testid="cellInnerDiv"][fwilter-types~="image"]:not([fwilter-types~="video"]) { display: none; }\n`;
                continue;
            }

            // Default behaviour (retweet, selftweet, text, and also
            // video/image when both are checked)
            cssToApply += `
            [data-testid="cellInnerDiv"][fwilter-types~="${filterType}"]
            { display: none; }\n`;
        }
        if (!dynamicStyleElement) {
            dynamicStyleElement = document.createElement('style');
            dynamicStyleElement.id = 'fwilter-dynamic-rules';
            document.head.appendChild(dynamicStyleElement);
        }
        dynamicStyleElement.textContent = cssToApply;
    }


    // --- UTILITY FUNCTIONS ---

    /**
     * Waits for a specific element to appear in the DOM.
     * @param {string} selector - The CSS selector for the element.
     * @returns {Promise<Element>}
     */
    function waitForElement(selector, base=document) {
        return new Promise(resolve => {
            if (base.querySelector(selector)) {
                return resolve(base.querySelector(selector));
            }

            const observer = new MutationObserver(() => {
                if (base.querySelector(selector)) {
                    resolve(base.querySelector(selector));
                    observer.disconnect();
                }
            });

            observer.observe(base, {
                subtree: true,
                childList: true,
            });
        });
    }

    async function waitForMedia(tweetMedia) {
        return new Promise(resolve => {
            if (tweetMedia.querySelector('video, img')) return resolve();

            const observer = new MutationObserver(() => {
                if (tweetMedia.querySelector('video, img')) {
                    observer.disconnect();
                    resolve();
                }
            });

            observer.observe(tweetMedia, { childList: true, subtree: true });
        });
    }

    /**
     * Finds tweet that is self-repost.
     * @param {HTMLElement} tweet - The tweet element.
     * @returns {boolean} - True if the tweet was hidden.
     */
    function isSelftweet(tweet) {
        const poster = tweet.querySelector('[data-testid="User-Name"] span span')?.textContent;
        const reposter = tweet.querySelector('[data-testid="socialContext"] span')?.textContent;
        if (poster && reposter && reposter.trim() === poster.trim()) {
            return true;
        }
        return false;
    }
    function isRetweet(tweet) {
        const retweet = tweet.querySelector('[data-testid="socialContext"] span')?.textContent;
        if (retweet) {
            return true;
        }
        return false;
    }

    // --- TWEET PROCESSING ---
    /**
     * Main processing function for each tweet.
     * @param {HTMLElement} tweet - The tweet element.
     */
    async function processTweet(tweet) {
        const types = [];

        if (isSelftweet(tweet)) {
            types.push('selftweet', 'retweet');
        } else if (isRetweet(tweet)) {
            types.push('retweet');
        }

        const tweetText = tweet.querySelector('div[data-testid="tweetText"]');
        const tweetMedia = tweet.querySelector('div[data-testid="tweetPhoto"]').closest('[aria-labelledby]');
        if(tweetText && !tweetMedia) {
            types.push('text');
            tweet.setAttribute('fwilter-types', types.join(' '));
            return;
        }

        if (tweetMedia) await waitForMedia(tweetMedia);

        const hasVideo = tweetMedia?.querySelector('video, [data-testid="previewInterstitial"], [alt="Embedded video"]');
        const hasImage = tweetMedia?.querySelector('img:not([src*="profile_images"], [alt="Embedded video"])');

        if (hasVideo) types.push('video');
        if (hasImage) types.push('image');
        if (!hasVideo && !hasImage) types.push('text');

        tweet.setAttribute('fwilter-types', types.join(' '));
    }

    async function processExisting(){
        const timeline = await getTimeline();
        const first = await waitForElement('[data-testid="cellInnerDiv"]', timeline);
        if (first) {
            const tweets = document.querySelectorAll('[data-testid="cellInnerDiv"]:not([fwilter-types])');

            if(tweets.length==0) return;

            for (const tweet of tweets) {
                await processTweet(tweet);
            }
        } else {
            return;
        }
    }

    async function createUI() {
        const timeline = await getTimeline();
        const uiBase = await waitForElement('.TimelineTabs, [data-testid="primaryColumn"] .css-175oi2r.r-1awozwy.r-18u37iz.r-h3s6tt.r-1777fci.r-f8sm7e.r-13qz1uu.r-gu64tb');
        const finalBase = document.querySelector('[role="banner"]')
        if (!uiBase) console.log("not found uiBase");
        const existingUI = finalBase.querySelector('div#fwilter');
        if (existingUI) {
            console.log("existed UI");
            return;
        }
        // 1. Create a new wrapper for UI
        const flexWrapper = document.createElement('div');
        flexWrapper.className = 'fwilter-wrapper';

        // 2. Create the container for the filter buttons
        const fwilterContainer = document.createElement('div');
        fwilterContainer.id = 'fwilter';
        for (const purpose in FILTERS) {
            createCheckbox(purpose, fwilterContainer);
        }

        flexWrapper.appendChild(fwilterContainer);
        finalBase.appendChild(flexWrapper);

    }

    function createCheckbox(purpose, fwilterContainer) {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = purpose;
        checkbox.addEventListener('change', updateFilterStyles);

        const label = document.createElement("label");
        label.htmlFor = purpose;
        label.title = purpose;

        const iconKey = FILTER_ICON_MAP[purpose];
        if (iconKey) {
            label.style.setProperty('--fwilter-visible-svg', `var(--icon-${iconKey}-visible)`);
        }

        const wrapper = document.createElement("div");
        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);
        fwilterContainer.appendChild(wrapper);
    }
    // --- FILTERING LOGIC ---

    async function init() {
        setupStyles();
        updateFilterStyles();
        await createUI();
        await start();
    }
    const runInit = () => { init(); };

    async function start(){
        clearTimers();
        disconnectObservers();

        initTimeoutId = setTimeout( async () => {
            const timeline = await getTimeline();
            if (timeline) {
                feedObserver.observe(document.body, { childList: true, subtree: true });
                unprocessedIntervalId = setInterval(processExisting, 500);
            }
        }, 1000);
    }

    let unprocessedIntervalId = null;
    let initTimeoutId = null;
    let observedTweets = [];

    function clearTimers(){
        if (unprocessedIntervalId) clearInterval(unprocessedIntervalId);
        if (initTimeoutId) clearTimeout(initTimeoutId);
    }

    function disconnectObservers(){
        feedObserver.disconnect();
        if (observedTweets.length != 0) {
            observedTweets.forEach( tweet => unobserveTweet(tweet) );
        }
        tweetObserver.disconnect();
    }

    function unobserveTweet(tweet){
        tweetObserver.unobserve(tweet);
        const index = observedTweets.indexOf(tweet);
        if (index > -1) { observedTweets.splice(index, 1); }
    }
    function observeTweet(tweet){
        observedTweets.push(tweet);
        tweetObserver.observe(tweet);
    }

    // X-Navigation Override
    function overrideXNav(){
        const pushStateOrig = history.pushState;
        const replaceStateOrig = history.replaceState;
        history.pushState = function(...args) {
            pushStateOrig.apply(this, args);
            console.log("pushState");
            runInit();
        }
        history.replaceState = function(...args) {
            replaceStateOrig.apply(this, args);
            console.log("replaceState");
            runInit();
        }
        window.addEventListener('popstate', runInit);
    }

    // --- OBSERVERS ---
    const tweetObserver = new IntersectionObserver(async (entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const tweet = entry.target;
            await processTweet(tweet);
            unobserveTweet(tweet);
        }
    }, { root: null, rootMargin: "5px 0px" });

    const feedObserver = new MutationObserver(async (mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) {
                    const tweets =
                          node.matches('[data-testid="cellInnerDiv"]') ? [node] :
                          node.querySelectorAll('[data-testid="cellInnerDiv"]');

                    if(tweets.length==0) continue;
                    for (const tweet of tweets) {
                        observeTweet(tweet);
                    }
                }
            }
        }
    });

    async function getTimeline(){
        return await waitForElement('[aria-label*="Timeline"]');
    }

    overrideXNav();

    await init();
})();
