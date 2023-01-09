const { Client, LocalAuth, base64ToPNG } = require("./index");

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process", // <- this one doesn't works in Windows
      "--disable-gpu",
    ],
  },
});

client.on("qr", (qr) => {
  // Generate and scan this code with your phone
  console.log("QR RECEIVED", qr);
  base64ToPNG(qr);
});

client.initialize();

client.order(
  "https://shopee.co.id/Strap-MiBand-3-4-5-6-Strap-Silicone-Tali-Pengganti-Xiaomi-Mi-Band-3-4-5-6-Warna-Polos-i.346000752.13217782061"
);
