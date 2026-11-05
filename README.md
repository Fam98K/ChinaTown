# China Town shop

Files
- index.html   the shop
- admin.html   the shop manager (add products, change prices and stock, edit settings)
- styles.css   styling
- app.js       shop behaviour
- admin.js     manager behaviour
- data.js      your products and settings (the manager writes this file)
- glyphs.js    the built-in product pictures
- images/      product photos (created by the manager when you add a photo)

## Update an existing GitHub site
Upload ALL the files from this folder to your repository (Add file, Upload files) and commit.
Keep `data.js` from the new folder only if you have not added products on your own since.

## Everyday use: the manager
1. Open https://YOUR-NAME.github.io/YOUR-REPO/admin.html
2. Add a product, change a price or stock number, hide a product, or edit the shop settings.
3. Press "Publish to site". The shop updates in 1 to 2 minutes.

## One-time setup: let the manager publish for you
Make a GitHub access token once:
1. On GitHub: profile menu, Settings, Developer settings, Personal access tokens, Fine-grained tokens, Generate new token.
2. Name it China Town. Repository access: "Only select repositories", pick your shop repository.
3. Repository permissions: set Contents to "Read and write". Generate the token and copy it.
4. On admin.html paste the token, check the user name and repository name, and press Connect.

The token stays in that browser only. Use it on your own computer, not a shared one. The admin page
cannot change anything without the token, so it is safe that the page itself is public.
To stop it being found, rename admin.html to something only you know (and open that name instead).

Without a token you can still edit, then press "Download data.js" and upload that file (and any
photos into an images folder) to GitHub yourself.

## Settings worth filling in
- WhatsApp number (digits with country code, for example 8801700000000). Orders are sent here.
- Delivery fee and the free-delivery amount.
- Contact line and the delivery and payment notes shown on the shop.

## How orders work
This is a static site, so orders are not stored anywhere. When a customer presses Place order they
see their order with "Send on WhatsApp" and "Copy order details". You get the order as a WhatsApp
message. Stock numbers do not go down by themselves; update them in the manager.

## Editing by hand (optional)
data.js is plain text. Each product has: name, cat, price, was (old price, 0 for none), stock, tag,
desc, specs [{k, v}], options [{n, v: [choices]}], glyph, hue, img, active, ts.
Colours and fonts are at the top of styles.css. Headline wording is in app.js (search "Everything for the table").
