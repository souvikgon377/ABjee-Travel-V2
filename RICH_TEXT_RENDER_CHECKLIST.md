# Rich Text Rendering Regression Checklist

Use this checklist after rich text editor or display changes.

## Admin editor checks

- Create formatted text in Introduction and Travel Itinerary using:
  - Bold, italic, underline
  - Bulleted list and numbered list
  - Heading levels (H1 to H3 at minimum)
  - Text color and highlight color
  - Text size changes on selected words
- Paste formatted content from ChatGPT and confirm formatting is preserved.
- Save the record and reopen the same admin form.
- Confirm formatting still appears correctly in editor.

## Client page checks

- Open Travel Itinerary client page for the updated record.
- Confirm Introduction renders formatted HTML (not flattened text).
- Confirm Travel Itinerary renders formatted HTML, including lists and headings.
- Confirm Itinerary Overview renders formatting if overview is rich text.
- Confirm card/list previews remain plain text without raw HTML tags.

## Tourist places checks

- Open Tour Places list cards and detail modal for a place with rich description.
- Confirm rich formatting appears correctly in both card preview and detail modal.
- Confirm no script/style injection appears from pasted HTML.

## Keyboard and browser checks

- Verify in Chrome and Edge at minimum.
- Verify mobile viewport (list markers, heading spacing, line wraps).

## Safety checks

- Confirm unsupported tags are not rendered.
- Confirm unsupported inline CSS properties are removed.
- Confirm zero-width characters are not visibly breaking layout.
