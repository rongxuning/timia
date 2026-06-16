## Goal

On `http://localhost:3000/member`, add a copy button next to each user email so users can click to copy the email address.

## Scope

- Only affects the system-wide Member list page (`codes/web/app/(app)/member/page.tsx`).
- Add a small icon button next to the rendered `({email})`.
- No toast; feedback is shown via the button’s own icon/title state.

## UX / Interaction

- **Default**
  - Icon: `content_copy`
  - Tooltip/title: `复制邮箱`
  - `aria-label`: `复制邮箱 ${email}`
- **Success**
  - Copy the email string to clipboard
  - Icon switches to `done` for ~1s, then resets
  - Tooltip/title becomes `已复制` during that ~1s
- **Failure**
  - Icon switches to `error` for ~1s, then resets
  - Tooltip/title becomes `复制失败` during that ~1s

## Implementation Approach

- Use `navigator.clipboard.writeText(email)` when available.
- Fallback to a hidden `<textarea>` + `document.execCommand("copy")` if clipboard API fails or is unavailable.
- Keep per-user UI feedback state local to each row (so copying one user doesn’t affect others).

## Accessibility

- Copy button is a `<button type="button">` (keyboard accessible).
- Includes `aria-label` that contains the email.
- Uses `title` attribute for basic tooltip in browsers.

## Non-goals

- No changes to member/workspace membership pages other than `/member`.
- No cross-page shared “copy” component unless an existing one already exists in the codebase.

## Test Plan

- Visit `/member` and verify each row shows a copy icon next to the email.
- Click copy icon:
  - Email is copied (paste into input to confirm)
  - Icon changes to `done` briefly then resets
- In a restricted clipboard environment (simulate by forcing error), verify `error` icon briefly then resets.

