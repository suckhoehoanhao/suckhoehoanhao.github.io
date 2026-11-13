/* Tạo trang riêng cho từng sản phẩm (SEO) từ mảng PRODUCTS trong index.html
   Chạy: node tools/build-pages.js   -> ghi san-pham/<slug>/index.html + sitemap.xml */
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
const SITE = "https://suckhoehoanhao.github.io/";
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const a = html.indexOf('var Q = "'), b = html.indexOf("var CATS", a);
const ctx = {}; vm.createContext(ctx);
vm.runInContext(html.slice(a, html.indexOf("\n", b)) + "\nthis.P=PRODUCTS;this.C=CATS;", ctx);
const PRODUCTS = ctx.P, CATS = ctx.C;
const cfg = (k) => (html.match(new RegExp(k + ':\\s*"([^"]*)"')) || [])[1] || "";
const PIXEL = cfg("PIXEL_ID"), HOT = cfg("HOTLINE"), HOT_T = cfg("HOTLINE_TEXT"), ZALO = cfg("ZALO"), FB = cfg("FANPAGE"), ADDR = cfg("ADDRESS");

const SLUG = {
  "dau-phong": "dau-phong-hoan-hao-50ml", "dau-phong-100": "dau-phong-hoan-hao-100ml",
  "ruou-tu-vi": "ruou-tu-vi-tue-anh", "thong-kinh-lac-thuy": "thong-kinh-lac-thuy-tue-anh",
  "dap-thao-moc": "dap-thao-moc-tue-anh", "bot-ngam-chan": "bot-ngam-chan-thao-moc-tue-anh",
  "molm-nguyen-ban": "mat-ong-len-men-vi-nguyen-ban", "molm-sam-que": "mat-ong-len-men-sam-que",
  "molm-bo-mau": "mat-ong-len-men-bo-mau", "molm-cat-loi": "mat-ong-len-men-cat-loi",
  "molm-nhau": "mat-ong-len-men-nhau", "ngu-vi-toi-thuong": "ngu-vi-thanh-toi-thuong",
  "ngu-vi-toi-den": "ngu-vi-thanh-toi-den", "cu-cai-muoi": "cu-cai-muoi-lac-mat-ong",
  "toi-den-co-don": "toi-den-co-don", "thanh-xuan-duoc": "thanh-xuan-duoc"
};
/* từ khóa phụ khách hay tìm (lấy từ gợi ý tìm kiếm Google) */
const ALSO = {
  "dau-phong": "dầu phong, dầu xoa bóp thảo mộc, dầu nghệ ngải cứu",
  "dau-phong-100": "dầu phong, dầu xoa bóp thảo mộc, dầu nghệ ngải cứu",
  "ruou-tu-vi": "rượu gừng nha đam, rượu xoa bóp, rượu bôi mọc tóc",
  "thong-kinh-lac-thuy": "thông kinh lạc thuỷ, rượu xoa bóp thảo mộc",
  "dap-thao-moc": "bột đắp thảo mộc Tuệ Ánh, cao đắp thảo mộc",
  "bot-ngam-chan": "bột ngâm chân thảo dược, ngâm chân thảo dược tại nhà",
  "molm-nguyen-ban": "mật ong lên men, mật ong lên men lợi khuẩn",
  "molm-sam-que": "mật ong lên men sâm, mật ong lên men quế",
  "molm-bo-mau": "mật ong lên men huyết dụ, mật ong lên men",
  "molm-cat-loi": "mật ong lên men cát lồi, mật ong lên men",
  "molm-nhau": "mật ong lên men trái nhàu, mật ong lên men",
  "ngu-vi-toi-thuong": "ngũ vị thanh, mật ong ngâm tỏi nghệ, ngũ vị thanh Sức Khỏe Hoàn Hảo",
  "ngu-vi-toi-den": "ngũ vị thanh đen, ngũ vị thanh+, mật ong ngâm tỏi đen, ngũ vị thanh Sức Khỏe Hoàn Hảo",
  "cu-cai-muoi": "củ cải muối mật ong, củ cải muối lên men",
  "toi-den-co-don": "tỏi đen cô đơn, tỏi cô đơn lên men",
  "thanh-xuan-duoc": "đắp mặt thảo mộc, mặt nạ thảo mộc sâm"
};

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (n) => Math.round(n).toLocaleString("vi-VN").replace(/,/g, ".") + "đ";
const k = (n) => Math.round(n / 1000) + "k";
const imgURL = (u, w) => /^https?:/.test(u)
  ? "https://wsrv.nl/?url=" + encodeURIComponent(u.replace(/^https?:\/\//, "")) + "&w=" + w + "&h=" + w + "&fit=contain&cbg=white&bg=white&output=webp&q=76"
  : "../../" + (w <= 400 ? u.replace(/^img\//, "img/s/") : u);
const absImg = (u) => /^https?:/.test(u) ? imgURL(u, 800) : SITE + u;
const full = (p) => p.name + (p.size ? " " + p.size : "");
const row = (p, key) => ((p.info || []).find((r) => r[0] === key) || [])[1] || "";
const uses = (p) => (p.info || []).filter((r) => ["Thành phần", "Cách dùng", "Lưu ý", "Xuất xứ"].indexOf(r[0]) < 0);
const catName = (id) => (CATS.find((c) => c.id === id) || {}).name || "";

function faqs(p) {
  const f = [], n = full(p);
  const u = uses(p).map((r) => (r[0] === "Công dụng" ? "" : r[0] + ": ") + r[1]).join(". ");
  if (u) f.push([n + " có tác dụng gì?", u + ". Sản phẩm hỗ trợ chăm sóc sức khỏe, không phải thuốc; hiệu quả tuỳ cơ địa."]);
  const tiers = (p.tiers || []).map((t) => "từ " + t[0] + " sp: " + fmt(t[1]) + "/sp").join("; ");
  f.push([n + " giá bao nhiêu?", "Giá bán lẻ " + fmt(p.price) + "." + (tiers ? " Giá sỉ theo số lượng: " + tiers + "." : "") + " Phí ship 20.000đ đơn lẻ, 30.000đ đơn sỉ."]);
  if (row(p, "Cách dùng")) f.push(["Cách dùng " + p.name + " như thế nào?", row(p, "Cách dùng") + "."]);
  if (row(p, "Thành phần")) f.push(["Thành phần " + p.name + " gồm những gì?", row(p, "Thành phần") + "."]);
  f.push(["Mua " + p.name + " ở đâu uy tín?", "Đặt trực tiếp từ Sức Khỏe Hoàn Hảo (" + ADDR + ") trên website, gọi hotline " + HOT_T + " hoặc nhắn Zalo. Giao tận nơi 34 tỉnh thành, nhận hàng kiểm tra rồi mới thanh toán."]);
  return f;
}

function page(p) {
  const slug = SLUG[p.id], url = SITE + "san-pham/" + slug + "/", n = full(p);
  const title = n + " – Giá " + k(p.price) + ", công dụng, cách dùng | Sức Khỏe Hoàn Hảo";
  let desc = n + " giá " + fmt(p.price) + ". " + p.desc;
  if (desc.length > 155) desc = desc.slice(0, desc.lastIndexOf(" ", 152)) + "…";
  const gal = [p.img].concat(p.gal || []);
  const F = faqs(p);
  const rel = PRODUCTS.filter((x) => x.id !== p.id && x.cat === p.cat).slice(0, 4);
  const others = PRODUCTS.filter((x) => x.id !== p.id);
  const rows = [["Dung tích / khối lượng", p.size]].concat(p.info || [], [["Bảo quản", p.store]]).filter((r) => r[1]);
  const tierRows = [[1, p.price]].concat(p.tiers || []);
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "Product", "@id": url + "#product", name: n, sku: p.id, url, image: gal.map(absImg), description: p.desc, category: catName(p.cat),
      brand: { "@type": "Brand", name: "Sức Khỏe Hoàn Hảo" },
      offers: { "@type": "Offer", url, price: p.price, priceCurrency: "VND", availability: "https://schema.org/InStock", itemCondition: "https://schema.org/NewCondition", seller: { "@id": SITE + "#store" } } },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Sức Khỏe Hoàn Hảo", item: SITE },
      { "@type": "ListItem", position: 2, name: catName(p.cat), item: SITE + "#shop" },
      { "@type": "ListItem", position: 3, name: n, item: url }] },
    { "@type": "FAQPage", mainEntity: F.map((q) => ({ "@type": "Question", name: q[0], acceptedAnswer: { "@type": "Answer", text: q[1] } })) }
  ] };
  const buy = "../../?sp=" + p.id + "#dat-hang";
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="keywords" content="${esc(p.name + ", " + n + ", " + ALSO[p.id] + ", Sức Khỏe Hoàn Hảo")}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#9b2b7d">
<meta property="og:type" content="product">
<meta property="og:locale" content="vi_VN">
<meta property="og:site_name" content="Sức Khỏe Hoàn Hảo">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(n + " – " + fmt(p.price))}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(absImg(p.img))}">
<meta property="product:price:amount" content="${p.price}">
<meta property="product:price:currency" content="VND">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="../../img/favicon.png">
<link rel="preload" as="font" type="font/woff2" href="../../fonts/quicksand.woff2" crossorigin>
<link rel="preload" as="image" href="${esc(imgURL(p.img, 720))}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
@font-face{font-family:"Quicksand";src:url(../../fonts/quicksand.woff2) format("woff2");font-weight:500 700;font-display:swap}
:root{--p:#9b2b7d;--p-l:#f8eef5;--p-ll:#fcf7fa;--red:#c41a24;--g:#2f7d1a;--ink:#333;--mute:#666;--line:#e7e7e7}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{font-family:"Quicksand",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-weight:500;font-size:16px;line-height:1.6;color:var(--ink);background:#fff;padding-bottom:76px}
a{color:inherit}img{max-width:100%;display:block}
.wrap{max-width:1040px;margin:0 auto;padding:0 16px}
.nav{border-bottom:1px solid var(--line)}.nav .wrap{display:flex;align-items:center;justify-content:space-between;height:64px}
.nav img{height:52px;width:auto}.call{background:#b95500;color:#fff;font-weight:700;font-size:14px;padding:8px 14px;border-radius:999px;text-decoration:none}
.bc{font-size:13px;color:var(--mute);padding:12px 0}.bc a{color:var(--p);text-decoration:none}
.top{display:grid;gap:22px;padding-bottom:26px}
.gal .main{aspect-ratio:1/1;background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden}
.gal .main img{width:100%;height:100%;object-fit:contain}
.thumbs{display:flex;gap:8px;margin-top:10px;overflow-x:auto}
.thumbs button{flex:0 0 64px;height:64px;border:2px solid var(--line);border-radius:10px;background:#fff;padding:0;overflow:hidden;cursor:pointer}
.thumbs button.on{border-color:var(--p)}.thumbs img{width:100%;height:100%;object-fit:contain}
h1{font-size:26px;line-height:1.3;color:var(--p)}
.sz{color:var(--mute);margin-top:2px}.pr{font-size:28px;font-weight:700;color:var(--red);margin:10px 0 4px}
.sx{color:var(--g);font-weight:700;font-size:14px}
.ds{margin:12px 0}
.ticks{list-style:none;margin:12px 0;display:grid;gap:6px;font-size:15px}.ticks li{position:relative;padding-left:26px}
.ticks li::before{content:"✓";position:absolute;left:0;top:0;width:19px;height:19px;border-radius:50%;background:var(--g);color:#fff;font-size:12px;text-align:center;line-height:19px}
.acts{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:50px;padding:0 24px;border-radius:999px;font-weight:700;text-transform:uppercase;text-decoration:none;flex:1 1 160px}
.btn-p{background:var(--p);color:#fff}.btn-o{border:2px solid var(--p);color:var(--p)}
h2{font-size:21px;color:var(--p);margin:26px 0 10px;line-height:1.35}
dl{border:1px solid var(--line);border-radius:12px;overflow:hidden}
dl div{display:grid;grid-template-columns:150px 1fr;border-bottom:1px solid var(--line)}dl div:last-child{border:0}
dt{background:var(--p-ll);padding:10px 12px;font-weight:700;color:var(--p);font-size:14px}dd{padding:10px 12px}
table{width:100%;border-collapse:collapse;font-size:15px}th,td{border:1px solid var(--line);padding:8px 10px;text-align:left}th{background:var(--p-ll)}td:last-child{color:var(--red);font-weight:700}
.qa{border:1px solid var(--line);border-radius:12px;padding:0 14px;margin-bottom:10px}
.qa summary{cursor:pointer;padding:12px 0;list-style:none}.qa summary::-webkit-details-marker{display:none}
.qa h3{display:inline;font-size:16px}.qa p{padding:0 0 12px;color:var(--mute)}
.rel{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.rel a{border:1px solid var(--line);border-radius:12px;padding:10px;text-decoration:none;display:block}
.rel img{aspect-ratio:1/1;object-fit:contain;width:100%;background:#fff}
.rel b{display:block;font-size:14px;margin-top:6px;line-height:1.35}.rel span{color:var(--red);font-weight:700;font-size:14px}
.all{columns:2;column-gap:20px;font-size:14px;list-style:none}.all li{margin-bottom:6px}.all a{color:var(--p)}
.disc{font-size:13px;color:var(--mute);margin:22px 0;padding:12px;background:var(--p-ll);border-radius:10px}
footer{background:#3a1030;color:#f1e6ee;padding:24px 0;font-size:14px}footer a{color:#fff}
.bar{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid var(--line);padding:9px 12px calc(9px + env(safe-area-inset-bottom));display:flex;gap:10px;z-index:9}
.bar .btn{min-height:48px;flex:1}
@media(min-width:760px){.top{grid-template-columns:1fr 1fr;align-items:start}h1{font-size:30px}.rel{grid-template-columns:repeat(4,1fr)}.all{columns:3}body{padding-bottom:0}.bar{display:none}}
</style>
${PIXEL ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL}');fbq('track','PageView');fbq('track','ViewContent',{content_ids:['${p.id}'],content_type:'product',value:${p.price},currency:'VND'});</script>` : ""}
</head>
<body>
<header class="nav"><div class="wrap"><a href="../../" aria-label="Sức Khỏe Hoàn Hảo – trang chủ"><img src="../../img/logo.webp" alt="Sức Khỏe Hoàn Hảo" width="145" height="120"></a><a class="call" href="tel:${HOT}">📞 ${esc(HOT_T)}</a></div></header>
<main class="wrap">
<nav class="bc" aria-label="Breadcrumb"><a href="../../">Trang chủ</a> › <a href="../../#shop">${esc(catName(p.cat))}</a> › ${esc(n)}</nav>
<div class="top">
  <div class="gal">
    <div class="main"><img id="mi" src="${esc(imgURL(p.img, 720))}" alt="${esc(n)} – Sức Khỏe Hoàn Hảo" width="720" height="720" fetchpriority="high"></div>
    ${gal.length > 1 ? `<div class="thumbs">${gal.map((g, i) => `<button type="button" data-src="${esc(imgURL(g, 720))}"${i ? "" : ' class="on"'} aria-label="Ảnh ${i + 1}"><img src="${esc(imgURL(g, 140))}" alt="${esc(n)} ảnh ${i + 1}" width="64" height="64" loading="lazy"></button>`).join("")}</div>` : ""}
  </div>
  <div>
    <h1>${esc(n)}</h1>
    ${p.size ? `<div class="sz">Dung tích / khối lượng: ${esc(p.size)}</div>` : ""}
    <div class="pr">${fmt(p.price)}</div>
    ${p.tiers && p.tiers.length ? `<div class="sx">Giá sỉ từ ${p.tiers[0][0]} sp: ${fmt(p.tiers[0][1])}/sp</div>` : ""}
    <p class="ds">${esc(p.desc)}</p>
    <ul class="ticks"><li>Giao tận nơi 34 tỉnh thành – ship ${k(20000)} đơn lẻ, ${k(30000)} đơn sỉ</li><li>Nhận hàng, kiểm tra rồi mới thanh toán (COD) hoặc chuyển khoản QR</li><li>Nhân viên gọi xác nhận và tư vấn cách dùng</li></ul>
    <div class="acts"><a class="btn btn-p" href="${buy}">Đặt mua ngay</a><a class="btn btn-o" href="${esc(ZALO)}" target="_blank" rel="noopener">Tư vấn Zalo</a></div>
  </div>
</div>

<h2>Thông tin ${esc(n)}</h2>
<dl>${rows.map((r) => `<div><dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd></div>`).join("")}</dl>

${tierRows.length > 1 ? `<h2>Bảng giá ${esc(p.name)} theo số lượng</h2>
<table><tr><th>Số lượng</th><th>Giá / sản phẩm</th></tr>${tierRows.map((r, i) => { const to = tierRows[i + 1] ? tierRows[i + 1][0] - 1 : null; return `<tr><td>${i === 0 ? (to ? "1 – " + to + " sp" : "1 sp") : (to ? r[0] + " – " + to + " sp" : "Từ " + r[0] + " sp")}</td><td>${fmt(r[1])}</td></tr>`; }).join("")}</table>
<p style="font-size:14px;color:var(--mute);margin-top:8px">Giá sỉ tự áp dụng khi đặt đủ số lượng của từng sản phẩm.</p>` : ""}

<h2>Câu hỏi thường gặp về ${esc(p.name)}</h2>
${F.map((q) => `<details class="qa"><summary><h3>${esc(q[0])}</h3></summary><p>${esc(q[1])}</p></details>`).join("")}

${rel.length ? `<h2>Sản phẩm cùng loại</h2>
<div class="rel">${rel.map((x) => `<a href="../${SLUG[x.id]}/"><img src="${esc(imgURL(x.img, 300))}" alt="${esc(full(x))}" width="300" height="300" loading="lazy"><b>${esc(full(x))}</b><span>${fmt(x.price)}</span></a>`).join("")}</div>` : ""}

<h2>Tất cả sản phẩm Sức Khỏe Hoàn Hảo</h2>
<ul class="all">${others.map((x) => `<li><a href="../${SLUG[x.id]}/">${esc(full(x))}</a></li>`).join("")}</ul>

<p class="disc">Sản phẩm không phải là thuốc và không có tác dụng thay thế thuốc chữa bệnh. Hiệu quả có thể khác nhau tuỳ cơ địa. Đọc kỹ hướng dẫn sử dụng trên nhãn trước khi dùng.</p>
</main>
<footer><div class="wrap">
<p><b>Hộ Kinh Doanh Sức Khỏe Hoàn Hảo</b></p>
<p>📍 ${esc(ADDR)}</p>
<p>📞 Hotline: <a href="tel:${HOT}">${esc(HOT_T)}</a> · 💬 <a href="${esc(ZALO)}" target="_blank" rel="noopener">Zalo</a> · 👍 <a href="${esc(FB)}" target="_blank" rel="noopener">Fanpage Sức Khỏe Hoàn Hảo</a></p>
<p style="margin-top:8px"><a href="../../">← Xem tất cả sản phẩm, đặt hàng online</a></p>
</div></footer>
<div class="bar"><a class="btn btn-o" href="tel:${HOT}">Gọi ngay</a><a class="btn btn-p" href="${buy}">Đặt mua</a></div>
<script>(function(){var t=document.querySelector(".thumbs");if(!t)return;var m=document.getElementById("mi");t.addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;m.src=b.dataset.src;[].forEach.call(t.children,function(x){x.classList.toggle("on",x===b)})})})();</script>
</body>
</html>
`;
}

const today = new Date().toISOString().slice(0, 10);
const urls = [{ loc: SITE, img: PRODUCTS.filter((p) => !/^https?:/.test(p.img)).map((p) => SITE + p.img), pri: "1.0" }];
fs.rmSync(path.join(ROOT, "san-pham"), { recursive: true, force: true });
PRODUCTS.forEach((p) => {
  if (!SLUG[p.id]) throw new Error("Thiếu slug cho " + p.id);
  const dir = path.join(ROOT, "san-pham", SLUG[p.id]);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), page(p));
  urls.push({ loc: SITE + "san-pham/" + SLUG[p.id] + "/", img: [p.img].concat(p.gal || []).map(absImg), pri: "0.8" });
});
fs.writeFileSync(path.join(ROOT, "sitemap.xml"),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
  urls.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${u.pri}</priority>\n${u.img.map((i) => `    <image:image><image:loc>${esc(i)}</image:loc></image:image>`).join("\n")}\n  </url>`).join("\n") +
  "\n</urlset>\n");

console.log("Đã tạo", PRODUCTS.length, "trang sản phẩm + sitemap.xml");

/* cập nhật liên kết nội bộ trên trang chủ */
let home = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const links = "<ul>" + PRODUCTS.map((p) => `<li><a href="san-pham/${SLUG[p.id]}/">${esc(full(p))}</a></li>`).join("") + "</ul>";
home = home.replace(/<!--SP-LINKS-->[\s\S]*?<!--\/SP-LINKS-->/, "<!--SP-LINKS-->" + links + "<!--/SP-LINKS-->")
           .replace(/\/\*SLUGS\*\/[\s\S]*?\/\*\/SLUGS\*\//, "/*SLUGS*/window.SLUGS=" + JSON.stringify(SLUG) + ";/*/SLUGS*/");
fs.writeFileSync(path.join(ROOT, "index.html"), home);
console.log("Đã cập nhật liên kết sản phẩm trên trang chủ");
