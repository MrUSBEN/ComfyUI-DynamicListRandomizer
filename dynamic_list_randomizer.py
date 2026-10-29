import random
import json
import re
import os
import time
import uuid

# --- Card library storage -------------------------------------------------
# Saved cards live in a dedicated "library" folder next to this file, as a
# single JSON file. This is separate from any individual node's cards_data,
# so cards saved here are reusable across any workflow.

NODE_DIR = os.path.dirname(os.path.abspath(__file__))
LIBRARY_DIR = os.path.join(NODE_DIR, "library")
LIBRARY_FILE = os.path.join(LIBRARY_DIR, "library.json")


def _ensure_library_file():
    os.makedirs(LIBRARY_DIR, exist_ok=True)
    if not os.path.exists(LIBRARY_FILE):
        with open(LIBRARY_FILE, "w", encoding="utf-8") as f:
            json.dump([], f)


def _read_library():
    _ensure_library_file()
    try:
        with open(LIBRARY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _write_library(entries):
    _ensure_library_file()
    with open(LIBRARY_FILE, "w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2, ensure_ascii=False)


def _register_library_routes():
    """Registers the /dynamic_list_randomizer/library API on ComfyUI's
    server. Wrapped defensively so it never breaks node loading if the
    server module changes shape or routes get registered twice (e.g. a
    manager "reload")."""
    try:
        from aiohttp import web
        from server import PromptServer
    except Exception as e:
        print(f"[DynamicListRandomizer] Could not register library API: {e}")
        return

    instance = PromptServer.instance
    if getattr(instance, "_dynamic_list_randomizer_routes_added", False):
        return

    routes = instance.routes

    @routes.get("/dynamic_list_randomizer/library")
    async def get_library(request):
        return web.json_response(_read_library())

    @routes.post("/dynamic_list_randomizer/library")
    async def save_to_library(request):
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)

        title = (data.get("title") or "").strip() or "Untitled"
        text = data.get("text", "")
        rand_type = data.get("rand_type", "random")

        entry = {
            "id": uuid.uuid4().hex,
            "title": title,
            "text": text,
            "rand_type": rand_type,
            "saved_at": time.time(),
        }

        entries = _read_library()
        entries.append(entry)
        _write_library(entries)
        return web.json_response(entry)

    @routes.put("/dynamic_list_randomizer/library/{entry_id}")
    async def update_library_entry(request):
        entry_id = request.match_info.get("entry_id")
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON body"}, status=400)

        entries = _read_library()
        for e in entries:
            if e.get("id") == entry_id:
                e["title"] = (data.get("title") or e.get("title") or "").strip() or "Untitled"
                e["text"] = data.get("text", e.get("text", ""))
                e["rand_type"] = data.get("rand_type", e.get("rand_type", "random"))
                e["saved_at"] = time.time()
                _write_library(entries)
                return web.json_response(e)
        return web.json_response({"error": "not found"}, status=404)

    @routes.delete("/dynamic_list_randomizer/library/{entry_id}")
    async def delete_from_library(request):
        entry_id = request.match_info.get("entry_id")
        entries = _read_library()
        new_entries = [e for e in entries if e.get("id") != entry_id]
        if len(new_entries) == len(entries):
            return web.json_response({"error": "not found"}, status=404)
        _write_library(new_entries)
        return web.json_response({"deleted": entry_id})


    instance._dynamic_list_randomizer_routes_added = True


_register_library_routes()
# --- End card library storage ----------------------------------------------


class DynamicListRandomizer:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                # Placed first so it renders as the top-most widget on the node.
                "combo_count": ("INT", {"default": 1, "min": 1, "max": 1000, "step": 1}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "cards_data": ("STRING", {"default": "[]"}),
            }
        }

    RETURN_TYPES = ("STRING", "LIST")
    RETURN_NAMES = ("formatted_string", "selected_list")
    FUNCTION = "generate_combination"
    CATEGORY = "USBEN"

    # Tells ComfyUI both outputs are lists (one entry per run of combo_count).
    # Any node connected downstream will automatically execute once per
    # item in the list, unless that node opts in to receiving the whole
    # list at once via INPUT_IS_LIST.
    OUTPUT_IS_LIST = (True, True)

    def generate_combination(self, combo_count, seed, cards_data="[]"):
        try:
            cards = json.loads(cards_data)
        except Exception:
            cards = []

        all_formatted = []
        all_selected = []

        for i in range(combo_count):
            # Offset the seed per run so each combo actually differs.
            # "sequence" mode also benefits from this, cycling deterministically.
            run_seed = seed + i
            rng = random.Random(run_seed)
            selected_pairs = []

            for card in cards:
                title = card.get("title", "").strip()
                raw_text = card.get("text", "")
                rand_type = card.get("rand_type", "random")

                items = [item.strip() for item in re.split(r'[,\n]', raw_text) if item.strip()]
                if not items:
                    continue

                total_items = len(items)

                if rand_type == "random":
                    selected_item = rng.choice(items)
                elif rand_type == "first":
                    selected_item = items[0]
                elif rand_type == "last":
                    selected_item = items[-1]
                elif rand_type == "sequence":
                    selected_item = items[run_seed % total_items]
                else:
                    selected_item = rng.choice(items)

                if title:
                    selected_pairs.append(f"{title} = {selected_item}")
                else:
                    selected_pairs.append(selected_item)

            all_formatted.append(", ".join(selected_pairs))
            all_selected.append(selected_pairs)

        return (all_formatted, all_selected)

NODE_CLASS_MAPPINGS = {
    "DynamicListRandomizer": DynamicListRandomizer
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DynamicListRandomizer": "Dynamic List Randomizer"
}
