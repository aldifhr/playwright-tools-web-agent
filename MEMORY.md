# MEMORY.md — ingatan jangka panjang Faray

> Aturan file ini: satu fakta per baris, diawali "- ".
> JANGAN simpan password, API key, token, atau rahasia akun asli di sini.

## Fakta

- sauce-demo login uses #user-name, #password, #login-button
- sauce-demo valid login redirects to /inventory.html
- sauce-demo invalid login error at h3[data-test='error']
- sauce-demo has 6 products on inventory page
- sauce-demo sort dropdown is select.product_sort_container with 4 options
- sauce-demo cart badge is .shopping_cart_badge
- sauce-demo sidebar logout link is #logout_sidebar_link
- sauce-demo has user types: standard_user, locked_out_user, problem_user, error_user, performance_glitch_user
- sauce-demo add-to-cart button id pattern: #add-to-cart-sauce-labs-{name}
- sauce-demo remove button id pattern: #remove-sauce-labs-{name}
- manhwa.aldifhr.fun login has no username field, only password field
- manhwa.aldifhr.fun Recent page filters: All Sources, Shinigami, Komiku sources and Manhwa/Manhua/Manga types
- manhwa.aldifhr.fun Recent page has compact view toggle and chapter grouping option
- manhwa.aldifhr.fun Recent page per-chapter actions: Mark read, Exclude, Add to Whitelist
- manhwa.aldifhr.fun Whitelist page has ~130 items with search, status filters, source/type/sort dropdowns, and remove buttons
- manhwa.aldifhr.fun Exclude list has search, source filter, grid of 50+ excluded titles with remove buttons
- manhwa.aldifhr.fun Notifications page has 3-day dispatch timer, tabs: All/Chapters/Log, search, Refresh button, chapter list with cover images
- sauce-demo product image link locator: #item_{id}_img_link
- sauce-demo product title link locator: #item_{id}_title_link
- qabrains.com ecommerce login uses #email, #password, button.btn-submit.uppercase
- qabrains.com ecommerce products page at /ecommerce with 9 products (ids 1-9), has sort dropdown, search/filter
