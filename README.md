# China Town shop (standalone copy)

Files
- index.html  the page
- styles.css  all styling
- app.js      all behaviour, plus the product list

Run it
Double-click index.html. No server or install is needed. The fonts load from Google Fonts
when you are online and fall back to system fonts when you are not.

What works in this copy
- Browse, search, sort and filter products; product pages with specifications and options
- Cart, wish list and checkout (saved in your browser)
- Light and dark theme

What does not work in this copy
- There is no order database here. Pressing "Place order" shows the order details with
  "Send on WhatsApp" and "Copy order details" buttons, and the cart is kept.
- There is no admin mode. Change products by editing the FALLBACK object near the middle of app.js.

Edit your products and settings (app.js, search for FALLBACK)
- "products": one entry per product. Fields: name, cat, price, was (old price, 0 for none), stock,
  tag, desc, specs [{k, v}], options [{n, v: [choices]}], glyph, hue, img, active, ts.
- "settings": name, cur (currency symbol), ship (delivery fee), free (free delivery from),
  banner, contact, wa (WhatsApp number as digits with country code, for example 8801700000000),
  note, pay.
- Set "active": false to hide a product. Larger "ts" numbers appear first under "Newest first".
- Pictures: glyph is one of tin, leaf, cup, pot, wok, steamer, lantern, bowl, knife, jar,
  sticks, tiles, brush, spice, gift. To use a photo instead, put the file next to index.html and
  change one line in app.js: in function art(), replace '/_blob/'+esc(p.img) with esc(p.img) and
  set "img" to the file name, for example "wok.jpg".

Putting it on the internet
Upload the three files to any static host (GitHub Pages, Netlify, Cloudflare Pages, or your own
web space). Orders still go by WhatsApp or copy until you connect a real order system.
