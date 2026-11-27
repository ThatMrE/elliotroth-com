---
title: The title as it should appear
date: 2026-12-01
shelf: essays
dek: Optional one-line standfirst under the title
excerpt: Optional line for the index; by default it is the dek, the prompt, or the opening
tags: optional, comma, separated
draft: true
---

Copy this file to writing/_src/<slug>.md (the file name becomes the URL:
/writing/<slug>/), write the piece below the second --- line, delete the
draft line when it is ready, then run

    python3 scripts/build_writing.py

It gives the piece the next number, builds its page, and refreshes the
index, the feed, the sitemap and the homepage strip.

shelf is one of: essays, fiction, poetry, field-notes, personal.
A poem (shelf: poetry) is typed as it should break: one line per line, a
blank line between stanzas, no Markdown. Add `book: <key>` if it comes from
a book listed in writing/_src/books.json.
For a story written from a prompt, add a line `prompt: the prompt` up top.
If it first ran somewhere else, add `origin: Medium` and `origin_url: <link>`.

Markdown that works here: ## and ### headings, **bold**, _emphasis_ (drawn
as a highlighter, never italic), [links](https://example.com), > quotes,
- lists, 1. lists, --- for a break, and an image on a line of its own:

![what the image shows](/assets/writing/<slug>/01.jpg "an optional caption")

A muted looping clip works the same way with an .mp4 (put a .jpg of its
first frame beside it as the poster). A YouTube video is a line of its own:

[Video](https://www.youtube-nocookie.com/embed/VIDEO_ID)
