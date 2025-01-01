// ==UserScript==
// @name         Change Reply Button Background with Settings Integration
// @namespace    http://tampermonkey.net/
// @version      0.9
// @description  Change reply button backgrounds with integration into X/Twitter settings page
// @author       You
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_addStyle
// @require      https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js
// @resource     CROPPER_CSS https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css
// @grant        GM_getResourceText
// ==/UserScript==

(function () {
    "use strict";

    // State management
    const state = {
        observers: [],
        eventListeners: [], // Track event listeners for cleanup
        isSettingsPage: false,
        isReplyGuyPage: false,
        STORAGE_KEY_CROPPED: "replyButtonBackground_cropped",
        STORAGE_KEY_ORIGINAL: "replyButtonBackground_original",
    };

    // A helper to track event listeners so we can remove them on cleanup
    function addTrackedEventListener(element, type, listener) {
        if (!element) return;
        element.addEventListener(type, listener);
        state.eventListeners.push({ element, type, listener });
    }

    // CSS styles
    const STYLES = `
        #settings-image-upload {
            background: rgb(22, 24, 28);
            border: 1px solid rgb(51, 54, 57);
            padding: 12px;
            border-radius: 4px;
            color: rgb(231, 233, 234);
            width: 100%;
            margin: 12px 0;
            cursor: pointer;
        }
        #settings-image-upload:hover {
            border-color: rgb(83, 100, 113);
        }
        .crop-popup {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        .crop-container {
            background: rgb(22, 24, 28);
            padding: 20px;
            border-radius: 16px;
            max-width: 90%;
            max-height: 90%;
        }
        .crop-image-container {
            max-width: 500px;
            max-height: 500px;
            margin: 0 auto;
        }
        .crop-image-container img {
            max-width: 100%;
            max-height: 100%;
        }
        .crop-buttons {
            display: flex;
            justify-content: center;
            gap: 10px;
            margin-top: 20px;
        }
        /* Changed background to white and text to black */
        .crop-button {
            background: #fff;
            color: #000;
            border: none;
            padding: 10px 20px;
            border-radius: 20px;
            cursor: pointer;
            font-weight: bold;
            font-family: TwitterChirp, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }
        .crop-button.cancel {
            background: rgb(51, 54, 57);
            color: white;
        }
       #preview-image {
            width: 100%;
            padding-bottom: 56.25%; /* 16:9 aspect ratio */
            max-width: 500px;
            position: relative;
            border-radius: 8px;
            border: 1px solid rgb(51, 51, 51);
            background-size: contain;
            background-position: center;
            background-repeat: no-repeat;
            margin-bottom: 10px;
        }
        ${GM_getResourceText("CROPPER_CSS")}
    `;

    // Safe localStorage wrapper
    const storage = {
        get: (key) => {
            try {
                return localStorage.getItem(key);
            } catch (error) {
                console.error("Storage read error:", error);
                return null;
            }
        },
        set: (key, value) => {
            try {
                localStorage.setItem(key, value);
                return true;
            } catch (error) {
                console.error("Storage write error:", error);
                return false;
            }
        },
    };

    // Image validation
    const validateImage = (file) => {
        if (!file) {
            return { valid: false, error: "No file selected" };
        }
        if (!file.type.startsWith("image/")) {
            return { valid: false, error: "Please select an image file" };
        }
        if (file.size > 5 * 1024 * 1024) {
            return {
                valid: false,
                error: "Image size should be less than 5MB",
            };
        }
        return { valid: true, error: null };
    };

    // Function to set button background
    function setButtonBackground(button, imageBase64) {
        if (!button || !imageBase64) return;
        if (!button.dataset.originalBackground) {
            button.dataset.originalBackground = button.style.background || "";
        }
        button.style.background = "none";
        button.style.backgroundImage = `url(${imageBase64})`;
        button.style.backgroundSize = "cover";
        button.style.backgroundPosition = "center";
        button.style.backgroundRepeat = "no-repeat";
    }

    // Cleanup function
    function cleanup() {
        try {
            // Disconnect observers
            state.observers.forEach((observer) => {
                try {
                    if (observer && observer.disconnect) observer.disconnect();
                } catch (e) {
                    console.error("Error disconnecting observer:", e);
                }
            });
            state.observers = [];

            // Remove event listeners
            state.eventListeners.forEach(({ element, type, listener }) => {
                try {
                    if (element && element.removeEventListener) {
                        element.removeEventListener(type, listener);
                    }
                } catch (e) {
                    console.error("Error removing event listener:", e);
                }
            });
            state.eventListeners = [];

            // Reset state
            state.isSettingsPage = false;
            state.isReplyGuyPage = false;

            // Remove any existing popups
            const existingPopup = document.querySelector(".crop-popup");
            if (existingPopup) existingPopup.remove();
        } catch (error) {
            console.error("Cleanup error:", error);
        }
    }

    // Function to create crop popup
    function createCropPopup(imageUrl) {
        const popup = document.createElement("div");
        popup.className = "crop-popup";
        popup.innerHTML = `
            <div class="crop-container">
                <div class="crop-image-container">
                    <img src="${imageUrl}" id="crop-image">
                </div>
                <div class="crop-buttons">
                    <button class="crop-button" id="crop-apply">Apply</button>
                    <button class="crop-button cancel" id="crop-cancel">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(popup);
        return popup;
    }

    // Update preview image
    function updatePreviewImage(base64Image) {
        const previewImage = document.getElementById("preview-image");
        if (previewImage && base64Image) {
            previewImage.style.backgroundImage = `url(${base64Image})`;

            // Remove existing re-crop button if it exists
            const existingButton = document.getElementById("re-crop-button");
            if (existingButton) existingButton.remove();

            // Add re-crop button
            const reCropButton = document.createElement("button");
            reCropButton.id = "re-crop-button";
            reCropButton.className = "crop-button";
            reCropButton.textContent = "Re-crop";
            reCropButton.style.marginTop = "10px";
            reCropButton.style.fontFamily =
                "TwitterChirp, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
            previewImage.parentElement.appendChild(reCropButton);

            const handleReCrop = () => {
                const originalImage = storage.get(state.STORAGE_KEY_ORIGINAL);
                if (originalImage) {
                    const popup = createCropPopup(originalImage);
                    const image = popup.querySelector("#crop-image");

                    // Initialize Cropper
                    const cropper = new Cropper(image, {
                        aspectRatio: null,
                        viewMode: 1,
                        dragMode: "move",
                        autoCropArea: 1,
                        restore: false,
                        guides: true,
                        center: true,
                        highlight: false,
                        cropBoxMovable: true,
                        cropBoxResizable: true,
                        toggleDragModeOnDblclick: false,
                    });

                    popup.querySelector("#crop-apply").addEventListener(
                        "click",
                        () => {
                            const canvas = cropper.getCroppedCanvas({
                                width: 400,
                                height: 400,
                            });
                            const croppedImage = canvas.toDataURL("image/png");
                            storage.set(
                                state.STORAGE_KEY_CROPPED,
                                croppedImage,
                            );
                            updatePreviewImage(croppedImage);
                            // Apply to reply buttons
                            processReplyButtons(croppedImage);
                            cropper.destroy();
                            popup.remove();
                        },
                    );

                    popup.querySelector("#crop-cancel").addEventListener(
                        "click",
                        () => {
                            cropper.destroy();
                            popup.remove();
                        },
                    );
                }
            };

            addTrackedEventListener(reCropButton, "click", handleReCrop);
        }
    }

    // Debounced button processing
    const processReplyButtons = _.debounce((imageBase64) => {
        if (!imageBase64) return;
        try {
            // More specific selectors to find reply buttons
            const buttons = document.querySelectorAll(
                'div[role="button"], button',
            );
            buttons.forEach((button) => {
                const buttonText = button.innerText.trim().toLowerCase();
                if (
                    button &&
                    button.isConnected &&
                    (buttonText === "reply" || buttonText === "replying")
                ) {
                    setButtonBackground(button, imageBase64);
                }
            });
        } catch (error) {
            console.error("Error processing reply buttons:", error);
        }
    }, 100); // Reduced debounce time for more frequent updates

    // Handle image upload with cropping
    function handleImageUpload(event) {
        try {
            const file = event.target.files[0];
            if (!file) return;

            const validation = validateImage(file);
            if (!validation.valid) {
                alert(validation.error);
                return;
            }

            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const originalImageUrl = e.target.result;
                    storage.set(state.STORAGE_KEY_ORIGINAL, originalImageUrl);
                    const popup = createCropPopup(originalImageUrl);
                    const image = popup.querySelector("#crop-image");

                    // Initialize Cropper
                    const cropper = new Cropper(image, {
                        aspectRatio: null,
                        viewMode: 1,
                        dragMode: "move",
                        autoCropArea: 1,
                        restore: false,
                        guides: true,
                        center: true,
                        highlight: false,
                        cropBoxMovable: true,
                        cropBoxResizable: true,
                        toggleDragModeOnDblclick: false,
                    });

                    popup.querySelector("#crop-apply").addEventListener(
                        "click",
                        () => {
                            const canvas = cropper.getCroppedCanvas({
                                width: 400,
                                height: 400,
                            });
                            const croppedImage = canvas.toDataURL("image/png");
                            if (
                                storage.set(
                                    state.STORAGE_KEY_CROPPED,
                                    croppedImage,
                                )
                            ) {
                                updatePreviewImage(croppedImage);
                                // Apply to reply buttons
                                processReplyButtons(croppedImage);
                            }
                            cropper.destroy();
                            popup.remove();
                        },
                    );

                    popup.querySelector("#crop-cancel").addEventListener(
                        "click",
                        () => {
                            cropper.destroy();
                            popup.remove();
                        },
                    );
                } catch (error) {
                    console.error("Error processing uploaded image:", error);
                    alert("Error processing image");
                }
            };

            reader.onerror = function () {
                console.error("FileReader error:", reader.error);
                alert("Error reading file");
            };

            reader.readAsDataURL(file);
        } catch (error) {
            console.error("Error in handleImageUpload:", error);
        }
    }

    // Updated HTML string for settings UI (with matching font and H2)
    const uploadHtmlString = `
    <div style="box-sizing: border-box; display: flex; flex-direction: column;">
       <div style="box-sizing: border-box; padding: 16px 0; position: relative; width: 100%;">
          <div style="box-sizing: border-box;">
             <div style="box-sizing: border-box;">
                <div style="box-sizing: border-box; position: relative;">
                   <div style="box-sizing: border-box; display: flex; align-items: center; justify-content: center; flex: 1; padding: 0 16px;">
                      <div style="box-sizing: border-box; flex: 1; flex-basis: 0; flex-shrink: 1;">
                         <div style="box-sizing: border-box;">
                            <h2 dir="ltr" aria-level="2" role="heading" 
                                style="font-family: TwitterChirp, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
                                       font-size: 20px; line-height: 24px; overflow-wrap: break-word; min-width: 0; 
                                       font-weight: 800; color: rgb(231, 233, 234); margin: 0;">
                               <span style="font-family: inherit; overflow-wrap: break-word; min-width: 0;">Replyguy/acc</span>
                            </h2>
                         </div>
                      </div>
                   </div>
                </div>
             </div>
          </div>
       </div>
       <div style="box-sizing: border-box;">
          <div style="box-sizing: border-box; padding: 12px 16px; border-bottom: 1px solid rgb(47, 51, 54); margin-bottom: 12px; gap: 12px;">
             <div style="box-sizing: border-box; display: flex; align-items: flex-start; gap: 12px;">
                <div style="box-sizing: border-box; display: flex; align-items: center; justify-content: center; height: 40px;">
                   <svg viewBox="0 0 24 24" style="width: 24px; height: 24px; fill: currentColor;">
                      <g>
                         <path d="M3 5.5C3 4.119 4.119 3 5.5 3h13C19.881 3 21 4.119 21 5.5v13c0 1.381-1.119 2.5-2.5 2.5h-13C4.119 21 3 19.881 3 18.5v-13zM5.5 5c-.276 0-.5.224-.5.5v9.086l3-3 3 3 5-5 3 3V5.5c0-.276-.224-.5-.5-.5h-13zM19 15.414l-3-3-5 5-3-3-3 3V18.5c0 .276.224.5.5.5h13c.276 0 .5-.224.5-.5v-3.086zM9.75 7C8.784 7 8 7.784 8 8.75s.784 1.75 1.75 1.75 1.75-.784 1.75-1.75S10.716 7 9.75 7z"></path>
                      </g>
                   </svg>
                </div>
                <div style="box-sizing: border-box; flex: 1; display: flex; flex-direction: column;">
                   <input
                      type="file"
                      id="settings-image-upload"
                      accept="image/*"
                      style="
                        width: 100%;
                        opacity: 1;
                        background: none;
                        border: none;
                        color: rgb(239, 243, 244);
                        font-size: 15px;
                        height: 36px;
                        padding: 0;
                      "
                   >
                        <div class="preview" style="margin-top: 16px;">
                        <div
                            id="preview-image"
                            style="
                            display: block;
                            max-width: 100%;
                            max-height: 500px;
                            border-radius: 8px;
                            border: 1px solid rgb(51, 51, 51);
                            background-size: contain;
                            background-position: center;
                            background-repeat: no-repeat;
                            margin-bottom: 10px;
                            "
                        ></div>
                        </div>
                   </div>
                </div>
             </div>
          </div>
       </div>
    </div>`;

    // Create settings UI
    function createSettingsUI(mainContent) {
        try {
            if (!mainContent) return;
            mainContent.innerHTML = uploadHtmlString;
            const fileInput = document.getElementById("settings-image-upload");
            if (fileInput) {
                addTrackedEventListener(fileInput, "change", handleImageUpload);
                // Load any previously cropped image
                const savedImage = storage.get(state.STORAGE_KEY_CROPPED);
                if (savedImage) {
                    updatePreviewImage(savedImage);
                }
            }
        } catch (error) {
            console.error("Error creating settings UI:", error);
            cleanup();
        }
    }

    // Add “ReplyGuy” menu item
    function addReplyGuyMenuItem(menuList, aboutLink) {
        try {
            if (
                !menuList || !aboutLink ||
                document.querySelector('[href="/settings/replyguy"]')
            ) return;

            const replyGuyLink = aboutLink.cloneNode(true);
            replyGuyLink.href = "/settings/replyguy";

            const handleReplyGuyClick = (event) => {
                event.preventDefault();
                cleanup();
                state.isReplyGuyPage = true;
                handleSettingsPage();
            };
            addTrackedEventListener(replyGuyLink, "click", handleReplyGuyClick);

            const spans = replyGuyLink.getElementsByTagName("span");
            for (const span of spans) {
                if (
                    span.textContent.trim().toLowerCase() ===
                        "additional resources"
                ) {
                    span.textContent = "Replyguy/acc";
                    break;
                }
            }

            const helpCenterLink = menuList.querySelector(
                '[href^="https://support"]',
            );
            if (helpCenterLink) {
                menuList.insertBefore(replyGuyLink, helpCenterLink);
            } else {
                // If Help Center link not found, append to the end
                menuList.appendChild(replyGuyLink);
            }
        } catch (error) {
            console.error("Error adding ReplyGuy menu item:", error);
        }
    }

    // Handle settings page
    function handleSettingsPage() {
        if (state.isReplyGuyPage) {
            const section = document.querySelector(
                'section[aria-label="Section details"][role="region"]',
            );
            if (section) {
                section.innerHTML = "";
                createSettingsUI(section);
            }
        } else {
            const menuList = document.querySelector('[role="tablist"]');
            const aboutLink = document.querySelector(
                '[href="/settings/about"]',
            );
            addReplyGuyMenuItem(menuList, aboutLink);
        }
    }

    // History API Interception to detect route changes
    function interceptHistoryAPI() {
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function (...args) {
            const result = originalPushState.apply(this, args);
            window.dispatchEvent(new Event("locationchange"));
            return result;
        };

        history.replaceState = function (...args) {
            const result = originalReplaceState.apply(this, args);
            window.dispatchEvent(new Event("locationchange"));
            return result;
        };

        window.addEventListener("popstate", () => {
            window.dispatchEvent(new Event("locationchange"));
        });
    }

    // Check current page
    function checkCurrentPage() {
        try {
            const path = window.location.pathname;
            const wasReplyGuyPage = state.isReplyGuyPage;

            state.isSettingsPage = path.startsWith("/settings");
            state.isReplyGuyPage = path === "/settings/replyguy";

            if (wasReplyGuyPage && !state.isReplyGuyPage) {
                cleanup();
            }
            if (state.isSettingsPage) {
                handleSettingsPage();
            }
        } catch (error) {
            console.error("Error checking current page:", error);
            cleanup();
        }
    }

    // Initialize
    function initialize() {
        try {
            cleanup();
            GM_addStyle(STYLES);

            // Intercept History API for route change detection
            interceptHistoryAPI();

            // Listen to custom locationchange event
            const locationChangeHandler = () => {
                if (document.body) checkCurrentPage();
                const croppedImage = storage.get(state.STORAGE_KEY_CROPPED);
                // force a short delay before processing
                processReplyButtons(croppedImage);
            };

            addTrackedEventListener(
                window,
                "locationchange",
                locationChangeHandler,
            );

            // MutationObserver for DOM changes (additional safety)
            const mutationObserver = new MutationObserver(() => {
                if (document.body) checkCurrentPage();
                const croppedImage = storage.get(state.STORAGE_KEY_CROPPED);
                if (croppedImage) {
                    processReplyButtons(croppedImage);
                }
            });
            if (document.body) {
                mutationObserver.observe(document.body, {
                    childList: true,
                    subtree: true,
                });
                state.observers.push(mutationObserver);
            }

            // Initial run
            if (document.body) {
                checkCurrentPage();
                const croppedImage = storage.get(state.STORAGE_KEY_CROPPED);
                if (croppedImage) {
                    processReplyButtons(croppedImage);
                }
            }
        } catch (error) {
            console.error("Initialization error:", error);
            cleanup();
        }
    }

    if (document.readyState === "loading") {
        addTrackedEventListener(document, "DOMContentLoaded", initialize);
    } else {
        initialize();
    }
})();
