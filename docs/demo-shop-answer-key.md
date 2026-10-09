# Demo shop — answer key

The demo shop ("Pine & Pebble") is a small store we built as a test target. It has **9 deliberately planted bugs** in signup, cart and checkout, plus a few harmless annoyances that a good tester must *not* report. This page lists all of them, so you can check a test-badger report against the truth yourself.

All bugs are switched on in the live demo. Their code is in `demo-shop/shop/` (search for `bug_enabled("B…")`).

## Planted bugs

| ID | Area | Bug | How it shows | Expected behavior | Found by scenario |
|----|------|-----|--------------|-------------------|-------------------|
| **B1** | Signup | Invalid email accepted | `anna@` creates an account | Error "Enter a valid email" | R3 |
| **B2** | Signup | Password confirmation not checked | Two different passwords create an account | Error "Passwords don't match" | R4 |
| **B3** | Signup | Duplicate email shows fake success | Signing up again with the same email shows "Welcome!", but no new account exists and logging in with the new password fails | Error "An account with this email already exists" | R5 |
| **B4** | Signup | Empty name crashes the server | Submitting with an empty Full name returns a 500 error page | Inline error "Name is required" | R2 |
| **B5** | Cart | Remove button does nothing | Clicking "Remove" has no effect; the console shows `ReferenceError: removeLine is not defined` | Item disappears, totals update | ST3 |
| **B6** | Cart | Zero / negative quantity accepted | Quantity `-2` gives a negative total | Minimum quantity 1, or item removed at 0 | ST2 |
| **B7** | Cart | Expired coupon accepted | `SUMMER24` applies 20 % off | Error "This coupon has expired" | ST4 |
| **B8** | Stock | Out-of-stock item can be bought | Linen Tote Bag (stock 0) can be added and reaches the payment step | "Add to cart" disabled, "Out of stock" shown | ST5 |
| **B9** | Checkout | Postal code with a space silently blocks checkout | Postal code `10 115` keeps "Continue" disabled, no error message | Accept it or show a clear error | ST6 |

B5 is the exact example from the competition brief ("unable to use the delete button to remove an item from the shopping cart").

**Registration test** can find B1–B4. **Store & checkout test** can find B5–B9. **Both** runs the two tests.

## Not bugs (a report of these would be a false alarm)

| ID | What | What the agent should do |
|----|------|--------------------------|
| D1 | Cookie banner on first visit | Accept or dismiss it, continue |
| D2 | Newsletter popup after 4 seconds on product pages | Close it, continue |
| D3 | 1.5 s loading spinner on the catalog | Wait, then continue |
| D4 | "Sale" badge animation | Ignore |
| D5 | Fake CAPTCHA on `/partners/apply` | Stop and report **Blocked** with advice — not a bug, not a bypass |

## Useful test data

| | |
|--|--|
| Valid coupon | `WELCOME10` (10 % off) |
| Expired coupon | `SUMMER24` |
| Out-of-stock product | Linen Tote Bag |

The Store test started from the demo card passes the goal "Valid coupon is WELCOME10, expired coupon is SUMMER24" to the agent: exactly what a shop owner would tell a human tester. Our evaluation used the same goal.

## Our measured results

In our final evaluation (one Registration and one Store run, Hard mode) the agent found **all 9** bugs. Across all **13** evaluation runs, including runs on a bug-free copy of the shop, it reported **0 false findings**. A single run can still differ: now and then a scenario ends *Inconclusive* (the agent says it could not check it, and why) instead of *Bug found*. It never turns into a false *Passed*.
