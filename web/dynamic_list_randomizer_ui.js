// js/dynamic_randomizer.js
import { app } from "../../scripts/app.js";

const LIBRARY_API = "/dynamic_list_randomizer/library";

// --- Library modal (one shared DOM overlay per node instance) -------------

function buildLibraryModal(node) {
    if (node._libraryModal) return node._libraryModal;

    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0,0,0,0.6); z-index: 10000; display: none;
        align-items: center; justify-content: center;
    `;

    const panel = document.createElement("div");
    panel.style.cssText = `
        background: #1e1e1e; border: 1px solid #444; border-radius: 6px;
        width: 420px; max-height: 70vh; display: flex; flex-direction: column;
        padding: 12px; gap: 8px; box-sizing: border-box;
    `;

    const header = document.createElement("div");
    header.style.cssText = "display:flex;justify-content:space-between;align-items:center;";
    const titleEl = document.createElement("strong");
    titleEl.textContent = "Card Library";
    titleEl.style.color = "#fff";
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = "background:#a94442;color:#fff;border:none;border-radius:3px;width:22px;height:22px;cursor:pointer;";
    closeBtn.onclick = () => { overlay.style.display = "none"; };
    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    const listEl = document.createElement("div");
    listEl.style.cssText = "overflow-y:auto;display:flex;flex-direction:column;gap:6px;flex:1 1 auto;min-height:0;";

    panel.appendChild(header);
    panel.appendChild(listEl);
    overlay.appendChild(panel);

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.style.display = "none";
    });

    document.body.appendChild(overlay);

    node._libraryModal = { overlay, listEl };
    return node._libraryModal;
}

function buildLibraryRow(node, entry) {
    const row = document.createElement("div");
    row.style.cssText = "position:relative;border:1px solid #444;border-radius:4px;padding:8px;background:#2a2a2a;display:flex;flex-direction:column;gap:4px;";

    const top = document.createElement("div");
    top.style.cssText = "display:flex;justify-content:space-between;align-items:center;";

    const titleEl = document.createElement("span");
    titleEl.textContent = entry.title || "(untitled)";
    titleEl.style.cssText = "color:#fff;font-weight:bold;";

    const delBtn = document.createElement("button");
    delBtn.textContent = "🗑";
    delBtn.title = "Delete from library";
    delBtn.style.cssText = "background:#a94442;color:#fff;border:none;border-radius:3px;width:22px;height:22px;cursor:pointer;";
    delBtn.onclick = async () => {
        if (!confirm(`Delete "${entry.title}" from the library? This can't be undone.`)) return;
        try {
            const res = await fetch(`${LIBRARY_API}/${entry.id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Server returned " + res.status);
            refreshLibrary(node);
        } catch (err) {
            alert("Failed to delete: " + err.message);
        }
    };

    top.appendChild(titleEl);
    top.appendChild(delBtn);

    const items = (entry.text || "").split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    const preview = document.createElement("div");
    preview.textContent = `${items.length} item${items.length === 1 ? "" : "s"} • ${entry.rand_type || "random"}`;
    preview.style.cssText = "color:#aaa;font-size:11px;";

    const loadBtn = document.createElement("button");
    loadBtn.textContent = "Load into node";
    loadBtn.style.cssText = "padding:5px;cursor:pointer;background:#2e6da4;color:#fff;border:none;border-radius:3px;font-size:12px;";
    loadBtn.onclick = () => {
        node.createCard?.(entry.title, entry.text, entry.rand_type);
        node._libraryModal.overlay.style.display = "none";
    };

    row.appendChild(top);
    row.appendChild(preview);
    row.appendChild(loadBtn);
    return row;
}

async function refreshLibrary(node) {
    const { listEl } = buildLibraryModal(node);
    listEl.innerHTML = "";
    const loading = document.createElement("div");
    loading.textContent = "Loading...";
    loading.style.color = "#999";
    listEl.appendChild(loading);

    try {
        const res = await fetch(LIBRARY_API);
        if (!res.ok) throw new Error("Server returned " + res.status);
        const entries = await res.json();
        listEl.innerHTML = "";

        if (!entries.length) {
            const empty = document.createElement("div");
            empty.textContent = "No saved cards yet. Use the save icon on a card to add one.";
            empty.style.cssText = "color:#999;font-size:12px;";
            listEl.appendChild(empty);
            return;
        }

        entries.sort((a, b) => (b.saved_at || 0) - (a.saved_at || 0));
        entries.forEach(entry => listEl.appendChild(buildLibraryRow(node, entry)));
    } catch (err) {
        listEl.innerHTML = "";
        const errEl = document.createElement("div");
        errEl.textContent = "Failed to load library: " + err.message;
        errEl.style.cssText = "color:#e07070;font-size:12px;";
        listEl.appendChild(errEl);
    }
}

function toolbarBtn(text, title, bg) {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.title = title;
    btn.style.cssText = `background:${bg};color:#fff;border:none;border-radius:3px;width:24px;height:22px;cursor:pointer;font-size:12px;`;
    return btn;
}

app.registerExtension({
    name: "Comfy.DynamicListRandomizer",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "DynamicListRandomizer") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (onNodeCreated) onNodeCreated.apply(this, arguments);

            const node = this;
            node.setSize([350, 480]);
            node._undoStack = [];
            node._cardTextRows = 3; // controlled by the size resizer, applied to all cards

            const dataWidget = node.widgets.find(w => w.name === "cards_data");
            if (dataWidget) {
                dataWidget.computeSize = () => [0, -4];
                dataWidget.type = "converted-widget";
                const el = dataWidget.inputEl || dataWidget.element;
                if (el) {
                    el.style.display = "none";
                    el.style.pointerEvents = "none";
                }
            }

            // Outer DOM widget root: holds the card "window" panel + Add button.
            const container = document.createElement("div");
            container.style.display = "flex";
            container.style.flexDirection = "column";
            container.style.gap = "8px";
            container.style.height = "360px";
            container.style.maxHeight = "360px";
            container.style.overflow = "hidden";
            container.style.padding = "5px";
            container.style.boxSizing = "border-box";
            container.style.contain = "layout size";

            // The card list's own bordered "window", visually distinct from the node.
            const panel = document.createElement("div");
            panel.style.cssText = `
                display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0;
                border: 1px solid #555; border-radius: 6px; overflow: hidden;
                background: #161616; box-shadow: inset 0 1px 4px rgba(0,0,0,0.6);
            `;

            // Mini toolbar for the panel: label, card-size resizer, undo, library.
            const toolbar = document.createElement("div");
            toolbar.style.cssText = `
                display: flex; align-items: center; justify-content: space-between;
                background: #2a2a2a; padding: 4px 8px; gap: 6px;
                border-bottom: 1px solid #444; flex: 0 0 auto;
            `;

            const toolbarLabel = document.createElement("span");
            toolbarLabel.textContent = "Cards";
            toolbarLabel.style.cssText = "color:#ccc;font-size:11px;font-weight:bold;";

            const rightGroup = document.createElement("div");
            rightGroup.style.cssText = "display:flex;align-items:center;gap:6px;";

            const sizeLabel = document.createElement("span");
            sizeLabel.textContent = "Size";
            sizeLabel.style.cssText = "color:#999;font-size:10px;margin-right:2px;";

            const sizeMinus = toolbarBtn("−", "Smaller cards", "#444");
            const sizePlus = toolbarBtn("+", "Larger cards", "#444");
            sizeMinus.onclick = () => {
                node._cardTextRows = Math.max(2, node._cardTextRows - 1);
                node.cardsContainer.querySelectorAll(".card-text").forEach(ta => { ta.rows = node._cardTextRows; });
            };
            sizePlus.onclick = () => {
                node._cardTextRows = Math.min(10, node._cardTextRows + 1);
                node.cardsContainer.querySelectorAll(".card-text").forEach(ta => { ta.rows = node._cardTextRows; });
            };

            const undoBtn = toolbarBtn("↺", "Undo last card removal", "#555");
            const updateUndoBtnState = () => {
                const hasUndo = node._undoStack.length > 0;
                undoBtn.style.backgroundColor = hasUndo ? "#8a6d1f" : "#555";
                undoBtn.disabled = !hasUndo;
            };
            undoBtn.onclick = () => node.performUndo?.();

            const libBtn = toolbarBtn("📚", "Open card library", "#2e6da4");
            libBtn.onclick = () => node.openLibrary?.();

            rightGroup.appendChild(sizeLabel);
            rightGroup.appendChild(sizeMinus);
            rightGroup.appendChild(sizePlus);
            rightGroup.appendChild(undoBtn);
            rightGroup.appendChild(libBtn);

            toolbar.appendChild(toolbarLabel);
            toolbar.appendChild(rightGroup);

            node.cardsContainer = document.createElement("div");
            node.cardsContainer.style.display = "flex";
            node.cardsContainer.style.flexDirection = "column";
            node.cardsContainer.style.gap = "8px";
            node.cardsContainer.style.overflowY = "auto";
            node.cardsContainer.style.flex = "1 1 auto";
            node.cardsContainer.style.minHeight = "0";
            node.cardsContainer.style.padding = "8px";
            node.cardsContainer.style.boxSizing = "border-box";

            panel.appendChild(toolbar);
            panel.appendChild(node.cardsContainer);
            container.appendChild(panel);

            const addBtn = document.createElement("button");
            addBtn.textContent = "+ Add List Card";
            addBtn.style.padding = "6px";
            addBtn.style.cursor = "pointer";
            addBtn.style.backgroundColor = "#2e6da4";
            addBtn.style.color = "#fff";
            addBtn.style.border = "none";
            addBtn.style.borderRadius = "3px";
            addBtn.style.flex = "0 0 auto";
            addBtn.onclick = () => createCard();
            container.appendChild(addBtn);

            node.addDOMWidget("cards_ui", "container", container, {
                getValue() {
                    return serializeCards();
                },
                setValue(v) {
                    deserializeCards(v);
                }
            });

            const origOnResize = node.onResize;
            node.onResize = function (size) {
                if (origOnResize) origOnResize.apply(this, arguments);
                const h = Math.max(100, size[1] - 90);
                container.style.height = h + "px";
                container.style.maxHeight = h + "px";
            };

            const forceRedraw = () => {
                requestAnimationFrame(() => {
                    node.onResize?.(node.size);
                    node.setDirtyCanvas(true, true);
                    app.canvas?.setDirty(true, true);
                    const el = dataWidget?.inputEl || dataWidget?.element;
                    if (el) el.style.display = "none";
                });
            };
            document.addEventListener("visibilitychange", forceRedraw);
            window.addEventListener("focus", forceRedraw);

            node.openLibrary = function () {
                const { overlay } = buildLibraryModal(node);
                overlay.style.display = "flex";
                refreshLibrary(node);
            };

            node.performUndo = function () {
                const stack = node._undoStack;
                if (!stack || !stack.length) return;
                const last = stack.pop();
                const children = node.cardsContainer.children;
                const insertBeforeEl = children[last.index] || null;
                createCard(last.title, last.text, last.rand_type, insertBeforeEl);
                updateUndoBtnState();
            };

            const origOnRemoved = node.onRemoved;
            node.onRemoved = function () {
                document.removeEventListener("visibilitychange", forceRedraw);
                window.removeEventListener("focus", forceRedraw);
                node._libraryModal?.overlay?.remove();
                if (origOnRemoved) origOnRemoved.apply(this, arguments);
            };

            function serializeCards() {
                const cards = [];
                const cardNodes = node.cardsContainer.children;
                for (let card of cardNodes) {
                    cards.push({
                        title: card.querySelector(".card-title").value,
                        text: card.querySelector(".card-text").value,
                        rand_type: card.querySelector(".card-rand").value
                    });
                }
                const serializedStr = JSON.stringify(cards);
                if (dataWidget) {
                    dataWidget.value = serializedStr;
                }
                return serializedStr;
            }

            const origOnExecutionStart = node.onExecutionStart;
            node.onExecutionStart = function () {
                if (origOnExecutionStart) origOnExecutionStart.apply(this, arguments);
                serializeCards();
            };

            function deserializeCards(dataStr) {
                node.cardsContainer.innerHTML = "";
                try {
                    const cards = JSON.parse(dataStr || "[]");
                    if (cards.length === 0) {
                        createCard("position", "squatting\nstanding\nsitting");
                    } else {
                        cards.forEach(c => createCard(c.title, c.text, c.rand_type));
                    }
                } catch (e) {
                    createCard("position", "squatting\nstanding\nsitting");
                }
            }

            // Checks the library for an existing card with the same title.
            // Returns the matching entry, or null.
            async function findExistingLibraryEntry(title) {
                const res = await fetch(LIBRARY_API);
                if (!res.ok) throw new Error("Server returned " + res.status);
                const entries = await res.json();
                const normalized = (title || "").trim().toLowerCase();
                return entries.find(e => (e.title || "").trim().toLowerCase() === normalized) || null;
            }

            // insertBeforeEl (optional): used by undo to restore original position
            function createCard(title = "", text = "", randType = "random", insertBeforeEl = null) {
                const card = document.createElement("div");
                card.style.position = "relative";
                card.style.border = "1px solid #444";
                card.style.borderRadius = "4px";
                card.style.padding = "8px";
                card.style.backgroundColor = "#1e1e1e";
                card.style.display = "flex";
                card.style.flexDirection = "column";
                card.style.gap = "5px";

                const header = document.createElement("div");
                header.style.display = "flex";
                header.style.justifyContent = "space-between";
                header.style.alignItems = "center";

                const titleInput = document.createElement("input");
                titleInput.type = "text";
                titleInput.placeholder = "Title (e.g. position)";
                titleInput.value = title;
                titleInput.className = "card-title";
                titleInput.style.flex = "1";
                titleInput.style.marginRight = "5px";
                titleInput.style.backgroundColor = "#2a2a2a";
                titleInput.style.color = "#fff";
                titleInput.style.border = "1px solid #555";
                titleInput.style.padding = "3px";
                titleInput.style.borderRadius = "3px";

                // Save icon: saves to the library, updating an existing entry
                // with the same title instead of creating a duplicate.
                const saveBtn = document.createElement("button");
                saveBtn.textContent = "💾";
                saveBtn.title = "Save this card to the library";
                saveBtn.style.cssText = "background:#3a8f5c;color:#fff;border:none;border-radius:3px;width:22px;height:22px;cursor:pointer;margin-right:4px;";
                saveBtn.onclick = async () => {
                    const payload = {
                        title: titleInput.value.trim() || "Untitled",
                        text: textArea.value,
                        rand_type: selectRand.value,
                    };
                    const original = saveBtn.textContent;
                    saveBtn.disabled = true;
                    saveBtn.textContent = "…";
                    try {
                        const existing = await findExistingLibraryEntry(payload.title);

                        if (existing) {
                            const proceed = confirm(
                                `A saved card titled "${payload.title}" already exists in the library.\n\n` +
                                `Update it with your current changes? This will overwrite its saved items and mode.`
                            );
                            if (!proceed) {
                                saveBtn.textContent = original;
                                saveBtn.disabled = false;
                                return;
                            }
                            const res = await fetch(`${LIBRARY_API}/${existing.id}`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(payload),
                            });
                            if (!res.ok) throw new Error("Server returned " + res.status);
                        } else {
                            const res = await fetch(LIBRARY_API, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(payload),
                            });
                            if (!res.ok) throw new Error("Server returned " + res.status);
                        }
                        saveBtn.textContent = "✓";
                    } catch (err) {
                        alert("Failed to save card: " + err.message);
                        saveBtn.textContent = original;
                    } finally {
                        setTimeout(() => { saveBtn.textContent = original; saveBtn.disabled = false; }, 800);
                    }
                };

                const removeBtn = document.createElement("button");
                removeBtn.textContent = "−";
                removeBtn.style.backgroundColor = "#a94442";
                removeBtn.style.color = "#fff";
                removeBtn.style.border = "none";
                removeBtn.style.borderRadius = "3px";
                removeBtn.style.width = "22px";
                removeBtn.style.height = "22px";
                removeBtn.style.cursor = "pointer";
                removeBtn.onclick = () => {
                    const idx = Array.from(node.cardsContainer.children).indexOf(card);
                    node._undoStack.push({
                        title: titleInput.value,
                        text: textArea.value,
                        rand_type: selectRand.value,
                        index: idx,
                    });
                    card.remove();
                    serializeCards();
                    updateUndoBtnState();
                };

                header.appendChild(titleInput);
                header.appendChild(saveBtn);
                header.appendChild(removeBtn);

                const textArea = document.createElement("textarea");
                textArea.placeholder = "Paste items here (one per line)...";
                textArea.value = text;
                textArea.className = "card-text";
                textArea.rows = node._cardTextRows;
                textArea.style.backgroundColor = "#2a2a2a";
                textArea.style.color = "#fff";
                textArea.style.border = "1px solid #555";
                textArea.style.resize = "vertical";
                textArea.style.borderRadius = "3px";

                const footer = document.createElement("div");
                footer.style.display = "flex";
                footer.style.justifyContent = "space-between";
                footer.style.alignItems = "center";

                const counter = document.createElement("span");
                counter.style.fontSize = "11px";
                counter.style.color = "#aaa";

                function updateCount() {
                    const lines = textArea.value.split("\n").filter(l => l.trim().length > 0);
                    counter.textContent = `Total: ${lines.length} items`;
                }

                textArea.addEventListener("input", () => {
                    updateCount();
                    serializeCards();
                });
                titleInput.addEventListener("input", serializeCards);

                const selectRand = document.createElement("select");
                selectRand.className = "card-rand";
                selectRand.style.backgroundColor = "#2a2a2a";
                selectRand.style.color = "#fff";
                selectRand.style.border = "1px solid #555";
                selectRand.style.fontSize = "11px";

                const opts = [
                    { val: "random", label: "Random Pick" },
                    { val: "sequence", label: "Deterministic (Seed Mod)" },
                    { val: "first", label: "First Item" },
                    { val: "last", label: "Last Item" }
                ];
                opts.forEach(o => {
                    const opt = document.createElement("option");
                    opt.value = o.val;
                    opt.textContent = o.label;
                    if (o.val === randType) opt.selected = true;
                    selectRand.appendChild(opt);
                });
                selectRand.onchange = serializeCards;

                footer.appendChild(counter);
                footer.appendChild(selectRand);

                card.appendChild(header);
                card.appendChild(textArea);
                card.appendChild(footer);

                if (insertBeforeEl && node.cardsContainer.contains(insertBeforeEl)) {
                    node.cardsContainer.insertBefore(card, insertBeforeEl);
                } else {
                    node.cardsContainer.appendChild(card);
                }
                updateCount();
                serializeCards();
            }

            node.createCard = createCard;
            updateUndoBtnState();

            createCard("position", "squatting\nstanding\nsitting");
        };
    }
});
