# Synthetic notebook migration

All files in this directory are independently authored synthetic examples, released under this project's MIT license. No historical item, institution, collection metadata, image bytes or third-party fixture is included. `archive.example.org` is an example domain; comparison never contacts it.

- `baseline/book.json`: Presentation 2.1, two pages, English/French titles and descriptions, CC0 rights and explicit attribution.
- `candidate/book.json`: equivalent supported Presentation 3.0 meaning.
- `candidate/book-loss.json`: deliberately loses the French description and second page.
- `pairs-clean.json` / `pairs-loss.json`: alternate explicit one-item release inventories.
- `policy-empty.json`: a versioned starting policy with no URI rules or accepted changes.

```sh
npm run cli -- compare examples/baseline/book.json examples/candidate/book.json
npm run cli -- batch examples/pairs-loss.json --format html --output notebook-review.html
```

The first should exit `0`; the damaged comparison should exit `2`. Its report explains the losses. See [the CLI guide](../docs/cli.md) for export, review, inventory and CI workflows.
