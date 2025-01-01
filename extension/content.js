"use strict";

// Create the toggle button
const toggleButton = document.createElement("button");
toggleButton.id = "toggle-ui-button";
toggleButton.innerText = "Toggle UI";
document.body.appendChild(toggleButton);

// Create the UI
const ui = document.createElement("div");
ui.id = "custom-ui";
ui.innerHTML = `
    <input type="file" id="image-upload" accept="image/*" placeholder="Upload an image">
    <button id="apply-button">Apply Background</button>
`;
document.body.appendChild(ui);

// Toggle UI visibility
toggleButton.addEventListener("click", function () {
    if (ui.style.display === "none") {
        ui.style.display = "block";
    } else {
        ui.style.display = "none";
    }
});

// Function to set the background image of a button
function setButtonBackground(button, imageBase64) {
    button.style.backgroundImage = `url(${imageBase64})`;
    button.style.backgroundSize = "cover";
    button.style.backgroundPosition = "center";
}

// Function to process "Reply" buttons
function processReplyButtons(imageBase64) {
    const buttons = document.querySelectorAll("button");
    buttons.forEach((button) => {
        if (button.innerText === "Reply") {
            setButtonBackground(button, imageBase64);
        }
    });
}

// Handle image upload
document.getElementById("image-upload").addEventListener(
    "change",
    function (event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                const base64Image = e.target.result;
                chrome.storage.local.set({
                    replyButtonBackground: base64Image,
                });
                processReplyButtons(base64Image);
            };
            reader.readAsDataURL(file);
        }
    },
);

// Apply the background from storage on page load
chrome.storage.local.get(["replyButtonBackground"], function (result) {
    if (result.replyButtonBackground) {
        processReplyButtons(result.replyButtonBackground);
    }
});

// Set up a MutationObserver to watch for DOM changes
const observer = new MutationObserver(function (mutationsList) {
    for (const mutation of mutationsList) {
        if (mutation.type === "childList" || mutation.type === "subtree") {
            chrome.storage.local.get(
                ["replyButtonBackground"],
                function (result) {
                    if (result.replyButtonBackground) {
                        processReplyButtons(result.replyButtonBackground);
                    }
                },
            );
        }
    }
});

// Start observing the document body for changes
observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false,
});
