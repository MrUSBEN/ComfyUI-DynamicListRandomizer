# ComfyUI-DynamicListRandomizer

A ComfyUI node that builds randomized prompt fragments from cards you edit directly in the node. Each card has a title and a list of options; every run picks one option per card and joins them into a string.

## Features

- Add, edit, delete and undo cards in the node UI.
- Each card has a pick mode: `random`, `first`, `last` or `sequence`.
- Options are separated by commas or new lines.
- `combo_count` generates several combinations in one run; the seed is offset per run so each differs.
- A saved card library lets you reuse cards across workflows, with a duplicate-title check.

## Outputs

| Output | Type | Description |
|---|---|---|
| `formatted_string` | STRING (list) | One string per combination, e.g. `Hair = red, Pose = sitting` |
| `selected_list` | LIST (list) | The picked `Title = option` pairs for each combination |

Downstream nodes run once per entry in the lists.

## Install

Copy this folder into `ComfyUI/custom_nodes/` and restart ComfyUI. Find the node under `USBEN > Dynamic List Randomizer`.

The card library is stored in a `library/` folder next to the node and is git-ignored.
