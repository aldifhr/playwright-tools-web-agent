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
