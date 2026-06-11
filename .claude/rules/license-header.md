# License Header Rule

Every `.ts` and `.tsx` source file in this project **must** begin with the following SPDX license header as its very first line:

```
// SPDX-License-Identifier: AGPL-3.0-or-later
```

## When this applies

- Creating a new `.ts` or `.tsx` file
- Editing an existing file that is missing the header — add it before making other changes

## Format

- The header must be the **first line** of the file, with no blank lines before it
- Follow it with a **single blank line** before any imports or code
- Do **not** add a `SPDX-FileCopyrightText` line

## Example

```typescript
// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
...
```
